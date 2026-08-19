import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PERMISSIONS, SEED_ROLES, AUDIT_ACTIONS } from '@nexus/shared';
import { createTestApp, type TestHarness } from './setup/test-app';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RequestContextService } from '../src/infra/cls/request-context';
import { PermissionSyncService } from '../src/modules/auth/permission-sync.service';

/**
 * F11 (C1 lượt 2) — PermissionSync auto-grant quyền mới cho TENANT_ADMIN.
 *
 * Khoá chết gốc ở dogfood: quyền module mới → không ai có → không ai cấp được
 * qua UI (luật §2.3) → bắt buộc sửa seed-roles + re-seed (không làm được trên
 * production). Sau vá: boot là TENANT_ADMIN của MỌI tenant tự nhận phần thiếu,
 * có audit; re-run không nhân đôi.
 *
 * "Thêm 1 permission mới vào registry rồi restart" mô phỏng bằng trạng thái
 * tương đương: XOÁ một rolePermission đang có (registry có, role thiếu) rồi
 * gọi lại đúng hàm chạy lúc boot.
 */
describe('F11 — PermissionSync auto-grant cho TENANT_ADMIN', () => {
  let h: TestHarness;
  let prisma: PrismaService;
  let ctx: RequestContextService;
  let sync: PermissionSyncService;
  let tenantIds: string[] = [];

  const GRANTABLE = PERMISSIONS.filter((p) => !p.resource.startsWith('system'));

  const adminRoleOf = (tenantId: string) =>
    ctx.runWith({ tenantId }, () =>
      prisma.client.role.findFirstOrThrow({
        where: { code: SEED_ROLES.TENANT_ADMIN, isSystem: true },
      }),
    );

  const grantsOf = (tenantId: string, roleId: string) =>
    ctx.runWith({ tenantId }, () =>
      prisma.client.rolePermission.findMany({
        where: { roleId },
        include: { permission: { select: { code: true, resource: true } } },
      }),
    );

  const autoGrantAuditCount = (tenantId: string, roleId: string) =>
    ctx.runWith({ tenantId }, () =>
      prisma.client.auditLog.count({
        where: { entity: 'Role', entityId: roleId, action: AUDIT_ACTIONS.PERMISSION_AUTO_GRANT },
      }),
    );

  beforeAll(async () => {
    h = await createTestApp(); // boot = onApplicationBootstrap đã chạy sync + auto-grant
    prisma = h.app.get(PrismaService);
    ctx = h.app.get(RequestContextService);
    sync = h.app.get(PermissionSyncService);
    // CHỈ 2 tenant seed — file khác trong full-suite có thể provision thêm tenant
    tenantIds = (
      await prisma.client.tenant.findMany({
        where: { code: { in: ['TENANT-A', 'TENANT-B'] } },
        select: { id: true },
      })
    ).map((t) => t.id);
    expect(tenantIds.length).toBe(2);
  });
  afterAll(async () => {
    await h.close();
  });

  it('sau boot: TENANT_ADMIN của cả 2 tenant SEED đủ quyền tenant-level, KHÔNG có system*', async () => {
    for (const tenantId of tenantIds) {
      const role = await adminRoleOf(tenantId);
      const grants = await grantsOf(tenantId, role.id);
      const codes = new Set(grants.map((g) => g.permission.code));
      const missing = GRANTABLE.filter((p) => !codes.has(p.code)).map((p) => p.code);
      expect(missing, `tenant ${tenantId} thiếu quyền`).toEqual([]);
      // Leo thang đặc quyền = cấp system* cho tenant admin — phải bằng 0
      const escalated = grants.filter((g) => g.permission.resource.startsWith('system'));
      expect(escalated.map((g) => g.permission.code)).toEqual([]);
    }
  });

  it('quyền registry có mà role thiếu → boot kế tiếp tự cấp + ghi audit đúng actor', async () => {
    const tenantId = tenantIds[0]!;
    const role = await adminRoleOf(tenantId);
    const target = GRANTABLE[0]!; // một quyền tenant-level bất kỳ

    // Mô phỏng "permission mới trong registry": role đang THIẾU đúng 1 quyền
    await ctx.runWith({ tenantId }, async () => {
      const perm = await prisma.client.permission.findUniqueOrThrow({
        where: { code: target.code },
      });
      await prisma.client.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: perm.id },
      });
    });
    const auditBefore = await autoGrantAuditCount(tenantId, role.id);

    await sync.autoGrantTenantAdmins(); // đúng hàm chạy lúc boot

    const grants = await grantsOf(tenantId, role.id);
    expect(grants.map((g) => g.permission.code)).toContain(target.code);

    const auditAfter = await autoGrantAuditCount(tenantId, role.id);
    expect(auditAfter).toBe(auditBefore + 1);
    const lastAudit = await ctx.runWith({ tenantId }, () =>
      prisma.client.auditLog.findFirstOrThrow({
        where: { entity: 'Role', entityId: role.id, action: AUDIT_ACTIONS.PERMISSION_AUTO_GRANT },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(lastAudit.actorName).toBe('system:permission-sync');
    expect((lastAudit.after as { granted: string[] }).granted).toContain(target.code);
  });

  it('idempotent: chạy lại khi không thiếu gì → không thêm rolePermission, không thêm audit', async () => {
    const tenantId = tenantIds[0]!;
    const role = await adminRoleOf(tenantId);
    const grantsBefore = (await grantsOf(tenantId, role.id)).length;
    const auditBefore = await autoGrantAuditCount(tenantId, role.id);

    await sync.autoGrantTenantAdmins();
    await sync.autoGrantTenantAdmins();

    expect((await grantsOf(tenantId, role.id)).length).toBe(grantsBefore);
    expect(await autoGrantAuditCount(tenantId, role.id)).toBe(auditBefore);
  });
});
