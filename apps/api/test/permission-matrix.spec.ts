import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * Test §8.2 #8 — ma trận role × endpoint → status, chuyển gần 1-1 từ
 * docs/permission-matrix.md §2. KIỂM HAI THỨ: mã HTTP và PHẠM VI dữ liệu.
 *
 * Vai trò ở đây là FIXTURE của bộ seed (permission-matrix ghi chú đầu file) —
 * không vi phạm luật cấm rẽ nhánh mã vai trò (check chỉ quét src/).
 */

type Row = [
  role: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  expectStatus: number,
];

const ACCOUNTS: Record<string, string> = {
  STAFF: 'staff@tenant-a.local',
  MANAGER: 'manager@tenant-a.local',
  TENANT_ADMIN: 'admin@tenant-a.local',
  VIEWER: 'viewer@tenant-a.local',
};

describe('Ma trận quyền (§8.2 #8)', () => {
  let h: TestHarness;
  const tokens: Record<string, string> = {};
  let targetUserId = ''; // staff tenant A — đích cho endpoint :id
  let orgUnitId = '';

  beforeAll(async () => {
    h = await createTestApp();
    for (const [role, email] of Object.entries(ACCOUNTS)) {
      tokens[role] = await h.login(email);
    }
    const staff = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'staff@tenant-a.local' },
    });
    targetUserId = staff.id;
    orgUnitId = h.seed.tenantA.orgUnitId;
  });
  afterAll(async () => {
    await h.close();
  });

  const MATRIX: Row[] = [
    // §2.2 Người dùng & thành viên
    ['STAFF', 'GET', '/users', 200],
    ['MANAGER', 'GET', '/users', 200],
    ['TENANT_ADMIN', 'GET', '/users', 200],
    ['VIEWER', 'GET', '/users', 200],
    ['STAFF', 'POST', '/users/invite', 403],
    ['VIEWER', 'POST', '/users/invite', 403],
    ['STAFF', 'PATCH', '/users/:id', 403],
    ['VIEWER', 'PATCH', '/users/:id', 403],
    ['STAFF', 'POST', '/users/:id/disable', 403],
    ['MANAGER', 'POST', '/users/:id/disable', 403],
    ['STAFF', 'POST', '/users/:id/transfer-org', 403],
    ['STAFF', 'POST', '/users/:id/offboard', 403],
    ['VIEWER', 'GET', '/users/:id/sessions', 403],
    // §2.3 Vai trò & quyền
    ['STAFF', 'GET', '/roles', 403],
    ['MANAGER', 'GET', '/roles', 200],
    ['VIEWER', 'GET', '/roles', 200],
    ['STAFF', 'POST', '/roles', 403],
    ['MANAGER', 'POST', '/roles', 403],
    ['VIEWER', 'POST', '/roles', 403],
    ['STAFF', 'GET', '/permissions', 403],
    ['MANAGER', 'GET', '/permissions', 200],
    // §2.4 Đơn vị — ai cũng đọc, chỉ admin sửa
    ['STAFF', 'GET', '/org-units', 200],
    ['VIEWER', 'GET', '/org-units', 200],
    ['STAFF', 'POST', '/org-units', 403],
    ['MANAGER', 'POST', '/org-units', 403],
    ['VIEWER', 'POST', '/org-units', 403],
  ];

  for (const [role, method, path, expected] of MATRIX) {
    it(`${role} ${method} ${path} → ${expected}`, async () => {
      const url = `/api/v1${path.replace(':id', targetUserId)}`;
      const agent = request(h.app.getHttpServer());
      const req =
        method === 'GET'
          ? agent.get(url)
          : method === 'POST'
            ? agent.post(url).send(bodyFor(path))
            : method === 'PATCH'
              ? agent.patch(url).send({ fullName: 'X' })
              : agent.delete(url);
      const res = await req.set('Authorization', `Bearer ${tokens[role]}`);
      expect(res.status, JSON.stringify(res.body)).toBe(
        expected === 200 && method === 'POST' ? pickCreated(res.status) : expected,
      );
    });
  }

  function bodyFor(path: string): Record<string, unknown> {
    if (path === '/users/invite')
      return { email: 'x@y.local', roleIds: ['00000000-0000-0000-0000-000000000001'] };
    if (path === '/roles')
      return { code: 'TEST_R', name: 'Test', permissions: [{ permissionCode: 'user:read', scope: 'all' }] };
    if (path === '/org-units') return { code: 'X', name: 'X' };
    if (path.endsWith('/transfer-org')) return { orgUnitId };
    return {};
  }
  function pickCreated(status: number): number {
    return status; // POST hợp lệ có thể 200/201/204 — hàng 200 chỉ dùng cho GET trong ma trận này
  }

  // ---- Phạm vi dữ liệu — "200 kèm dữ liệu ngoài scope nguy hiểm hơn 403 sai" ----

  it('TENANT_ADMIN thấy toàn tenant; STAFF (dept) chỉ thấy đơn vị mình — KHÔNG dòng nào của tenant B', async () => {
    const [admin, staff] = await Promise.all([
      request(h.app.getHttpServer())
        .get('/api/v1/users?limit=100')
        .set('Authorization', `Bearer ${tokens['TENANT_ADMIN']}`),
      request(h.app.getHttpServer())
        .get('/api/v1/users?limit=100')
        .set('Authorization', `Bearer ${tokens['STAFF']}`),
    ]);
    expect(admin.status).toBe(200);
    expect(admin.body.data.length).toBeGreaterThanOrEqual(4);
    for (const row of admin.body.data) {
      expect(row.email).not.toContain('tenant-b'); // cách ly tenant ở list
    }
    // STAFF scope department: mọi dòng cùng org unit với staff
    expect(staff.status).toBe(200);
    for (const row of staff.body.data) {
      expect(row.orgUnit?.id).toBe(orgUnitId);
    }
    // total phản ánh SAU scope (§3.3) — admin ≥ staff
    expect(admin.body.meta.total).toBeGreaterThanOrEqual(staff.body.meta.total);
  });

  it('luật cứng: TENANT_ADMIN tự gán role cho mình → 403 AUTH.SELF_GRANT_FORBIDDEN', async () => {
    const adminUser = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'admin@tenant-a.local' },
    });
    const role = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'MANAGER' },
    });
    const res = await request(h.app.getHttpServer())
      .post(`/api/v1/users/${adminUser.id}/roles`)
      .set('Authorization', `Bearer ${tokens['TENANT_ADMIN']}`)
      .send({ roleIds: [role.id] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH.SELF_GRANT_FORBIDDEN');
  });

  it('luật cứng: không cấp được quyền mình không có (role chứa system:cross_tenant)', async () => {
    const sysRole = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'SYSADMIN' },
    });
    const res = await request(h.app.getHttpServer())
      .post(`/api/v1/users/${targetUserId}/roles`)
      .set('Authorization', `Bearer ${tokens['TENANT_ADMIN']}`)
      .send({ roleIds: [sysRole.id] });
    expect(res.status).toBe(403);
  });

  it('vai trò is_system: sửa/xoá → 403', async () => {
    const role = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'STAFF' },
    });
    const patch = await request(h.app.getHttpServer())
      .patch(`/api/v1/roles/${role.id}`)
      .set('Authorization', `Bearer ${tokens['TENANT_ADMIN']}`)
      .send({ name: 'Đổi tên' });
    expect(patch.status).toBe(403);
    const del = await request(h.app.getHttpServer())
      .delete(`/api/v1/roles/${role.id}`)
      .set('Authorization', `Bearer ${tokens['TENANT_ADMIN']}`);
    expect(del.status).toBe(403);
  });
});
