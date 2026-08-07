import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';

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

  /**
   * Tập quyền của user trong tenant hiện hành — chạy TRONG request context
   * (guard đã set tenantId, extension tự inject).
   * ERD #1: role đi theo MEMBERSHIP, không theo user.
   */
  async findPermissionCodes(tenantId: string, userId: string): Promise<string[]> {
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
    const codes = new Set<string>();
    for (const ur of membership.userRoles) {
      if (ur.role.deletedAt) continue;
      for (const rp of ur.role.permissions) codes.add(rp.permission.code);
    }
    return [...codes];
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
}
