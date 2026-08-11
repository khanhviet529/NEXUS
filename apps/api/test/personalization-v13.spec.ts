import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * V13 — GET /recent-items + /favorite-items trả nhãn ĐÃ resolve (§5C.7).
 * CÙNG LUẬT global search: quyền row-level nhúng WHERE — bản ghi ngoài scope
 * hoặc đã mất thì LOẠI khỏi danh sách, không lộ nhãn (§4.4).
 */
describe('Personalization resolve (V13)', () => {
  let h: TestHarness;
  let staffA = '';
  let managerA = '';
  let staffB = '';
  let productId = '';
  let managerOrderId = '';

  const agent = () => request(h.app.getHttpServer());
  const touch = (token: string, entity: string, entityId: string) =>
    agent()
      .put('/api/v1/recent-items')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity, entityId });

  beforeAll(async () => {
    h = await createTestApp();
    staffA = await h.login('staff@tenant-a.local');
    managerA = await h.login('manager@tenant-a.local');
    staffB = await h.login('staff@tenant-b.local');

    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerA}`)
      .send({ code: 'KH-V13', name: { vi: 'Khách V13' } });
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerA}`)
      .send({ code: 'SP-V13', name: { vi: 'Hàng vừa xem', en: 'Recent product' }, baseUom: 'CAI' });
    productId = product.body.id;
    const order = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${managerA}`)
      .send({
        customerId: customer.body.id,
        items: [{ productId, quantity: '1', unitPrice: '1000' }],
      });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    managerOrderId = order.body.id;
  });

  afterAll(async () => {
    await h.close();
  });

  it('touch rồi đọc lại: nhãn resolve theo §3.10 (name.vi), href dựng sẵn, mới nhất trước', async () => {
    await touch(managerA, 'Product', productId);
    await touch(managerA, 'Order', managerOrderId);

    const res = await agent()
      .get('/api/v1/recent-items')
      .set('Authorization', `Bearer ${managerA}`);
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ entity: string; label: string; href: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.entity).toBe('Order'); // chạm sau → đứng trước
    expect(rows[0]!.href).toBe(`/orders/${managerOrderId}`);
    expect(rows[1]!.entity).toBe('Product');
    expect(rows[1]!.label).toBe('Hàng vừa xem');
    expect(rows[1]!.href).toBe(`/products/${productId}`);
  });

  it('row-level: STAFF (scope own) từng chạm đơn CỦA MANAGER → bị loại khỏi danh sách', async () => {
    await touch(staffA, 'Order', managerOrderId);

    const res = await agent()
      .get('/api/v1/recent-items')
      .set('Authorization', `Bearer ${staffA}`);
    expect(res.status).toBe(200);
    const orders = (res.body as Array<{ entity: string; entityId: string }>).filter(
      (r) => r.entity === 'Order' && r.entityId === managerOrderId,
    );
    expect(orders).toHaveLength(0); // KHÔNG lộ nhãn đơn ngoài scope (§4.4)
  });

  it('tenancy: STAFF tenant B chạm bản ghi tenant A → extension chặn, danh sách loại nó', async () => {
    await touch(staffB, 'Product', productId);

    const res = await agent()
      .get('/api/v1/recent-items')
      .set('Authorization', `Bearer ${staffB}`);
    expect(res.status).toBe(200);
    const leaked = (res.body as Array<{ entityId: string }>).filter(
      (r) => r.entityId === productId,
    );
    expect(leaked).toHaveLength(0);
  });

  it('favorites: label TỰ ĐẶT thắng nhãn resolve; không đặt thì rơi về nhãn resolve', async () => {
    await agent()
      .put('/api/v1/favorite-items')
      .set('Authorization', `Bearer ${managerA}`)
      .send({ entity: 'Order', entityId: managerOrderId, label: 'Đơn theo dõi sát' });
    await agent()
      .put('/api/v1/favorite-items')
      .set('Authorization', `Bearer ${managerA}`)
      .send({ entity: 'Product', entityId: productId });

    const res = await agent()
      .get('/api/v1/favorite-items')
      .set('Authorization', `Bearer ${managerA}`);
    expect(res.status).toBe(200);
    const byEntity = Object.fromEntries(
      (res.body as Array<{ entity: string; label: string }>).map((r) => [r.entity, r.label]),
    );
    expect(byEntity.Order).toBe('Đơn theo dõi sát');
    expect(byEntity.Product).toBe('Hàng vừa xem');
  });

  it('bản ghi không còn tồn tại (id lạ) → loại, không 500', async () => {
    await touch(managerA, 'Customer', '00000000-0000-4000-8000-000000000000');

    const res = await agent()
      .get('/api/v1/recent-items')
      .set('Authorization', `Bearer ${managerA}`);
    expect(res.status).toBe(200);
    const ghost = (res.body as Array<{ entityId: string }>).filter(
      (r) => r.entityId === '00000000-0000-4000-8000-000000000000',
    );
    expect(ghost).toHaveLength(0);
  });
});
