# ADR-0004: Audit ghi TƯỜNG MINH qua AuditRepository, không dùng query extension tự động

- **Ngày:** 2026-08-08
- **Trạng thái:** Chấp nhận (chờ review của đội — người viết: Claude, theo uỷ quyền của chủ dự án)
- **Ảnh hưởng tới:** §4.9, §12 mục 22 + 36

## Bối cảnh

Spec §12 #36 dự kiến dùng `$extends` query extension cho **cả tenant lẫn audit**.
Thực tế từ GĐ2 → GĐ10, extension chỉ đảm nhiệm tenancy + soft-delete; audit được
ghi **tường minh** bằng `AuditRepository.write()` tại từng service/repository,
cộng với **DB trigger** cho nhóm security-critical (7 bảng, GĐ3b) và trigger bổ
sung cho `approval_authorities`/`webhook_endpoints` (GĐ10). Toàn bộ 188 test
§8.2 xanh trên mô hình này, gồm test #10 (che field nhạy cảm trong diff).

Đến GĐ10, hai cách tiếp cận đã đủ dữ liệu để so:

## Quyết định

**Giữ audit tường minh.** Extension KHÔNG ghi audit tự động. Cụ thể:

1. Mọi đường ghi nghiệp vụ gọi `AuditRepository.write()` với action NGỮ NGHĨA
   (`SUBMIT`, `APPROVE`, `CACHE_CLEARED`…), diff đã che field nhạy cảm
   **tại thời điểm ghi** (§4.4c nơi 4).
2. Nhóm security-critical giữ DB trigger độc lập (§4.9) — lưới an toàn khi có
   ghi lén ngoài tầng ứng dụng.
3. Bịt lỗ "quên audit" bằng **CI check `check-audit-coverage`** (tools/checks):
   module có endpoint ghi (`@Post/@Patch/@Put/@Delete`) bắt buộc tham chiếu
   `AuditRepository`, trừ allowlist các bảng mà ma trận §6.5 không yêu cầu
   audit (personalization, notifications, saved-views…).

## Phương án đã cân nhắc

- **Extension `$allOperations` ghi audit tự động** — bỏ vì:
  (a) chính §4.9 liệt kê 8 đường ghi extension KHÔNG bắt được (raw SQL của kho,
  worker, bulk/import, migration…) → vẫn phải ghi tay ở đúng những chỗ nhạy cảm
  nhất, thành ra HAI cơ chế song song phải khử trùng lặp;
  (b) diff cần một truy vấn đọc thêm cho mọi write (§4.9 tự cảnh báo);
  (c) action chỉ còn CREATE/UPDATE/DELETE vô hồn, mất ngữ nghĩa nghiệp vụ;
  (d) mô hình hiện tại đã được 188 test kiểm chứng — đổi giữa chừng rủi ro cao.
- **Chỉ dựa DB trigger cho tất cả bảng** — bỏ vì trigger không biết actor
  nghiệp vụ/traceId đầy đủ và không che field theo quyền người xem.

## Hệ quả

- Được: một cơ chế duy nhất, ngữ nghĩa giàu, chi phí đọc thêm = 0, đã kiểm chứng.
- Mất: kỷ luật "mọi write phải kèm audit.write()" phụ thuộc con người → bù bằng
  CI check ở mục 3 (kèm ADR này, check đã phát hiện 2 module thiếu: imports,
  calendar — đã vá trong cùng PR).
- Phải sửa: §12 #36 thu hẹp thành "extension cho tenancy + soft-delete";
  #22 giữ nguyên (write qua repository + trigger security-critical).
