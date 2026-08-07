# ADR-0003: Chốt sáu câu hỏi kho trước GĐ5b (§5B.2/B4)

- **Ngày:** 2026-08-07
- **Trạng thái:** Chấp nhận
- **Ảnh hưởng tới:** spec §5B.2/B4, §12 các mục #19/#28/#58/#59/#60, erd.md #4

| Câu hỏi | Quyết định |
|---|---|
| Cho phép tồn âm? | **KHÔNG** — conditional UPDATE `available >= :qty` chặn tuyệt đối. Dự án nào cần tồn âm thì đổi điều kiện theo cấu hình tenant (ADR mới) |
| Có reservation? | **CÓ cột, CHƯA có luồng** — `on_hand/reserved/available/in_transit` phân biệt sẵn từ đầu (bổ sung sau là migration đau). Luồng giữ hàng là [OPT] |
| Phân biệt onHand/reserved/available/inTransit? | **CÓ** (đi cùng câu trên) |
| FIFO/FEFO nằm ở tầng nào? | **Tầng SERVICE khi chọn lô** — caller (hoặc service gợi ý lô) quyết định `lot_id` TRƯỚC khi gọi issue; thuật toán 4 bước không chọn lô hộ |
| Retry có tạo movement trùng? | **KHÔNG** — `movement_dedup_keys` PK `(tenant, ref_type, ref_id, movement_type)`, insert TRƯỚC movement, KHÔNG BAO GIỜ prune trong cửa sổ retry (giữ vĩnh viễn) |
| Đơn vị lưu tồn? | **Đơn vị cơ sở** (`products.base_uom`); hệ số quy đổi chốt vào chứng từ (`uom_factor_snapshot`, §5B.2/B2) |

## Quyết định kèm theo (erd.md phát hiện #4)

**KHÔNG đặt FK `movement_dedup_keys → movements`.** Lý do: FK sang bảng
partition làm `DETACH PARTITION` (archive mảnh cũ, test #25) phức tạp hơn
nhiều. Tính toàn vẹn do thuật toán 4 bước đảm bảo (dedup insert và movement
insert trong CÙNG transaction). Đánh đổi: dedup key mồ côi chỉ xuất hiện nếu
có bug — job đối soát phát hiện được.

## Hệ quả

- `stock_balances` là NGUỒN SỰ THẬT tồn cho cả 3 loại tracking (#60);
  `inventory_serials` là chi tiết, đổi status trong CÙNG transaction (#58)
- 2 job [CORE]: rebuild snapshot từ movements + đối soát định kỳ — thiếu là
  movement pattern KHÔNG an toàn (§5B.2/B4 luật 2-3)
