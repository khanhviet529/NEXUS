# Triển khai (CD) — điểm nối với hạ tầng

> Spec §9: build image → chạy migration → rolling deploy → health check →
> **rollback tự động nếu health check thất bại**.

## Vì sao script gọi `DEPLOY_HOOK` thay vì lệnh của ECS/K8s/Fly

Repo này là **boilerplate**, chưa gắn với một nhà cung cấp cụ thể. Viết sẵn
lệnh `aws ecs update-service` hay `kubectl set image` sẽ tạo cảm giác "CD đã
xong" trong khi không ai chạy thử được — đó là loại nợ tệ hơn không có gì.

Vì vậy `deploy/*.sh` làm **đúng phần không phụ thuộc nhà cung cấp** (thứ tự
bước, ghi nhớ bản trước để rollback, tiêu chí health), còn phần đẩy lên hạ
tầng gọi qua một hook. Khi dự án chọn hạ tầng, thay thân hàm gọi hook —
không phải viết lại luồng.

## Secret cần khai theo môi trường (GitHub Environments)

| Secret | Dùng ở | Ghi chú |
|---|---|---|
| `DATABASE_URL` | job `migrate` | Thiếu là CD dừng, không deploy mù |
| `HEALTH_URL` | job `deploy` | Trỏ `/api/v1/health` của môi trường đó |
| `DEPLOY_HOOK` | rolling + rollback | Endpoint hạ tầng nhận `{image, strategy}` |

Chưa khai `DEPLOY_HOOK` thì script **cảnh báo và bỏ qua** thay vì giả vờ
thành công — deploy im lặng không làm gì là thứ khó phát hiện nhất.

## Hợp đồng health check

`deploy/health-check.sh` **không** chấp nhận HTTP 200 là đủ. Nó đòi thân
phản hồi có `"db": true` và `"redis": true`.

Lý do: tiến trình sống nhưng mất DB vẫn trả 200 ở nhiều framework — rollback
sẽ không kích hoạt và hệ thống đứng im với bản lỗi. Hợp đồng này có test giữ:
`apps/api/test/health-gd-b8.spec.ts` — đổi tên khoá trong response là test đỏ.

## Luật vàng về migration khi rollback

`rollback.sh` trả **code** về bản trước, **KHÔNG hạ cấp schema**. Đó là chủ ý:
migration hạ cấp tự động là nguồn mất dữ liệu.

Hệ quả bắt buộc: **mọi migration phải tương thích ngược với bản code liền
trước**.

```
✅ Release N:   thêm cột nullable / thêm bảng / thêm index
   Release N+1: code bắt đầu dùng cột đó
   Release N+2: mới đặt NOT NULL hoặc xoá cột cũ

❌ Cùng một release vừa xoá cột vừa đổi code — rollback là hỏng ngay
```

## Rollback thủ công

Khi rollback tự động không chạy được (chưa có bản trước, hook lỗi):

```bash
# 1. Tìm tag image gần nhất còn tốt (tag theo commit SHA)
docker image ls ghcr.io/<org>/<repo>/api

# 2. Trỏ hạ tầng về tag đó
DEPLOY_HOOK=... ./deploy/rollback.sh

# 3. Kiểm chứng
./deploy/health-check.sh https://<env>/api/v1/health
```

## Còn thiếu (ghi rõ, không giả vờ đã có)

- Uptime check ngoài (Better Stack / Pingdom) — §9 yêu cầu, chưa gắn
- Cảnh báo khi dead-letter queue có job — dữ liệu đã có ở `/admin/ops/queues`,
  chưa nối vào hệ cảnh báo
- Cảnh báo slow query — cần bật `pg_stat_statements` ở môi trường đích
- Backup hằng ngày + giữ 30 ngày — quy trình restore ĐÃ có test (#30), nhưng
  lịch backup thuộc hạ tầng, chưa cấu hình
