# COOKBOOK

> Công thức cho những việc bạn làm nhiều lần. Mỗi công thức là **các bước cụ thể**, không phải giải thích — giải thích nằm ở `boilerplate-spec.md`.
>
> **Cách dùng:** làm theo đúng thứ tự, đọc kỹ phần **⚠️ Đừng quên** ở cuối mỗi công thức. Phần đó chính là chỗ mọi người hay bỏ sót.

## Mục lục

**Hằng ngày** — [Thêm bảng](#1-thêm-một-bảng-mới) · [Thêm module CRUD](#2-thêm-một-module-crud-hoàn-chỉnh) · [Thêm trường](#3-thêm-một-trường-vào-entity-đã-có) · [Thêm permission](#4-thêm-một-permission-mới) · [Thêm mã lỗi](#5-thêm-một-mã-lỗi)

**Theo tính năng** — [Thêm action](#6-thêm-một-action-vào-registry) · [Thêm báo cáo](#7-thêm-một-báo-cáo) · [Thêm job nền](#8-thêm-một-job-nền) · [Thêm chứng từ có số](#9-thêm-loại-chứng-từ-có-đánh-số)

**Kiểm thử & gỡ lỗi** — [Test quyền](#10-viết-test-ma-trận-quyền) · [Test đếm query](#11-viết-test-đếm-query) · [Nghi ngờ rò rỉ tenant](#12-nghi-ngờ-rò-rỉ-tenant) · [Query chậm](#13-endpoint-danh-sách-chậm)

---

# 1. Thêm một bảng mới

Đây là công thức quan trọng nhất — bỏ sót một bước là tạo lỗ hổng cách ly dữ liệu.

```
1. Phân loại tenancy      → GLOBAL | HYBRID | TENANT   (spec §4.4b)
2. Chọn tầng base         → Global | Tenant | Business (spec §6.2)
                             + SoftDelete nếu cần
3. Viết model trong schema.prisma
   - KHÔNG khai lại cột đã có trong base
   - Bảng con: thêm tenant_id + composite FK
4. Thêm vào TENANCY_POLICY (packages/shared hoặc api/src/common)
   - nếu quên → app không khởi động, CI đỏ
5. Nếu có deleted_at → thêm vào SOFT_DELETE_MODELS
6. Thêm MỘT DÒNG vào ma trận spec §6.5
7. Cập nhật docs/erd.md nếu bảng có quan hệ mới
8. Thêm vào EntityType enum nếu bảng này sẽ bị tham chiếu đa hình
   (audit, attachment, comment, saved_view…)
9. pnpm prisma migrate dev --name add_<ten_bang>
10. Chạy: pnpm test tenancy
```

**Composite FK cho bảng con** — bảng cha phải có unique làm đích:

```sql
ALTER TABLE orders      ADD CONSTRAINT orders_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE order_items ADD CONSTRAINT order_items_order_fk
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id);
```

**⚠️ Đừng quên**
- Unique trên bảng soft delete phải là **partial + composite**: `UNIQUE (tenant_id, code) WHERE deleted_at IS NULL`
- Mọi FK phải có index
- Cột nào vào whitelist sort thì cột đó phải có index
- Bảng dự kiến > 10 triệu dòng → cân nhắc partition **ngay**, và nhớ PK phải chứa khoá phân vùng

---

# 2. Thêm một module CRUD hoàn chỉnh

```bash
pnpm gen:module invoice --base=business --soft-delete
```

Generator sinh ra BE (module, controller, service, repository, DTO, test) và FE (list, detail, form, actions, columns). Sau đó:

```
1. Sửa schema.prisma theo công thức #1
2. Khai permission trong packages/shared/src/permissions.ts
     invoice:read  invoice:create  invoice:update  invoice:delete
3. Điền filter/sort whitelist trong <module>.query.ts
     ⚠️ chỉ đưa vào cột ĐÃ CÓ INDEX và người dùng ĐƯỢC PHÉP xem
4. Khai state machine trong packages/shared/src/state-machines.ts (nếu có vòng đời)
5. Khai @References cho delete guard (spec §5B.1/A2)
6. Khai action audit ở packages/shared/src/audit-actions.ts (ADR-0004)
     mọi write gọi audit.writeInTx(tx, …) TRONG CÙNG transaction nghiệp vụ;
     action mang NGỮ NGHĨA (SUBMIT/APPROVE…), không dùng chuỗi tự do
7. Viết actions.ts theo Action Registry (công thức #6)
8. Thêm vào sidebar config kèm permission
9. pnpm gen:api    ← sinh lại api-client từ OpenAPI
10. Viết test: ma trận quyền (#10) + đếm query (#11) + audit nguyên tử (#31)
```

**⚠️ Đừng quên**
- Nếu chưa từng làm module nào: **copy `modules/orders`** và đọc kỹ, đó là module [REF] mẫu
- Endpoint danh sách **bắt buộc** có test đếm query, nếu không CI đỏ
- Mỗi endpoint phải có `@RequirePermission`, CI quét và chặn nếu thiếu
- Module có endpoint ghi mà không tham chiếu `AuditRepository` → CI đỏ (ADR-0004)

---

# 3. Thêm một trường vào entity đã có

```
1. schema.prisma → thêm cột (nullable hoặc có default, để migration không khoá bảng)
2. Cập nhật CreateDto + UpdateDto + ResponseDto
3. Nhạy cảm? → gắn @Expose({ groups: [...] }) và thêm dòng vào permission-matrix.md §4
4. Cần lọc/sắp xếp? → thêm vào whitelist + TẠO INDEX
5. Đa ngôn ngữ? → kiểu jsonb + cột <field>_<locale>_search + index (spec §3.10)
6. pnpm gen:api
7. Cập nhật FE: columns.tsx, schema.ts (zod), form
```

**⚠️ Đừng quên**
- Thêm cột nhạy cảm mà quên serializer group → nó xuất hiện trong **export Excel** và **audit diff**
- Cột đa ngôn ngữ phải cập nhật cột `_search` ở **repository**, không phải generated column (spec §3.10)
- Migration trên bảng lớn: dùng nullable + backfill theo batch, đừng `ALTER TABLE ... SET NOT NULL` một phát

---

# 4. Thêm một permission mới

```
1. packages/shared/src/permissions.ts
     { code: 'invoice:approve', resource: 'invoice', action: 'approve' }
2. Khởi động lại API → tự sync xuống bảng permissions
3. Gán vào vai trò seed: apps/api/prisma/seed.ts
4. Thêm dòng vào docs/permission-matrix.md
5. Thêm dòng vào MATRIX trong permission-matrix.spec.ts
6. Dùng: @RequirePermission('invoice:approve') ở controller
7. FE: useCan('invoice:approve') để bật/tắt nút
```

**⚠️ Đừng quên**
- Permission cần scope? Scope khai ở `role_permissions`, không ở permission
- **Không bao giờ** `if (role === 'ACCOUNTANT')`. CI quét và chặn
- FE chỉ ẩn/disable cho đẹp; chặn thật là việc của guard BE

---

# 5. Thêm một mã lỗi

```
1. packages/shared/src/error-codes.ts
     'INVOICE.ALREADY_ISSUED': { status: 409, message: 'Hoá đơn đã phát hành' }
2. Ném: throw new AppException('INVOICE.ALREADY_ISSUED')
3. FE xử lý theo code, KHÔNG theo message
4. Cần i18n message? → thêm key vào apps/web/messages/{vi,en}.json
```

**⚠️ Đừng quên**
- Quy ước `DOMAIN.REASON`, chữ hoa
- Lỗi nghiệp vụ → `409`. Dữ liệu không hợp lệ → `422`. Đừng dùng `400` cho nghiệp vụ
- Không tồn tại **hoặc ngoài phạm vi dữ liệu** đều trả `404` — không tiết lộ sự tồn tại

---

# 6. Thêm một action vào registry

```ts
// features/invoices/actions.ts
{
  id: 'invoice.issue',
  label: 'Phát hành',
  icon: Send,
  group: '1-workflow',
  permission: 'invoice:issue',
  enabled: ({ record, me }) =>
    record.status !== 'DRAFT'  ? 'Chỉ phát hành được hoá đơn nháp'
    : record.items.length === 0 ? 'Hoá đơn chưa có dòng nào'
    : true,
  confirm: ({ record }) => ({ title: `Phát hành ${record.code}?` }),
  run: ({ record }) => api.invoices.issue(record.id),
  success: 'Đã phát hành',
  invalidates: ({ record }) => [['invoices'], ['invoices', record.id]],
}
```

**⚠️ Đừng quên**
- `permission` thiếu → **ẩn hẳn**. `enabled` trả string → **disable + tooltip lý do**. Đừng dùng lẫn
- Action nguy hiểm: thêm `variant: 'danger'` và `confirm.typeToConfirm`
- Không vừa khuôn thì dùng cửa thoát `render?: (ctx) => ReactNode`

---

# 7. Thêm một báo cáo

```ts
defineReport({
  id: 'invoice-by-month',
  name: 'Doanh thu theo tháng',
  permission: 'report:invoice',
  params: [dateRange('period'), orgUnit()],
  query: (p, ability) => kysely.selectFrom('invoices')
    .where('tenant_id', '=', p.tenantId)
    .where(ability.scopeWhere('invoice'))   // ⚠️ bắt buộc
    ...,
  columns: [{ key: 'revenue', label: 'Doanh thu', type: 'money', summary: 'sum' }],
  drilldown: (row) => `/invoices?filter[month][eq]=${row.month}`,
})
```

**⚠️ Đừng quên**
- **Áp `ability.scopeWhere()`** — báo cáo là đường rò rỉ dữ liệu hay bị quên nhất
- **Áp cả field-level permission** — cột giá vốn phải ẩn theo quyền, kể cả trong báo cáo
- Dùng Kysely hoặc raw SQL, **không** dùng Prisma cho báo cáo tổng hợp
- Kysely chỉ để **đọc**. Ghi bằng Kysely không đi qua audit extension
- Cắt ngày theo `X-Timezone` của request, không theo giờ server

---

# 8. Thêm một job nền

```
1. packages/shared/src/job-names.ts → khai tên queue + retry policy
2. apps/api/src/modules/<module>/jobs/<ten>.processor.ts
3. Job phải IDEMPOTENT — mặc định hệ thống là at-least-once
4. Payload BẮT BUỘC chứa tenantId; worker set CLS trước khi chạy
5. Cron? → thêm redlock, nếu không chạy 2 instance sẽ chạy đôi
6. Có tác dụng phụ ngoài DB? → phát qua outbox, không gọi trực tiếp
```

**⚠️ Đừng quên**
- Job dài phải cập nhật `progress` để FE hiển thị
- Job xử lý theo lô: mỗi lô một transaction + checkpoint, không một transaction cho cả job
- `actorId` trong CLS đặt là `system:<jobName>` để audit truy được

---

# 9. Thêm loại chứng từ có đánh số

```
1. Khai prefix trong settings: 'sequence.INVOICE.prefix' = 'HD'
2. Cấp số bằng atomic UPSERT, TRONG CÙNG transaction tạo chứng từ:
```

```sql
INSERT INTO document_sequences (tenant_id, key, year, current_value)
VALUES (:tenantId, 'INVOICE', :year, 1)
ON CONFLICT (tenant_id, key, year)
DO UPDATE SET current_value = document_sequences.current_value + 1
RETURNING current_value;
```

**⚠️ Đừng quên**
- **Không** tách việc cấp số ra ngoài transaction để "tối ưu" — sẽ tạo lỗ hổng số. Kế toán VN yêu cầu số liên tục
- `UNIQUE (tenant_id, document_type, document_number)` là lớp chống trùng cuối cùng
- Chứng từ huỷ vẫn giữ số, không tái sử dụng

---

# 10. Viết test ma trận quyền

```ts
const MATRIX = [
  ['STAFF',   'GET',  '/invoices',             200, 'own'],
  ['STAFF',   'POST', '/invoices/:id/issue',   403, null],
  ['MANAGER', 'POST', '/invoices/:id/issue',   200, 'desc'],
] as const

describe.each(MATRIX)('%s %s %s', (role, method, path, status, scope) => {
  it(`→ ${status}`, async () => { /* ... */ })
  if (scope) it(`chỉ trả dữ liệu trong scope ${scope}`, async () => { /* ... */ })
})
```

**⚠️ Đừng quên**
- Kiểm **hai** thứ: mã HTTP **và** phạm vi dữ liệu. Trả `200` kèm dữ liệu ngoài scope nguy hiểm hơn trả `403` sai
- Fixture phải có **hai tenant** — một tenant thì test cách ly vô nghĩa
- Có ngoại lệ sysadmin thì phải test luôn, đừng chỉ trừ bỏ

---

# 11. Viết test đếm query

```ts
it('GET /invoices không N+1', async () => {
  await seedInvoices(50)
  await expectQueryCount(3, () => request(app).get('/api/v1/invoices?limit=50'))
})
```

**⚠️ Đừng quên**
- Seed **nhiều** bản ghi (≥ 20). Với 1 bản ghi thì N+1 không lộ
- Số query kỳ vọng đặt **cứng**, đừng đặt khoảng. Tăng lên thì phải sửa test một cách có ý thức
- Cảnh giác bẫy ngược: `include` 8 bảng có thể chậm hơn N+1. Chạy `EXPLAIN ANALYZE`

---

# 12. Nghi ngờ rò rỉ tenant

```
1. Chạy: pnpm test tenancy            → test #1, #2 có đỏ không?
2. Query đó đi qua repository hay gọi thẳng Prisma?
     → gọi thẳng thì extension không inject tenant
3. Có raw SQL không? → raw SQL KHÔNG được inject tenant, phải tự thêm WHERE
4. Nested write? → extension không xử lý nested, repository phải chuẩn hoá args
5. Model có trong TENANCY_POLICY chưa? Phân loại đúng chưa?
6. Bảng con có composite FK chưa? Không có thì DB không chặn được
7. Cache Redis: key có tiền tố t:<tenantId>: chưa?
8. Job BullMQ: payload có tenantId chưa? Worker set CLS chưa?
```

Chín trên mười lần nguyên nhân nằm ở bước 2, 3 hoặc 4.

---

# 13. Endpoint danh sách chậm

```
1. Bật log query, đếm số query   → nhiều bất thường thì là N+1
2. EXPLAIN ANALYZE câu chính     → có Seq Scan trên bảng lớn không?
3. Cột đang sort/filter đã có index chưa?
4. Cột JSONB đa ngôn ngữ: index có khớp ĐÚNG biểu thức resolveLocaleExpr() không?
     COALESCE(name->>'en', name->>'vi') phải khớp index tương ứng,
     lệch một chút là planner bỏ qua index
5. COUNT(*) chậm? → bảng rất lớn thì cân nhắc cursor pagination
6. include quá tay? → chỉ select cột thực sự dùng
```

---

# Khi công thức không có ở đây

1. Tra `boilerplate-spec.md` — mục lục ở đầu file
2. Xem module `orders` [REF] làm thế nào
3. Hỏi trong nhóm
4. **Làm xong thì thêm công thức vào file này** — nếu bạn phải hỏi thì người sau cũng sẽ phải hỏi
