import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import type { RequestContext } from '../../infra/cls/request-context';
import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * [CORE] CompositeAuthGuard — spec §4.3b, quyết định #15.
 *
 * - Web: httpOnly cookie. Mobile/đối tác: Authorization Bearer.
 * - Một request chỉ được dùng MỘT cơ chế. Có cả hai → 400 AUTH.DUAL_TRANSPORT.
 * - tenantId lấy TỪ TOKEN, không nơi nào khác (§3.1b) — set vào CLS tại đây.
 */
@Injectable()
export class CompositeAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    const bearer = extractBearer(req);
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      ACCESS_TOKEN_COOKIE
    ];

    if (bearer && cookieToken) throw new AppException('AUTH.DUAL_TRANSPORT');
    const token = bearer ?? cookieToken;
    if (!token) throw new AppException('AUTH.UNAUTHENTICATED');

    let payload: AuthUser & { exp: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch (e) {
      throw new AppException(
        e instanceof Error && e.name === 'TokenExpiredError'
          ? 'AUTH.TOKEN_EXPIRED'
          : 'AUTH.UNAUTHENTICATED',
      );
    }

    req.user = payload;
    // Nguồn tenant DUY NHẤT: token (§3.1b). Server bỏ qua mọi header về tenant.
    this.cls.set('tenantId', payload.tenantId);
    this.cls.set('userId', payload.sub);
    this.cls.set('membershipId', payload.membershipId);
    this.cls.set('sessionId', payload.sessionId);
    this.cls.set('orgUnitId', payload.orgUnitId);
    this.cls.set('actorId', payload.sub);
    return true;
  }
}

function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
