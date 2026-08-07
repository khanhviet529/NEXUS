import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { assertExhaustiveTenancyPolicy, assertExhaustiveSoftDeletePolicy } from '@nexus/shared';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * Test §8.2 #1 (tenant isolation) + #3a/#3c/#3d — fixture HAI TENANT (§8.3).
 * Chạy nhanh: pnpm test tenancy   (cookbook §12)
 */
describe('Tenancy — cách ly dữ liệu (§8.2 #1, #3)', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });

  // ---- #1: API level ----
  it('#1 GET /me bằng token tenant A chỉ trả dữ liệu tenant A', async () => {
    const token = await h.login('staff@tenant-a.local');
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tenant.code).toBe('TENANT-A');
    expect(res.body.email).toBe('staff@tenant-a.local');
    // permission của STAFF, không phải của vai trò khác
    expect(res.body.permissions).toContain('user:read');
    expect(res.body.permissions).not.toContain('role:create');
  });

  it('#1 cùng một user hai membership: token theo tenant nào chỉ thấy tenant đó', async () => {
    const tokenA = await h.login('dual@nexus.local', h.seed.tenantA.tenantId);
    const tokenB = await h.login('dual@nexus.local', h.seed.tenantB.tenantId);
    const [resA, resB] = await Promise.all([
      request(h.app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${tokenA}`),
      request(h.app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${tokenB}`),
    ]);
    expect(resA.body.tenant.code).toBe('TENANT-A');
    expect(resB.body.tenant.code).toBe('TENANT-B');
    expect(resA.body.membershipId).not.toBe(resB.body.membershipId);
  });

  // ---- #1: repository level — extension inject tenant vào MỌI query TENANT ----
  it('#1 extension: query TENANT model trong context A không trả dòng nào của B', async () => {
    const roles = await h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId }, () =>
      h.prisma.client.role.findMany(),
    );
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) expect(r.tenantId).toBe(h.seed.tenantA.tenantId);

    const memberships = await h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId }, () =>
      h.prisma.client.tenantMembership.findMany(),
    );
    for (const m of memberships) expect(m.tenantId).toBe(h.seed.tenantA.tenantId);
  });

  it('#1 fail-closed: query TENANT model KHÔNG có tenantId trong context → throw', async () => {
    await expect(
      h.ctx.runWith({}, () => h.prisma.client.role.findMany()),
    ).rejects.toThrow(/\[TENANCY\].*fail-closed/);
  });

  it('#1 create TENANT model mang tenantId lạ → bị từ chối ngay ở extension', async () => {
    await expect(
      h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId }, () =>
        h.prisma.client.role.create({
          data: {
            tenantId: h.seed.tenantB.tenantId, // cố cài tenant khác
            code: 'EVIL',
            name: 'Evil role',
          },
        }),
      ),
    ).rejects.toThrow(/\[TENANCY\].*khác tenant hiện hành/);
  });

  it('#1 update theo id của tenant khác → không thấy (extension ghi đè where)', async () => {
    const roleB = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantB.tenantId },
    });
    await expect(
      h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId }, () =>
        h.prisma.client.role.update({
          where: { id: roleB.id },
          data: { name: 'hacked' },
        }),
      ),
    ).rejects.toThrow(); // P2025 not found — không tiết lộ sự tồn tại (§4.10 IDOR)
    const untouched = await h.rawPrisma.role.findUniqueOrThrow({ where: { id: roleB.id } });
    expect(untouched.name).not.toBe('hacked');
  });

  // ---- #3a: nested create sinh child đúng tenant ----
  it('#3a nested create: invitation → invitation_roles nhận đúng tenant_id qua composite FK', async () => {
    const tenantId = h.seed.tenantA.tenantId;
    const role = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId, code: 'STAFF' },
    });
    const invitation = await h.ctx.runWith({ tenantId }, () =>
      h.prisma.client.invitation.create({
        data: {
          tenantId,
          email: 'newbie@tenant-a.local',
          tokenHash: `hash-${Date.now()}`,
          expiresAt: new Date(Date.now() + 86_400_000),
          // Child KHÔNG khai tenantId — composite FK relation truyền từ cha (§6.4)
          roles: { create: [{ roleId: role.id }] },
        },
        include: { roles: true },
      }),
    );
    expect(invitation.tenantId).toBe(tenantId);
    expect(invitation.roles).toHaveLength(1);
    expect(invitation.roles[0]?.tenantId).toBe(tenantId); // composite FK truyền tenant
  });

  // ---- #3c: vét cạn ----
  it('#3c model chưa phân loại tenancy → assert ném lỗi (app không khởi động được)', () => {
    expect(() => assertExhaustiveTenancyPolicy(['User', 'Tenant', 'ModelMoiQuenPhanLoai'])).toThrow(
      /CHƯA phân loại tenancy.*ModelMoiQuenPhanLoai/,
    );
    expect(() => assertExhaustiveSoftDeletePolicy(['User', 'Tenant', 'OrgUnit', 'Role', 'Session'])).toThrow(
      /chưa vào SOFT_DELETE_MODELS.*Session/,
    );
  });

  // ---- #3d: soft-delete extension không đụng model ngoài danh sách ----
  it('#3d model KHÔNG có SoftDeleteFields → extension không chèn deletedAt (query chạy được)', async () => {
    // Session không có deletedAt — nếu extension chèn bừa, Prisma ném validation error
    const sessions = await h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId }, () =>
      h.prisma.client.session.findMany({ take: 1 }),
    );
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('#3d model soft-delete: mặc định ẩn bản ghi đã xoá; sentinel {} thấy tất cả', async () => {
    const tenantId = h.seed.tenantA.tenantId;
    const role = await h.ctx.runWith({ tenantId }, () =>
      h.prisma.client.role.create({
        data: { tenantId, code: 'TMP_SD', name: 'Tạm', isSystem: false },
      }),
    );
    // Xoá mềm qua update (repository.softDelete làm việc này)
    await h.ctx.runWith({ tenantId }, () =>
      h.prisma.client.role.update({
        where: { id: role.id },
        data: { deletedAt: new Date() },
      }),
    );
    const visible = await h.ctx.runWith({ tenantId }, () =>
      h.prisma.client.role.findMany({ where: { code: 'TMP_SD' } }),
    );
    expect(visible).toHaveLength(0); // mặc định ẩn
    const all = await h.ctx.runWith({ tenantId }, () =>
      h.prisma.client.role.findMany({ where: { code: 'TMP_SD', deletedAt: {} } }),
    );
    expect(all).toHaveLength(1); // sentinel {} = tất cả
  });

  it('#3d hard delete trên model soft-delete bị chặn bởi extension', async () => {
    const tenantId = h.seed.tenantA.tenantId;
    await expect(
      h.ctx.runWith({ tenantId }, () =>
        h.prisma.client.role.delete({ where: { id: '00000000-0000-0000-0000-000000000000' } }),
      ),
    ).rejects.toThrow(/\[SOFT_DELETE\].*bị chặn/);
  });
});
