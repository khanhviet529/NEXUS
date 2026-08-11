import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * V12 — GET/PATCH /settings (lấp lỗ ma trận §2.5).
 * HYBRID §6.4: global là mặc định, dòng tenant là override và THẮNG khi merge;
 * ghi từ API LUÔN là dòng tenant (TC-1 §3C).
 */
describe('Settings (V12)', () => {
  let h: TestHarness;
  let adminA = '';
  let adminB = '';
  let staffA = '';

  const agent = () => request(h.app.getHttpServer());

  beforeAll(async () => {
    h = await createTestApp();
    adminA = await h.login('admin@tenant-a.local');
    adminB = await h.login('admin@tenant-b.local');
    staffA = await h.login('staff@tenant-a.local');

    // Mặc định GLOBAL (seed/sysadmin cấy thẳng — API không có đường này)
    await h.rawPrisma.setting.create({
      data: { tenantId: null, key: 'v12.theme', value: { color: 'mac-dinh' } },
    });
  });

  afterAll(async () => {
    await h.close();
  });

  it('chưa override → đọc thấy giá trị GLOBAL với scope=global', async () => {
    const res = await agent()
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${adminA}`);
    expect(res.status).toBe(200);
    const row = res.body.find((s: { key: string }) => s.key === 'v12.theme');
    expect(row.scope).toBe('global');
    expect(row.value.color).toBe('mac-dinh');
  });

  it('PATCH tạo override CỦA TENANT → merge ưu tiên tenant; dòng global KHÔNG bị sửa', async () => {
    const patch = await agent()
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ key: 'v12.theme', value: { color: 'xanh-tenant-a' } });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(patch.body.scope).toBe('tenant');

    const res = await agent()
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${adminA}`);
    const row = res.body.find((s: { key: string }) => s.key === 'v12.theme');
    expect(row.scope).toBe('tenant');
    expect(row.value.color).toBe('xanh-tenant-a');

    // Dòng global còn nguyên (TC-1: API không có đường ghi global)
    const globalRow = await h.rawPrisma.setting.findFirst({
      where: { key: 'v12.theme', tenantId: null },
    });
    expect((globalRow!.value as { color: string }).color).toBe('mac-dinh');
  });

  it('cách ly: override của tenant A KHÔNG rò sang tenant B — B vẫn thấy global', async () => {
    const res = await agent()
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${adminB}`);
    const row = res.body.find((s: { key: string }) => s.key === 'v12.theme');
    expect(row.scope).toBe('global');
    expect(row.value.color).toBe('mac-dinh');
  });

  it('STAFF: đọc bị chặn theo ma trận §2.5 (setting:read không có ở STAFF) → 403', async () => {
    const res = await agent()
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${staffA}`);
    expect(res.status).toBe(403);
  });

  it('audit: PATCH ghi cả app-level LẪN trigger DB (settings thuộc nhóm security-critical §4.9)', async () => {
    await agent()
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ key: 'v12.audit-probe', value: { n: 1 } });
    const [app, trigger] = await Promise.all([
      h.rawPrisma.auditLog.findFirst({
        where: { tenantId: h.seed.tenantA.tenantId, entity: 'Setting', action: 'UPDATE' },
        orderBy: { createdAt: 'desc' },
      }),
      h.rawPrisma.auditLog.findFirst({
        where: { tenantId: h.seed.tenantA.tenantId, entity: 'settings', action: 'DB_INSERT' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    expect(app).not.toBeNull();
    expect(trigger).not.toBeNull();
  });
});
