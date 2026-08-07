import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthRepository } from './auth.repository';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // §4.3: 15 phút

export interface LoginResult {
  /** null khi user có nhiều membership và chưa chọn tenant */
  accessToken: string | null;
  expiresIn: number;
  memberships: Array<{ tenantId: string; tenantCode: string; tenantName: string }>;
}

/**
 * [CORE] Auth GĐ1 — login mật khẩu + phát access token.
 *
 * Phạm vi GĐ2 (chưa làm, xem docs/progress.md): refresh token xoay vòng +
 * family, CSRF double-submit, Redis session runtime, rate limit, khoá tài
 * khoản, forgot password, invitation.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async login(input: {
    email: string;
    password: string;
    /** Bắt buộc khi user thuộc nhiều tenant */
    tenantId?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginResult> {
    const user = await this.repo.findUserByEmail(input.email);
    // Không phân biệt "sai email" và "sai mật khẩu" — chống dò tài khoản
    if (!user || !user.passwordHash) throw new AppException('AUTH.INVALID_CREDENTIALS');
    if (user.status === 'DISABLED') throw new AppException('AUTH.ACCOUNT_DISABLED');
    if (user.status === 'LOCKED') throw new AppException('AUTH.ACCOUNT_LOCKED');

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) throw new AppException('AUTH.INVALID_CREDENTIALS');

    const memberships = await this.repo.findActiveMemberships(user.id);
    const active = memberships.filter((m) => m.tenant.status === 'ACTIVE');
    if (active.length === 0) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');

    const summary = active.map((m) => ({
      tenantId: m.tenantId,
      tenantCode: m.tenant.code,
      tenantName: m.tenant.name,
    }));

    // Nhiều membership mà chưa chọn tenant → trả danh sách để FE hiện màn chọn (§4.4b)
    let chosen = active[0];
    if (input.tenantId) {
      const found = active.find((m) => m.tenantId === input.tenantId);
      if (!found) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');
      chosen = found;
    } else if (active.length > 1) {
      return { accessToken: null, expiresIn: 0, memberships: summary };
    }
    if (!chosen) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');

    const session = await this.repo.createSession({
      tenantId: chosen.tenantId,
      membershipId: chosen.id,
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    });
    await this.repo.updateLastLogin(user.id);

    // Payload CHỐT CỨNG theo §4.3 — không nhúng permission
    const payload: AuthUser = {
      sub: user.id,
      tenantId: chosen.tenantId,
      membershipId: chosen.id,
      sessionId: session.id,
      orgUnitId: chosen.orgUnitId ?? undefined,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, memberships: summary };
  }

  async getMe(user: AuthUser) {
    const membership = await this.repo.findMembershipWithOrgUnit(user.tenantId, user.sub);
    if (!membership) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');
    const account = await this.repo.findUserById(user.sub);
    if (!account) throw new AppException('AUTH.UNAUTHENTICATED');
    return { account, membership };
  }
}
