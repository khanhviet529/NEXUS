# MA TRẬN PHÂN QUYỀN

> Bổ trợ cho `boilerplate-spec.md` §4.4. Tài liệu này là **nguồn dữ liệu trực tiếp cho test #8** (ma trận quyền) ở §8.2 — bảng dưới đây được chuyển thành `describe.each` gần như một-đối-một.
>
> **Năm vai trò dưới đây chỉ là DỮ LIỆU SEED, không phải mô hình của hệ thống.** Kế toán, Thủ kho, Kinh doanh, Trưởng phòng… là vai trò **do từng tenant tự cấu hình**, ghép từ `permission + scope`.
>
> Tài liệu này có hai vai trò: (a) định nghĩa dữ liệu seed, (b) làm **test fixture** cho test #8. Nó **không** định nghĩa mô hình phân quyền — mô hình nằm ở §4.4.

---

# 1. Bộ vai trò chuẩn

| Mã | Tên | Phạm vi | Ghi chú |
|---|---|---|---|
| `SYSADMIN` | Quản trị hệ thống | **Xuyên tenant** | Nhân sự nhà cung cấp phần mềm. Mọi truy cập ghi `CROSS_TENANT_ACCESS` |
| `TENANT_ADMIN` | Quản trị viên | Toàn tenant | Khách hàng tự quản trị: user, vai trò, cấu hình |
| `MANAGER` | Trưởng đơn vị | Đơn vị + cấp dưới | Duyệt, xem dữ liệu nhóm |
| `STAFF` | Nhân viên | Của mình | Tạo và sửa chứng từ của mình |
| `VIEWER` | Chỉ xem | Toàn tenant, chỉ đọc | Ban giám đốc, kiểm toán nội bộ |

**Vai trò hệ thống** (`is_system = true`) không cho sửa, không cho xoá. Khách muốn khác thì tạo vai trò mới.

## 1.1 Luật cứng — cấm rẽ nhánh theo mã vai trò

```ts
if (user.role === 'ACCOUNTANT') { ... }     // ❌ CẤM TUYỆT ĐỐI
if (can('invoice:approve')) { ... }         // ✅ luôn kiểm theo permission
```

Vi phạm là phá vỡ toàn bộ mô hình RBAC: vai trò khách tự tạo sẽ không chạy, và mỗi tenant cần một nhánh code riêng.

**Thực thi bằng CI:** quét `apps/api/src` và `apps/web/src` tìm so sánh chuỗi với mã vai trò; cho phép **duy nhất** trong file seed. Đưa vào bộ bảy check ở GĐ1 (`working-agreement.md` §4.1).

Hệ quả: các cột vai trò trong mọi bảng dưới đây là **kỳ vọng của bộ seed**, dùng để viết test. Chúng không được xuất hiện dưới dạng hằng chuỗi trong code nghiệp vụ.

## 1.2 Ký hiệu scope

| Ký hiệu | Nghĩa | Điều kiện SQL |
|---|---|---|
| `❌` | Không có quyền | — |
| `own` | Của mình | `created_by_id = :me OR assigned_to_id = :me` |
| `dept` | Đơn vị của mình | `org_unit_id = :myOrgUnit` |
| `desc` | Đơn vị + cấp dưới | `org_unit_id <@ :myOrgUnitPath` (ltree) |
| `all` | Toàn tenant | chỉ `tenant_id = :current` |
| `X-T` | Xuyên tenant | chỉ `SYSADMIN`, qua `/admin/*` + audit |

**Nhắc lại §4.4:** điều kiện scope phải nằm **trong câu query**. Lọc sau khi fetch làm sai phân trang.

---

# 2. Ma trận — module CORE

## 2.1 Xác thực (không cần quyền)

| Endpoint | Yêu cầu |
|---|---|
| `POST /auth/login` | Công khai, rate limit IP+email |
| `POST /auth/select-tenant` | Đã xác thực sơ bộ, chưa có `tenantId` |
| `POST /auth/refresh` | Refresh token hợp lệ |
| `POST /auth/logout` | Đã đăng nhập |
| `POST /auth/switch-tenant` | Đã đăng nhập + có membership ở tenant đích |
| `POST /auth/forgot-password` | Công khai, luôn trả `202` |
| `POST /auth/reset-password` | Token hợp lệ |
| `GET /me` | Đã đăng nhập |
| `PATCH /me/preferences` | Đã đăng nhập, chỉ sửa của chính mình |

## 2.2 Người dùng & thành viên

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER | SYSADMIN |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `GET /users` | `user:read` | `dept` | `desc` | `all` | `all` | `X-T` |
| `GET /users/:id` | `user:read` | `dept` | `desc` | `all` | `all` | `X-T` |
| `POST /users/invite` | `user:invite` | ❌ | `desc` | `all` | ❌ | `X-T` |
| `PATCH /users/:id` | `user:update` | ❌ | `desc` | `all` | ❌ | `X-T` |
| `POST /users/:id/disable` | `user:disable` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `POST /users/:id/unlock` | `user:unlock` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `POST /users/:id/transfer-org` | `user:transfer` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `POST /users/:id/offboard` | `user:offboard` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `GET /users/:id/sessions` | `user:session:read` | own | `desc` | `all` | ❌ | `X-T` |
| `DELETE /users/:id/sessions` | `user:session:revoke` | own | ❌ | `all` | ❌ | `X-T` |

## 2.3 Vai trò & quyền

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER | SYSADMIN |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `GET /roles` | `role:read` | ❌ | `all` | `all` | `all` | `X-T` |
| `POST /roles` | `role:create` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `PATCH /roles/:id` | `role:update` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `DELETE /roles/:id` | `role:delete` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `GET /permissions` | `permission:read` | ❌ | `all` | `all` | `all` | `X-T` |
| `POST /users/:id/roles` | `user:assign_role` | ❌ | ❌ | `all` | ❌ | `X-T` |

**Ba luật cứng:**
1. **Không ai được tự cấp quyền cho chính mình** — kể cả `TENANT_ADMIN`. `POST /users/:id/roles` với `:id` = mình → `403 AUTH.SELF_GRANT_FORBIDDEN`
2. **Không cấp được quyền mình không có.** Gán vai trò chứa `salary:read` khi mình không có `salary:read` → `403`
3. Vai trò `is_system` không sửa, không xoá

## 2.4 Đơn vị

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER | SYSADMIN |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `GET /org-units` | `org_unit:read` | `all` | `all` | `all` | `all` | `X-T` |
| `POST /org-units` | `org_unit:create` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `PATCH /org-units/:id` | `org_unit:update` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `DELETE /org-units/:id` | `org_unit:delete` | ❌ | ❌ | `all` | ❌ | `X-T` |

Cây đơn vị ai cũng đọc được (cần cho dropdown), nhưng chỉ admin sửa. Sửa cây → **invalidate cache permission của toàn tenant** (§4.3), vì scope `desc` phụ thuộc `path`.

## 2.5 Cấu hình, audit, file

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER | SYSADMIN |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `GET /settings` | `setting:read` | ❌ | `all` | `all` | `all` | `X-T` |
| `PATCH /settings` | `setting:update` | ❌ | ❌ | `all` | ❌ | `X-T` |
| `GET /audit-logs` | `audit:read` | ❌ | `desc` | `all` | `all` | `X-T` |
| `POST /files/presign` | `file:upload` | `own` | `desc` | `all` | ❌ | `X-T` |
| `GET /files/:id` | `file:read` | theo entity gốc | | | | |

`GET /files/:id` **kế thừa quyền của entity đính kèm**, không có quyền riêng. Xem được đơn hàng thì xem được file của đơn đó. Đây là chỗ hay bị hở: file tưởng vô hại nhưng nội dung là bảng lương.

## 2.6 Quản trị tenant — chỉ SYSADMIN

| Endpoint | Permission | TENANT_ADMIN | SYSADMIN |
|---|---|:---:|:---:|
| `GET /admin/tenants` | `system:tenant:read` | ❌ | ✅ |
| `POST /admin/tenants` | `system:tenant:create` | ❌ | ✅ |
| `POST /admin/tenants/:id/suspend` | `system:tenant:suspend` | ❌ | ✅ |
| `PATCH /admin/tenants/:id/features` | `system:tenant:features` | ❌ | ✅ |
| `POST /admin/impersonate` | `system:impersonate` | ❌ | ✅ |
| `GET /admin/queues` | `system:queue:read` | ❌ | ✅ |
| `POST /admin/maintenance` | `system:maintenance` | ❌ | ✅ |
| `GET /tenants/current` | `tenant:read` | ✅ | ✅ |
| `PATCH /tenants/current/branding` | `tenant:update` | ✅ | ✅ |

Mọi endpoint `/admin/*` **bắt buộc** `system:cross_tenant` + header `X-Target-Tenant` + ghi audit `CROSS_TENANT_ACCESS` (§3.1b).

---

# 3. Ma trận — module nghiệp vụ mẫu [REF]

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `GET /orders` | `order:read` | `own` | `desc` | `all` | `all` |
| `POST /orders` | `order:create` | `own` | `desc` | `all` | ❌ |
| `PATCH /orders/:id` | `order:update` | `own` | `desc` | `all` | ❌ |
| `DELETE /orders/:id` | `order:delete` | ❌ | `desc` | `all` | ❌ |
| `POST /orders/:id/submit` | `order:submit` | `own` | `desc` | `all` | ❌ |
| `POST /orders/:id/approve` | `order:approve` | ❌ | `desc` | `all` | ❌ |
| `POST /orders/:id/reject` | `order:approve` | ❌ | `desc` | `all` | ❌ |
| `POST /orders/bulk-approve` | `order:approve` | ❌ | `desc` | `all` | ❌ |
| `POST /orders/:id/cancel` | `order:update` | `own` | `desc` | `all` | ❌ |
| `POST /orders/export` | `order:export` | `own` | `desc` | `all` | `all` |
| `POST /orders/import` | `order:import` | ❌ | `desc` | `all` | ❌ |

## 3.1 Điều kiện nghiệp vụ chồng lên quyền

Có quyền **chưa đủ**. Phần này ánh xạ thẳng vào `enabled()` của Action Registry (§5.9):

| Hành động | Điều kiện thêm | Mã lỗi |
|---|---|---|
| `update` | `status IN (DRAFT, REJECTED)` | `ORDER.NOT_EDITABLE` |
| `delete` | `status = DRAFT` | `ORDER.NOT_DELETABLE` |
| `submit` | `status = DRAFT` và có ít nhất 1 dòng | `ORDER.INVALID_TRANSITION` |
| `approve` | `status = PENDING` | `ORDER.INVALID_TRANSITION` |
| `approve` | **`created_by_id ≠ me`** — không tự duyệt đơn mình tạo | `ORDER.SELF_APPROVAL` |
| `approve` | `total` nằm trong hạn mức resolve từ `approval_authorities` (§5C.12) | `ORDER.EXCEEDS_LIMIT` |
| `approve` | **Không khớp dòng authority nào → KHÔNG duyệt được** (fail-closed) | `ORDER.NO_APPROVAL_AUTHORITY` |
| mọi write | kỳ chưa khoá sổ (§5B.2/B5) | `PERIOD.CLOSED` |

**Không tự duyệt** là luật kiểm soát nội bộ cơ bản, gần như dự án nào cũng cần. Đưa vào module mẫu để mọi module sau copy theo.

## 3.2 Báo cáo — A1 report framework (GĐ6b)

Quyền kiểm **theo từng report** (`ReportDef.permission`) trong service; controller là
`@AllowAuthenticated` vì danh sách báo cáo động. Scope nhúng vào `WHERE` của query
báo cáo (§4.4), cột `fieldGroup` lọc theo §4.4c nơi 3.

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `GET /reports` | đã đăng nhập — chỉ liệt kê report user có quyền | ✅ | ✅ | ✅ | ✅ |
| `GET /reports/:id/meta` | permission của report đó | theo report | theo report | theo report | theo report |
| `POST /reports/:id/run` | permission của report đó | theo report | theo report | theo report | theo report |
| `POST /reports/:id/export` | như `run` — cùng đường lọc cột | theo report | theo report | theo report | theo report |

Scope seed cho từng permission report (chốt 2026-08-07, soi gương `order:export` vì
báo cáo doanh thu đọc đúng tập dòng quyền xem đơn hàng phủ):

| Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER |
|---|:---:|:---:|:---:|:---:|
| `report:sales` (`sales-by-customer`) | `own` | `desc` | `all` | `all` |

## 3.3 GĐ10 — hạn mức duyệt (§5C.12) + webhook (§5C.5)

| Endpoint | Permission | STAFF | MANAGER | TENANT_ADMIN | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `GET /approval-authorities` (+`/check`) | `approval_authority:read` | ❌ | `all` | `all` | ❌ |
| `POST/DELETE /approval-authorities` | `approval_authority:manage` | ❌ | ❌ | `all` | ❌ |
| `/webhooks/**` | `webhook:manage` | ❌ | ❌ | `all` | ❌ |
| `/recent-items`, `/favorite-items` | đã đăng nhập — own tuyệt đối theo membership | ✅ | ✅ | ✅ | ✅ |

Hạn mức seed (chốt 2026-08-08, tự quyết theo uỷ quyền): MANAGER + TENANT_ADMIN
duyệt `ORDER`/VND **không giới hạn** từ 2020-01-01 — GIỮ nguyên hành vi duyệt
trước GĐ10; tenant siết lại bằng dòng cụ thể hơn (membership/priority).

---

# 4. Phân quyền cấp trường

Áp ở **bốn** nơi theo §4.4c. Bảng này là nguồn cho test #10.

| Bảng.Cột | Serializer group | STAFF | MANAGER | TENANT_ADMIN | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `users.salary` | `hr` | ❌ | ❌ | ✅ | ❌ |
| `users.national_id` | `pii` | ❌ | ❌ | ✅ | ❌ |
| `users.phone` | `contact` | ✅ | ✅ | ✅ | ✅ |
| `products.cost_price` | `cost` | ❌ | ✅ | ✅ | ✅ |
| `order_items.cost_price` | `cost` | ❌ | ✅ | ✅ | ✅ |
| `orders.margin` | `cost` | ❌ | ✅ | ✅ | ✅ |
| `customers.credit_limit` | `finance` | ❌ | ✅ | ✅ | ✅ |

**Bốn nơi bắt buộc áp — ba nơi sau rất hay quên:**

1. Response API
2. **Export Excel/CSV** — ẩn cột trên UI mà export ra đủ là lỗi phổ biến nhất
3. **Report framework** (§5B.1/A1)
4. **Audit log diff** — không để `salary` lọt vào `before`/`after`

**Và:** whitelist filter/sort phải **loại bỏ** cột không được xem. Cho `sort=cost_price` là để user suy ra thứ tự giá vốn dù không thấy số.

---

# 5. Chuyển thành test #8

```ts
// apps/api/test/permission-matrix.spec.ts
const MATRIX = [
  // [role,           method,  path,                  expectStatus, expectScope]
  ['STAFF',           'GET',   '/orders',             200, 'own'],
  ['STAFF',           'POST',  '/orders/:id/approve', 403, null],
  ['MANAGER',         'POST',  '/orders/:id/approve', 200, 'desc'],
  ['MANAGER',         'POST',  '/orders/:id/approve', 403, null,
                       { seed: 'createdByMe' }],        // luật không tự duyệt
  ['VIEWER',          'POST',  '/orders',             403, null],
  ['TENANT_ADMIN',    'POST',  '/users/:me/roles',    403, null],  // không tự cấp quyền
  ['TENANT_ADMIN',    'GET',   '/admin/tenants',      403, null],
  ['SYSADMIN',        'GET',   '/admin/tenants',      200, 'X-T'],
] as const

describe.each(MATRIX)('%s %s %s', (role, method, path, status, scope, opts) => {
  it(`→ ${status}`, async () => { /* ... */ })
  if (scope) it(`chỉ trả dữ liệu trong scope ${scope}`, async () => { /* ... */ })
})
```

**Hai điều kiểm chứng, không phải một:** mã HTTP **và** phạm vi dữ liệu trả về. Endpoint trả `200` nhưng kèm dữ liệu ngoài scope là lỗi nghiêm trọng hơn trả `403` sai.

---

# 6. Việc cần làm

| # | Việc | Trước giai đoạn |
|---|---|---|
| 1 | Rà lại bộ **seed** 5 vai trò cho hợp lý — không thêm vai trò nghiệp vụ vào đây | GĐ3 |
| 2 | Chốt danh sách cột nhạy cảm ở §4 — bổ sung sau rất đắt | GĐ3 |
| 3 | Sinh `permissions.ts` registry từ cột Permission của các bảng trên | GĐ3 |
| 4 | Chuyển §5 thành file test thật | GĐ3 |
| 5 | ~~Chốt hạn mức duyệt lưu ở đâu~~ → **ĐÃ CHỐT**: bảng `approval_authorities` riêng (§5C.12) | — |
| 6 | Thêm CI check cấm hard-code mã vai trò | GĐ1 |
| 7 | Seed 5 vai trò + màn hình cho tenant tự tạo vai trò | GĐ3 |

**Lưu ý về mở rộng:** khi khách cần vai trò nghiệp vụ (kế toán, thủ kho), **không sửa tài liệu này và không viết thêm code**. Họ tạo vai trò trên UI, chọn permission + scope. Nếu việc thêm một vai trò đòi hỏi sửa code, đó là dấu hiệu ở đâu đó đã vi phạm luật §1.1.

Các bảng trên sẽ **không tràn ngang** vì chúng chỉ mô tả bộ seed cố định — vai trò khách tạo không bao giờ xuất hiện ở đây.
