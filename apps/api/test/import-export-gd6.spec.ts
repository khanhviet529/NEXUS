import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Writable } from 'node:stream';
import { Prisma } from '@prisma/client';
import { createTestApp, type TestHarness } from './setup/test-app';
import { ImportsRepository } from '../src/modules/imports/imports.repository';
import { ExportStreamRepository } from '../src/modules/exports/export-stream.repository';

/**
 * Test §8.2 GĐ6: #26 export streaming (RAM không tăng tuyến tính),
 * #27 import recovery (kill giữa chừng → resume checkpoint, không trùng),
 * #28 bulk partial success (HTTP 200, lỗi từng dòng).
 */
describe('GĐ6 — import/export/bulk (§8.2 #26-#28)', () => {
  let h: TestHarness;
  let managerToken = '';
  let staffToken = '';

  const agent = () => request(h.app.getHttpServer());

  beforeAll(async () => {
    h = await createTestApp();
    managerToken = await h.login('manager@tenant-a.local');
    staffToken = await h.login('staff@tenant-a.local');
  });

  afterAll(async () => {
    await h.close();
  });

  // ==================== #27 — import recovery ====================

  it('#27 import 5.000 dòng có dòng lỗi: báo lỗi TỪNG DÒNG; kill giữa chừng → resume từ checkpoint, KHÔNG trùng', async () => {
    const rows = Array.from({ length: 5_000 }, (_, i) => {
      if (i % 500 === 137) return { code: `IMP-${i}`, baseUom: 'CAI' }; // thiếu nameVi → lỗi
      return { code: `IMP-${i}`, nameVi: `Hàng nhập ${i}`, baseUom: 'CAI' };
    });

    const create = await agent()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ rows });
    expect(create.status, JSON.stringify(create.body)).toBe(202);
    const jobId = create.body.jobId as string;

    const repo = h.app.get(ImportsRepository);
    // Worker CHẾT sau 3 batch (3×500 = 1.500 dòng đã commit)
    await expect(
      repo.process(jobId, { batchSize: 500, failAfterBatches: 3 }),
    ).rejects.toThrow('TEST_WORKER_CRASH');

    const midway = await agent()
      .get(`/api/v1/import-jobs/${jobId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(midway.body.lastProcessedRow).toBe(1_500); // CHECKPOINT đã ghi

    // RETRY — resume từ checkpoint, không chạy lại từ đầu (#27)
    const result = await repo.process(jobId, { batchSize: 500 });
    expect(result.resumedFrom).toBe(1_500);

    // 10 dòng lỗi (i%500==137 → 10 dòng trong 5000)
    expect(result.errors).toBe(10);
    expect(result.ok).toBe(4_990);

    // KHÔNG TRÙNG: đúng 4.990 sản phẩm import được tạo
    const imported = await h.rawPrisma.product.count({
      where: { tenantId: h.seed.tenantA.tenantId, source: 'import' },
    });
    expect(imported).toBe(4_990);

    // Lỗi từng dòng tra được, đúng dòng đúng lý do
    const errors = await agent()
      .get(`/api/v1/import-jobs/${jobId}/errors`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(errors.body).toHaveLength(10);
    expect(errors.body[0].rowNumber).toBe(138); // i=137 → rowNumber 138
    expect(errors.body[0].errors[0]).toContain('nameVi');
  }, 180_000);

  it('#27b retry job ĐÃ xong → dedup bằng unique business key, vẫn không trùng (lớp 3 §3.9)', async () => {
    const rows = [{ code: 'IMP-DUP-1', nameVi: 'Trùng thử', baseUom: 'CAI' }];
    const create = await agent()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ rows, onDuplicate: 'skip' });
    const repo = h.app.get(ImportsRepository);
    await repo.process(create.body.jobId);

    // Job THỨ HAI import lại cùng code — at-least-once phải chịu được
    const again = await agent()
      .post('/api/v1/products/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ rows, onDuplicate: 'skip' });
    const result = await repo.process(again.body.jobId);
    expect(result.errors).toBe(0); // skip mode: SKIPPED, không lỗi

    const count = await h.rawPrisma.product.count({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'IMP-DUP-1' },
    });
    expect(count).toBe(1); // unique business key giữ đúng MỘT
  });

  // ==================== #26 — export streaming ====================

  it('#26 export 500k dòng: RAM KHÔNG tăng tuyến tính (streaming + backpressure)', async () => {
    const tenantId = h.seed.tenantA.tenantId;
    // Seed 500k dòng bằng generate_series — nhanh, không qua app
    await h.rawPrisma.$executeRaw(
      Prisma.sql`INSERT INTO products (id, created_at, updated_at, tenant_id, code, name, base_uom, source)
                 SELECT gen_random_uuid(), now(), now(), ${tenantId}::uuid,
                        'EXP-' || n, jsonb_build_object('vi', 'Hàng xuất ' || n), 'CAI', 'export-test'
                 FROM generate_series(1, 500000) AS n`,
    );

    const exporter = h.app.get(ExportStreamRepository);
    // Đích: stream ĐẾM BYTE, không giữ dữ liệu — RAM chỉ còn của app
    let bytes = 0;
    const sink = new Writable({
      highWaterMark: 64 * 1024,
      write(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        setImmediate(cb); // async sink — ép backpressure hoạt động
      },
    });

    if (global.gc) global.gc();
    const before = process.memoryUsage().heapUsed;
    const total = await exporter.streamProductsCsv(tenantId, sink, { includeCost: false });
    const after = process.memoryUsage().heapUsed;

    expect(total).toBeGreaterThanOrEqual(500_000);
    expect(bytes).toBeGreaterThan(10_000_000); // ~15MB+ CSV đã đi qua stream
    // Nếu giữ toàn bộ trong RAM: 500k object + chuỗi CSV ≈ vài trăm MB.
    // Streaming: delta phải nhỏ hơn NHIỀU so với dữ liệu đã ghi.
    const deltaMB = (after - before) / 1024 / 1024;
    expect(deltaMB).toBeLessThan(150);
  }, 300_000);

  it('#26b field-level ở export (§4.4c nơi 2): STAFF thiếu field:cost → CSV KHÔNG có cột cost_price', async () => {
    const asStaff = await agent()
      .post('/api/v1/products/export')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(asStaff.status).toBe(201);
    const staffHeader = (asStaff.text as string).split('\n')[0];
    expect(staffHeader).not.toContain('cost_price');

    const asManager = await agent()
      .post('/api/v1/products/export')
      .set('Authorization', `Bearer ${managerToken}`);
    const managerHeader = (asManager.text as string).split('\n')[0];
    expect(managerHeader).toContain('cost_price'); // manager có field:cost
  }, 300_000);

  // ==================== #28 — bulk partial success ====================

  it('#28 bulk-approve 5 đơn (3 hợp lệ, 1 nháp, 1 tự tạo) → HTTP 200, results đúng từng dòng', async () => {
    // Chuẩn bị: customer + product + 5 đơn
    const customer = await agent()
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KH-BULK', name: { vi: 'Khách bulk' } });
    const product = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-BULK', name: { vi: 'Hàng bulk' }, baseUom: 'CAI' });

    const mkOrder = async (token: string) => {
      const r = await agent()
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId: customer.body.id,
          items: [{ productId: product.body.id, quantity: '1', unitPrice: '1000' }],
        });
      return { id: r.body.id as string, version: r.body.version as number };
    };
    const submit = (id: string, token: string) =>
      agent()
        .post(`/api/v1/orders/${id}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 });

    // 3 đơn PENDING của staff
    const good = [];
    for (let i = 0; i < 3; i++) {
      const o = await mkOrder(staffToken);
      await submit(o.id, staffToken);
      good.push(o.id);
    }
    // 1 đơn còn DRAFT (không submit)
    const draft = await mkOrder(staffToken);
    // 1 đơn PENDING nhưng do CHÍNH manager tạo → SELF_APPROVAL
    const own = await mkOrder(managerToken);
    await submit(own.id, managerToken);

    const res = await agent()
      .post('/api/v1/orders/bulk-approve')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ orderIds: [...good, draft.id, own.id] });

    expect(res.status).toBe(200); // 200 kể cả khi có dòng lỗi (§5C.3)
    expect(res.body.total).toBe(5);
    expect(res.body.succeeded).toBe(3);
    expect(res.body.failed).toBe(2);

    const byId = new Map(
      (res.body.results as Array<{ id: string; success: boolean; code?: string }>).map((r) => [
        r.id,
        r,
      ]),
    );
    expect(byId.get(draft.id)!.code).toBe('ORDER.INVALID_TRANSITION');
    expect(byId.get(own.id)!.code).toBe('ORDER.SELF_APPROVAL');
    for (const id of good) expect(byId.get(id)!.success).toBe(true);
  });
});
