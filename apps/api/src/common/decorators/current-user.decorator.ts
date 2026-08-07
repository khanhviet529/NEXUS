import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Payload access token đã verify — spec §4.3 (chốt cứng, không nhúng permission) */
export interface AuthUser {
  /** userId */
  sub: string;
  tenantId: string;
  membershipId: string;
  sessionId: string;
  orgUnitId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
