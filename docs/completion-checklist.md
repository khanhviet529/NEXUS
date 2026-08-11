# CHECKLIST HOÀN THIỆN CHỨC NĂNG (~99% FE + trả nợ code)

| | |
|---|---|
| **Ngày lập** | 2026-08-11 |
| **Căn cứ** | `progress.md` (nợ đã ghi sổ) · `SWEEP-REPORT.md` C0 (F-05, F-07) · kiểm kê màn hình thực tế (7 trang / 24 module BE) |
| **Ước lượng tổng** | ~6–8 ngày làm việc, chia PR theo Ý NGHĨA (bài học PR #12) |
| **Ngoài phạm vi** | B8 CD (cần hạ tầng thật của người dùng) · SSO/2FA · comments §5C.6 · offline (đã cắt có chủ đích, ghi ở progress.md GĐ10) |

## Luật chung cho MỌI mục

- [ ] Mỗi màn mới **kèm test/story trong CÙNG PR** — check #6 `check-fe-test-coverage` đỏ nếu thiếu
- [ ] Màn nào đụng endpoint thiếu `@ApiOkResponse` → **vá Swagger BE trong cùng PR** rồi `pnpm gen:api` (nợ GĐ8b)
- [ ] Component mới phải **nối vào màn hình thật** (check #11), không được chỉ sống ở preview
- [ ] Trước khi báo xong: `run-all.mjs` 9/9 · typecheck · lint · vitest BE+FE · e2e liên quan

---

## Phase 1 — A2 (V9–V14): làm xanh check #11 *(~2–3 ngày, PR theo từng V)*

> Đích đo được: độ phủ pattern 3/15 → **13/15**; check #11 chuyển ADVISORY → `checks`.

- [ ] **V9** `orders/[id]` chi tiết 4 tab: thông tin (DetailLayout — gỡ vi phạm #11) · items (bảng con) · AuditTimeline · file đính kèm
- [ ] **V10** `products` sinh qua `pnpm gen:module` (dogfood generator) — trong lúc làm, **vá luôn 3 bước thiếu của checklist generator**: nhắc build `@nexus/shared` · nhắc gán quyền vào `seed-roles.ts` · liệt kê cột `*_search`
- [ ] **V11** Nối FilterBar (gỡ vi phạm #11) + ExportDialog + saved-views vào trang `orders`
- [ ] **V12** Trang `audit-logs` (tra cứu, filter theo entity/actor/khoảng ngày) + trang `settings` (đọc/ghi theo quyền `setting:update`)
- [ ] **V13** Notification dropdown (đọc + đánh dấu đã đọc) · recent/favorites vào Cmd+K · StatusBadge vào orders list (gỡ vi phạm #11 cuối)
- [ ] **V14** Chụp lại toàn bộ ảnh baseline (cả `-linux` lẫn `-win32`) + a11y 2 tổ hợp cho màn mới
- [ ] Chuyển check #11 từ `ADVISORY` sang `checks` trong `run-all.mjs` — **điều kiện đóng Phase 1**

## Phase 2 — Màn quản trị CORE còn thiếu *(~2 ngày, 2 PR)*

- [ ] **PR 2a**: `roles` (danh sách + tạo vai trò từ permission×scope — UI cho quyết định #61) · `org-units` (cây, tạo/sửa/di chuyển, cảnh báo "đổi cây huỷ cache quyền toàn tenant")
- [ ] **PR 2b**: `admin/tenants` (sysadmin: tạo/suspend/features — chỉ hiện khi có `system:cross_tenant`) · `tenants/current` branding · `me/sessions` (thiết bị đăng nhập + thu hồi)

## Phase 3 — Luồng auth còn thiếu UI *(~0,5 ngày, 1 PR)*

- [ ] `forgot-password` → `reset-password` (đủ vòng: nhập email → 202 → link token → đặt mật khẩu)
- [ ] `accept-invitation` (đặt mật khẩu lần đầu / email đã tồn tại)
- [ ] Switch-tenant từ header (user nhiều membership) — gọi `POST /auth/switch-tenant`, reload

## Phase 4 — Reports · Inventory · Import wizard *(~1,5 ngày, 2 PR)*

- [ ] **PR 4a**: trang `reports` — render ĐỘNG từ `GET /reports/:id/meta` (form filter tự sinh theo `params`, bảng + dòng tổng theo `columns`, drill-down là link thật, nút export). Đây là phép thử "khai báo báo cáo mới < 2 giờ" của A1 ở phía FE
- [ ] **PR 4b**: trang `inventory` (balances + form nhập/xuất kho, hiện lỗi `STOCK.INSUFFICIENT` tử tế) · Import wizard nối job thật (upload rows → poll `import-jobs/:id` → bảng lỗi từng dòng + tải lại)

## Phase 5 — Trả nợ kỹ thuật đã ghi sổ *(~1 ngày, 3 PR nhỏ)*

- [ ] **B7**: mở PR cho nhánh `feat/saved-views-b7` (đã push sẵn) và merge
- [ ] **Dark chroma**: `--brand-c-preset` + `calc(−0.02)` ở dark (inline không được thắng stylesheet) — PR RIÊNG vì phải chụp lại baseline
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
