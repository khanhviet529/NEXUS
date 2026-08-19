import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * F10 (C1 lượt 2) — RolesService.create phải là MỘT transaction.
 *
 * Kịch bản gốc ở dogfood sourcing: POST /roles với danh sách quyền bị chặn
 * (luật §2.3) → role đã kịp INSERT nhưng quyền fail → ROLE MỒ CÔI 0 quyền;
 * POST lại cùng code đụng unique (tenant_id, code) → P2002 rơi ra 500.
 * Sau vá: fail ở đâu cũng rollback cả role; trùng code thật → 409 đọc được.
 */
describe('F10 — POST /roles transactional + P2002 → 409', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());
  let adminToken = '';

  const post = (body: Record<string, unknown>) =>
    agent().post('/api/v1/roles').set('Authorization', `Bearer ${adminToken}`).send(body);

  const countByCode = async (code: string) => {
    const res = await agent().get('/api/v1/roles').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    return (res.body as Array<{ code: string }>).filter((r) => r.code === code).length;
  };

  beforeAll(async () => {
    h = await createTestApp();
    adminToken = await h.login('admin@tenant-a.local');
  });
  afterAll(async () => {
    await h.close();
  });

  it('permission không tồn tại → 422 và KHÔNG để lại role mồ côi', async () => {
    const bad = await post({
      code: 'F10_TX',
      name: 'Thử tx',
      permissions: [{ permissionCode: 'khong:ton_tai', scope: 'all' }],
    });
    expect(bad.status, JSON.stringify(bad.body)).toBe(422);
    expect(await countByCode('F10_TX')).toBe(0); // không có xác role nằm lại

    // Trước vá: dòng dưới là P2002 → 500. Sau vá: tạo được bình thường.
    const ok = await post({
      code: 'F10_TX',
      name: 'Thử tx',
      permissions: [{ permissionCode: 'order:read', scope: 'all' }],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(await countByCode('F10_TX')).toBe(1);
  });

  it('luật §2.3 chặn (quyền mình không có) → 403 và KHÔNG để lại role mồ côi', async () => {
    const bad = await post({
      code: 'F10_TX2',
      name: 'Thử §2.3',
      // TENANT_ADMIN không có system:cross_tenant — đúng kịch bản sourcing
      permissions: [{ permissionCode: 'system:cross_tenant', scope: 'all' }],
    });
    expect(bad.status, JSON.stringify(bad.body)).toBe(403);
    expect(await countByCode('F10_TX2')).toBe(0);

    const ok = await post({
      code: 'F10_TX2',
      name: 'Thử §2.3',
      permissions: [{ permissionCode: 'order:read', scope: 'own' }],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });

  it('trùng code THẬT → 409 ROLE.CODE_EXISTS, không phải 500', async () => {
    const dup = await post({
      code: 'F10_TX', // đã tạo thành công ở test trên
      name: 'Trùng mã',
      permissions: [{ permissionCode: 'order:read', scope: 'all' }],
    });
    expect(dup.status, JSON.stringify(dup.body)).toBe(409);
    expect(dup.body.code).toBe('ROLE.CODE_EXISTS');
  });
});
