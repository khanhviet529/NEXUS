import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestHarness } from './setup/test-app';
import { OutboxWorkerService } from '../src/modules/outbox/outbox-worker.service';
import { OutboxRepository } from '../src/modules/outbox/outbox.repository';
import { OrdersService } from '../src/modules/orders/orders.service';
import { RedisService } from '../src/infra/redis/redis.service';

/**
 * Test §8.2 GĐ5: #15 delete guard, #17 optimistic locking,
 * #18/#19a-c idempotency 3 lớp, #20a-e outbox.
 * Concurrency chạy SONG SONG THẬT bằng Promise.all (§8.3).
 */
describe('GĐ5 — Orders [REF] (§8.2 #15, #17, #18, #19, #20)', () => {
  let h: TestHarness;
  let staffToken = '';
  let managerToken = '';
  let customerId = '';
  let productId = '';

  const agent = () => request(h.app.getHttpServer());

  const createOrder = async (token: string, idempotencyKey?: string) => {
    let req = agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);
    if (idempotencyKey) req = req.set('Idempotency-Key', idempotencyKey);
    return req.send({
      customerId,
      items: [
        { productId, quantity: '2', unitPrice: '100000', taxRate: '10' },
        { productId, quantity: '1', unitPrice: '50000', discountPercent: '10', taxRate: '8' },
      ],
    });
  };

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');

    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-GD5', name: { vi: 'Khách GĐ5' } });
    expect(customer.status, JSON.stringify(customer.body)).toBe(201);
    customerId = customer.body.id;

    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-GD5', name: { vi: 'Hàng GĐ5' }, baseUom: 'CAI', costPrice: '60000' });
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    productId = product.body.id;
  });

  afterAll(async () => {
    await h.close();
  });

  // ==================== Nghiệp vụ + đánh số + tính tiền ====================

  it('tạo đơn: mã ORD-YYYY-NNNNN, tiền là CHUỖI, bộ tính tiền B1 áp đúng', async () => {
    const res = await createOrder(staffToken);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.code).toMatch(/^ORD-\d{4}-\d{5}$/);
    // dòng 1: 200.000 + 10% VAT = 220.000 · dòng 2: 45.000 + 8% = 48.600
    expect(res.body.total).toBe('268600');
    expect(res.body.items[0].productNameSnapshot).toBe('Hàng GĐ5'); // chốt tên (§3.10)
    expect(res.body.status).toBe('DRAFT');
    // STAFF không có field:cost → không thấy margin/costPrice
    expect(res.body).not.toHaveProperty('margin');
    expect(res.body.items[0]).not.toHaveProperty('costPrice');
  });

  it('mã chứng từ tăng liên tục, không nhảy cóc (§4.7)', async () => {
    const [a, b] = [await createOrder(staffToken), await createOrder(staffToken)];
    const seq = (r: { body: { code: string } }) => Number(r.body.code.split('-')[2]);
    expect(seq(b)).toBe(seq(a) + 1);
  });

  it('máy trạng thái: submit → approve; approve đơn DRAFT → 409 INVALID_TRANSITION', async () => {
    const order = await createOrder(staffToken);
    const id = order.body.id as string;

    // approve khi DRAFT → 409
    const early = await agent()
      .post(`/api/v1/orders/${id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 1 });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('ORDER.INVALID_TRANSITION');

    const submit = await agent()
      .post(`/api/v1/orders/${id}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ version: 1 });
    expect(submit.status, JSON.stringify(submit.body)).toBe(201);
    expect(submit.body.status).toBe('PENDING');

    const approve = await agent()
      .post(`/api/v1/orders/${id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 2 });
    expect(approve.status).toBe(201);
    expect(approve.body.status).toBe('APPROVED');

    // sửa đơn đã duyệt → 409 ALREADY_APPROVED
    const editApproved = await agent()
      .patch(`/api/v1/orders/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 3, items: [{ productId, quantity: '1', unitPrice: '1' }] });
    expect(editApproved.status).toBe(409);
    expect(editApproved.body.code).toBe('ORDER.ALREADY_APPROVED');
  });

  it('KHÔNG TỰ DUYỆT đơn mình tạo → 409 ORDER.SELF_APPROVAL (ma trận §3.1)', async () => {
    const order = await createOrder(managerToken); // manager tự tạo
    await agent()
      .post(`/api/v1/orders/${order.body.id}/submit`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 1 });
    const res = await agent()
      .post(`/api/v1/orders/${order.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER.SELF_APPROVAL');
  });

  it('scope own: STAFF không thấy đơn của manager → 404, không lộ (§4.10)', async () => {
    const order = await createOrder(managerToken);
    const res = await agent()
      .get(`/api/v1/orders/${order.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });

  // ==================== #17 — optimistic locking ====================

  it('#17 hai PATCH song song cùng version → một thành công, một 409', async () => {
    const order = await createOrder(staffToken);
    const id = order.body.id as string;
    const patch = () =>
      agent()
        .patch(`/api/v1/orders/${id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ version: 1, items: [{ productId, quantity: '9', unitPrice: '1000' }] });

    const [r1, r2] = await Promise.all([patch(), patch()]); // song song THẬT
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = r1.status === 409 ? r1 : r2;
    expect(conflict.body.code).toBe('COMMON.VERSION_CONFLICT');
  });

  // ==================== #15 — delete guard A2 ====================

  it('#15 xoá product đang được order tham chiếu → 409 kèm danh sách nguồn có link', async () => {
    const adminToken = await h.login('admin@tenant-a.local'); // MANAGER không có product:delete
    const res = await agent()
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COMMON.HAS_REFERENCES');
    const refs = res.body.details.references as Array<{ label: string; count: number; link: string }>;
    expect(refs[0]!.label).toBe('Chi tiết đơn hàng');
    expect(refs[0]!.count).toBeGreaterThan(0);
    expect(refs[0]!.link).toContain('/orders');
  });

  // ==================== #18/#19 — idempotency 3 lớp ====================

  it('#18 20 request SONG SONG cùng Idempotency-Key → đúng MỘT đơn được tạo', async () => {
    const key = randomUUID();
    const before = await h.rawPrisma.order.count({
      where: { tenantId: h.seed.tenantA.tenantId },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => createOrder(staffToken, key)),
    );
    const created = results.filter((r) => r.status === 201);
    const inProgress = results.filter((r) => r.status === 409);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(created.length + inProgress.length).toBe(20);
    // Tất cả 201 phải trả CÙNG một đơn (replay)
    const codes = new Set(created.map((r) => r.body.code));
    expect(codes.size).toBe(1);

    const after = await h.rawPrisma.order.count({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    expect(after - before).toBe(1); // đúng MỘT resource

    // Gọi lại tuần tự cùng key + cùng body → replay nguyên response
    const replay = await createOrder(staffToken, key);
    expect(replay.status).toBe(201);
    expect(replay.body.code).toBe([...codes][0]);
  });

  it('#19a flush Redis rồi retry → vẫn không tạo trùng (lớp DB làm việc)', async () => {
    const key = randomUUID();
    const first = await createOrder(staffToken, key);
    expect(first.status).toBe(201);

    // Mất TOÀN BỘ Redis — lớp 1 chết, session cũng bay (đúng kịch bản sự cố)
    await h.app.get(RedisService).client.flushall();

    // User đăng nhập lại rồi RETRY request cũ với key cũ
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');

    const retry = await createOrder(staffToken, key);
    expect(retry.status).toBe(201);
    expect(retry.body.code).toBe(first.body.code); // replay từ DB, không tạo mới
    const count = await h.rawPrisma.order.count({ where: { code: first.body.code } });
    expect(count).toBe(1);
  });

  it('#19b cùng key nhưng BODY KHÁC → 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const key = randomUUID();
    await createOrder(staffToken, key);
    const different = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId,
        items: [{ productId, quantity: '999', unitPrice: '1' }], // nội dung KHÁC
      });
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('COMMON.IDEMPOTENCY_KEY_REUSED');
  });

  it('#19c row đang PROCESSING (CÙNG hash) → 409 IDEMPOTENCY_IN_PROGRESS + Retry-After', async () => {
    const key = randomUUID();
    const body = { customerId, items: [{ productId, quantity: '1', unitPrice: '1' }] };
    // Cài row PROCESSING với hash THẬT của body (mô phỏng request đang chạy)
    const { IdempotencyService } = await import('../src/modules/idempotency/idempotency.service');
    await h.rawPrisma.idempotencyRequest.create({
      data: {
        tenantId: h.seed.tenantA.tenantId,
        key,
        operation: 'order:create',
        requestHash: IdempotencyService.hashRequest(body),
        status: 'PROCESSING',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COMMON.IDEMPOTENCY_IN_PROGRESS');
  });

  // ==================== #20 — outbox ====================

  async function approveNewOrder(): Promise<{ orderId: string; eventCount: number }> {
    const order = await createOrder(staffToken);
    const id = order.body.id as string;
    await agent()
      .post(`/api/v1/orders/${id}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ version: 1 });
    const approve = await agent()
      .post(`/api/v1/orders/${id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 2 });
    expect(approve.status).toBe(201);
    const events = await h.rawPrisma.outboxEvent.count({
      where: { aggregateId: id, eventType: 'ORDER_APPROVED' },
    });
    return { orderId: id, eventCount: events };
  }

  it('#20a approve ghi outbox TRONG transaction; worker xử lý → notification + DONE', async () => {
    const { orderId, eventCount } = await approveNewOrder();
    expect(eventCount).toBe(1); // event đã commit cùng transaction

    const worker = h.app.get(OutboxWorkerService);
    const result = await worker.runOnce('worker-test-1');
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const event = await h.rawPrisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: orderId, eventType: 'ORDER_APPROVED' },
    });
    expect(event.status).toBe('DONE');
    // Consumer đã tạo notification với id = eventId
    const notification = await h.rawPrisma.notification.findUnique({
      where: { id: event.id },
    });
    expect(notification).not.toBeNull();
  });

  it('#20e hai worker song song không claim trùng; worker chết → PENDING sau lease', async () => {
    // Tạo 6 event PENDING
    for (let i = 0; i < 3; i++) await approveNewOrder();
    const repo = h.app.get(OutboxRepository);

    const [batch1, batch2] = await Promise.all([
      repo.claimBatch('worker-A', 100),
      repo.claimBatch('worker-B', 100),
    ]);
    const ids1 = new Set(batch1.map((e) => e.id));
    for (const e of batch2) expect(ids1.has(e.id)).toBe(false); // KHÔNG trùng

    // Worker chết: locked_at quá lease → requeueStale trả về PENDING
    await h.rawPrisma.outboxEvent.updateMany({
      where: { status: 'PROCESSING' },
      data: { lockedAt: new Date(Date.now() - 10 * 60_000) }, // 10 phút trước
    });
    const requeued = await repo.requeueStale(5);
    expect(requeued).toBeGreaterThanOrEqual(batch1.length + batch2.length);

    // Dọn: xử lý hết
    await h.app.get(OutboxWorkerService).runOnce('worker-cleanup');
  });

  it('#20b transaction nghiệp vụ ROLLBACK → event KHÔNG được phát', async () => {
    const order = await createOrder(staffToken);
    const id = order.body.id as string;
    await agent()
      .post(`/api/v1/orders/${id}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ version: 1 });

    // Gọi thẳng service với cờ test: ném lỗi SAU khi ghi outbox → rollback cả hai
    const ordersService = h.app.get(OrdersService);
    const manager = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'manager@tenant-a.local' },
    });
    const membership = await h.rawPrisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, userId: manager.id },
    });
    const managerAuth = {
      sub: manager.id,
      tenantId: h.seed.tenantA.tenantId,
      membershipId: membership.id,
      sessionId: 'test',
      orgUnitId: membership.orgUnitId ?? undefined,
    };
    await expect(
      h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId, userId: manager.id }, () =>
        ordersService.approve(managerAuth, id, 2, { failAfterOutboxForTest: true }),
      ),
    ).rejects.toThrow('TEST_ROLLBACK_AFTER_OUTBOX');

    // Event KHÔNG tồn tại (đã rollback cùng transaction)
    const events = await h.rawPrisma.outboxEvent.count({
      where: { aggregateId: id, eventType: 'ORDER_APPROVED' },
    });
    expect(events).toBe(0);
    // Trạng thái đơn cũng không đổi
    const row = await h.rawPrisma.order.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('PENDING');
  });

  it('#20c consumer xử lý CÙNG event hai lần → notification không nhân đôi', async () => {
    const { orderId } = await approveNewOrder();
    const worker = h.app.get(OutboxWorkerService);
    await worker.runOnce('worker-c1');

    const event = await h.rawPrisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: orderId, eventType: 'ORDER_APPROVED' },
    });
    // Mô phỏng at-least-once: đưa event ĐÃ XỬ LÝ về PENDING rồi chạy lại
    await h.rawPrisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PENDING', processedAt: null, lockedAt: null, lockedBy: null },
    });
    const second = await worker.runOnce('worker-c2');
    expect(second.failed).toBe(0); // P2002 được nuốt êm, không lỗi

    const notifications = await h.rawPrisma.notification.count({
      where: { id: event.id },
    });
    expect(notifications).toBe(1); // KHÔNG nhân đôi (#20c)
  });
});
