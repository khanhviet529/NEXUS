# ĐẶC TẢ NỀN TẢNG DỰ ÁN
## Boilerplate Next.js + NestJS cho hệ thống quản trị & quản lý nghiệp vụ

| | |
|---|---|
| **Phiên bản** | 3.2 — Architecture Baseline |
| **Trạng thái** | **FROZEN** từ v3.1. v3.2 bổ sung theo ADR-001 (tracking hàng), ADR-002 (vai trò động), ADR-003 (hạn mức duyệt) |
| **Mục đích** | Làm căn cứ thống nhất cho việc xây dựng repo gốc, dùng lại cho mọi dự án về sau |
| **Phạm vi** | Kiến trúc, contract API, đặc tả FE/BE, quy ước code, mô hình dữ liệu nền, lộ trình triển khai |
| **Ngoài phạm vi** | Nghiệp vụ cụ thể của từng dự án, thiết kế giao diện chi tiết (mockup) |

---

## MỤC LỤC

1. [Tổng quan & nguyên tắc](#1-tổng-quan--nguyên-tắc)
2. [Kiến trúc & công nghệ](#2-kiến-trúc--công-nghệ)
3. [Contract API](#3-contract-api) ← *phần khó sửa nhất, chốt kỹ*
4. [Đặc tả Backend](#4-đặc-tả-backend)
5. [Đặc tả Frontend](#5-đặc-tả-frontend)
5B. [Các bài toán lặp lại khác](#5b-các-bài-toán-lặp-lại-khác)
5C. [Chức năng quản trị hệ thống dùng chung](#5c-chức-năng-quản-trị-hệ-thống-dùng-chung)
6. [Mô hình dữ liệu nền tảng](#6-mô-hình-dữ-liệu-nền-tảng)
7. [Quy ước code](#7-quy-ước-code)
8. [Chiến lược kiểm thử](#8-chiến-lược-kiểm-thử)
9. [DevOps & vận hành](#9-devops--vận-hành)
10. [Lộ trình triển khai](#10-lộ-trình-triển-khai)
11. [Quy trình khởi tạo dự án mới](#11-quy-trình-khởi-tạo-dự-án-mới)
12. [Quyết định cần chốt](#12-quyết-định-cần-chốt)
13. [Phụ lục](#13-phụ-lục)

---

# 1. TỔNG QUAN & NGUYÊN TẮC

## 1.1 Mục tiêu

Xây dựng một **repo gốc (reference implementation)** để khởi tạo nhanh các dự án web quản trị nghiệp vụ, đảm bảo:

- Rút ngắn thời gian dựng khung từ ~3 tuần xuống ~2 ngày
- Thống nhất chất lượng và quy ước giữa các dự án
- Xử lý sẵn các bài toán lặp lại: phân quyền, phân trang, import/export, audit, duyệt, chống N+1
- Cho phép **cắt bỏ** nhanh những phần không dùng

## 1.2 Phi mục tiêu

| Không làm | Lý do |
|---|---|
| Xây một framework/thư viện có versioning | Boilerplate là để copy rồi sửa, không phải để `npm install` |
| Trừu tượng hoá sớm (`BaseCrudService<T>` generic) | Copy-paste sửa được dễ hơn abstraction sai. Chờ đến lần lặp thứ 3 |
| Hỗ trợ mọi CSDL / mọi ORM | Chọn một, làm sâu |
| Tự viết lại UI primitive | Radix/shadcn đã chuẩn a11y, tự viết là lãng phí |

## 1.3 Bảy nguyên tắc thiết kế

1. **Xoá được trong một phút.** Mọi thứ không bắt buộc phải nằm gọn trong một thư mục, gỡ bằng `rm -rf` + xoá một dòng import.
2. **Vertical slice, không tầng ngang.** Làm xong trọn một luồng từ DB tới UI rồi mới làm luồng tiếp theo.
3. **Một cách làm duy nhất.** Nếu tồn tại hai cách hiển thị lỗi, dev thứ ba sẽ đẻ ra cách thứ ba.
4. **Contract trước, code sau.** Hình dạng dữ liệu giữa FE và BE là thứ đắt nhất khi sửa.
5. **Quy ước ghi thành văn bản, không truyền miệng.** Mỗi quy ước đều có mục trong tài liệu này.
6. **Sinh code thay vì viết tay** ở những chỗ lặp: OpenAPI → API client, generator → module CRUD.
7. **Kiểm chứng bằng test, không bằng niềm tin.** Phân quyền và N+1 phải có test tự động, vì chúng hỏng âm thầm.

## 1.4 Phân loại thành phần

Mọi thành phần trong repo được gắn đúng một nhãn, ghi trong header file và trong `README`:

| Nhãn | Ý nghĩa | Xử lý khi tạo dự án mới |
|---|---|---|
| **CORE** | Hạ tầng bắt buộc | Luôn giữ |
| **OPT** | Module độc lập, tuỳ nghiệp vụ | Giữ hoặc xoá theo bảng ở §11 |
| **REF** | Code mẫu để tham chiếu | Copy sang module mới rồi **xoá bản gốc** |

---

# 2. KIẾN TRÚC & CÔNG NGHỆ

## 2.1 Sơ đồ tổng thể

```
                    ┌──────────────────────────────┐
   Trình duyệt ───► │  Next.js (App Router)        │
                    │  - SSR: layout, auth, shell  │
                    │  - CSR: màn hình nghiệp vụ   │
                    └──────────────┬───────────────┘
                                   │ REST /api/v1  (client sinh từ OpenAPI)
                    ┌──────────────▼───────────────┐
                    │  NestJS API                  │
                    │  Guard → Interceptor → Pipe  │
                    │  → Controller → Service      │
                    └───┬────────┬─────────┬───────┘
                        │        │         │
              ┌─────────▼──┐ ┌───▼────┐ ┌──▼──────────┐
              │ PostgreSQL │ │ Redis  │ │ S3 / MinIO  │
              │ (Prisma)   │ │ cache  │ │ file        │
              └────────────┘ │ queue  │ └─────────────┘
                             │ session│
                             └───┬────┘
                                 │
                        ┌────────▼────────┐
                        │ Worker (BullMQ) │  export, import, email,
                        │ cùng codebase   │  notification, cron
                        └─────────────────┘
```

**Ghi chú kiến trúc:** Worker chạy **cùng codebase** với API nhưng khác process (`npm run start:worker`). Lý do: tái sử dụng service và Prisma client, tránh đồng bộ hai repo. Đánh đổi: image Docker to hơn — chấp nhận được.

## 2.2 Cấu trúc monorepo

```
.
├── apps/
│   ├── api/                    # NestJS (API + Worker)
│   └── web/                    # Next.js
├── packages/
│   ├── api-client/             # SINH TỰ ĐỘNG từ OpenAPI — không sửa tay
│   ├── shared/                 # enum, constant, util dùng chung FE+BE
│   ├── vn/                     # [OPT] tiện ích đặc thù Việt Nam
│   ├── config-eslint/
│   └── config-ts/
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   ├── conventions.md
│   ├── ui-conventions.md
│   ├── security.md
│   └── release-checklist.md
├── tools/
│   └── generators/             # plop templates: gen:module
├── docker-compose.dev.yml
├── turbo.json
└── README.md                   # có mục "Xoá cái gì khi không cần"
```

**Nguyên tắc phụ thuộc:** `apps/*` phụ thuộc `packages/*`. `packages/*` **không** phụ thuộc lẫn nhau, trừ `shared` là lá.

## 2.3 Stack và lý do chọn

| Lớp | Công nghệ | Lý do |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Cache build/test, cấu hình đơn giản |
| BE Framework | NestJS 11 | DI, module rõ ràng, hệ sinh thái sẵn cho guard/queue/swagger |
| ORM | Prisma — **pin major version trong `package.json`, ghi số cụ thể vào ADR** | DX tốt nhất, migration ổn định. Xem cảnh báo §4.9 về middleware vs extension |
| Query phức tạp | Kysely | Type-safe query builder cho báo cáo — Prisma đuối ở đây |
| CSDL | PostgreSQL 16+ | JSONB, ltree, full-text, partial index |
| Cache/Queue/Session | Redis + BullMQ | Một hạ tầng cho ba nhu cầu |
| File | S3 API (MinIO ở dev) | Presigned URL, không đẩy file qua API server |
| FE Framework | Next.js 15 (App Router) | Routing/layout tốt, nhưng xem §5.2 về ranh giới RSC |
| Server state | TanStack Query v5 | Cache, invalidate, retry — chuẩn de-facto |
| URL state | nuqs | Bộ lọc phải nằm trong URL, xem §5.4 |
| UI | shadcn/ui (Radix) + Tailwind | Sở hữu code, không bị khoá bởi thư viện |
| Bảng | TanStack Table | Headless, kiểm soát hoàn toàn render |
| Form | react-hook-form + zod | Hiệu năng tốt, schema dùng chung được |
| Codegen | orval | OpenAPI → type + hook TanStack Query |
| Log | pino | Nhanh, structured, redact sẵn |
| Test | Vitest + Testcontainers + Playwright | DB thật trong test tích hợp |

## 2.4 Luồng dữ liệu chuẩn

```
Nest controller có @ApiResponse đầy đủ
        │
        ├─► sinh openapi.json  (CI kiểm tra thay đổi)
        │
        └─► orval  ─►  packages/api-client
                            │  type + hook useQuery/useMutation
                            ▼
                       apps/web dùng trực tiếp
```

**Hệ quả bắt buộc:** FE **không được** khai báo tay type của response API. BE đổi field → FE đỏ compile ngay tại CI. Đây là cơ chế phòng vệ chính chống lệch contract.

---

# 3. CONTRACT API

> Đây là chương quan trọng nhất. Mọi quy ước ở đây phải được tuân thủ tuyệt đối, kể cả khi thấy bất tiện ở một endpoint cụ thể. Nhất quán quan trọng hơn tối ưu cục bộ.

## 3.1 Quy ước chung

| Hạng mục | Quy định |
|---|---|
| Base path | `/api/v1` |
| Định dạng | JSON, `Content-Type: application/json; charset=utf-8` |
| Đặt tên endpoint | Danh từ số nhiều, kebab-case: `/purchase-orders` |
| Đặt tên field | `camelCase` |
| Phương thức | `GET` danh sách/chi tiết, `POST` tạo, `PATCH` sửa một phần, `DELETE` xoá. **Không dùng `PUT`** |
| Hành động nghiệp vụ | `POST /orders/:id/approve` — động từ nằm ở sub-resource, không nhét vào body |
| Header | **Tất cả OPTIONAL**, server có chuỗi resolve — xem §3.1c |
| Xác thực | **Web:** cookie httpOnly, **không** gửi `Authorization`. **Mobile/đối tác:** `Authorization: Bearer`. Xem §4.3b |
| **Nguồn tenant** | **`tenantId` chỉ lấy từ access token.** Server **không** nhận header nào làm nguồn xác định tenant — xem §3.1b |
| Versioning | Qua path. Version cũ giữ tối thiểu 3 tháng, gắn header `Deprecation` |

## 3.1b Nguồn xác định tenant — ĐÃ CHỐT

Phiên bản trước của tài liệu vừa yêu cầu header `X-Tenant` bắt buộc, vừa nói `tenantId` trong token là nguồn sự thật duy nhất. **Đó là mâu thuẫn, và là mâu thuẫn nguy hiểm** — nếu server tin header do client gửi thì client tự đổi tenant được, toàn bộ cách ly dữ liệu vô nghĩa.

```
Request đã xác thực
  → tenantId lấy TỪ ACCESS TOKEN, không nơi nào khác
  → server BỎ QUA mọi header/query/body nói về tenant

Trước khi đăng nhập
  → subdomain hoặc tenantCode chỉ để GỢI Ý tenant trên màn login
  → sau khi user chọn tenant, server cấp token chứa tenantId

Đổi tenant
  → POST /auth/switch-tenant { tenantId }
  → server kiểm tra membership → cấp token MỚI
  → không có cơ chế nào khác để đổi tenant
```

**Ngoại lệ duy nhất:** endpoint sysadmin dưới `/api/v1/admin/*` nhận `X-Target-Tenant`, bắt buộc kèm quyền `system:cross_tenant`, và **mỗi lần đều ghi `audit_logs` với `action = 'CROSS_TENANT_ACCESS'`** (§4.4b). Đây không phải header toàn hệ thống.

---

## 3.1c Header — tất cả OPTIONAL, có chuỗi resolve

Phiên bản trước ghi ba header là "bắt buộc" nhưng lại mô tả fallback cho chúng — mâu thuẫn. Chốt: **không header nào bắt buộc**, server luôn resolve được.

| Header | Chuỗi resolve (dừng ở giá trị đầu tiên có) |
|---|---|
| `X-Request-Id` | header → **server tự sinh**. Luôn **trả lại** trong response và mọi log |
| `X-Locale` | header → `Accept-Language` → `user_preferences.locale` → `tenants.default_locale` → `vi` |
| `X-Timezone` | header → `user_preferences.timezone` → `tenants.default_timezone` → `Asia/Ho_Chi_Minh` |

**Ngoại lệ:** endpoint báo cáo nhận tham số khoảng ngày do client xác định **bắt buộc** có `X-Timezone`, thiếu thì `400`. Lý do: "doanh thu ngày 06/08" phụ thuộc múi giờ nào cắt ngày, đoán sai là sai số liệu.

Hàm resolve viết **một lần** trong middleware, đặt vào CLS context. Service không tự đọc header.

---

## 3.2 Hình dạng response

**Danh sách** — luôn có `data` và `meta`:

```json
{
  "data": [ { "id": "...", "code": "PO-2026-00001" } ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7, "hasNext": true }
}
```

**Chi tiết** — trả thẳng object, không bọc:

```json
{ "id": "...", "code": "PO-2026-00001", "version": 3 }
```

**Hành động không trả dữ liệu** — `204 No Content`.

**Lý do không bọc `{ data }` cho chi tiết:** giảm một tầng bóc tách ở FE. Đánh đổi là hai hình dạng khác nhau — chấp nhận được vì FE luôn biết mình đang gọi list hay detail.

## 3.3 Phân trang

**Mặc định: offset-based.**

| Tham số | Kiểu | Mặc định | Ràng buộc |
|---|---|---|---|
| `page` | int | 1 | ≥ 1 |
| `limit` | int | 20 | 1–100, **cap cứng ở BE** |

Ví dụ: `GET /orders?page=2&limit=50`

**Cursor-based** — chỉ dùng cho infinite scroll hoặc bảng > 1 triệu dòng:

```
GET /audit-logs?cursor=eyJpZCI6...&limit=50
→ meta: { "nextCursor": "eyJpZCI6...", "hasNext": true }
```

**Quy tắc:** khi phân trang, `total` phải được tính bằng `COUNT` **sau khi áp dụng filter và row-level permission**. Tuyệt đối không lọc quyền sau khi query — phân trang sẽ sai ngay lập tức.

## 3.4 Sắp xếp

```
GET /orders?sort=-createdAt,code
```

- Tiền tố `-` = giảm dần, không có = tăng dần
- Nhiều trường ngăn bằng dấu phẩy, ưu tiên theo thứ tự
- **Mỗi endpoint khai báo whitelist trường được sort.** Trường ngoài whitelist → `400`
- Whitelist chỉ chứa trường **đã có index**
- Luôn thêm `id` làm tie-breaker cuối cùng để phân trang ổn định

## 3.5 Bộ lọc (Filter DSL)

Cú pháp: `filter[<field>][<operator>]=<value>`

```
GET /orders
  ?filter[status][in]=pending,approved
  &filter[total][gte]=1000000
  &filter[createdAt][between]=2026-01-01T00:00:00Z,2026-01-31T23:59:59Z
  &filter[customer.name][contains]=công ty
  &q=PO-2026
```

**Bảng toán tử:**

| Toán tử | Ý nghĩa | Kiểu áp dụng |
|---|---|---|
| `eq` | bằng (mặc định nếu bỏ trống toán tử) | mọi |
| `ne` | khác | mọi |
| `in` / `nin` | thuộc / không thuộc, ngăn bằng `,` | mọi |
| `gt` `gte` `lt` `lte` | so sánh | số, ngày |
| `between` | trong khoảng, `a,b` | số, ngày |
| `contains` | chứa, không phân biệt hoa thường **và không dấu** | chuỗi |
| `startsWith` | bắt đầu bằng | chuỗi |
| `isNull` | `true` / `false` | mọi |
| `has` | quan hệ n-n có chứa | mảng, relation |

**Quy định bổ sung:**
- `q` là tìm kiếm nhanh toàn văn, mỗi endpoint tự định nghĩa quét những cột nào
- Field lồng nhau dùng dấu chấm: `customer.name`
- **Whitelist bắt buộc**, giống sort. Field ngoài whitelist → `400`
- Parser dùng chung (`FilterParser`), sinh thẳng ra `Prisma.WhereInput`
- `contains` trên tiếng Việt phải bỏ dấu: dùng **cột search chuẩn hoá ở tầng ứng dụng** + index `pg_trgm`. **Không** dùng `unaccent()` trực tiếp trong index — xem §3.10

## 3.6 Lỗi

**Hình dạng thống nhất:**

```json
{
  "code": "ORDER.ALREADY_APPROVED",
  "message": "Đơn hàng đã được duyệt, không thể sửa",
  "details": null,
  "traceId": "01JQ8X...",
  "timestamp": "2026-08-06T03:12:45.000Z"
}
```

**Lỗi validation (422)** — `details` là map field → mảng thông báo, key khớp đường dẫn field trong form:

```json
{
  "code": "COMMON.VALIDATION_FAILED",
  "message": "Dữ liệu không hợp lệ",
  "details": {
    "code": ["Mã đơn đã tồn tại"],
    "items.0.quantity": ["Số lượng phải lớn hơn 0"],
    "items.2.unitPrice": ["Đơn giá không được âm"]
  },
  "traceId": "01JQ8X..."
}
```

**Quy ước mã lỗi:** `DOMAIN.REASON`, chữ hoa, snake sau dấu chấm.

| HTTP | Mã chuẩn | Khi nào |
|---|---|---|
| 400 | `COMMON.BAD_REQUEST` | Tham số query sai cú pháp, field ngoài whitelist |
| 401 | `AUTH.UNAUTHENTICATED` | Chưa đăng nhập |
| 401 | `AUTH.TOKEN_EXPIRED` | Access token hết hạn → FE tự refresh |
| 403 | `AUTH.FORBIDDEN` | Thiếu quyền |
| 404 | `COMMON.NOT_FOUND` | Không tồn tại **hoặc ngoài phạm vi dữ liệu** (không tiết lộ sự tồn tại) |
| 409 | `COMMON.VERSION_CONFLICT` | Optimistic locking — bản ghi đã bị người khác sửa |
| 409 | `<DOMAIN>.<REASON>` | Xung đột nghiệp vụ, VD `ORDER.ALREADY_APPROVED` |
| 422 | `COMMON.VALIDATION_FAILED` | Dữ liệu không hợp lệ |
| 429 | `COMMON.RATE_LIMITED` | Vượt giới hạn, kèm header `Retry-After` |
| 500 | `COMMON.INTERNAL_ERROR` | Lỗi hệ thống — **không lộ chi tiết**, chỉ trả `traceId` |

**Quy tắc bắt buộc cho FE:** xử lý logic dựa trên `code`, **không bao giờ dựa trên `message`**. `message` chỉ để hiển thị và có thể đổi bất cứ lúc nào.

## 3.7 Kiểu dữ liệu chuẩn

| Loại | Quy định | Ví dụ |
|---|---|---|
| ID | UUID v7 (sắp xếp được theo thời gian), kiểu `string` | `"0192f3a1-..."` |
| Ngày giờ | **UTC, ISO-8601 có `Z`**. BE không bao giờ trả chuỗi đã format | `"2026-08-06T03:12:45.000Z"` |
| Ngày (không giờ) | `YYYY-MM-DD` | `"2026-08-06"` |
| Tiền | **chuỗi decimal**, kèm field `currency` riêng. Tuyệt đối không dùng `number` | `"1500000.00"` |
| Số lượng thập phân | chuỗi decimal | `"12.500"` |
| Enum | `SCREAMING_SNAKE_CASE`, khai báo tại `packages/shared` | `"PENDING_APPROVAL"` |
| Boolean | `true`/`false`, không dùng `0`/`1` | |
| Rỗng | `null`, **không dùng chuỗi rỗng** cho field không có giá trị | |
| Múi giờ báo cáo | Client gửi `X-Timezone: Asia/Ho_Chi_Minh`, BE dùng để cắt ngày | |

## 3.8 Quan hệ & tải kèm

- Mặc định endpoint trả **đúng** những gì màn hình cần, không trả thừa
- Field quan hệ dùng dạng rút gọn khi chỉ cần hiển thị:
  ```json
  { "customer": { "id": "...", "code": "KH001", "name": "Công ty A" } }
  ```
- **Không** hỗ trợ `?include=` tuỳ ý. Lý do: mở cửa cho N+1 và khiến việc tối ưu query bất khả thi. Cần shape khác → tạo endpoint khác

## 3.9 Idempotency

`POST` có tác dụng phụ quan trọng (import, tạo chứng từ, thanh toán) nhận header:

```
Idempotency-Key: <uuid do client sinh>
```

BE lưu key + response trong Redis 24h làm **cache**, nhưng lớp bảo đảm cuối cùng là **bảng DB** `idempotency_requests` (§6).

*Lý do:* Redis có thể bị flush, evict hoặc mất dữ liệu. Với chứng từ tài chính, xuất nhập kho, callback ngân hàng và job retry sau nhiều ngày, mất idempotency key nghĩa là tạo trùng chứng từ — không thể chấp nhận.

**Ba lớp phòng vệ, dùng đồng thời:**

| Lớp | Cơ chế | Bắt được gì |
|---|---|---|
| 1 | Redis cache theo `Idempotency-Key` | Retry nhanh trong vài giây |
| 2 | Bảng `idempotency_requests`, unique `(tenant_id, key)` | Retry sau nhiều ngày, Redis đã mất |
| 3 | **Unique business key** | Trùng đến từ đường khác, không qua idempotency |

Unique business key bắt buộc:

```sql
UNIQUE (tenant_id, source, external_id)                 -- đồng bộ hệ thống ngoài
UNIQUE (tenant_id, document_type, document_number)      -- chứng từ
-- movement: PRIMARY KEY của movement_dedup_keys, xem §5B.2/B4
--   (không đặt được UNIQUE trực tiếp trên bảng movements vì nó partition)
```

Lớp 3 là lớp duy nhất chống được trùng khi lỗi đến từ đường không ai lường trước. Không được bỏ.

### State machine — ĐÃ CHỐT

`request_hash` = hash của body đã chuẩn hoá. Nó tồn tại để trả lời câu hỏi quan trọng nhất: **cùng key nhưng body khác thì sao?**

| Trạng thái hiện tại | Xử lý |
|---|---|
| Key chưa tồn tại | `INSERT` với `status = PROCESSING` + `request_hash` → chạy nghiệp vụ |
| Tồn tại, **cùng** hash, `COMPLETED` | Trả lại **nguyên response cũ** kèm `response_status` cũ |
| Tồn tại, **cùng** hash, `PROCESSING` | `409 COMMON.IDEMPOTENCY_IN_PROGRESS` + header `Retry-After` |
| Tồn tại, **khác** hash | `409 COMMON.IDEMPOTENCY_KEY_REUSED` — client dùng lại key cho nội dung khác, đây là lỗi phía client |
| Tồn tại, `FAILED` | Cho chạy lại: cập nhật về `PROCESSING`, tăng `attempts` |

Kết thúc nghiệp vụ:

```
Thành công        → COMPLETED + lưu response_status, response_body
Rollback trước    → FAILED (giữ row để đếm attempts và phục vụ điều tra)
  khi có side-effect
```

**Không xoá row khi thất bại.** Xoá đi thì mất khả năng phân biệt "chưa từng gọi" với "đã gọi và hỏng", và mất luôn dấu vết `request_hash` để bắt lỗi dùng lại key.

`expires_at` mặc định 30 ngày, dài hơn cửa sổ retry tối đa của queue.

---

## 3.10 Đa ngôn ngữ ở tầng dữ liệu

**Quyết định:** dùng **cột JSONB** cho mỗi trường dịch được. **Không** dùng bảng translation riêng.

```
products.name        jsonb   → {"vi": "Áo thun cotton", "en": "Cotton T-shirt"}
products.description jsonb
```

### Hình dạng API

BE trả về **đã giải quyết theo locale**, không trả cả object:

```json
{ "id": "...", "code": "SP001", "name": "Áo thun cotton" }
```

Locale lấy từ header `X-Locale`, fallback `Accept-Language`, mặc định `vi`.

Endpoint tạo/sửa nhận **toàn bộ** object để form nhập được nhiều ngôn ngữ:

```json
{ "code": "SP001", "name": { "vi": "Áo thun cotton", "en": "Cotton T-shirt" } }
```

→ Bắt buộc tách DTO: `ProductResponseDto.name: string` khác `UpsertProductDto.name: LocalizedText`.

### Lý do chọn JSONB thay vì bảng translation

| | JSONB | Bảng translation |
|---|---|---|
| Query | Không join | Mọi query phải join + xử lý fallback |
| N+1 | Không phát sinh | Rủi ro cao, phải nhớ include ở mọi chỗ |
| Fallback thiếu bản dịch | `COALESCE(name->>'en', name->>'vi')` | Hai LEFT JOIN lồng nhau |
| Unique | Vẫn nằm trên `code` → **không phát sinh phức tạp nào** | Unique tên theo locale rất rối |
| Thêm ngôn ngữ | Thêm expression index | Không cần gì |
| Ràng buộc DB | Không ép được "phải có tiếng Việt" → validate bằng zod | Ép được bằng NOT NULL |

Với 2–3 ngôn ngữ cố định và ~30 bảng danh mục, JSONB thắng rõ. Bảng translation chỉ đáng dùng khi cần quy trình dịch riêng (trạng thái bản dịch, ai dịch, duyệt bản dịch).

### Index bắt buộc

Sort dùng expression index thẳng trên JSONB:

```sql
CREATE INDEX idx_products_name_vi ON products ((name->>'vi'));
```

**Tìm kiếm không dấu thì phức tạp hơn — `unaccent()` KHÔNG immutable.** PostgreSQL đánh dấu `unaccent()` là `STABLE` vì nó phụ thuộc dictionary cấu hình, nên **cả hai** cách sau đều bị từ chối:

```sql
-- ❌ ERROR: functions in index expression must be marked IMMUTABLE
CREATE INDEX ... ON products USING gin (unaccent(name->>'vi') gin_trgm_ops);

-- ❌ Cũng lỗi: generation expression cũng bắt buộc immutable
ALTER TABLE products ADD COLUMN name_vi_search text
  GENERATED ALWAYS AS (lower(unaccent(name->>'vi'))) STORED;
```

**ĐÃ CHỐT: chuẩn hoá ở tầng ứng dụng, ghi vào cột thường.**

```sql
ALTER TABLE products ADD COLUMN name_vi_search text;   -- cột thường, KHÔNG generated
CREATE INDEX idx_products_name_vi_search
  ON products USING gin (name_vi_search gin_trgm_ops);
```

Repository tính `name_vi_search = normalize(name.vi)` (lower + bỏ dấu bằng `String.normalize('NFD')`) trên **mọi** đường ghi. An toàn vì §4.9 đã bắt buộc mọi write đi qua repository.

*Phương án thay thế — bọc một hàm `IMMUTABLE` quanh `unaccent('unaccent', $1)` rồi dùng trong generated column — cũng chạy và được dùng phổ biến, nhưng là lời nói dối với planner: nếu dictionary đổi thì index sai âm thầm. Không chọn.*

Cách này cũng khớp với `name_unaccent` đã nêu ở §3.5, và bỏ được phụ thuộc vào extension `unaccent` của PostgreSQL.

### Tích hợp với parser — MỘT hàm resolve, dùng ở BỐN nơi

Đây là chỗ sai rất tinh vi. Nếu hiển thị dùng fallback `COALESCE` nhưng sort lại dùng `name->>'en'` trực tiếp:

```
name = { vi: "Máy xét nghiệm", en: null },  locale = en
→ UI hiển thị   "Máy xét nghiệm"   ✅ (nhờ fallback)
→ sort          theo NULL          ❌
→ tìm "Máy xét nghiệm"  không ra   ❌
```

**ĐÃ CHỐT: đúng một hàm `resolveLocaleExpr(field, locale)`, dùng ở cả bốn nơi — response, filter, sort, quick search.**

```ts
resolveLocaleExpr('name', 'vi') // → name->>'vi'
resolveLocaleExpr('name', 'en') // → COALESCE(name->>'en', name->>'vi')
```

`vi` là locale gốc nên không cần fallback; mọi locale khác fallback về `vi`.

**Index phải khớp đúng biểu thức đó**, nếu không planner bỏ qua index:

```sql
CREATE INDEX idx_products_name_vi ON products ((name->>'vi'));
CREATE INDEX idx_products_name_en ON products ((COALESCE(name->>'en', name->>'vi')));
```

**Cột search cũng fallback ở tầng dữ liệu, không phải chỉ ở UI:**

```
name_vi_search = normalize(name.vi)
name_en_search = normalize(name.en ?? name.vi)
```

`q` (tìm nhanh) quét `<field>_<locale>_search` + `code`.

### Ba luật bắt buộc

1. **Chỉ danh mục (master data) được dịch.** Chứng từ giao dịch không dịch.
2. **Chốt tên vào chứng từ lúc phát sinh** (`itemNameSnapshot`). Hoá đơn năm ngoái phải in đúng tên tại thời điểm đó, kể cả khi sản phẩm đã đổi tên hoặc bổ sung ngôn ngữ. Cùng nguyên tắc với hệ số quy đổi ở §5B.2/B2.
3. **Nhãn enum dịch ở FE** qua i18n, không lưu trong cơ sở dữ liệu.

---

# 4. ĐẶC TẢ BACKEND

## 4.1 Cấu trúc thư mục

```
apps/api/src/
├── main.ts
├── worker.ts                   # entrypoint riêng cho BullMQ worker
├── app.module.ts
├── common/                     # [CORE]
│   ├── decorators/             # @CurrentUser, @RequirePermission, @Transactional
│   ├── filters/                # AllExceptionsFilter
│   ├── guards/                 # JwtAuthGuard, PermissionGuard
│   ├── interceptors/           # Logging, Timeout, Serialize
│   ├── pipes/
│   ├── query/                  # FilterParser, SortParser, Paginator ← quan trọng
│   └── dto/                    # PaginatedDto, ErrorDto
├── infra/                      # [CORE]
│   ├── prisma/  redis/  storage/  mail/  queue/  cls/
├── modules/
│   ├── auth/                   # [CORE]
│   ├── users/                  # [CORE]
│   ├── roles/                  # [CORE]
│   ├── org-units/              # [CORE]
│   ├── files/                  # [CORE]
│   ├── audit/                  # [CORE]
│   ├── settings/               # [CORE] hạ tầng config; MÀN HÌNH quản lý mới là [OPT]
│   ├── notifications/          # [OPT]
│   ├── approvals/              # [OPT]
│   ├── imports/                # [OPT]
│   └── orders/                 # [REF] module nghiệp vụ mẫu
└── config/
```

**Quy tắc:** chia theo **domain**, không theo layer. Một module = một thư mục chứa controller, service, dto, entity, test của nó.

## 4.2 Vòng đời request

```
Middleware        → gắn requestId, khởi tạo CLS context
  ↓
Guard             → JwtAuthGuard → PermissionGuard (đọc @RequirePermission)
  ↓
Interceptor(pre)  → LoggingInterceptor, TimeoutInterceptor
  ↓
Pipe              → ValidationPipe (whitelist, transform)
  ↓
Controller        → mỏng: chỉ nhận DTO, gọi service, trả kết quả
  ↓
Service           → chứa toàn bộ nghiệp vụ, nhận Ability để lọc dữ liệu
  ↓
Interceptor(post) → SerializeInterceptor (áp field-level permission)
  ↓
ExceptionFilter   → map exception → hình dạng lỗi ở §3.6
```

**Quy tắc:** controller không chứa logic nghiệp vụ. Service không biết gì về HTTP.

## 4.3 Xác thực

| Hạng mục | Quyết định |
|---|---|
| Access token | JWT, sống 15 phút. **Payload chốt cứng — xem dưới bảng.** Không nhúng permission |
| Refresh token | Opaque random, sống 30 ngày, lưu Redis, **xoay vòng mỗi lần dùng** |
| Phát hiện đánh cắp | Refresh token cũ bị dùng lại → **huỷ toàn bộ session của user** + ghi audit + gửi email cảnh báo |
| Lưu ở FE | **Xem §4.3b** — transport khác nhau theo loại client |
| Hash mật khẩu | argon2id |
| Chống dò | Rate limit 5 lần/15 phút theo IP+email, khoá tài khoản 30 phút sau 10 lần |
| Session | **Hai nơi, hai vai trò** — xem §4.3d |
| Đổi mật khẩu | Huỷ mọi session khác |

### Payload access token — ĐÃ CHỐT

```json
{
  "sub":          "userId",
  "tenantId":     "tenantId",
  "membershipId": "membershipId",
  "sessionId":    "sessionId",
  "orgUnitId":    "orgUnitId",
  "exp": 0, "iat": 0
}
```

`tenantId` **bắt buộc** có mặt (§3.1b). `membershipId` cần thiết vì role và đơn vị gắn theo membership, không gắn theo user (§4.4b).

**Ghi chú về permission trong token:** cố tình **không** nhúng danh sách quyền vào JWT. Lý do: thu hồi quyền phải có hiệu lực tức thì, và permission của user quản trị có thể rất dài.

**Cache permission trong Redis theo `(tenantId, userId)`:**

```
perm:<tenantId>:<userId>       ✅
perm:<userId>                  ❌ rò rỉ quyền chéo tenant
```

Invalidate khi **bất kỳ** thứ nào sau đây đổi: `roles`, `role_permissions`, `user_roles`, `tenant_memberships`, `org_units` (vì scope `descendants` phụ thuộc cây đơn vị).

**Cạm bẫy của `orgUnitId` trong token:** chuyển user sang phòng ban khác sẽ **không** có hiệu lực cho tới khi token hết hạn (tối đa 15 phút). Vì vậy **đổi `org_unit_id` trong membership bắt buộc huỷ toàn bộ session của user đó**, buộc lấy token mới. Không làm vậy thì user tiếp tục thấy dữ liệu phòng ban cũ trong 15 phút — với dữ liệu nhân sự hoặc lương, đó là sự cố thật.

**Bổ sung [OPT]:** 2FA TOTP + recovery code; SSO (Google, Entra ID, OIDC); API key cho tích hợp; impersonation có audit.

## 4.3b Transport của token — ĐÃ CHỐT

Trước đây tài liệu vừa yêu cầu `Authorization: Bearer` vừa yêu cầu httpOnly cookie — **đó là mâu thuẫn**, vì JS không đọc được cookie httpOnly để tự gắn header. Chốt lại:

| Loại client | Access token | Refresh token | Chống CSRF |
|---|---|---|---|
| **Web (Next.js)** | httpOnly cookie, `Secure`, `SameSite=Lax` | httpOnly cookie, path giới hạn `/api/v1/auth/refresh` | **Bắt buộc**: double-submit token + kiểm tra `Origin` cho mọi method thay đổi dữ liệu |
| **Mobile / đối tác** | `Authorization: Bearer` | Secure storage của thiết bị | Không cần (không dùng cookie) |

**Quy tắc thực thi:**
- `CompositeAuthGuard` đọc token từ cookie **hoặc** header
- Một request chỉ được dùng **một** cơ chế. Có cả hai → `400`
- FE web tuyệt đối không chạm vào token; không có token trong `localStorage`, `sessionStorage` hay biến JS

**Lý do không chọn "access token trong memory + Bearer cho cả web":** token trong biến JS vẫn bị đánh cắp qua XSS nên không an toàn hơn, mà lại thêm một vòng refresh mỗi lần F5 trước khi render được. Với ứng dụng quản trị mở cả ngày, đó là ma sát thật mà không đổi được lợi ích thật.

### Contract CSRF — ĐÃ CHỐT

Chỉ áp cho client dùng cookie. Tên cookie và header chốt cứng để FE không phải đoán:

```
Cookie:  csrf_token=<random 32 byte, base64url>
         Secure; SameSite=Lax; Path=/
         KHÔNG HttpOnly  ← đây là cookie DUY NHẤT mà JS được đọc

Request thay đổi dữ liệu (POST/PATCH/DELETE):
         X-CSRF-Token: <giá trị đọc từ cookie csrf_token>
```

Server kiểm tra theo đúng thứ tự, thất bại ở bước nào → `403 AUTH.CSRF_FAILED`:

1. Cookie `csrf_token` tồn tại
2. Header `X-CSRF-Token` tồn tại
3. Hai giá trị khớp nhau, so sánh **constant-time**
4. `Origin` (hoặc `Referer` nếu thiếu `Origin`) thuộc allowlist

Access token và refresh token vẫn `HttpOnly`; **chỉ CSRF token là JS đọc được**. Cấp lại cookie CSRF cùng lúc với login và mỗi lần refresh.

## 4.3d Session: Redis và DB — hai vai trò khác nhau

Tài liệu có cả `sessions` trong DB lẫn session trong Redis. Chốt rõ ai làm gì:

| | Redis | DB `sessions` |
|---|---|---|
| Vai trò | **Trạng thái auth runtime** | **Metadata lâu dài** |
| Nội dung | hash refresh token hiện hành, `familyId`, expiry, cờ thu hồi | device, IP, user-agent, `created_at`, `last_seen_at`, `revoked_at` |
| Dùng cho | **Mọi lần kiểm tra xác thực** | Màn hình "Thiết bị đang đăng nhập", lịch sử, điều tra sự cố |
| Mất dữ liệu | Chấp nhận được — user phải đăng nhập lại | Không chấp nhận được |

**Nguồn sự thật cho việc "phiên này còn hiệu lực không" là Redis.** DB không tham gia đường kiểm tra nóng.

Thu hồi phiên, đúng thứ tự này:

```
1. UPDATE sessions SET revoked_at = now()     -- ghi bền trước
2. DEL Redis session key                       -- có hiệu lực ngay
```

*Làm ngược lại thì có cửa sổ mà phiên đã bị xoá khỏi Redis nhưng DB vẫn hiện "đang hoạt động".*

### Refresh token family — cần thiết để phát hiện tái sử dụng

§4.3 yêu cầu "dùng lại refresh token cũ → huỷ toàn bộ session", nhưng muốn **phát hiện** được thì phải còn dấu vết token cũ. Cấu trúc trong Redis:

```
refresh:<familyId>
  currentHash        hash của refresh token đang hiệu lực
  consumedHashes[]   hash các token đã dùng, giữ tới khi family hết hạn
  userId, tenantId, sessionId, rotatedAt, expiresAt
```

| Tình huống | Xử lý |
|---|---|
| Token khớp `currentHash` | Xoay: đẩy hash cũ vào `consumedHashes`, sinh token mới |
| Token khớp một phần tử trong `consumedHashes` | **Dấu hiệu bị đánh cắp** → huỷ **cả family** + mọi session của user + audit + email cảnh báo |
| Token không khớp gì | `401`, không huỷ gì (có thể chỉ là token quá cũ đã hết hạn) |

`consumedHashes` phải sống **ít nhất tới khi family hết hạn**. Xoá sớm là mất khả năng phát hiện.

## 4.3c Vòng đời tài khoản — [CORE]

Phần §4.3 chỉ nói về token và session. Vòng đời tài khoản là phần riêng, luôn cần:

- Admin **gửi lời mời** → link dùng một lần, có hạn → user tự đặt mật khẩu lần đầu
- Xác thực email; gửi lại email xác thực
- Vô hiệu hoá / kích hoạt lại; mở khoá tài khoản bị lock
- **Nghỉ việc:** thu hồi toàn bộ quyền + huỷ mọi session + **chuyển giao bản ghi đang được phân công** cho người khác (đây là bước hay bị bỏ, dẫn tới dữ liệu mồ côi)
- Chuyển phòng ban / đổi đơn vị
- Import tài khoản hàng loạt
- Xem lần đăng nhập cuối, thiết bị, hoạt động gần nhất

**Email là unique toàn hệ thống** (hệ quả của `users` global — xem §4.4b). Một người dùng một email cho mọi tenant; phân biệt bằng `tenant_memberships`.

### Quên mật khẩu — [CORE]

FE đã có route `forgot-password` (§5.1) nhưng trước đây thiếu đặc tả phía BE. Chốt:

```
POST /auth/forgot-password  { email }
  → LUÔN trả 202 với cùng một response, bất kể email có tồn tại hay không
```

| Yêu cầu | Chi tiết |
|---|---|
| Chống dò tài khoản | Response và **thời gian phản hồi** phải như nhau dù email tồn tại hay không → gửi mail qua queue, không gửi đồng bộ |
| Rate limit | Theo IP **và** theo email, riêng biệt |
| Token | Random ≥32 byte. **DB chỉ lưu hash**, bản gốc chỉ nằm trong email |
| Hạn dùng | 15–30 phút, **dùng một lần** |
| Cấp token mới | Vô hiệu hoá mọi token chưa dùng của user đó |
| Tài khoản bị vô hiệu hoá | Không gửi mail, nhưng response vẫn giống hệt |

```
POST /auth/reset-password  { token, newPassword }
```

1. Verify hash token, kiểm tra hạn và trạng thái chưa dùng
2. Đặt mật khẩu mới bằng argon2id, áp chính sách mật khẩu
3. Đánh dấu token đã dùng
4. **Thu hồi toàn bộ session** của user (mọi tenant, mọi thiết bị)
5. Ghi `audit_logs`
6. Gửi email **cảnh báo mật khẩu vừa được đổi**, kèm IP và thời điểm

Bảng `password_reset_tokens` — xem §6.

## 4.4 Phân quyền

### Mô hình

```
Permission  = resource:action              vd: order:approve
Scope       = own | department | descendants | all
Assignment  = (role, permission, scope)
User        → nhiều Role, thuộc một OrgUnit
```

| Scope | Nghĩa |
|---|---|
| `own` | Chỉ bản ghi do mình tạo hoặc được giao |
| `department` | Bản ghi thuộc đơn vị của mình |
| `descendants` | Đơn vị của mình và toàn bộ đơn vị con |
| `all` | Toàn hệ thống |

### Quy tắc thực thi

1. **Permission registry khai báo trong code** (`common/permissions.ts`), tự động đồng bộ xuống DB lúc khởi động. Không seed tay, không sửa trực tiếp DB.
2. Guard đọc decorator `@RequirePermission('order:approve')` → chặn ở tầng endpoint.
3. **Row-level: điều kiện phải nằm trong câu query.**
   ```ts
   const where = { ...filters, ...ability.scopeWhere('Order') }
   const [data, total] = await Promise.all([
     prisma.order.findMany({ where, skip, take }),
     prisma.order.count({ where }),
   ])
   ```
   *Tuyệt đối không fetch rồi lọc trong bộ nhớ — phân trang sẽ sai.*
4. **Field-level:** cột nhạy cảm (giá vốn, lương, chiết khấu) gắn `@Expose({ groups: [...] })`, `SerializeInterceptor` áp nhóm theo quyền. Thiết kế ngay từ đầu; bổ sung sau rất tốn.
5. **Cây đơn vị:** dùng `ltree` của PostgreSQL cho `descendants` (một truy vấn, không đệ quy).
6. FE cũng kiểm tra quyền nhưng **chỉ để làm UI**. Chặn thật luôn là việc của BE.

### Vai trò là dữ liệu, không phải mã nguồn — ĐÃ CHỐT

Boilerplate **seed** 5 vai trò mẫu (`SYSADMIN`, `TENANT_ADMIN`, `MANAGER`, `STAFF`, `VIEWER`), nhưng đó chỉ là điểm khởi đầu. Kế toán, Thủ kho, Kinh doanh, Trưởng phòng… là **vai trò do tenant tự cấu hình**, ghép từ `permission + scope`.

**Luật cứng — cấm rẽ nhánh theo mã vai trò:**

```ts
if (user.role === 'ACCOUNTANT') { ... }     // ❌ CẤM
if (can('invoice:approve')) { ... }         // ✅ luôn kiểm theo permission
```

Vi phạm luật này là phá vỡ toàn bộ mô hình RBAC: khách tạo vai trò mới sẽ không chạy, và mỗi tenant cần một nhánh code riêng.

**Thực thi bằng CI**, không bằng lời nhắc: quét `apps/api/src` và `apps/web/src` tìm so sánh chuỗi với mã vai trò, cho phép **duy nhất** trong file seed. Đưa vào bộ check ở GĐ1.

### Kiểm chứng

Bắt buộc có test bảng `role × endpoint → HTTP status kỳ vọng`. Đây là loại test có tỉ lệ bắt lỗi cao nhất trong hệ thống quản trị.

## 4.4b Multi-tenant — ĐÃ CHỐT: CÓ

**Nguyên tắc cốt lõi:** tenant filter là tầng **dưới** permission, hai cơ chế hoàn toàn riêng biệt. Tuyệt đối **không** biến `tenant` thành một giá trị của `scope` — gộp lại là công thức rò rỉ dữ liệu chéo.

| Hạng mục | Quy định |
|---|---|
| Cột | `tenantId uuid NOT NULL` trên mọi bảng nghiệp vụ |
| Thực thi | Prisma extension tự chèn `tenantId` từ CLS vào **mọi** query. Không tin service tự nhớ |
| Unique index | Luôn composite: `UNIQUE (tenant_id, code) WHERE deleted_at IS NULL` |
| Đánh số chứng từ | `document_sequences` khoá theo `(tenant_id, key, year)` |
| Cache Redis | Mọi key mang tiền tố `t:<tenantId>:` |
| BullMQ | Payload job **bắt buộc** chứa `tenantId`; worker set CLS trước khi xử lý |
| File S3 | Object key có tiền tố `<tenantId>/` |
| Nguồn tenant | **Chỉ từ access token** — xem §3.1b. Server bỏ qua mọi header/query/body nói về tenant |

**Cổng CI bắt buộc:** seed 2 tenant có dữ liệu giống nhau, chạy **toàn bộ** endpoint bằng token của tenant A, khẳng định không dòng nào của tenant B lọt ra. Test này chặn merge nếu thất bại.

### Mô hình định danh — ĐÃ CHỐT

**`users` là global identity; `tenant_memberships` là tài khoản thành viên trong từng tenant.**

```
users(id, email UNIQUE, password_hash, full_name, ...)     ← GLOBAL
tenant_memberships(tenant_id, user_id, org_unit_id, status, joined_at, invited_by_id)
user_roles(tenant_id, user_id, role_id)                    ← role gắn theo tenant
```

*Lý do:* bối cảnh Việt Nam có kế toán dịch vụ làm cho nhiều công ty và tập đoàn nhiều pháp nhân. Một user một email, nhiều membership.

*Chi phí phải chấp nhận:* luồng login có thêm bước chọn tenant khi user có nhiều membership; email unique toàn hệ thống nên không thể tạo hai tài khoản riêng cùng email.

### Ba hệ quả bắt buộc của mô hình global identity

Bỏ sót một trong ba điều dưới đây sẽ gây rò rỉ dữ liệu chéo tenant — loại lỗi nghiêm trọng nhất trong hệ thống này.

**1. Prisma extension phải có allowlist bảng global.**

Một allowlist phẳng là chưa đủ vì có bảng **hybrid** (`settings`, `feature_flags`: `tenant_id NULL` = mặc định toàn hệ thống). Dùng **policy ba nhóm**:

```ts
export const TENANCY_POLICY = {
  // Không inject tenant
  GLOBAL: [
    'User', 'Permission', 'Tenant', 'TenantDomain',
    'PasswordResetToken', 'SystemAnnouncement', 'MaintenanceWindow',
  ],
  // where: tenant_id = current OR tenant_id IS NULL  (ưu tiên dòng có tenant)
  HYBRID: ['Setting', 'FeatureFlag'],
  // Mặc định: bắt buộc inject tenant_id = current
  TENANT: 'default',
} as const
```

**Điều quan trọng hơn danh sách: làm cho việc quên trở thành bất khả thi.** Lúc khởi động, duyệt toàn bộ model trong Prisma DMMF và **crash nếu có model chưa được phân loại**:

```ts
assertExhaustiveTenancyPolicy(allModels, TENANCY_POLICY)
// Thêm model mới mà quên phân loại → không khởi động được / CI đỏ
```

**`allModels` lấy từ đâu là implementation detail, không phải contract.** Thứ tự ưu tiên:

1. **Build-time**: script codegen đọc `schema.prisma`, sinh union type các model + kiểm tra vét cạn ở tầng TypeScript → CI đỏ khi thiếu. *Ưu tiên phương án này*
2. Runtime, dùng API metadata **được phiên bản Prisma đã pin hỗ trợ chính thức**

Không phụ thuộc cứng vào API nội bộ (như `Prisma.dmmf`) trừ khi có ADR xác nhận nó ổn định ở phiên bản đang dùng.

Danh sách dài rồi cũng lỗi thời; kiểm tra vét cạn lúc khởi động thì không. Đây là cùng nguyên lý với composite FK ở §6.4 — biến sai sót thành **bất khả thi**, không phải "nhớ đừng quên".

**2. Cache permission khoá theo `(userId, tenantId)`, không phải `userId`.**

```
perm:<tenantId>:<userId>       ✅
perm:<userId>                  ❌ rò rỉ quyền chéo tenant
```

**3. Sysadmin truy cập chéo tenant là cơ chế tường minh, luôn ghi audit.**

- Không có "quyền xem mọi tenant" ngầm định
- Phải chọn tenant tường minh, mỗi lần vào ghi `audit_logs` với `action = 'CROSS_TENANT_ACCESS'`
- **Quan trọng:** định nghĩa trước cơ chế này, nếu không **test cách ly tenant sẽ bị viết sai** — người viết test sẽ trừ bỏ sysadmin một cách bừa bãi và làm rỗng giá trị của test

### Đổi tenant đang làm việc

Cấp lại access token mới có `tenantId` mới, **không** chỉ đổi context phía client. Lý do: `tenantId` nằm trong token là nguồn sự thật duy nhất; nếu đọc từ header do client gửi thì client tự đổi được.

## 4.4c Phân quyền cấp trường — ĐÃ CHỐT: CÓ

Áp dụng qua `@Expose({ groups })` + `SerializeInterceptor`. **Bốn chỗ bắt buộc áp, ba chỗ sau rất hay bị bỏ sót:**

1. Response API (hiển nhiên)
2. **Export Excel/CSV** — ẩn cột trên UI nhưng export ra đủ là lỗi phổ biến nhất
3. **Report framework** (§5B.1/A1) — báo cáo tổng hợp cũng phải lọc cột
4. **Audit log diff** — không để giá trị nhạy cảm lọt vào `before`/`after`

**Điểm ít ai để ý:** whitelist filter và sort **phải loại bỏ** field không được xem. Cho phép `sort=salary` là để user suy ra thứ tự lương dù không thấy con số.

## 4.5 Tầng dữ liệu

### Trường chuẩn của mọi bảng nghiệp vụ

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid v7 | PK |
| `createdAt` / `updatedAt` | timestamptz | |
| `deletedAt` | timestamptz null | Soft delete |
| `createdById` / `updatedById` | uuid | |
| `orgUnitId` | uuid | Phục vụ scope phân quyền |
| `version` | int | **Optimistic locking** |
| `tenantId` | uuid | **Bắt buộc, NOT NULL.** Xem §4.4b |
| `externalId` | text null | Đối soát hệ thống ngoài. `UNIQUE (tenant_id, source, external_id)` partial |
| `source` | text null | `manual` / `import` / `<tên hệ thống nguồn>` |

### Optimistic locking

Client gửi `version` khi `PATCH`. BE `UPDATE ... WHERE id = ? AND version = ?`; không có dòng nào bị ảnh hưởng → `409 COMMON.VERSION_CONFLICT`.

*Lý do bắt buộc:* hệ thống quản trị có nhiều người sửa chung một bản ghi. Thiếu cơ chế này thì dữ liệu bị ghi đè âm thầm, và loại lỗi đó gần như không thể tái hiện khi có báo cáo.

### Soft delete

- **Soft-delete extension chỉ áp cho model nằm trong `SOFT_DELETE_MODELS`** (§6.2). Model không có `SoftDeleteFields` thì extension **không can thiệp** — nếu chèn `deletedAt: null` vào "mọi query" thì query sẽ vỡ trên các model không có cột này
- Read mặc định `WHERE deleted_at IS NULL`; repository có chế độ tường minh `active` / `deleted` / `all`
- `SOFT_DELETE_MODELS` cũng phải qua kiểm tra vét cạn lúc khởi động, giống `TENANCY_POLICY`. Generator tự cập nhật danh sách
- Unique index phải là **partial VÀ composite với `tenant_id`**:
  `UNIQUE (tenant_id, code) WHERE deleted_at IS NULL`
  *(Phiên bản trước của tài liệu ghi `UNIQUE (code)` — sai, mâu thuẫn với §4.4b)*
- Có UI thùng rác + khôi phục + job xoá cứng sau N ngày

### Transaction

Dùng `@nestjs-cls/transactional`, truyền transaction qua AsyncLocalStorage:

```ts
@Transactional()
async approve(id: string) {
  await this.orders.update(...)      // tự động dùng chung tx
  await this.stock.reserve(...)
  await this.events.emit(...)
}
```

Không truyền `tx` xuyên tham số qua nhiều tầng.

## 4.6 Chống N+1 — quy trình bắt buộc

| Biện pháp | Chi tiết |
|---|---|
| Nguyên tắc | Service trả **đúng** shape endpoint cần. Serializer không được lazy-load |
| Khai báo quan hệ | Chỉ `select`/`include` những trường thực sự dùng, không `include` cả bảng |
| **Test đếm query** | Helper `expectQueryCount(n)` bắt buộc cho mọi endpoint danh sách. Đây là cách duy nhất chặn N+1 tái phát khi refactor |
| Log cảnh báo | Dev mode: request nào > 20 query → log warning kèm stack |
| Slow query | Query > 200ms → log kèm `traceId` |
| DataLoader | Chỉ dùng khi buộc phải load lẻ không join được |
| **Bẫy ngược** | `include` 8 bảng cho danh sách 50 dòng có thể chậm hơn N+1. Luôn `EXPLAIN ANALYZE` các query danh sách chính |

## 4.7 Nghiệp vụ dùng chung

### Đánh số chứng từ — [CORE]

Định dạng cấu hình được: `{PREFIX}-{YYYY}-{SEQ:5}` → `PO-2026-00042`

**ĐÃ CHỐT một cách duy nhất** — atomic UPSERT, chạy trong **cùng transaction** với việc tạo chứng từ:

```sql
INSERT INTO document_sequences (tenant_id, key, year, current_value)
VALUES (:tenantId, :key, :year, 1)
ON CONFLICT (tenant_id, key, year)
DO UPDATE SET current_value = document_sequences.current_value + 1
RETURNING current_value;
```

An toàn với nhiều instance, ít code hơn, không cần `SELECT FOR UPDATE` hay advisory lock.

*Đánh đổi cần biết:* câu này giữ row lock tới khi transaction commit, nên nhiều chứng từ cùng `key`+`year` sẽ **xếp hàng**. Đây là điều **mong muốn** — nghiệp vụ kế toán Việt Nam yêu cầu số chứng từ liên tục, không nhảy cóc. Nếu chấp nhận có khoảng trống thì mới tách việc cấp số ra ngoài transaction.

### Máy trạng thái — [CORE]

Mỗi chứng từ khai báo bảng chuyển trạng thái hợp lệ, mỗi transition gắn permission. Chuyển sai → `409`. Không rải `if (status === ...)` khắp service.

### Import Excel/CSV — [OPT], khuyến nghị giữ

Luồng 5 bước, chạy bất đồng bộ qua queue:

```
1. Upload file (presigned) → tạo ImportJob (status=PARSING)
2. Parse header → gợi ý map cột, trả về cho user xác nhận
3. Validate toàn bộ dòng → lưu kết quả lỗi từng dòng vào DB
4. Hiển thị bảng preview: dòng nào lỗi, lỗi gì, cho tải file lỗi
5. User xác nhận → commit theo batch trong transaction → báo cáo kết quả
```

*Đây là tính năng gần như dự án quản trị nào cũng cần và luôn tốn nhiều thời gian nếu làm lại từ đầu.*

**Đặc tả giao dịch — không được mơ hồ:**

| Hạng mục | Quy định |
|---|---|
| Transaction | **Mỗi batch một transaction riêng** (500–1.000 dòng). Tuyệt đối không một transaction cho cả file 100.000 dòng |
| Checkpoint | `import_jobs.last_processed_row`. Retry tiếp tục từ checkpoint, không chạy lại từ đầu |
| Chống trùng khi retry | Unique business key (§3.9), không dựa vào việc job chạy đúng một lần |
| Chế độ | Khai báo theo từng loại import: `all-or-nothing` hoặc `partial-success` |
| Bản ghi đã tồn tại | Khai báo: `skip` / `replace` / `fill-empty-only` |
| Giới hạn lỗi | Dừng job khi vượt N dòng lỗi hoặc X% — tránh chạy hết 100.000 dòng rồi mới biết sai mapping |
| Huỷ job | Cho phép huỷ giữa chừng; các batch đã commit giữ nguyên, ghi rõ trong báo cáo |
| Phiên bản template | Lưu `template_version` để biết file được nhập theo cấu trúc nào |
| **File lỗi** | **Che field nhạy cảm theo quyền của người tải** — file lỗi cũng là một kênh xuất dữ liệu, phải áp field-level permission (§4.4c) |

### Export — [CORE]

Luôn qua queue, kể cả dữ liệu nhỏ. Cho phép chọn cột, chọn phạm vi (trang hiện tại / toàn bộ kết quả đã lọc), file có hạn tải 24h, thông báo khi xong.

*Lý do bắt buộc qua queue: export đồng bộ sẽ timeout ở đúng thời điểm tệ nhất — cuối tháng, khi dữ liệu nhiều nhất.*

### Sinh chứng từ — [OPT]

- PDF: Puppeteer render HTML template (kiểm soát layout tốt, hỗ trợ font tiếng Việt)
- Word: `docxtemplater` với template `.docx` do nghiệp vụ tự cung cấp
- **Kiểm tra font tiếng Việt ngay từ ngày đầu** — PDF ra ô vuông là lỗi kinh điển và phát hiện muộn thì rất phiền

### Quy trình duyệt — [OPT]

Cấu hình nhiều bước, người duyệt theo vai trò hoặc theo cấp đơn vị, duyệt/từ chối kèm lý do bắt buộc, uỷ quyền khi vắng mặt, lịch sử duyệt đầy đủ. Xem mô hình dữ liệu ở §6.

## 4.8 Xử lý nền

| Hạng mục | Quy định |
|---|---|
| Queue | BullMQ. Mỗi loại job một queue riêng |
| Retry | 3 lần, backoff luỹ thừa. Thất bại → dead-letter queue |
| Giám sát | Bull Board tại `/admin/queues`, chỉ role sysadmin |
| Cron | `@nestjs/schedule` + **redlock bắt buộc** — chạy 2 instance mà không khoá thì job chạy đôi |
| Sự kiện nội bộ | `EventEmitter2` cho event **chỉ tác động trong cùng transaction DB**. Handler phải idempotent |
| **Outbox — [CORE]** | **Luật:** mọi event có handler gây tác dụng phụ **ngoài** transaction DB (email, webhook, notification, gọi hệ thống ngoài) **bắt buộc** đi qua `outbox_events`, ghi trong cùng transaction nghiệp vụ. Worker đọc outbox rồi mới phát |

### Outbox claim protocol — ĐÃ CHỐT

Nhiều worker chạy song song thì phải quy định worker nào "nhận" event nào. Dùng `FOR UPDATE SKIP LOCKED`:

```sql
BEGIN;
SELECT id FROM outbox_events
 WHERE status = 'PENDING' AND available_at <= now()
 ORDER BY created_at
 FOR UPDATE SKIP LOCKED
 LIMIT 100;

UPDATE outbox_events
   SET status = 'PROCESSING', locked_at = now(), locked_by = :workerId
 WHERE id = ANY(:ids);
COMMIT;
```

| Tình huống | Xử lý |
|---|---|
| Xử lý xong | `status = 'DONE'`, `processed_at = now()` |
| Thất bại | `status = 'PENDING'`, `attempts + 1`, `available_at = now() + backoff` |
| Vượt `maxAttempts` | `status = 'DEAD'`, hiện trong màn hình vận hành (§5C.8) |
| **Worker chết** | Job quét: `locked_at` quá **lease timeout** (mặc định 5 phút) → trả về `PENDING` |

Đây **không** biến hệ thống thành exactly-once — vẫn at-least-once theo §8.2. Nó chỉ tránh hai worker cùng gọi một event tại cùng thời điểm, giảm số lần trùng chứ không loại bỏ.
| Email | Queue + react-email template. Dev dùng mailpit |
| Job dài | Cập nhật `progress`, FE hiển thị qua polling hoặc WebSocket |

## 4.9 Quan sát & audit

**Logging:** pino, JSON, có `traceId` xuyên suốt. Redact bắt buộc: `password`, `token`, `authorization`, `cccd`, `bankAccount`.

**Audit log — [CORE], bắt buộc:**

Ghi lại: entity, entityId, action, actor, diff before/after (chỉ field thay đổi), IP, user-agent, traceId, thời điểm. Có UI tra cứu và timeline hiển thị trên trang chi tiết từng bản ghi.

Cài đặt qua **Prisma Client query extension** (`$extends` + `$allOperations`), không phải `$use` middleware.

> **Cảnh báo về phiên bản:** `$use` middleware đã bị Prisma đánh dấu deprecated từ khi Client Extensions GA, và có thông tin nó bị **loại bỏ hẳn ở Prisma ORM 7**. Tài liệu này không xác minh được tình trạng phiên bản mới nhất — **hãy kiểm tra tài liệu Prisma hiện hành trước khi code**, và **pin major version** trong `package.json` + ghi vào ADR. Dùng extension là lựa chọn đúng trong mọi trường hợp, đồng thời thống nhất với extension lọc tenant ở §4.4b (một cơ chế, hai extension).

**Hai hạn chế của extension so với middleware cũ, phải tính từ đầu:**
- Lấy trạng thái *before* để tạo diff cần **một truy vấn đọc thêm** — chỉ bật cho model có bật audit diff, không bật đại trà
- Nested write khó chặn triệt để → càng củng cố luật "mọi write đi qua repository" ở cuối mục này

### Phạm vi audit — lỗ hở phải bịt

Query extension **không bắt được** các đường ghi sau. Nếu không xử lý, audit sẽ im lặng bỏ qua đúng những thao tác nhạy cảm nhất:

| Đường ghi | Xử lý |
|---|---|
| Raw SQL (kể cả conditional UPDATE của kho, §5B.2/B4) | Ghi audit tường minh trong service |
| Kysely write | **Cấm ghi bằng Kysely.** Kysely chỉ dùng cho báo cáo (đọc) |
| Worker / job nền | CLS phải mang `actorId = 'system:<jobName>'` |
| Bulk operation, import | Ghi **một** bản audit cho cả lô + `affectedCount`, không ghi 10.000 dòng |
| Script migration dữ liệu | Ghi audit với `actor = 'migration:<version>'` |
| Impersonation | Ghi **cả hai**: `actorId` (người thật) và `onBehalfOfId` |
| Sysadmin sửa dữ liệu tenant | Bắt buộc, kèm `CROSS_TENANT_ACCESS` (§4.4b) |
| Đổi setting, role, permission | Bắt buộc — đây là nhóm bị tấn công nhắm tới đầu tiên |

**Hai luật bắt buộc:**

1. **Mọi write nghiệp vụ phải đi qua repository/service có audit.** Không ghi trực tiếp bằng Prisma client hay raw SQL ngoài tầng đó.
2. **Nhóm security-critical có DB trigger audit riêng**, độc lập với tầng ứng dụng. Nếu bị sửa lén, toàn bộ hệ thống phân quyền sụp mà không để lại dấu vết:

| Bảng | Vì sao |
|---|---|
| `users` | Danh tính |
| `roles` | Định nghĩa vai trò |
| `role_permissions` | Quyền của vai trò |
| **`user_roles`** | **Sửa trực tiếp bảng này là cấp quyền cho user — quan trọng hơn cả `settings`** |
| `tenant_memberships` | Tư cách thành viên tenant |
| **`org_units`** | **Ảnh hưởng trực tiếp scope `department` / `descendants`** |
| `settings` | Cấu hình hệ thống |

Nơi khác trong tài liệu tham chiếu nhóm này bằng **tên** ("nhóm security-critical theo §4.9"), không bằng con số — để thêm/bớt không phải sửa ở ba chỗ.

**Sentry** cho cả FE và BE, gắn `traceId` để đối chiếu.

## 4.10 Bảo mật

| Rủi ro | Biện pháp |
|---|---|
| Injection | Prisma tham số hoá. Raw SQL bắt buộc dùng tagged template |
| Mass assignment | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` |
| IDOR | Row-level permission trong query. Không tồn tại/ngoài phạm vi đều trả `404` |
| SSRF | Whitelist domain cho mọi field nhận URL (webhook, import từ link) |
| Upload độc hại | Kiểm tra magic bytes chứ không tin extension, whitelist MIME, giới hạn dung lượng |
| Brute force | Rate limit riêng cho nhóm endpoint auth |
| Rò rỉ PII | Redact log, mã hoá cột nhạy cảm, phân quyền cấp trường |
| Header | helmet, CSP, HSTS |
| Phụ thuộc | `npm audit` + Dependabot trong CI |

Tuân thủ Nghị định 13/2023 về bảo vệ dữ liệu cá nhân: có chức năng xuất và xoá dữ liệu cá nhân theo yêu cầu.

## 4.11 Lưu trữ secret — [CORE]

Áp dụng cho `integration_credentials.config`, `webhook_endpoints.secret`, API key, mật khẩu SMTP, khoá ký. Không cần dựng abstraction Vault/KMS lớn ngay, nhưng **contract phải chốt từ đầu** vì đổi sau đồng nghĩa xoay toàn bộ secret đang lưu.

| Luật | Chi tiết |
|---|---|
| Không plaintext | Mã hoá ở tầng ứng dụng (AES-GCM) trước khi ghi DB |
| Khoá mã hoá | Lấy từ secret manager / KMS qua ENV, **không** nằm trong repo hay DB |
| **API không bao giờ trả secret** | Sau khi lưu, chỉ trả `••••1234` (4 ký tự cuối) và metadata |
| UI | Chỉ có **Replace** và **Rotate**. Không có nút "Xem mật khẩu" |
| Log | `pino` redact bắt buộc; `integration_logs.request/response` phải che secret **trước khi ghi** |
| Metadata | `secret_version`, `rotated_at`, `last_used_at` để biết secret nào còn sống |
| Xoay khoá mã hoá | `key_version` trên từng bản ghi để giải mã được dữ liệu cũ trong lúc chuyển đổi |
| Webhook `secret_previous` | Chỉ tồn tại trong cửa sổ xoay (mặc định 24h), sau đó job tự xoá. Không để tồn tại vĩnh viễn |

**Cạm bẫy hay gặp:** secret bị lộ qua log của integration chứ không phải qua DB. Việc che phải làm **trước khi** ghi `integration_logs`, không phải khi hiển thị.

---

# 5. ĐẶC TẢ FRONTEND

## 5.1 Cấu trúc thư mục

```
apps/web/src/
├── app/
│   ├── (auth)/login, forgot-password
│   └── (dashboard)/
│       ├── layout.tsx           # sidebar + header + providers
│       └── orders/page.tsx, [id]/page.tsx
├── components/
│   ├── ui/                      # primitive shadcn — chỉ restyle, không sửa logic
│   ├── common/                  # DataTable, FormField, DisabledTooltip, ConfirmDialog
│   └── patterns/                # CrudPage, DetailLayout, ImportWizard
├── features/
│   └── orders/                  # [REF]
│       ├── actions.ts           # Action Registry
│       ├── columns.tsx
│       ├── schema.ts            # zod
│       └── components/
├── lib/
│   ├── api/                     # interceptor, error mapping
│   ├── auth/                    # useCan, useCurrentUser
│   ├── query/                   # query key factory
│   └── format/                  # tiền, ngày, số
└── providers/
    ├── overlay/                 # modal manager, confirm
    └── command-palette/
```

## 5.2 Ranh giới RSC — quyết định kiến trúc

**Quyết định:** dùng App Router cho routing, layout, middleware auth. Các màn hình nghiệp vụ (danh sách, form) là **client component** với TanStack Query.

**Lý do:** màn hình quản trị có 10–15 bộ lọc, state nằm trong URL, mutation liên tục, cần optimistic update và cache invalidation. RSC không mang lại lợi ích SEO (app nội bộ) mà lại làm phức tạp việc chia sẻ state giữa bảng, filter và toolbar.

**Ngoại lệ dùng RSC:** trang dashboard chỉ đọc, trang in ấn, trang tĩnh.

## 5.3 Tầng dữ liệu

**Query key factory** — bắt buộc, không viết mảng key trực tiếp:

```ts
export const orderKeys = {
  all:    ['orders'] as const,
  lists:  () => [...orderKeys.all, 'list'] as const,
  list:   (p: OrderQuery) => [...orderKeys.lists(), p] as const,
  details:() => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
}
```

**Xử lý lỗi tập trung** tại interceptor của api-client, theo bảng §5.6.

**Refresh token phải single-flight:** nhiều request 401 cùng lúc chỉ được kích hoạt **một** lần refresh, các request còn lại xếp hàng chờ. Thiếu cơ chế này sẽ gây xoay vòng refresh token loạn và đăng xuất ngẫu nhiên.

## 5.4 Sở hữu state — bảng phân định

| Loại state | Nơi lưu | Ví dụ |
|---|---|---|
| Tham số danh sách | **URL** (`nuqs`) | page, limit, sort, filter, tab đang mở |
| Dữ liệu server | TanStack Query | danh sách, chi tiết, danh mục |
| Dữ liệu đang nhập | react-hook-form | form tạo/sửa |
| UI cục bộ | `useState` | mở/đóng accordion, hover |
| UI toàn cục (ít) | zustand | sidebar thu gọn, theme, density, đơn vị đang chọn |
| **Không bao giờ** | — | dữ liệu server trong store toàn cục |

**Lý do URL là nguồn sự thật cho bộ lọc:** người dùng quản trị thường xuyên copy link gửi đồng nghiệp và dùng nút Back. Nếu bộ lọc nằm trong `useState`, cả hai hành vi đó đều hỏng, và đây là than phiền phổ biến nhất về phần mềm quản trị.

## 5.5 DataTable — đặc tả

**Bắt buộc:**
- Sort / filter / phân trang phía server, đồng bộ URL
- Ẩn/hiện, đổi thứ tự, resize, ghim cột — **lưu theo từng user**
- Chọn dòng, chọn toàn bộ kết quả đã lọc, thanh bulk action
- Sticky header, **dòng tổng cộng ở footer**
- Trạng thái: loading skeleton / empty (có CTA) / **"không khớp bộ lọc" (khác empty, có nút xoá lọc)** / error (có retry)
- Xuất dữ liệu theo đúng bộ lọc hiện tại
- **Khôi phục vị trí cuộn khi quay lại từ trang chi tiết**

**Tuỳ chọn:** tree table, inline edit, virtualization, saved views (lưu bộ lọc + cấu hình cột thành view đặt tên).

## 5.6 Bảng ánh xạ phản hồi — bắt buộc tuân thủ

| Tình huống | Kênh hiển thị |
|---|---|
| Thành công | Toast (kèm Undo nếu là soft delete) |
| `422` | Lỗi inline dưới từng field + cuộn tới field đầu tiên |
| Lỗi nghiệp vụ có `code` | Alert banner đầu form |
| `403` | Toast |
| `409` version conflict | Dialog: "Dữ liệu đã thay đổi" + nút tải lại |
| `5xx` | Toast kèm `traceId` + nút copy |
| `401` | Refresh ngầm; thất bại → dialog hết phiên |
| Không có dữ liệu | Empty state có CTA |
| Lọc không ra kết quả | Empty state **khác** + nút xoá bộ lọc |
| Job nền hoàn tất | Notification center + toast |

Toast phải **dedupe** — 10 request lỗi cùng lúc chỉ hiện một toast.

## 5.7 Overlay & z-index

Token tập trung tại một file duy nhất:

```css
--z-sticky: 10;  --z-dropdown: 1000;  --z-overlay: 1100;
--z-dialog: 1110; --z-popover: 1200;  --z-tooltip: 1300; --z-toast: 1400;
```

Cấm dùng `z-index` rời rạc trong component. Đây là nguồn gốc của lỗi "popover bị dialog che".

**Overlay manager** cung cấp API imperative: `await confirm()`, `await prompt()`, `openModal()`. Hỗ trợ xếp chồng, focus trap, khoá cuộn không nhảy layout, và chặn đóng khi form có dữ liệu chưa lưu.

**Năm biến thể confirm:** thường / nguy hiểm (gõ đúng tên) / **bắt nhập lý do** / kèm tuỳ chọn / hàng loạt có báo kết quả từng dòng.

## 5.8 Form

- react-hook-form + zod, schema đặt tại `features/<domain>/schema.ts`
- **Map lỗi 422 vào đúng field** — key trong `details` khớp path của form
- Guard khi rời trang lúc chưa lưu
- Chế độ readonly dùng lại chính form đó, không viết hai lần
- Field array cho bảng chi tiết chứng từ (thêm/xoá/sắp xếp dòng, tự tính thành tiền, dòng tổng)
- Chặn double-submit, hỗ trợ `Ctrl+S`
- Bộ field chuẩn hoá: text, number có phân cách nghìn, currency, select async có phân trang, cascader tỉnh/xã, date range, upload kéo-thả, rich text…

## 5.9 Action Registry

**Nguyên tắc:** hành động là **dữ liệu**, không phải JSX. Khai báo một lần trong `features/<domain>/actions.ts`, render ra toolbar / menu ⋯ / context menu / bulk bar / Cmd+K.

Mỗi action khai báo: `id`, `label`, `icon`, `group`, `permission`, `enabled` (trả lý do nếu bị chặn), `confirm`, `run`, `success`, `invalidates`.

**Phân biệt quan trọng:**
- Thiếu `permission` → **ẩn hoàn toàn**
- Không thoả `enabled` → **disable + tooltip nêu lý do**

*Người dùng có quyền duyệt nhưng đơn vượt hạn mức phải thấy nút mờ kèm giải thích, không phải nút biến mất.*

Có **cửa thoát** `render?: (ctx) => ReactNode` cho action không vừa khuôn. Bắt mọi thứ chui qua registry chính là kiểu trừu tượng hoá quá tay mà §1.2 đã loại trừ.

Chi tiết cài đặt: xem file `action-registry.tsx` kèm theo.

## 5.10 Hệ thống giao diện

| Hạng mục | Quy định |
|---|---|
| Token | Màu, spacing, radius, shadow, z-index, duration khai báo bằng CSS variable |
| Chế độ | Sáng / tối |
| **Mật độ** | Compact / comfortable — người nhập liệu ưu tiên compact |
| Typography | Font hỗ trợ tiếng Việt đầy đủ; số dùng `font-variant-numeric: tabular-nums` |
| i18n | `next-intl`, dựng khung từ đầu kể cả chỉ dùng tiếng Việt. **Bổ sung sau rất tốn** |
| Responsive | Ma trận fallback: table→card, dialog→bottom sheet, sidebar→drawer, toolbar→overflow menu |
| Chuyển động | Tôn trọng `prefers-reduced-motion` |
| A11y | Focus visible, label đầy đủ, điều hướng bàn phím cho bảng và dialog |

---

# 5B. CÁC BÀI TOÁN LẶP LẠI KHÁC

> Sáu bài toán đã đặc tả ở các chương trước (phân quyền, phân trang, import/export, audit, duyệt, N+1) đều thuộc nhóm hạ tầng kỹ thuật. Chương này bổ sung ba nhóm còn lại, kèm nhóm thứ tư là các hạng mục **cố ý loại trừ**.

## 5B.1 Nhóm A — Hạ tầng bổ sung

### A1. Report framework — [CORE], ưu tiên cao

**Vấn đề:** mỗi dự án có 15–40 báo cáo, thường được viết tay từng cái (endpoint riêng, trang filter riêng, bảng riêng, hàm export riêng). Chi phí ~3 ngày/báo cáo và không nhất quán.

**Giải pháp:** khai báo báo cáo dưới dạng dữ liệu, sinh UI và export tự động.

```ts
defineReport({
  id: 'sales-by-customer',
  name: 'Doanh thu theo khách hàng',
  permission: 'report:sales',
  params: [dateRange('period'), orgUnit(), select('customerGroup')],
  query: (p, ability) => /* Kysely hoặc raw SQL, có áp scope */,
  columns: [
    { key: 'customerName', label: 'Khách hàng' },
    { key: 'revenue', label: 'Doanh thu', type: 'money', summary: 'sum' },
  ],
  drilldown: (row) => `/orders?filter[customerId][eq]=${row.customerId}`,
  cache: { ttl: 300 },
})
```

**Sinh tự động:** trang filter, bảng có dòng tổng, export Excel/PDF, kiểm tra quyền, cache, đăng ký vào menu Báo cáo.

**Ghi chú:** báo cáo dùng Kysely hoặc raw SQL, không dùng Prisma — báo cáo tổng hợp cần kiểm soát SQL trực tiếp.

### A2. Delete guard — kiểm tra ràng buộc trước khi xoá — [CORE]

**Vấn đề:** user bấm Xoá và nhận `500 foreign key violation`. Xuất hiện ở mọi dự án, thường được xử lý chắp vá từng chỗ.

**Giải pháp:** khai báo tham chiếu tập trung trên entity.

```ts
@References([
  { model: 'OrderItem',  field: 'productId', label: 'Chi tiết đơn hàng' },
  { model: 'StockEntry', field: 'productId', label: 'Phiếu nhập kho' },
])
```

Service `deleteWithGuard()` đếm tham chiếu trước; nếu có → `409` kèm `details`:

```json
{
  "code": "COMMON.HAS_REFERENCES",
  "message": "Không thể xoá vì đang được sử dụng",
  "details": {
    "references": [
      { "label": "Chi tiết đơn hàng", "count": 3, "link": "/orders?filter[productId][eq]=..." },
      { "label": "Phiếu nhập kho", "count": 1, "link": "..." }
    ]
  }
}
```

FE hiển thị danh sách có link bấm được, không phải thông báo chung chung.

### A3. Nhập liệu dạng bảng + dán từ Excel — [OPT], khuyến nghị giữ

Người dùng nghiệp vụ làm việc trong Excel và sẽ dán dữ liệu vào ứng dụng. Yêu cầu:

- Điều hướng bàn phím: Tab / Shift+Tab / Enter / mũi tên / Esc để huỷ ô
- **Dán nhiều dòng nhiều cột từ clipboard**, tự tạo dòng mới
- Validate từng ô, đánh dấu ô lỗi, không chặn nhập ô khác
- Undo/redo cấp ô
- Copy vùng chọn ra clipboard

### A4. Ngữ cảnh đơn vị & phân công dữ liệu động — [CORE]

Bổ sung cho scope tĩnh ở §4.4 hai cơ chế:

- **Bộ chọn đơn vị đang làm việc** ở header, lưu trong session, ảnh hưởng mọi query
- **Bảng phân công:** `assignments(entity, entity_id, user_id, role)` — dùng cho *"chỉ thấy khách hàng được giao cho mình"*. Tham gia vào mệnh đề `WHERE`, không lọc sau

### A5. Adapter tích hợp + integration log — [CORE]

Mỗi dự án có 2–5 tích hợp bên ngoài (hoá đơn điện tử, ngân hàng, SMS/ZNS, vận chuyển). Chuẩn hoá:

- Interface adapter cho từng loại, đăng ký qua DI
- Bảng `integration_logs(provider, action, request jsonb, response jsonb, status, duration_ms, trace_id, created_at)`
- Retry + backoff, circuit breaker
- **Sandbox mode** giả lập response để dev không chờ tài khoản thật
- UI tra cứu log — khi khách báo lỗi tích hợp, tra được trong 30 giây

### A6. Nhắc hạn / SLA / "việc của tôi" — [OPT]

Deadline, đánh dấu quá hạn, leo cấp khi quá hạn, widget "chờ tôi xử lý", nhắc qua email/in-app theo lịch. Đi kèm module duyệt.

### A7. Phiên bản bản ghi & phục hồi — [OPT]

Khác audit log: audit ghi *ai sửa gì*, versioning cho phép *quay về bản cũ*. Cần bảng snapshot + màn hình so sánh hai phiên bản.

### A8. Gộp bản ghi trùng — [OPT]

Khách hàng / nhà cung cấp bị nhập trùng là điều chắc chắn xảy ra. Cần:
- Cảnh báo trùng khi nhập (so khớp mờ theo tên/MST/điện thoại)
- Chức năng gộp: chọn bản ghi giữ lại, chuyển toàn bộ chứng từ liên quan, ghi audit

### A9. Báo lỗi từ trong ứng dụng — [OPT], chi phí thấp lợi ích cao

Nút "Báo lỗi" tự đính kèm: `traceId` của request gần nhất, URL, phiên bản build, log console, ảnh chụp màn hình. Giảm đáng kể số vòng trao đổi "bạn thao tác thế nào".

### A10. Danh mục dùng chung — [CORE]

Mỗi dự án có 10–30 bảng danh mục nhỏ có CRUD giống nhau (đơn vị tính, nhóm hàng, ngân hàng, lý do huỷ). Cần một khuôn `SimpleCategoryModule` sinh sẵn bởi generator, không viết lại từng cái.

---

## 5B.2 Nhóm B — Tính toán nghiệp vụ dễ sai

> Nhóm này không làm sập hệ thống nhưng làm **lệch số tiền**. Sai sót thường được phát hiện sau nhiều tháng và dẫn tới tranh chấp với khách hàng. Mỗi hạng mục phải là một module thuần tuý, không phụ thuộc hạ tầng, có unit test dày.

### B1. Bộ tính tiền: thuế, chiết khấu, làm tròn — [CORE]

**Phải chốt bằng văn bản trước khi code:**

| Câu hỏi | Ảnh hưởng |
|---|---|
| Chiết khấu áp **trước** hay **sau** VAT? | Lệch tổng tiền |
| Làm tròn **từng dòng** hay **cả hoá đơn**? | Lệch 1–2 đồng, gây khiếu nại |
| Làm tròn đến đồng / trăm đồng / nghìn đồng? | Theo quy định và thói quen khách |
| Tổng các dòng đã tròn có phải bằng tổng hoá đơn đã tròn? | Nếu không, cần dòng "điều chỉnh làm tròn" |
| Chiết khấu theo % hay số tiền, phân bổ về dòng thế nào? | Ảnh hưởng giá vốn, báo cáo lãi gộp |
| Nhiều mức thuế trên một hoá đơn | Phải tách bảng kê thuế theo mức |

Triển khai: hàm thuần, đầu vào là danh sách dòng + cấu hình, đầu ra là số liệu đã tính. Tuyệt đối không rải công thức trong service.

### B2. Đơn vị tính & quy đổi — [OPT]

Thùng / lốc / lon, kg / tấn. Nhập theo đơn vị lớn, lưu tồn theo đơn vị cơ sở, báo cáo theo cả hai. Hệ số quy đổi phải lưu **tại thời điểm phát sinh** chứng từ, vì hệ số có thể đổi.

### B3. Đa tiền tệ & tỷ giá — [OPT]

Tỷ giá tại thời điểm nào (đặt hàng / nhận hàng / thanh toán), lưu tỷ giá vào chứng từ, xử lý chênh lệch tỷ giá khi thanh toán.

### B4. Số dư đồng thời — [CORE nếu có kho/công nợ/quỹ]

**Bài toán khó nhất và khó tái hiện nhất trong toàn hệ thống.** Hai người xuất kho cùng lúc trên cùng một lô.

**ĐÃ CHỐT: bảng movement (append-only) + bảng snapshot số dư + job đối soát.** Không dùng `SELECT ... FOR UPDATE` trên dòng tồn.

*Lý do:* `FOR UPDATE` đơn giản hơn nhưng nghẽn ngay khi nhiều giao dịch trên cùng SKU, và không để lại lịch sử để truy nguyên khi số dư sai. Movement cho phép **tính lại từ đầu** — điều chắc chắn sẽ cần, vì số dư lệch là sự cố xảy ra ít nhất một lần ở mọi hệ thống có kho.

### Ba luật bắt buộc

1. **Bảng movement là append-only.** Không `UPDATE`, không `DELETE`, kể cả soft delete. Sửa sai bằng **bút toán đảo** (movement ngược dấu, có `reversalOf` trỏ về bản gốc).
2. **Job rebuild snapshot** — tính lại số dư từ toàn bộ movement. Là [CORE], không phải tuỳ chọn.
3. **Job đối soát định kỳ** — so số dư tính lại với snapshot đang lưu, cảnh báo khi lệch. Là [CORE]. Thiếu hai job này thì movement pattern **không an toàn**, chỉ là bảng log vô dụng.

### Ghi chú kỹ thuật

**Ba thành phần, ba vai trò khác nhau — không được lẫn:**

| Thành phần | Vai trò |
|---|---|
| `stock_balances` (snapshot) | **Điểm kiểm soát đồng thời** + đọc nhanh |
| `movements` | Lịch sử, nguồn để tính lại |
| Job rebuild + đối soát | Lưới an toàn, phát hiện lệch sau khi đã xảy ra |

*Phiên bản trước của tài liệu mô tả snapshot chỉ là "cache đọc nhanh" — sai. Snapshot chính là nơi chống xuất âm.*

### Thuật toán chống xuất âm — ĐÃ CHỐT

Không dùng `SELECT ... FOR UPDATE`. Bốn bước trong **một** transaction:

```sql
BEGIN;

-- BƯỚC 1: chống trùng. Bảng KHÔNG partition nên unique dùng được.
INSERT INTO movement_dedup_keys
       (tenant_id, ref_type, ref_id, movement_type, movement_id, movement_created_at)
VALUES (:tenantId, :refType, :refId, :movementType, :newId, :now);
-- unique_violation  →  ROLLBACK, movement đã tồn tại, trả 200 với kết quả cũ
--                      (đây là retry, không phải lỗi)

-- BƯỚC 2: chống xuất âm. Conditional UPDATE tự nó đã nguyên tử.
UPDATE stock_balances
   SET available = available - :quantity,
       on_hand   = on_hand   - :quantity,
       version   = version + 1,
       last_movement_at = :now
 WHERE tenant_id    = :tenantId
   AND warehouse_id = :warehouseId
   AND product_id   = :productId
   AND lot_id       = :lotId
   AND available   >= :quantity;        -- ← điều kiện then chốt

-- affected rows = 0  →  ROLLBACK, trả 409 STOCK.INSUFFICIENT
-- Không phân biệt được "không đủ tồn" và "bị giao dịch đồng thời chen vào",
-- và KHÔNG CẦN phân biệt: cả hai đều là "không thực hiện được, thử lại".

-- BƯỚC 3: ghi lịch sử
INSERT INTO movements (id, created_at, ...) VALUES (:newId, :now, ...);

-- BƯỚC 4: nếu event có tác dụng phụ ngoài DB
INSERT INTO outbox_events (...);        -- §4.8

COMMIT;
```

**Vì sao cần bảng `movement_dedup_keys` riêng:** PostgreSQL đòi unique constraint trên bảng partition **phải chứa khoá phân vùng**. `UNIQUE (tenant_id, ref_type, ref_id, movement_type)` không chứa `created_at` nên **không tạo được** trên `movements`. Thêm `created_at` vào unique thì vô nghĩa — cùng một chứng từ ở hai thời điểm vẫn tạo trùng được. Nên tính duy nhất phải nằm ở một bảng không partition.

**Ba lưu ý về bảng dedup:**

| | |
|---|---|
| Tốc độ tăng trưởng | Bằng `movements` về số dòng, nhưng mỗi dòng chỉ ~80 byte. 100 triệu dòng ≈ 8GB — chấp nhận được |
| Nếu cần phân vùng | `PARTITION BY HASH (tenant_id)` — hợp lệ vì `tenant_id` nằm trong PK |
| **Retention** | **Không được prune trong cửa sổ retry tối đa.** Mặc định giữ vĩnh viễn. Xoá key rồi job retry sau đó = tạo trùng chứng từ |

**Về `reversal_of`:** `movements` có PK `(id, created_at)` nên không tạo được FK từ một cột đơn. Dùng **cặp hai cột** `reversal_of_id` + `reversal_of_created_at` để có FK thật ở tầng DB. Phương án chỉ giữ một cột rồi kiểm tra ở service cũng chạy, nhưng mất ràng buộc toàn vẹn — không chọn.

**Lưu ý:** cả BƯỚC 1 và BƯỚC 2 thường viết bằng raw SQL nên **không đi qua query extension** — xem quy định audit ở §4.9.

### Ba loại theo dõi hàng — ĐÃ CHỐT

`products.tracking_type` ∈ `NONE | LOT | SERIAL`. **Cả ba dùng chung một cơ chế kiểm soát đồng thời.**

| | `NONE` | `LOT` | `SERIAL` |
|---|---|---|---|
| Dòng trong `stock_balances` | 1 dòng/(kho, hàng), `lot_id` = **sentinel** | 1 dòng/(kho, hàng, lô) | 1 dòng/(kho, hàng, lô) — vẫn theo lô |
| `inventory_serials` | không dùng | không dùng | 1 dòng/serial |
| Chống xuất âm | conditional UPDATE | conditional UPDATE | conditional UPDATE **+** đổi `status` serial, **cùng transaction** |

**Luật quan trọng nhất: `stock_balances` là nguồn sự thật về số lượng cho cả ba loại.** `inventory_serials` là **chi tiết**, không phải nguồn tồn.

*Lý do:* nếu để bảng serial tự quản tồn thì bạn có hai nguồn sự thật, và mất toàn bộ cơ chế chống xuất âm đã dựng ở trên. Job đối soát kiểm thêm:

```sql
COUNT(inventory_serials WHERE status='IN_STOCK') == stock_balances.on_hand
```

**Sentinel cho `tracking_type = NONE`:** `lot_id = '00000000-0000-0000-0000-000000000000'`. PostgreSQL không cho NULL trong PRIMARY KEY, và dùng NULL sẽ buộc hot path phải viết `lot_id IS NOT DISTINCT FROM :lotId` — mất hiệu quả index ở đúng câu query quan trọng nhất hệ thống. Đánh đổi: không đặt được FK `lot_id → lots`, service tự kiểm.

**Với SERIAL:** liên kết movement ↔ serial qua bảng nối `movement_serials(movement_id, movement_created_at, serial_id)` nếu cần truy vết từng serial theo chứng từ. [OPT], chỉ làm khi nghiệp vụ yêu cầu.

### Sáu câu hỏi phải chốt trước khi code module kho

| Câu hỏi | Ghi vào ADR |
|---|---|
| Cho phép tồn âm không? Nếu có thì theo kho hay theo mặt hàng? | |
| Có giữ hàng (reservation) không? | |
| Phân biệt `onHand` / `reserved` / `available` / `inTransit`? | Nếu có reservation thì bắt buộc phân biệt |
| Quy tắc xuất theo FIFO / FEFO / lô / serial nằm ở tầng nào? | |
| Một chứng từ bị retry có tạo movement trùng không? | Chặn bằng bảng `movement_dedup_keys` (xem thuật toán trên) |
| Đơn vị lưu tồn là đơn vị cơ sở? | Xem §5B.2/B2 |

### B5. Kỳ kế toán & khoá sổ — [OPT]

Chặn tạo/sửa/xoá chứng từ có ngày trước mốc khoá. Cơ chế mở lại kỳ có phân quyền riêng và ghi audit. Xử lý điều chỉnh sau khoá bằng chứng từ điều chỉnh, không sửa chứng từ cũ.

### B6. Tuổi nợ (aging) — [OPT]

Phân tích công nợ theo khoảng ngày (0–30, 31–60, 61–90, >90). Xuất hiện ở mọi ứng dụng có bán hàng hoặc mua hàng.

---

## 5B.3 Nhóm C — Bảng lớn & khả năng mở rộng

Hai hạng mục đầu đã được **nâng lên CORE** vì hệ thống có multi-tenant + movement pattern, tức là sẽ chạm bảng hàng chục triệu dòng ngay trong năm đầu.

### C1. Export streaming — [CORE], làm ngay

Tầng export **bắt buộc** viết theo streaming từ đầu: lặp theo cursor, ghi trực tiếp vào stream lên S3, không giữ mảng kết quả trong bộ nhớ.

*Chi phí làm ngay: khoảng nửa ngày. Chi phí chuyển đổi sau: viết lại toàn bộ tầng export.*

### C2. Partition — [CORE], chốt thiết kế ngay, code sau

**ĐÃ CHỐT:** `movements` và `audit_logs` phân vùng `RANGE (created_at)`, mảnh theo **tháng**, cron tự tạo mảnh mới trước 1 tháng.

**Ràng buộc không thể sửa sau:** PostgreSQL yêu cầu khoá phân vùng nằm trong primary key, nên hai bảng này có

```sql
PRIMARY KEY (id, created_at)
```

Đây là lý do phải chốt ngay bây giờ. Bật partition khi bảng đã có 50 triệu dòng đòi migration có downtime; quyết định trước thì chỉ là một dòng DDL.

Kèm theo: job archive chuyển mảnh cũ sang bảng lịch sử hoặc detach + lưu trữ ngoài.

### C3–C6. Chuẩn bị chi phí gần bằng không — [OPT]

| Hạng mục | Chuẩn bị ngay |
|---|---|
| Đối soát hệ thống ngoài | `externalId` + `source` đã đưa vào base entity ở §4.5 |
| API/view cho BI | Không làm gì. **Nhưng ghi vào ADR:** hệ thống có phân quyền cấp trường, nên BI **tuyệt đối không** truy cập bảng thô — khi cần thì tạo view đã lọc cột. Quên điều này thì cột lương ẩn kỹ ở API sẽ hiện nguyên vẹn trong Power BI |
| Chữ ký số (ký PDF, USB token) | Tách tầng sinh PDF khỏi tầng ký, đừng gộp vào một hàm |
| In tem/mã vạch, quét QR qua camera | Không làm gì. Chỉ đảm bảo mã định danh in được và quét được (không dùng UUID trần trên tem) |

---

## 5B.4 Nhóm D — Cố ý loại trừ

Bốn hạng mục dưới đây nghe hấp dẫn nhưng chi phí thực tế rất cao so với giá trị. **Không đưa vào boilerplate**; chỉ triển khai khi có yêu cầu cụ thể và được tính vào phạm vi dự án.

| Hạng mục | Lý do loại trừ |
|---|---|
| **Rule engine cấu hình được** | Kết cục là tự tạo một ngôn ngữ lập trình kém. Viết điều kiện bằng TypeScript, deploy nhanh hơn cấu hình |
| **Workflow designer kéo-thả (BPMN)** | Tốn hàng tháng, thực tế khách chỉ dùng 2–3 luồng tuyến tính. Dùng cấu hình bước duyệt đơn giản ở §6 |
| **Report designer cho người dùng cuối** | Người dùng sẽ tạo truy vấn làm nghẽn cơ sở dữ liệu. Thay bằng: lập trình viên khai báo report qua A1 (chỉ mất 2 giờ) |
| **Đồng bộ offline hai chiều** | Xử lý xung đột là bài toán tự thân, đắt hơn phần còn lại của dự án. Chỉ làm khi ứng dụng thực sự hoạt động ngoài vùng phủ mạng |

---

## 5B.5 Ưu tiên bổ sung vào lộ trình

Nếu chỉ chọn ba hạng mục để thêm vào lộ trình §10:

| Thứ tự | Hạng mục | Lý do |
|---|---|---|
| 1 | **A1 — Report framework** | Tiết kiệm thời gian nhiều nhất trên toàn bộ chu kỳ dự án |
| 2 | **A2 — Delete guard** | Người dùng cảm nhận rõ nhất về mức độ cẩn thận của sản phẩm |
| 3 | **B1 — Bộ tính tiền/thuế/làm tròn** | Tránh loại tranh chấp khó chịu và khó khắc phục nhất |

Chèn vào lộ trình: A2 và B1 làm cùng giai đoạn 5 (module nghiệp vụ mẫu); A1 làm giai đoạn 6.5, sau export và trước Action Registry.

---

# 5C. CHỨC NĂNG QUẢN TRỊ HỆ THỐNG DÙNG CHUNG

> Nhóm chức năng này không thuộc nghiệp vụ cụ thể nào nhưng xuất hiện ở mọi dự án. Trước đây bị rải rác trong các chương khác hoặc thiếu hẳn.

## 5C.1 Quản trị tenant — [CORE]

Multi-tenant đã là CORE (§4.4b) nhưng nếu chỉ có cách ly dữ liệu mà không có lớp quản trị này thì **chưa thành sản phẩm multi-tenant**.

**Màn hình sysadmin:**
- Danh sách tenant + tạo tenant (kèm seed dữ liệu khởi tạo)
- Kích hoạt / tạm khoá / đình chỉ (`suspendedAt`)
- Quản lý domain và subdomain
- Branding: logo, tên hệ thống, màu chủ đạo
- Quota: số người dùng tối đa, dung lượng file, số bản ghi
- Bật/tắt tính năng theo tenant (`tenant_features`)
- Chỉ định tenant admin
- Theo dõi dung lượng và mức sử dụng
- Cấu hình mặc định: locale, timezone, `dataRetentionDays`

**Màn hình người dùng:** bộ chọn tenant khi có nhiều membership; đổi tenant **cấp lại token** (§4.4b).

## 5C.2 User preferences & cá nhân hoá — [CORE nhẹ]

DataTable đã yêu cầu lưu cấu hình cột theo user và saved views, nhưng cần một module chung thay vì rải rác.

```
user_preferences   locale, timezone, density, pageSize, defaultOrgUnit, theme
saved_views        entity, name, filters, sort, columns, columnOrder,
                   columnWidths, density, pageSize, isDefault, isShared
recent_items       entity, entityId, viewedAt
favorite_items     entity, entityId, label
```

`saved_views.isShared` cho phép chia sẻ view trong đơn vị — tính năng người dùng quản trị đánh giá cao.

## 5C.3 Bulk operation framework — [CORE]

FE đã có chọn hàng loạt (§5.5) nhưng thiếu contract phía BE.

**Tập nhỏ — đồng bộ:**

```json
{
  "total": 100, "succeeded": 92, "failed": 8,
  "results": [
    { "id": "...", "success": false,
      "code": "ORDER.ALREADY_APPROVED", "message": "Đơn đã được duyệt" }
  ]
}
```

**Tập lớn — bất đồng bộ:**

```
POST /orders/bulk-approve  → { jobId }
GET  /jobs/:id             → tiến độ
GET  /jobs/:id/errors.xlsx → file lỗi (che field theo quyền)
```

Yêu cầu: dry-run/preview, partial success, lỗi theo từng dòng, chạy qua queue, retry an toàn, có `Idempotency-Key`. HTTP `200` kể cả khi có dòng thất bại — thất bại từng dòng không phải lỗi của request.

## 5C.4 Business calendar — [CORE nhẹ] · SLA engine — [OPT]

**Tách làm hai mức, cố ý.**

**Business calendar là CORE-nhẹ** vì "ngày làm việc" dùng ở khắp nơi: hạn thanh toán, hạn xử lý, tính tuổi nợ, ngày giao hàng.

```
business_calendars        tenant_id, name, timezone, is_default
calendar_working_hours    calendar_id, day_of_week, from_time, to_time
calendar_holidays         calendar_id, date, name, is_recurring
```

Kèm hàm dùng chung: `addWorkingDays()`, `isWorkingDay()`, `workingMinutesBetween()`. Hỗ trợ lịch âm và ngày lễ Việt Nam qua `packages/vn`.

**SLA engine là OPT.** Đầy đủ `sla_policies` + `sla_instances` + `sla_pauses` là một cỗ máy riêng, cùng họ rủi ro với workflow designer ở §5B.4. Chỉ triển khai khi có yêu cầu cụ thể được tính vào phạm vi dự án.

Nếu triển khai, phải chốt trước: cuối tuần và ngày lễ có tính không; SLA 24/7 hay giờ hành chính; đổi người xử lý có reset không; chờ khách hàng có dừng đồng hồ không.

## 5C.5 Webhook framework — [OPT, ưu tiên cao]

Tách riêng khỏi integration adapter (§5B.1/A5) vì yêu cầu khác hẳn.

**Outgoing:** đăng ký endpoint, chọn loại sự kiện, ký HMAC, **secret rotation** (hai secret cùng hiệu lực trong thời gian chuyển tiếp), retry với exponential backoff, replay thủ công, **tự tắt endpoint sau N lần lỗi liên tiếp**, delivery log đầy đủ.

**Incoming:** verify chữ ký, **chống replay** (timestamp + nonce, từ chối request cũ hơn 5 phút), idempotency theo event id của bên gửi.

Phát webhook **bắt buộc qua outbox** (§4.8).

## 5C.6 Bình luận, mention, theo dõi — [OPT]

Mô hình dùng chung cho mọi entity:

```
comments              tenant_id, entity, entity_id, parent_id, body,
                      is_internal, author_id, :TenantAuditedBase
mentions              tenant_id, comment_id, user_id, notified_at
entity_subscriptions  tenant_id, entity, entity_id, user_id, reason
```

`is_internal` phân biệt bình luận nội bộ và bình luận khách hàng thấy được — cần thiết ngay khi có cổng khách hàng. Sửa/xoá comment phải ghi audit.

## 5C.7 Tìm kiếm toàn cục, gần đây, yêu thích — [OPT, ưu tiên cao]

Cmd+K ở §5.9 hiện chỉ render action. Global search là phần khác:

- Tìm theo mã, tên, số điện thoại, mã chứng từ; kết quả nhóm theo module
- **Áp đúng row-level và field-level permission** — kể cả trong chỉ mục tìm kiếm
- **Không index field mà user không được xem.** Nếu dùng Meilisearch/Elastic, phải có chiến lược lọc theo quyền ở tầng truy vấn, không lọc sau khi trả kết quả (nếu lọc sau thì phân trang sai — cùng lý do như §4.4)
- Bản ghi vừa xem, bản ghi yêu thích (§5C.2)

## 5C.8 Vận hành trong ứng dụng — [CORE nhẹ]

Khu vực dành riêng cho sysadmin. **Không** nhằm thay thế Grafana/Sentry, chỉ gồm thao tác vận hành thiết yếu:

- Health DB / Redis / S3; phiên bản build; migration version hiện tại
- Xem và **retry dead-letter job**; xem queue đang tắc
- Bật/tắt maintenance mode; gửi thông báo toàn hệ thống
- Bật/tắt feature flag theo tenant
- Clear cache theo tenant
- Tạm khoá tích hợp đang lỗi
- Trạng thái backup gần nhất

## 5C.9 Data retention — [CORE về thiết kế]

Tuân thủ NĐ 13/2023 và yêu cầu của khách doanh nghiệp:

- Retention policy theo loại dữ liệu, cấu hình theo tenant (`tenants.dataRetentionDays`)
- Ba mức xử lý: **archive** (chuyển bảng lịch sử) → **anonymize** (giữ số liệu, xoá PII) → **hard delete**
- **Legal hold:** đánh dấu dữ liệu không được xoá dù hết hạn retention
- Xuất dữ liệu cá nhân theo yêu cầu
- Xoá tenant: đặc tả rõ xoá mềm bao lâu trước khi xoá cứng

## 5C.10 Quản trị danh mục — [CORE nhẹ]

Ngoài CRUD ở §5B.1/A10, danh mục cần:

- **Hiệu lực từ – đến** (`effectiveFrom` / `effectiveTo`) thay vì chỉ bật/tắt
- **Khoá mã đã phát sinh chứng từ** — không cho sửa mã, chỉ cho sửa tên
- **Thay thế danh mục**: gộp/chuyển toàn bộ tham chiếu sang mã khác (khác với gộp bản ghi trùng ở §5B.1/A8)
- Quan hệ cha–con nhiều cấp + kiểm tra vòng lặp

## 5C.11 Report scheduling — [OPT]

Mở rộng report framework (§5B.1/A1): lưu tham số thành báo cáo cá nhân, chạy định kỳ theo cron, gửi email kèm file, lưu snapshot kết quả để so sánh giữa các kỳ.

---

## 5C.12 Hạn mức duyệt — [OPT, đi kèm approval]

**Tách bảng riêng, tuyệt đối không đặt trên `tenant_memberships`.** Membership chỉ trả lời: người này thuộc tenant nào, đơn vị nào, trạng thái gì. Hạn mức là **quy tắc nghiệp vụ**, thay đổi theo loại chứng từ, theo thời kỳ, theo tiền tệ.

### Hai câu hỏi khác nhau, hai cơ chế khác nhau

| Câu hỏi | Trả lời bởi |
|---|---|
| **AI** phải duyệt chứng từ này? | `approval_flows` + `approval_steps` |
| Người đó có **ĐỦ HẠN MỨC** để duyệt không? | `approval_authorities` |

Lẫn hai câu này vào nhau là lỗi thiết kế phổ biến, và hậu quả là mỗi lần đổi hạn mức phải sửa luồng duyệt.

Ví dụ cấu hình:

```
Trưởng phòng mua hàng   PO        0 → 100.000.000
Giám đốc                PO        100.000.000 → 1.000.000.000
CFO                     PAYMENT   500.000.000 → không giới hạn
```

### Quy tắc phân giải — phải chốt, nếu không sẽ mơ hồ

Nhiều dòng có thể cùng khớp một chứng từ. Thứ tự áp dụng:

1. Lọc theo `document_type` + `currency` + `effective_from/to` bao trùm ngày chứng từ
2. Lọc theo đối tượng khớp: `membership_id` = tôi, **hoặc** `role_id` ∈ vai trò của tôi, **hoặc** `org_unit_id` là đơn vị của tôi
3. **Cụ thể thắng chung:** `membership_id` > `role_id` > `org_unit_id`
4. Cùng mức cụ thể thì `priority` cao hơn thắng
5. Vẫn hoà → lấy `max_amount` **lớn nhất**, và **ghi cảnh báo** cấu hình mơ hồ

**Hai luật cứng:**

- **Không khớp dòng nào → KHÔNG được duyệt** (`ORDER.NO_APPROVAL_AUTHORITY`). Fail-closed. Không bao giờ mặc định "không có hạn mức nghĩa là không giới hạn"
- **Đa tiền tệ:** hạn mức khai theo `currency` cụ thể. Chứng từ khác tiền tệ → quy đổi theo tỷ giá **tại ngày chứng từ**, không phải tỷ giá hiện tại. Ghi tỷ giá đã dùng vào `approval_actions`

### Kiểm tra cấu hình

Cần một màn hình/endpoint "kiểm tra hạn mức": nhập loại chứng từ + số tiền + ngày → trả về danh sách người đủ thẩm quyền. Không có nó thì cấu hình sai chỉ lộ ra khi chứng từ bị kẹt không ai duyệt được.

**Lưu ý cho `action-registry.tsx`:** ví dụ trong file đó dùng `me.approvalLimit` — đó là bản rút gọn để minh hoạ. Triển khai thật phải resolve từ `approval_authorities` theo quy tắc trên, và nên tính sẵn ở BE rồi trả kèm trong response chi tiết chứng từ (`canApprove`, `approvalLimitReason`) để FE không phải tự suy luận.

---

# 6. MÔ HÌNH DỮ LIỆU NỀN TẢNG

## 6.1 Lược đồ

```sql
-- ===== [CORE] Multi-tenant =====
tenants(code UNIQUE, name, status, default_locale, default_timezone,
        data_retention_days, suspended_at, :GlobalAuditedBase +SoftDelete)
tenant_domains(tenant_id, domain UNIQUE, is_primary, :GlobalAuditedBase)
tenant_memberships(user_id, org_unit_id, status,
                   joined_at, invited_by_id, :TenantAuditedBase)
  PRIMARY KEY (id)                    -- khớp với membershipId trong token (§4.3)
  UNIQUE (tenant_id, user_id)
tenant_features(feature_key, enabled, quota jsonb, :TenantAuditedBase)
  UNIQUE (tenant_id, feature_key)     -- thiếu unique = 2 config cho cùng feature

-- ===== Người dùng & phân quyền =====
users(email UNIQUE, password_hash, full_name, status,
      last_login_at, :GlobalAuditedBase +SoftDelete)   -- GLOBAL: không có tenant_id
org_units(parent_id, path ltree, code, name, :BusinessEntityBase)
roles(code, name, is_system, :TenantAuditedBase +SoftDelete)
permissions(id, code, resource, action, description)  -- GLOBAL, sync từ code
role_permissions(role_id, permission_id, scope, :TenantAuditedBase)
  UNIQUE (tenant_id, role_id, permission_id)
user_roles(user_id, role_id, :TenantAuditedBase)
  UNIQUE (tenant_id, user_id, role_id)
sessions(user_id, device, ip, user_agent, expires_at, :TenantAuditedBase)
invitations(email, role_ids uuid[], token_hash, expires_at,
            accepted_at, invited_by_id, :TenantAuditedBase)
password_reset_tokens(user_id, token_hash UNIQUE, expires_at,
                      used_at, requested_ip, :GlobalAuditedBase)
  INDEX (user_id, used_at)

-- ===== Hạ tầng =====
audit_logs(id, created_at, tenant_id, entity, entity_id, action,
           actor_id, actor_name, on_behalf_of_id,
           before jsonb, after jsonb, ip, user_agent, trace_id)
  PARTITION BY RANGE (created_at)      -- PRIMARY KEY (id, created_at)
  INDEX (tenant_id, entity, entity_id, created_at DESC)

files(bucket, object_key, filename, mime, size, checksum,
      uploaded_by, :TenantAuditedBase +SoftDelete)
attachments(file_id, entity, entity_id, category, :TenantAuditedBase)

notifications(user_id, type, title, body, data jsonb, read_at,
              :TenantAuditedBase)
  INDEX (tenant_id, user_id, read_at, created_at DESC)
notification_preferences(user_id, type, channels text[], :TenantAuditedBase)
  UNIQUE (tenant_id, user_id, type)

settings(tenant_id NULL, key, value jsonb, :GlobalAuditedBase)   -- HYBRID
  -- tenant_id IS NULL = mặc định toàn hệ thống; có giá trị = override cho tenant
  -- NULL không so sánh bằng nhau trong UNIQUE → phải dùng HAI partial index:
  UNIQUE (key)             WHERE tenant_id IS NULL
  UNIQUE (tenant_id, key)  WHERE tenant_id IS NOT NULL

document_sequences(tenant_id, key, year, current_value)
  PRIMARY KEY (tenant_id, key, year)

-- ===== [CORE] Tính nhất quán =====
idempotency_requests(key, operation, request_hash, status,
                     response_status, response_body jsonb,
                     resource_type, resource_id, expires_at, :TenantAuditedBase)
  UNIQUE (tenant_id, key)

outbox_events(event_type, aggregate_type, aggregate_id, payload jsonb,
              status, attempts, available_at, processed_at,
              locked_at, locked_by,              -- claim protocol, §4.8
              :TenantAuditedBase)
  INDEX (status, available_at) WHERE status IN ('PENDING','PROCESSING')

-- ===== [CORE nhẹ] Cá nhân hoá =====
user_preferences(user_id, key, value jsonb, :TenantAuditedBase)
  UNIQUE (tenant_id, user_id, key)
saved_views(user_id, entity, name, config jsonb,
            is_default, is_shared, :TenantAuditedBase)   -- xoá cứng, không soft delete
recent_items(user_id, entity, entity_id, viewed_at, :TenantAuditedBase)
favorite_items(user_id, entity, entity_id, label, :TenantAuditedBase)

-- ===== [CORE nhẹ] Lịch làm việc =====
business_calendars(name, timezone, is_default, :TenantAuditedBase)
calendar_working_hours(calendar_id, day_of_week, from_time, to_time,
                       :TenantAuditedBase)
calendar_holidays(calendar_id, date, name, is_recurring, :TenantAuditedBase)

-- ===== [CORE nhẹ] Vận hành =====
feature_flags(tenant_id NULL, key, enabled, rollout_percent, :GlobalAuditedBase)
  UNIQUE (key)             WHERE tenant_id IS NULL     -- cùng lý do như settings
  UNIQUE (tenant_id, key)  WHERE tenant_id IS NOT NULL
system_announcements(title, body, severity, starts_at, ends_at,
                     target_tenant_ids uuid[], :GlobalAuditedBase)
maintenance_windows(starts_at, ends_at, message, allow_roles text[],
                    :GlobalAuditedBase)

-- ===== [CORE] Số dư: movement + snapshot (§5B.2/B4) =====
movements(
  id uuid, created_at timestamptz,          -- PRIMARY KEY (id, created_at)
  tenant_id uuid NOT NULL,
  account_type text,          -- 'STOCK' | 'RECEIVABLE' | 'CASH'
  account_key  text,          -- warehouse_id + product_id + lot_id
  movement_type text,
  direction smallint,         -- +1 / -1
  quantity numeric, amount numeric, currency text,
  ref_type text, ref_id uuid,
  reversal_of_id uuid NULL,           -- ↓ cặp 2 cột, xem ghi chú FK
  reversal_of_created_at timestamptz NULL,
  created_by_id uuid
) PARTITION BY RANGE (created_at);
  -- APPEND-ONLY: không UPDATE, không DELETE
  -- KHÔNG đặt UNIQUE ở đây: Postgres đòi unique trên bảng partition phải
  -- chứa khoá partition. Chống trùng dùng bảng movement_dedup_keys ↓
  INDEX (tenant_id, account_type, account_key, created_at)

movement_dedup_keys(              -- KHÔNG partition
  tenant_id, ref_type, ref_id, movement_type,
  movement_id uuid, movement_created_at timestamptz,
  created_at timestamptz
)
  PRIMARY KEY (tenant_id, ref_type, ref_id, movement_type)
  -- Đây là nơi thực thi tính duy nhất của movement. Insert TRƯỚC movement.
  -- KHÔNG BAO GIỜ prune trong phạm vi cửa sổ retry tối đa (xem §5B.2/B4)

warehouses(code, name jsonb, org_unit_id, :BusinessEntityBase)
lots(product_id, lot_no, mfg_date, expiry_date, :BusinessEntityBase)
  UNIQUE (tenant_id, product_id, lot_no)

stock_balances(tenant_id, warehouse_id, product_id, lot_id,
               on_hand numeric, reserved numeric, available numeric,
               in_transit numeric, version int, last_movement_at, updated_at)
  PRIMARY KEY (tenant_id, warehouse_id, product_id, lot_id)
  -- lot_id NOT NULL. Hàng tracking_type = NONE dùng SENTINEL
  --   '00000000-0000-0000-0000-000000000000'
  --   Lý do: PK của Postgres không nhận NULL; sentinel giữ cho câu
  --   conditional UPDATE là `lot_id = :lotId` (index hoàn hảo).
  --   Đánh đổi: KHÔNG đặt FK lot_id → lots, service tự kiểm.
  -- Đây là ĐIỂM KIỂM SOÁT ĐỒNG THỜI cho CẢ BA loại tracking

inventory_serials(serial_no, product_id, warehouse_id, lot_id,
                  status, ref_type, ref_id, :BusinessEntityBase)
  UNIQUE (tenant_id, product_id, serial_no)
  INDEX (tenant_id, warehouse_id, product_id, status)
  -- status: IN_STOCK | RESERVED | ISSUED | RETURNED | SCRAPPED
  -- CHI TIẾT, không phải nguồn tồn kho. Xem §5B.2/B4

reconciliation_logs(account_type, account_key, expected numeric,
                    actual numeric, diff numeric, checked_at,
                    :TenantAuditedBase)

-- ===== [OPT] Cộng tác =====
comments(entity, entity_id, parent_id, body,
         is_internal, author_id, :TenantAuditedBase +SoftDelete)
mentions(comment_id, user_id, notified_at, :TenantAuditedBase)
entity_subscriptions(entity, entity_id, user_id, reason, :TenantAuditedBase)
  UNIQUE (tenant_id, entity, entity_id, user_id)

-- ===== [OPT] Tích hợp =====
integration_credentials(provider, config jsonb, is_sandbox,
                        key_version, rotated_at, last_used_at,
                        :TenantAuditedBase)              -- config MÃ HOÁ, §4.11
integration_logs(provider, action, request jsonb, response jsonb,
                 status, duration_ms, trace_id, :TenantAuditedBase)
webhook_endpoints(url, secret, secret_previous, secret_rotated_at,
                  status, failure_count, disabled_at,
                  :TenantAuditedBase)                    -- secret MÃ HOÁ, §4.11
webhook_subscriptions(endpoint_id, event_type, :TenantAuditedBase)
  UNIQUE (tenant_id, endpoint_id, event_type)
webhook_deliveries(endpoint_id, event_id, payload jsonb,
                   response_status, attempts, next_retry_at,
                   :TenantAuditedBase)
  UNIQUE (tenant_id, endpoint_id, event_id)              -- chống gửi trùng

-- ===== [OPT] Quy trình duyệt =====
approval_flows(entity, name, condition jsonb, is_active, :TenantAuditedBase)
approval_steps(flow_id, step_order, approver_type, approver_ref,
               is_required, :TenantAuditedBase)
approval_requests(entity, entity_id, flow_id, status, current_step,
                  :TenantAuditedBase)
approval_actions(request_id, step_order, actor_id, decision, reason,
                 :TenantAuditedBase)
delegations(from_membership_id, to_membership_id, from_date, to_date, scope,
            :TenantAuditedBase)

approval_authorities(document_type, currency,
                     membership_id NULL, role_id NULL, org_unit_id NULL,
                     min_amount numeric, max_amount numeric NULL,
                     effective_from date, effective_to date NULL,
                     priority int, :TenantAuditedBase)
  CHECK (num_nonnulls(membership_id, role_id, org_unit_id) >= 1)
  INDEX (tenant_id, document_type, effective_from, effective_to)
  -- max_amount NULL = không giới hạn
  -- Hạn mức duyệt KHÔNG nằm trên tenant_memberships. Xem §5C.12

-- ===== [OPT] Import & báo cáo =====
import_jobs(entity, file_id, status, template_version, mode,
            total_rows, valid_rows, error_rows, last_processed_row,
            mapping jsonb, :TenantAuditedBase)
import_rows(job_id, row_number, raw jsonb, errors jsonb, status,
            :TenantAuditedBase)
saved_reports(report_id, user_id, name, params jsonb, is_shared,
              :TenantAuditedBase)
report_schedules(saved_report_id, cron, recipients text[], is_active,
                 :TenantAuditedBase)
report_runs(saved_report_id, status, file_id, started_at, finished_at,
            :TenantAuditedBase)

-- ===== [REF] Module nghiệp vụ mẫu =====
orders(code, customer_id, status, total, currency,
       approved_at, approved_by, :BusinessEntityBase)
order_items(order_id, product_id, product_name_snapshot,
            quantity, uom, uom_factor_snapshot,
            unit_price, amount, line_no, :TenantAuditedBase)
  -- CHILD của aggregate Order, KHÔNG phải BusinessEntityBase:
  --   không org_unit_id / version / external_id / soft delete riêng
  --   optimistic locking dùng orders.version
  --   xoá cứng trong transaction sửa Order
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id)
customers(code, name jsonb, tax_code, :BusinessEntityBase)  -- name đa ngôn ngữ (§3.10)
products(code, name jsonb, base_uom, tracking_type, :BusinessEntityBase)
  -- tracking_type: NONE | LOT | SERIAL
```

## 6.2 Ba tầng base entity — ĐÃ CHỐT

Phiên bản trước dùng một `...base` duy nhất chứa cả `tenant_id` và `org_unit_id`, nên khi áp vào `tenant_memberships` (vốn đã khai báo hai cột đó) thì **trùng cột nếu đọc theo nghĩa đen**. Tách làm ba tầng:

```
GlobalAuditedBase
  id, created_at, updated_at, created_by_id, updated_by_id

TenantAuditedBase  =  GlobalAuditedBase
  + tenant_id

BusinessEntityBase =  TenantAuditedBase
  + org_unit_id      -- nullable: một số entity không gắn đơn vị
  + version          -- optimistic locking
  + external_id, source
  + SoftDeleteFields

SoftDeleteFields   -- capability độc lập, ghép được vào BẤT KỲ tầng nào
  deleted_at
```

**Luật tuyệt đối: cột đã nằm trong base thì KHÔNG BAO GIỜ khai lại trong schema.** Ký hiệu `:TenantAuditedBase` trong §6.1 nghĩa là mọi cột của tầng đó đã có mặt. `+SoftDelete` nghĩa là ghép thêm `deleted_at`.

| Tầng | Dùng cho |
|---|---|
| `GlobalAuditedBase` | `permissions`, `password_reset_tokens`, `system_announcements`, `maintenance_windows`, `tenant_domains` |
| `GlobalAuditedBase +SoftDelete` | `users`, `tenants` |
| `TenantAuditedBase` | `tenant_memberships`, `user_roles`, `role_permissions`, `sessions`, `settings`, `notifications`, `saved_views`, `import_rows`, `outbox_events`, `webhook_*`, `approval_*` |
| `TenantAuditedBase +SoftDelete` | `roles`, `files`, `comments` |
| `BusinessEntityBase` | `org_units`, `orders`, `customers`, `products` và mọi bảng nghiệp vụ (đã bao gồm soft delete) |

**Ba quyết định về soft delete:**

- **`tenant_memberships` dùng `status`** (`ACTIVE` / `SUSPENDED` / `LEFT`), không soft delete. Soft delete ở đây sinh câu hỏi "đã xoá rồi mời lại thì hồi sinh dòng cũ hay tạo dòng mới" — dùng `status` thì câu hỏi đó không tồn tại
- **`users` và `tenants` có cả `status` lẫn `deleted_at`**, hai việc khác nhau: `status` là vô hiệu hoá tạm thời, `deleted_at` là xoá thật (kích hoạt luồng ẩn danh hoá ở §5C.9)
- **`saved_views`, `user_preferences`, `recent_items`, `favorite_items` xoá cứng.** Đây là dữ liệu tiện ích của người dùng, giữ lại không có giá trị

**PK của `tenant_memberships`:** `PRIMARY KEY (id)` + `UNIQUE (tenant_id, user_id)`. Dùng `id` làm PK để khớp với `membershipId` trong access token (§4.3) — token trỏ tới một khoá đơn, không phải khoá ghép.

Generator (`pnpm gen:module`) nhận tham số chọn tầng base và cờ soft delete, sinh migration và DTO tương ứng.

## 6.3 Quy ước index

- Mọi FK có index; mọi trường trong sort whitelist có index
- `UNIQUE` trên bảng soft delete phải là **partial** và **composite với `tenant_id`**:
  `UNIQUE (tenant_id, code) WHERE deleted_at IS NULL`
- `UNIQUE (tenant_id, source, external_id) WHERE external_id IS NOT NULL`
- Trường JSONB đa ngôn ngữ: expression index cho từng locale (§3.10)
- `movements` và `audit_logs`: `PRIMARY KEY (id, created_at)` — bắt buộc do partition
- **Không đặt `UNIQUE` trên bảng partition** nếu unique không chứa khoá phân vùng — xem `movement_dedup_keys` (§5B.2/B4)

## 6.4 Luật `tenant_id` ở bảng TENANT và bảng con — ĐÃ CHỐT

Phiên bản trước thiếu `tenant_id` ở `role_permissions`, `order_items`, `import_rows`, `mentions`, `approval_steps`, `approval_actions`, `calendar_*`, `webhook_subscriptions` — tức là chính những bảng con mà Prisma extension sẽ **không** chèn được tenant vào, và cũng không báo lỗi.

**Luật: mỗi bảng thuộc đúng một `TENANCY_POLICY` — `GLOBAL`, `HYBRID` hoặc `TENANT`.**

- `HYBRID` **chỉ** gồm các bảng khai báo tường minh trong `TENANCY_POLICY.HYBRID` (hiện đúng hai: `settings`, `feature_flags`). Không mở rộng nhóm này
- **Bảng con của một entity TENANT luôn là TENANT**, không có ngoại lệ

Bảng con **cũng phải có `tenant_id`** dù về logic đã suy ra được từ bảng cha. Lý do:

1. Extension chèn tenant hoạt động thống nhất, không cần biết bảng nào là con của bảng nào
2. Filter và đối soát trực tiếp trên bảng con được, không phải join lên cha
3. Phòng vệ nhiều lớp: nếu logic ứng dụng sai, DB vẫn không cho lẫn tenant

*Loại thứ ba ("bảng con thừa hưởng tenant từ cha") chính là nơi lỗi trú ẩn, vì nó tạo ra một danh sách ngoại lệ mà không ai nhớ hết.*

### Nested write — ĐÃ CHỐT (điểm chặn của GĐ1)

**Prisma query extension không có hook riêng cho nested operation.** Extension sửa được `args` của query **top-level**, nhưng một `create` lồng bên trong `orders.create({ data: { items: { create: [...] } } })` không tự đi qua một hook độc lập. Vì vậy câu "extension phải chèn `tenant_id` trong nested create" là chưa đủ — phải nói bằng cách nào.

> Kiểm chứng lại hành vi này trên đúng phiên bản Prisma đã pin trước khi code — đây là giới hạn của query extension, có thể thay đổi theo phiên bản.

**Ba lớp, theo thứ tự:**

| Lớp | Phạm vi | Cơ chế |
|---|---|---|
| 1. Extension | Query top-level | Tự inject `tenant_id` vào `where` và `data` |
| 2. **Repository** | **Nested write** | **Chuẩn hoá toàn bộ `args` — duyệt đệ quy cây `data`, chèn `tenant_id` vào mọi `create` / `createMany` lồng nhau — trước khi gọi Prisma** |
| 3. DB | Mọi đường | `tenant_id NOT NULL` + composite FK `(tenant_id, parent_id)` (§6.4) |

Lớp 3 là lưới cuối: kể cả lớp 1 và 2 đều hỏng, DB vẫn từ chối. Đây là lý do composite FK không phải tuỳ chọn.

**Quy tắc kèm theo:** nested update/delete phức tạp **phải tách thành thao tác repository tường minh**. Không nhét một write nghiệp vụ lớn vào một nested mutation duy nhất của Prisma — vừa khó chèn tenant, vừa khiến audit không nhìn thấy từng child mutation (§4.9).

### Chống lệch bằng composite foreign key

`tenant_id` bị nhân bản nên phải có ràng buộc DB làm cho việc lệch trở thành **bất khả thi**, không phải "nhớ đừng làm sai":

```sql
-- Bảng cha cần thêm unique để làm đích cho composite FK
ALTER TABLE orders ADD CONSTRAINT orders_tenant_id_key UNIQUE (tenant_id, id);

-- Bảng con trỏ về bằng CẢ HAI cột
ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_fk
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id);
```

Với ràng buộc này, gắn một `order_item` của tenant A vào `order` của tenant B là **không thể** ở tầng DB.

**Chi phí:** thêm 16 byte/dòng và một unique index trên bảng cha. Đổi lại loại bỏ hẳn một họ lỗi rò rỉ dữ liệu chéo tenant.

### Ngoại lệ

| Bảng | Xử lý |
|---|---|
| `permissions` | `TENANCY_POLICY.GLOBAL` |
| `role_permissions` | **TENANT** (vì `roles` theo tenant), composite FK về `roles(tenant_id, id)`. Cột `permission_id` là FK đơn về bảng global |
| `settings`, `feature_flags` | `tenant_id NULL` = mặc định toàn hệ thống. Extension xử lý riêng hai bảng này: `WHERE tenant_id = :t OR tenant_id IS NULL`, ưu tiên dòng có tenant |
| `movement_dedup_keys` | TENANT, `tenant_id` đã nằm trong PK |

---

## 6.5 Ma trận phạm vi dữ liệu

Bảng này là **nguồn sự thật** về phân loại tenancy. Liệt kê **toàn bộ** bảng, không có ngoại lệ. Thêm bảng mới bắt buộc bổ sung một dòng — và `assertExhaustiveTenancyPolicy()` (§4.4b) sẽ chặn khởi động nếu quên.

Cột **Tenancy** dùng đúng ba giá trị của `TENANCY_POLICY`: `GLOBAL` / `HYBRID` / `TENANT`.

| Bảng | Tenancy | Base | Soft delete | Audit | Partition |
|---|:---:|---|:---:|:---:|:---:|
| **Multi-tenant** |
| `tenants` | GLOBAL | Global | ✓ | trigger | |
| `tenant_domains` | GLOBAL | Global | | ✓ | |
| `tenant_memberships` | TENANT | Tenant | `status` | trigger | |
| `tenant_features` | TENANT | Tenant | | ✓ | |
| **Định danh & phân quyền** |
| `users` | GLOBAL | Global | ✓ | trigger | |
| `password_reset_tokens` | GLOBAL | Global | | ✓ | |
| `permissions` | GLOBAL | Global | | ✓ | |
| `roles` | TENANT | Tenant | ✓ | trigger | |
| `role_permissions` | TENANT | Tenant | | trigger | |
| `user_roles` | TENANT | Tenant | | trigger | |
| `org_units` | TENANT | Business | ✓ | ✓ | |
| `sessions` | TENANT | Tenant | | ✓ | |
| `invitations` | TENANT | Tenant | | ✓ | |
| `invitation_roles` | TENANT | Tenant | | ✓ | |
| **Hạ tầng** |
| `audit_logs` | TENANT | — | | append-only | ✓ |
| `files` | TENANT | Tenant | ✓ | ✓ | |
| `attachments` | TENANT | Tenant | | ✓ | |
| `notifications` | TENANT | Tenant | | | |
| `notification_preferences` | TENANT | Tenant | | | |
| `settings` | **HYBRID** | Global | | trigger | |
| `document_sequences` | TENANT | — | | ✓ | |
| **Nhất quán giao dịch** |
| `idempotency_requests` | TENANT | Tenant | | | |
| `outbox_events` | TENANT | Tenant | | | |
| **Số dư** |
| `movements` | TENANT | — | | append-only | ✓ RANGE |
| `movement_dedup_keys` | TENANT | — | | | HASH nếu cần |
| `stock_balances` | TENANT | — | | ✓ | |
| `warehouses`, `lots` | TENANT | Business | ✓ | ✓ | |
| `inventory_serials` | TENANT | Business | ✓ | ✓ | cân nhắc |
| `approval_authorities` | TENANT | Tenant | ✓ | trigger | |
| `reconciliation_logs` | TENANT | Tenant | | | |
| **Cá nhân hoá** |
| `user_preferences` | TENANT | Tenant | xoá cứng | | |
| `saved_views` | TENANT | Tenant | xoá cứng | | |
| `recent_items` | TENANT | Tenant | xoá cứng | | |
| `favorite_items` | TENANT | Tenant | xoá cứng | | |
| **Lịch làm việc** |
| `business_calendars` | TENANT | Tenant | | ✓ | |
| `calendar_working_hours` | TENANT | Tenant | | ✓ | |
| `calendar_holidays` | TENANT | Tenant | | ✓ | |
| **Vận hành** |
| `feature_flags` | **HYBRID** | Global | | ✓ | |
| `system_announcements` | GLOBAL | Global | | ✓ | |
| `maintenance_windows` | GLOBAL | Global | | ✓ | |
| **Cộng tác** |
| `comments` | TENANT | Tenant | ✓ | ✓ | |
| `mentions` | TENANT | Tenant | | | |
| `entity_subscriptions` | TENANT | Tenant | | | |
| **Tích hợp** |
| `integration_credentials` | TENANT | Tenant | | trigger | |
| `integration_logs` | TENANT | Tenant | | | cân nhắc |
| `webhook_endpoints` | TENANT | Tenant | | trigger | |
| `webhook_subscriptions` | TENANT | Tenant | | ✓ | |
| `webhook_deliveries` | TENANT | Tenant | | | cân nhắc |
| **Quy trình duyệt** |
| `approval_flows` | TENANT | Tenant | ✓ | ✓ | |
| `approval_steps` | TENANT | Tenant | | ✓ | |
| `approval_requests` | TENANT | Tenant | | ✓ | |
| `approval_actions` | TENANT | Tenant | | append-only | |
| `delegations` | TENANT | Tenant | | ✓ | |
| **Import & báo cáo** |
| `import_jobs` | TENANT | Tenant | | ✓ | |
| `import_rows` | TENANT | Tenant | | | cân nhắc |
| `saved_reports` | TENANT | Tenant | ✓ | ✓ | |
| `report_schedules` | TENANT | Tenant | ✓ | ✓ | |
| `report_runs` | TENANT | Tenant | | | |
| **Nghiệp vụ** |
| `orders` (aggregate root) | TENANT | Business | ✓ | ✓ | tuỳ dung lượng |
| `order_items` (child) | TENANT | **Tenant** | **không** | ✓ | |
| `customers`, `products` | TENANT | Business | ✓ | ✓ | |

**Cách đọc:**
- **GLOBAL** → nằm trong `TENANCY_POLICY.GLOBAL`, extension **không** inject tenant
- **HYBRID** → `tenant_id NULL` = mặc định toàn hệ thống; extension dùng `tenant_id = :current OR tenant_id IS NULL`, ưu tiên dòng có tenant. Chỉ có đúng **hai** bảng, không thêm nữa
- **TENANT** → mặc định, bắt buộc inject `tenant_id`
- **Base** → tầng base theo §6.2. Dấu `—` nghĩa là bảng có cấu trúc khoá riêng (partition hoặc khoá ghép), không dùng base chuẩn
- **trigger** → có DB trigger audit độc lập với tầng ứng dụng (§4.9)

---

# 7. QUY ƯỚC CODE

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| Tên file | kebab-case | `order-detail.tsx`, `orders.service.ts` |
| React component | PascalCase, một component chính mỗi file | `OrderTable` |
| Hook | `use-*.ts` | `use-orders.ts` |
| Nest artifact | `*.controller.ts` `*.service.ts` `*.dto.ts` `*.guard.ts` | |
| DTO | `Create*Dto` `Update*Dto` `*QueryDto` `*ResponseDto` | `CreateOrderDto` |
| Biến boolean | `is` / `has` / `can` | `isApproved`, `canEdit` |
| Mã quyền | `resource:action` | `order:approve` |
| Mã lỗi | `DOMAIN.REASON` | `ORDER.ALREADY_APPROVED` |
| Enum | SCREAMING_SNAKE_CASE | `PENDING_APPROVAL` |
| Bảng DB | snake_case số nhiều | `order_items` |
| Query key | qua factory, không viết tay | `orderKeys.detail(id)` |
| Branch | `feat/` `fix/` `chore/` `refactor/` | `feat/order-approval` |
| Commit | Conventional Commits | `feat(orders): thêm duyệt nhiều cấp` |

**Cấm:**
- `any` (dùng `unknown` + narrow)
- `z-index` rời rạc ngoài token
- Gọi `fetch` trực tiếp, phải qua api-client
- Viết tay type của response API
- Logic nghiệp vụ trong controller hoặc trong component
- Chuỗi hiển thị hardcode (phải qua i18n)

---

# 8. CHIẾN LƯỢC KIỂM THỬ

> **Chương này là nguồn sự thật duy nhất về kiểm thử.** Trước đây các test quan trọng nằm rải trong lộ trình §10; giờ tập trung tại đây. Lộ trình chỉ tham chiếu ngược về chương này.

## 8.1 Các loại test

| Loại | Phạm vi | Công cụ |
|---|---|---|
| Unit BE | Logic nghiệp vụ thuần | Vitest |
| Integration BE | Service + **DB thật** | Vitest + Testcontainers |
| Unit FE | Hook, util, format | Vitest + testing-library |
| Component | `common/`, `patterns/` | Storybook + play function |
| E2E | Luồng chính | Playwright |
| Contract | OpenAPI snapshot | CI diff |

## 8.2 Test bắt buộc — cổng chặn merge

Đây là danh sách bắt buộc. Thiếu một dòng là không đủ điều kiện đóng giai đoạn tương ứng.

| # | Test | Nội dung kiểm chứng | GĐ |
|---|---|---|---|
| 1 | **Tenant isolation** | Token tenant A không đọc/sửa/xoá được bất kỳ dòng nào của B, trên **toàn bộ** endpoint. Có tính tới ngoại lệ sysadmin | 1 |
| 2 | **Composite FK** | Không tạo được child của tenant A trỏ vào parent của tenant B (§6.4) | 1 |
| 3a | **Nested create** | Prisma nested create sinh child có đúng `tenant_id` (repository chuẩn hoá args) | 1 |
| 3b | **Nested bypass** | Gọi thẳng Prisma client bỏ qua repository → DB từ chối vì `NOT NULL` / composite FK | 1 |
| 3c | Tenancy exhaustive | Thêm model mới chưa phân loại → CI đỏ hoặc app không khởi động | 1 |
| 3d | Soft-delete policy | Model **không** có `SoftDeleteFields` → extension không chèn `deleted_at` vào query | 1 |
| 4 | Auth transport | Cookie hoạt động cho web, Bearer cho mobile; gửi **cả hai** → `400` (§4.3b) | 2 |
| 5 | **CSRF** | Sai CSRF token hoặc sai `Origin` → bị chặn trên mọi method thay đổi dữ liệu | 2 |
| 6 | **Refresh rotation** | Dùng lại refresh token cũ → **huỷ toàn bộ session** + ghi audit | 2 |
| 7 | Forgot password | Email tồn tại và không tồn tại cho **cùng response và thời gian phản hồi**; token dùng lần hai bị từ chối | 2 |
| 8 | **Ma trận quyền** | Bảng `role × endpoint → status`, cho mọi endpoint | 3 |
| 9 | **Permission invalidation** | Đổi role / membership / org_unit → quyền thay đổi **ngay**, không chờ token hết hạn | 3 |
| 10 | **Field-level leak** | Cột nhạy cảm bị ẩn ở **cả 4 chỗ**: API, export Excel, report, audit diff (§4.4c) | 3 |
| 11 | Sort/filter whitelist | `sort=<field không được xem>` → `400`, không lộ thứ tự | 3 |
| 12 | **Đếm query** | `expectQueryCount(n)` cho mọi endpoint danh sách | 4 |
| 13 | **Locale fallback nhất quán** | Thiếu bản dịch `en`: **display**, **sort**, **filter** và **q** đều fallback về `vi` và cho cùng kết quả; sort dùng đúng expression index | 4 |
| 14 | Soft delete + unique | Xoá mềm rồi tạo lại cùng `code` trong cùng tenant → thành công | 4 |
| 15 | Delete guard | Xoá bản ghi đang được tham chiếu → `409` kèm danh sách nguồn tham chiếu | 5 |
| 16 | **Bộ tính tiền** | Golden test: chiết khấu trước/sau VAT, làm tròn dòng vs hoá đơn, nhiều mức thuế | 5 |
| 17 | Optimistic locking | Hai request `PATCH` cùng `version` → một thành công, một `409` | 5 |
| 18 | **Idempotency** | 20 request song song cùng `Idempotency-Key` → đúng **một** resource được tạo | 5 |
| 19a | Idempotency sau khi mất Redis | Flush Redis rồi retry → vẫn không tạo trùng (lớp DB làm việc) | 5 |
| 19b | **Idempotency key reuse** | Cùng `Idempotency-Key` nhưng **body khác** → `409 COMMON.IDEMPOTENCY_KEY_REUSED` | 5 |
| 19c | Idempotency đang chạy | Gọi khi row đang `PROCESSING` → `409 IDEMPOTENCY_IN_PROGRESS` + `Retry-After` | 5 |
| 20a | **Outbox durability** | Kill worker giữa chừng → event **không bị mất**, được xử lý lại sau khi khởi động | 5 |
| 20e | **Outbox claim** | Hai worker chạy song song → không worker nào xử lý cùng một event tại cùng thời điểm; worker chết → event về `PENDING` sau lease timeout | 5 |
| 20b | Outbox rollback | Transaction nghiệp vụ rollback → event **không** được phát | 5 |
| 20c | **Consumer idempotency** | Xử lý cùng `eventId` nhiều lần → trạng thái nội bộ không nhân đôi | 5 |
| 20d | External idempotency | Gọi lại provider với cùng `eventId`/`Idempotency-Key` → không tạo tác dụng phụ nghiệp vụ trùng, **với provider có hỗ trợ** | 5 |
| 22 | **Stock concurrency** | 20 request xuất kho song song trên cùng lô → không âm tồn, tổng khớp | 5b |
| 23 | **Movement dedup** | Gọi lại cùng `(ref_type, ref_id, movement_type)` → không tạo movement thứ hai | 5b |
| 24 | Reconciliation | Cố ý làm lệch `stock_balances` → job đối soát phát hiện và cảnh báo | 5b |
| 25 | **Partition** | Insert đúng mảnh; tạo mảnh tháng mới tự động; DETACH mảnh cũ không ảnh hưởng query | 5b |
| 26 | Export streaming | Export 1 triệu dòng, RAM của process **không** tăng tuyến tính | 6 |
| 27 | **Import recovery** | Kill worker giữa chừng → resume từ checkpoint, không tạo dòng trùng | 6 |
| 28 | Bulk partial success | 100 bản ghi, 8 lỗi → HTTP `200`, `results` liệt kê đúng 8 dòng lỗi | 6 |
| 29 | Global search | Kết quả áp đúng row-level và field-level permission | 8 |
| 30 | **Backup restore** | Restore thật vào môi trường sạch + smoke test. Chạy **trước mỗi lần go-live** | 9 |

### Ghi chú về ngữ nghĩa outbox

Transactional outbox đảm bảo **"đã commit thì không mất"**, tức **at-least-once delivery** — **không phải** exactly-once. Kịch bản không tránh được:

```
1. worker gọi hệ thống ngoài   → 2. hệ thống ngoài xử lý THÀNH CÔNG
3. worker chết                 → 4. chưa kịp ghi processed_at
5. worker khởi động lại        → 6. GỬI LẠI
```

Outbox không có cách nào biết bước 2 đã thành công. Vì vậy:

- **Mặc định của hệ thống là at-least-once.** Mọi handler phải chịu được retry
- Chống trùng **tác dụng phụ nghiệp vụ** là trách nhiệm của consumer, không của outbox: `eventId` ổn định + bảng đã-xử-lý ở phía consumer
- Với hệ thống ngoài: gửi `Idempotency-Key` = `eventId` nếu provider hỗ trợ; nếu không hỗ trợ thì phải chấp nhận rủi ro và ghi rõ trong ADR của tích hợp đó
- `webhook_deliveries` có `UNIQUE (tenant_id, endpoint_id, event_id)` đúng để phục vụ việc này

## 8.3 Hạ tầng test

- **Fixture hai tenant:** mọi integration test chạy trên seed có 2 tenant với dữ liệu giống nhau. Nếu chỉ có một tenant thì test #1 vô nghĩa
- **Factory/builder** cho từng entity, không viết `prisma.create` rải rác trong test
- Testcontainers Postgres, **có bật partition** — không test partition trên DB thường
- Test concurrency (#18, #22) chạy song song thật bằng `Promise.all`, không tuần tự
- Contract test: OpenAPI snapshot diff, cảnh báo khi contract đổi

---

# 9. DEVOPS & VẬN HÀNH

**Môi trường:** dev (docker-compose cục bộ) → staging → production.

**Biến môi trường:** validate bằng zod lúc khởi động, thiếu biến là crash ngay. `.env.example` luôn đầy đủ.

**CI (mỗi PR):** lint → typecheck → unit → integration (Testcontainers) → build → kiểm tra migration drift → `npm audit`.

**CD:** build image → chạy migration → rolling deploy → health check → rollback tự động nếu health check thất bại.

**Giám sát:** Sentry, uptime check, cảnh báo khi dead-letter queue có job, cảnh báo slow query.

**Sao lưu:** backup DB hằng ngày, giữ 30 ngày, **thử restore thật ít nhất một lần trước khi go-live**.

---

# 10. LỘ TRÌNH TRIỂN KHAI

Đi theo **vertical slice**. Mỗi giai đoạn có tiêu chí hoàn thành đo được.

> **Tiêu chí kiểm chứng chi tiết nằm ở §8.2** — cột *GĐ* trong bảng đó ánh xạ về giai đoạn tương ứng. Cột dưới đây chỉ tóm tắt.

| GĐ | Nội dung | Tiêu chí hoàn thành |
|---|---|---|
| 1 | Monorepo, ENV, docker-compose, CI, contract §3, codegen<br>**+ bảng `tenants`/`tenant_memberships`**<br>**+ CLS context có `tenantId` + `locale` + `actorId`**<br>**+ Prisma query extension: `TENANCY_POLICY` + kiểm tra vét cạn lúc khởi động + xử lý nested create (§6.4)**<br>**+ SerializeInterceptor (field-level)** | `GET /me` chạy từ FE bằng type sinh tự động; CI xanh; **test cách ly tenant đã có và xanh**, đã tính tới ngoại lệ sysadmin |
| 2 | Auth (§4.3, §4.3b, §4.3c) + nguồn xác định tenant + chọn tenant khi login | Login/logout/refresh xoay vòng/CSRF/mời tài khoản/quản lý phiên chạy thật. Cache permission khoá `(userId, tenantId)` |
| 3 | Users, Roles, Permissions, OrgUnits, vòng đời tài khoản | Test ma trận quyền xanh; row-level scope đúng; **field-level ẩn đúng cột ở cả 4 chỗ** |
| 3b | **Quản trị tenant (§5C.1) + audit trigger nhóm security-critical theo §4.9** | Tạo/khoá tenant, quota, feature flag theo tenant hoạt động |
| 4 | `FilterParser`/`SortParser` (**resolve JSONB theo locale**) + `DataTable` + `Form` + `saved_views` | Danh sách user đủ sort/filter/phân trang, đồng bộ URL, F5 và Back đúng, lưu được view |
| 5 | **Module nghiệp vụ mẫu [REF]**: Orders ↔ Items ↔ Customers<br>**+ A2 Delete guard · B1 Bộ tính tiền · idempotency 3 lớp · outbox** | State machine, đánh số chứng từ theo tenant, optimistic locking, test đếm query xanh; unit test bộ tính tiền dày; gọi trùng 1 endpoint 2 lần chỉ tạo 1 chứng từ |
| 5b | **Movements + `movement_dedup_keys` + `stock_balances` + thuật toán 4 bước + 2 job (rebuild, đối soát) + partition DDL** | **Test đồng thời: 20 request xuất kho song song trên cùng lô không làm âm tồn**; gọi lại cùng `refId` không tạo movement thứ hai; job đối soát phát hiện được lệch cố ý |
| 6 | Export **streaming** + Import (batch, checkpoint, resume) + **bulk operation framework** | Export 1 triệu dòng không tăng RAM; import 5.000 dòng báo lỗi từng dòng, kill job giữa chừng rồi retry không tạo trùng |
| 6b | **A1 Report framework** | Khai báo 1 báo cáo mới trong dưới 2 giờ, có export và drill-down |
| 7 | Audit log (append-only, partition), Files, Notifications, **business calendar** | Timeline thay đổi hiện đúng; `addWorkingDays()` tính đúng lễ Việt Nam |
| 8 | Action Registry + Overlay manager + Cmd+K + **global search** | Một action khai báo một lần, hiện đúng ở 4 nơi; search áp đúng quyền |
| 9 | Module generator (plop) + **system operations (§5C.8)** | `pnpm gen:module invoice` sinh đủ FE+BE **kèm tenant, locale, delete guard, audit** |
| 10 | [OPT] còn lại: approvals, webhook, comments, SLA engine, report scheduling, grid entry, SSO, 2FA | Theo nhu cầu |

**Cảnh báo:** bỏ qua giai đoạn 5 là sai lầm nghiêm trọng nhất. Boilerplate chỉ CRUD một bảng trông rất gọn nhưng sẽ vỡ khi gặp nghiệp vụ thật có quan hệ, trạng thái và giao dịch.

---

# 11. QUY TRÌNH KHỞI TẠO DỰ ÁN MỚI

```
1. Clone repo gốc, đổi tên, xoá lịch sử git
2. Đối chiếu bảng dưới, xoá module không dùng
3. Xoá module [REF] Orders sau khi đã copy làm mẫu cho module đầu tiên
4. Cập nhật permission registry theo nghiệp vụ mới
5. Chạy `pnpm gen:module <tên>` cho từng module nghiệp vụ
6. Rà lại docs/conventions.md, bổ sung quy ước riêng của dự án
```

**Bảng cắt gọt:**

| Module | Nhãn | Lệnh xoá | File cần sửa kèm |
|---|---|---|---|
| approvals | OPT | `rm -rf apps/api/src/modules/approvals apps/web/src/features/approvals` | `app.module.ts`, sidebar config |
| imports | OPT | `rm -rf .../imports` | `app.module.ts`, sidebar config |
| notifications | OPT | `rm -rf .../notifications` | `app.module.ts`, header component |
| settings — **hạ tầng** | **CORE** | **Không xoá.** Bảng `settings`, service đọc/ghi có cache, audit trigger đều là nền tảng | — |
| settings — **màn hình quản lý** | OPT | `rm -rf apps/web/src/features/settings` | sidebar config |
| packages/vn | OPT | `rm -rf packages/vn` | các form dùng cascader tỉnh/xã |
| SSO / 2FA | OPT | tắt bằng ENV trước, xoá sau | `auth.module.ts` |
| **orders** | **REF** | **xoá sau khi đã copy** | `app.module.ts`, sidebar, seed |

---

# 12. QUYẾT ĐỊNH CẦN CHỐT

Tất cả các điểm dưới đây **đã được chốt**. Mọi thay đổi về sau phải qua ADR mới.

| # | Vấn đề | **Quyết định** | Đặc tả tại | Ảnh hưởng nếu đổi sau |
|---|---|---|---|---|
| 1 | Multi-tenant | ✅ **CÓ** — `tenantId` NOT NULL + Prisma extension | §4.4b | Rất lớn |
| 2 | Phân quyền cấp trường | ✅ **CÓ** — serializer group, áp ở 4 chỗ | §4.4c | Lớn |
| 3 | Có kho / công nợ / quỹ | ✅ **CÓ** → B4 lên CORE | §5B.2/B4 | Rất lớn |
| 4 | Chiến lược số dư | ✅ **Movement append-only + snapshot + job đối soát** | §5B.2/B4 | Rất lớn |
| 5 | i18n giao diện | ✅ **CÓ** từ đầu (`next-intl`, vi/en) | §5.10 | Lớn |
| 6 | i18n tầng dữ liệu | ✅ **CÓ** — cột JSONB, không dùng bảng translation | §3.10 | Lớn |
| 7 | Export streaming | ✅ **CORE**, làm ngay | §5B.3/C1 | Lớn |
| 8 | Partition bảng lớn | ✅ `movements` + `audit_logs`, RANGE theo tháng, **PK = (id, created_at)** | §5B.3/C2 | Rất lớn |
| 9 | Đối soát hệ thống ngoài | ✅ `externalId` + `source` trong base entity | §4.5 | Trung bình |
| 10 | Cấu trúc cây đơn vị | `ltree` | §4.4 | Trung bình |
| 11 | Kiểu ID | UUID v7 | §3.7 | Lớn |
| 12 | Tiền tệ | Decimal dạng chuỗi + field `currency` | §3.7 | Lớn |
| 13 | Worker | Chung codebase, khác process | §2.1 | Nhỏ |
| 14 | Audit log | Append-only, không cho sửa/xoá | §4.9 | Trung bình |
| 15 | **Transport token** | ✅ Web = httpOnly cookie + CSRF; Mobile/đối tác = Bearer. Guard tổng hợp | §4.3b | Trung bình |
| 16 | **Mô hình định danh** | ✅ `users` global + `tenant_memberships`. Email unique toàn hệ thống | §4.4b | Rất lớn |
| 17 | Đổi tenant | ✅ Cấp lại token mới, không chỉ đổi context client | §4.4b | Trung bình |
| 18 | Sysadmin chéo tenant | ✅ Cơ chế tường minh, luôn audit `CROSS_TENANT_ACCESS` | §4.4b | Trung bình |
| 19 | **Chống xuất âm** | ✅ Conditional UPDATE trên `stock_balances`, `affected rows = 0` → `409` | §5B.2/B4 | Rất lớn |
| 20 | Idempotency | ✅ Ba lớp: Redis + bảng DB + unique business key | §3.9 | Lớn |
| 21 | Outbox | ✅ CORE. Luật: event có tác dụng phụ ngoài transaction DB phải qua outbox | §4.8 | Lớn |
| 22 | Phạm vi audit | ✅ Write phải qua repository; nhóm security-critical (7 bảng) có DB trigger | §4.9 | Trung bình |
| 23 | Import | ✅ Transaction theo batch + checkpoint + resume | §4.7 | Trung bình |
| 24 | Business calendar / SLA | ✅ Calendar = CORE nhẹ. SLA engine = OPT | §5C.4 | Nhỏ |
| 25 | Webhook | ✅ Framework riêng, [OPT] ưu tiên cao. Phát qua outbox | §5C.5 | Nhỏ |
| 26 | **Nguồn tenant** | ✅ Chỉ từ access token. Không nhận header. Ngoại lệ duy nhất: `/admin/*` + `X-Target-Tenant` + audit | §3.1b | Rất lớn |
| 27 | **Payload access token** | ✅ `sub`, `tenantId`, `membershipId`, `sessionId`, `orgUnitId`. Cache permission theo `(tenantId, userId)` | §4.3 | Lớn |
| 28 | **Chống trùng movement** | ✅ Bảng `movement_dedup_keys` không partition. Không đặt UNIQUE trên `movements` | §5B.2/B4 | Rất lớn |
| 29 | **`tenant_id` ở bảng con** | ✅ Mọi bảng con đều có, enforce bằng composite FK `(tenant_id, parent_id)` | §6.2 | Rất lớn |
| 30 | `reversal_of` | ✅ Cặp hai cột `reversal_of_id` + `reversal_of_created_at` để có FK thật | §5B.2/B4 | Trung bình |
| 31 | **Ba tầng base entity** | ✅ `GlobalAuditedBase` / `TenantAuditedBase` / `BusinessEntityBase` | §6.2 | Lớn |
| 32 | Cấu hình | ✅ Một bảng `settings` (tenant_id NULL = mặc định). Bỏ `tenant_settings`. `tenant_features` = quyền dùng module, `feature_flags` = rollout kỹ thuật | §6 | Trung bình |
| 33 | `tenant_memberships` | ✅ Dùng `status`, **không** soft delete | §6.2 | Nhỏ |
| 34 | Quên mật khẩu | ✅ Token hash trong DB, response và thời gian như nhau, reset thu hồi mọi session | §4.3c | Trung bình |
| 35 | **Lưu trữ secret** | ✅ Mã hoá tầng ứng dụng, API không bao giờ trả secret, UI chỉ Replace/Rotate | §4.11 | Lớn |
| 36 | **Prisma: extension, không middleware** | ✅ `$extends` query extension cho cả tenant lẫn audit. **Pin major version, ghi ADR** | §4.9 | Lớn |
| 37 | **`TENANCY_POLICY`** | ✅ Ba nhóm GLOBAL/HYBRID/TENANT + `assertExhaustiveTenancyPolicy()` chặn khởi động | §4.4b | Lớn |
| 38 | **Soft delete là capability** | ✅ `SoftDeleteFields` ghép được vào bất kỳ tầng base nào, không tạo thêm loại base | §6.2 | Trung bình |
| 39 | Không khai lại cột base | ✅ Cột trong base **không bao giờ** viết lại trong schema | §6.2 | Nhỏ |
| 40 | PK `tenant_memberships` | ✅ `PRIMARY KEY (id)` + `UNIQUE (tenant_id, user_id)`, khớp `membershipId` trong token | §6.2 | Trung bình |
| 41 | **Tìm kiếm không dấu** | ✅ Cột `*_search` chuẩn hoá ở **tầng ứng dụng**. Không dùng `unaccent()` trong index hay generated column | §3.10 | Lớn |
| 42 | Ngữ nghĩa outbox | ✅ At-least-once. Chống trùng là việc của consumer, không của outbox | §8.2 | Trung bình |
| 43 | Settings | ✅ Hạ tầng = CORE, màn hình quản lý = OPT | §4.1, §11 | Nhỏ |
| 44 | **Nested write** | ✅ Extension lo top-level; **repository chuẩn hoá args** cho nested; DB composite FK là lưới cuối | §6.4 | Rất lớn |
| 45 | Tenancy | ✅ Ba loại GLOBAL/HYBRID/TENANT. Bảng con của TENANT luôn là TENANT | §6.4 | Lớn |
| 46 | Soft-delete extension | ✅ Chỉ áp model trong `SOFT_DELETE_MODELS`, có kiểm tra vét cạn | §4.5 | Lớn |
| 47 | **`order_items`** | ✅ Child của aggregate: `TenantAuditedBase`, không soft delete, dùng `orders.version` | §6.2, §6.5 | Trung bình |
| 48 | **Session** | ✅ Redis = nguồn sự thật runtime; DB = metadata + UI thiết bị. Thu hồi: ghi DB trước, xoá Redis sau | §4.3d | Lớn |
| 49 | **Refresh token family** | ✅ `familyId` + `consumedHashes` giữ tới khi family hết hạn — điều kiện để phát hiện tái sử dụng | §4.3d | Lớn |
| 50 | **Idempotency state machine** | ✅ Khác `request_hash` → `409 KEY_REUSED`. Thất bại không xoá row | §3.9 | Lớn |
| 51 | **Locale resolve** | ✅ Một hàm `resolveLocaleExpr()` cho cả response/filter/sort/search; index khớp biểu thức | §3.10 | Lớn |
| 52 | Header | ✅ Tất cả OPTIONAL, có chuỗi resolve. Ngoại lệ: `X-Timezone` bắt buộc cho endpoint báo cáo theo ngày | §3.1c | Trung bình |
| 53 | **CSRF** | ✅ Cookie `csrf_token` (không HttpOnly) + header `X-CSRF-Token`, so sánh constant-time + Origin allowlist | §4.3b | Trung bình |
| 54 | **Đánh số chứng từ** | ✅ Atomic UPSERT `ON CONFLICT DO UPDATE`, trong cùng transaction. Bỏ `FOR UPDATE` và advisory lock | §4.7 | Lớn |
| 55 | Audit trigger | ✅ Nhóm security-critical **7 bảng**, tham chiếu bằng tên không bằng số | §4.9 | Trung bình |
| 56 | **Outbox claim** | ✅ `FOR UPDATE SKIP LOCKED` + `locked_at`/`locked_by` + lease timeout 5 phút | §4.8 | Lớn |
| 57 | Kiểm tra vét cạn | ✅ Ưu tiên build-time codegen từ `schema.prisma`, không phụ thuộc API nội bộ Prisma | §4.4b | Trung bình |
| 58 | **Theo dõi hàng** | ✅ `products.tracking_type` = `NONE`/`LOT`/`SERIAL`. Serial có bảng riêng, **không** phình PK tồn kho | §5B.2/B4 | Rất lớn |
| 59 | **`lot_id` sentinel** | ✅ `NONE` dùng UUID toàn số 0. PK không nhận NULL; giữ hot path `lot_id = :lotId`. Đánh đổi: không FK về `lots` | §5B.2/B4 | Rất lớn |
| 60 | **Nguồn tồn kho** | ✅ `stock_balances` là nguồn duy nhất cho cả 3 loại. `inventory_serials` là **chi tiết**, không tự quản tồn | §5B.2/B4 | Rất lớn |
| 61 | **Vai trò động** | ✅ 5 vai trò chỉ là **seed**. Kế toán/Thủ kho/Kinh doanh là role cấu hình theo tenant. **Cấm mọi rẽ nhánh code theo mã vai trò** | §4.4 | Lớn |
| 62 | **Hạn mức duyệt** | ✅ Bảng `approval_authorities` riêng. **Không** đặt trên `tenant_memberships`. Fail-closed khi không khớp | §5C.12 | Lớn |

### Các điểm còn để mở (không chặn coding)

| Vấn đề | Khi nào cần quyết |
|---|---|
| Sáu câu hỏi về kho: tồn âm, reservation, FIFO/FEFO... | Trước GĐ5b, xem §5B.2/B4 |
| Ngôn ngữ thứ ba ngoài vi/en | Bất cứ lúc nào |
| Có cổng khách hàng (portal) không — quyết định `comments.is_internal` có cần ngay | Trước GĐ10 |

---

# 13. PHỤ LỤC

## 13.1 Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| `boilerplate-checklist.md` | Checklist đầy đủ dạng tick, dùng khi thi công |
| `action-registry.tsx` | Bản cài đặt tham khảo của Action Registry |
| `docs/adr/` | Ghi nhận lý do từng quyết định kiến trúc |
| `docs/ui-conventions.md` | Chi tiết §5.6, §5.7 |
| `docs/security.md` | Checklist OWASP áp dụng cho dự án |

## 13.2 Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| N+1 query | Truy vấn 1 lần lấy danh sách rồi truy vấn thêm N lần cho từng dòng |
| Optimistic locking | Kiểm soát sửa đồng thời bằng cột `version` thay vì khoá bản ghi |
| Row-level permission | Giới hạn dữ liệu người dùng thấy được, thực hiện trong mệnh đề `WHERE` |
| Scope | Phạm vi dữ liệu gắn với một quyền: own / department / descendants / all |
| Vertical slice | Làm trọn một luồng từ DB tới UI trước khi làm luồng khác |
| CORE / OPT / REF | Xem §1.4 |

## 13.3 Ba cái bẫy cần nhớ

1. **Trừu tượng hoá quá sớm.** Không viết `BaseCrudService<T>` ở dự án đầu tiên. Chờ đến lần lặp thứ ba.
2. **Xây thứ "chắc sẽ cần".** Mỗi hạng mục [OPT] chỉ triển khai khi đã thực sự cần ít nhất một lần. Còn lại nằm trong checklist là đủ.
3. **Repo chết vì không được dùng.** Khởi động dự án tiếp theo bằng chính nó. Mỗi lần phải sửa, tự hỏi: *"cái này nên chảy ngược về boilerplate không?"*

---

*Hết tài liệu. Mọi thay đổi đối với chương 3 (Contract API) và chương 6 (Mô hình dữ liệu) phải được ghi lại trong `docs/adr/`.*
