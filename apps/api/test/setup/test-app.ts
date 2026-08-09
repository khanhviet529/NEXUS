import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { RequestContextService } from '../../src/infra/cls/request-context';
import { runSeed, type SeedResult } from '../../prisma/seed';

export interface TestHarness {
  app: INestApplication;
  prisma: PrismaService;
  ctx: RequestContextService;
  seed: SeedResult;
  /** Client Prisma TRẦN — chỉ cho test #3b/#2 (chứng minh DB tự chặn) */
  rawPrisma: PrismaClient;
  login(email: string, tenantId?: string): Promise<string>;
  /** Access token HỢP LỆ VỀ CHỮ KÝ nhưng đã hết hạn — U2 cần phân biệt
   *  "hết hạn" với "chưa đăng nhập" (test-catalog §2.2). */
  expiredToken(email: string, tenantId?: string): Promise<string>;
  close(): Promise<void>;
}

let seedCache: SeedResult | undefined;

/** Boot app giống main.ts (prefix, pipe, cookie) + seed 2 tenant MỘT lần */
export async function createTestApp(): Promise<TestHarness> {
  const rawPrisma = new PrismaClient();
  if (!seedCache) seedCache = await runSeed(rawPrisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app); // giống hệt main.ts — query parser extended + json 20mb
  await app.init();

  const login = async (email: string, tenantId?: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: seedCache!.password, tenantId });
    if (res.status !== 201 || !res.body.accessToken) {
      throw new Error(`login ${email} thất bại: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.accessToken as string;
  };

  return {
    app,
    prisma: app.get(PrismaService),
    ctx: app.get(RequestContextService),
    seed: seedCache,
    rawPrisma,
    login,
    expiredToken: async (email: string, tenantId?: string): Promise<string> => {
      // Ký lại payload THẬT với exp trong quá khứ: token giả kiểu 'abc' chỉ
      // cho ra INVALID_TOKEN, không phải TOKEN_EXPIRED — hai nhánh khác nhau.
      const jwt = app.get(JwtService);
      const config = app.get(ConfigService);
      const valid = await login(email, tenantId);
      const payload = jwt.decode(valid) as Record<string, unknown>;
      delete payload.exp;
      delete payload.iat;
      return jwt.sign(payload, {
        secret: config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '-1s',
      });
    },
    close: async () => {
      await app.close();
      await rawPrisma.$disconnect();
    },
  };
}
