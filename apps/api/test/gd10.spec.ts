import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { createTestApp, type TestHarness } from './setup/test-app';
import { OutboxWorkerService } from '../src/modules/outbox/outbox-worker.service';
import { WebhooksRepository } from '../src/modules/webhooks/webhooks.repository';

/**
 * GĐ10 — hạn mức duyệt fail-closed (§5C.12, §12 #62), webhook qua outbox
 * (§5C.5: HMAC + rotation + dedup + retry + tự tắt + replay), recent/favorites
 * (§5C.2/§5C.7). Webhook nhận bằng HTTP server THẬT trong test.
 */
describe('GĐ10 — approval authorities + webhooks + personalization', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());
  let staffToken = '';
  let managerToken = '';
  let adminToken = '';
  let customerId = '';
  let productId = '';

  const makeOrder = async (unitPrice: string) => {
    const order = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: '1', unitPrice, taxRate: '0' }],
      });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    const submit = await agent()
      .post(`/api/v1/orders/${order.body.id}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ version: 1 });
    expect(submit.status).toBe(201);
    return order.body as { id: string; code: string };
  };

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');
    adminToken = await h.login('admin@tenant-a.local');

    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-GD10', name: { vi: 'Khách GĐ10' } });
    customerId = customer.body.id;
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-GD10', name: { vi: 'Hàng GĐ10' }, baseUom: 'CAI', costPrice: '999999' });
    productId = product.body.id;
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  // ==================== §5C.12 — hạn mức duyệt ====================

  it('seed: MANAGER duyệt không giới hạn (matrix §3.1 không vỡ luồng cũ)', async () => {
    const order = await makeOrder('50000000');
    const approve = await agent()
      .post(`/api/v1/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 2 });
    expect(approve.status, JSON.stringify(approve.body)).toBe(201);
  });

  it('FAIL-CLOSED: membership-limit CỤ THỂ đè role-unlimited → vượt hạn mức 409 EXCEEDS_LIMIT', async () => {
    // Gắn hạn mức RIÊNG cho manager: chỉ tới 10 triệu (cụ thể thắng chung §5C.12)
    const manager = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'manager@tenant-a.local' },
    });
    const membership = await h.rawPrisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: h.seed.tenantA.tenantId, userId: manager.id } },
    });
    const created = await agent()
      .post('/api/v1/approval-authorities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        documentType: 'ORDER',
        membershipId: membership.id,
        minAmount: '0',
        maxAmount: '10000000',
        effectiveFrom: '2020-01-01',
        priority: 10,
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    try {
      const bigOrder = await makeOrder('20000000'); // 20tr > hạn mức riêng 10tr
      const denied = await agent()
        .post(`/api/v1/orders/${bigOrder.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ version: 2 });
      expect(denied.status).toBe(409);
      expect(denied.body.code).toBe('ORDER.EXCEEDS_LIMIT');

      const smallOrder = await makeOrder('5000000'); // trong hạn mức riêng
      const ok = await agent()
        .post(`/api/v1/orders/${smallOrder.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ version: 2 });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);

      // ADMIN vẫn theo role-unlimited → duyệt được đơn to
      const bigOrder2 = await makeOrder('900000000');
      const adminOk = await agent()
        .post(`/api/v1/orders/${bigOrder2.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ version: 2 });
      expect(adminOk.status).toBe(201);
    } finally {
      // Trả trạng thái: xoá hạn mức riêng để không ảnh hưởng spec khác (DB chung)
      await agent()
        .delete(`/api/v1/approval-authorities/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  it('check endpoint (§5C.12): ai đủ thẩm quyền duyệt 500tr; STAFF không quyền manage → 403', async () => {
    const res = await agent()
      .get('/api/v1/approval-authorities/check?documentType=ORDER&amount=500000000')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const emails = res.body.map((r: { email: string }) => r.email);
    expect(emails).toContain('manager@tenant-a.local'); // role MANAGER unlimited
    expect(emails).toContain('admin@tenant-a.local');
    expect(emails).not.toContain('staff@tenant-a.local');

    const denied = await agent()
      .post('/api/v1/approval-authorities')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ documentType: 'ORDER', minAmount: '0', effectiveFrom: '2020-01-01' });
    expect(denied.status).toBe(403);
  });

  // ==================== §5C.5 — webhook qua outbox ====================

  it('webhook: đăng ký → duyệt đơn → outbox fan-out → nhận HMAC hợp lệ; dedup; rotation 2 chữ ký', async () => {
    // HTTP server THẬT nhận webhook
    const received: Array<{ body: string; signature: string; eventId: string }> = [];
    const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        received.push({
          body,
          signature: String(req.headers['x-nexus-signature']),
          eventId: String(req.headers['x-nexus-event-id']),
        });
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;

    try {
      const endpoint = await agent()
        .post('/api/v1/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: `http://127.0.0.1:${port}/hooks` });
      expect(endpoint.status, JSON.stringify(endpoint.body)).toBe(201);
      const secret = endpoint.body.secret as string;
      expect(secret).toMatch(/^whsec_/);

      const sub = await agent()
        .post(`/api/v1/webhooks/endpoints/${endpoint.body.id}/subscriptions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventType: 'ORDER_APPROVED' });
      expect(sub.status).toBe(201);

      // GET endpoints KHÔNG lộ secret (§4.11)
      const list = await agent()
        .get('/api/v1/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(JSON.stringify(list.body)).not.toContain(secret);

      // Duyệt một đơn → outbox event ORDER_APPROVED
      // R1: MỌI bước trung gian đều assert — Nest Logger bị nuốt trong test,
      // nên bước nào hụt mà không assert là hụt CÂM (bài học gốc #4)
      const order = await makeOrder('1000000');
      const approve1 = await agent()
        .post(`/api/v1/orders/${order.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ version: 2 });
      expect(approve1.status, JSON.stringify(approve1.body)).toBe(201);

      const outbox = h.app.get(OutboxWorkerService);
      const ob1 = await outbox.runOnce('worker-gd10'); // fan-out tạo delivery
      expect(ob1.failed, `runOnce lần 1 có event lỗi: ${JSON.stringify(ob1)}`).toBe(0);
      expect(ob1.processed).toBeGreaterThanOrEqual(1);
      const ob1b = await outbox.runOnce('worker-gd10'); // at-least-once: chạy lại KHÔNG tạo trùng
      expect(ob1b.failed, `runOnce lần 2 có event lỗi: ${JSON.stringify(ob1b)}`).toBe(0);

      const webhooks = h.app.get(WebhooksRepository);
      const result = await webhooks.deliverDue();
      expect(result.sent).toBeGreaterThanOrEqual(1);

      // Nhận đúng MỘT lần dù outbox chạy 2 vòng (dedup UNIQUE)
      const mine = received.filter((r) => r.body.includes(order.id));
      expect(mine).toHaveLength(1);

      // Chữ ký HMAC đúng: v1 = hmac(secret, `${t}.${body}`)
      const sig = mine[0]!.signature;
      const t = /t=(\d+)/.exec(sig)![1]!;
      const v1 = /v1=([a-f0-9]+)/.exec(sig)![1]!;
      const expected = createHmac('sha256', secret).update(`${t}.${mine[0]!.body}`).digest('hex');
      expect(v1).toBe(expected);

      // Rotation: secret mới + chữ ký kèm v1prev từ secret cũ
      const rotated = await agent()
        .post(`/api/v1/webhooks/endpoints/${endpoint.body.id}/rotate-secret`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(rotated.body.secret).toMatch(/^whsec_/);
      expect(rotated.body.secret).not.toBe(secret);

      const order2 = await makeOrder('1200000');
      const approve2 = await agent()
        .post(`/api/v1/orders/${order2.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ version: 2 });
      expect(approve2.status, JSON.stringify(approve2.body)).toBe(201);
      const ob2 = await outbox.runOnce('worker-gd10');
      expect(ob2.failed, `runOnce order2 có event lỗi: ${JSON.stringify(ob2)}`).toBe(0);
      if (ob2.processed < 1) {
        // AUTOPSY gốc #4: claim 0 dù approve 201 đã commit — dump thẳng trạng
        // thái hàng đợi để lần đỏ kế tiếp mang đủ dữ liệu kết luận
        const rows = await h.rawPrisma.$queryRaw`
          SELECT id, status, attempts, available_at, locked_by, locked_at, now() AS db_now
          FROM outbox_events WHERE aggregate_id = ${order2.id}::uuid`;
        expect.fail(
          `runOnce order2 claim 0. app_now=${new Date().toISOString()} rows=${JSON.stringify(rows)}`,
        );
      }
      const dd2 = await webhooks.deliverDue();
      expect(dd2.sent, `deliverDue order2 không gửi gì: ${JSON.stringify(dd2)}`).toBeGreaterThanOrEqual(1);
      const second = received.filter((r) => r.body.includes(order2.id));
      expect(second).toHaveLength(1);
      expect(second[0]!.signature).toContain('v1prev='); // HAI secret cùng hiệu lực
      const t2 = /t=(\d+)/.exec(second[0]!.signature)![1]!;
      const v1prev = /v1prev=([a-f0-9]+)/.exec(second[0]!.signature)![1]!;
      expect(v1prev).toBe(
        createHmac('sha256', secret).update(`${t2}.${second[0]!.body}`).digest('hex'),
      );
    } finally {
      server.close();
    }
  }, 60_000);

  it('webhook retry + replay: endpoint 500 → attempts tăng + backoff; replay đưa về PENDING', async () => {
    let failCount = 0;
    const server: Server = createServer((_req, res) => {
      failCount++;
      res.writeHead(500).end('boom');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;

    try {
      const endpoint = await agent()
        .post('/api/v1/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: `http://127.0.0.1:${port}/hooks` });
      expect(endpoint.status, JSON.stringify(endpoint.body)).toBe(201);
      const sub2 = await agent()
        .post(`/api/v1/webhooks/endpoints/${endpoint.body.id}/subscriptions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventType: 'ORDER_APPROVED' });
      expect(sub2.status, JSON.stringify(sub2.body)).toBe(201);

      const order = await makeOrder('1500000');
      const approve = await agent()
        .post(`/api/v1/orders/${order.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ version: 2 });
      expect(approve.status, JSON.stringify(approve.body)).toBe(201);
      const outbox = h.app.get(OutboxWorkerService);
      const ob = await outbox.runOnce('worker-gd10b');
      expect(ob.failed, `runOnce có event lỗi: ${JSON.stringify(ob)}`).toBe(0);
      if (ob.processed < 1) {
        const rows = await h.rawPrisma.$queryRaw`
          SELECT id, status, attempts, available_at, locked_by, locked_at, now() AS db_now
          FROM outbox_events WHERE aggregate_id = ${order.id}::uuid`;
        expect.fail(
          `runOnce claim 0. app_now=${new Date().toISOString()} rows=${JSON.stringify(rows)}`,
        );
      }
      const webhooks = h.app.get(WebhooksRepository);
      const dd = await webhooks.deliverDue();
      expect(dd.sent + dd.failed, `deliverDue không đụng delivery nào: ${JSON.stringify(dd)}`).toBeGreaterThanOrEqual(1);

      const deliveries = await agent()
        .get(`/api/v1/webhooks/deliveries?endpointId=${endpoint.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const row = deliveries.body.find((d: { eventType: string }) => d.eventType === 'ORDER_APPROVED');
      // Gốc #4 từng chết CÂM ở đây (row undefined) — dump body để lần sau đỏ là thấy dữ liệu
      expect(row, `không có delivery ORDER_APPROVED cho endpoint: ${JSON.stringify(deliveries.body)}`).toBeDefined();
      expect(row.status).toBe('PENDING'); // chưa cạn attempts
      expect(row.attempts).toBe(1);
      expect(row.responseStatus).toBe(500);
      expect(row.nextRetryAt).not.toBeNull(); // exponential backoff

      // Chưa tới hạn retry → deliverDue KHÔNG gửi lại
      await webhooks.deliverDue();
      expect(failCount).toBe(1);

      // Replay thủ công → gửi lại NGAY
      const replay = await agent()
        .post(`/api/v1/webhooks/deliveries/${row.id}/replay`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(replay.status).toBe(201);
      await webhooks.deliverDue();
      expect(failCount).toBe(2);
    } finally {
      server.close();
    }
  }, 60_000);

  // ==================== §5C.2/§5C.7 — recent/favorites ====================

  it('recent: PUT chạm 2 lần → 1 dòng viewedAt mới; favorites: ghim/bỏ ghim; own tuyệt đối', async () => {
    const touch1 = await agent()
      .put('/api/v1/recent-items')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ entity: 'Customer', entityId: customerId });
    expect(touch1.status, JSON.stringify(touch1.body)).toBe(200);
    await agent()
      .put('/api/v1/recent-items')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ entity: 'Customer', entityId: customerId });

    const recent = await agent()
      .get('/api/v1/recent-items')
      .set('Authorization', `Bearer ${staffToken}`);
    const mine = recent.body.filter((r: { entityId: string }) => r.entityId === customerId);
    expect(mine).toHaveLength(1); // upsert, không nhân đôi

    // Manager KHÔNG thấy recent của staff (own theo membership)
    const managerRecent = await agent()
      .get('/api/v1/recent-items')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(
      managerRecent.body.filter((r: { entityId: string }) => r.entityId === customerId),
    ).toHaveLength(0);

    const fav = await agent()
      .put('/api/v1/favorite-items')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ entity: 'Customer', entityId: customerId, label: 'Khách ruột' });
    expect(fav.status).toBe(200);
    const favs = await agent()
      .get('/api/v1/favorite-items')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(favs.body.map((f: { label: string }) => f.label)).toContain('Khách ruột');

    const del = await agent()
      .delete(`/api/v1/favorite-items/Customer/${customerId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(del.status).toBe(200);
    const after = await agent()
      .get('/api/v1/favorite-items')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(
      after.body.filter((f: { entityId: string }) => f.entityId === customerId),
    ).toHaveLength(0);

    // entity lạ → 422 (whitelist ENTITY_TYPES)
    const bad = await agent()
      .put('/api/v1/recent-items')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ entity: 'BangLuong', entityId: customerId });
    expect(bad.status).toBe(422);
  });
});
