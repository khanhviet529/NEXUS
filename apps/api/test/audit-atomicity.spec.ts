import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { createTestApp, type TestHarness } from './setup/test-app';
import { OrdersService } from '../src/modules/orders/orders.service';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';

/**
 * ADR-0004 điều kiện 2+3 — audit TƯỜNG MINH chỉ an toàn nếu:
 *  (a) ghi TRONG CÙNG transaction với write nghiệp vụ. Hai kịch bản sai đều
 *      ÂM THẦM: tx rollback mà audit vẫn ghi → timeline có hành động chưa
 *      từng xảy ra; tx commit mà audit lỗi → mất dấu vết hành động đã xảy ra.
 *      Cùng họ với test #20b của outbox.
 *  (b) action mang NGỮ NGHĨA NGHIỆP VỤ (SUBMIT/APPROVE), không phải UPDATE
 *      vô hồn — nếu không, timeline §4.9 trên trang chi tiết vô dụng và lý do
 *      chính của ADR-0004 tự sụp.
 */
describe('ADR-0004 — audit nguyên tử + action ngữ nghĩa (§4.9)', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());
  let staffToken = '';
  let managerToken = '';
  let managerAuth: AuthUser;
  let customerId = '';
  let productId = '';

  const createPendingOrder = async (): Promise<{ id: string; code: string }> => {
    const created = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: '1', unitPrice: '100000', taxRate: '10' }],
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await agent()
      .post(`/api/v1/orders/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ version: 1 });
    return { id: created.body.id as string, code: created.body.code as string };
  };

  const auditRowsOf = (orderId: string) =>
    h.rawPrisma.auditLog.findMany({
      where: { entity: 'Order', entityId: orderId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');

    const manager = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'manager@tenant-a.local' },
    });
    const membership = await h.rawPrisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: h.seed.tenantA.tenantId, userId: manager.id } },
    });
    managerAuth = {
      sub: manager.id,
      tenantId: h.seed.tenantA.tenantId,
      membershipId: membership.id,
      sessionId: 'test-session',
      orgUnitId: membership.orgUnitId ?? undefined,
    };

    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-ADR4', name: { vi: 'Khách ADR-0004' } });
    customerId = customer.body.id;
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-ADR4', name: { vi: 'Hàng ADR-0004' }, baseUom: 'CAI', costPrice: '50000' });
    productId = product.body.id;
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  it('(a1) tx nghiệp vụ ROLLBACK → KHÔNG có dòng audit nào (như #20b của outbox)', async () => {
    const order = await createPendingOrder();
    const before = await auditRowsOf(order.id);

    const ordersService = h.app.get(OrdersService);
    await expect(
      h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId, userId: managerAuth.sub }, () =>
        ordersService.approve(managerAuth, order.id, 2, { failAfterOutboxForTest: true }),
      ),
    ).rejects.toThrow('TEST_ROLLBACK_AFTER_OUTBOX');

    // Trạng thái đơn KHÔNG đổi (tx rolled back)
    const row = await h.rawPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('PENDING');
    // Và KHÔNG sinh audit cho hành động chưa từng xảy ra
    const after = await auditRowsOf(order.id);
    expect(after.length).toBe(before.length);
    expect(after.some((a) => a.action === AUDIT_ACTIONS.APPROVE)).toBe(false);
  });

  it('(a2) audit LỖI → write nghiệp vụ cũng rollback: không có commit "câm" mất dấu vết', async () => {
    const order = await createPendingOrder();

    const ordersService = h.app.get(OrdersService);
    await expect(
      h.ctx.runWith({ tenantId: h.seed.tenantA.tenantId, userId: managerAuth.sub }, () =>
        ordersService.approve(managerAuth, order.id, 2, { failAuditForTest: true }),
      ),
    ).rejects.toThrow('TEST_AUDIT_FAILURE');

    // Nếu audit nằm NGOÀI transaction, đơn đã APPROVED mà không có dấu vết —
    // đúng kịch bản "mất dấu vết hành động đã xảy ra"
    const row = await h.rawPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('PENDING');
    expect(row.approvedAt).toBeNull();
    const rows = await auditRowsOf(order.id);
    expect(rows.some((a) => a.action === AUDIT_ACTIONS.APPROVE)).toBe(false);
  });

  it('(b) timeline mang NGỮ NGHĨA: SUBMIT/APPROVE, không phải UPDATE vô hồn', async () => {
    const order = await createPendingOrder();
    const approve = await agent()
      .post(`/api/v1/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ version: 2 });
    expect(approve.status, JSON.stringify(approve.body)).toBe(201);

    const rows = await auditRowsOf(order.id);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain(AUDIT_ACTIONS.SUBMIT);
    expect(actions).toContain(AUDIT_ACTIONS.APPROVE);
    // Vòng đời chứng từ KHÔNG được ghi là UPDATE — timeline phải đọc được
    expect(actions.filter((a) => a === AUDIT_ACTIONS.UPDATE)).toHaveLength(0);

    // Timeline qua API (§4.9) hiển thị đúng chuỗi hành động
    const timeline = await agent()
      .get(`/api/v1/audit-logs?entity=Order&entityId=${order.id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(timeline.status).toBe(200);
    expect(timeline.body.data.map((r: { action: string }) => r.action)).toContain(
      AUDIT_ACTIONS.APPROVE,
    );
  });

  it('(c) mọi action đã ghi trong DB đều thuộc registry AUDIT_ACTIONS (không chuỗi tự do)', async () => {
    const distinct = await h.rawPrisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
    });
    const allowed = new Set<string>(Object.values(AUDIT_ACTIONS));
    // DB trigger nhóm security-critical (§4.9) dùng tiền tố DB_ riêng
    const unknown = distinct
      .map((d) => d.action)
      .filter((a) => !allowed.has(a) && !a.startsWith('DB_'));
    expect(unknown).toEqual([]);
  });
});
