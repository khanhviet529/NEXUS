import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * [CORE] Refresh token family — spec §4.3d, quyết định #49.
 *
 * Token dạng `<familyId>.<secret>`; Redis chỉ lưu HASH:
 *   refresh:<familyId>           hash { currentHash, userId, tenantId,
 *                                       membershipId, sessionId, rotatedAt }
 *   refresh:<familyId>:consumed  set các hash ĐÃ DÙNG — sống tới khi family
 *                                hết hạn. Xoá sớm là mất khả năng phát hiện.
 *
 * | Token khớp currentHash            → xoay: đẩy hash cũ vào consumed
 * | Token khớp phần tử trong consumed → BỊ ĐÁNH CẮP → huỷ cả family (caller
 * |                                     huỷ thêm mọi session user + audit + mail)
 * | Không khớp gì                     → 401, không huỷ (token quá cũ/rác)
 */

export interface RefreshFamily {
  familyId: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  sessionId: string;
}

export type RotateResult =
  | { status: 'rotated'; token: string; family: RefreshFamily }
  | { status: 'reuse-detected'; family: RefreshFamily }
  | { status: 'invalid' };

const key = (familyId: string) => `refresh:${familyId}`;
const consumedKey = (familyId: string) => `refresh:${familyId}:consumed`;

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(private readonly redis: RedisService) {}

  private ttlSeconds(): number {
    return (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 86_400;
  }

  /** Login/switch-tenant: tạo family mới, trả token gốc (chỉ tồn tại ở client) */
  async createFamily(meta: Omit<RefreshFamily, 'familyId'>): Promise<string> {
    const familyId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const ttl = this.ttlSeconds();
    await this.redis.client
      .multi()
      .hset(key(familyId), {
        currentHash: hashSecret(secret),
        userId: meta.userId,
        tenantId: meta.tenantId,
        membershipId: meta.membershipId,
        sessionId: meta.sessionId,
        rotatedAt: new Date().toISOString(),
      })
      .expire(key(familyId), ttl)
      .exec();
    return `${familyId}.${secret}`;
  }

  /** Refresh: xoay vòng — MỖI LẦN DÙNG đổi secret (§4.3) */
  async rotate(token: string): Promise<RotateResult> {
    const parsed = this.parse(token);
    if (!parsed) return { status: 'invalid' };
    const { familyId, secret } = parsed;

    const data = await this.redis.client.hgetall(key(familyId));
    if (!data || !data['currentHash']) return { status: 'invalid' };

    const family: RefreshFamily = {
      familyId,
      userId: data['userId'] ?? '',
      tenantId: data['tenantId'] ?? '',
      membershipId: data['membershipId'] ?? '',
      sessionId: data['sessionId'] ?? '',
    };
    const incoming = hashSecret(secret);

    if (incoming === data['currentHash']) {
      // Hợp lệ → xoay
      const newSecret = randomBytes(32).toString('base64url');
      const ttl = this.ttlSeconds();
      await this.redis.client
        .multi()
        .sadd(consumedKey(familyId), incoming)
        .expire(consumedKey(familyId), ttl) // consumed sống ÍT NHẤT bằng family
        .hset(key(familyId), {
          currentHash: hashSecret(newSecret),
          rotatedAt: new Date().toISOString(),
        })
        .expire(key(familyId), ttl)
        .exec();
      return { status: 'rotated', token: `${familyId}.${newSecret}`, family };
    }

    const wasConsumed = await this.redis.client.sismember(consumedKey(familyId), incoming);
    if (wasConsumed === 1) {
      // DẤU HIỆU BỊ ĐÁNH CẮP — huỷ cả family ngay tại đây, caller huỷ session
      await this.destroyFamily(familyId);
      return { status: 'reuse-detected', family };
    }

    return { status: 'invalid' };
  }

  async destroyFamily(familyId: string): Promise<void> {
    await this.redis.client.del(key(familyId), consumedKey(familyId));
  }

  private parse(token: string): { familyId: string; secret: string } | null {
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return null;
    return { familyId: token.slice(0, dot), secret: token.slice(dot + 1) };
  }
}
