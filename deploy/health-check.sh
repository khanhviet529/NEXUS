#!/usr/bin/env bash
# Health check sau deploy — §9. Trả mã khác 0 → CD chạy rollback.
#
# Kiểm THẬT: /health phải báo db+redis ok, KHÔNG chỉ 200. Một tiến trình sống
# nhưng mất DB vẫn trả 200 ở nhiều framework — đó là kiểu "xanh giả" nguy hiểm
# nhất vì rollback sẽ không kích hoạt.
set -euo pipefail

URL="${1:-${HEALTH_URL:-}}"
ATTEMPTS="${HEALTH_ATTEMPTS:-10}"
DELAY="${HEALTH_DELAY:-6}"

if [ -z "$URL" ]; then
  echo "::error::Thiếu HEALTH_URL — xem deploy/README.md"
  exit 1
fi

for i in $(seq 1 "$ATTEMPTS"); do
  body="$(curl -fsS --max-time 10 "$URL" || true)"
  if [ -n "$body" ]; then
    echo "lần $i: $body"
    # Yêu cầu tường minh từng thành phần, không chỉ HTTP 200
    if echo "$body" | grep -q '"db"[[:space:]]*:[[:space:]]*true' \
       && echo "$body" | grep -q '"redis"[[:space:]]*:[[:space:]]*true'; then
      echo "✅ Health check ĐẠT sau $i lần thử"
      exit 0
    fi
  else
    echo "lần $i: chưa phản hồi"
  fi
  sleep "$DELAY"
done

echo "::error::Health check THẤT BẠI sau $ATTEMPTS lần — CD sẽ rollback"
exit 1
