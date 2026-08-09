import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PERMISSIONS } from '@nexus/shared';
import { createTestApp, type TestHarness } from './setup/test-app';
import { collectRoutes, concreteUrl, routeKey, type RouteInfo } from './setup/route-inventory';

/**
 * TẦNG 1 — ca PHỔ QUÁT trên MỌI route (test-catalog §2.2, spec §8.2 #33).
 *
 * Giá trị của tầng này không nằm ở số lượng ca mà ở chỗ: thêm endpoint mới mà
 * quên guard, quên khai permission, hay gõ sai tên permission → file này đỏ
 * ngay, không cần ai nhớ kiểm.
 *
 * U3, U3b, U4 là ba ca đắt giá nhất. Chúng không test HÀNH VI — chúng test
 * TÍNH ĐẦY ĐỦ CỦA CẤU HÌNH, thứ mà review thủ công bỏ sót nhiều nhất.
 *
 * U6 (id của tenant khác → 404) CHƯA có ở đây: nó cần fixture factory seed
 * entity ở đúng trạng thái + body hợp lệ cho từng route, nếu không sẽ nhận 422
 * hoặc 409 TRƯỚC khi chạm tầng tenant và test không kiểm được gì
 * (test-catalog §2.3). Ghi nợ ở progress.md.
 */
describe('Phổ quát — mọi endpoint (test-catalog §2.2)', () => {
  let h: TestHarness;
  let routes: RouteInfo[];
  let guarded: RouteInfo[];
  let token: string;

  beforeAll(async () => {
    h = await createTestApp();
    routes = collectRoutes(h.app);
    guarded = routes.filter((r) => !r.isPublic);
    token = await h.login('staff@tenant-a.local');
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  const call = (r: RouteInfo, bearer?: string) => {
    const agent = request(h.app.getHttpServer());
    const method = r.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const req = agent[method](concreteUrl(r));
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };

  // ── Snapshot TẬP route, không chỉ đếm ───────────────────────────────────
  it('inventory: chụp TẬP route, không phải số lượng', () => {
    // `toBe(116)` là báo động rẻ nhưng yếu: xoá /orders/:id rồi thêm /foo thì
    // vẫn 116 và vẫn xanh. Snapshot tập cho biết ĐÚNG route nào đổi.
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.map(routeKey)).toMatchSnapshot('route-inventory');
  });

  // ── U3: đúng MỘT access policy ──────────────────────────────────────────
  it('U3 mọi route khai ĐÚNG MỘT access policy', () => {
    // Ba loại: @Public · @AllowAuthenticated · @RequirePermission.
    // Khai hai loại cùng lúc cũng sai như không khai: đọc code không biết cái
    // nào thắng.
    const bad = routes.filter((r) => {
      const n = [r.isPublic, r.allowAuthenticated, !!r.permission].filter(Boolean).length;
      return n !== 1;
    });
    expect(bad.map((r) => `${routeKey(r)} → ${r.handler}`)).toEqual([]);
  });

  // ── U3b: route ghi nghiệp vụ phải có @RequirePermission ─────────────────
  /**
   * Allowlist TƯỜNG MINH: route ghi thuộc phiên/tài khoản của CHÍNH người gọi.
   * Danh sách này dài ra là dấu hiệu ai đó đang lách U3b thay vì khai quyền.
   */
  const SELF_SCOPED_WRITES = new Set([
    'POST /api/v1/auth/logout',
    'POST /api/v1/auth/switch-tenant',
    'POST /api/v1/auth/refresh',
    'DELETE /api/v1/me/sessions/:id',
    'PATCH /api/v1/me/preferences',
    'PUT /api/v1/recent-items',
    'PUT /api/v1/favorite-items',
    'DELETE /api/v1/favorite-items/:entity/:entityId',
    'POST /api/v1/notifications/:id/read',
    'POST /api/v1/notifications/read-all',
    'PUT /api/v1/notifications/preferences',

    // Hai nhóm dưới KHÔNG phải self-scoped, nhưng có lý do riêng — đã đọc code:
    //
    // reports: quyền kiểm ĐỘNG theo từng báo cáo trong service
    // (reports.service.ts:69 `if (!ability.can(def.permission)) throw FORBIDDEN`).
    // Registry báo cáo là dữ liệu, nên không khai được một permission tĩnh ở
    // decorator. `reports-gd6b.spec.ts` giữ nhánh kiểm quyền này.
    'POST /api/v1/reports/:id/run',
    'POST /api/v1/reports/:id/export',

    // saved-views: dữ liệu THUỘC người dùng, quyền theo quyền sở hữu chứ không
    // theo vai trò. View chia sẻ vẫn do chính chủ tạo.
    'POST /api/v1/saved-views',
    'PATCH /api/v1/saved-views/:id',
    'DELETE /api/v1/saved-views/:id',
  ]);

  it('U3b route GHI nghiệp vụ đều có @RequirePermission', () => {
    const bad = routes
      .filter((r) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method))
      .filter((r) => !r.isPublic && !r.permission)
      .filter((r) => !SELF_SCOPED_WRITES.has(routeKey(r)));
    expect(bad.map((r) => `${routeKey(r)} → ${r.handler}`)).toEqual([]);
  });

  it('U3b-allowlist: mọi dòng trong allowlist đều là route CÓ THẬT', () => {
    // Allowlist phình ra vì route đã đổi tên/bị xoá là cách nó âm thầm mất
    // tác dụng: một dòng chết che cho một route mới trùng tên trong tương lai.
    const known = new Set(routes.map(routeKey));
    expect([...SELF_SCOPED_WRITES].filter((k) => !known.has(k))).toEqual([]);
  });

  // ── U4: permission khai phải TỒN TẠI trong registry ──────────────────────
  it('U4 không route nào khai permission lạ', () => {
    const known = new Set(PERMISSIONS.map((p) => p.code));
    const bad = routes.filter((r) => r.permission && !known.has(r.permission));
    expect(bad.map((r) => `${routeKey(r)} khai '${r.permission ?? ''}'`)).toEqual([]);
  });

  // ── U1 / U5: không token → 401 đúng hình dạng lỗi ────────────────────────
  it('U1+U5 mọi route có bảo vệ: không token → 401, thân lỗi đúng §3.6', async () => {
    // Chạy trong MỘT `it` thay vì describe.each: 100+ ca riêng lẻ làm báo cáo
    // CI dài vô ích, mà cái ta cần là DANH SÁCH route sai — gom lại rồi assert
    // một lần cho ra đúng danh sách đó.
    const wrongStatus: string[] = [];
    const wrongShape: string[] = [];
    const missingTraceHeader: string[] = [];

    for (const r of guarded) {
      const res = await call(r);
      if (res.status !== 401) {
        wrongStatus.push(`${routeKey(r)} → ${res.status}`);
        continue;
      }
      const body = res.body as { code?: unknown; message?: unknown; traceId?: unknown };
      if (
        typeof body.code !== 'string' ||
        typeof body.message !== 'string' ||
        typeof body.traceId !== 'string'
      ) {
        wrongShape.push(`${routeKey(r)} → ${JSON.stringify(res.body).slice(0, 120)}`);
      }
      // §3.1c: X-Request-Id LUÔN được trả lại, kể cả ở nhánh lỗi
      if (!res.headers['x-request-id']) missingTraceHeader.push(routeKey(r));
    }

    expect(wrongStatus, 'route không trả 401 khi thiếu token').toEqual([]);
    expect(wrongShape, 'thân lỗi không đúng { code, message, traceId }').toEqual([]);
    expect(missingTraceHeader, 'thiếu header X-Request-Id ở nhánh lỗi (§3.1c)').toEqual([]);
  }, 180_000);

  // ── U2: token hết hạn → mã RIÊNG để FE biết đường refresh ───────────────
  it('U2 token hết hạn → 401 kèm mã phân biệt được với "chưa đăng nhập"', async () => {
    // FE dựa vào MÃ để quyết định gọi refresh hay đá về trang login. Trả cùng
    // một mã cho hai tình huống thì hoặc FE refresh vô nghĩa, hoặc đá người
    // dùng đang đăng nhập hợp lệ ra ngoài.
    const expired = await h.expiredToken('staff@tenant-a.local');
    const sample = guarded.filter((r) => r.method === 'GET').slice(0, 12);
    expect(sample.length).toBeGreaterThan(0);

    for (const r of sample) {
      const res = await call(r, expired);
      expect(res.status, routeKey(r)).toBe(401);
      // Khẳng định MÃ CỤ THỂ, không phải tiền tố AUTH.*: nếu chỉ kiểm tiền tố
      // thì guard trả AUTH.UNAUTHENTICATED cho token hết hạn vẫn xanh — đúng
      // cái nhầm lẫn mà ca này tồn tại để chặn.
      expect((res.body as { code?: string }).code, routeKey(r)).toBe('AUTH.TOKEN_EXPIRED');
    }
  }, 120_000);

  // ── U5b: token hợp lệ nhưng thiếu quyền → 403, KHÔNG 500 ─────────────────
  it('U5b thiếu quyền → 403/404, không bao giờ 500', async () => {
    // 500 ở nhánh phân quyền nghĩa là guard ném lỗi thay vì từ chối gọn —
    // người dùng thấy "lỗi hệ thống" cho một tình huống hoàn toàn bình thường.
    const readRoutes = guarded.filter((r) => r.method === 'GET' && r.permission);
    const crashed: string[] = [];

    for (const r of readRoutes) {
      const res = await call(r, token);
      if (res.status >= 500) crashed.push(`${routeKey(r)} → ${res.status}`);
    }
    expect(crashed).toEqual([]);
  }, 180_000);
});
