import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { QueueService } from '../../infra/queue/queue.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuthRepository } from './auth.repository';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // §4.3: 15 phút

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult {
  /** null khi user nhiều membership chưa chọn tenant */
  tokens: TokenPair | null;
  memberships: Array<{ tenantId: string; tenantCode: string; tenantName: string }>;
}

/**
 * [CORE] Auth GĐ2 — spec §4.3, §4.3b, §4.3c, §4.3d.
 * Controller lo cookie/transport; service chỉ biết nghiệp vụ.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditRepository,
    private readonly queue: QueueService,
  ) {}

  private async signAccess(payload: AuthUser): Promise<string> {
    return this.jwt.signAsync({ ...payload }, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  private async issueTokens(input: {
    userId: string;
    tenantId: string;
    membershipId: string;
    orgUnitId?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<TokenPair> {
    const { sessionId, refreshToken } = await this.sessions.create(input);
    const accessToken = await this.signAccess({
      sub: input.userId,
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      sessionId,
      orgUnitId: input.orgUnitId,
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  async login(input: {
    email: string;
    password: string;
    tenantId?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginResult> {
    await this.rateLimit.checkLogin(input.ip ?? 'unknown', input.email); // §4.3 chống dò

    const ip = input.ip ?? 'unknown';
    const user = await this.repo.findUserByEmail(input.email);
    // Không phân biệt "sai email" và "sai mật khẩu" — chống dò tài khoản
    if (!user || !user.passwordHash) {
      await this.rateLimit.recordLoginFailure(ip, input.email);
      throw new AppException('AUTH.INVALID_CREDENTIALS');
    }
    if (user.status === 'DISABLED') throw new AppException('AUTH.ACCOUNT_DISABLED');
    if (user.status === 'LOCKED') throw new AppException('AUTH.ACCOUNT_LOCKED');

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      await this.rateLimit.recordLoginFailure(ip, input.email);
      throw new AppException('AUTH.INVALID_CREDENTIALS');
    }
    await this.rateLimit.recordLoginSuccess(ip, input.email);

    const memberships = await this.repo.findActiveMemberships(user.id);
    const active = memberships.filter((m) => m.tenant.status === 'ACTIVE');
    if (active.length === 0) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');

    const summary = active.map((m) => ({
      tenantId: m.tenantId,
      tenantCode: m.tenant.code,
      tenantName: m.tenant.name,
    }));

    let chosen = active[0];
    if (input.tenantId) {
      const found = active.find((m) => m.tenantId === input.tenantId);
      if (!found) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');
      chosen = found;
    } else if (active.length > 1) {
      // Màn chọn tenant (§4.4b) — client gọi lại kèm tenantId (= select-tenant của ma trận §2.1)
      return { tokens: null, memberships: summary };
    }
    if (!chosen) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');

    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: chosen.tenantId,
      membershipId: chosen.id,
      orgUnitId: chosen.orgUnitId ?? undefined,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    await this.repo.updateLastLogin(user.id);
    await this.audit.write({
      tenantId: chosen.tenantId,
      entity: 'User',
      entityId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      actorId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { tokens, memberships: summary };
  }

  /**
   * Refresh xoay vòng — spec §4.3d.
   * Token cũ bị dùng lại → huỷ TOÀN BỘ session của user + audit + email cảnh báo.
   */
  async refresh(refreshToken: string, ip?: string): Promise<TokenPair> {
    const result = await this.tokens.rotate(refreshToken);

    if (result.status === 'reuse-detected') {
      const { family } = result;
      await this.sessions.revokeAllOfUser(family.userId);
      await this.audit.write({
        tenantId: family.tenantId,
        entity: 'User',
        entityId: family.userId,
        action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
        actorId: family.userId,
        ip,
        after: { familyId: family.familyId },
      });
      const user = await this.repo.findUserById(family.userId);
      if (user) {
        await this.queue.add('MAIL_SEND', {
          kind: 'RAW',
          message: {
            to: user.email,
            subject: 'Cảnh báo bảo mật: phiên đăng nhập bất thường',
            html: `<p>Hệ thống phát hiện refresh token bị dùng lại${ip ? ` từ IP ${ip}` : ''} — dấu hiệu token bị đánh cắp.</p>
<p>TOÀN BỘ phiên đăng nhập của bạn đã bị thu hồi. Vui lòng đăng nhập lại và đổi mật khẩu.</p>`,
          },
        });
      }
      throw new AppException('AUTH.UNAUTHENTICATED');
    }

    if (result.status === 'invalid') throw new AppException('AUTH.UNAUTHENTICATED');

    const { family, token } = result;
    // Phiên phải còn sống ở Redis (nguồn sự thật §4.3d)
    if (!(await this.sessions.isAlive(family.sessionId))) {
      await this.tokens.destroyFamily(family.familyId);
      throw new AppException('AUTH.UNAUTHENTICATED');
    }
    const membership = await this.repo.findMembershipForSwitch(family.tenantId, family.userId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AppException('AUTH.UNAUTHENTICATED');
    }
    const accessToken = await this.signAccess({
      sub: family.userId,
      tenantId: family.tenantId,
      membershipId: family.membershipId,
      sessionId: family.sessionId,
      orgUnitId: membership.orgUnitId ?? undefined,
    });
    return { accessToken, refreshToken: token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  async logout(user: AuthUser, ip?: string): Promise<void> {
    await this.sessions.revoke(user.sessionId, user.tenantId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'User',
      entityId: user.sub,
      action: AUDIT_ACTIONS.LOGOUT,
      actorId: user.sub,
      ip,
    });
  }

  /** Đổi tenant = cấp token MỚI sau khi kiểm membership — KHÔNG đổi context client (§3.1b) */
  async switchTenant(
    user: AuthUser,
    targetTenantId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const membership = await this.repo.findMembershipForSwitch(targetTenantId, user.sub);
    if (!membership || membership.status !== 'ACTIVE' || membership.tenant.status !== 'ACTIVE') {
      throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');
    }
    const tokens = await this.issueTokens({
      userId: user.sub,
      tenantId: targetTenantId,
      membershipId: membership.id,
      orgUnitId: membership.orgUnitId ?? undefined,
      ip,
      userAgent,
    });
    await this.audit.write({
      tenantId: targetTenantId,
      entity: 'User',
      entityId: user.sub,
      action: AUDIT_ACTIONS.LOGIN,
      actorId: user.sub,
      ip,
      after: { switchedFromTenantId: user.tenantId },
    });
    return tokens;
  }

  async getMe(user: AuthUser) {
    const membership = await this.repo.findMembershipWithOrgUnit(user.tenantId, user.sub);
    if (!membership) throw new AppException('AUTH.TENANT_MEMBERSHIP_REQUIRED');
    const account = await this.repo.findUserById(user.sub);
    if (!account) throw new AppException('AUTH.UNAUTHENTICATED');
    return { account, membership };
  }

  /** Màn "thiết bị đang đăng nhập" — metadata từ DB (§4.3d) */
  async getMySessions(user: AuthUser) {
    return this.repo.findSessionsOfMembership(user.tenantId, user.membershipId);
  }

  async revokeMySession(user: AuthUser, sessionId: string): Promise<void> {
    // Own-scope: chỉ phiên thuộc membership của chính mình
    const sessions = await this.repo.findSessionsOfMembership(user.tenantId, user.membershipId);
    if (!sessions.some((s) => s.id === sessionId)) {
      throw new AppException('COMMON.NOT_FOUND'); // không tiết lộ sự tồn tại (§4.10)
    }
    await this.sessions.revoke(sessionId, user.tenantId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Session',
      entityId: sessionId,
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      actorId: user.sub,
    });
  }
}
