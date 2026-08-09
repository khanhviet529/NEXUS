import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * [CORE] Kiểm phụ thuộc cho /health (§9).
 *
 * Ở repository chứ không ở controller vì luật §4.9: PrismaService chỉ dùng
 * trong *.repository.ts (ESLint chặn). Đây là truy vấn CHỈ ĐỌC, không tenant
 * — dùng $queryRaw để không đụng extension.
 */
@Injectable()
export class HealthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<{ db: boolean; redis: boolean }> {
    const [db, redis] = await Promise.all([
      this.prisma.client
        .$queryRaw(Prisma.sql`SELECT 1`)
        .then(() => true)
        .catch(() => false),
      this.redis.client
        .ping()
        .then(() => true)
        .catch(() => false),
    ]);
    return { db, redis };
  }
}
