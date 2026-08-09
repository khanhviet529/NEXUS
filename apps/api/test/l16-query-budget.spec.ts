import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { collectRoutes, routeKey, type RouteInfo } from './setup/route-inventory';

/**
 * L16 — ngân sách query cho MỌI endpoint danh sách (test-catalog §3.1).
 *
 * Phát biểu ĐÚNG của test N+1 là **số query không tăng theo số dòng**, không
 * phải `expectQueryCount(3)`:
 *
 *   - Số cố định chọn sai thì test vô nghĩa
 *   - Refactor hợp lệ (thêm một query cache) làm nó đỏ oan
 *   - Mà đúng cái N+1 gây ra — query tăng TUYẾN TÍNH theo số dòng — thì số cố
 *     định chỉ bắt được khi ai đó tình cờ chọn đúng ngưỡng
 *
 * So `limit=1` với `limit=100`: hai lần gọi cùng một endpoint, cùng bộ lọc,
 * chỉ khác số dòng trả về. Chênh lệch > 0 nghĩa là có query chạy theo dòng.
 *
 * Sinh bằng vòng lặp trên route inventory — endpoint danh sách MỚI tự động
 * được canh, không cần ai nhớ thêm vào danh sách.
 */
describe('L16 — số query không tăng theo số dòng (test-catalog §3.1)', () => {
  let h: TestHarness;
  let listRoutes: RouteInfo[];
  let token = '';

  /**
   * Endpoint danh sách = GET, không có tham số đường dẫn, và nhận `limit`.
   * Chỉ định TƯỜNG MINH thay vì đoán theo tên, vì `GET /me` cũng là GET không
   * tham số mà không phải danh sách.
   */
  const LIST_PATHS = new Set([
    '/api/v1/orders',
    '/api/v1/products',
    '/api/v1/customers',
    '/api/v1/users',
    '/api/v1/org-units',
    '/api/v1/roles',
    '/api/v1/audit-logs',
    '/api/v1/notifications',
    '/api/v1/saved-views',
    '/api/v1/approval-authorities',
    '/api/v1/inventory/balances',
    '/api/v1/webhooks/endpoints',
    '/api/v1/webhooks/deliveries',
  ]);

  const countQueries = async (fn: () => Promise<unknown>): Promise<number> => {
    const prisma = h.app.get(PrismaService);
    let n = 0;
    const listener = () => n++;
    prisma.queryListeners.add(listener);
    try {
      await fn();
    } finally {
      prisma.queryListeners.delete(listener);
    }
    return n;
  };

  beforeAll(async () => {
    h = await createTestApp();
    token = await h.login('admin@tenant-a.local');
    listRoutes = collectRoutes(h.app).filter(
      (r) => r.method === 'GET' && LIST_PATHS.has(r.path),
    );

    // Seed đủ dòng để chênh lệch lộ ra. Dưới ~20 dòng thì N+1 nhẹ lẫn vào
    // nhiễu của các query hạ tầng (nạp permission, phiên…).
    const agent = request(h.app.getHttpServer());
    for (let i = 0; i < 30; i++) {
      await agent
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `L16-SP-${i}`, name: { vi: `Hàng L16 ${i}` }, baseUom: 'CAI' });
      await agent
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `L16-KH-${i}`, name: { vi: `Khách L16 ${i}` } });
    }
  }, 180_000);

  afterAll(async () => {
    await h.close();
  });

  it('mọi endpoint trong LIST_PATHS đều tồn tại thật', () => {
    // Danh sách viết tay lệch khỏi code ngay ở PR kế tiếp nếu không có lưới này.
    const known = new Set(collectRoutes(h.app).map((r) => r.path));
    expect([...LIST_PATHS].filter((p) => !known.has(p))).toEqual([]);
  });

  it('không endpoint danh sách nào bị bỏ sót', () => {
    // GET không tham số đường dẫn mà KHÔNG nằm trong LIST_PATHS thì phải là
    // endpoint đơn lẻ (/me, /health…). Liệt kê ra để người thêm route mới
    // buộc phải phân loại nó.
    const KNOWN_SINGLETONS = new Set([
      '/api/v1/health',
      '/api/v1/me',
      '/api/v1/me/sessions',
      '/api/v1/me/preferences',
      '/api/v1/search',
      '/api/v1/reports',
      '/api/v1/notifications/unread-count',
      '/api/v1/notifications/preferences',
      '/api/v1/recent-items',
      '/api/v1/favorite-items',
      '/api/v1/announcements/active',
      '/api/v1/business-calendar',
      '/api/v1/business-calendar/holidays',
      '/api/v1/admin/tenants',
      '/api/v1/admin/ops/health',
      '/api/v1/admin/ops/queues',
      '/api/v1/approval-authorities/check',
      '/api/v1/tenants/current',
      // Máy tính lịch làm việc — nhận tham số, trả một con số
      '/api/v1/business-calendar/add-working-days',
      '/api/v1/business-calendar/working-minutes',
      // Registry quyền là dữ liệu TĨNH trong mã nguồn, không phân trang nên
      // không nhận `limit` — L16 không áp được và cũng không cần
      '/api/v1/permissions',
    ]);
    const unclassified = collectRoutes(h.app)
      .filter((r) => r.method === 'GET' && !r.path.includes(':'))
      .map((r) => r.path)
      .filter((p) => !LIST_PATHS.has(p) && !KNOWN_SINGLETONS.has(p));
    expect(
      unclassified,
      'GET mới chưa phân loại — thêm vào LIST_PATHS (có phân trang) hoặc KNOWN_SINGLETONS',
    ).toEqual([]);
  });

  it('số query của limit=100 BẰNG số query của limit=1', async () => {
    const agent = () => request(h.app.getHttpServer());
    const offenders: string[] = [];

    for (const r of listRoutes) {
      const call = (limit: number) => () =>
        agent().get(`${r.path}?page=1&limit=${limit}`).set('Authorization', `Bearer ${token}`);

      // Gọi khởi động trước khi đo: lần gọi đầu nạp permission set vào cache,
      // tính vào phép đo sẽ làm q1 cao giả tạo và che mất N+1.
      await call(1)();

      const q1 = await countQueries(call(1));
      const q100 = await countQueries(call(100));

      if (q100 !== q1) {
        offenders.push(`${routeKey(r)} — 1 dòng: ${q1} query · 100 dòng: ${q100} query`);
      }
    }

    expect(
      offenders,
      'Số query tăng theo số dòng = N+1. Nạp quan hệ bằng include/join thay vì lặp.',
    ).toEqual([]);
  }, 300_000);
});
