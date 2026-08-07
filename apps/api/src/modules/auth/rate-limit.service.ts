import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { AppException } from '../../common/errors/app.exception';

/**
 * [CORE] Chống dò mật khẩu — spec §4.3:
 *   - 5 lần / 15 phút theo (IP + email) → 429
 *   - 10 lần sai liên tiếp theo email → khoá 30 phút → 401 ACCOUNT_LOCKED
 * Forgot password: rate limit theo IP VÀ email riêng biệt (§4.3c).
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  private async hit(key: string, windowSeconds: number): Promise<number> {
    const n = await this.redis.client.incr(key);
    if (n === 1) await this.redis.client.expire(key, windowSeconds);
    return n;
  }

  /** Gọi TRƯỚC khi xử lý login — đếm THẤT BẠI, không phạt đăng nhập hợp lệ */
  async checkLogin(ip: string, email: string): Promise<void> {
    if (await this.redis.client.exists(`lock:user:${email}`)) {
      throw new AppException('AUTH.ACCOUNT_LOCKED');
    }
    const fails = Number(await this.redis.client.get(`rl:login:${ip}:${email}`)) || 0;
    if (fails >= 5) throw new AppException('COMMON.RATE_LIMITED');
  }

  /** Gọi khi login THẤT BẠI — 5 sai/15ph theo IP+email → 429; 10 sai → khoá 30ph */
  async recordLoginFailure(ip: string, email: string): Promise<void> {
    await this.hit(`rl:login:${ip}:${email}`, 15 * 60);
    const n = await this.hit(`rl:fail:${email}`, 30 * 60);
    if (n >= 10) {
      await this.redis.client.set(`lock:user:${email}`, '1', 'EX', 30 * 60);
    }
  }

  async recordLoginSuccess(ip: string, email: string): Promise<void> {
    await this.redis.client.del(`rl:fail:${email}`, `rl:login:${ip}:${email}`);
  }

  async checkForgotPassword(ip: string, email: string): Promise<void> {
    const [byIp, byEmail] = await Promise.all([
      this.hit(`rl:forgot:ip:${ip}`, 15 * 60),
      this.hit(`rl:forgot:email:${email}`, 15 * 60),
    ]);
    if (byIp > 10 || byEmail > 3) throw new AppException('COMMON.RATE_LIMITED');
  }
}
