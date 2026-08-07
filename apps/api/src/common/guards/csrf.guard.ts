import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
export const REFRESH_COOKIE = 'refresh_token';
import { ACCESS_TOKEN_COOKIE } from './composite-auth.guard';

/**
 * [CORE] CSRF double-submit — spec §4.3b, quyết định #53.
 *
 * CHỈ áp cho client dùng cookie (mobile Bearer không dùng cookie → miễn).
 * Áp cho MỌI method thay đổi dữ liệu, kể cả @Public có cookie (refresh!).
 *
 * Thứ tự kiểm tra CHỐT CỨNG, fail ở đâu → 403 AUTH.CSRF_FAILED:
 *   1. Cookie csrf_token tồn tại
 *   2. Header X-CSRF-Token tồn tại
 *   3. Hai giá trị khớp — so sánh CONSTANT-TIME
 *   4. Origin (hoặc Referer nếu thiếu) thuộc allowlist
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: string[];

  constructor(config: ConfigService) {
    this.allowedOrigins = config
      .getOrThrow<string>('ALLOWED_ORIGINS')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''));
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

    // Chỉ enforced khi request mang cookie auth (web). Login lần đầu chưa có → miễn.
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const usesCookieAuth = Boolean(cookies[ACCESS_TOKEN_COOKIE] || cookies[REFRESH_COOKIE]);
    if (!usesCookieAuth) return true;

    const cookieToken = cookies[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!cookieToken || !headerToken) throw new AppException('AUTH.CSRF_FAILED');

    const a = Buffer.from(cookieToken);
    const b = Buffer.from(headerToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppException('AUTH.CSRF_FAILED');
    }

    const origin = (req.headers.origin ?? req.headers.referer) as string | undefined;
    if (!origin) throw new AppException('AUTH.CSRF_FAILED');
    const normalized = (() => {
      try {
        return new URL(origin).origin;
      } catch {
        return '';
      }
    })();
    if (!this.allowedOrigins.includes(normalized)) {
      throw new AppException('AUTH.CSRF_FAILED');
    }
    return true;
  }
}
