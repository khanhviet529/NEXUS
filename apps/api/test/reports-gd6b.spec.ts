import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * GĐ6b — A1 report framework (§5B.1/A1).
 * Kiểm: quyền theo từng report, scope NHÚNG TRONG QUERY (own/desc/all),
 * field-level NƠI 3 của test #10 (§4.4c — cột margin theo field:cost),
 * locale resolve (§12 #51), cách ly tenant, validate param, export CSV
 * đi cùng đường lọc cột với run.
 */
describe('GĐ6b — A1 report framework (§8.2 #8, #10 nơi 3)', () => {
  let h: TestHarness;
  const agent = () => request(h.app.getHttpServer());

  let staffToken = '';
  let managerToken = '';
  let adminToken = '';
  let viewerToken = '';
  let adminBToken = '';
  let managerBToken = '';
  let nopermToken = '';

  const RUN = '/api/v1/reports/sales-by-customer/run';
  const EXPORT = '/api/v1/reports/sales-by-customer/export';
  const LIST = '/api/v1/reports';
  const period = { from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' };

  /** create → submit (người tạo) → approve (người khác — ORDER.SELF_APPROVAL) */
  const approvedOrder = async (
    creatorToken: string,
    approverToken: string,
    customerId: string,
    productId: string,
    quantity: string,
    unitPrice: string,
  ): Promise<string> => {
    const create = await agent()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ customerId, items: [{ productId, quantity, unitPrice, taxRate: '10' }] });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const id = create.body.id as string;
    const submit = await agent()
      .post(`/api/v1/orders/${id}/submit`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ version: 1 }); // optimistic lock (§12 #17)
    expect(submit.status, JSON.stringify(submit.body)).toBe(201);
    const approve = await agent()
      .post(`/api/v1/orders/${id}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ version: 2 });
    expect(approve.status, JSON.stringify(approve.body)).toBe(201);
    return id;
  };

  beforeAll(async () => {
    h = await createTestApp();
    staffToken = await h.login('staff@tenant-a.local');
    managerToken = await h.login('manager@tenant-a.local');
    adminToken = await h.login('admin@tenant-a.local');
    viewerToken = await h.login('viewer@tenant-a.local');
    adminBToken = await h.login('admin@tenant-b.local');
    managerBToken = await h.login('manager@tenant-b.local');

    // User CÓ membership nhưng KHÔNG role nào → không có report:sales (case 403)
    const staffRow = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email: 'staff@tenant-a.local' },
    });
    const noperm = await h.rawPrisma.user.create({
      data: {
        email: 'noperm-report@tenant-a.local',
        fullName: 'Không quyền báo cáo',
        passwordHash: staffRow.passwordHash, // cùng Passw0rd! với seed
      },
    });
    await h.rawPrisma.tenantMembership.create({
      data: {
        tenantId: h.seed.tenantA.tenantId,
        userId: noperm.id,
        orgUnitId: h.seed.tenantA.orgUnitId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    nopermToken = await h.login('noperm-report@tenant-a.local');

    // --- Dữ liệu tenant A: 2 khách, 2 đơn APPROVED ---
    const custA1 = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-RPT-A1', name: { vi: 'Khách Báo Cáo Một', en: 'Report Customer One' } });
    expect(custA1.status, JSON.stringify(custA1.body)).toBe(201);
    const custA2 = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-RPT-A2', name: { vi: 'Khách Báo Cáo Hai' } }); // KHÔNG có en → fallback
    expect(custA2.status, JSON.stringify(custA2.body)).toBe(201);
    const prodA = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-RPT-A', name: { vi: 'Hàng báo cáo' }, baseUom: 'CAI', costPrice: '60000' });
    expect(prodA.status, JSON.stringify(prodA.body)).toBe(201);

    // Đơn của STAFF (own-scope nhìn thấy): 2 × 100.000, VAT 10% → total 220.000
    const staffOrderId = await approvedOrder(
      staffToken, managerToken, custA1.body.id, prodA.body.id, '2', '100000',
    );
    // Đơn của MANAGER: 1 × 500.000, VAT 10% → total 550.000
    const managerOrderId = await approvedOrder(
      managerToken, adminToken, custA2.body.id, prodA.body.id, '1', '500000',
    );
    // margin là cột field:cost — set trực tiếp (bộ tính margin chưa thuộc GĐ6b)
    await h.rawPrisma.order.update({ where: { id: staffOrderId }, data: { margin: '50000' } });
    await h.rawPrisma.order.update({ where: { id: managerOrderId }, data: { margin: '50000' } });

    // --- Tenant B: 1 đơn APPROVED — mồi cho test cách ly ---
    const custB = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerBToken}`)
      .send({ code: 'KH-B-RPT', name: { vi: 'Khách tenant B' } });
    expect(custB.status, JSON.stringify(custB.body)).toBe(201);
    const prodB = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerBToken}`)
      .send({ code: 'SP-B-RPT', name: { vi: 'Hàng B' }, baseUom: 'CAI', costPrice: '1' });
    expect(prodB.status, JSON.stringify(prodB.body)).toBe(201);
    await approvedOrder(managerBToken, adminBToken, custB.body.id, prodB.body.id, '1', '999999');
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  // ==================== Quyền ====================

  it('GET /reports: 4 vai trò seed đều thấy sales-by-customer; user không quyền → danh sách RỖNG', async () => {
    for (const token of [staffToken, managerToken, adminToken, viewerToken]) {
      const res = await agent().get(LIST).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.map((r: { id: string }) => r.id)).toContain('sales-by-customer');
    }
    const noperm = await agent().get(LIST).set('Authorization', `Bearer ${nopermToken}`);
    expect(noperm.status).toBe(200);
    expect(noperm.body).toEqual([]);
  });

  it('run/meta không quyền → 403; report không tồn tại → 404', async () => {
    const run = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${nopermToken}`)
      .send({ params: { period } });
    expect(run.status).toBe(403);
    const meta = await agent()
      .get('/api/v1/reports/sales-by-customer/meta')
      .set('Authorization', `Bearer ${nopermToken}`);
    expect(meta.status).toBe(403);
    const notFound = await agent()
      .post('/api/v1/reports/khong-ton-tai/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ params: { period } });
    expect(notFound.status).toBe(404);
  });

  it('thiếu param bắt buộc / sai hình dateRange → 422 COMMON.VALIDATION_FAILED, không nổ 500', async () => {
    const empty = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(empty.status, JSON.stringify(empty.body)).toBe(422);
    expect(empty.body.code).toBe('COMMON.VALIDATION_FAILED');
    const badShape = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ params: { period: { from: 123, to: null } } });
    expect(badShape.status).toBe(422);
  });

  // ==================== Scope nhúng trong query (§4.4) ====================

  // DB dùng CHUNG cho cả suite (§8.3) — spec khác cũng tạo đơn APPROVED,
  // nên assert phải TỰ KHOANH VÙNG theo customer của spec này, không so tổng toàn cục
  it('VIEWER (all): thấy CẢ 2 khách, số từng dòng đúng; KHÔNG lộ dòng tenant B', async () => {
    const res = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ params: { period } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = res.body.rows as Array<{
      customerCode: string;
      revenue: string;
      margin?: string;
      orderCount: string;
    }>;
    const codes = rows.map((r) => r.customerCode);
    expect(codes).toContain('KH-RPT-A1');
    expect(codes).toContain('KH-RPT-A2');
    expect(codes).not.toContain('KH-B-RPT'); // cách ly tenant (§8.2 #1)
    const a1 = rows.find((r) => r.customerCode === 'KH-RPT-A1')!;
    const a2 = rows.find((r) => r.customerCode === 'KH-RPT-A2')!;
    expect(Number(a1.revenue)).toBe(220000); // 2 × 100k + VAT 10%
    expect(Number(a2.revenue)).toBe(550000); // 1 × 500k + VAT 10%
    expect(Number(a1.margin)).toBe(50000); // VIEWER có field:cost
    // orderBy revenue desc trên TOÀN kết quả
    const revs = rows.map((r) => Number(r.revenue));
    expect([...revs].sort((x, y) => y - x)).toEqual(revs);
    // dòng tổng (§5.5) nhất quán với rows trả về
    const sum = rows.reduce((s, r) => s + Number(r.revenue), 0);
    expect(Number(res.body.summary.revenue)).toBeCloseTo(sum, 2);
    // drill-down sinh từ ReportDef, KHÔNG cần lộ customerId trong rows
    expect(res.body.drilldowns[0]).toMatch(/^\/orders\?filter\[customerId\]\[eq\]=/);
    expect(rows[0]).not.toHaveProperty('customerId');
  });

  it('STAFF (own): thấy khách trên đơn mình tạo, KHÔNG thấy đơn manager — scope trong WHERE', async () => {
    const res = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ params: { period } });
    expect(res.status).toBe(201);
    const rows = res.body.rows as Array<{ customerCode: string; revenue: string }>;
    const codes = rows.map((r) => r.customerCode);
    expect(codes).toContain('KH-RPT-A1');
    expect(codes).not.toContain('KH-RPT-A2'); // đơn manager tạo — own KHÔNG thấy dù cùng org unit
    expect(codes).not.toContain('KH-B-RPT');
    const a1 = rows.find((r) => r.customerCode === 'KH-RPT-A1')!;
    expect(Number(a1.revenue)).toBe(220000);
  });

  it('MANAGER (descendants): thấy cả đơn staff cùng cây org unit', async () => {
    const res = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ params: { period } });
    expect(res.status).toBe(201);
    const codes = res.body.rows.map((r: { customerCode: string }) => r.customerCode);
    expect(codes).toContain('KH-RPT-A1');
    expect(codes).toContain('KH-RPT-A2');
  });

  it('tenant B chạy cùng report: thấy dữ liệu B, KHÔNG thấy bất kỳ khách nào của A', async () => {
    const res = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ params: { period } });
    expect(res.status).toBe(201);
    const codes = res.body.rows.map((r: { customerCode: string }) => r.customerCode);
    expect(codes).toContain('KH-B-RPT');
    for (const code of codes) expect(code).not.toMatch(/^KH-RPT-A|^KH-GD5|^KH-BULK/);
  });

  // ==================== #10 nơi 3 — field-level trong report (§4.4c) ====================

  it('#10 nơi 3: STAFF thiếu field:cost → margin BIẾN MẤT ở meta, run và summary; VIEWER thấy', async () => {
    const meta = await agent()
      .get('/api/v1/reports/sales-by-customer/meta')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(meta.status).toBe(200);
    expect(meta.body.columns.map((c: { key: string }) => c.key)).not.toContain('margin');

    const run = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ params: { period } });
    expect(run.body.columns.map((c: { key: string }) => c.key)).not.toContain('margin');
    for (const row of run.body.rows) expect(row).not.toHaveProperty('margin');
    expect(run.body.summary).not.toHaveProperty('margin');

    const metaViewer = await agent()
      .get('/api/v1/reports/sales-by-customer/meta')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(metaViewer.body.columns.map((c: { key: string }) => c.key)).toContain('margin');
  });

  it('#10 nơi 3 (export): CSV của STAFF không có cột Lãi gộp; của VIEWER có, kèm dòng tổng', async () => {
    const staffCsv = await agent()
      .post(EXPORT)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ params: { period } });
    expect(staffCsv.status).toBe(201); // khuôn repo: POST export → 201 (như products/export GĐ6)
    expect(staffCsv.headers['content-type']).toContain('text/csv');
    expect(staffCsv.text).not.toContain('Lãi gộp');
    expect(staffCsv.text).toContain('KH-RPT-A1');
    expect(staffCsv.text).not.toContain('KH-RPT-A2'); // own-scope áp cả đường export

    const viewerCsv = await agent()
      .post(EXPORT)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ params: { period } });
    expect(viewerCsv.text).toContain('Lãi gộp');
    expect(viewerCsv.text).toContain('KH-RPT-A2'); // all-scope thấy đơn manager
    // dòng tổng (§5.5) khớp summary của run — export đi CÙNG đường dữ liệu
    const run = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ params: { period } });
    const lines = viewerCsv.text.split('\n');
    expect(lines[lines.length - 1]).toContain(String(run.body.summary.revenue));
  });

  // ==================== Locale (§3.10, §12 #51) + cache ====================

  it('X-Locale: en → tên khách tiếng Anh, thiếu bản dịch fallback vi; mặc định vi', async () => {
    const en = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('X-Locale', 'en')
      .send({ params: { period } });
    expect(en.status).toBe(201);
    const byCode = new Map(
      en.body.rows.map((r: { customerCode: string; customerName: string }) => [
        r.customerCode,
        r.customerName,
      ]),
    );
    expect(byCode.get('KH-RPT-A1')).toBe('Report Customer One');
    expect(byCode.get('KH-RPT-A2')).toBe('Khách Báo Cáo Hai'); // fallback vi

    const vi = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ params: { period } });
    const viByCode = new Map(
      vi.body.rows.map((r: { customerCode: string; customerName: string }) => [
        r.customerCode,
        r.customerName,
      ]),
    );
    expect(viByCode.get('KH-RPT-A1')).toBe('Khách Báo Cáo Một');
  });

  it('cache: lần hai cùng (user, params, locale) → cached=true; locale khác không dùng chung cache', async () => {
    const first = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ params: { period } });
    const second = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ params: { period } });
    expect(second.body.cached).toBe(true);
    expect(second.body.rows).toEqual(first.body.rows);
    // en đã chạy ở test trước nhưng tên vẫn đúng theo locale → key tách theo locale
    const en = await agent()
      .post(RUN)
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('X-Locale', 'en')
      .send({ params: { period } });
    const names = en.body.rows.map((r: { customerName: string }) => r.customerName);
    expect(names).toContain('Report Customer One');
  });
});
