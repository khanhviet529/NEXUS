# CHECKLIST HOÀN THIỆN CHỨC NĂNG (~99% FE + trả nợ code)

| | |
|---|---|
| **Ngày lập** | 2026-08-11 · **rev 2** sau review chéo — các phán quyết ở §Nhật ký cuối file |
| **Căn cứ** | `progress.md` (nợ đã ghi sổ) · `SWEEP-REPORT.md` C0 (F-05, F-07) · kiểm kê màn hình thực tế (7 trang / 24 module BE) |
| **Ước lượng tổng** | ~6–8 ngày làm việc, chia PR theo Ý NGHĨA (bài học PR #12) |
| **Ngoài phạm vi** | B8 CD (cần hạ tầng thật của người dùng) · SSO/2FA · comments §5C.6 · offline (đã cắt có chủ đích, ghi ở progress.md GĐ10) |

## Luật chung cho MỌI mục

- [ ] Mỗi màn mới **kèm test/story trong CÙNG PR** — check #6 `check-fe-test-coverage` đỏ nếu thiếu
- [ ] Màn nào đụng endpoint thiếu `@ApiOkResponse` → **vá Swagger BE trong cùng PR** rồi `pnpm gen:api` (nợ GĐ8b)
- [ ] Component mới phải **nối vào màn hình thật** (check #11), không được chỉ sống ở preview
- [ ] Trước khi báo xong: `run-all.mjs` 9/9 · typecheck · lint · vitest BE+FE · e2e liên quan
- [ ] Check MỚI (`check-cut-table`, #11 khi chuyển sang chặn) phải chứng minh BA thuộc tính: **phải chạy** (không im lặng bỏ qua) · **phải đúng** (có negative control) · **phải sửa được theo** (thông báo lỗi chỉ ra cách sửa)

---

## Phase 1 — A2 (V9–V14): làm xanh check #11 *(~2–3 ngày, PR theo từng V)*

> Đích đo được: độ phủ pattern 3/15 → **13/15**; check #11 chuyển ADVISORY → `checks`.

- [x] **V9** `orders/[id]` chi tiết 4 tab: thông tin (DetailLayout — gỡ vi phạm #11) · items (bảng con) · AuditTimeline · file đính kèm
- [x] **V10** `products` sinh qua `pnpm gen:module` (dogfood generator) — trong lúc làm, **vá luôn 3 bước thiếu của checklist generator**: nhắc build `@nexus/shared` · nhắc gán quyền vào `seed-roles.ts` · liệt kê cột `*_search`
- [x] **V11** Nối FilterBar (gỡ vi phạm #11) + ExportDialog + saved-views vào trang `orders`
- [x] **V12** Trang `audit-logs` (tra cứu, filter theo entity/actor/khoảng ngày) + trang `settings` (đọc/ghi theo quyền `setting:update`)
- [x] **V13** Notification dropdown (đọc + đánh dấu đã đọc) · recent/favorites vào Cmd+K · StatusBadge vào orders list (gỡ vi phạm #11 cuối)
- [x] **V14** SỬA dark-chroma TRƯỚC (`--brand-c-preset` + `calc(... - 0.02)` ở dark — inline không được thắng stylesheet), RỒI chụp lại toàn bộ baseline MỘT LẦN (cả `-linux` lẫn `-win32`) + a11y 2 tổ hợp cho màn mới *(gộp từ Phase 5 cũ — hai việc cùng đòi chụp baseline, tách ra là chụp hai lần)*
- [x] Chuyển check #11 từ `ADVISORY` sang `checks` trong `run-all.mjs` — **điều kiện đóng Phase 1**

## Phase 2 — Màn quản trị CORE còn thiếu *(~2 ngày, 2 PR)*

- [ ] **PR 2a**: `roles` (danh sách + tạo vai trò từ permission×scope — UI cho quyết định #61) · `org-units` (cây, tạo/sửa/di chuyển, cảnh báo "đổi cây huỷ cache quyền toàn tenant")
- [ ] **PR 2b**: `admin/tenants` (sysadmin: tạo/suspend/features — chỉ hiện khi có `system:cross_tenant`) · `tenants/current` branding · `me/sessions` (thiết bị đăng nhập + thu hồi)

## Phase 3 — Luồng auth còn thiếu UI *(~0,5 ngày, 1 PR)*

- [ ] `forgot-password` → `reset-password` (đủ vòng: nhập email → 202 → link token → đặt mật khẩu)
- [ ] `accept-invitation` (đặt mật khẩu lần đầu / email đã tồn tại)
- [ ] Switch-tenant từ header (user nhiều membership) — gọi `POST /auth/switch-tenant`, reload

## Phase 4 — Reports · Inventory · Import wizard *(~1,5 ngày, 2 PR)*

- [ ] **PR 4a**: trang `reports` — render ĐỘNG từ `GET /reports/:id/meta` (form filter tự sinh theo `params`, bảng + dòng tổng theo `columns`, drill-down là link thật, nút export). Đây là phép thử "khai báo báo cáo mới < 2 giờ" của A1 ở phía FE. **Ranh giới chống form-builder**: form CHỈ switch trên union ĐÓNG `ReportParamType` (4 loại: dateRange · select · orgUnit · text) — muốn loại mới phải sửa type ở BE trước, FE đỏ compile
- [ ] **PR 4b**: trang `inventory` (balances + form nhập/xuất kho, hiện lỗi `STOCK.INSUFFICIENT` tử tế) · Import wizard nối job thật (upload rows → poll `import-jobs/:id` → bảng lỗi từng dòng + tải lại)

## Phase 5 — Trả nợ kỹ thuật đã ghi sổ *(~1 ngày, 3 PR nhỏ)*

- [ ] ~~B7~~ **ĐÍNH CHÍNH (rev 2)**: B7 ĐÃ merge vào main (commit `9ce5796`, `features/saved-views/` có sẵn) — dòng "chưa mở PR" trong progress.md là số liệu ôi. Việc còn lại: xoá nhánh remote `feat/saved-views-b7` + sửa dòng progress.md
- [ ] ~~Dark chroma~~ → ĐÃ GỘP vào V14 (Phase 1) — tránh chụp baseline hai lần
- [ ] **Image 1,17GB**: `pnpm deploy --prod` hoặc prune devDependency ở tầng runtime của Dockerfile; đích < 400MB, đo bằng `du -sh` in trong CI

## Phase 6 — Tài liệu-là-sản-phẩm + quét phủ *(~1 ngày)*

- [ ] **V5**: sinh lại bảng cắt gọt §11 cho ĐỦ 24 module BE (sửa F-05: 5/8 dòng trỏ đường dẫn không tồn tại; F-07: sót 9 module) + `check-cut-table.mjs` đối chiếu bảng ↔ thư mục thật để không lệch lần nữa
- [ ] **V7**: chạy tiếp quét phủ C0.4 → C0.6 (tầng interceptor), phát hiện mới đánh số từ **F-17**, ghi vào SWEEP-REPORT
- [ ] Cập nhật `progress.md` + `onboarding.md` sau mỗi phase

---

## Thứ tự khuyến nghị & lý do

1 → 2 → 3 → 4 → 5 → 6. Phase 1 đi đầu vì nó vừa tăng độ phủ nhanh nhất vừa
biến check #11 thành lưới chặn — mọi màn làm ở Phase 2–4 sau đó được lưới này
canh tự động. Phase 5–6 để cuối vì độc lập, không chặn ai.

## Định nghĩa "99% xong"

- [ ] Mọi module BE có màn hình FE tương ứng HOẶC dòng ghi rõ "API-only, màn hình thuộc dự án cụ thể" trong bảng cắt gọt §11
- [ ] Check #11 nằm trong `checks` (chặn), 0 vi phạm
- [ ] 10/10 check xanh (9 hiện có + `check-cut-table`)
- [ ] Toàn bộ suite BE + FE + e2e + a11y + visual xanh trên CI
- [ ] `progress.md` không còn dòng ⏳ nào ngoài B8 (chờ hạ tầng) và các mục đã CẮT có chủ đích

---

## Nhật ký rev 2 (2026-08-11) — phán quyết sau review chéo

Review chéo nêu 8 điểm. Mỗi điểm được KIỂM TRÊN ĐĨA trước khi nhận/bác:

| Điểm review nêu | Phán quyết | Bằng chứng kiểm chứng |
|---|---|---|
| "Thiếu Phase 0 (V1–V4), 4 BLOCKER còn nguyên" | **BÁC** | V1–V4 đã merge (PR #22 = HEAD `7d6eb0e`): `docker-compose.dev.yml:7` là `${COMPOSE_PROJECT_NAME:-nexus-dev}` (biến, không hardcode); `tools/setup.mjs` tồn tại và chạy được; job `onboarding` ở `ci.yml:221` xanh 8/8. Grep thấy "nexus-dev" là DEFAULT của biến — dương tính giả |
| "F-17 phải là F-13" | **BÁC** | F-13…F-16 đã tiêu ở V1–V4 — progress.md ghi tường minh "Phát hiện mới đánh số từ F-17" |
| Cắt pilot GĐ C vào giữa (sau Phase 4a) | **TREO** | `pilot-spec-purchase.md` mà review trích dẫn (§5.1, §7) KHÔNG tồn tại trong repo, mọi nhánh (`find` rỗng). Ý tưởng build→dùng→học là đúng hướng; chỉ đổi thứ tự khi có file spec pilot thật hoặc người dùng chốt phạm vi pilot |
| Dark-chroma gộp vào V14 | **NHẬN** — lỗi thật của rev 1 | Hai mục cùng đòi chụp lại baseline; tách là chụp hai lần |
| B7 trùng V11 | **NHẬN một nửa** | Mơ hồ có thật, nhưng lời giải khác review: B7 ĐÃ merge (`9ce5796`, `features/saved-views/` trong main) — mục "mở PR B7" của rev 1 mới là chỗ sai. progress.md dòng B7 là số liệu ôi |
| Giới hạn "3 loại param" trang reports | **NHẬN tinh thần, SỬA số** | `report.types.ts`: union đóng có **4** loại (dateRange · select · orgUnit · text) |
| Ba thuộc tính của check | **NHẬN** | Thêm vào Luật chung |
| Ước lượng 11–14 ngày thay 6–8 | **NHẬN MỘT PHẦN** | Giữ 6–8 ngày (Phase 0 của review đã xong từ trước; 5 ngày pilot chưa xác minh) nhưng cộng biên độ +30% theo bằng chứng PR #12 từng vượt ước lượng ~19 lần |

**Bài học chung cho CẢ hai văn bản**: mỗi bên dính đúng một lỗi số-liệu-ôi
(review: trạng thái V1–V4 · checklist rev 1: trạng thái B7). Quy tắc rút ra:
mọi khẳng định "X chưa làm" trong tài liệu kế hoạch phải kèm lệnh kiểm chứng
chạy lại được — như cột "Bằng chứng" của bảng này.
