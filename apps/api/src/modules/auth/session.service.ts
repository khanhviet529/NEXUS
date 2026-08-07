import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { AuthRepository } from './auth.repository';
import { TokenService } from './token.service';

/**
 * [CORE] Session hai nơi, hai vai trò — spec §4.3d, quyết định #48.
 *
 *   Redis  sess:<sessionId>  → NGUỒN SỰ THẬT RUNTIME ("phiên còn hiệu lực?")
 *   DB     sessions          → metadata lâu dài (thiết bị, IP, revoked_at)
 *
 * Thu hồi ĐÚNG THỨ TỰ: 1) UPDATE DB revoked_at (ghi bền trước)
 *                      2) DEL Redis (hiệu lực ngay)
 * Làm ngược → có cửa sổ phiên đã chết ở Redis nhưng DB hiện "đang hoạt động".
 */

const sessKey = (sessionId: string) => `sess:${sessionId}`;

export interface SessionRuntime {
  userId: string;
  tenantId: string;
  membershipId: string;
  familyId: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
  ) {}

  private ttlSeconds(): number {
    return (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 86_400;
  }

  /** Tạo phiên: DB row (metadata) + Redis (runtime) + refresh family. Trả refresh token gốc */
  async create(input: {
    userId: string;
    tenantId: string;
    membershipId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ sessionId: string; refreshToken: string }> {
    const ttl = this.ttlSeconds();
    const session = await this.repo.createSession({
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });
    const refreshToken = await this.tokens.createFamily({
      userId: input.userId,
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      sessionId: session.id,
    });
    const familyId = refreshToken.split('.')[0] ?? '';
    await this.redis.client
      .multi()
      .hset(sessKey(session.id), {
        userId: input.userId,
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        familyId,
      })
      .expire(sessKey(session.id), ttl)
      .exec();
    return { sessionId: session.id, refreshToken };
  }

  /** Đường kiểm tra NÓNG — guard gọi mỗi request. Redis là nguồn sự thật */
  async isAlive(sessionId: string): Promise<boolean> {
    return (await this.redis.client.exists(sessKey(sessionId))) === 1;
  }

  async getRuntime(sessionId: string): Promise<SessionRuntime | null> {
    const d = await this.redis.client.hgetall(sessKey(sessionId));
    if (!d || !d['userId']) return null;
    return {
      userId: d['userId'],
      tenantId: d['tenantId'] ?? '',
      membershipId: d['membershipId'] ?? '',
      familyId: d['familyId'] ?? '',
    };
  }

  /** Thu hồi MỘT phiên — DB trước, Redis sau (§4.3d) */
  async revoke(sessionId: string, tenantId: string): Promise<void> {
    const runtime = await this.getRuntime(sessionId);
    await this.repo.revokeSession(sessionId, tenantId); // 1. ghi bền
    await this.redis.client.del(sessKey(sessionId)); // 2. hiệu lực ngay
    if (runtime?.familyId) await this.tokens.destroyFamily(runtime.familyId);
  }

  /**
   * Thu hồi TOÀN BỘ phiên của user trên MỌI tenant — dùng khi: phát hiện
   * refresh token bị dùng lại (§4.3), đổi/reset mật khẩu (§4.3c),
   * đổi org_unit của membership (§4.3), nghỉ việc.
   */
  async revokeAllOfUser(userId: string): Promise<number> {
    const sessions = await this.repo.findActiveSessionsOfUser(userId);
    for (const s of sessions) {
      await this.repo.revokeSession(s.id, s.tenantId);
      const runtime = await this.getRuntime(s.id);
      await this.redis.client.del(sessKey(s.id));
      if (runtime?.familyId) await this.tokens.destroyFamily(runtime.familyId);
    }
    return sessions.length;
  }
}
