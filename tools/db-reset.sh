#!/usr/bin/env bash
# Đưa DB local về dữ liệu mẫu rồi chờ Auth/REST sẵn sàng (trước mỗi smoke script).
# `supabase db reset` khởi động lại Auth/Storage/Realtime với IP mới nhưng Kong vẫn giữ IP cũ → Auth trả 502;
# khởi động lại Kong cho nó phân giải lại.
set -euo pipefail
cd "$(dirname "$0")/.."
supabase db reset
docker restart supabase_kong_kavor-system >/dev/null
KEY=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
for i in $(seq 1 30); do
  a=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:55321/auth/v1/health -H "apikey: $KEY" -H "authorization: Bearer $KEY" || true)
  r=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:55321/rest/v1/tenants?select=id&limit=1" -H "apikey: $KEY" -H "authorization: Bearer $KEY" || true)
  [ "$a" = 200 ] && [ "$r" = 200 ] && { echo "Supabase sẵn sàng."; exit 0; }
  sleep 1
done
echo "Auth/REST chưa sẵn sàng sau 30 giây (auth $a, rest $r)." >&2; exit 1
