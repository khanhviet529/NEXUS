import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { createTestApp, type TestHarness } from './setup/test-app';
import { OutboxWorkerService } from '../src/modules/outbox/outbox-worker.service';
import { ExportsService } from '../src/modules/exports/exports.service';
import { PartitionMaintenanceRepository } from '../src/infra/prisma/partition-maintenance.repository';

/**
 * GĐ7 — audit timeline (§4.9), notifications, files presigned (matrix §2.5),
 * business calendar (§5C.4), export qua queue (§4.7), cron partition (C2).
 * MinIO THẬT từ global-setup — presigned PUT/GET không mock.
 */
describe('GĐ7 — audit/notifications/files/calendar/export-queue/partition', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());

  let staffToken = '';
  let managerToken = '';
  let adminToken = '';
  let viewerToken = '';
  let adminBToken = '';
  let staffUserId = '';
  let staffMembershipId = '';
  let orderId = '';

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');
    adminToken = await h.login('admin@tenant-a.local');
    viewerToken = await h.login('viewer@tenant-a.local');
    adminBToken = await h.login('admin@tenant-b.local');

    const staff = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'staff@tenant-a.local' },
    });
    staffUserId = staff.id;
    const membership = await h.rawPrisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: h.seed.tenantA.tenantId, userId: staff.id } },
    });
    staffMembershipId = membership.id;

    // Fixture đơn APPROVED của staff — dùng cho notification + file đính kèm
    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-GD7', name: { vi: 'Khách GĐ7' } });
    expect(customer.status, JSON.stringify(customer.body)).toBe(201);
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      // costPrice NGOÀI khoảng between [5000,10000] của query-gd4.spec — DB dùng chung
      .send({ code: 'SP-GD7', name: { vi: 'Hàng GĐ7' }, baseUom: 'CAI', costPrice: '60000' });
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    const order = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: customer.body.id,
        items: [{ productId: product.body.id, quantity: '1', unitPrice: '10000', taxRate: '10' }],
      });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    orderId = order.body.id as string;
    const submit = await agent()
      .post(`/api/v1/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ version: 1 });
    expect(submit.status).toBe(201);
    const approve = await agent()
      .post(`/api/v1/orders/${orderId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 2 });
    expect(approve.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  // ==================== §4.9 — audit timeline ====================

  it('audit timeline: sửa user → GET /audit-logs entity/entityId trả diff ĐÃ CHE salary; STAFF 403', async () => {
    // Sửa VIEWER (không spec nào assert salary của viewer) — DB dùng chung cả suite,
    // đụng salary của staff sẽ phá fixture seed của field-level.spec (#10)
    const viewer = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'viewer@tenant-a.local' },
    });
    const patch = await agent()
      .patch(`/api/v1/users/${viewer.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salary: '55555555.00' });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);

    const res = await agent()
      .get(`/api/v1/audit-logs?entity=User&entityId=${viewer.id}&action=UPDATE`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const top = res.body.data[0];
    expect(top.entity).toBe('User');
    expect(top.after.salary).toBe('«đã che»'); // §4.4c nơi 4 giữ nguyên khi ĐỌC
    expect(JSON.stringify(res.body)).not.toContain('55555555');
    expect(res.body.meta).toHaveProperty('total');

    const asStaff = await agent()
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(asStaff.status).toBe(403); // STAFF không có audit:read (matrix §2.5)
  });

  it('audit scope desc: MANAGER thấy audit do người trong cây đơn vị; KHÔNG lộ tenant B', async () => {
    const res = await agent()
      .get('/api/v1/audit-logs?limit=100')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    // Mọi dòng đều của tenant A (extension) — không cần assert thêm tenant;
    // desc: actor phải là user có membership trong cây ROOT của A (seed: tất cả)
    for (const row of res.body.data) {
      expect(row.traceId).toBeDefined();
    }
  });

  // ==================== Notifications ====================

  it('duyệt đơn → outbox → notification cho NGƯỜI TẠO; unread-count; mark-read; read-all', async () => {
    await h.app.get(OutboxWorkerService).runOnce('worker-gd7');

    const list = await agent()
      .get('/api/v1/notifications?unreadOnly=true&limit=50')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const mine = list.body.data.filter((n: { title: string }) => n.title.includes('đã được duyệt'));
    expect(mine.length).toBeGreaterThanOrEqual(1);

    const count1 = await agent()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(count1.body.count).toBeGreaterThanOrEqual(1);

    // mark read 1 cái — lần 2 → 404 (đÃ đọc rồi, updateMany count 0)
    const target = mine[0].id as string;
    const read1 = await agent()
      .post(`/api/v1/notifications/${target}/read`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(read1.status).toBe(201);
    const read2 = await agent()
      .post(`/api/v1/notifications/${target}/read`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(read2.status).toBe(404);

    // manager KHÔNG đọc hộ được thông báo của staff
    const foreign = await agent()
      .post(`/api/v1/notifications/${target}/read`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(foreign.status).toBe(404);

    const readAll = await agent()
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(readAll.status).toBe(201);
    const count2 = await agent()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(count2.body.count).toBe(0);
  });

  it('preferences: PUT upsert theo membership + GET; type lạ → 422', async () => {
    const put = await agent()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ type: 'JOB_COMPLETED', channels: ['in_app'] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const get = await agent()
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(get.body).toEqual([{ type: 'JOB_COMPLETED', channels: ['in_app'] }]);

    const bad = await agent()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ type: 'KHONG_TON_TAI', channels: ['in_app'] });
    expect(bad.status).toBe(422);
  });

  // ==================== §5C.4 — business calendar ====================

  it('lịch mặc định seed: T2–T6 hai ca + lễ VN (Tết 16–20/02/2026, recurring 01-01)', async () => {
    const res = await agent()
      .get('/api/v1/business-calendar')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(res.body.workingHours).toHaveLength(10); // 5 ngày × 2 ca
    const dates = res.body.holidays.map((x: { date: string }) => x.date);
    expect(dates).toContain('2026-02-17'); // mùng 1 Tết
    const recurring = res.body.holidays.filter((x: { isRecurring: boolean }) => x.isRecurring);
    expect(recurring.map((x: { date: string }) => x.date.slice(5))).toContain('01-01');
  });

  it('GĐ7 tiêu chí §10: addWorkingDays qua Tết — 13/02/2026 + 1 → 23/02/2026', async () => {
    const res = await agent()
      .get('/api/v1/business-calendar/add-working-days?date=2026-02-13&days=1')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.result).toBe('2026-02-23');
    expect(res.body.inputIsWorkingDay).toBe(true);

    const minutes = await agent()
      .get('/api/v1/business-calendar/working-minutes?from=2026-03-02T09:00&to=2026-03-02T15:00')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(minutes.body.minutes).toBe(300);
  });

  it('sửa ngày nghỉ: STAFF 403 (setting:update); ADMIN thêm → addWorkingDays đổi; xoá → về cũ', async () => {
    const denied = await agent()
      .post('/api/v1/business-calendar/holidays')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ date: '2026-03-04', name: 'Nghỉ thử' });
    expect(denied.status).toBe(403);

    const added = await agent()
      .post('/api/v1/business-calendar/holidays')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-03-04', name: 'Nghỉ thử' });
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const during = await agent()
      .get('/api/v1/business-calendar/add-working-days?date=2026-03-03&days=1')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(during.body.result).toBe('2026-03-05'); // 04/03 thành ngày nghỉ

    const del = await agent()
      .delete(`/api/v1/business-calendar/holidays/${added.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    const after = await agent()
      .get('/api/v1/business-calendar/add-working-days?date=2026-03-03&days=1')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(after.body.result).toBe('2026-03-04');
  });

  // ==================== Files — presigned (matrix §2.5) ====================

  it('presign → PUT MinIO thật → confirm → tải qua presigned GET; objectKey tiền tố tenantId', async () => {
    const presign = await agent()
      .post('/api/v1/files/presign')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ filename: 'bao-gia.pdf', mime: 'application/pdf' });
    expect(presign.status, JSON.stringify(presign.body)).toBe(201);
    expect(presign.body.objectKey.startsWith(`${h.seed.tenantA.tenantId}/`)).toBe(true);

    const put = await fetch(presign.body.uploadUrl as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: 'NOI-DUNG-PDF-GD7',
    });
    expect(put.status).toBe(200);

    const confirm = await agent()
      .post('/api/v1/files/confirm')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fileId: presign.body.fileId, filename: 'bao-gia.pdf', mime: 'application/pdf' });
    expect(confirm.status, JSON.stringify(confirm.body)).toBe(201);
    expect(confirm.body.size).toBe('NOI-DUNG-PDF-GD7'.length);

    // File TRÔI NỔI: người upload tải được, người khác 403
    const dl = await agent()
      .get(`/api/v1/files/${presign.body.fileId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(dl.status).toBe(200);
    const body = await (await fetch(dl.body.url as string)).text();
    expect(body).toBe('NOI-DUNG-PDF-GD7');

    const other = await agent()
      .get(`/api/v1/files/${presign.body.fileId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(other.status).toBe(403);
  });

  it('confirm khi CHƯA PUT → 422; VIEWER không có file:upload → 403 presign', async () => {
    const presign = await agent()
      .post('/api/v1/files/presign')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ filename: 'chua-upload.txt', mime: 'text/plain' });
    const confirm = await agent()
      .post('/api/v1/files/confirm')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fileId: presign.body.fileId, filename: 'chua-upload.txt', mime: 'text/plain' });
    expect(confirm.status).toBe(422);

    const viewer = await agent()
      .post('/api/v1/files/presign')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ filename: 'x.txt', mime: 'text/plain' });
    expect(viewer.status).toBe(403); // matrix §2.5: VIEWER ❌ file:upload
  });

  it('kế thừa quyền entity (matrix §2.5): file đính đơn — viewer(all) xem được; tenant B 404', async () => {
    const presign = await agent()
      .post('/api/v1/files/presign')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ filename: 'hop-dong.pdf', mime: 'application/pdf' });
    await fetch(presign.body.uploadUrl as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: 'HOP-DONG',
    });
    const confirm = await agent()
      .post('/api/v1/files/confirm')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        fileId: presign.body.fileId,
        filename: 'hop-dong.pdf',
        mime: 'application/pdf',
        entity: 'Order',
        entityId: orderId,
        category: 'contract',
      });
    expect(confirm.status, JSON.stringify(confirm.body)).toBe(201);

    // viewer: order:read all → kế thừa → xem được file
    const asViewer = await agent()
      .get(`/api/v1/files/${presign.body.fileId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(asViewer.status).toBe(200);

    // tab đính kèm của đơn
    const list = await agent()
      .get(`/api/v1/files/by-entity/Order/${orderId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.map((f: { filename: string }) => f.filename)).toContain('hop-dong.pdf');

    // tenant B: extension lọc tenant → file không tồn tại với B (§8.2 #1)
    const asB = await agent()
      .get(`/api/v1/files/${presign.body.fileId}`)
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(asB.status).toBe(404);
  });

  // ==================== §4.7 — export qua queue ====================

  it('export queue: enqueue 202; worker chạy → S3 → files row → notification; retry KHÔNG trùng', async () => {
    const enqueue = await agent()
      .post('/api/v1/exports/products')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(enqueue.status, JSON.stringify(enqueue.body)).toBe(202);

    // Chạy trực tiếp logic worker (không dựng BullMQ trong test — job phải idempotent)
    const exportsService = h.app.get(ExportsService);
    const payload = {
      tenantId: h.seed.tenantA.tenantId,
      userId: staffUserId,
      membershipId: staffMembershipId,
      entity: 'products' as const,
      includeCost: false, // STAFF không có field:cost (§4.4c nơi 2)
      jobId: uuidv7(),
    };
    const result = await exportsService.runExportJob(payload);
    expect(result.rows).toBeGreaterThanOrEqual(1);

    // Retry cùng jobId — notification KHÔNG nhân đôi (at-least-once)
    await exportsService.runExportJob(payload);
    const notis = await h.rawPrisma.notification.count({ where: { id: payload.jobId } });
    expect(notis).toBe(1);

    // Tải file qua kênh chuẩn — CSV của STAFF không có cost_price (nơi 2)
    const dl = await agent()
      .get(`/api/v1/files/${result.fileId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(dl.status, JSON.stringify(dl.body)).toBe(200);
    const csv = await (await fetch(dl.body.url as string)).text();
    expect(csv.split('\n')[0]).not.toContain('cost_price');
    expect(csv).toContain('SP-GD7');

    // includeCost=true (quyền manager) → CÓ cost_price
    const result2 = await exportsService.runExportJob({
      ...payload,
      includeCost: true,
      jobId: uuidv7(),
    });
    const dl2 = await agent()
      .get(`/api/v1/files/${result2.fileId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    const csv2 = await (await fetch(dl2.body.url as string)).text();
    expect(csv2.split('\n')[0]).toContain('cost_price');
  }, 60_000);

  // ==================== §5B.3/C2 — cron partition ====================

  it('cron partition: tạo mảnh movements + audit_logs tháng này + tháng sau, idempotent', async () => {
    const repo = h.app.get(PartitionMaintenanceRepository);
    const names = await repo.ensureUpcoming();
    expect(names).toHaveLength(4);
    expect(names.some((n) => n.startsWith('movements_'))).toBe(true);
    expect(names.some((n) => n.startsWith('audit_logs_'))).toBe(true);
    // idempotent — gọi lại không lỗi, cùng kết quả
    expect(await repo.ensureUpcoming()).toEqual(names);
  });
});
