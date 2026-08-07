import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { resolveFieldGroups } from '@nexus/shared';
import type { RequestContext } from '../../infra/cls/request-context';
import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_AUTHENTICATED_KEY } from '../decorators/allow-authenticated.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionResolverService } from '../../modules/auth/permission-resolver.service';
import type { AuthUser } from '../decorators/current-user.decorator';
import type { Request } from 'express';

/**
 * [CORE] PermissionGuard — spec §4.4, §4.2.
 * Đọc @RequirePermission, tra tập quyền (Redis cache perm:<tenantId>:<userId>),
 * đồng thời nạp serializer groups vào CLS cho SerializeInterceptor (§4.4c).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolverService,
    private readonly cls: ClsService<RequestContext & { permissionSet?: string[] }>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new AppException('AUTH.UNAUTHENTICATED');

    const permissions = await this.resolver.getPermissionSet(user.tenantId, user.sub);
    // Serializer groups cho field-level (§4.4c) — SerializeInterceptor đọc từ CLS
    this.cls.set('permissionSet', [...permissions]);

    // Nhóm "chỉ cần đăng nhập" (ma trận §2.1): /me, logout, preferences
    const allowAuthenticated = this.reflector.getAllAndOverride<boolean>(
      ALLOW_AUTHENTICATED_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (allowAuthenticated) return true;

    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // Endpoint thiếu @RequirePermission: CI check #5 chặn từ trước khi tới đây;
    // runtime fail-closed cho chắc
    if (!required) throw new AppException('AUTH.FORBIDDEN');

    if (!permissions.has(required)) throw new AppException('AUTH.FORBIDDEN');
    return true;
  }
}

/** Helper cho SerializeInterceptor: groups đang mở của request hiện tại */
export function currentFieldGroups(
  cls: ClsService<RequestContext & { permissionSet?: string[] }>,
): string[] {
  const set = new Set(cls.get('permissionSet') ?? []);
  return resolveFieldGroups(set);
}
