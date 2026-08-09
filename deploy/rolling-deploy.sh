#!/usr/bin/env bash
# Rolling deploy — §9. Điểm nối với hạ tầng đích.
#
# Repo này CHƯA gắn với một nhà cung cấp cụ thể, nên script cố ý KHÔNG bịa
# lệnh của ECS/K8s/Fly. Nó gọi DEPLOY_HOOK và GHI LẠI image được triển khai
# để rollback.sh biết quay về đâu. Khi chọn hạ tầng, thay phần gọi hook.
set -euo pipefail

IMAGE="${1:?thiếu tham số image}"
STATE_DIR="${DEPLOY_STATE_DIR:-.deploy-state}"
mkdir -p "$STATE_DIR"

# Ghi image ĐANG chạy thành "previous" TRƯỚC khi đổi — rollback cần nó
if [ -f "$STATE_DIR/current" ]; then
  cp "$STATE_DIR/current" "$STATE_DIR/previous"
fi
echo "$IMAGE" > "$STATE_DIR/current"

if [ -z "${DEPLOY_HOOK:-}" ]; then
  echo "::warning::Chưa cấu hình DEPLOY_HOOK — bỏ qua bước đẩy lên hạ tầng."
  echo "Xem deploy/README.md để nối với ECS/K8s/Fly."
  exit 0
fi

echo "Rolling deploy: $IMAGE"
curl -fsS --max-time 120 -X POST "$DEPLOY_HOOK" \
  -H 'content-type: application/json' \
  -d "{\"image\":\"$IMAGE\",\"strategy\":\"rolling\"}"
