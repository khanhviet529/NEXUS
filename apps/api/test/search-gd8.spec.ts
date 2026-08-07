import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * GĐ8 — test §8.2 #29: global search áp ĐÚNG row-level + field-level permission.
 * Row-level: scope nhúng WHERE từng nhóm. Field-level: kết quả chỉ có cột định
 * danh (id/code/label) — không bao giờ chứa salary/costPrice/creditLimit.
 */
describe('GĐ8 — global search (§8.2 #29, §5C.7)', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());

  let staffToken = '';
  let managerToken = '';
  let viewerToken = '';
  let adminBToken = '';
  let managerOrderCode = '';

  const find = (body: { groups: Array<{ entity: string; items: unknown[] }> }, entity: string) =>
    body.groups.find((g) => g.entity === entity);

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');
    viewerToken = await h.login('viewer@tenant-a.local');
    adminBToken = await h.login('admin@tenant-b.local');

    // Fixture riêng của spec (DB dùng chung): khách có DẤU để thử không dấu
    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-SRCH', name: { vi: 'Khách Tìm Kiếm Toàn Cục' } });
    expect(customer.status, JSON.stringify(customer.body)).toBe(201);
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-SRCH', name: { vi: 'Hàng Tìm Kiếm' }, baseUom: 'CAI', costPrice: '77000' });
    expect(product.status, JSON.stringify(product.body)).toBe(201);

    // Đơn do MANAGER tạo — staff (own) KHÔNG được thấy trong search
    const order = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerId: customer.body.id,
        items: [{ productId: product.body.id, quantity: '1', unitPrice: '9000', taxRate: '10' }],
      });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    managerOrderCode = order.body.code as string;
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  it('#29 tìm KHÔNG DẤU theo tên (§3.10): "tim kiem toan cuc" ra khách có dấu', async () => {
    const res = await agent()
      .get('/api/v1/search?q=tim kiem toan cuc')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const customers = find(res.body, 'Customer');
    expect(customers).toBeDefined();
    expect(customers!.items.map((i) => (i as { code: string }).code)).toContain('KH-SRCH');
  });

  it('#29 row-level: STAFF (order own) KHÔNG thấy đơn manager; MANAGER/VIEWER thấy', async () => {
    const asStaff = await agent()
      .get(`/api/v1/search?q=${managerOrderCode}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(find(asStaff.body, 'Order')).toBeUndefined(); // scope NHÚNG WHERE

    const asManager = await agent()
      .get(`/api/v1/search?q=${managerOrderCode}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(
      find(asManager.body, 'Order')!.items.map((i) => (i as { code: string }).code),
    ).toContain(managerOrderCode);

    const asViewer = await agent()
      .get(`/api/v1/search?q=${managerOrderCode}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(find(asViewer.body, 'Order')).toBeDefined();
  });

  it('#29 cách ly tenant: tenant B tìm mã của A → không nhóm nào có', async () => {
    const res = await agent()
      .get('/api/v1/search?q=SP-SRCH')
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
  });

  it('#29 field-level: kết quả CHỈ có id/code/label/href — không rò salary/costPrice', async () => {
    const res = await agent()
      .get('/api/v1/search?q=SP-SRCH')
      .set('Authorization', `Bearer ${viewerToken}`);
    const product = find(res.body, 'Product');
    expect(product).toBeDefined();
    for (const item of product!.items) {
      expect(Object.keys(item as object).sort()).toEqual(['code', 'href', 'id', 'label']);
    }
    expect(JSON.stringify(res.body)).not.toContain('77000'); // costPrice không rò
  });

  it('#29 quyền theo nhóm: user tìm được user (user:read); q ngắn < 2 ký tự → 422', async () => {
    const res = await agent()
      .get('/api/v1/search?q=staff@tenant-a')
      .set('Authorization', `Bearer ${managerToken}`);
    const users = find(res.body, 'User');
    expect(users).toBeDefined();
    expect(users!.items.map((i) => (i as { code: string }).code)).toContain(
      'staff@tenant-a.local',
    );
    // tenant B không lộ qua nhóm User
    expect(JSON.stringify(res.body)).not.toContain('tenant-b.local');

    const short = await agent()
      .get('/api/v1/search?q=a')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(short.status).toBe(422);
  });
});
