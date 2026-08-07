# ADR-0001: Pin Prisma major 6 (6.19.x), chưa lên Prisma 7

- **Ngày:** 2026-08-07
- **Trạng thái:** Chấp nhận
- **Ảnh hưởng tới:** spec §2.3, §4.9, §12 mục 36

## Bối cảnh

Spec §4.9 yêu cầu pin major version của Prisma và ghi ADR, đồng thời cảnh báo
`$use` middleware bị loại bỏ. Tại thời điểm khởi tạo (08/2026), Prisma 7.9 đã ra:
`$use` **đã bị xoá hẳn**, generator mới `prisma-client` là mặc định, **bắt buộc
ESM** (`"type": "module"`) và **bắt buộc driver adapter** cho mọi CSDL.

## Quyết định

Pin **Prisma 6.19.x** (`"prisma": "6.19.3"`, `"@prisma/client": "6.19.3"` —
số cụ thể trong package.json, không dùng `^`).

## Phương án đã cân nhắc

- **Prisma 7.9** — bỏ vì kéo theo toàn bộ `apps/api` phải chạy ESM; NestJS 11 +
  ESM ít tài liệu, dễ vấp ở decorator/ts-node/test tooling. Rủi ro cao cho GĐ1.
- **Prisma 6** ✅ — CommonJS, generator `prisma-client-js`, không cần driver
  adapter. `$extends` query extension (thứ duy nhất kiến trúc này cần) hoạt động
  đầy đủ. Toàn bộ thiết kế tenancy/soft-delete/audit của spec dùng `$extends`,
  KHÔNG dùng `$use`, nên không dính deprecated API nào.

## Hệ quả

- Được: GĐ1 chạy trên nền đã kiểm chứng rộng rãi với NestJS.
- Mất: sẽ phải nâng lên v7 trong tương lai (EOL v6). Việc nâng là một PR riêng:
  chuyển ESM + thêm `PrismaPg` adapter + đổi generator; extension `$extends`
  giữ nguyên API.
- Kiểm chứng khi nâng: hành vi extension với nested write (§6.4) phải test lại
  trên đúng phiên bản mới — test #3a/#3b là lưới an toàn.

## Ghi chú kiểm chứng GĐ1 (08/2026)

- Query extension chỉ can thiệp query TOP-LEVEL — đúng như spec §6.4 mô tả.
  Nested create truyền `tenant_id` qua composite FK relation (Prisma tự set cột
  FK từ bản ghi cha) — test #3a xác nhận.
- `extendedWhereUnique` (cho phép field thường trong where của
  update/delete/findUnique) đã GA từ Prisma 5 — extension dựa vào nó để ghi đè
  `tenantId` trong mọi unique operation.
