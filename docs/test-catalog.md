# CATALOG TEST CASE — phủ toàn bộ chức năng

| | |
|---|---|
| **Phiên bản** | **Test Blueprint v1 — FROZEN.** Thêm nhóm test mới → cập nhật §6.2. Đổi cơ chế (5 tầng, oracle-từ-spec, phân loại status) → ADR |

> Dựng từ **116 endpoint thật** trong repo (quét `@Controller` + `@RequirePermission`).
> Mục tiêu: xác nhận **thiết kế đúng**, không phải mô tả hành vi hiện có.

---

# 0. Luật nền: oracle đến từ spec, không từ quan sát

Agent được phép mở browser/gọi API để **phát hiện**, nhưng **không** được lấy response nhận về làm kỳ vọng.

```
❌ SAI — characterization test, khoá bug lại
   gọi GET /orders → nhận 200, data.length = 3
   → viết: expect(status).toBe(200); expect(data).toHaveLength(3)
   Nếu 1 trong 3 dòng là của tenant B thì bug vừa được TEST BẢO VỆ.

✅ ĐÚNG — oracle từ spec
   permission-matrix.md §3: STAFF GET /orders → 200, scope = own
   → viết: expect(status).toBe(200)
           expect(data.every(r => r.createdById === meId)).toBe(true)
   Quan sát chỉ dùng để biết field tên là `createdById`.
```

**Bảng nguồn kỳ vọng — mọi `expect()` phải truy được về một dòng:**

| Loại kỳ vọng | Nguồn |
|---|---|
| Mã HTTP theo vai trò | `permission-matrix.md` §2, §3 |
| Phạm vi dữ liệu (`own`/`dept`/`desc`/`all`) | `permission-matrix.md` §1.2 |
| Cột bị ẩn theo vai trò | `permission-matrix.md` §4 |
| Mã lỗi nghiệp vụ | `packages/shared/src/error-codes.ts` |
| Điều kiện chuyển trạng thái | `packages/shared/src/state-machines.ts` |
| Hình dạng response | spec §3.2 |
| Kiểu dữ liệu (tiền chuỗi, ngày UTC) | spec §3.7 |
| Cú pháp filter/sort | spec §3.4, §3.5 |

**Quan sát ≠ spec → là PHÁT HIỆN phải báo, không phải test phải viết.**

---

# 1. Năm tầng test case

| Tầng | Số ca | Cách viết | Phủ trục nào |
|---|---|---|---|
| **1. Phổ quát** | ~580 | **Vòng lặp** trên route inventory, ~120 dòng code | Bề mặt — 116/116 endpoint |
| **2. Theo lớp** | ~180 | Helper dùng chung cho từng lớp endpoint | Bề mặt — theo nhóm hành vi |
| **3. Riêng nghiệp vụ** | ~90 | Viết tay, chỉ nơi có luật | Điểm nóng |
| **4. Bất biến** (§4B) | 7 property × 5.000 lượt | `fast-check` sinh đầu vào | **Biên & tổ hợp** |
| **5. Ma trận kịch bản** (§4C) | ~32 | Pairwise trên 7 trục biến thiên | **Chiều sâu nghiệp vụ** |

### Ba trục cần phủ — đừng lẫn

| Trục | Tầng phủ nó | Câu hỏi nó trả lời |
|---|---|---|
| **Bề mặt** | 1, 2 | *Mọi endpoint có được canh không?* |
| **Chiều sâu nghiệp vụ** | 5 | *Quy trình có đúng ở mọi biến thể không?* |
| **Biên & suy biến** | 4 | *Giá trị cực trị và tổ hợp cấu hình có làm sai không?* |

Tầng 1–2 cho **độ phủ**, tầng 4–5 cho **giá trị**. Chỉ có tầng 1–2 nghĩa là biết mọi cửa đều có khoá, nhưng không biết trong nhà có đúng thứ mình cần.

---

# 2. TẦNG 1 — Test phổ quát, sinh bằng vòng lặp

## 2.1 Route inventory tự sinh

Không viết tay danh sách 116 endpoint — trích từ chính app đang chạy:

```ts
// apps/api/test/setup/route-inventory.ts
import type { INestApplication } from '@nestjs/common';

export interface RouteInfo {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;                 // '/api/v1/orders/:id/approve'
  permission: string | null;    // @RequirePermission
  isPublic: boolean;            // @Public
  allowAuthenticated: boolean;  // @AllowAuthenticated — U3 cần trường này
  handler: string;              // 'OrdersController.approve'
}

/**
 * ⚠️ IMPLEMENTATION ADAPTER-SPECIFIC, KHÔNG PHẢI ARCHITECTURE CONTRACT.
 * `server._router.stack` là API NỘI BỘ của Express — có thể vỡ khi nâng
 * Express, đổi Nest adapter, hoặc chuyển sang Fastify.
 * Contract lâu dài là hai inventory ở §2.1b; hàm này chỉ là cách hiện thực v1.
 */
export function collectRoutes(app: INestApplication): RouteInfo[] {
  const server = app.getHttpAdapter().getInstance();
  const stack = server._router.stack;
  const out: RouteInfo[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) {
      const path: string = layer.route.path;
      // Lấy permission từ Reflector trên handler tương ứng
      out.push({
        method: m.toUpperCase() as RouteInfo['method'],
        path,
        permission: readMeta(app, layer, PERMISSION_KEY),
        isPublic: readMeta(app, layer, IS_PUBLIC_KEY) === true,
        allowAuthenticated: readMeta(app, layer, ALLOW_AUTHENTICATED_KEY) === true,
        handler: layer.route.stack[0]?.name ?? '?',
      });
    }
  }
  return out;
}
```

## 2.1b Hai inventory tách rời — đây mới là contract

`_router.stack` chỉ là cách lấy dữ liệu nhanh cho v1. Về lâu dài tách hai nguồn, rồi **so khớp chúng**:

| Inventory | Nguồn | Cho biết |
|---|---|---|
| **Surface** | `GET /api/v1/docs-json` (OpenAPI) | method, path, schema request/response |
| **Access policy** | Nest `Reflector` trên handler, hoặc quét AST tĩnh | `@Public` / `@AllowAuthenticated` / `@RequirePermission` |

```ts
it('AR11 surface inventory KHỚP access policy inventory', () => {
  const fromOpenApi = new Set(surfaceInventory().map(k));
  const fromMetadata = new Set(policyInventory().map(k));
  expect([...fromOpenApi].filter((r) => !fromMetadata.has(r)),
    'route có trong OpenAPI mà không có metadata').toEqual([]);
  expect([...fromMetadata].filter((r) => !fromOpenApi.has(r)),
    'route runtime mà thiếu khai Swagger → orval sinh void').toEqual([]);
});
```

Chênh lệch giữa hai tập chính là **nợ Swagger** — repo hiện đang có đúng loại này (`orders` list thiếu `@ApiOkResponse` nên FE phải tự khai `OrderRow`).

## 2.2 Năm ca phổ quát × 116 endpoint

```ts
// apps/api/test/universal.spec.ts
/**
 * Test §8.2 #33 — ca PHỔ QUÁT trên MỌI route. 5 ca × 116 endpoint.
 * Thêm endpoint mới mà quên guard/tenant → file này đỏ ngay, không cần ai nhớ.
 */
describe('Phổ quát — mọi endpoint (§8.2 #33)', () => {
  let routes: RouteInfo[];

  beforeAll(async () => {
    h = await createTestApp();
    routes = collectRoutes(h.app);
    // Snapshot TẬP route, KHÔNG chỉ đếm số lượng.
    // `toBe(116)` là báo động rẻ nhưng yếu: xoá /orders/:id + thêm /foo → vẫn 116, vẫn xanh.
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toMatchSnapshot('route-inventory');
  });

  // ── U1: không token → 401 (trừ route @Public)
  describe.each(routes.filter((r) => !r.isPublic))('$method $path', (r) => {
    it('U1 không token → 401', async () => {
      const res = await callRoute(r, { token: null });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH.UNAUTHENTICATED');
    });
  });

  // ── U2: token hết hạn → 401 TOKEN_EXPIRED (FE dựa vào code này để refresh)
  describe.each(routes.filter((r) => !r.isPublic))('$method $path', (r) => {
    it('U2 token hết hạn → 401 AUTH.TOKEN_EXPIRED', async () => {
      const res = await callRoute(r, { token: expiredToken });
      expect(res.body.code).toBe('AUTH.TOKEN_EXPIRED');
    });
  });

  // ── U3: MỌI route phải khai ĐÚNG MỘT access policy
  //   Repo có 3 loại: @Public · @AllowAuthenticated · @RequirePermission
  //   ĐÃ KIỂM: allow-authenticated.decorator.ts tồn tại — POST /auth/logout,
  //   /auth/switch-tenant, DELETE /me/sessions/:id cố ý chỉ cần đăng nhập.
  //   Bản trước đòi MỌI write có @RequirePermission → false positive.
  it('U3 mọi route khai đúng MỘT access policy', () => {
    const bad = routes.filter((r) => {
      const n = [r.isPublic, r.allowAuthenticated, !!r.permission].filter(Boolean).length;
      return n !== 1;
    });
    expect(bad, `route thiếu policy hoặc khai nhiều policy:\n${fmt(bad)}`).toEqual([]);
  });

  // ── U3b: route ghi NGHIỆP VỤ phải có @RequirePermission
  //   Allowlist là các route ghi thuộc phiên/tài khoản của CHÍNH người gọi
  const SELF_SCOPED_WRITES = [
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
  ];
  it('U3b route ghi nghiệp vụ đều có @RequirePermission', () => {
    const bad = routes
      .filter((r) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method))
      .filter((r) => !r.isPublic && !r.permission)
      .filter((r) => !SELF_SCOPED_WRITES.includes(`${r.method} ${r.path}`));
    expect(bad, `route ghi nghiệp vụ thiếu permission:\n${fmt(bad)}`).toEqual([]);
  });

  // ── U4: permission khai phải TỒN TẠI trong registry
  it('U4 không route nào khai permission lạ', () => {
    const known = new Set(PERMISSIONS.map((p) => p.code));
    const bad = routes.filter((r) => r.permission && !known.has(r.permission));
    expect(bad, `permission không có trong registry:\n${fmt(bad)}`).toEqual([]);
  });

  // ── U5: hình dạng lỗi thống nhất (spec §3.6)
  describe.each(routes.filter((r) => !r.isPublic))('$method $path', (r) => {
    it('U5 lỗi 401 đúng hình dạng { code, message, traceId }', async () => {
      const res = await callRoute(r, { token: null });
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        traceId: expect.any(String),
      });
      expect(res.headers['x-request-id']).toBeTruthy();  // spec §3.1c
    });
  });
});
```

**U3, U3b, U4 là ba ca giá trị nhất tầng 1.** Chúng không test hành vi — chúng test **tính đầy đủ của cấu hình**, và bắt lỗi "thêm endpoint mới mà quên guard".

**`SELF_SCOPED_WRITES` là allowlist tường minh**, phải ngắn và mỗi dòng có lý do. Danh sách dài ra là dấu hiệu ai đó đang lách U3b thay vì khai permission.

## 2.3 Ca phổ quát về cách ly tenant

```ts
// ── U6: mọi route có :id → dùng id của tenant B phải 404 (KHÔNG 403)
//   Spec §3.6: không tồn tại HOẶC ngoài phạm vi đều 404 — không tiết lộ sự tồn tại
const withId = routes.filter((r) => r.path.includes(':id'));

describe.each(withId)('$method $path', (r) => {
  it('U6 id của tenant B → 404, không phải 403', async () => {
    const foreignId = await seedForeignEntity(r);   // tạo ở tenant B
    const res = await callRoute(r, { token: tokenA, params: { id: foreignId } });
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);   // 403 = tiết lộ "có tồn tại nhưng bạn không được xem"
  });
});
```

### U6 KHÔNG áp máy móc cho mọi `:id`

`routes.filter(r => r.path.includes(':id'))` là quá thô. Bốn nhóm phải loại hoặc xử lý riêng:

| Nhóm | Vì sao | Xử lý |
|---|---|---|
| Entity **GLOBAL** (`/admin/tenants/:id`, user global) | Không có tenant để "ngoại lai" | Loại khỏi U6, test riêng ở §S |
| Phiên của **chính người gọi** (`/me/sessions/:id`) | Không phải tài nguyên tenant | Loại |
| Action cần **body** (`version`, `reason`) | Thiếu body → **`422` TRƯỚC khi chạm DB** → test không kiểm được gì | Phải cấp body hợp lệ |
| Action cần **precondition trạng thái** | Sai trạng thái → `409` trước khi kiểm tenant | Phải seed entity ở đúng trạng thái |

**Nên cần một fixture factory, không phải bảng `ENTITY_OF`:**

```ts
interface SeededEntity {
  id: string;
  /** BẮT BUỘC trả về — action dùng optimistic locking cần nó trong body */
  version?: number;
  extraParams?: Record<string, string>;
}

interface RouteFixture {
  /** Loại sở hữu — quyết định U6 có áp được không */
  ownership: 'tenant' | 'global' | 'self';
  /** Tạo entity ở tenant CHỈ ĐỊNH, ở ĐÚNG TRẠNG THÁI để action chạy được */
  seed?(tenantId: string): Promise<SeededEntity>;
  /** Actor CÓ ĐỦ QUYỀN — thiếu quyền thì nhận 403, không phải 404 */
  actor?: 'staff' | 'manager' | 'admin';
  /** Body hợp lệ — thiếu sẽ nhận 422 TRƯỚC khi kiểm tenant */
  body?: (e: SeededEntity) => unknown;
  /** Chế độ xoá — cho lớp DELETE, xem §3.4 */
  deleteMode?: 'soft' | 'hard' | 'status';
}

const FIXTURES: Record<string, RouteFixture> = {
  'GET /api/v1/orders/:id': {
    ownership: 'tenant', actor: 'manager', seed: seedOrder,
  },
  // ĐÃ KIỂM repo: approve(user, id, dto.version) — TransitionDto CÓ `version`.
  // Thiếu version → 422 trước khi chạm DB → test không kiểm được tenant isolation.
  'POST /api/v1/orders/:id/approve': {
    ownership: 'tenant', actor: 'admin',
    seed: (t) => seedOrder(t, { status: 'PENDING' }),
    body: (e) => ({ version: e.version }),
  },
  'DELETE /api/v1/orders/:id': {
    ownership: 'tenant', actor: 'admin',
    seed: (t) => seedOrder(t, { status: 'DRAFT' }),   // chỉ DRAFT xoá được
    deleteMode: 'soft',
  },
  'DELETE /api/v1/me/sessions/:id':  { ownership: 'self' },   // U6 KHÔNG áp
  'PATCH /api/v1/admin/tenants/:id': { ownership: 'global' }, // U6 KHÔNG áp
};
```

**Luật:** route có `:id` mà **chưa có fixture** → test **ĐỎ** kèm thông báo *"thêm fixture cho route này"*. Như vậy thêm endpoint mới không thể lọt qua U6 một cách im lặng.

---

# 3. TẦNG 2 — Test case theo lớp endpoint

Mỗi lớp có bộ ca cố định. Viết **một helper** rồi gọi cho từng endpoint trong lớp.

## 3.1 Lớp LIST — 15 endpoint

`GET /orders` `/products` `/customers` `/users` `/org-units` `/roles` `/audit-logs` `/notifications` `/saved-views` `/approval-authorities` `/reports` `/search` `/inventory/balances` `/webhooks/endpoints` `/webhooks/deliveries`

| Ca | Kỳ vọng | Nguồn |
|---|---|---|
| L1 | Hình dạng `{ data, meta }`, meta đủ `page/limit/total/totalPages/hasNext` | §3.2 |
| L2 | `?limit=99999` → **CHỐT MỘT trong hai, không mơ hồ**: `@Max(100)` + `ValidationPipe` → **`422`**; hoặc clamp về 100 → `200` + `meta.limit=100`. Đọc DTO thật rồi viết test theo | §3.3 |
| L3 | `?page=0` / `?limit=0` → `422` (`@Min(1)`) — **không** phải `400`, vì `ValidationPipe` trả 422 | §3.6 |
| L4 | `?sort=<field ngoài whitelist>` → `400`, **không** im lặng bỏ qua | §3.4 |
| L5 | `?sort=<field không được xem>` → `400` (chống suy luận thứ tự) | §4.4c |
| L6 | `?sort=-createdAt` đúng thứ tự giảm; có tie-breaker `id` ổn định | §3.4 |
| L7 | `?filter[x][eq]=` với mọi operator hợp lệ → đúng kết quả | §3.5 |
| L8 | `?filter[x][badop]=1` → `400` | §3.5 |
| L9 | `?filter[<field lạ>][eq]=1` → `400` | §3.5 |
| L10 | **`total` = COUNT SAU khi áp filter + scope** (không phải tổng bảng) | §3.3 |
| L11 | Phân trang ổn định: page 1 + page 2 không trùng, không thiếu dòng | §3.3 |
| L12a | **Bất biến phổ quát: `narrow ⊆ broad`** và `narrow.length <= broad.length` | §1.2 |
| L12b | **Chỉ với fixture chuyên dụng**: `narrow.length < broad.length` — cần seed sao cho có ít nhất 1 bản ghi **chỉ** scope rộng thấy được | §1.2 |
| L13 | Không dòng nào của tenant B, ở **mọi** vai trò | §4.4b |
| L14 | Cột nhạy cảm bị ẩn đúng theo vai trò | §4.4c |
| L15 | Tiền là **chuỗi**, ngày là **ISO-8601 có Z** | §3.7 |
| **L16** | **Query budget: `queryCount(1 dòng) == queryCount(100 dòng)`** | §4.6 |

### L12 — "ít hơn" là false positive, "tập con" mới là bất biến

Nếu seed có 10 đơn và **cả 10 đều do cùng một STAFF tạo** thì `own = 10` và `all = 10`. RBAC vẫn hoàn toàn đúng, nhưng assert `narrow.length < broad.length` sẽ đỏ oan.

| Ca | Chạy ở đâu | Assert |
|---|---|---|
| L12a | Mọi endpoint list, sinh bằng vòng lặp | `narrow ⊆ broad` **và** `length <=` |
| L12b | Fixture chuyên dụng: seed 1 bản ghi của người khác/đơn vị khác | `length <` — chỉ lúc này mới có ý nghĩa |

**L2/L3 — đừng để "cap cứng" mơ hồ.** `@Max(100)` với `ValidationPipe({ whitelist, forbidNonWhitelisted })` sẽ **từ chối 422**, không clamp. Nếu muốn clamp thì phải viết transform tường minh. Đọc DTO trước khi viết test, và ghi quyết định vào §3.3 của spec.

**L10 là ca hay hỏng nhất và ít ai test.** Rất dễ viết `count()` thiếu điều kiện scope → phân trang sai âm thầm.

### L16 — cách phát biểu ĐÚNG của test N+1

`expectQueryCount(3)` với số cố định là cách yếu: chọn sai số thì test vô nghĩa, và refactor hợp lệ làm nó đỏ oan. Bản chất của N+1 là **số query tăng theo số dòng**:

```ts
it('L16 GET /orders — số query KHÔNG tăng theo số dòng', async () => {
  const q1   = await countQueries(() => list({ limit: 1 }));
  const q100 = await countQueries(() => list({ limit: 100 }));
  expect(q100, `N+1: 1 dòng=${q1} query, 100 dòng=${q100} query`).toBe(q1);
});
```

Áp cho **mọi** endpoint danh sách, sinh bằng vòng lặp trên route inventory — thiếu thì ĐỎ.

## 3.2 Lớp CREATE — 12 endpoint

| Ca | Kỳ vọng |
|---|---|
| C1 | Body hợp lệ → `201` + trả object có `id` |
| C2 | Thiếu field bắt buộc → `422` + `details` map **đúng tên field** |
| C3 | **Field lạ trong body → `422`** (whitelist, chống mass assignment §4.10) |
| C4 | Sai kiểu (số cho string) → `422` |
| C5 | Vi phạm unique → `409`, **không phải** `500` |
| C6 | Xoá mềm rồi tạo lại cùng `code` → `201` (partial unique) |
| C7 | `tenantId` trong body → **`422 VALIDATION_FAILED`** — DTO không khai nên `forbidNonWhitelisted` từ chối |
| C8 | `id` trong body → **`422`** cùng lý do |
| C9 | Sau khi tạo, đọc từ DB: `tenantId` = tenant của token, `createdById` = người gọi |
| C10 | Có ghi `audit_logs` với `action = create` |
| C11 | Field JSONB đa ngôn ngữ → cột `*_search` được tính (§3.10) |
| C12 | Cùng `Idempotency-Key` body giống → **một** bản ghi (nếu endpoint hỗ trợ) |
| C13 | Cùng `Idempotency-Key` body **khác** → `409 IDEMPOTENCY_KEY_REUSED` |

**C7 là ca bảo mật quan trọng nhất của lớp này.** Nếu body ghi đè được `tenantId` thì toàn bộ cách ly vô nghĩa.

**Kỳ vọng là `422`, KHÔNG phải "bị bỏ qua"** — bản trước viết "ignore", mâu thuẫn với chính C3. Với `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` (§4.1), field không khai trong DTO **phải** bị từ chối. Từ chối rõ ràng an toàn hơn bỏ qua im lặng: client biết mình gửi sai.

## 3.3 Lớp UPDATE — 6 endpoint

| Ca | Kỳ vọng |
|---|---|
| U1 | `PATCH` một field → chỉ field đó đổi, field khác giữ nguyên |
| U2 | Thiếu `version` → `422`, hoặc theo hợp đồng đã chốt |
| U3 | **`version` cũ → `409 COMMON.VERSION_CONFLICT`** |
| U4 | Sửa bản ghi tenant B → `404` |
| U5 | Sửa bản ghi ở trạng thái không cho sửa → `409` mã nghiệp vụ đúng |
| U6 | Audit ghi `before`/`after` **chỉ chứa field đã đổi**, không chứa cột nhạy cảm |
| U7 | `updatedById` = người gọi, `updatedAt` thay đổi |

## 3.4 Lớp DELETE — 7 endpoint

| Ca | Kỳ vọng |
|---|---|
| D1 | Xoá thành công → `204`; `GET` lại → `404` |
| D2 | **CHỈ khi `fixture.deleteMode === 'soft'`**: dòng vẫn còn trong DB, `deleted_at` khác NULL. `hard` → dòng biến mất. `status` → cột trạng thái đổi (vd `tenant_memberships` dùng `status`, §6.2) |
| D3 | **Đang được tham chiếu → `409 COMMON.HAS_REFERENCES` + `details.references` có `label`/`count`/`link`** |
| D4 | Xoá bản ghi tenant B → `404` |
| D5 | Xoá hai lần → lần hai `404` |
| D6 | Vai trò không có quyền xoá → `403` |

**D3 là ca người dùng cảm nhận rõ nhất.** Nếu trả `500 foreign key violation` thì delete guard không hoạt động.

## 3.5 Lớp ACTION nghiệp vụ — ~20 endpoint

`POST /orders/:id/{submit,approve,reject,cancel}`, `/users/:id/{disable,unlock,offboard,transfer-org,roles}`, `/webhooks/endpoints/:id/{enable,rotate-secret}`, `/notifications/:id/read`, `/admin/tenants/:id/{suspend,activate}`, `/admin/ops/queues/:name/retry-failed`, `/webhooks/deliveries/:id/replay`

### Ba loại action — A1/A2 CHỈ áp cho loại thứ nhất

```ts
type ActionKind =
  | 'STATE_TRANSITION'  // orders: submit/approve/reject/cancel — có máy trạng thái
  | 'COMMAND'           // rotate-secret, retry-failed, replay, enable/disable endpoint
  | 'SELF_COMMAND';     // notifications/:id/read, me/sessions — tài nguyên của chính người gọi
```

Bản trước ép một helper chạy cả `approve` và `rotate-secret`. Sai — `rotate-secret` không có `INVALID_TRANSITION`.

| Ca | Áp cho | Kỳ vọng |
|---|---|---|
| A1 | `STATE_TRANSITION` | Trạng thái đúng → thành công, trạng thái mới khớp máy trạng thái |
| A2 | `STATE_TRANSITION` | **Trạng thái sai → `409 INVALID_TRANSITION`**, trạng thái **không đổi** |
| A3 | **Mọi loại** | Theo `RepeatSemantics` khai riêng (xem dưới) |
| A4 | Mọi loại | Thiếu permission → `403`, không tác dụng phụ |
| A5 | `STATE_TRANSITION` + `COMMAND` | Bản ghi tenant B → `404`. **`SELF_COMMAND` không áp** — không phải tài nguyên tenant |
| A6 | Action có `auditAction` khai | Ghi audit với tên trong `audit-actions.ts` |
| A7 | Action có `emitsOutbox: true` | Có dòng `outbox_events`, `status = PENDING` |
| A8 | Action có `emitsOutbox: true` | Rollback → **không** dòng outbox (§8.2 #20b) |

**Action thiếu `kind` hoặc thiếu `RepeatSemantics` → test ĐỎ.** Buộc người viết action phải khai.

| Ca cũ | Kỳ vọng |
|---|---|
| A3 | **Gọi hai lần → theo CONTRACT của action, không phải luật chung** — xem dưới bảng |
| A4 | Thiếu permission → `403`, trạng thái không đổi |
| A5 | Bản ghi tenant B → `404` |
| A6 | Có ghi audit với `action` đúng tên trong `audit-actions.ts` |
| A7 | Action phát event → có dòng trong `outbox_events`, `status = PENDING` |
| A8 | Action rollback → **không** có dòng outbox (§8.2 #20b) |

### A3 — hợp đồng idempotency khai theo từng action

Bản trước quy định *"gọi hai lần → lần hai 409"* cho mọi action. **Sai.** `notifications/:id/read`, `webhooks/endpoints/:id/enable`, `queues/:name/retry-failed` có ngữ nghĩa khác.

Khai metadata trên từng action:

```ts
type RepeatSemantics =
  | 'REJECT_REPEAT'    // đổi trạng thái một chiều: submit, approve, reject, cancel
  | 'IDEMPOTENT'       // gọi lại cho cùng kết quả: mark-read, enable, disable
  | 'REPEAT_ALLOWED';  // gọi lại tạo tác dụng mới: retry-failed, replay, rotate-secret
```

| Semantics | Lần gọi thứ hai kỳ vọng |
|---|---|
| `REJECT_REPEAT` | `409` mã nghiệp vụ đúng, trạng thái **không đổi** |
| `IDEMPOTENT` | **`200`**, trạng thái vẫn đúng, **không** tạo bản ghi audit thứ hai |
| `REPEAT_ALLOWED` | `200`, **có** tác dụng mới (delivery mới, secret mới) |

Action **chưa khai** semantics → test **ĐỎ**. Buộc người viết action phải nghĩ về ca này.

## 3.6 Lớp BULK đồng bộ — 1 endpoint

`POST /orders/bulk-approve`

**ĐÃ KIỂM repo:** `orders.controller.ts` có `@HttpCode(200)`, gọi `orders.bulkApprove()` **trực tiếp** — không qua BullMQ. Bản trước xếp nó vào lớp JOB và đòi trả `jobId` → **test sẽ đỏ trên code đúng**.

| Ca | Kỳ vọng |
|---|---|
| BK1 | 100 bản ghi 8 lỗi → HTTP **`200`**, `{ total, succeeded, failed, results[] }` |
| BK2 | `results` liệt kê **đúng 8** dòng lỗi, mỗi dòng có `id` + `code` + `message` |
| BK3 | 92 bản ghi thành công **đã đổi trạng thái thật** trong DB |
| BK4 | Trong danh sách có id của **tenant B** → id đó vào `failed`, **không** bị xử lý |
| BK5 | Thiếu permission → `403`, **không** bản ghi nào đổi |
| BK6 | Danh sách rỗng → `422` |
| BK7 | Vượt giới hạn số lượng (nếu có cap) → `422` |

## 3.6b Lớp JOB bất đồng bộ — 5 endpoint

`POST /exports/products`, `/products/export`, `/products/import`, `/reports/:id/run`, `/reports/:id/export`

| Ca | Kỳ vọng |
|---|---|
| J1 | Trả `jobId` ngay, **không** chờ xử lý xong |
| J2 | Poll job → `PENDING` → `DONE`, có `file_id` khi xong |
| J3 | **Export 10.000 dòng: RAM process không tăng tuyến tính** (§8.2 #26) |
| J4 | Import lỗi từng dòng → `import_rows` có `errors`, job vẫn `DONE` |
| J5 | Kill worker giữa import → resume từ checkpoint, **không** trùng dòng |
| J6 | **File lỗi tải về đã che cột nhạy cảm theo quyền người tải** (§4.7) |
| J7 | Job của tenant B → `404` khi poll bằng token A |
| J8 | Export áp đúng filter hiện tại, không xuất cả bảng |

**J6 hay bị bỏ sót nhất.** File lỗi là một kênh xuất dữ liệu, phải áp field-level như mọi kênh khác.

## 3.7 Lớp FILE — 4 endpoint

| Ca | Kỳ vọng |
|---|---|
| F1 | `POST /files/presign` → trả URL có hạn, upload trực tiếp lên S3 được |
| F2 | Presign cho MIME ngoài whitelist → `422` |
| F3 | Presign vượt dung lượng cho phép → `422` |
| F4 | `POST /files/confirm` với file chưa upload → `409` |
| F5 | **`GET /files/:id` kế thừa quyền entity đính kèm** — không xem được đơn thì không tải được file của đơn |
| F6 | File của tenant B → `404` |
| F7 | Nội dung sai magic bytes so với MIME khai → bị từ chối |

## 3.8 Lớp AUTH — 10 endpoint

| Ca | Kỳ vọng |
|---|---|
| T1 | Login sai mật khẩu → `401`, **cùng message** với email không tồn tại |
| T2 | Sai 10 lần → khoá tài khoản 30 phút |
| T3 | User nhiều membership, không truyền `tenantId` → trả danh sách chọn |
| T4 | **Truyền `tenantId` không có membership → `403`** |
| T5 | Refresh xoay vòng: token cũ **không** dùng lại được |
| T6 | **Dùng lại refresh token đã tiêu → huỷ CẢ family + mọi session** (§4.3d) |
| T7 | `switch-tenant` → token mới có `tenantId` mới; token cũ vẫn dùng cho tenant cũ hay bị huỷ (chốt rồi test theo) |
| T8 | **CSRF: cookie có, header thiếu → `403 AUTH.CSRF_FAILED`** |
| T9 | CSRF: cookie ≠ header → `403` |
| T10 | `Origin` ngoài allowlist → `403` |
| T11 | Gửi **cả** cookie và Bearer → `400` (§4.3b) |
| T12 | Forgot password: email tồn tại vs không tồn tại → **cùng response và cùng thời gian** |
| T13 | Reset token dùng lần hai → `400` |
| T14 | Reset thành công → **mọi session bị thu hồi** |
| T15 | Đổi `org_unit` của membership → **session bị huỷ**, token cũ không còn thấy dữ liệu phòng ban cũ |

**T12 và T15 là hai ca ít ai nghĩ tới.** T12 chống dò tài khoản; T15 là hệ quả của việc nhúng `orgUnitId` vào token (§4.3).

## 3.9 Lớp ADMIN / cross-tenant — 14 endpoint

| Ca | Kỳ vọng |
|---|---|
| S1 | `TENANT_ADMIN` gọi bất kỳ `/admin/*` → `403` |
| S2 | `SYSADMIN` gọi endpoint **cross-tenant có phạm vi tenant** mà thiếu `X-Target-Tenant` → `400`. **KHÔNG** áp cho `GET /admin/tenants`, `/admin/ops/health`, `/admin/ops/queues`, announcement toàn hệ thống — những endpoint này không thuộc tenant nào |
| S3 | `SYSADMIN` + `X-Target-Tenant` → thành công **và ghi `audit_logs` với `CROSS_TENANT_ACCESS`** |
| S4 | Suspend tenant → **mọi session của tenant đó bị huỷ NGAY** |
| S5 | Tenant bị suspend → user login trả `403` mã đúng |
| S6 | Impersonation → audit ghi **cả** `actor_id` và `on_behalf_of_id` |
| S7 | Tắt feature của tenant → endpoint tương ứng trả `403`/`404` |
| S8 | Maintenance mode bật → user thường `503`, sysadmin vẫn vào được |

**S3 là ca quan trọng nhất.** Không có audit thì cross-tenant access là cửa hậu không dấu vết.

---

# 3B. TẦNG 0 — ARCHITECTURE CHECK

> Rẻ nhất, nhanh nhất, bắt được nhiều regression nhất. **Chạy trước mọi test khác** vì không cần DB.
> Repo đã có 5 check trong `tools/checks/` — nhóm này chính thức hoá và mở rộng.

| # | Check | Bắt gì |
|---|---|---|
| AR1 | `new PrismaClient()` **chỉ** trong `PrismaService` (+ allowlist test harness) | Bỏ qua extension → rò rỉ tenant |
| AR2 | Client Prisma trần chỉ dùng trong allowlist tường minh | Cửa hậu tenancy |
| AR3 | **Không `$queryRawUnsafe` / `$executeRawUnsafe`** ở đâu cả | SQL injection |
| AR4 | Kysely **không có** lời gọi write (`insertInto`/`updateTable`/`deleteFrom`) | §4.9 — write qua Kysely không đi qua audit |
| AR5 | Mọi model có mặt trong `TENANCY_POLICY` (đã có) | Model mới quên phân loại |
| AR6 | `SOFT_DELETE_MODELS` vét cạn (đã có) | |
| AR7 | Mọi `@RequirePermission('x')` có `x` trong registry (đã có) | Permission gõ sai |
| AR8 | Không rẽ nhánh theo mã vai trò (đã có) | Phá RBAC |
| AR9 | Module thuộc audit-policy đều gọi `AuditRepository` (đã có) | |
| AR10 | **FE không tự khai type response API** — quét `interface *Response`/`*Row` trong `apps/web` ngoài `packages/api-client` | §2.4 — lệch contract im lặng |
| AR11 | **Route runtime == route trong OpenAPI** | Endpoint thiếu Swagger → orval sinh `void` |
| AR12 | `pnpm gen:api` xong **không có diff** | api-client lỗi thời |
| AR13 | Không token màu/spacing thô trong `.tsx` (§FE) | Phá design token |
| **AR14** | **Không raw SQL write vào bảng HYBRID** (`settings`, `feature_flags`) ngoài allowlist migration | 🔴 Đường duy nhất ghi chéo tenant mà DB không chặn — xem §3C/H12 |

AR10–AR14 là năm check mới. **AR14 là check quan trọng nhất nhóm** (§3C/H12). **AR11 đáng làm ngay** — repo hiện có nợ đúng loại này (`orders` list thiếu `@ApiOkResponse` nên FE phải tự khai `OrderRow`).

---

# 3C. NHÓM HYBRID TENANCY — 🔴 P0

> **ĐÃ KIỂM:** `tenancy.extension.ts:95-104` có nhánh `HYBRID` cho `settings` và `feature_flags`
> (`tenant_id = current OR IS NULL`). Nhưng `grep` toàn bộ `apps/api/test/` cho thấy hai bảng này
> **chỉ xuất hiện tình cờ** ở `gd7.spec.ts` và `backup-restore-gd9.spec.ts` — **không có test cách ly riêng nào**.
>
> Đây là **đường code nguy hiểm nhất** của hệ tenancy, vì nó là ngoại lệ duy nhất được phép đọc dòng
> không thuộc tenant nào. Bug ở đây lọt qua cả 900 test còn lại.

| # | Ca | Kỳ vọng |
|---|---|---|
| H1 | Chỉ có dòng global (`tenant_id IS NULL`) | Tenant A đọc → nhận giá trị global |
| H2 | Global + override của A | A → **override của A**; B → **global** |
| H3 | Override A + override B | A **tuyệt đối không** thấy giá trị B, và ngược lại |
| H4 | A `PATCH` bằng `id` của setting thuộc B | **`404`**, không phải `403`, và **không sửa được** |
| H5 | A `DELETE` setting của B | `404`, dòng của B **còn nguyên** |
| H6 | A sửa/xoá dòng **GLOBAL** (`tenant_id IS NULL`) | **Từ chối** — chỉ SYSADMIN được sửa global |
| H7 | `findUnique` / `findFirst` / `update` / `delete` / `upsert` / `count` | **Tất cả** giữ cách ly — không chỉ `findMany` |
| H8 | Gọi khi **không có tenant context** (job quên set CLS) | **Fail closed** — throw, không trả toàn bộ bảng |
| H9 | A tạo setting cùng `key` với global đang có | Thành công, và A đọc ra giá trị của A (partial unique §6) |
| H10 | `feature_flags` tắt tính năng ở tenant A | Endpoint tương ứng ở A → `403`/`404`; ở B **vẫn chạy** |
| H11 | Cache: A đọc setting (cache), B đọc cùng `key` | B **không** nhận giá trị của A — cache key phải mang `tenantId` |
| H12 | **Raw SQL write vào `settings`/`feature_flags` bị CẤM** ngoài allowlist migration | Architecture check `AR14`, **không** phải test DB |

### H12 — vì sao đây phải là architecture check, không phải test DB

Bản trước ghi *"raw SQL bỏ qua extension → composite/partial unique ở DB vẫn chặn"*. **Sai.**

```sql
UPDATE settings SET value = 'x' WHERE id = '<id của tenant B>';
```

**Không ràng buộc DB nào chặn được câu này.** Composite FK, partial unique, `NOT NULL` — tất cả đều không biết *caller hiện tại thuộc tenant nào*. Không có PostgreSQL RLS thì DB **không có khái niệm tenant của request**.

> **Phân biệt hai loại đe doạ — chúng cần hai cơ chế khác nhau:**
>
> | Đe doạ | DB chặn được? | Cơ chế thật |
> |---|---|---|
> | Tạo child của A trỏ vào parent của B | ✅ **Composite FK** | DB |
> | Tạo row thiếu `tenant_id` | ✅ **`NOT NULL`** | DB |
> | **`UPDATE`/`DELETE` row của tenant khác theo `id`** | ❌ **KHÔNG** | Chỉ extension (hoặc RLS) |

**Hệ quả cho test #3b:** ca *"gọi thẳng Prisma client bỏ qua repository → DB từ chối"* chỉ đúng với **create**. Với **update/delete theo id** thì DB **không** từ chối. Phải sửa #3b thành:

```
#3b-create  gọi thẳng client tạo row thiếu tenantId       → DB chặn (NOT NULL)
#3b-fk      gọi thẳng client tạo child sai tenant          → DB chặn (composite FK)
#3b-update  gọi thẳng client UPDATE row tenant khác theo id → DB KHÔNG chặn
            → phải chặn bằng AR1/AR2 (không cho new PrismaClient ngoài PrismaService)
```

Đây là điều chỉnh quan trọng cho toàn bộ luận điểm *"DB là lưới cuối"*: nó là lưới cuối cho **cấu trúc quan hệ**, không phải cho **quyền truy cập theo id**.

**H7, H8, H11 là ba ca dễ hỏng nhất.** Extension thường chỉ được test qua `findMany`; `upsert` và `count` là hai đường hay bị bỏ sót. H8 là kịch bản thật: worker BullMQ quên `runWith(ctx)`.

---

# 3D. PERMISSION CACHE INVALIDATION

> §4.3 chốt cache `perm:<tenantId>:<userId>`. Mọi thao tác dưới đây **phải** làm nó hết hiệu lực **ngay**.

| # | Thao tác | Kỳ vọng sau thao tác |
|---|---|---|
| PC1 | Gán role cho user | Quyền mới có hiệu lực **ngay lần gọi kế tiếp** |
| PC2 | Bỏ role khỏi user | Quyền cũ mất ngay → `403` |
| PC3 | Sửa `role_permissions` của một role | Mọi user mang role đó đổi ngay |
| PC4 | Xoá permission khỏi role | |
| PC5 | Đổi `scope` của một permission | Phạm vi dữ liệu trả về đổi ngay |
| PC6 | Suspend membership | Mọi request → `401`/`403` ngay |
| PC7 | Chuyển `org_unit` của membership | **Session bị huỷ** (§4.3), token cũ không thấy dữ liệu phòng ban cũ |
| PC8 | Đổi `parent_id` trong cây đơn vị | Scope `descendants` đổi ngay cho **toàn tenant** — không chỉ user bị đổi |
| PC9 | Xoá role đang được dùng | Theo `ON DELETE RESTRICT` → `409` kèm delete guard |

**PC8 là ca ít ai nghĩ tới:** đổi cha một đơn vị làm đổi `path` ltree của cả nhánh, nên phải invalidate cache của **mọi user trong tenant**, không chỉ user thuộc nhánh đó.

---

# 3E. AUTH — bổ sung T16–T25

| # | Ca | Kỳ vọng |
|---|---|---|
| T16 | Rate limit đăng nhập | Vượt ngưỡng → `429` + header `Retry-After` |
| T17 | Rate limit theo IP và theo email **độc lập** | Khoá email không khoá IP khác và ngược lại |
| T18 | **Hai request refresh song song cùng một token** | Đúng **một** thành công; không tạo được hai family hợp lệ |
| T19 | Session đã thu hồi, access token **chưa** hết hạn | Vẫn `401` — kiểm tra Redis, không chỉ verify JWT |
| T20 | Tenant bị suspend | Token cũ **lập tức** vô hiệu |
| T21 | Thuộc tính cookie | access + refresh `HttpOnly`; `Secure` ở production; refresh có `Path` giới hạn; `csrf_token` **không** HttpOnly |
| T22 | Request dùng `Bearer` | **Không** yêu cầu CSRF (§4.3b) |
| T23 | JWT bị sửa `tenantId` hoặc chữ ký | `401`, **không** đọc được dữ liệu tenant khác |
| T24 | Lời mời hết hạn / dùng lại | `400`, không tạo được tài khoản |
| T25 | Cấp token reset mới | Token reset **cũ chưa dùng** cũng vô hiệu (§4.3c) |

### Sửa T12 — không assert thời gian chính xác

```ts
expect(timeA).toBe(timeB)     // ❌ flaky trên CI dùng chung
```

Thay bằng ba tầng:

| Kiểm gì | Ở đâu |
|---|---|
| Response **giống hệt nhau** (status, body, header) | **PR gate** |
| Cả hai nhánh đều **đẩy mail qua queue**, không gửi đồng bộ | PR gate — kiểm bằng cách đếm job trong queue |
| Phân bố thời gian không lệch có ý nghĩa thống kê | **Suite security, nightly** — 200 mẫu, so trung vị |

---

# 3F. SECURITY SUITE — nightly / release

## SSRF (🔴 quan trọng nhất nhóm)

Mọi field nhận URL (`webhook_endpoints.url`, import từ link) phải **từ chối**:

```
http://127.0.0.1        http://localhost         http://[::1]
http://169.254.169.254  (metadata cloud)         http://0.0.0.0
10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16      fc00::/7
http://evil.com → redirect 302 → http://127.0.0.1   ← phải chặn CẢ redirect
DNS trỏ về IP private                                ← resolve rồi mới kiểm
```

Ca cuối là ca hay bị bỏ: whitelist theo hostname không đủ, phải resolve DNS rồi kiểm IP.

## Secret (§4.11)

| # | Ca |
|---|---|
| SC1 | Plaintext secret **không** có trong DB — đọc trực tiếp cột, phải là ciphertext |
| SC2 | `GET /webhooks/endpoints` **không** trả secret, chỉ `••••1234` |
| SC3 | Secret **không** xuất hiện trong `integration_logs.request/response` |
| SC4 | Rotate → `current` + `previous` cùng verify được trong cửa sổ |
| SC5 | Hết cửa sổ rotation → `previous` **không** còn hiệu lực |
| SC6 | `key_version` cho phép giải mã dữ liệu mã hoá bằng khoá cũ |

## HTTP headers & error leak

```
CSP · HSTS (production) · X-Content-Type-Options · CORS allowlist
500 → KHÔNG stack trace · KHÔNG câu SQL · KHÔNG đường dẫn local · CÓ traceId
404 cho "không tồn tại" và "ngoài phạm vi" phải GIỐNG NHAU
```

## Log redaction

Bơm giá trị nhận dạng được rồi grep toàn bộ log: `Authorization` · `password` · refresh token · `nationalId` · `salary` · webhook secret — **không được xuất hiện**.

---

# 3G. WEBHOOK — module riêng

| # | Ca |
|---|---|
| W1 | Secret plaintext trả **đúng một lần** lúc tạo |
| W2 | DB chứa ciphertext (§4.11) |
| W3 | HMAC `t/v1` verify được bằng secret đã cấp |
| W4 | Rotate → `v1` (current) và `v1prev` cùng valid trong cửa sổ |
| W5 | Hết cửa sổ → `v1prev` invalid |
| W6 | Retry theo exponential backoff, `next_retry_at` đúng |
| W7 | 10 lỗi liên tiếp → endpoint **tự tắt**, `disabled_at` được ghi |
| W8 | Một lần thành công → `failure_count` **reset về 0** |
| W9 | **Replay → REQUEUE dòng hiện có** (`status='PENDING'`, `nextRetryAt=null`), **KHÔNG** tạo dòng mới |
| W10 | Cùng `event_id` → **không** tạo delivery trùng — `@@unique([tenantId, endpointId, eventId])` |
| W11 | Hai worker song song → không cùng claim một delivery |
| W12 | Endpoint của tenant B → A không xem/sửa/replay được (`404`) |
| W13 | URL SSRF → `422` khi tạo endpoint |
| W14 | **Payload không rò rỉ field-level** — webhook của tenant có cấu hình ẩn `cost_price` thì payload không chứa nó |

W14 là ca ít ai nghĩ: webhook là **kênh xuất dữ liệu thứ năm** sau API/export/report/audit (§4.4c).

### W9 và W10 KHÔNG mâu thuẫn — nhưng bản trước viết W9 sai

Bản trước ghi *"replay tạo bản ghi delivery mới"*, xung đột trực tiếp với `UNIQUE (tenant, endpoint, event_id)` ở W10.

**ĐÃ KIỂM repo — `webhooks.repository.ts:260`:**

```ts
async replay(id: string) {
  return this.prisma.client.webhookDelivery.updateMany({
    where: { id },
    data: { status: 'PENDING', nextRetryAt: null },
  });
}
```

Repo **requeue dòng hiện có**, không tạo dòng mới. Đúng model, và không cần thêm bảng `WebhookAttempt`:

```
WebhookDelivery = một delivery LOGIC cho một event   (unique theo eventId)
attempts        = bộ đếm số lần đã gửi
replay          = reset status về PENDING
```

**Nhưng có một hạn chế thật, ghi làm `TODO-SPEC`:** với `attempts` chỉ là bộ đếm, bạn **mất lịch sử từng lần gửi** — không biết lần 1 trả 500, lần 2 trả 503. Khi cần điều tra tích hợp thì thiếu dữ liệu.

| Ca | Trạng thái |
|---|---|
| W15 — lịch sử từng lần gửi (`response_status`, `duration`, `error` của mỗi attempt) | **TODO-SPEC** — cần bảng `webhook_attempts` hoặc cột `attempt_log jsonb`. Chưa chốt |

---

# 3H. PROVISION TENANT — nửa vời là trạng thái tệ nhất

Luồng provision: `tenant → org_unit ROOT → roles → role_permissions → approval_authorities → calendar → seed`.

**Cố ý inject failure ở từng bước**, kỳ vọng đúng **một** trong hai thiết kế:

```
A. Rollback sạch     → không còn dấu vết tenant nào
B. tenant.status = PROVISIONING/FAILED, và RETRY hoàn thành được an toàn
```

| # | Ca | Kỳ vọng |
|---|---|---|
| PV1 | Fail ở bước tạo roles | Không tồn tại tenant `ACTIVE` mà **thiếu** role |
| PV2 | Fail ở bước calendar | Không tồn tại tenant `ACTIVE` mà **thiếu** calendar |
| PV3 | Fail ở bước ROOT org unit | Không tồn tại tenant `ACTIVE` mà **thiếu** ROOT |
| PV4 | Retry sau khi fail | Hoàn thành, **không** tạo bản ghi trùng |
| PV5 | Tenant `PROVISIONING` | User **không** đăng nhập được vào nó |

**Tuyệt đối không được có:** `tenant.status = ACTIVE` nhưng thiếu role / calendar / ROOT. Đó là "tenant nửa vời" — sống được nhưng lỗi ở chỗ không ai đoán trước.

---

# 3I. FRONTEND E2E — golden path UI

> Không E2E mọi endpoint. Chỉ những luồng mà **chỉ E2E bắt được**.

| # | Ca |
|---|---|
| E1 | Login web bằng **cookie thật**, không phải Bearer |
| E2 | Access token hết hạn giữa phiên → refresh ngầm, **không** đăng xuất người dùng |
| E3 | Switch tenant → UI và dữ liệu đổi theo |
| E4 | DataTable filter/sort/page → **URL đổi đúng** |
| E5 | **F5** giữ nguyên filter, sort, trang |
| E6 | **Back/Forward** khôi phục đúng trạng thái |
| E7 | Field-level: vai trò không được xem → **cột không render**, và **không có trong menu chọn cột** |
| E8 | `422` từ BE → map vào **đúng field** của form, cuộn tới field đầu tiên |
| E9 | Form còn dữ liệu chưa lưu → **guard khi rời trang** |
| E10 | Double-click submit → **đúng một** mutation |
| E11 | Cmd+K: action thiếu permission **không xuất hiện** |
| E12 | Đổi locale vi/en → nhãn và format số/ngày đổi |
| E13 | Nhập chứng từ **hoàn toàn bằng bàn phím** — `Enter` xuống ô/dòng, `Ctrl+Enter` submit |
| E14 | `axe-core` smoke trên 4 màn chính |

E5, E6, E13 là ba ca **chỉ E2E bắt được** — không unit test nào thay thế.

---

# 4. TẦNG 3 — Test case riêng theo nghiệp vụ

Chỉ viết nơi **có luật nghiệp vụ**. Đây là nơi giá trị tập trung.

## 4.1 Orders — bộ tính tiền (§5B.2/B1)

Golden test, bảng vào–ra cố định. **Đây là nhóm gây tranh chấp thật với khách hàng.**

| Ca | Đầu vào | Kỳ vọng |
|---|---|---|
| M1 | 3 dòng, VAT 10%, không chiết khấu | Tổng khớp giá trị chốt tay |
| M2 | Chiết khấu % **trước** VAT | Theo quy tắc đã chốt, không phải theo code |
| M3 | Chiết khấu số tiền, phân bổ về dòng | Tổng phân bổ = chiết khấu, không lệch 1 đồng |
| M4 | Làm tròn từng dòng vs cả hoá đơn | Có dòng điều chỉnh làm tròn nếu lệch |
| M5 | Hai mức VAT trên một hoá đơn | Bảng kê thuế tách đúng theo mức |
| M6 | Số lẻ gây lệch làm tròn | Tổng các dòng đã tròn = tổng hoá đơn đã tròn |
| M7 | Số lượng thập phân + đơn giá lẻ | Không dùng float, không mất chữ số |

## 4.2 Orders — vòng đời & kiểm soát nội bộ

| Ca | Kỳ vọng |
|---|---|
| O1 | Chuyển trạng thái hợp lệ theo đúng `state-machines.ts` |
| O2 | Mọi chuyển trạng thái **không** hợp lệ → `409`, thử đủ tổ hợp |
| O3 | **Tự duyệt đơn mình tạo → `409 ORDER.SELF_APPROVAL`** |
| O4 | Vượt hạn mức → `409 ORDER.EXCEEDS_LIMIT` |
| O5 | **Không khớp dòng `approval_authorities` nào → `409 NO_APPROVAL_AUTHORITY`** (fail-closed) |
| O6 | Hạn mức khác tiền tệ → fail-closed, không tự quy đổi bừa |
| O7 | Đánh số: `code` liên tục, **không nhảy cóc**, 20 đơn tạo song song → 20 số khác nhau liền mạch |
| O8 | Đơn huỷ vẫn giữ số, số không tái sử dụng |
| O9 | Sửa đơn ở trạng thái không cho sửa → `409 ORDER.NOT_EDITABLE` |

**O7 chạy song song** là ca duy nhất bắt được lỗi cấp số khi scale ngang.

## 4.3 Inventory — bài toán khó nhất (§5B.2/B4)

| Ca | Kỳ vọng |
|---|---|
| I1 | **20 request xuất song song trên cùng lô → tổng xuất ≤ tồn, không âm** |
| I2 | Xuất quá tồn → `409 STOCK.INSUFFICIENT`, tồn **không** đổi |
| I3 | Cùng `(ref_type, ref_id, movement_type)` gọi lại → **không** movement thứ hai |
| I4 | `tracking_type = NONE` → dùng `LOT_SENTINEL`, tồn đúng |
| I5 | `tracking_type = SERIAL` → `COUNT(serial IN_STOCK) == on_hand` |
| I6 | Serial đã `ISSUED` xuất lại → `409` |
| I7 | Bút toán đảo → tồn về đúng giá trị trước, movement gốc **không** bị sửa/xoá |
| I8 | Job rebuild snapshot → khớp tổng movement |
| I9 | **Làm lệch snapshot cố ý → job đối soát PHÁT HIỆN và cảnh báo** |
| I10 | Movement insert vào đúng partition tháng |
| I11 | `DETACH` partition cũ → query hiện tại không ảnh hưởng |
| I12 | Hệ số quy đổi đơn vị đổi sau → chứng từ cũ giữ `uom_factor_snapshot` cũ |

## 4.4 Query engine (§3.4, §3.5, §3.10)

| Ca | Kỳ vọng |
|---|---|
| Q1 | 12 operator × kiểu dữ liệu tương ứng → đúng kết quả |
| Q2 | `contains` **không dấu**: tìm "may xet nghiem" ra "Máy xét nghiệm" |
| Q3 | `contains` không phân biệt hoa thường |
| Q4 | Filter theo field bảng liên kết (`customer.name`) → đúng, **không N+1** |
| Q5 | Sort theo JSONB locale `vi` → dùng index, thứ tự đúng |
| Q6 | **Locale `en` thiếu bản dịch: display, sort, filter, `q` đều fallback `vi` và cho CÙNG kết quả** |
| Q7 | Filter ngày `between` cắt theo `X-Timezone` của request |
| Q8 | Filter + sort + phân trang kết hợp → nhất quán |

**Q6 là ca bắt được lỗi tinh vi nhất** — hiển thị fallback nhưng sort theo NULL.

## 4.5 Nhất quán (§3.9, §4.8)

| Ca | Kỳ vọng |
|---|---|
| N1 | 20 request song song cùng key → **1** resource |
| N2 | Flush Redis rồi retry → vẫn không trùng (lớp DB) |
| N3 | Cùng key body khác → `409 KEY_REUSED` |
| N4 | Đang `PROCESSING` → `409 IN_PROGRESS` + `Retry-After` |
| N5 | Thất bại → row `FAILED`, **không bị xoá** |
| N6 | Outbox: kill worker → event không mất, xử lý lại |
| N7 | Outbox: transaction rollback → event **không** phát |
| N8 | Outbox: cùng `eventId` xử lý 2 lần → trạng thái nội bộ không nhân đôi |
| N9 | **Hai worker song song → không cùng claim một event** (SKIP LOCKED) |
| N10 | Worker chết giữa `PROCESSING` → sau lease timeout event về `PENDING` |

## 4.6 Report framework (§5B.1/A1)

| Ca | Kỳ vọng |
|---|---|
| R1 | Mỗi báo cáo trong registry chạy được, không lỗi SQL |
| R2 | **Áp `ability.scopeWhere()`** — vai trò hẹp thấy số nhỏ hơn |
| R3 | **Áp field-level** — cột giá vốn ẩn theo vai trò |
| R4 | Dòng tổng khớp tổng các dòng |
| R5 | Drill-down link trả về đúng tập bản ghi |
| R6 | Cache key gồm `(tenant, scope, user, locale, params)` — đổi vai trò không lấy cache của người khác |
| R7 | Export báo cáo → file có đúng cột đã lọc theo quyền |
| R8 | Báo cáo của tenant B → `404` |

**R6 là ca rò rỉ dữ liệu qua cache** — nếu cache key thiếu `user`/`scope`, người ít quyền sẽ nhận kết quả của người nhiều quyền.

## 4.7 Search & audit

| Ca | Kỳ vọng |
|---|---|
| G1 | Tìm ra bản ghi bằng chuỗi **không dấu** |
| G2 | Kết quả nhóm theo module, chỉ trả cột định danh |
| G3 | **Scope nhúng trong WHERE** — vai trò hẹp ra ít kết quả hơn |
| G4 | **Không index/không tìm được field mà vai trò không được xem** |
| G5 | Không kết quả nào của tenant B |
| G6 | Audit timeline theo entity → đúng thứ tự thời gian |
| G7 | Audit `desc` scope: manager thấy hành động của cấp dưới |
| G8 | **Audit diff không chứa `salary`/`cost_price`/`password_hash`** |
| G9 | Hành động của worker → `actor = system:<jobName>` |
| G10 | Audit là append-only: `UPDATE`/`DELETE` bị trigger chặn |

---

# 4B. TẦNG 4 — Bất biến (property-based testing)

> **Vì sao cần tầng này:** liệt kê ca không phủ được không gian tổ hợp. Bộ tính tiền có `discountBeforeTax` (2) × `roundingMode` (2) × `roundTo` (3) × số dòng × nhiều mức thuế × chiết khấu dòng/tổng — **hàng nghìn tổ hợp**. Mười ca hiện có trong `money-calculator.spec.ts` là mười điểm trong không gian đó.
>
> Thay vì kể ca, **khai bất biến** rồi để máy sinh hàng nghìn đầu vào. `fast-check` tự **thu nhỏ** phản ví dụ về ca tối giản để debug.

```bash
pnpm --filter @nexus/shared add -D fast-check
```

## 4B.1 Hai lỗ đã phát hiện khi đọc code

Trước khi viết bất biến, ghi lại hai tổ hợp **hiện chưa test và chưa guard**:

### Lỗ 1 — `roundTo: 1000` + `roundingMode: 'line'` làm mất tiền

```
roundScaled(400đ, 1000) = divRound(400 + 500, 1000) = 0
→ 10 dòng × 400đ  ⇒  tổng 0đ, nhưng khách nợ 4.000đ
```

Mỗi tuỳ chọn riêng lẻ đều đúng — **tổ hợp mới sai**. Đây chính là loại bug mà enumeration bỏ sót, vì người viết test thử từng tuỳ chọn một.

**Cần quyết định:** chặn tổ hợp này (`roundTo > 1` ⇒ buộc `roundingMode: 'invoice'`), hay chấp nhận và ghi vào ADR.

### Lỗ 2 — `orderDiscountAmount > totalNet`

Dòng cuối nhận `orderDiscount - allocated`, có thể vượt `net` của nó → `line.net` âm → thuế âm → tổng âm. Không có guard.

*(Đã kiểm: `totalNet === 0n` **có** guard `if (totalNet > 0n)` — không có lỗi chia cho 0.)*

**Cần quyết định:** với credit note thì âm hợp lệ; với đơn bán là dữ liệu rác cần `422`. Chốt rồi mới viết bất biến tương ứng.

## 4B.2 Generator

```ts
// packages/shared/test/arbitraries.ts
import fc from 'fast-check';
import type { MoneyLineInput, MoneyConfig } from '../src/money-calculator';

/** Chuỗi decimal không âm, ≤4 chữ số thập phân (đúng SCALE của module) */
const arbDecimal = (max: number, frac = 4) =>
  fc
    .tuple(fc.nat({ max }), fc.nat({ max: 10 ** frac - 1 }))
    .map(([i, f]) => `${i}.${String(f).padStart(frac, '0')}`);

export const arbLine = (): fc.Arbitrary<MoneyLineInput> =>
  fc.record({
    quantity: arbDecimal(1_000),
    unitPrice: arbDecimal(50_000_000),
    // arbDecimal(100,2) sinh được "100.99" → chiết khấu >100%, NGOÀI miền hợp lệ.
    // Property invariant chỉ chạy trên MIỀN HỢP LỆ (§4B.2b).
    discountPercent: fc.option(arbPercent(), { nil: undefined }),
    // Đúng các mức VAT thực tế VN — không sinh số vô nghĩa
    taxRate: fc.option(fc.constantFrom('0', '5', '8', '10'), { nil: undefined }),
  });

export const arbLines = () => fc.array(arbLine(), { minLength: 1, maxLength: 40 });

const SCALE = 10_000n;

/** bigint phần vạn → chuỗi decimal. NGƯỢC của scaled(), KHÔNG qua Number */
export const fromScaledBig = (v: bigint): string => {
  const sign = v < 0n ? '-' : '';
  const abs = v < 0n ? -v : v;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(4, '0').replace(/0+$/, '');
  return frac ? `${sign}${int}.${frac}` : `${sign}${int}`;
};

/**
 * MIỀN HỢP LỆ THẬT — lines và config PHỤ THUỘC NHAU (§4B.2c).
 * TOÀN BỘ số học bằng BigInt. Không có Number ở bất kỳ đâu — xem ghi chú dưới.
 */
export const arbValidMoneyCase = () =>
  arbLines().chain((lines) => {
    // Trần cho orderDiscount = subtotal, giữ nguyên bigint
    const subtotalScaled = scaled(calculateMoney(lines, DEFAULT_MONEY_CONFIG).subtotal);
    return fc.record({
      lines: fc.constant(lines),
      config: fc
        .record({
          discountBeforeTax: fc.boolean(),
          roundTo: fc.constantFrom(1, 100, 1000),
          // fc.bigInt giữ chính xác tuyệt đối; fromScaledBig sinh cả phần thập phân
          // → discount có dạng "100", "100.5", "100.0001" (§4B.2c)
          orderDiscountAmount: fc.option(
            fc.bigInt({ min: 0n, max: subtotalScaled }).map(fromScaledBig),
            { nil: undefined },
          ),
        })
        .map((c) => ({
          ...c,
          // roundTo > 1 BUỘC roundingMode = 'invoice' (CFG1, §4B.3b)
          roundingMode: c.roundTo === 1 ? ('line' as const) : ('invoice' as const),
        })) as fc.Arbitrary<MoneyConfig>,
    });
  });

/** ĐẦU VÀO NGOÀI MIỀN — chỉ cho test validation, KHÔNG cho bất biến */
export const arbInvalidConfig = () =>
  fc.oneof(
    fc.constant({ discountBeforeTax: true, roundingMode: 'line', roundTo: 1000 }),   // CFG1
    fc.constant({ discountBeforeTax: true, roundingMode: 'line', roundTo: 1,
                  orderDiscountAmount: '999999999' }),                              // > subtotal
  );

/** % trong [0,100] — dùng cho MIỀN HỢP LỆ */
export const arbPercent = () =>
  fc.integer({ min: 0, max: 10_000 }).map((n) => (n / 100).toFixed(2));   // "0.00".."100.00"

/** Đọc chuỗi decimal về bigint phần vạn — SO SÁNH bằng số nguyên, KHÔNG float */
export const scaled = (s: string): bigint => {
  const [i, f = ''] = s.split('.');
  const sign = i!.startsWith('-') ? -1n : 1n;
  return sign * (BigInt(i!.replace('-', '')) * 10_000n + BigInt((f + '0000').slice(0, 4)));
};
```

**Luật 1:** mọi so sánh số tiền dùng `scaled()` → `bigint`. `parseFloat` **và `Number()`** trong test đều là tự tạo sai số mà module cố tình tránh.

> **Bản trước vi phạm chính luật này:** generator dùng `Number(scaled(...)) / 10_000`. Với `quantity ≤ 1.000`, `unitPrice ≤ 50.000.000`, **40 dòng** thì subtotal phần vạn lên tới `~2×10¹⁶`, **vượt `Number.MAX_SAFE_INTEGER` (~9×10¹⁵)**. Nghĩa là property test dùng để bắt lỗi precision lại **tự tạo lỗi precision trong generator** — và nó sẽ đỏ ngẫu nhiên ở đúng những ca lớn cần kiểm nhất.
>
> Dùng `fc.bigInt({ min, max })` + `fromScaledBig()`, không đi qua `Number` ở bất kỳ bước nào.

## 4B.2b Tách generator MIỀN HỢP LỆ và ĐẦU VÀO RÁC

| Loại generator | Dùng cho | Ví dụ |
|---|---|---|
| **Miền hợp lệ** (`arbLines`, `arbPercent`) | Bất biến P1–P6 | `discountPercent ∈ [0,100]`, `quantity ≥ 0` |
| **Đầu vào rác** (`arbGarbage`) | Test **validation**, không phải bất biến | `"abc"`, `"-5"`, `"101"`, `""`, `null` |

**Luật 2: bất biến CHỈ chạy trên miền hợp lệ.** Nếu feed `discountPercent: "100.99"` vào rồi kết luận calculator sai, đó là **lỗi của test**, không phải lỗi của code.

## 4B.2c Miền hợp lệ là PHỤ THUỘC, không phải tích Descartes

Đây là hệ quả trực tiếp của việc chốt hai guard ở §4B.3b:

```
roundTo > 1  cùng  roundingMode = 'line'     → NGOÀI miền
orderDiscountAmount > subtotal                → NGOÀI miền
```

Nghĩa là **`arbLines() × arbConfig()` độc lập KHÔNG còn là miền hợp lệ** — nó sinh ra chính hai tổ hợp mà ta coi là invalid, rồi bất biến sẽ đỏ oan.

Phải sinh **phụ thuộc**:

```
sinh lines
   ↓  tính subtotal
sinh orderDiscount ≤ subtotal
   ↓
sinh (roundTo, roundingMode) hợp lệ với nhau
```

Dùng `fc.chain()` (xem `arbValidMoneyCase` ở trên). Đây là lỗi hay gặp nhất khi viết property test: tưởng generator độc lập là đủ, trong khi ràng buộc miền lại liên hệ giữa các tham số.

## 4B.3 Bảy bất biến cho bộ tính tiền

```ts
// packages/shared/test/money-invariants.spec.ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateMoney, DEFAULT_MONEY_CONFIG } from '../src/money-calculator';
import { arbValidMoneyCase, arbInvalidConfig, scaled } from './arbitraries';

/**
 * Test §8.2 #34 — BẤT BIẾN của bộ tính tiền (§5B.2/B1).
 * 7 bất biến × 5.000 lượt sinh > 100 ca liệt kê tay.
 * fast-check tự thu nhỏ phản ví dụ về ca tối giản.
 */
const RUNS = { numRuns: 5_000 };

describe('Bộ tính tiền — bất biến (§8.2 #34)', () => {
  // ── P1: hằng đẳng thức trung tâm
  it('P1 total = Σ amount dòng + roundingAdjustment', () => {
    fc.assert(
      fc.property(arbValidMoneyCase(), ({ lines, config }) => {
        const r = calculateMoney(lines, config);
        const sum = r.lines.reduce((s, l) => s + scaled(l.amount), 0n);
        expect(scaled(r.total)).toBe(sum + scaled(r.roundingAdjustment));
      }),
      RUNS,
    );
  });

  // ── P2: không bao giờ âm khi input không âm
  it('P2 mọi đầu ra ≥ 0 khi mọi đầu vào ≥ 0', () => {
    fc.assert(
      fc.property(arbValidMoneyCase(), ({ lines, config }) => {
        // Bỏ chiết khấu tổng — đó là Lỗ 2, có bất biến riêng ở P7
        const r = calculateMoney(lines, { ...config, orderDiscountAmount: undefined });
        expect(scaled(r.total) >= 0n).toBe(true);
        expect(scaled(r.taxTotal) >= 0n).toBe(true);
        for (const l of r.lines) {
          expect(scaled(l.net) >= 0n, `net âm ở dòng ${l.lineNo}`).toBe(true);
          expect(scaled(l.tax) >= 0n).toBe(true);
        }
      }),
      RUNS,
    );
  });

  // ── P3: chiết khấu tổng phân bổ CHÍNH XÁC TỪNG ĐỒNG
  it('P3 Σ chiết khấu = Σ chiết khấu dòng + chiết khấu tổng đã nhập', () => {
    fc.assert(
      fc.property(arbValidMoneyCase(), ({ lines, config }) => {
        const withOrder = calculateMoney(lines, config);
        const noOrder = calculateMoney(lines, { ...config, orderDiscountAmount: undefined });
        const declared = scaled(config.orderDiscountAmount ?? '0');
        const diff = scaled(withOrder.discountTotal) - scaled(noOrder.discountTotal);
        // Chỉ đúng khi totalNet > 0 (guard trong module)
        if (scaled(noOrder.subtotal) > 0n) {
          expect(diff, 'phân bổ chiết khấu tổng bị lệch').toBe(declared);
        }
      }),
      RUNS,
    );
  });

  // ── P4: bảng kê thuế phải khớp tổng thuế
  it('P4 Σ taxAmount trong taxBreakdown = taxTotal', () => {
    fc.assert(
      fc.property(arbValidMoneyCase(), ({ lines, config }) => {
        const r = calculateMoney(lines, config);
        const sum = r.taxBreakdown.reduce((s, e) => s + scaled(e.taxAmount), 0n);
        expect(sum).toBe(scaled(r.taxTotal));
      }),
      RUNS,
    );
  });

  // ── P5: subtotal phải khớp Σ net
  it('P5 subtotal = Σ net dòng', () => {
    fc.assert(
      fc.property(arbValidMoneyCase(), ({ lines, config }) => {
        const r = calculateMoney(lines, config);
        const sum = r.lines.reduce((s, l) => s + scaled(l.net), 0n);
        expect(scaled(r.subtotal)).toBe(sum);
      }),
      RUNS,
    );
  });

  // ── P6: sai số làm tròn ở INVOICE mode có trần
  //   P6 CŨ ĐÃ XOÁ: nó gọi roundingMode:'line' với roundTo>1 — tổ hợp mà
  //   CFG1 coi là INVALID. Giữ lại thì P6 và CFG1 loại trừ nhau (§4B.3c).
  it('P6 invoice mode: |roundingAdjustment| ≤ roundTo/2', () => {
    fc.assert(
      fc.property(arbLines(), fc.boolean(), fc.constantFrom(1, 100, 1000), (lines, before, rt) => {
        const r = calculateMoney(lines, {
          discountBeforeTax: before,
          roundingMode: 'invoice',        // ← CHỈ invoice, đúng miền hợp lệ
          roundTo: rt as 1 | 100 | 1000,
        });
        const adj = scaled(r.roundingAdjustment);
        const abs = adj < 0n ? -adj : adj;
        // Tròn MỘT LẦN ở tổng → lệch tối đa nửa đơn vị làm tròn
        expect(abs <= (BigInt(rt) * 10_000n) / 2n).toBe(true);
      }),
      RUNS,
    );
  });

  // ── P7: chiết khấu tổng KHÔNG được vượt subtotal  ← bất biến bắt Lỗ 2
  //   VIẾT SAU KHI CHỐT: chặn ở 422, hay cho phép âm cho credit note?
  it.todo('P7 orderDiscountAmount > subtotal → ném lỗi (hoặc theo quyết định đã chốt)');
});
```

## 4B.3b P6 KHÔNG bắt được Lỗ 1 — và vì sao điều đó quan trọng

Bản trước tuyên bố P6 bắt được Lỗ 1. **Sai, và sai về toán.** Kiểm lại chính ví dụ đó:

```
10 dòng × 400đ, roundTo=1000, roundingMode=line
  drift   = |0 − 4.000| = 4.000
  ceiling = roundTo/2 × số dòng = 1000/2 × 10 = 5.000
  4.000 ≤ 5.000  →  P6 PASS
```

Sâu hơn: **làm tròn 400đ về 0 với `roundTo=1000` là làm tròn ĐÚNG.** `divRound(400+500, 1000) = 0` — half-up chuẩn xác. Không có bất biến toán học nào bị vi phạm.

> **Lỗ 1 không phải bug thuật toán. Nó là hệ quả của một TỔ HỢP CẤU HÌNH mà không ai nên dùng.**

Đây là bài học chung: **property test kiểm bất biến toán học; nó không thay được quyết định nghiệp vụ.** Ca đúng phải là **kiểm tra hợp lệ của cấu hình**:

```ts
// packages/shared/test/money-config.spec.ts
it('CFG1 roundTo > 1 kèm roundingMode=line → TỪ CHỐI cấu hình', () => {
  expect(() =>
    calculateMoney(lines, { discountBeforeTax: true, roundingMode: 'line', roundTo: 1000 }),
  ).toThrow(/roundingMode.*invoice/i);
});

it('CFG2 roundTo > 1 kèm roundingMode=invoice → hợp lệ', () => {
  const r = calculateMoney(lines, { discountBeforeTax: true, roundingMode: 'invoice', roundTo: 1000 });
  expect(scaled(r.roundingAdjustment)).not.toBe(0n);   // chênh lệch ghi vào dòng điều chỉnh
});
```

**ĐÃ CHỐT: CFG1 là `ACTIVE`** — chặn tổ hợp `roundTo > 1` + `roundingMode: 'line'`. Lý do: làm tròn nghìn **từng dòng** làm mất tiền thật, và không nghiệp vụ nào cần nó (muốn tròn nghìn thì tròn ở tổng).

## 4B.3c Vì sao P6 cũ PHẢI bị xoá, không phải chỉ sửa

Sau khi CFG1 thành `ACTIVE`, hai thứ sau **loại trừ nhau**:

| | Làm gì |
|---|---|
| **CFG1** | `roundTo > 1` + `line` → **throw** |
| **P6 cũ** | Cố tình gọi `roundingMode: 'line'` với `roundTo: 100 \| 1000` |

CFG1 đúng thì **P6 cũ luôn đỏ**. Đây không phải chuyện sửa ngưỡng — P6 cũ đang **kiểm một miền không còn tồn tại**.

Và `arbValidMoneyCase()` cũng đã ép `roundTo === 1 ? 'line' : 'invoice'`, nên P6 cũ còn mâu thuẫn với chính generator.

**P6 mới chỉ kiểm `invoice` mode** — nơi tổ hợp đó hợp lệ, và ở đó có một bất biến thật: tròn một lần ở tổng thì `|roundingAdjustment| ≤ roundTo/2`.

## 4B.4 Bất biến cho FilterParser

Bộ phân tích query nhận **đầu vào từ người dùng** — đây là bề mặt tấn công, và bất biến quan trọng hơn ca liệt kê.

```ts
// apps/api/test/filter-parser-invariants.spec.ts
/**
 * Test §8.2 #35 — bất biến FilterParser (§3.5).
 * Đầu vào là query string TỪ NGƯỜI DÙNG → không được crash, không được
 * rò rỉ field ngoài whitelist, không được sinh SQL injection.
 */
const arbFilterQuery = () =>
  fc.dictionary(
    fc.oneof(
      fc.constantFrom('status', 'total', 'createdAt', 'customer.name'), // trong whitelist
      fc.constantFrom('salary', 'costPrice', 'password_hash'),          // NGOÀI whitelist
      fc.string(),                                                      // rác
    ),
    fc.oneof(fc.string(), fc.constantFrom("'; DROP TABLE orders;--", '1 OR 1=1', '{{7*7}}')),
  );

it('F1 không bao giờ throw lỗi chưa xử lý — chỉ AppException hoặc thành công', () => {
  fc.assert(
    fc.property(arbFilterQuery(), (q) => {
      try {
        parser.parse(q, WHITELIST);
      } catch (e) {
        expect(e, `lỗi không kiểm soát: ${e}`).toBeInstanceOf(AppException);
      }
    }),
    { numRuns: 10_000 },
  );
});

it('F2 where sinh ra CHỈ chứa field trong whitelist', () => { /* duyệt cây where đệ quy */ });
it('F4 field ngoài whitelist LUÔN → 400, không im lặng bỏ qua', () => { /* ... */ });
```

### F3 phải tách làm ba — nhìn `WhereInput` không chứng minh được gì

Bản trước viết *"mọi giá trị vào `where` là tham số, không nội suy chuỗi"*. **Không kiểm chứng được**: `Prisma.WhereInput` là object, việc tham số hoá SQL là trách nhiệm của Prisma query builder, không phải của parser.

| Ca | Loại | Kiểm gì |
|---|---|---|
| **F3a** | Unit | Parser **chỉ** sinh `WhereInput` có cấu trúc — **không** trả về mảnh SQL thô ở bất kỳ nhánh nào |
| **F3b** | Integration, **DB thật** | Bơm `"'; DROP TABLE orders;--"` qua query param → chỉ được coi là **literal**; không trả thêm dòng nào; **bảng `orders` còn nguyên** |
| **F3c** | Architecture (AR3) | `$queryRawUnsafe` / `$executeRawUnsafe` **không tồn tại** trong repo |

F3b là ca duy nhất thật sự chứng minh, và nó phải chạy trên Postgres thật.

## 4B.5 Máy trạng thái — VÉT CẠN, không dùng property test

`ORDER_STATES` có **5 phần tử**, transitions có **5 dòng**. Không gian nhỏ và hữu hạn → **vét cạn mạnh hơn random**: nó chứng minh chắc chắn, không phải "5.000 lần chưa thấy lỗi".

```ts
// packages/shared/test/state-machine.spec.ts
const ACTIONS = ['submit', 'approve', 'reject', 'cancel'] as const;

it('SM1 vét cạn: mọi (from, action) hoặc chuyển đúng, hoặc bị từ chối', () => {
  for (const from of ORDER_STATES) {
    for (const action of ACTIONS) {
      const declared = ORDER_TRANSITIONS.find((t) => t.from === from && t.action === action);
      const result = tryTransition('order', from, action);
      if (declared) expect(result).toBe(declared.to);
      else          expect(result).toBeNull();
    }
  }
});

it('SM2 (from, action) là DUY NHẤT — không transition nào mơ hồ', () => {
  const keys = ORDER_TRANSITIONS.map((t) => `${t.from}|${t.action}`);
  expect(new Set(keys).size).toBe(keys.length);
});

it('SM3 mọi `to` thuộc ORDER_STATES', () => { /* ... */ });
it('SM4 mọi trạng thái trừ DRAFT đều REACHABLE từ DRAFT (BFS)', () => { /* ... */ });
it('SM5 trạng thái cuối không có transition đi ra', () => {
  // ĐÃ KIỂM repo: CANCELLED và APPROVED hiện KHÔNG có transition ra.
  // Nếu sau này thêm APPROVED→CANCELLED thì test này phải sửa CÓ Ý THỨC.
});
it('SM6 mọi permission trong transitions tồn tại trong registry', () => { /* ... */ });
```

**Property-based dành cho không gian lớn**: tiền (§4B.3), FilterParser (§4B.4), phân giải hạn mức duyệt, tính số dư kho.

---

# 4C. TẦNG 5 — Ma trận kịch bản nghiệp vụ (pairwise)

> **Vì sao cần:** golden path (#32) là **một** đường. Nghiệp vụ thật là một đường với nhiều biến thể, và lỗi tập trung ở **tương tác giữa các biến thể**.

## 4C.1 Quy trình "bán hàng có xuất kho"

Bảy trục biến thiên:

| # | Trục | Giá trị |
|---|---|---|
| 1 | Loại theo dõi hàng | `NONE` · `LOT` · `SERIAL` |
| 2 | Tồn kho | đủ · thiếu · đủ nhưng lô hết hạn |
| 3 | Hạn mức duyệt | trong hạn · vượt hạn · **không có dòng authority** |
| 4 | Người duyệt | khác người tạo · **chính người tạo** · được uỷ quyền |
| 5 | Sau duyệt | xuất đủ · xuất một phần · huỷ đơn đã duyệt |
| 6 | Kỳ kế toán | đang mở · **đã khoá sổ** |
| 7 | Đồng thời | một người · hai người duyệt cùng lúc · **duyệt + huỷ cùng lúc** |

3×3×3×3×3×2×3 = **1.458 tổ hợp**. Đừng chạy hết.

## 4C.1b Pairwise phải SINH và KIỂM, không viết tay

Bản trước viết tay 20 dòng rồi gọi là pairwise. **Kiểm lại thì không đạt.**

Số cặp 2-way cần phủ với 7 factor cỡ `3,3,3,3,3,2,3`:

```
C(6,2) cặp giữa các factor cỡ 3   = 15 × (3×3) = 135
6 cặp giữa factor cỡ 2 và cỡ 3    =  6 × (2×3) =  36
                                      TỔNG      = 171 cặp
```

20 kịch bản viết tay phủ khoảng **129/171** — thiếu ~42 cặp, ví dụ `tracking=NONE × approver=self`, `stock=short × period=closed`, `limit=none × approver=self`, `after=partial × period=closed`.

Và kịch bản #19 còn đưa thêm giá trị `parallelIssue` **không có trong domain factor** — nghĩa là bảng tự mâu thuẫn với chính khai báo factor của nó.

**Quy trình đúng:**

```
FACTORS (khai tường minh)
      ↓  generator pairwise (@fast-check/… hoặc thuật toán IPOG ~60 dòng)
SCENARIOS_GENERATED
      ↓  script verifyPairCoverage() → PHẢI = 171/171, nếu không thì ĐỎ
      ↓
+ 5-10 "evil scenario" thêm TAY (tổ hợp xấu nhất, race, boundary)
```

```ts
// apps/api/test/scenario/pairwise.ts
export const FACTORS = {
  tracking:    ['NONE', 'LOT', 'SERIAL'],
  stock:       ['enough', 'short', 'expired'],
  limit:       ['within', 'exceeds', 'none'],
  approver:    ['other', 'self', 'delegated'],
  after:       ['full', 'partial', 'cancel'],
  period:      ['open', 'closed'],
  concurrency: ['single', 'twoApprove', 'approveCancel'],
} as const;

it('ma trận phủ 100% cặp 2-way', () => {
  const { total, covered, missing } = verifyPairCoverage(FACTORS, SCENARIOS);
  expect(missing, `thiếu ${missing.length}/${total} cặp:\n${fmt(missing)}`).toEqual([]);
  expect(covered).toBe(total);
});
```

**`parallelIssue` (20 request song song) là "evil scenario" riêng**, không phải giá trị của factor `concurrency`. Giữ nó ở tầng 3 §4.3/I1.

## 4C.2 Hai mươi kịch bản — LÀM VÍ DỤ, không phải nguồn sinh

> ⚠️ **Bảng dưới đây là ví dụ minh hoạ để hiểu các trục, KHÔNG phải danh sách kịch bản dùng thật.**
> Kịch bản thật do `generatePairwise(FACTORS)` sinh (§4C.3) và phải qua `verifyPairCoverage()` = 171/171.
> Bảng viết tay này chỉ phủ ~129/171 (§4C.1b).

| # | Tracking | Tồn | Hạn mức | Người duyệt | Sau duyệt | Kỳ | Đồng thời | Kỳ vọng |
|---|---|---|---|---|---|---|---|---|
| 1 | NONE | đủ | trong hạn | khác | xuất đủ | mở | một | ✅ hoàn tất, tồn giảm đúng |
| 2 | NONE | thiếu | trong hạn | khác | xuất đủ | mở | một | `409 STOCK.INSUFFICIENT`, tồn không đổi |
| 3 | NONE | đủ | vượt hạn | khác | — | mở | một | `409 ORDER.EXCEEDS_LIMIT` |
| 4 | NONE | đủ | không authority | khác | — | mở | một | `409 NO_APPROVAL_AUTHORITY` (**fail-closed**) |
| 5 | LOT | đủ | trong hạn | **chính mình** | — | mở | một | `409 ORDER.SELF_APPROVAL` |
| 6 | LOT | lô hết hạn | trong hạn | khác | xuất đủ | mở | một | Chặn theo FEFO, hoặc cảnh báo — **chốt rồi test** |
| 7 | LOT | đủ | trong hạn | uỷ quyền | xuất đủ | mở | một | ✅; audit ghi cả người uỷ quyền và người thực hiện |
| 8 | LOT | đủ | trong hạn | khác | xuất một phần | mở | một | Tồn giảm đúng phần đã xuất; đơn ở trạng thái "xuất một phần" |
| 9 | LOT | đủ | trong hạn | khác | **huỷ sau duyệt** | mở | một | Có bút toán đảo; tồn về đúng giá trị trước |
| 10 | SERIAL | đủ | trong hạn | khác | xuất đủ | mở | một | `COUNT(serial IN_STOCK) == on_hand`; serial → `ISSUED` |
| 11 | SERIAL | thiếu | vượt hạn | chính mình | — | mở | một | Chặn ở **luật đầu tiên gặp** — kiểm thứ tự ưu tiên lỗi |
| 12 | SERIAL | đủ | trong hạn | khác | xuất đủ | **đã khoá** | một | `409 PERIOD.CLOSED` — **và movement KHÔNG được ghi** |
| 13 | NONE | đủ | trong hạn | khác | xuất đủ | **đã khoá** | một | Chặn ở tầng movement, không chỉ ở tầng đơn |
| 14 | LOT | đủ | trong hạn | khác | xuất đủ | mở | **2 người duyệt** | Đúng **một** thành công, người kia `409`; **một** bản ghi audit approve |
| 15 | SERIAL | đủ | trong hạn | khác | xuất đủ | mở | **duyệt + huỷ** | Trạng thái cuối xác định, không "vừa APPROVED vừa CANCELLED" |
| 16 | NONE | đủ | trong hạn | uỷ quyền | huỷ sau duyệt | đã khoá | một | Huỷ đơn thuộc kỳ đã khoá → chốt hành vi |
| 17 | LOT | thiếu | không authority | uỷ quyền | — | mở | một | Thứ tự kiểm: quyền → hạn mức → tồn |
| 18 | SERIAL | lô hết hạn | vượt hạn | khác | xuất một phần | mở | 2 người | Tổ hợp xấu nhất — không được crash, mã lỗi rõ ràng |
| 19 | NONE | đủ | trong hạn | khác | xuất đủ | mở | **20 request xuất song song** | Tổng xuất ≤ tồn, không âm (§8.2 #22) |
| 20 | LOT | đủ | trong hạn | chính mình | huỷ sau duyệt | đã khoá | duyệt + huỷ | Mọi luật chồng nhau — kiểm thông báo lỗi vẫn hiểu được |

## 4C.2b Phân loại kịch bản — BẮT BUỘC, nếu không agent sẽ tự thêm nghiệp vụ

**ĐÃ KIỂM `packages/shared/src/state-machines.ts`:**

```
ORDER_STATES = DRAFT · PENDING · APPROVED · REJECTED · CANCELLED
transitions  = DRAFT→PENDING · PENDING→APPROVED · PENDING→REJECTED
               REJECTED→PENDING · DRAFT→CANCELLED
```

Nghĩa là **không có** `APPROVED → CANCELLED`, **không có** `PARTIALLY_ISSUED`. Vậy các kịch bản sau **không test được implementation hiện tại**:

| Kịch bản | Trạng thái | Lý do |
|---|---|---|
| #9 "huỷ sau duyệt → bút toán đảo" | **TODO-SPEC** | `APPROVED→CANCELLED` không tồn tại. Là **ứng viên yêu cầu**, chưa phải nghiệp vụ đã chốt |
| #8, #18 "xuất một phần" | **TODO-SPEC** | Không có trạng thái `PARTIALLY_ISSUED` |
| #12, #13, #16, #20 "kỳ đã khoá" | **FUTURE-OPT** | §5B.2/B5 là [OPT], chưa triển khai |
| #7 "uỷ quyền" | **FUTURE-OPT** | `delegations` có bảng, chưa có luồng |
| #6 "lô hết hạn" | **TODO-SPEC** | ADR-0003 chốt FEFO ở tầng service; chưa chốt có CHẶN hay chỉ cảnh báo |

**Mỗi kịch bản phải mang nhãn:**

```ts
interface Scenario {
  status: 'ACTIVE' | 'TODO-SPEC' | 'FUTURE-OPT';
  // ...
}
```

| Nhãn | Hành vi test | Ý nghĩa |
|---|---|---|
| `ACTIVE` | Phải **XANH** ngay | Nghiệp vụ đã có |
| `TODO-SPEC` | `it.todo` — **không chạy** | Chờ quyết định nghiệp vụ. Ghi câu hỏi vào FINDINGS |
| `FUTURE-OPT` | `it.skip` kèm lý do | Module [OPT] chưa triển khai |

**Không có phân loại này, agent sẽ đọc kịch bản đỏ, kết luận "code sai", rồi TỰ THÊM NGHIỆP VỤ mà bạn chưa hề yêu cầu.** Đây là rủi ro lớn nhất của tầng 5.

**Bốn kịch bản `ACTIVE` tôi cá là đang hỏng:**

| # | Vì sao nghi ngờ |
|---|---|
| **15** | Duyệt và huỷ đồng thời — có optimistic lock trên `orders.version` trong đường action không? Hay hai transition cùng chạy? |
| **11** | Thiếu quyền **và** thiếu tồn **và** tự duyệt cùng lúc — chặn ở luật nào trước? Thứ tự phải xác định, không phụ thuộc thứ tự code |
| **14** | Hai người duyệt song song — đúng một thành công, và **đúng một** bản ghi audit `approve` |
| **10** | SERIAL: `COUNT(serial IN_STOCK) == on_hand` sau khi xuất, kể cả khi xuất thất bại giữa đường |

## 4C.3 Khung code — SINH pairwise, KHÔNG dùng bảng 20 dòng làm nguồn

```ts
// apps/api/test/scenario/factors.ts
/** parallelIssue KHÔNG có ở đây — nó là evil scenario riêng (§4C.1b) */
export const FACTORS = {
  tracking:    ['NONE', 'LOT', 'SERIAL'],
  stock:       ['enough', 'short', 'expired'],
  limit:       ['within', 'exceeds', 'none'],
  approver:    ['other', 'self', 'delegated'],
  after:       ['full', 'partial', 'cancel'],
  period:      ['open', 'closed'],
  concurrency: ['single', 'twoApprove', 'approveCancel'],
} as const;

export type FactorCombo = { [K in keyof typeof FACTORS]: (typeof FACTORS)[K][number] };
export type ScenarioStatus = 'ACTIVE' | 'TODO-SPEC' | 'FUTURE-OPT';

export interface Scenario {
  id: string;
  combo: FactorCombo;
  /** BẮT BUỘC — không có thì test ĐỎ (§4C.2b) */
  status: ScenarioStatus;
  /** Lý do, bắt buộc khi status ≠ ACTIVE */
  reason?: string;
  expect: {
    step: 'approve' | 'issue' | 'cancel';
    status: number;
    code?: string;
    invariants: InvariantId[];
  };
}
```

```ts
// apps/api/test/scenario/sales.spec.ts
import { FACTORS } from './factors';
import { generatePairwise, verifyPairCoverage } from './pairwise';

// SINH — không viết tay
const GENERATED: FactorCombo[] = generatePairwise(FACTORS);

// Gán status + kỳ vọng cho từng combo sinh ra
const SCENARIOS: Scenario[] = GENERATED.map(classify);

// EVIL — thêm tay, NGOÀI pairwise
const EVIL: Scenario[] = [
  parallelIssue20Requests,   // 20 request xuất song song (§4.3/I1)
  approveAndCancelRace,
  allRulesViolatedAtOnce,
];

describe('Ma trận kịch bản bán hàng (§8.2 #36)', () => {
  it('phủ 100% cặp 2-way', () => {
    const { total, missing } = verifyPairCoverage(FACTORS, GENERATED);
    expect(missing, `thiếu ${missing.length}/${total} cặp:\n${fmt(missing)}`).toEqual([]);
  });

  it('mọi kịch bản đều có status', () => {
    expect(SCENARIOS.filter((s) => !s.status)).toEqual([]);
    expect(SCENARIOS.filter((s) => s.status !== 'ACTIVE' && !s.reason)).toEqual([]);
  });

  // RUNNER PHÂN LOẠI — không chạy tất cả (§4C.2b)
  for (const sc of [...SCENARIOS, ...EVIL]) {
    const name = `${sc.id} ${Object.values(sc.combo).join('/')}`;

    if (sc.status === 'TODO-SPEC') {
      it.todo(`[TODO-SPEC] ${name} — ${sc.reason}`);
      continue;
    }
    if (sc.status === 'FUTURE-OPT') {
      it.skip(`[FUTURE-OPT] ${name} — ${sc.reason}`, () => {});
      continue;
    }

    it(name, async () => {
      const ctx = await setupScenario(sc);
      const res = await runScenario(sc, ctx);
      expect(res.status).toBe(sc.expect.status);
      if (sc.expect.code) expect(res.body.code).toBe(sc.expect.code);
      // BẤT BIẾN kiểm SAU MỌI kịch bản — kể cả kịch bản thất bại
      for (const inv of sc.expect.invariants) await assertInvariant(inv, ctx);
    }, 60_000);
  }
});
```

### `classify()` — nơi nhãn được gán, và nơi phải đọc kỹ

```ts
function classify(combo: FactorCombo): Scenario {
  // ĐÃ KIỂM state-machines.ts: KHÔNG có APPROVED→CANCELLED, KHÔNG có PARTIALLY_ISSUED
  if (combo.after === 'cancel')  return todoSpec(combo, 'APPROVED→CANCELLED chưa có trong máy trạng thái');
  if (combo.after === 'partial') return todoSpec(combo, 'PARTIALLY_ISSUED chưa có');
  if (combo.period === 'closed') return futureOpt(combo, 'Khoá kỳ là [OPT] §5B.2/B5, chưa triển khai');
  if (combo.approver === 'delegated') return futureOpt(combo, 'delegations có bảng, chưa có luồng');
  if (combo.stock === 'expired') return todoSpec(combo, 'Chưa chốt: FEFO CHẶN hay chỉ cảnh báo');
  return active(combo);
}
```

**Hệ quả cần biết trước:** với repo hiện tại, phần lớn combo sinh ra sẽ là `TODO-SPEC`/`FUTURE-OPT`. Đó là **thông tin đúng và có giá trị** — nó đo được *khoảng cách giữa nghiệp vụ đã đặc tả và nghiệp vụ đã triển khai*. Đừng cố làm cho chúng xanh bằng cách thêm nghiệp vụ.

## 4C.4 Ma trận thứ hai — duyệt nhiều cấp

| # | Trục | Giá trị |
|---|---|---|
| 1 | Số cấp duyệt | 1 · 2 · 3 |
| 2 | Người duyệt cấp 2 | có authority · **không có** |
| 3 | Uỷ quyền | không · trong hạn ngày · **hết hạn uỷ quyền** |
| 4 | Từ chối | cấp 1 · cấp 2 · không từ chối |
| 5 | Sau từ chối | sửa rồi gửi lại · huỷ |
| 6 | Người duyệt rời tenant giữa luồng | không · **có** (`status = LEFT`) |

3×2×3×3×2×2 = 216 tổ hợp → pairwise **~12 kịch bản**.

**Kịch bản nguy hiểm nhất: #6 = "có".** Người duyệt cấp 2 rời công ty khi đơn đang chờ họ. Đơn có bị kẹt vĩnh viễn không? Có cơ chế chuyển tiếp không? Đây là tình huống chắc chắn xảy ra trong thực tế và gần như chắc chắn chưa xử lý.

---

# 5. Protocol cho AI agent

## 5.1 Vòng discovery an toàn

```
1. Chạy stack: make dev
2. Lấy route inventory: GET /api/v1/docs-json (OpenAPI) — KHÔNG mò browser
     → OpenAPI là nguồn tốt hơn browser: có schema, có status code khai báo
3. Với mỗi endpoint, tra kỳ vọng ở BẢNG §0 (permission-matrix / error-codes / spec)
4. So OpenAPI với thực tế gọi:
     - Response 200 nhưng OpenAPI khai void  → PHÁT HIỆN (nợ Swagger)
     - Endpoint không có trong permission-matrix → PHÁT HIỆN (thiếu oracle)
5. Viết test theo kỳ vọng ở bước 3, KHÔNG theo response ở bước 4
6. Response ≠ kỳ vọng → ghi vào FINDINGS.md, không sửa test cho khớp
```

**Dùng OpenAPI thay vì browser** cho phần API: nó có schema, có status khai báo, và chính sự khác biệt giữa OpenAPI với hành vi thật là một loại phát hiện. Browser chỉ cần cho FE.

## 5.2 Luật khi test đỏ

```
Test đỏ → PHÂN LOẠI TRƯỚC, sửa sau:

(a) Test sai   → sửa test, PHẢI dẫn dòng spec chứng minh kỳ vọng cũ sai
(b) Code sai   → sửa code, KHÔNG đổi test
(c) Spec sai   → DỪNG, báo người, cần ADR

CẤM: sửa code và test trong cùng một bước.
CẤM: đổi kỳ vọng thành giá trị vừa quan sát được.
```

## 5.2b Luật riêng cho tầng 4 và 5

**Tầng 4 (bất biến):**
- Agent **không được nới bất biến** để test xanh. Bất biến sai thì phải nói rõ vì sao theo spec
- `fast-check` tìm được phản ví dụ → **ghi lại ca tối giản (đã shrink) vào FINDINGS**, rồi thêm nó thành một `it()` riêng cố định. Ca cố định sống mãi kể cả khi generator đổi
- Bất biến `it.todo` (như P7) chỉ được viết sau khi có **quyết định**, không tự đoán

**Tầng 5 (kịch bản):**
- **Không xoá kịch bản vì nó đỏ.** Đỏ nghĩa là tìm ra lỗi tương tác
- `assertInvariant` phải chạy **sau cả kịch bản thất bại**. Lỗi tệ nhất là "trả 409 đúng nhưng đã kịp trừ tồn kho"
- Kịch bản chưa chốt hành vi (như #6 lô hết hạn, #16 huỷ đơn kỳ đã khoá) → `it.todo` + ghi câu hỏi vào FINDINGS, **không tự quyết định nghiệp vụ**

## 5.3 Mẫu FINDINGS.md

```markdown
## F-001 · GET /orders trả cột cost_price cho STAFF
- **Kỳ vọng:** permission-matrix §4 — `cost_price` group `cost`, STAFF ❌
- **Thực tế:** có mặt trong response
- **Lệnh tái hiện:** `curl -H "Authorization: Bearer $STAFF" .../orders`
- **Mức:** CAO — rò rỉ dữ liệu
- **Đã viết test:** `field-level.spec.ts` L14 (ĐANG ĐỎ, đúng như thiết kế)
```

**Test đỏ tương ứng với finding là kết quả TỐT**, không phải thất bại. Đỏ nghĩa là bạn vừa tìm ra một bug thật.

---

# 6. Sáu suite — chạy ở đâu, khi nào

**"900 ca" không phải mục tiêu.** Một ca `H4 — tenant A sửa setting của B bằng id` đáng giá hơn 100 ca `không token → 401`. Chia suite theo **giá trị và độ ổn định**, không theo số lượng:

| Suite | Chạy khi | Nội dung | Yêu cầu |
|---|---|---|---|
| **Architecture** | Mọi PR, **trước tiên** | §3B AR1–AR13 | Không cần DB, **< 10 giây** |
| **PR Gate** | Mọi PR | §3C HYBRID · §3D cache · Tầng 1 U1–U6 · ma trận quyền · field-level · auth core · idempotency · outbox rollback · money golden · SM vét cạn | **Phải ổn định tuyệt đối.** Đỏ = chặn merge |
| **Integration** | Mọi PR | Tầng 2 lớp endpoint · tầng 3 nghiệp vụ · L16 query budget | DB thật qua Testcontainers |
| **Nightly** | Mỗi đêm | Property 5.000–10.000 lượt · pairwise §4C · concurrency nặng (20 request song song) · timing thống kê | Được phép chạy lâu |
| **Security** | Nightly + trước release | §3F SSRF · secret · headers · error leak · log redaction | |
| **Release** | Trước mỗi release | §3H provision · §3I FE E2E · backup/restore · clean clone `make setup` · migration từ N−1 · drift · worker/Redis/S3 restart | |
| **Performance** | Nightly | Export 1 triệu dòng · RAM · benchmark query | **KHÔNG** ở PR gate |

## 6.1 Ba ca phải chuyển khỏi PR gate

| Ca | Vì sao | Chuyển sang |
|---|---|---|
| **J3** — export 10.000 dòng, RAM không tăng tuyến tính | Đo RAM trên CI dùng chung **rất flaky** | PR: test streaming quy mô nhỏ (kiểm không dựng mảng đầy). Nightly: benchmark 100k–1M |
| **T12** — cùng thời gian phản hồi | Timing chính xác không assert được | PR: response **giống hệt** + mail qua queue. Security nightly: thống kê 200 mẫu |
| **I1** — 20 request xuất kho song song | Chậm, phụ thuộc lịch trình | Nightly. PR giữ bản 3 request |

## 6.2 Thứ tự thi công

| # | Việc | Ca | Thời gian | Giá trị |
|---|---|---|---|---|
| **1** | **§3C HYBRID tenancy — 12 ca** | 12 | **4 giờ** | 🔴 **Cao nhất.** Đường code nguy hiểm nhất, hiện 0 test |
| **2** | §3B AR10–AR13 (4 check mới) | 4 | 4 giờ | Rẻ, bắt regression trước khi test chạy |
| 3 | Tầng 1: U3, U3b, U4 | 3 | 3 giờ | Bắt endpoint thiếu policy |
| 4 | Tầng 1 còn lại + route fixture factory cho U6 | ~460 | 1,5 ngày | Phủ 116/116 |
| 5 | **L16 query budget** cho mọi list endpoint | ~15 | 4 giờ | Test N+1 đúng công thức |
| 6 | §3D permission cache invalidation | 9 | 1 ngày | PC8 dễ hỏng |
| 7 | Tầng 2 lớp endpoint (đã sửa C7/C8, A3, BULK) | ~180 | 1,5 ngày | |
| 8 | §3E auth T16–T25 | 10 | 1 ngày | |
| 9 | Tầng 3 nghiệp vụ: tiền, kho, query, nhất quán, report | ~90 | 3 ngày | |
| 10 | Tầng 4 bất biến + **CFG1/CFG2** cấu hình tiền + SM vét cạn | ~20 | 1 ngày | |
| 11 | §3H provision failure | 5 | 0,5 ngày | Chặn "tenant nửa vời" |
| 12 | §3G webhook | 14 | 1 ngày | |
| 13 | §3F security suite | ~20 | 1,5 ngày | |
| 14 | §3I FE E2E — **sau khi có hạ tầng test FE** | 14 | 1,5 ngày | |
| 15 | Tầng 5 pairwise **sinh + verify** — **sau GĐ C** | ~30 | 2 ngày | FRICTION.md lọc kịch bản nào thật cần |

**Tổng ~18 ngày.** Nhưng **bước 1 chỉ mất 4 giờ và đáng làm trước mọi thứ khác** — kể cả trước GĐ A của FE.

# 7. Hai mươi tám ca tôi cho là dễ hỏng nhất

Nếu chỉ có một ngày, viết đúng những ca này. Năm ca cuối là bổ sung từ tầng 4–5:

| # | Ca | Vì sao |
|---|---|---|
| 1 | U3 — route ghi thiếu `@RequirePermission` | Lỗi nghiêm trọng nhất, rẻ nhất để phát hiện |
| 2 | C7 — body ghi đè `tenantId` | Vỡ toàn bộ cách ly |
| 3 | L10 — `total` không áp scope | Phân trang sai âm thầm |
| 4 | L13 — dòng tenant B trong list | Rò rỉ trực tiếp |
| 5 | L5 — sort theo cột không được xem | Suy luận được dữ liệu ẩn |
| 6 | J6 — file lỗi import không che cột nhạy cảm | Kênh xuất bị bỏ quên |
| 7 | R6 — cache báo cáo thiếu user/scope | Rò rỉ qua cache |
| 8 | I1 — 20 request xuất song song | Mất tiền thật |
| 9 | O7 — cấp số song song | Lỗ hổng số chứng từ |
| 10 | Q6 — locale fallback không nhất quán | Sai tinh vi, khó phát hiện |
| 11 | T6 — refresh token reuse | Bảo mật |
| 12 | T15 — đổi org_unit không huỷ session | Thấy dữ liệu phòng ban cũ |
| 13 | S3 — cross-tenant không audit | Cửa hậu không dấu vết |
| 14 | D3 — delete guard trả 500 | Người dùng cảm nhận ngay |
| 15 | G8 — audit diff chứa cột nhạy cảm | Rò rỉ qua đường không ai ngờ |
| **16** | **CFG1 — `roundTo > 1` + `roundingMode:'line'` phải bị TỪ CHỐI** | Lỗ thật (§4B.1). Là **kiểm tra cấu hình**, không phải property test — xem §4B.3c |
| **17** | **Kịch bản #12/#13 — khoá kỳ chỉ chặn ở tầng đơn?** | Xuất kho trực tiếp có thể lọt qua |
| **18** | **Kịch bản #15 — duyệt + huỷ đồng thời** | Trạng thái không xác định |
| **19** | **Ma trận duyệt #6 — người duyệt rời tenant giữa luồng** | Đơn kẹt vĩnh viễn, chắc chắn xảy ra thực tế |
| **20** | **F1 — FilterParser với query rác** | Đầu vào từ người dùng, chưa có bất biến nào |
| **21** | **H4 — tenant A sửa setting của B bằng id** | 🔴 HYBRID là đường code nguy hiểm nhất, **0 test hiện tại** |
| **22** | **H8 — HYBRID không có tenant context → fail closed** | Worker quên `runWith(ctx)` là kịch bản thật |
| **23** | **H11 — cache setting không mang tenantId** | Rò rỉ qua cache, im lặng |
| **24** | **L16 — query count không tăng theo số dòng** | Công thức N+1 đúng |
| **25** | **PC8 — đổi cha cây đơn vị** | Phải invalidate cache của **toàn tenant** |
| **26** | **PV1–PV3 — tenant nửa vời** | `ACTIVE` mà thiếu role/calendar/ROOT |
| **27** | **W14 — webhook payload rò rỉ field-level** | Kênh xuất dữ liệu thứ năm |
| **28** | **AR11 — route runtime ≠ OpenAPI** | Repo đang có nợ đúng loại này |
