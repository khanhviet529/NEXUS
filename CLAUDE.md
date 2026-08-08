# CLAUDE.md — Quy tắc cho AI agent

> Copy hoặc symlink thành `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md` tuỳ công cụ.
>
> **File này cố ý ngắn.** Rules dài bị pha loãng và bị bỏ qua. Chi tiết nằm ở `docs/boilerplate-spec.md`.

---

## 0. Điều quan trọng nhất

Dự án này có **62 quyết định kiến trúc đã chốt** ở spec §12. Nhiều quyết định **trái với cách làm phổ biến** mà bạn có trong dữ liệu huấn luyện. Khi thấy code ở đây "làm lạ", đó là cố ý — tra spec trước khi sửa.

**Không bao giờ "giúp đơn giản hoá" bằng cách bỏ một ràng buộc.**

---

## 1. Đọc gì trước khi bắt đầu

**Đừng đọc cả spec** (2.500+ dòng, phí context). Đọc đúng mục theo loại việc:

| Việc | Đọc bắt buộc |
|---|---|
| Bất kỳ việc gì | `docs/cookbook.md` (mục lục) + §12 |
| Thêm/sửa bảng, migration | §6.1 §6.2 §6.4 §6.5 + `docs/erd.md` |
| Endpoint mới | §3 (contract) §4.4 + `docs/permission-matrix.md` |
| Phân quyền | §4.4 §4.4b §4.4c |
| Auth, session, token | §4.3 §4.3b §4.3c §4.3d |
| Kho, tồn, số dư | §5B.2/B4 |
| Job nền, event | §4.8 |
| Import/export | §4.7 §5B.3/C1 |
| Màn hình, component | §5.4 §5.5 §5.7 §5.8 §5.9 |
| i18n, tìm kiếm không dấu | §3.10 |
| Viết test | §8.2 |

**Có sẵn công thức thì làm theo công thức.** `docs/cookbook.md` có 13 công thức từng bước cho các việc lặp lại.

---

## 2. Vòng lặp bắt buộc

Không được bỏ bước nào, không được đảo thứ tự.

```
1. Đọc mục spec liên quan (bảng trên)
2. Tìm code mẫu: module `orders` là module [REF] chuẩn — copy pattern từ đó
3. Viết code
4. CHẠY:  pnpm typecheck  &&  pnpm lint  &&  pnpm test <phạm vi liên quan>
5. Đỏ → sửa → quay lại bước 4. KHÔNG đi tiếp khi còn đỏ
6. Việc chạm DB/quyền/tenant → chạy thêm:  pnpm test tenancy && pnpm test permission
7. Báo cáo theo mẫu ở §5
```

**Chưa chạy được lệnh ở bước 4 thì chưa xong.** Không nói "code này sẽ chạy" hay "logic đã đúng" — dán **output thật**.

---

## 3. Cấm tuyệt đối

Đây là những lỗi AI hay mắc **trên đúng dự án này**. Mỗi dòng đều có lý do ở spec.

| ❌ Cấm | ✅ Thay bằng | Vì sao |
|---|---|---|
| `prisma.x.findMany()` ngoài repository | Gọi qua repository | Extension không inject tenant, audit không thấy (§4.9) |
| `prisma.$use()` middleware | `$extends` query extension | Đã deprecated/bị bỏ (§4.9) |
| Write nghiệp vụ mà **không** ghi audit | `AuditRepository.writeInTx(tx, …)` trong CÙNG transaction | Audit là tường minh (ADR-0004). CI `check-audit-coverage` chặn |
| `action: 'CHUOI_TU_CHE'` | Hằng trong `audit-actions.ts` | Timeline §4.9 phải đọc được. Kiểu `AuditAction` + CI chặn |
| `unaccent()` trong `CREATE INDEX` hoặc generated column | Cột `*_search` chuẩn hoá ở tầng ứng dụng | `unaccent` không IMMUTABLE → DDL lỗi (§3.10) |
| `if (role === 'ACCOUNTANT')` | `can('invoice:approve')` | Vai trò là dữ liệu, không phải mã (§4.4). CI chặn |
| `BaseCrudService<T>` generic | Copy module `orders` rồi sửa | §1.2 cấm trừu tượng hoá sớm |
| Bảng con không có `tenant_id` | Có `tenant_id` + composite FK | §6.4 |
| Bỏ `tenant_id` "cho gọn" | Giữ nguyên | Rò rỉ dữ liệu chéo tenant |
| `UNIQUE` không chứa khoá partition trên bảng partition | Bảng dedup riêng | Postgres từ chối (§5B.2/B4) |
| Lọc quyền **sau** khi query | Nhúng vào `WHERE` | Lọc sau làm sai phân trang (§4.4) |
| Tự nghĩ tên permission | Lấy từ `packages/shared/src/permissions.ts` | Registry là nguồn duy nhất |
| Tự nghĩ mã lỗi | Lấy từ `error-codes.ts` | |
| Số tiền kiểu `number` | Decimal dạng chuỗi | §3.7 |
| BE trả ngày đã format | UTC ISO-8601 | §3.7 |
| `z-index: 50` rời rạc | Token trong `--z-*` | §5.7 |
| Viết type response API bằng tay | `pnpm gen:api` sinh từ OpenAPI | §2.4 |
| Sửa `packages/api-client` | Sửa Swagger ở BE rồi sinh lại | Sinh tự động |
| `localStorage` cho token | httpOnly cookie | §4.3b |

---

## 4. Dừng lại và hỏi khi

Không đoán trong những trường hợp sau — dừng, nêu vấn đề, đề xuất phương án:

- Việc cần **đổi một quyết định ở §12** → cần ADR, không tự quyết
- Bảng cần dùng **chưa có trong ma trận §6.5**
- Không rõ scope nên là `own` / `department` / `descendants` / `all`
- Spec **mâu thuẫn với chính nó** hoặc với code hiện có
- Cần thêm phụ thuộc mới vào `package.json`
- Migration có nguy cơ **mất dữ liệu** hoặc khoá bảng lớn
- Việc chạm `tenant_id`, `movements`, `stock_balances`, hoặc bảng phân quyền theo cách spec chưa mô tả

**Đoán bừa ở bảy trường hợp trên tốn nhiều thời gian hơn hỏi.**

---

## 5. Mẫu báo cáo

Kết thúc mỗi việc, báo đúng cấu trúc này:

```markdown
## Đã làm
- <thay đổi 1> (file:dòng)
- <thay đổi 2>

## Spec đã tra
§6.4, §4.4b

## Lệnh đã chạy
$ pnpm typecheck
<dán output thật>

$ pnpm test orders
<dán output thật — bao nhiêu pass/fail>

## Chưa làm / cần người quyết
- <nếu có>

## Rủi ro
- <nếu có, ví dụ: chưa test với dữ liệu lớn>
```

**Không viết "đã test kỹ", "hoạt động tốt", "sẵn sàng production".** Chỉ dán output.

Nếu không chạy được lệnh (không có quyền, thiếu môi trường) thì **nói rõ là chưa chạy**, đừng suy đoán kết quả.

---

## 6. Định nghĩa "xong"

Chỉ được coi là xong khi đủ **cả năm**:

- [ ] `pnpm typecheck` xanh
- [ ] `pnpm lint` xanh
- [ ] Test §8.2 tương ứng xanh (nếu hạng mục có test bắt buộc)
- [ ] Không vi phạm bảng cấm ở §3
- [ ] Spec đã cập nhật nếu code khác spec

Thiếu một mục → báo là **chưa xong**, nêu rõ thiếu gì.

---

# Phụ lục — Mẫu prompt giao việc

## A. Thêm module mới

```
Thêm module <TÊN> theo docs/cookbook.md §2.

Nghiệp vụ: <mô tả 2-3 câu>
Trường chính: <danh sách>
Vòng đời: <DRAFT → ... nếu có>
Quyền: <ai được làm gì>

Yêu cầu:
- Đọc §6.2 §6.4 §6.5 trước khi viết schema
- Copy pattern từ modules/orders
- Chạy pnpm test tenancy && pnpm test permission trước khi báo xong
- Báo cáo theo mẫu CLAUDE.md §5
```

## B. Sửa lỗi

```
Lỗi: <mô tả + output lỗi thật>
File nghi ngờ: <nếu biết>

Yêu cầu:
- Tìm nguyên nhân gốc trước, đừng vá triệu chứng
- Nếu là rò rỉ tenant → theo checklist cookbook §12
- Viết test tái hiện lỗi TRƯỚC khi sửa
- Chạy full test suite sau khi sửa
```

## C. Review code

```
Review <đường dẫn> theo:
1. Bảng cấm CLAUDE.md §3
2. Quy ước spec §7
3. Rò rỉ tenant: có query nào bỏ qua repository không?
4. N+1: endpoint list có test đếm query chưa?
5. Field-level: cột nhạy cảm có ẩn ở cả 4 nơi không? (§4.4c)

Chỉ nêu vấn đề THẬT, không nêu ý kiến về phong cách.
```

## D. Viết test

```
Viết test cho <hạng mục>, tương ứng test #<số> ở spec §8.2.

- Fixture BẮT BUỘC có 2 tenant
- Kiểm cả mã HTTP LẪN phạm vi dữ liệu trả về
- Test concurrency phải chạy song song thật (Promise.all), không tuần tự
- Chạy và dán output
```

---

## Ba câu nhắc cuối

1. **Code trong repo này thắng dữ liệu huấn luyện của bạn.** Thấy lạ thì tra spec, đừng "sửa cho đúng chuẩn".
2. **Copy `modules/orders` là cách nhanh nhất và ít sai nhất.** Nó là module [REF] tồn tại để làm khuôn.
3. **Chưa dán được output test thì chưa xong.**
