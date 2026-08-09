import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';
import { collectRoutes, routeKey, type RouteInfo } from './setup/route-inventory';
import { ROUTE_FIXTURES, type FixtureCtx, type RouteFixture } from './setup/route-fixtures';

/**
 * U6 — id của tenant khác phải trả 404, KHÔNG phải 403 (test-catalog §2.3).
 *
 * Vì sao 404 chứ không 403: 403 nói "bản ghi này CÓ tồn tại nhưng bạn không
 * được xem". Ghép với việc đoán id, đó là kênh dò sự tồn tại xuyên tenant.
 * Spec §3.6 gộp "không tồn tại" và "ngoài phạm vi" vào cùng một mã đúng vì thế.
 *
 * Đây là ca cuối của tầng 1. Nó cần fixture riêng cho từng route vì bốn lý do
 * ở §2.3 (entity global, tài nguyên của chính mình, body bắt buộc, precondition
 * trạng thái) — bắn bừa một UUID vào mọi route có `:id` chỉ đo được tầng
 * validation, không chạm tới tầng tenant.
 */
describe('U6 — cách ly tenant theo id (test-catalog §2.3)', () => {
  let h: TestHarness;
  let routes: RouteInfo[];
  let withId: RouteInfo[];
  let fixtureCtx: FixtureCtx;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    h = await createTestApp();
    routes = collectRoutes(h.app);
    withId = routes.filter((r) => /:\w*[Ii]d\b/.test(r.path));

    tokens.staff = await h.login('staff@tenant-a.local');
    tokens.manager = await h.login('manager@tenant-a.local');
    tokens.admin = await h.login('admin@tenant-a.local');

    // membership của tenant B — vài bảng bắt buộc có, và /users/:id nhận chính nó
    const membershipB = await h.ctx.runWith({ tenantId: h.seed.tenantB.tenantId }, () =>
      h.prisma.client.tenantMembership.findFirstOrThrow(),
    );

    fixtureCtx = {
      prisma: h.prisma,
      ctx: h.ctx,
      inTenant: (tenantId, fn) => h.ctx.runWith({ tenantId }, fn),
      tenantB: h.seed.tenantB.tenantId,
      membershipB: membershipB.id,
    };
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  // ── Lưới: route mới không lọt qua U6 một cách im lặng ─────────────────────
  it('mọi route có :id đều khai fixture', () => {
    const missing = withId.map(routeKey).filter((k) => !(k in ROUTE_FIXTURES));
    expect(
      missing,
      'Thêm fixture cho các route này vào test/setup/route-fixtures.ts — ' +
        'nếu route KHÔNG thuộc tenant thì khai ownership global/self/not-entity kèm `why`',
    ).toEqual([]);
  });

  it('fixture khai thừa (route đã đổi tên hoặc bị xoá) → dọn đi', () => {
    // Dòng chết trong registry che cho một route mới trùng tên trong tương lai.
    const known = new Set(withId.map(routeKey));
    expect(Object.keys(ROUTE_FIXTURES).filter((k) => !known.has(k))).toEqual([]);
  });

  it('mọi fixture KHÔNG áp U6 đều phải nêu lý do', () => {
    const noReason = Object.entries(ROUTE_FIXTURES)
      .filter(([, f]) => f.ownership !== 'tenant' && !f.why?.trim())
      .map(([k]) => k);
    expect(noReason, 'ownership khác `tenant` thì bắt buộc có `why`').toEqual([]);
  });

  it('mọi fixture ownership=tenant đều có seed', () => {
    const noSeed = Object.entries(ROUTE_FIXTURES)
      .filter(([, f]) => f.ownership === 'tenant' && !f.seed)
      .map(([k]) => k);
    expect(noSeed).toEqual([]);
  });

  // ── Ca chính ──────────────────────────────────────────────────────────────
  it('id của tenant B → 404 (KHÔNG phải 403, KHÔNG phải 5xx)', async () => {
    const tenantRoutes = withId.filter(
      (r) => ROUTE_FIXTURES[routeKey(r)]?.ownership === 'tenant',
    );
    expect(tenantRoutes.length).toBeGreaterThan(20);

    const leaked: string[] = [];
    const crashed: string[] = [];
    const other: string[] = [];

    for (const r of tenantRoutes) {
      const key = routeKey(r);
      const fx = ROUTE_FIXTURES[key] as RouteFixture;
      const entity = await fx.seed!(fixtureCtx);

      let url = r.path.replace(/:(\w*[Ii]d)\b/g, entity.id);
      for (const [name, value] of Object.entries(entity.extraParams ?? {})) {
        url = url.replace(`:${name}`, value);
      }
      // Tham số còn lại không phải id (ví dụ :entity) — cấp giá trị vô hại
      url = url.replace(/:(\w+)/g, 'x');

      const method = r.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
      const res = await request(h.app.getHttpServer())
        [method](url)
        .set('Authorization', `Bearer ${tokens[fx.actor ?? 'admin']}`)
        .send(fx.body ? (fx.body(entity) as object) : undefined);

      if (res.status === 403) leaked.push(`${key} → 403 (tiết lộ sự tồn tại)`);
      else if (res.status >= 500) crashed.push(`${key} → ${res.status}`);
      else if (res.status !== 404) {
        other.push(`${key} → ${res.status} ${JSON.stringify(res.body).slice(0, 100)}`);
      }
    }

    expect(leaked, '403 nói "có tồn tại nhưng bạn không được xem" — §3.6 cấm').toEqual([]);
    expect(crashed, 'id ngoài tenant không được làm 5xx').toEqual([]);
    expect(other, 'phải là 404').toEqual([]);
  }, 300_000);
});
