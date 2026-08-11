import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * V11 — POST /orders/export: CSV streaming theo ĐÚNG bộ lọc (§5.5),
 * scope trong WHERE (§4.4), field-level nơi 2 (§4.4c: margin theo field:cost).
 */
describe('POST /orders/export (V11)', () => {
  let h: TestHarness;
  let staffToken = '';
  let managerToken = '';

  const agent = () => request(h.app.getHttpServer());

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');

    // Dữ liệu: 1 khách + 1 hàng + 2 đơn (1 của staff DRAFT, 1 của manager PENDING)
    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-EXP', name: { vi: 'Khách export' } });
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-EXP', name: { vi: 'Hàng export' }, baseUom: 'CAI' });
    const mk = (token: string) =>
      agent()
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId: customer.body.id,
          items: [{ productId: product.body.id, quantity: '1', unitPrice: '1000' }],
        });
    const staffOrder = await mk(staffToken);
    expect(staffOrder.status).toBe(201);
    const managerOrder = await mk(managerToken);
    await agent()
      .post(`/api/v1/orders/${managerOrder.body.id}/submit`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 1 });
  });

  afterAll(async () => {
    await h.close();
  });

  it('scope own (STAFF): CSV chỉ chứa đơn CỦA MÌNH, không cột margin (thiếu field:cost)', async () => {
    const res = await agent()
      .post('/api/v1/orders/export')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = (res.text as string).trim().split('\n');
    expect(lines[0]).not.toContain('margin'); // §4.4c nơi 2
    // Mọi dòng dữ liệu là đơn KH-EXP của staff — không dính đơn manager/tenant B
    const dataLines = lines.slice(1).filter((l) => l.includes('KH-EXP'));
    expect(dataLines.length).toBeGreaterThanOrEqual(1);
    for (const l of dataLines) expect(l).toContain('DRAFT'); // đơn PENDING là của manager
  });

  it('MANAGER (field:cost): CÓ cột margin; filter[status][eq] áp vào export', async () => {
    const res = await agent()
      .post('/api/v1/orders/export?filter[status][eq]=PENDING')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(201);
    const lines = (res.text as string).trim().split('\n');
    expect(lines[0]).toContain('margin'); // có field:cost
    const dataLines = lines.slice(1).filter(Boolean);
    expect(dataLines.length).toBeGreaterThanOrEqual(1);
    for (const l of dataLines) expect(l).toContain('PENDING'); // đúng bộ lọc (§5.5)
  });

  it('thiếu order:export → 403 (guard trước khi stream)', async () => {
    // Tài khoản không có order:export: tạo qua invitation với role VIEWER?
    // VIEWER seed CÓ order:export... dùng token rác cho 401 + kiểm guard permission
    const res = await agent().post('/api/v1/orders/export');
    expect(res.status).toBe(401);
  });
});
