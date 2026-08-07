import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { AuthRepository } from './auth.repository';

const CACHE_TTL_SECONDS = 300;

export type Scope = 'own' | 'department' | 'descendants' | 'all';
const SCOPE_RANK: Record<Scope, number> = { own: 0, department: 1, descendants: 2, all: 3 };

export interface ResolvedPermissions {
  /** code → scope MẠNH NHẤT trong các role của user (own < department < descendants < all) */
  scopes: Map<string, Scope>;
}

/**
 * [CORE] Resolve tập quyền + scope — spec §4.3, §4.4.
 *
 * Cache Redis khoá theo (tenantId, userId): perm:<tenantId>:<userId>.
 * KHÔNG BAO GIỜ perm:<userId> — rò rỉ quyền chéo tenant.
 *
 * Invalidate khi roles / role_permissions / user_roles / tenant_memberships /
 * org_units đổi — quyền đổi NGAY, không chờ TTL (test #9).
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

  async resolve(tenantId: string, userId: string): Promise<ResolvedPermissions> {
    const key = this.key(tenantId, userId);
    try {
      const cached = await this.redis.client.get(key);
      if (cached !== null) {
        return { scopes: new Map(JSON.parse(cached) as [string, Scope][]) };
      }
    } catch {
      // Redis hỏng → đi thẳng DB, không chặn request
    }

    const rows = await this.repo.findPermissionScopes(tenantId, userId);
    const scopes = new Map<string, Scope>();
    for (const { code, scope } of rows) {
      const s = scope as Scope;
      const current = scopes.get(code);
      if (!current || SCOPE_RANK[s] > SCOPE_RANK[current]) scopes.set(code, s);
    }
    try {
      await this.redis.client.set(
        key,
        JSON.stringify([...scopes.entries()]),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch {
      /* cache best-effort */
    }
    return { scopes };
  }

  async getPermissionSet(tenantId: string, userId: string): Promise<Set<string>> {
    return new Set((await this.resolve(tenantId, userId)).scopes.keys());
  }

  /** Gọi khi đổi role/membership — quyền đổi NGAY (test #9) */
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
