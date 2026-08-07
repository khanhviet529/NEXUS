import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * GĐ3b — quản trị tenant (§5C.1) + audit trigger DB (§4.9 luật 2).
 * Tiêu chí §10: "Tạo/khoá tenant, quota, feature flag theo tenant hoạt động".
 */
describe('GĐ3b — quản trị tenant + audit trigger', () => {
  let h: TestHarness;
  let sysToken = '';
  let adminToken = '';

  beforeAll(async () => {
    h = await createTestApp();
    sysToken = await h.login('sysadmin@nexus.local');
    adminToken = await h.login('admin@tenant-a.local');
  });
  afterAll(async () => {
    await h.close();
  });

  it('TENANT_ADMIN vào /admin/tenants → 403 (thiếu system:cross_tenant)', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('SYSADMIN: tạo tenant → seed sẵn ROOT org + 4 vai trò hệ thống + audit CROSS_TENANT_ACCESS', async () => {
    const create = await request(h.app.getHttpServer())
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ code: 'CTY-MOI', name: 'Công ty Mới' });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const tenantId = create.body.id as string;

    const [roles, orgUnits] = await Promise.all([
      h.rawPrisma.role.findMany({ where: { tenantId } }),
      h.rawPrisma.orgUnit.findMany({ where: { tenantId } }),
    ]);
    expect(roles.map((r) => r.code).sort()).toEqual([
      'MANAGER',
      'STAFF',
      'TENANT_ADMIN',
      'VIEWER',
    ]); // KHÔNG có SYSADMIN — vai trò nhà cung cấp
    expect(orgUnits).toHaveLength(1);
    expect(orgUnits[0]?.code).toBe('ROOT');
    // TENANT_ADMIN của tenant mới có quyền
    const rolePerms = await h.rawPrisma.rolePermission.count({
      where: { tenantId, role: { code: 'TENANT_ADMIN' } },
    });
    expect(rolePerms).toBeGreaterThan(10);

    // Audit CROSS_TENANT_ACCESS BẮT BUỘC (§3.1b)
    const audit = await h.rawPrisma.auditLog.findFirst({
      where: { tenantId, action: 'CROSS_TENANT_ACCESS' },
    });
    expect(audit).not.toBeNull();
  });

  it('suspend tenant → login bị chặn + phiên đang sống chết NGAY', async () => {
    // Đăng nhập trước bằng tài khoản tenant B
    const before = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@tenant-b.local', password: h.seed.password, client: 'mobile' });
    expect(before.status).toBe(201);

    const suspend = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/tenants/${h.seed.tenantB.tenantId}/suspend`)
      .set('Authorization', `Bearer ${sysToken}`);
    expect(suspend.status).toBe(204);

    // Phiên cũ chết ngay (Redis §4.3d)
    const meDead = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${before.body.accessToken}`);
    expect(meDead.status).toBe(401);

    // Login mới bị chặn (tenant không ACTIVE)
    const loginBlocked = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@tenant-b.local', password: h.seed.password });
    expect(loginBlocked.status).toBe(403);

    // Kích hoạt lại cho các test sau
    const activate = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/tenants/${h.seed.tenantB.tenantId}/activate`)
      .set('Authorization', `Bearer ${sysToken}`);
    expect(activate.status).toBe(204);
    const loginAgain = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@tenant-b.local', password: h.seed.password });
    expect(loginAgain.status).toBe(201);
  });

  it('feature flag theo tenant: bật/tắt + quota', async () => {
    const set = await request(h.app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${h.seed.tenantA.tenantId}/features`)
      .set('Authorization', `Bearer ${sysToken}`)
      .send({
        features: [
          { featureKey: 'module.approvals', enabled: true, quota: { maxFlows: 10 } },
          { featureKey: 'module.imports', enabled: false },
        ],
      });
    expect(set.status).toBe(204);

    const current = await request(h.app.getHttpServer())
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(current.status).toBe(200);
    const features = current.body.features as Array<{ featureKey: string; enabled: boolean }>;
    expect(features.find((f) => f.featureKey === 'module.approvals')?.enabled).toBe(true);
    expect(features.find((f) => f.featureKey === 'module.imports')?.enabled).toBe(false);
  });

  it('tenant tự cập nhật branding (tenant:update, không cross-tenant)', async () => {
    const res = await request(h.app.getHttpServer())
      .patch('/api/v1/tenants/current/branding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branding: { primaryColor: '#0ea5e9', displayName: 'Tenant A Corp' } });
    expect(res.status).toBe(200);
    expect(res.body.branding.primaryColor).toBe('#0ea5e9');
  });

  // ==================== Audit trigger DB (§4.9 luật 2) ====================

  it('sửa LÉN user_roles bằng raw SQL (bỏ qua toàn bộ tầng ứng dụng) → trigger vẫn ghi audit', async () => {
    const ur = await h.rawPrisma.userRole.findFirstOrThrow({
      where: { tenantId: h.seed.tenantB.tenantId },
    });
    // DELETE trực tiếp — mô phỏng kẻ tấn công có quyền DB
    await h.rawPrisma.$executeRaw(
      Prisma.sql`DELETE FROM user_roles WHERE id = ${ur.id}::uuid`,
    );

    const audit = await h.rawPrisma.auditLog.findFirst({
      where: {
        tenantId: h.seed.tenantB.tenantId,
        entity: 'user_roles',
        entityId: ur.id,
        action: 'DB_DELETE',
      },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe('db:direct'); // không qua ứng dụng → dấu vết rõ

    // Khôi phục
    await h.rawPrisma.userRole.create({
      data: {
        tenantId: ur.tenantId,
        membershipId: ur.membershipId,
        roleId: ur.roleId,
      },
    });
  });

  it('trigger CHE cột nhạy cảm: update users không để lộ password_hash/salary trong audit', async () => {
    const user = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'viewer@tenant-b.local' },
    });
    await h.rawPrisma.$executeRaw(
      Prisma.sql`UPDATE users SET full_name = 'Bị Sửa Lén' WHERE id = ${user.id}::uuid`,
    );
    const audit = await h.rawPrisma.auditLog.findFirst({
      where: { entity: 'users', entityId: user.id, action: 'DB_UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    const raw = JSON.stringify(audit);
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain(user.passwordHash as string);
    expect(raw).not.toContain('12345678'); // salary seed
    expect((audit!.after as Record<string, unknown>)['full_name']).toBe('Bị Sửa Lén');
  });
});
