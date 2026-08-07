import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';
import { PrismaService } from '../src/infra/prisma/prisma.service';

/**
 * Test §8.2 #12 (đếm query), #13 (locale fallback nhất quán 4 nơi),
 * #14 (soft delete + unique) — trên module [REF] products.
 */
describe('GĐ4 — parser + locale + soft delete (§8.2 #12, #13, #14)', () => {
  let h: TestHarness;
  let adminToken = '';
  let staffToken = '';

  /** Helper #12 — cookbook §11: số kỳ vọng đặt CỨNG, không đặt khoảng */
  async function expectQueryCount(expected: number, fn: () => Promise<unknown>): Promise<void> {
    const prisma = h.app.get(PrismaService);
    let count = 0;
    const listener = () => count++;
    prisma.queryListeners.add(listener);
    try {
      await fn();
    } finally {
      prisma.queryListeners.delete(listener);
    }
    expect(count).toBe(expected);
  }

  beforeAll(async () => {
    h = await createTestApp();
    adminToken = await h.login('admin@tenant-a.local');
    staffToken = await h.login('staff@tenant-a.local');

    // Seed sản phẩm — ≥20 dòng để N+1 lộ mặt (cookbook §11)
    const agent = request(h.app.getHttpServer());
    for (let i = 1; i <= 25; i++) {
      const res = await agent
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `SP${String(i).padStart(3, '0')}`,
          name:
            i === 1
              ? { vi: 'Máy xét nghiệm' } // KHÔNG có en — ca fallback của §3.10
              : { vi: `Sản phẩm ${i}`, en: `Product ${i}` },
          baseUom: 'CAI',
          costPrice: `${i * 1000}.00`,
        });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  // ==================== #12 — đếm query ====================

  it('#12 GET /products (25 dòng) đúng 2 query: findMany + count — không N+1', async () => {
    // Warm-up (permission cache Redis)
    await request(h.app.getHttpServer())
      .get('/api/v1/products?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);

    await expectQueryCount(2, async () => {
      const res = await request(h.app.getHttpServer())
        .get('/api/v1/products?limit=50')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      // ≥25: file test khác có thể đã thêm sản phẩm cùng tenant (DB dùng chung)
      expect(res.body.data.length).toBeGreaterThanOrEqual(25);
    });
  });

  // ==================== #13 — locale fallback NHẤT QUÁN ====================

  it('#13 display: X-Locale=en nhưng thiếu bản dịch → fallback vi (không null)', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/products?filter[code][eq]=SP001')
      .set('X-Locale', 'en')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Máy xét nghiệm'); // fallback vi ✓
  });

  it('#13 search q (en): tìm "may xet nghiem" KHÔNG DẤU vẫn ra — cột search fallback ở tầng dữ liệu', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/products?q=may xet nghiem')
      .set('X-Locale', 'en')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { code: string }) => r.code)).toContain('SP001');
  });

  it('#13 filter contains (en) không dấu + có dấu đều ra cùng kết quả', async () => {
    const [khongDau, coDau] = await Promise.all([
      request(h.app.getHttpServer())
        .get('/api/v1/products?filter[name][contains]=xet nghiem')
        .set('X-Locale', 'en')
        .set('Authorization', `Bearer ${adminToken}`),
      request(h.app.getHttpServer())
        .get('/api/v1/products?filter[name][contains]=Xét Nghiệm')
        .set('X-Locale', 'en')
        .set('Authorization', `Bearer ${adminToken}`),
    ]);
    expect(khongDau.body.data).toHaveLength(1);
    expect(coDau.body.data).toHaveLength(1);
    expect(khongDau.body.data[0].code).toBe(coDau.body.data[0].code);
  });

  it('#13 sort theo name (en): SP001 thiếu en vẫn xếp theo giá trị fallback vi, không chìm xuống NULL', async () => {
    // filter[code][startsWith]=SP0: chỉ dữ liệu của FILE NÀY — file test khác
    // có thể đã bơm hàng trăm nghìn sản phẩm cùng tenant (DB dùng chung)
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/products?filter[code][startsWith]=SP0&sort=name&limit=50')
      .set('X-Locale', 'en')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((r: { name: string }) => r.name);
    const idx = names.indexOf('Máy xét nghiệm');
    expect(idx).toBeGreaterThanOrEqual(0);
    // 'may xet nghiem' (normalize) đứng trước 'product ...' và 'san pham ...'
    expect(idx).toBeLessThan(names.indexOf('Product 10'));
  });

  it('filter DSL: between + in + phân trang meta đúng (§3.5)', async () => {
    const res = await request(h.app.getHttpServer())
      .get(
        '/api/v1/products?filter[costPrice][between]=5000,10000&sort=costPrice&page=1&limit=3',
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(6); // 5k..10k
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.hasNext).toBe(true);
  });

  it('#11 (mở rộng GĐ4): STAFF thiếu field:cost → filter/sort costPrice → 400 + cột ẩn', async () => {
    const sort = await request(h.app.getHttpServer())
      .get('/api/v1/products?sort=costPrice')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(sort.status).toBe(400);

    const filter = await request(h.app.getHttpServer())
      .get('/api/v1/products?filter[costPrice][gte]=1')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(filter.status).toBe(400);

    const list = await request(h.app.getHttpServer())
      .get('/api/v1/products?limit=1')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).not.toHaveProperty('costPrice');
  });

  it('field ngoài whitelist → 400 (§3.5)', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/products?filter[nameViSearch][contains]=x')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  // ==================== #14 — soft delete + unique ====================

  it('#14 xoá mềm rồi tạo lại CÙNG code trong CÙNG tenant → thành công (partial unique)', async () => {
    const agent = request(h.app.getHttpServer());
    const create = await agent
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SP-DUP', name: { vi: 'Bản một' }, baseUom: 'CAI' });
    expect(create.status).toBe(201);

    // Tạo trùng khi bản cũ CÒN SỐNG → DB chặn (unique violation → 500/409)
    const dupWhileAlive = await agent
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SP-DUP', name: { vi: 'Bản trùng' }, baseUom: 'CAI' });
    expect(dupWhileAlive.status).toBeGreaterThanOrEqual(400);

    const del = await agent
      .delete(`/api/v1/products/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    // Sau xoá mềm → tạo lại cùng code OK (test #14)
    const recreate = await agent
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SP-DUP', name: { vi: 'Bản hai' }, baseUom: 'CAI' });
    expect(recreate.status).toBe(201);

    // Bản xoá mềm không hiện trong list
    const list = await agent
      .get('/api/v1/products?filter[code][eq]=SP-DUP')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].name).toBe('Bản hai');
  });

  it('optimistic locking: PATCH với version cũ → 409 VERSION_CONFLICT (#17 sớm)', async () => {
    const agent = request(h.app.getHttpServer());
    const create = await agent
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SP-VER', name: { vi: 'Phiên bản' }, baseUom: 'CAI' });
    const id = create.body.id as string;

    const ok = await agent
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ version: 1, name: { vi: 'Sửa lần 1' } });
    expect(ok.status).toBe(200);

    const stale = await agent
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ version: 1, name: { vi: 'Sửa đè' } });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('COMMON.VERSION_CONFLICT');
  });

  // ==================== saved views + preferences (§5C.2) ====================

  it('saved view: tạo → liệt kê → người khác không sửa được → xoá cứng', async () => {
    const agent = request(h.app.getHttpServer());
    const create = await agent
      .post('/api/v1/saved-views')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entity: 'Product',
        name: 'Giá vốn cao',
        config: { filters: { costPrice: { gte: '10000' } }, sort: '-costPrice' },
      });
    expect(create.status).toBe(201);
    const viewId = create.body.id as string;

    const list = await agent
      .get('/api/v1/saved-views?entity=Product')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.some((v: { id: string }) => v.id === viewId)).toBe(true);

    // STAFF không sửa được view của admin (không shared → cũng không thấy)
    const patchByOther = await agent
      .patch(`/api/v1/saved-views/${viewId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Chiếm đoạt' });
    expect(patchByOther.status).toBe(404);

    const del = await agent
      .delete(`/api/v1/saved-views/${viewId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
  });

  it('preferences: PATCH /me/preferences upsert key hợp lệ; key lạ → 422', async () => {
    const agent = request(h.app.getHttpServer());
    const patch = await agent
      .patch('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ density: 'compact', pageSize: 50 });
    expect(patch.status).toBe(200);
    expect(patch.body.density).toBe('compact');

    const bad = await agent
      .patch('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ hackKey: true });
    expect(bad.status).toBe(422);
  });
});
