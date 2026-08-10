# Boilerplate — Next.js + NestJS

Repo gốc để khởi tạo nhanh các hệ thống **quản trị và quản lý nghiệp vụ**: multi-tenant, phân quyền theo phạm vi dữ liệu, quy trình duyệt, kho hàng, audit đầy đủ.

---

## Đây là gì

Một **reference implementation** — bạn clone nó, xoá phần không cần, rồi sửa. Không phải thư viện để `npm install`.

**Xử lý sẵn** những bài toán lặp lại ở mọi dự án quản trị:

| | |
|---|---|
| Multi-tenant | Cách ly dữ liệu ở tầng DB, không dựa vào việc lập trình viên nhớ |
| Phân quyền | `resource:action` + scope `own`/`department`/`descendants`/`all`, cả cấp trường |
| Bảng dữ liệu | Sort/filter/phân trang phía server, đồng bộ URL, lưu cấu hình cột theo user |
| Chống N+1 | Test đếm query bắt buộc cho mọi endpoint danh sách |
| Import/Export | Chạy qua queue, báo lỗi từng dòng, resume được khi worker chết |
| Số dư & tồn kho | Movement append-only + snapshot, chống xuất âm bằng conditional UPDATE |
| Audit | Ai sửa gì, before/after, kèm DB trigger cho nhóm bảng nhạy cảm |
| Duyệt nhiều cấp | Luồng duyệt + hạn mức duyệt tách riêng, uỷ quyền khi vắng mặt |
| Nhất quán | Idempotency ba lớp, outbox pattern, optimistic locking |

## Đây không phải là gì

- Không phải framework có versioning — copy rồi sửa, không cập nhật ngược
- Không phải sản phẩm hoàn chỉnh — không có nghiệp vụ cụ thể nào
- Không trừu tượng hoá sớm: không có `BaseCrudService<T>` generic

---

## Chạy thử

```bash
# Yêu cầu: Node 22+, pnpm, Docker.  KHÔNG cần `make`.
git clone <repo> && cd <repo>
pnpm install        # cần trước, để có `pnpm bootstrap`
pnpm bootstrap          # .env · hạ tầng · deps · build shared · prisma · migrate · seed
pnpm dev            # web :3000 · api :4000 · swagger :4000/docs
```

`make setup` vẫn dùng được và chỉ gọi lại `pnpm bootstrap`. Đường chính là `pnpm`
vì `make` không có sẵn trên Windows.

Tài khoản seed: xem `apps/api/prisma/seed.ts`.

Nếu `pnpm bootstrap` mất **hơn 30 phút** thì đó là bug của repo — mở issue.
Job CI `onboarding` đo con số này trên máy sạch mỗi PR; vượt cam kết là CI đỏ.

> ⚠️ **Clone lần thứ hai trên cùng một máy**: mở `.env` và đổi
> `COMPOSE_PROJECT_NAME` sang tên khác. Để nguyên thì hai clone dùng chung
> container và **cùng một database** — clone sau sẽ ghi đè dữ liệu của clone
> trước mà không cảnh báo gì.

---

## Đọc gì, theo vai trò của bạn

| Bạn là | Đọc theo thứ tự |
|---|---|
| **Mới vào đội** | `README` → `docs/cookbook.md` → spec §1, §3, §6.5, §12 |
| **Sắp code một module** | `docs/cookbook.md` § tương ứng → spec §6.4, §8.2 → LLD của module đó |
| **Khởi tạo dự án mới từ repo này** | spec §11 (bảng cắt gọt) → `docs/permission-matrix.md` |
| **Rà soát kiến trúc** | spec §12 (mọi quyết định + lý do) |
| **Giao việc cho AI agent** | spec §1 + §3 + LLD module đó — **đừng ném cả file** |

## Bản đồ tài liệu

```
docs/
├── boilerplate-spec.md      Đặc tả kiến trúc (FROZEN v3.2) — nguồn sự thật
├── erd.md                   Sơ đồ quan hệ dữ liệu + phát hiện thiếu FK
├── permission-matrix.md     Vai trò seed × endpoint → test fixture cho test #8
├── working-agreement.md     Cách làm việc, phân công, định nghĩa "xong"
├── cookbook.md              Công thức thao tác hằng ngày ← đọc nhiều nhất
├── ownership.md             Ai đang sở hữu vùng code nào (cập nhật hằng tuần)
├── progress.md              Trạng thái theo giai đoạn
├── onboarding.md            Hướng dẫn người mới
└── adr/                     Quyết định thay đổi so với spec
```

**Quy tắc:** spec là nguồn sự thật duy nhất. Tài liệu khác **tham chiếu** tới nó, không chép lại nội dung.

### Chống lệch tài liệu

Khi sửa spec, kiểm tra xem có phải cập nhật kèm không. Sáu tài liệu tham chiếu chéo nhau là đã tới ngưỡng của đội 3 người — đừng thêm file thứ bảy nếu chưa thật cần.

| Sửa ở spec | Phải cập nhật kèm |
|---|---|
| §6.1 lược đồ, §6.5 ma trận | `erd.md` |
| §4.4 phân quyền, §4.4c cấp trường | `permission-matrix.md` |
| §8.2 test bắt buộc | `working-agreement.md` (định nghĩa "xong"), `progress.md` |
| Thêm luật kiến trúc mới | `cookbook.md` (bước + mục ⚠️), `working-agreement.md` §4 |
| §11 bảng cắt gọt | `README.md` |
| §12 quyết định | ADR mới trong `docs/adr/` |

**Khi nào viết tài liệu mới:** khi có người hỏi cùng một câu **lần thứ hai** và câu trả lời không nằm ở chỗ họ sẽ nghĩ tới để tìm. Hỏi lần đầu thì trả lời trực tiếp; lần hai thì thêm vào file đã có; chỉ khi không thuộc file nào mới tạo file mới.

---

## Cấu trúc thư mục

```
apps/
  api/     NestJS — API + Worker (cùng codebase, khác process)
  web/     Next.js — App Router cho layout/auth, client component cho màn nghiệp vụ
packages/
  api-client/   SINH TỰ ĐỘNG từ OpenAPI — không sửa tay
  shared/       Registry dùng chung FE+BE (xem dưới)
  vn/           Tiện ích Việt Nam: tỉnh/xã, CCCD, MST, đọc số thành chữ
tools/
  generators/   pnpm gen:module <tên>
```

### Registry dùng chung — `packages/shared`

Bảy danh mục mà **mọi module đều thêm vào**. Chúng là mã nguồn chứ không phải tài liệu, để trình biên dịch giữ cho đúng:

| File | Nội dung |
|---|---|
| `entity-types.ts` | Enum `EntityType` cho mọi quan hệ đa hình (`audit_logs`, `attachments`, `comments`…) |
| `error-codes.ts` | `DOMAIN.REASON` + ánh xạ HTTP status |
| `permissions.ts` | `resource:action`, tự sync xuống DB lúc khởi động |
| `audit-actions.ts` | Tên hành động cho timeline |
| `notification-types.ts` | Loại thông báo + kênh mặc định |
| `job-names.ts` | Tên queue + chính sách retry |
| `state-machines.ts` | Vòng đời mọi loại chứng từ |

---

## Năm quy tắc vàng

1. **Mọi write đi qua repository.** Không gọi Prisma client trực tiếp, không raw SQL ngoài tầng đó
2. **Bảng mới phải có dòng trong ma trận §6.5** và được phân loại tenancy — CI chặn nếu quên
3. **Bảng con phải có composite FK** `(tenant_id, parent_id)`
4. **Không rẽ nhánh theo mã vai trò.** Luôn kiểm `can('resource:action')`
5. **"Xong" = test tương ứng trong §8.2 xanh**, không phải "tôi đã push"

Chi tiết và cách CI thực thi: `docs/working-agreement.md` §4.

---

## Khởi tạo dự án mới từ repo này

```bash
git clone <repo> my-project && cd my-project
rm -rf .git && git init
```

Rồi làm theo **spec §11** — có bảng liệt kê từng module tuỳ chọn, lệnh xoá, và file cần sửa kèm.

Nhóm **không được cắt** vì không bổ sung sau được: multi-tenant, movement + dedup, audit, composite FK, PK của bảng partition.

---

## Trạng thái

| | |
|---|---|
| Đặc tả kiến trúc | ✅ FROZEN v3.2 — 62 quyết định |
| Giai đoạn hiện tại | 🔄 xem `docs/progress.md` |
| Test bắt buộc | 40 test, xem spec §8.2 |

## Đóng góp

Đọc `docs/working-agreement.md` trước khi mở PR đầu tiên. Tóm tắt: nhánh sống tối đa 2 ngày, PR dưới 400 dòng, 1 approve, `main` luôn xanh.
