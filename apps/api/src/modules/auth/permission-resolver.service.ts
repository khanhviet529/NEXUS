import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { AuthRepository } from './auth.repository';

const CACHE_TTL_SECONDS = 300;

/**
 * [CORE] Resolve tập quyền — spec §4.3.
 *
 * Cache Redis khoá theo (tenantId, userId): perm:<tenantId>:<userId>.
 * KHÔNG BAO GIỜ perm:<userId> — rò rỉ quyền chéo tenant.
 *
 * Invalidate khi roles / role_permissions / user_roles / tenant_memberships /
 * org_units đổi (GĐ3 gọi invalidate; TTL 5 phút là lưới đỡ).
 */
@Injectable()
export class PermissionResolverService {
  constructor(
    private readonly redis: RedisService,
    private readonly repo: AuthRepository,
  ) {}

  private key(tenantId: string, userId: string): string {
    return this.redis.tenantKey('perm', tenantId, userId);
  }

  async getPermissionSet(tenantId: string, userId: string): Promise<Set<string>> {
    const key = this.key(tenantId, userId);
    try {
      const cached = await this.redis.client.get(key);
      if (cached !== null) return new Set(JSON.parse(cached) as string[]);
    } catch {
      // Redis hỏng → đi thẳng DB, không chặn request
    }

    const codes = await this.repo.findPermissionCodes(tenantId, userId);
    try {
      await this.redis.client.set(key, JSON.stringify(codes), 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* cache best-effort */
    }
    return new Set(codes);
  }

  /** Gọi khi đổi role/membership/org_unit — quyền đổi NGAY, không chờ TTL (test #9) */
  async invalidate(tenantId: string, userId?: string): Promise<void> {
    if (userId) {
      await this.redis.client.del(this.key(tenantId, userId));
      return;
    }
    // Đổi cây org_units → invalidate toàn tenant (scope descendants phụ thuộc path)
    const keys = await this.redis.client.keys(this.redis.tenantKey('perm', tenantId, '*'));
    if (keys.length > 0) await this.redis.client.del(...keys);
  }
}
