# ĐẶC TẢ HAI TEST CÒN THIẾU

> Bổ sung vào `boilerplate-spec.md` §8.2 với số **#31** và **#32**.
> Đường dẫn, tên endpoint và API harness trong tài liệu này lấy từ **repo thật** (đã đối chiếu `apps/api/test/setup/test-app.ts`, `tools/generator/plopfile.mjs`, các `@Controller`).

| | Test #31 — Generator | Test #32 — Golden path |
|---|---|---|
| Bảo vệ điều gì | **Lời hứa cốt lõi của boilerplate**: `gen:module` sinh code chạy được | **Khớp nối liên module** — loại lỗi mà 582 assertion hiện tại không bắt |
| Chạy ở đâu | CI job riêng | Cùng suite integration |
| Chi phí | ~nửa ngày | ~1 ngày |
| Thời lượng chạy | 3–5 phút | 30–60 giây |

---

# TEST #31 — Generator sinh code chạy được

## Vì sao đây là test quan trọng nhất còn thiếu

Repo này tồn tại để **sinh ra chức năng có sẵn**. Nếu `gen:module` hỏng thì mọi dự án tương lai hỏng theo — và bạn chỉ phát hiện lúc đang gấp. Hiện `progress.md` ghi đã thử tay một lần rồi xoá; nghĩa là **không có gì bảo vệ nó khi refactor**.

Đặc biệt: mỗi lần sửa `modules/orders` (module [REF]) mà quên cập nhật `templates/*.hbs`, generator sẽ âm thầm sinh code theo khuôn cũ.

## Bốn điều phải khẳng định

| # | Khẳng định | Vì sao |
|---|---|---|
| 1 | Sinh đủ 7 file đúng đường dẫn | Plop có thể fail im lặng nếu template lỗi |
| 2 | **Check kiến trúc phải ĐỎ ngay sau khi sinh** | Generator cố ý không sửa registry (§ đầu `plopfile.mjs`). Nếu check vẫn xanh thì cơ chế bảo vệ đã hỏng |
| 3 | Sau khi khai registry → check XANH, typecheck XANH | Code sinh ra phải hợp lệ thật |
| 4 | **Test sinh kèm phải CHẠY và XANH** | Đây là điều duy nhất chứng minh code *hoạt động*, không chỉ *biên dịch* |

Khẳng định #2 là cái ít ai nghĩ tới và có giá trị cao nhất: nó test **cơ chế phòng vệ**, không chỉ test generator.

## Cấu trúc

Không dùng Vitest — đây là test cấp repo, dùng script Node để kiểm soát được `git clean`.

```
tools/checks/test-generator.mjs        ← script chính
.github/workflows/ci.yml               ← job riêng `generator`
```

## Script

```js
// tools/checks/test-generator.mjs
/**
 * Test §8.2 #31 — generator sinh code CHẠY ĐƯỢC.
 * Bảo vệ lời hứa cốt lõi của boilerplate. Chạy trong CI job riêng.
 *
 * LUÔN dọn sạch ở finally — kể cả khi fail giữa đường.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NAME = 'gizmo';                    // tên không trùng module thật nào
const MODEL = 'Gizmo';
const ROOT = resolve(import.meta.dirname, '../..');

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });

/** Chạy lệnh, KỲ VỌNG THẤT BẠI. Thành công = test đỏ. */
const shMustFail = (cmd, why) => {
  try {
    sh(cmd);
  } catch {
    return; // đúng như mong đợi
  }
  throw new Error(`PHẢI THẤT BẠI nhưng lại thành công: ${cmd}\n→ ${why}`);
};

const EXPECTED_FILES = [
  `apps/api/src/modules/${NAME}s/${NAME}s.module.ts`,
  `apps/api/src/modules/${NAME}s/${NAME}s.controller.ts`,
  `apps/api/src/modules/${NAME}s/${NAME}s.repository.ts`,
  `apps/web/src/features/${NAME}s/schema.ts`,
  `apps/web/src/features/${NAME}s/actions.ts`,
  `apps/web/src/app/(dashboard)/${NAME}s/page.tsx`,
  `apps/api/test/${NAME}s.spec.ts`,
];

function cleanup() {
  // Xoá file sinh ra + hoàn nguyên mọi file registry đã sửa
  sh(`git clean -fd apps/api/src/modules/${NAME}s apps/web/src/features/${NAME}s ` +
     `"apps/web/src/app/(dashboard)/${NAME}s" || true`);
  sh(`rm -f apps/api/test/${NAME}s.spec.ts`);
  sh('git checkout -- apps/api/prisma/schema.prisma packages/shared/src ' +
     'docs/boilerplate-spec.md apps/api/src/app.module.ts || true');
  sh(`rm -rf apps/api/prisma/migrations/*_gen_test_${NAME} || true`);
}

try {
  // ── 0. Repo phải sạch trước khi bắt đầu, nếu không cleanup sẽ xoá oan
  if (sh('git status --porcelain').trim()) {
    throw new Error('Repo không sạch — commit hoặc stash trước khi chạy test #31');
  }

  // ── 1. Sinh module (plop nhận tên qua đối số vị trí)
  sh(`pnpm gen:module ${NAME}`);
  for (const f of EXPECTED_FILES) {
    if (!existsSync(resolve(ROOT, f))) throw new Error(`Thiếu file sinh ra: ${f}`);
  }
  console.log('✅ #31.1 sinh đủ 7 file');

  // ── 2. CHECK KIẾN TRÚC PHẢI ĐỎ — generator cố ý không sửa registry
  shMustFail(
    'node tools/checks/run-all.mjs',
    'Model mới chưa khai TENANCY_POLICY/ma trận §6.5 mà check vẫn xanh → ' +
    'cơ chế phòng vệ đã hỏng, nguy hiểm hơn generator hỏng',
  );
  console.log('✅ #31.2 check kiến trúc đỏ đúng như thiết kế');

  // ── 3. Khai registry đúng như CHECKLIST generator in ra
  applyRegistryFixture();
  sh('node tools/checks/run-all.mjs');
  console.log('✅ #31.3a check kiến trúc xanh sau khi khai registry');

  sh(`pnpm --filter @nexus/api prisma migrate dev --name gen_test_${NAME} --skip-seed`);
  sh('pnpm --filter @nexus/api prisma:generate');
  sh('pnpm typecheck');
  console.log('✅ #31.3b typecheck xanh');

  // ── 4. TEST SINH KÈM PHẢI XANH — điều duy nhất chứng minh code CHẠY
  const out = sh(`pnpm --filter @nexus/api vitest run test/${NAME}s.spec.ts`);
  if (!/\d+ passed/.test(out)) throw new Error(`Test sinh kèm không xanh:\n${out}`);
  console.log('✅ #31.4 test sinh kèm xanh');

  console.log('\n🎉 #31 PASS — generator sinh code chạy được');
} finally {
  cleanup();
  console.log('🧹 đã dọn sạch');
}
```

## `applyRegistryFixture()` — phần cần bạn tự viết

Đây là **bản sao có thể chạy được** của CHECKLIST 8 bước mà generator in ra. Nó phải sửa đúng những file mà generator cố ý không sửa:

```js
function applyRegistryFixture() {
  const patch = (rel, find, add) => {
    const p = resolve(ROOT, rel);
    const s = readFileSync(p, 'utf8');
    if (s.includes(add.trim().split('\n')[0])) return; // idempotent
    writeFileSync(p, s.replace(find, `${find}\n${add}`));
  };

  // 1. schema.prisma — model tối thiểu theo BusinessEntityBase
  patch('apps/api/prisma/schema.prisma', '// <<< GEN_TEST_ANCHOR', `
model ${MODEL} {
  id          String    @id @default(uuid(7)) @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  createdById String?   @map("created_by_id") @db.Uuid
  updatedById String?   @map("updated_by_id") @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  orgUnitId   String?   @map("org_unit_id") @db.Uuid
  version     Int       @default(0)
  externalId  String?   @map("external_id")
  source      String?
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz

  code          String
  name          Json
  nameViSearch  String? @map("name_vi_search")
  nameEnSearch  String? @map("name_en_search")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, code])
  @@index([tenantId, deletedAt])
  @@map("${NAME}s")
}`);

  // 2. TENANCY_POLICY — thêm vào nhóm TENANT (hoặc không cần nếu TENANT là default)
  // 3. SOFT_DELETE_MODELS — model có deletedAt
  // 4. permissions.ts — gizmo:read/create/update/delete
  // 5. Ma trận §6.5 trong docs/boilerplate-spec.md — thêm MỘT dòng
  // 6. app.module.ts — import GizmosModule
  // 7. EntityType enum nếu module bị tham chiếu đa hình
  // 8. Seed: quyền gizmo:* cho vai trò trong bộ seed để test sinh kèm login được
}
```

**Ghi chú quan trọng:** bước 1 cần một **anchor comment** trong `schema.prisma`:

```prisma
// <<< GEN_TEST_ANCHOR — chỗ test #31 chèn model tạm. KHÔNG xoá.
```

Không có anchor thì script phải parse Prisma schema — dễ vỡ.

## CI job

Tách job riêng vì nó sửa file trong workspace:

```yaml
  generator:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 8.15.9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Test #31 — generator sinh code chạy được
        run: node tools/checks/test-generator.mjs
      - name: Repo phải sạch sau khi dọn
        run: git diff --exit-code && git status --porcelain | wc -l | grep -qx 0
```

Bước cuối là **test của chính cleanup** — nếu script để lại rác, CI đỏ.

---

# TEST #32 — Golden path liên module

## Vì sao cần

Tôi đã đo trên repo: **không có test nào đi qua ≥3 module trong một luồng.** Mỗi module được kiểm chứng độc lập. Nhưng lỗi của app nghiệp vụ tập trung ở **khớp nối**:

- Đơn duyệt xong nhưng tồn kho không trừ
- Xuất kho xong nhưng outbox không phát event
- Export chạy nhưng file thiếu cột theo `X-Locale` của request
- Audit timeline không thấy hành động của worker
- Thông báo gửi sai membership

Một test đủ để mọi lần refactor có lưới an toàn ở những chỗ đó.

## Nguyên tắc thiết kế

| Luật | Lý do |
|---|---|
| **Một `it()` duy nhất, chạy tuần tự theo bước** | Đây là *hành trình*, không phải tập hợp assertion độc lập. Bước 5 hỏng thì bước 6 vô nghĩa |
| Mỗi bước có `console.log` đánh số | Fail ở đâu là biết ngay, không phải đọc stack |
| **Chỉ dùng HTTP API công khai**, không gọi service | Test đúng thứ người dùng thật chạm vào |
| `rawPrisma` **chỉ để đọc** khi cần xác nhận trạng thái DB | Không dùng để dựng dữ liệu — dựng bằng API |
| **Xen kẽ tenant B ở vài bước** | Golden path cũng là test cách ly liên module |
| Không phụ thuộc seed demo | Tự tạo mọi dữ liệu cần |

## Luồng — 14 bước, 11 module

```
apps/api/test/golden-path.spec.ts
```

| # | Bước | Endpoint | Chạm module | Khẳng định |
|---|---|---|---|---|
| 1 | Login MANAGER tenant A | `POST /auth/login` | auth | Có token, `tenantId` đúng |
| 2 | Tạo khách hàng | `POST /customers` | customers | `name` JSONB 2 ngôn ngữ, `name_vi_search` được ghi |
| 3 | Tạo sản phẩm `tracking_type=LOT` | `POST /products` | products | |
| 4 | Tạo kho + lô | `POST /inventory/warehouses`, `/lots` | inventory | |
| 5 | Nhập kho 100 | `POST /inventory/receipts` | inventory, outbox | `GET /inventory/balances` → `available = 100` |
| 6 | Tạo đơn 2 dòng | `POST /orders` | orders, money | `code` đúng định dạng `?-2026-00001`; `total` khớp bộ tính tiền B1 |
| 7 | **Cùng `Idempotency-Key`, gọi lại** | `POST /orders` | idempotency | Trả **cùng `order.id`**, DB chỉ có 1 đơn |
| 8 | Submit | `POST /orders/:id/submit` | orders (state machine) | `status = PENDING` |
| 9 | **STAFF thử duyệt** | `POST /orders/:id/approve` | rbac | `403` |
| 10 | **MANAGER duyệt đơn CHÍNH MÌNH tạo** | `POST /orders/:id/approve` | rbac | `409 ORDER.SELF_APPROVAL` |
| 11 | TENANT_ADMIN duyệt | `POST /orders/:id/approve` | orders, approval-authorities, outbox | `200`; hạn mức resolve fail-closed đúng |
| 12 | Xuất kho theo đơn | `POST /inventory/issues` | inventory | `available = 100 − qty`; có `movement` + `movement_dedup_key`; `on_hand` khớp |
| 13 | Export đơn hàng | `POST /orders/export` → poll | exports, queue, files, notifications | Job `DONE`, có `file_id`, có notification cho membership đúng |
| 14 | Audit timeline | `GET /audit-logs?entity=Order&entityId=…` | audit | Có bản ghi cho `create`/`submit`/`approve`, `actor_id` đúng người, **không có `salary`/`cost_price` trong diff** |
| 15 | **Tenant B mù toàn tuyến** | 5 endpoint trên | tenancy | `404`/rỗng cho mọi id vừa tạo |
| 16 | Global search | `GET /search?q=<không dấu>` | search | Tìm ra khách hàng bước 2 bằng chuỗi **không dấu** |

## Khung code

```ts
// apps/api/test/golden-path.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * Test §8.2 #32 — GOLDEN PATH liên module.
 * MỘT hành trình nghiệp vụ trọn vẹn qua 11 module. Bắt lỗi KHỚP NỐI —
 * loại lỗi mà test từng-module-độc-lập không bao giờ thấy.
 *
 * Một it() duy nhất, tuần tự: bước N hỏng thì bước N+1 vô nghĩa.
 */
describe('Golden path — hành trình liên module (§8.2 #32)', () => {
  let h: TestHarness;
  const T: Record<string, string> = {};

  beforeAll(async () => {
    h = await createTestApp();
    [T.manager, T.staff, T.admin, T.bManager] = await Promise.all([
      h.login('manager@tenant-a.local'),
      h.login('staff@tenant-a.local'),
      h.login('admin@tenant-a.local'),
      h.login('manager@tenant-b.local'),
    ]);
  });
  afterAll(() => h.close());

  const api = (token: string) => {
    const r = request(h.app.getHttpServer());
    return {
      get: (u: string) => r.get(`/api/v1${u}`).set('Authorization', `Bearer ${token}`),
      post: (u: string) => r.post(`/api/v1${u}`).set('Authorization', `Bearer ${token}`),
    };
  };

  /** Poll job nền tới khi xong — export/import là bất đồng bộ */
  const waitJob = async (token: string, url: string, ms = 15_000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const res = await api(token).get(url);
      if (['DONE', 'FAILED'].includes(res.body?.status)) return res.body;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Job không xong trong ${ms}ms: ${url}`);
  };

  it('đi trọn hành trình: khách → hàng → kho → đơn → duyệt → xuất → export → audit', async () => {
    const step = (n: number, s: string) => console.log(`  [${n}] ${s}`);

    // ── 2. Khách hàng, tên 2 ngôn ngữ
    step(2, 'tạo khách hàng');
    const cusRes = await api(T.manager).post('/customers').send({
      code: `GP-${Date.now()}`,
      name: { vi: 'Công ty Máy xét nghiệm', en: 'Diagnostics Co' },
      taxCode: '0312345678',
    });
    expect(cusRes.status, JSON.stringify(cusRes.body)).toBe(201);
    const customerId: string = cusRes.body.id;

    // ...bước 3–5: sản phẩm LOT, kho, lô, nhập 100

    // ── 7. Idempotency: cùng key, body giống → CÙNG một đơn
    step(7, 'gọi lại cùng Idempotency-Key');
    const key = randomUUID();
    const body = { customerId, currency: 'VND', items: [/* 2 dòng */] };
    const first = await api(T.manager).post('/orders').set('Idempotency-Key', key).send(body);
    const again = await api(T.manager).post('/orders').set('Idempotency-Key', key).send(body);
    expect(again.body.id).toBe(first.body.id);
    const orderId: string = first.body.id;

    const count = await h.rawPrisma.order.count({ where: { code: first.body.code } });
    expect(count, 'idempotency tạo trùng đơn').toBe(1);

    // ── 10. Không tự duyệt đơn mình tạo
    step(10, 'MANAGER duyệt đơn của chính mình → phải chặn');
    const self = await api(T.manager).post(`/orders/${orderId}/approve`).send({});
    expect(self.status).toBe(409);
    expect(self.body.code).toBe('ORDER.SELF_APPROVAL');

    // ── 12. Xuất kho: tồn phải giảm ĐÚNG
    step(12, 'xuất kho theo đơn');
    // ...gọi /inventory/issues, rồi:
    // expect(balanceSau.available).toBe(balanceTruoc.available - qty)
    // expect(dedupKeyRows).toBe(1)

    // ── 14. Audit không được lộ cột nhạy cảm
    step(14, 'audit timeline');
    const audit = await api(T.admin).get(`/audit-logs?entity=Order&entityId=${orderId}`);
    const actions = audit.body.data.map((r: { action: string }) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'submit', 'approve']));
    expect(JSON.stringify(audit.body)).not.toMatch(/cost_price|costPrice|salary/);

    // ── 15. Tenant B mù toàn tuyến
    step(15, 'tenant B không thấy gì');
    for (const url of [`/orders/${orderId}`, `/customers/${customerId}`]) {
      expect((await api(T.bManager).get(url)).status).toBe(404);
    }

    // ── 16. Tìm không dấu
    step(16, 'global search không dấu');
    const s = await api(T.manager).get('/search?q=may xet nghiem');
    expect(JSON.stringify(s.body)).toContain(customerId);
  }, 90_000);
});
```

## Ba cái bẫy khi viết

| Bẫy | Cách tránh |
|---|---|
| Job nền chưa xong đã assert | `waitJob()` poll, đừng `setTimeout` cố định |
| `fileParallelism: false` đã bật nhưng golden path vẫn dùng chung DB với file khác | Dùng `code` có `Date.now()`, đừng dựa vào bảng rỗng |
| Test dài, fail không biết ở đâu | `step(n, …)` + message trong mọi `expect` |

## Điểm quan trọng nhất

Đừng biến golden path thành nơi test chi tiết. **Chi tiết thuộc test từng module.** Golden path chỉ khẳng định *các module nối được với nhau*. Nếu nó dài quá 200 dòng thì đang lạc.

---

# Cập nhật kèm theo

## `boilerplate-spec.md` §8.2

```markdown
| 31 | **Generator sinh code chạy được** | `gen:module` → 7 file → check kiến trúc ĐỎ (đúng thiết kế) → khai registry → check xanh + typecheck + **test sinh kèm xanh** → dọn sạch | 9 |
| 32 | **Golden path liên module** | Một hành trình qua 11 module: khách → hàng → kho → đơn → idempotency → duyệt (403/self-approval/hạn mức) → xuất kho → export qua queue → audit → tenant B mù → search không dấu | 5b |
```

## `CLAUDE.md` — bổ sung vào §6

```markdown
- [ ] Sửa `modules/orders` hoặc `templates/*.hbs` → **chạy lại test #31**
- [ ] Thêm/sửa luồng nghiệp vụ xuyên module → **chạy lại test #32**
```

## `permission-matrix.spec.ts` — sửa mìn

```ts
// ❌ XOÁ — expect(res.status).toBe(pickCreated(res.status)) LUÔN ĐÚNG
function pickCreated(status: number): number { return status; }
```

Thay bằng status kỳ vọng tường minh cho từng dòng `Row`. Hiện chưa nổ vì không có dòng `POST … 200`, nhưng ai thêm một dòng như vậy sẽ có test không assert gì mà vẫn xanh.

---

# Thứ tự thi công

| Bước | Việc | Thời gian |
|---|---|---|
| 1 | Thêm `// <<< GEN_TEST_ANCHOR` vào `schema.prisma` | 5 phút |
| 2 | `test-generator.mjs` — bước 1, 2, dọn sạch | 2 giờ |
| 3 | `applyRegistryFixture()` đầy đủ 8 mục | 2 giờ |
| 4 | CI job `generator` + bước "repo phải sạch" | 30 phút |
| 5 | `golden-path.spec.ts` bước 1–8 | 3 giờ |
| 6 | Bước 9–16 | 3 giờ |
| 7 | Sửa mìn `pickCreated` | 15 phút |

**Làm bước 2–4 trước bước 5–7.** Test #31 bảo vệ generator, và generator là thứ bạn sẽ dùng để sinh mọi module OPT tiếp theo — có nó trước thì mọi module sinh sau đều được kiểm chứng.
