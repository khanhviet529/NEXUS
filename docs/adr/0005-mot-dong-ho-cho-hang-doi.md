# ADR-0005: Đồng hồ nào ĐẶT giá trị thì đồng hồ đó SO SÁNH

- **Ngày:** 2026-08-12
- **Trạng thái:** Chấp nhận
- **Ảnh hưởng tới:** spec §4.8 (outbox), mọi cột thời gian tương lai dùng trong `WHERE` so sánh
- **Nguồn:** F-23 (SWEEP-REPORT — lượt 17/100 của vòng săn flaky R1)

## Bối cảnh

Hệ thống có **hai đồng hồ**: đồng hồ app-server (Node, `new Date()` /
`Date.now()`, và cả `@default(now())` của Prisma — client engine đánh giá
PHÍA APP dù DDL có `DEFAULT CURRENT_TIMESTAMP`) và đồng hồ DB-server
(`now()` trong SQL). Trong mọi triển khai thật, hai máy này KHÁC NHAU;
drift dưới giây là bình thường kể cả có NTP, trong container thì hơn —
đo thật trên Docker Desktop lúc máy tải nặng: **app nhanh hơn DB ~1,4 giây**.

Bug F-23: `outbox_events.available_at` do Prisma đặt (đồng hồ app) nhưng
`claimBatch` lọc `available_at <= now()` (đồng hồ DB). Khi app nhanh hơn DB,
event vừa insert **"tàng hình" đúng bằng độ lệch** — worker claim 0 dòng,
không lỗi, không log, chỉ trễ. Ở production điều đó nghĩa là **mọi outbox
event bị delay vô hình bằng drift giữa hai server** — loại lỗi không ai
chẩn đoán được từ log. Ở test, nó là flaky chỉ lộ ra ở lượt chạy thứ 17.

Bug này đồng thời là bằng chứng đo được cho luật quy trình "cấm vá flaky
bằng retry": nếu vá bằng retry/tăng timeout, test xanh và bug production
tồn tại mãi mãi.

## Quyết định

**Mọi cột thời gian được dùng trong so sánh (`WHERE ... <= / >=`) phải được
ĐẶT và SO SÁNH bằng CÙNG MỘT đồng hồ.** Không bao giờ đặt bằng đồng hồ app
rồi so bằng `now()` của DB hay ngược lại.

Áp vào code hiện có:

| Cột | Đặt bằng | So bằng | Trạng thái |
|---|---|---|---|
| `outbox_events.available_at` | app (Prisma `@default(now())` + backoff app-side) | app (`claimBatch` nhận `new Date()`) | ✅ vá ở F-23 |
| `outbox_events.locked_at` (lease requeueStale) | DB (`SET locked_at = now()`) | DB (`now() - interval`) | ✅ nhất quán sẵn — GIỮ DB |
| `webhook_deliveries.next_retry_at` | app | app | ✅ nhất quán sẵn |
| `sessions/password_reset_tokens/invitations/idempotency_requests .expires_at` | app | app | ✅ nhất quán sẵn |
| `approval_authorities.effective_from/to` | app | app (`@db.Date`) | ⚠️ drift chỉ ảnh hưởng đúng lúc nửa đêm — rủi ro thấp, chấp nhận, ghi rõ tại đây |

Ghi chú chọn phía: đồng hồ **app** là mặc định cho hàng đợi vì Prisma đã
đặt `@default(now())` phía app — đổi phía đặt khó hơn đổi phía so. Lease
(`locked_at`) giữ đồng hồ DB vì cả đặt lẫn so đều là SQL thuần.

## Hệ quả

- Module tương lai thêm cột `*_at` có so sánh: chọn MỘT đồng hồ ngay lúc
  thiết kế và giữ nhất quán ở cả đường ghi lẫn đường đọc.
- **Sổ nợ — check #13 "quyền sở hữu đồng hồ" (làm SAU pilot):** mọi cột kiểu
  thời gian xuất hiện trong `WHERE` so sánh phải có comment trong
  `schema.prisma` khai `// clock: app` hoặc `// clock: db`; thiếu comment →
  ĐỎ. Đây là check "quyết định đã được khai báo" (cùng loại check-cut-table),
  không phải check hành vi — nó buộc người thêm `expires_at` mới phải trả lời
  câu hỏi mà F-23 dạy, trước khi bug kịp tồn tại.

## Phương án đã cân nhắc

- **Retry/tăng timeout ở test** — CẤM: che đúng bug production cần thấy.
- **Đồng bộ NTP chặt hơn** — không phải lời giải: drift không bao giờ về 0,
  và kiến trúc không được PHỤ THUỘC vào chất lượng NTP của môi trường triển khai.
- **Chuyển hết sang DB clock** (INSERT bằng raw SQL để `DEFAULT now()` của DDL
  có tác dụng) — đúng về lý nhưng đắt hơn: phải bỏ Prisma `create` cho outbox
  và mọi chỗ enqueue; chọn app-clock đạt cùng bất biến với diff nhỏ hơn.
