import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';
import { collectRoutes, routeKey, type RouteInfo } from './setup/route-inventory';
import { LIST_PATHS, PERSONAL_LIST_PATHS } from './setup/list-paths';

/**
 * L12a — bất biến scope PHỔ QUÁT cho MỌI endpoint danh sách (test-catalog §L12).
 *
 *   narrow ⊆ broad  VÀ  narrow.length <= broad.length  VÀ  total hẹp <= total rộng
 *
 * KHÔNG assert `narrow.length < broad.length` — khi mọi bản ghi cùng thuộc
 * scope hẹp thì own == all và `<` đỏ oan (test-catalog: "ít hơn là false
 * positive, tập con mới là bất biến"). Muốn `<` phải có fixture chuyên dụng —
 * đó là L12b (test #37 khẳng định #5 là một L12b cho module generator sinh).
 *
 * Sinh bằng vòng lặp trên route inventory + LIST_PATHS (một nguồn với L16):
 * endpoint danh sách MỚI tự động bị canh, không cần nhớ thêm vào đây.
 * Actor hẹp bị 403 (không có quyền đọc) thì bỏ qua route đó — 403 đã có lưới
 * permission-matrix lo; L12a chỉ so được khi cả hai bên cùng 200.
 */
describe('L12a — narrow ⊆ broad cho mọi endpoint danh sách', () => {
  let h: TestHarness;
  let routes: RouteInfo[];
  let broadToken = '';
  const narrowTokens: Record<string, string> = {};

  const fetchList = async (path: string, token: string) => {
    const res = await request(h.app.getHttpServer())
      .get(`${path}?page=1&limit=100`)
      .set('Authorization', `Bearer ${token}`);
    if (res.status !== 200) return { status: res.status, ids: [], total: null };
    const body = res.body as
      | { data: Array<{ id: string }>; meta?: { total?: number } }
      | Array<{ id: string }>;
    const rows = Array.isArray(body) ? body : body.data;
    const total = Array.isArray(body) ? null : (body.meta?.total ?? null);
    return { status: 200, ids: rows.map((r) => r.id), total };
  };

  beforeAll(async () => {
    h = await createTestApp();
    broadToken = await h.login('admin@tenant-a.local'); // seed: mọi quyền scope all
    narrowTokens.manager = await h.login('manager@tenant-a.local'); // descendants
    narrowTokens.staff = await h.login('staff@tenant-a.local'); // own/department

    routes = collectRoutes(h.app).filter(
      (r) => r.method === 'GET' && LIST_PATHS.has(r.path) && !PERSONAL_LIST_PATHS.has(r.path),
    );

    // Seed dữ liệu bằng token RỘNG để các list không rỗng — bất biến tập con
    // trên list rỗng đúng một cách vô nghĩa.
    const agent = request(h.app.getHttpServer());
    for (let i = 0; i < 3; i++) {
      await agent
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${broadToken}`)
        .send({ code: `L12A-SP-${i}`, name: { vi: `Hàng L12a ${i}` }, baseUom: 'CAI' });
      await agent
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${broadToken}`)
        .send({ code: `L12A-KH-${i}`, name: { vi: `Khách L12a ${i}` } });
    }
  }, 180_000);

  afterAll(async () => {
    await h.close();
  });

  it('không actor hẹp nào thấy bản ghi mà actor rộng không thấy', async () => {
    const offenders: string[] = [];
    let compared = 0;

    for (const r of routes) {
      const broad = await fetchList(r.path, broadToken);
      expect(broad.status, `${routeKey(r)} — admin scope all phải 200`).toBe(200);
      const broadSet = new Set(broad.ids);

      // Tập-con CHỈ so được khi broad lấy TRỌN tập (total ≤ limit) — khi dữ
      // liệu > 1 trang, trang-1 của narrow hợp lệ chứa dòng nằm sâu trong tập
      // broad (phát hiện khi audit-logs vượt 100 dòng ở full-suite).
      const broadComplete = broad.total === null || broad.total <= 100;

      for (const [actor, token] of Object.entries(narrowTokens)) {
        const narrow = await fetchList(r.path, token);
        if (narrow.status !== 200) continue; // không có quyền — lưới khác lo
        compared++;

        const escaped = broadComplete ? narrow.ids.filter((id) => !broadSet.has(id)) : [];
        if (escaped.length > 0) {
          offenders.push(
            `${routeKey(r)} [${actor}] — ${escaped.length} id ngoài tập broad: ${escaped
              .slice(0, 3)
              .join(', ')}`,
          );
        }
        if (broadComplete && narrow.ids.length > broad.ids.length) {
          offenders.push(
            `${routeKey(r)} [${actor}] — narrow ${narrow.ids.length} dòng > broad ${broad.ids.length}`,
          );
        }
        if (narrow.total !== null && broad.total !== null && narrow.total > broad.total) {
          offenders.push(
            `${routeKey(r)} [${actor}] — meta.total hẹp ${narrow.total} > rộng ${broad.total} (L10: count thiếu scope)`,
          );
        }
      }
    }

    // Lưới phải THỰC SỰ so sánh được gì đó — 0 cặp so là lưới chết im lặng
    expect(compared, 'không cặp narrow/broad nào so được — lưới L12a đang chết').toBeGreaterThan(0);
    expect(offenders, 'Scope hẹp trả bản ghi ngoài tập của scope rộng (§4.4)').toEqual([]);
  }, 300_000);
});
