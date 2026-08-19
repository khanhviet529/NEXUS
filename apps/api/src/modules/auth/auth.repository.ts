import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS, SEED_ROLES } from '@nexus/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';
import { AuditRepository } from '../audit/audit.repository';

/**
 * [CORE] Repository của auth — nơi DUY NHẤT của module này chạm Prisma (§4.9).
 *
 * Ghi chú bypass: login xảy ra TRƯỚC khi có tenant trong context, mà
 * TenantMembership là model TENANT (fail-closed). Các query pre-auth vì vậy
 * chạy trong runWith({ tenancyBypass: true }) — có chủ đích, chỉ ở file này.
 */
@Injectable()
export class AuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditRepository,
  ) {}

  /** User là GLOBAL — không cần tenant context */
  findUserByEmail(email: string) {
    return this.prisma.client.user.findUnique({ where: { email } });
  }

  findUserById(id: string) {
    return this.prisma.client.user.findUnique({ where: { id } });
  }

  /** Pre-auth: liệt kê membership ACTIVE của user trên MỌI tenant (chọn tenant khi login) */
  findActiveMemberships(userId: string) {
    return this.ctx.runWith({ tenancyBypass: true }, () =>
      this.prisma.client.tenantMembership.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { tenant: { select: { id: true, code: true, name: true, status: true } } },
      }),
    );
  }

  /** Pre-auth: tạo session metadata (§4.3d — DB là metadata, Redis là runtime GĐ2) */
  createSession(input: {
    tenantId: string;
    membershipId: string;
    ip?: string;
    userAgent?: string;
    expiresAt: Date;
  }) {
    return this.ctx.runWith(
      { tenantId: input.tenantId, actorId: input.membershipId },
      () =>
        this.prisma.client.session.create({
          data: {
            tenantId: input.tenantId,
            membershipId: input.membershipId,
            ip: input.ip,
            userAgent: input.userAgent,
            expiresAt: input.expiresAt,
          },
        }),
    );
  }

  updateLastLogin(userId: string) {
    return this.prisma.client.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  /** Thu hồi phiên — bước 1 của thứ tự §4.3d (ghi bền trước khi xoá Redis) */
  revokeSession(sessionId: string, tenantId: string) {
    return this.ctx.runWith({ tenantId, tenancyBypass: false }, () =>
      this.prisma.client.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /**
   * Mọi phiên còn sống của user trên MỌI tenant — bypass có chủ đích:
   * dùng cho revoke-all khi phát hiện token bị đánh cắp / reset mật khẩu (§4.3c).
   */
  findActiveSessionsOfUser(userId: string) {
    return this.ctx.runWith({ tenancyBypass: true }, () =>
      this.prisma.client.session.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          membership: { userId },
        },
        select: { id: true, tenantId: true },
      }),
    );
  }

  /** Phiên của một membership (màn "thiết bị đang đăng nhập") */
  findSessionsOfMembership(tenantId: string, membershipId: string) {
    return this.ctx.runWith({ tenantId }, () =>
      this.prisma.client.session.findMany({
        where: { membershipId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  }

  /**
   * (code, scope) của user trong tenant hiện hành — chạy TRONG request context
   * (guard đã set tenantId, extension tự inject).
   * ERD #1: role đi theo MEMBERSHIP, không theo user.
   */
  async findPermissionScopes(
    tenantId: string,
    userId: string,
  ): Promise<Array<{ code: string; scope: string }>> {
    const membership = await this.prisma.client.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        userRoles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!membership || membership.status !== 'ACTIVE') return [];
    const rows: Array<{ code: string; scope: string }> = [];
    for (const ur of membership.userRoles) {
      if (ur.role.deletedAt) continue;
      for (const rp of ur.role.permissions) {
        rows.push({ code: rp.permission.code, scope: rp.scope });
      }
    }
    return rows;
  }

  // ==================== Password reset (§4.3c) ====================

  /** DB chỉ lưu HASH — bản gốc chỉ nằm trong email */
  createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string;
  }) {
    return this.prisma.client.passwordResetToken.create({ data: input });
  }

  /** Cấp token mới → vô hiệu mọi token chưa dùng của user (§4.3c) */
  invalidateUserResetTokens(userId: string) {
    return this.prisma.client.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  findValidResetToken(tokenHash: string) {
    return this.prisma.client.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  markResetTokenUsed(id: string) {
    return this.prisma.client.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // ==================== Invitation (§4.3c) ====================

  createInvitation(input: {
    tenantId: string;
    email: string;
    tokenHash: string;
    orgUnitId?: string;
    expiresAt: Date;
    invitedById?: string;
    roleIds: string[];
  }) {
    return this.ctx.runWith({ tenantId: input.tenantId }, () =>
      this.prisma.client.invitation.create({
        data: {
          tenantId: input.tenantId,
          email: input.email,
          tokenHash: input.tokenHash,
          orgUnitId: input.orgUnitId,
          expiresAt: input.expiresAt,
          invitedById: input.invitedById,
          // Child nhận tenant qua composite FK (§6.4)
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
      }),
    );
  }

  /** Pre-auth (user bấm link trong mail) — bypass có chủ đích */
  findInvitationByHash(tokenHash: string) {
    return this.ctx.runWith({ tenancyBypass: true }, () =>
      this.prisma.client.invitation.findUnique({
        where: { tokenHash },
        include: { roles: true },
      }),
    );
  }

  /** Accept: tạo/tái dùng user global + membership + roles, đánh dấu đã nhận — 1 transaction */
  async acceptInvitation(input: {
    invitationId: string;
    tenantId: string;
    email: string;
    fullName: string;
    passwordHash: string | null; // null nếu user đã tồn tại (giữ mật khẩu cũ)
    orgUnitId?: string;
    roleIds: string[];
  }) {
    return this.ctx.runWith({ tenantId: input.tenantId }, () =>
      this.prisma.client.$transaction(async (tx) => {
        let user = await tx.user.findUnique({ where: { email: input.email } });
        if (!user) {
          user = await tx.user.create({
            data: {
              email: input.email,
              fullName: input.fullName,
              passwordHash: input.passwordHash,
              status: 'ACTIVE',
            },
          });
        }
        const membership = await tx.tenantMembership.upsert({
          where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
          create: {
            tenantId: input.tenantId,
            userId: user.id,
            orgUnitId: input.orgUnitId,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
          update: { status: 'ACTIVE' },
        });
        for (const roleId of input.roleIds) {
          await tx.userRole.upsert({
            where: {
              tenantId_membershipId_roleId: {
                tenantId: input.tenantId,
                membershipId: membership.id,
                roleId,
              },
            },
            create: { tenantId: input.tenantId, membershipId: membership.id, roleId },
            update: {},
          });
        }
        await tx.invitation.update({
          where: { id: input.invitationId },
          data: { acceptedAt: new Date() },
        });
        return { user, membership };
      }),
    );
  }

  /** Membership để switch-tenant — kiểm tra đích trước khi cấp token mới (§3.1b) */
  findMembershipForSwitch(targetTenantId: string, userId: string) {
    return this.ctx.runWith({ tenancyBypass: true }, () =>
      this.prisma.client.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: targetTenantId, userId } },
        include: { tenant: { select: { status: true } } },
      }),
    );
  }

  /** Sync permission registry → DB lúc boot (§4.4). Permission là GLOBAL. */
  upsertPermission(def: {
    code: string;
    resource: string;
    action: string;
    description?: string;
  }) {
    return this.prisma.client.permission.upsert({
      where: { code: def.code },
      create: def,
      update: { resource: def.resource, action: def.action, description: def.description },
    });
  }

  findMembershipWithOrgUnit(tenantId: string, userId: string) {
    return this.prisma.client.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        tenant: { select: { id: true, code: true, name: true, defaultLocale: true } },
        orgUnit: { select: { id: true, code: true, name: true } },
        userRoles: { include: { role: { select: { code: true, name: true } } } },
      },
    });
  }

  /** Tenant là model GLOBAL — dùng cho vòng auto-grant lúc boot (F11) */
  findAllTenantIds(): Promise<string[]> {
    return this.prisma.client.tenant
      .findMany({ select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
  }

  /**
   * F11 (C1): cấp những quyền registry CÓ mà TENANT_ADMIN CHƯA có — gỡ khoá
   * chết "quyền mới → không ai có → không ai cấp được qua UI (luật §2.3)".
   * - Idempotent: chỉ chèn phần thiếu; không thiếu gì → không ghi gì
   * - Audit PERMISSION_AUTO_GRANT trong CÙNG tx (ADR-0004)
   * - Caller quyết danh sách codes (đã loại quyền nhà-cung-cấp system*)
   * Trả về danh sách code vừa cấp.
   */
  autoGrantMissingToTenantAdmin(tenantId: string, codes: string[]): Promise<string[]> {
    return this.ctx.runWith({ tenantId }, async () => {
      const role = await this.prisma.client.role.findFirst({
        where: { code: SEED_ROLES.TENANT_ADMIN, isSystem: true },
      });
      if (!role) return [];
      const [perms, existing] = await Promise.all([
        this.prisma.client.permission.findMany({ where: { code: { in: codes } } }),
        this.prisma.client.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        }),
      ]);
      const have = new Set(existing.map((e) => e.permissionId));
      const missing = perms.filter((perm) => !have.has(perm.id));
      if (missing.length === 0) return [];
      await this.prisma.client.$transaction(async (tx) => {
        for (const perm of missing) {
          await tx.rolePermission.create({
            data: { tenantId, roleId: role.id, permissionId: perm.id, scope: 'all' },
          });
        }
        await this.audit.writeInTx(tx, {
          tenantId,
          entity: 'Role',
          entityId: role.id,
          action: AUDIT_ACTIONS.PERMISSION_AUTO_GRANT,
          actorName: 'system:permission-sync',
          after: { granted: missing.map((perm) => perm.code) },
        });
      });
      return missing.map((perm) => perm.code);
    });
  }
}
