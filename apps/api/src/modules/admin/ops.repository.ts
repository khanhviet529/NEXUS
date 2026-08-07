import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';

/**
 * [CORE nhẹ] GĐ9 — system operations (§5C.8), phần chạm DB.
 * Bảng GLOBAL (system_announcements, maintenance_windows) — extension
 * không inject tenant (TENANCY_POLICY.GLOBAL).
 */
@Injectable()
export class OpsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  async dbHealth(): Promise<{ ok: boolean; migrationVersion: string | null }> {
    try {
      const rows = await this.prisma.client.$queryRaw<Array<{ migration_name: string }>>(
        Prisma.sql`SELECT migration_name FROM _prisma_migrations
                   WHERE finished_at IS NOT NULL
                   ORDER BY finished_at DESC LIMIT 1`,
      );
      return { ok: true, migrationVersion: rows[0]?.migration_name ?? null };
    } catch {
      return { ok: false, migrationVersion: null };
    }
  }

  createAnnouncement(input: {
    title: string;
    body: string;
    severity: string;
    startsAt: Date;
    endsAt?: Date;
    targetTenantIds: string[];
  }) {
    return this.prisma.client.systemAnnouncement.create({ data: input });
  }

  listActiveAnnouncements(tenantId: string, now = new Date()) {
    return this.prisma.client.systemAnnouncement.findMany({
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        // targetTenantIds rỗng = toàn hệ thống
        AND: [{ OR: [{ targetTenantIds: { isEmpty: true } }, { targetTenantIds: { has: tenantId } }] }],
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  createMaintenanceWindow(input: {
    startsAt: Date;
    endsAt: Date;
    message: string;
    allowRoles: string[];
  }) {
    return this.prisma.client.maintenanceWindow.create({ data: input });
  }

  currentMaintenance(now = new Date()) {
    return this.prisma.client.maintenanceWindow.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { startsAt: 'desc' },
    });
  }

  /** Trạng thái backup gần nhất — script backup ghi settings key toàn hệ thống */
  async backupStatus(): Promise<{ lastBackupAt: string | null }> {
    const row = await this.prisma.client.setting.findFirst({
      where: { key: 'ops.lastBackupAt', tenantId: null },
    });
    return { lastBackupAt: row ? String((row.value as { at?: string }).at ?? null) : null };
  }
}
