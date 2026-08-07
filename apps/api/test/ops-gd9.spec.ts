import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * GĐ9 — system operations §5C.8: health, queues, announcement, maintenance,
 * clear cache. /admin/* CHỈ SYSADMIN (CrossTenantGuard §3.1b) — TENANT_ADMIN 403.
 */
describe('GĐ9 — system operations (§5C.8)', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());
  let sysToken = '';
  let adminToken = '';
  let staffToken = '';

  beforeAll(async () => {
    h = await createTestApp();
    sysToken = await h.login('sysadmin@nexus.local');
    adminToken = await h.login('admin@tenant-a.local');
    staffToken = await h.login('staff@tenant-a.local');
  });
  afterAll(async () => {
    await h.close();
  });

  it('health: DB/Redis/S3 xanh + migration version; TENANT_ADMIN → 403', async () => {
    const res = await agent()
      .get('/api/v1/admin/ops/health')
      .set('Authorization', `Bearer ${sysToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.db).toBe(true);
    expect(res.body.redis).toBe(true);
    expect(res.body.s3).toBe(true);
    // Migration mới nhất — KHÔNG neo tên GĐ cụ thể (mỗi GĐ mới sẽ đổi)
    expect(res.body.migrationVersion).toMatch(/^\d{14}_/);

    const denied = await agent()
      .get('/api/v1/admin/ops/health')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(denied.status).toBe(403); // /admin/* chỉ SYSADMIN (§3.1b)
  });

  it('queues: đủ 4 queue từ JOB_NAMES kèm counts', async () => {
    const res = await agent()
      .get('/api/v1/admin/ops/queues')
      .set('Authorization', `Bearer ${sysToken}`);
    expect(res.status).toBe(200);
    for (const q of ['mail-send', 'outbox-dispatch', 'export-run', 'import-run']) {
      expect(res.body[q]).toMatchObject({
        waiting: expect.any(Number),
        failed: expect.any(Number),
      });
    }
  });

  it('announcement nhắm tenant: user tenant A thấy, tenant B KHÔNG thấy', async () => {
    const create = await agent()
      .post('/api/v1/admin/ops/announcements')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({
        title: 'Bảo trì cuối tuần',
        body: 'Hệ thống nâng cấp 22h thứ 7',
        severity: 'WARNING',
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        targetTenantIds: [h.seed.tenantA.tenantId],
      });
    expect(create.status, JSON.stringify(create.body)).toBe(201);

    const seenByA = await agent()
      .get('/api/v1/announcements/active')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(seenByA.status).toBe(200);
    expect(
      seenByA.body.announcements.map((a: { title: string }) => a.title),
    ).toContain('Bảo trì cuối tuần');

    const adminB = await h.login('admin@tenant-b.local');
    const seenByB = await agent()
      .get('/api/v1/announcements/active')
      .set('Authorization', `Bearer ${adminB}`);
    expect(
      seenByB.body.announcements.map((a: { title: string }) => a.title),
    ).not.toContain('Bảo trì cuối tuần');
  });

  it('maintenance window đang hiệu lực hiện ở /announcements/active', async () => {
    const create = await agent()
      .post('/api/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${sysToken}`)
      .send({
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        message: 'Đang bảo trì định kỳ',
      });
    expect(create.status).toBe(201);

    const res = await agent()
      .get('/api/v1/announcements/active')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.body.maintenance?.message).toBe('Đang bảo trì định kỳ');
  });

  it('clear cache theo tenant: key permission bị xoá, ghi audit', async () => {
    // Mồi cache: staff gọi 1 endpoint có permission → perm:<tenant>:<user> vào Redis
    await agent().get('/api/v1/users').set('Authorization', `Bearer ${staffToken}`);
    const res = await agent()
      .delete(`/api/v1/admin/ops/cache/${h.seed.tenantA.tenantId}`)
      .set('Authorization', `Bearer ${sysToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.cleared).toBeGreaterThanOrEqual(1);

    const audit = await h.rawPrisma.auditLog.findFirst({
      where: { action: 'CACHE_CLEARED', entityId: h.seed.tenantA.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});
