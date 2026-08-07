import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  SEED_ROLES,
  SEED_ROLE_PERMISSIONS,
  VN_DEFAULT_WORKING_HOURS,
  VN_LUNAR_HOLIDAYS,
  VN_RECURRING_HOLIDAYS,
} from '@nexus/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';
import { OrgTreeRepository } from '../auth/org-tree.repository';

/** Repository của admin — nơi DUY NHẤT module này chạm Prisma (§4.9) */
@Injectable()
export class AdminRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly orgTree: OrgTreeRepository,
  ) {}

  listTenants() {
    return this.prisma.client.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { memberships: true } } },
    });
  }

  findTenant(id: string) {
    return this.prisma.client.tenant.findUnique({ where: { id } });
  }

  updateTenantStatus(id: string, status: string, suspendedAt: Date | null) {
    return this.prisma.client.tenant.update({
      where: { id },
      data: { status, suspendedAt },
    });
  }

  findActiveSessionsOfTenant(tenantId: string) {
    return this.ctx.runWith({ tenantId }, () =>
      this.prisma.client.session.findMany({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      }),
    );
  }

  upsertFeatures(
    tenantId: string,
    features: Array<{ featureKey: string; enabled: boolean; quota?: Record<string, unknown> }>,
  ) {
    return this.ctx.runWith({ tenantId }, async () => {
      for (const f of features) {
        await this.prisma.client.tenantFeature.upsert({
          where: { tenantId_featureKey: { tenantId, featureKey: f.featureKey } },
          create: { tenantId, featureKey: f.featureKey, enabled: f.enabled, quota: f.quota },
          update: { enabled: f.enabled, quota: f.quota },
        });
      }
    });
  }

  findTenantWithFeatures(id: string) {
    return this.prisma.client.tenant.findUnique({
      where: { id },
      include: { features: true },
    });
  }

  updateBranding(id: string, branding: Record<string, unknown>) {
    return this.prisma.client.tenant.update({
      where: { id },
      data: { branding: branding as never },
    });
  }

  /**
   * Tạo tenant KÈM seed khởi tạo (§5C.1): ROOT org + 4 vai trò hệ thống từ
   * SEED_ROLE_PERMISSIONS — CÙNG nguồn với prisma/seed.ts, không chép hai nơi.
   * (SYSADMIN là vai trò nhà cung cấp — không seed vào tenant khách.)
   */
  async provisionTenant(input: {
    code: string;
    name: string;
    defaultLocale?: string;
    defaultTimezone?: string;
  }) {
    const tenant = await this.prisma.client.tenant.create({
      data: {
        code: input.code,
        name: input.name,
        status: 'ACTIVE',
        defaultLocale: input.defaultLocale ?? 'vi',
        defaultTimezone: input.defaultTimezone ?? 'Asia/Ho_Chi_Minh',
      },
    });

    await this.ctx.runWith({ tenantId: tenant.id }, async () => {
      const root = await this.prisma.client.orgUnit.create({
        data: { tenantId: tenant.id, code: 'ROOT', name: `${input.name} (gốc)` },
      });
      await this.orgTree.setPathOnCreate(tenant.id, root.id, null);

      const allPermissions = await this.prisma.client.permission.findMany();
      const byCode = new Map(allPermissions.map((p) => [p.code, p.id]));

      for (const [roleCode, perms] of Object.entries(SEED_ROLE_PERMISSIONS)) {
        if (roleCode === SEED_ROLES.SYSADMIN) continue;
        const role = await this.prisma.client.role.create({
          data: { tenantId: tenant.id, code: roleCode, name: roleCode, isSystem: true },
        });
        const entries =
          perms === 'ALL'
            ? PERMISSIONS.map((p) => ({ code: p.code, scope: 'all' }))
            : perms;
        for (const e of entries) {
          const permissionId = byCode.get(e.code);
          if (!permissionId) continue;
          await this.prisma.client.rolePermission.create({
            data: { tenantId: tenant.id, roleId: role.id, permissionId, scope: e.scope },
          });
        }
      }

      // Business calendar mặc định (§5C.4, GĐ7) — CÙNG data với prisma/seed.ts
      const calendar = await this.prisma.client.businessCalendar.create({
        data: { tenantId: tenant.id, name: 'Lịch làm việc chuẩn', isDefault: true },
      });
      await this.prisma.client.calendarWorkingHour.createMany({
        data: VN_DEFAULT_WORKING_HOURS.flatMap((d) =>
          d.intervals.map((iv) => ({
            tenantId: tenant.id,
            calendarId: calendar.id,
            dayOfWeek: d.dayOfWeek,
            fromTime: iv.from,
            toTime: iv.to,
          })),
        ),
      });
      await this.prisma.client.calendarHoliday.createMany({
        data: [
          ...VN_RECURRING_HOLIDAYS.map((h) => ({
            tenantId: tenant.id,
            calendarId: calendar.id,
            date: new Date(`2026-${h.monthDay}T00:00:00Z`),
            name: h.name,
            isRecurring: true,
          })),
          ...VN_LUNAR_HOLIDAYS.map((h) => ({
            tenantId: tenant.id,
            calendarId: calendar.id,
            date: new Date(`${h.date}T00:00:00Z`),
            name: h.name,
            isRecurring: false,
          })),
        ],
      });
    });

    return tenant;
  }
}
