# ADR-0004: Audit ghi TƯỜNG MINH qua AuditRepository, không dùng query extension tự động

- **Ngày:** 2026-08-08
- **Trạng thái:** Chấp nhận
- **Ảnh hưởng tới:** §4.9, §12 mục 22 + 36, §8.2 (test #31), CLAUDE.md §3, cookbook §2

## Bối cảnh

Spec §12 #36 dự kiến dùng `$extends` query extension cho **cả tenant lẫn audit**.
Thực tế từ GĐ2 → GĐ10, extension chỉ đảm nhiệm tenancy + soft-delete; audit được
ghi **tường minh** bằng `AuditRepository`, cộng với **DB trigger** cho nhóm
security-critical (7 bảng, GĐ3b) và trigger bổ sung cho `approval_authorities`
/`webhook_endpoints` (GĐ10). Code và spec đã lệch nhau suốt 9 giai đoạn — luật
working-agreement §5 cấm để lệch quá một PR, nên phải chốt tường minh một chiều.

## Quyết định

**Giữ audit tường minh.** Extension KHÔNG ghi audit tự động. Cụ thể:

1. Mọi đường ghi nghiệp vụ gọi `AuditRepository` với action **ngữ nghĩa**
   (`SUBMIT`, `APPROVE`, `CACHE_CLEARED`…), diff đã che field nhạy cảm **tại
   thời điểm ghi** (§4.4c nơi 4).
2. **Có transaction nghiệp vụ → BẮT BUỘC `writeInTx(tx, entry)`**, để audit và
   write nghiệp vụ cùng sống cùng chết. `write(entry)` chỉ dành cho sự kiện
   không thuộc transaction nào (security event, thao tác vận hành).
3. Nhóm security-critical giữ DB trigger độc lập (§4.9) — lưới an toàn khi có
   ghi lén ngoài tầng ứng dụng.
4. Bịt lỗ "quên audit" và "action tự do" bằng **hai lớp chặn**:
   `AuditEntry.action` có kiểu đóng `AuditAction` (chặn lúc biên dịch), và CI
   check `check-audit-coverage` (module có endpoint ghi phải tham chiếu
   `AuditRepository`; action literal phải thuộc registry).

## Phương án đã cân nhắc

- **Extension `$allOperations` ghi audit tự động** — bỏ vì:
  - **(a) Hai cơ chế cho một mối quan tâm.** Chính §4.9 liệt kê 8 đường ghi
    extension KHÔNG bắt được, trong đó có **conditional UPDATE của kho**
    (§5B.2/B4) — câu ghi quan trọng nhất toàn hệ thống. Nếu chỗ nhạy cảm nhất
    kiểu gì cũng phải ghi tay thì extension thành cơ chế thứ hai, phải khử
    trùng lặp, và người review nhìn code không biết đường ghi này đã audit
    hay chưa. Mô hình tinh thần thành "audit xảy ra… đâu đó". Đây là lý do
    quyết định.
  - **(b) Extension thấy OPERATION, không thấy Ý ĐỊNH.** §4.9 yêu cầu timeline
    trên trang chi tiết. Timeline `UPDATE, UPDATE, UPDATE` là vô dụng với người
    dùng nghiệp vụ — họ cần `Gửi duyệt`, `Duyệt`, `Huỷ`. Đây không phải chuyện
    đẹp hơn, mà là tính năng có dùng được hay không.
  - (c) Bổ trợ: diff cần một truy vấn đọc thêm cho mọi write (§4.9 tự cảnh
    báo), tuy có thể giới hạn theo model.
- **Chỉ dựa DB trigger cho tất cả bảng** — bỏ vì trigger không biết actor
  nghiệp vụ/traceId đầy đủ và không che field theo quyền người xem.

## Hệ quả

- Được: một cơ chế duy nhất, ngữ nghĩa giàu, chi phí đọc thêm = 0.
- Mất: kỷ luật "mọi write phải kèm audit" phụ thuộc con người → bù bằng kiểu
  đóng + CI check ở mục 4.
- Phải sửa: §12 #36 thu hẹp thành "extension cho tenancy + soft-delete"; #22
  giữ nguyên; §4.9 sửa prose; CLAUDE.md §3 thêm dòng cấm; cookbook §2 thêm bước;
  §8.2 thêm test #31.

## Khuyết tật phát hiện khi kiểm chứng các điều kiện (đã sửa cùng ADR này)

Ba điều kiện review đặt ra trước khi ký đều tìm ra lỗi thật — ghi lại vì đây là
bằng chứng cho thấy ADR không phải thủ tục giấy tờ:

| # | Khuyết tật | Hệ quả nếu bỏ qua | Đã sửa |
|---|---|---|---|
| 1 | 3 module có endpoint ghi mà quên audit (`imports`, `calendar`, `customers`) | Mất dấu vết thao tác | Vá + CI check (PR #1) |
| 2 | Audit ghi **NGOÀI** transaction nghiệp vụ | Commit "câm": nghiệp vụ thành công mà không có dấu vết; hoặc timeline có hành động chưa từng xảy ra | `writeInTx()` + test #31 |
| 3 | Vòng đời chứng từ ghi `action: UPDATE`, ý định nghiệp vụ chôn trong `after.action` | **Lý do (b) của chính ADR này bị vô hiệu** — timeline vẫn `UPDATE, UPDATE` | `TRANSITION_AUDIT_ACTION` + registry đóng + kiểu `AuditAction` |

Khuyết tật 3 đáng chú ý: ADR viện lý do "giữ được action ngữ nghĩa" trong khi
code lại **không** làm thế. Nếu ký ADR mà không kiểm, lập luận biện minh cho
quyết định sẽ chỉ đúng trên giấy.
