import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * Test §8.2 #9 (invalidation), #10 (field-leak), #11 (whitelist).
 * #10 GĐ3 phủ 2/4 nơi: API response + audit diff.
 * Nơi 2 (export): import-export-gd6.spec #26b. Nơi 3 (report): reports-gd6b.spec.
 * → #10 đã phủ đủ 4/4 nơi (§4.4c).
 */
describe('Field-level + invalidation (§8.2 #9, #10, #11)', () => {
  let h: TestHarness;
  let staffToken = '';
  let adminToken = '';
  let staffUserId = '';

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    adminToken = await h.login('admin@tenant-a.local');
    const staff = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'staff@tenant-a.local' },
    });
    staffUserId = staff.id;
  });
  afterAll(async () => {
    await h.close();
  });

  // ==================== #10 — field-level leak ====================

  it('#10 API: STAFF không thấy salary/nationalId; TENANT_ADMIN (field:hr+pii) thấy; phone ai cũng thấy', async () => {
    const asStaff = await request(h.app.getHttpServer())
      .get(`/api/v1/users/${staffUserId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.phone).toBe('0900000000'); // contact: mọi vai trò
    expect(asStaff.body).not.toHaveProperty('salary'); // hr: ẨN với STAFF
    expect(asStaff.body).not.toHaveProperty('nationalId'); // pii: ẨN

    const asAdmin = await request(h.app.getHttpServer())
      .get(`/api/v1/users/${staffUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(asAdmin.body.salary).toBe('12345678'); // decimal → chuỗi (§3.7)
    expect(asAdmin.body.nationalId).toBe('079123456789');
  });

  it('#10 list: cột nhạy cảm cũng ẩn trong danh sách', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${staffToken}`);
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('salary');
      expect(row).not.toHaveProperty('nationalId');
    }
  });

  it('#10 audit diff: sửa salary → before/after bị CHE trong audit_logs (§4.4c nơi 4)', async () => {
    const res = await request(h.app.getHttpServer())
      .patch(`/api/v1/users/${staffUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salary: '99999999.00' });
    expect(res.status).toBe(200);

    const audit = await h.rawPrisma.auditLog.findFirst({
      where: {
        tenantId: h.seed.tenantA.tenantId,
        entity: 'User',
        entityId: staffUserId,
        action: 'UPDATE',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    const before = audit!.before as Record<string, unknown>;
    const after = audit!.after as Record<string, unknown>;
    // Key còn (biết field đổi), GIÁ TRỊ bị che
    expect(before['salary']).toBe('«đã che»');
    expect(after['salary']).toBe('«đã che»');
    expect(JSON.stringify(audit)).not.toContain('99999999');
    expect(JSON.stringify(audit)).not.toContain('12345678');
  });

  it('#10 sửa field không được xem → 403 (STAFF không có field:hr)', async () => {
    // STAFF không có user:update nên dùng MANAGER (có update desc nhưng không có hr/pii...
    // theo seed MANAGER có field:cost+finance, KHÔNG có hr)
    const managerToken = await h.login('manager@tenant-a.local');
    const res = await request(h.app.getHttpServer())
      .patch(`/api/v1/users/${staffUserId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ salary: '1.00' });
    expect(res.status).toBe(403);
  });

  // ==================== #11 — whitelist sort ====================

  it('#11 sort=salary khi thiếu field:hr → 400, không lộ thứ tự lương', async () => {
    const managerToken = await h.login('manager@tenant-a.local');
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/users?sort=salary')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMMON.BAD_REQUEST');
  });

  it('#11 sort field ngoài whitelist → 400; field hợp lệ → 200', async () => {
    const bad = await request(h.app.getHttpServer())
      .get('/api/v1/users?sort=passwordHash')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);

    const good = await request(h.app.getHttpServer())
      .get('/api/v1/users?sort=-createdAt,email')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(good.status).toBe(200);
  });

  // ==================== #9 — permission invalidation ====================

  it('#9 gán role mới → quyền đổi NGAY, không chờ token hết hạn', async () => {
    // Tạo user mới qua invitation để không ảnh hưởng account khác
    const managerRole = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'MANAGER' },
    });
    const staffRole = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'STAFF' },
    });

    // Nạn nhân: viewer@tenant-b — dùng tài khoản riêng ở tenant A? Tạo mới:
    const email = 'nguoi-duoc-thang-chuc@nexus.local';
    const { randomBytes, createHash } = await import('node:crypto');
    const token = randomBytes(32).toString('base64url');
    await h.rawPrisma.invitation.create({
      data: {
        tenantId: h.seed.tenantA.tenantId,
        email,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        orgUnitId: h.seed.tenantA.orgUnitId,
        expiresAt: new Date(Date.now() + 3_600_000),
        roles: { create: [{ roleId: staffRole.id }] },
      },
    });
    const accept = await request(h.app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, fullName: 'Được Thăng Chức', password: 'MatKhau123!' });
    expect(accept.status, JSON.stringify(accept.body)).toBe(201);
    const loginRes = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'MatKhau123!', client: 'mobile' });
    expect(loginRes.status).toBe(201);
    const userToken = loginRes.body.accessToken as string;
    const target = await h.rawPrisma.user.findUniqueOrThrow({ where: { email } });

    // Trước: STAFF không có role:read
    const before = await request(h.app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${userToken}`);
    expect(before.status).toBe(403);

    // Admin gán MANAGER
    const assign = await request(h.app.getHttpServer())
      .post(`/api/v1/users/${target.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [managerRole.id] });
    expect(assign.status).toBe(204);

    // Sau: CÙNG access token (chưa hết hạn) — quyền mới hiệu lực NGAY
    const after = await request(h.app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${userToken}`);
    expect(after.status).toBe(200);
  });

  it('#9 đổi quyền của ROLE → mọi user giữ role đổi NGAY', async () => {
    // Tạo role riêng + user riêng
    const createRole = await request(h.app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'THU_NGHIEM',
        name: 'Thử nghiệm',
        permissions: [{ permissionCode: 'user:read', scope: 'all' }],
      });
    expect(createRole.status).toBe(201);
    const roleId = createRole.body.id as string;

    const target = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'nguoi-duoc-thang-chuc@nexus.local' },
    });
    await request(h.app.getHttpServer())
      .post(`/api/v1/users/${target.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleId] });
    const loginRes = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nguoi-duoc-thang-chuc@nexus.local', password: 'MatKhau123!', client: 'mobile' });
    expect(loginRes.status).toBe(201);
    const userToken = loginRes.body.accessToken as string;

    const before = await request(h.app.getHttpServer())
      .get('/api/v1/org-units')
      .set('Authorization', `Bearer ${userToken}`);
    expect(before.status).toBe(403); // role chưa có org_unit:read

    // Admin thêm quyền vào role
    const patch = await request(h.app.getHttpServer())
      .patch(`/api/v1/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        permissions: [
          { permissionCode: 'user:read', scope: 'all' },
          { permissionCode: 'org_unit:read', scope: 'all' },
        ],
      });
    expect(patch.status).toBe(200);

    const after = await request(h.app.getHttpServer())
      .get('/api/v1/org-units')
      .set('Authorization', `Bearer ${userToken}`);
    expect(after.status).toBe(200); // NGAY, cùng token
  });
});
