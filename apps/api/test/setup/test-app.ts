import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
  close(): Promise<void>;
}

let seedCache: SeedResult | undefined;

/** Boot app giống main.ts (prefix, pipe, cookie) + seed 2 tenant MỘT lần */
export async function createTestApp(): Promise<TestHarness> {
  const rawPrisma = new PrismaClient();
  if (!seedCache) seedCache = await runSeed(rawPrisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app); // giống hệt main.ts — gồm query parser extended (§3.5)
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
    close: async () => {
      await app.close();
      await rawPrisma.$disconnect();
    },
  };
}
