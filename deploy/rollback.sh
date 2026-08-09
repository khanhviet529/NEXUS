#!/usr/bin/env bash
# Rollback tự động khi health check thất bại — §9.
#
# LƯU Ý về migration: rollback này trả CODE về bản trước, KHÔNG hạ cấp schema.
# Đó là chủ ý — migration hạ cấp tự động là nguồn mất dữ liệu. Vì vậy luật
# vàng: migration phải TƯƠNG THÍCH NGƯỢC với bản code liền trước (thêm cột
# nullable trước, xoá cột ở lần release sau).
set -euo pipefail

STATE_DIR="${DEPLOY_STATE_DIR:-.deploy-state}"
if [ ! -f "$STATE_DIR/previous" ]; then
  echo "::error::Không có bản trước để rollback — cần can thiệp thủ công"
  exit 1
fi

PREV="$(cat "$STATE_DIR/previous")"
echo "⏪ Rollback về: $PREV"

if [ -z "${DEPLOY_HOOK:-}" ]; then
  echo "::warning::Chưa cấu hình DEPLOY_HOOK — không thể rollback tự động."
  exit 1
fi

curl -fsS --max-time 120 -X POST "$DEPLOY_HOOK" \
  -H 'content-type: application/json' \
  -d "{\"image\":\"$PREV\",\"strategy\":\"rollback\"}"

echo "$PREV" > "$STATE_DIR/current"
