#!/usr/bin/env bash
# Chạy backend dev trên Mac: Supabase local (kèm hộp thư Mailpit) + Kavor API, cho app trên iPhone/simulator gọi tới.
#   bash tools/dev-backend.sh          # khởi động
#   bash tools/dev-backend.sh reset    # xóa sạch DB về dữ liệu mẫu (HD0142 chưa kích hoạt)
# Key Supabase local được đọc lúc chạy từ `supabase status`, không ghi ra file.
set -euo pipefail
cd "$(dirname "$0")/.."

docker info >/dev/null 2>&1 || { open -a Docker; echo "Đang mở Docker…"; until docker info >/dev/null 2>&1; do sleep 2; done; }
supabase status >/dev/null 2>&1 || supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,storage-api,postgres-meta
[ "${1:-}" = "reset" ] && supabase db reset

SRK=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo localhost)
pkill -f "tsx.*apps/api/src/main.ts|tsx.*src/main.ts" 2>/dev/null || true

echo
echo "API:      http://$IP:4000/api/v1   (build app với EXPO_PUBLIC_API_URL=http://$IP:4000/api/v1)"
echo "Hộp thư OTP (Mailpit): http://127.0.0.1:55324"
echo "Tài khoản mẫu: mã HD0142 · email thao.ha@haidang.vn"
echo
cd apps/api
SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_SERVICE_ROLE_KEY="$SRK" API_PORT=4000 exec pnpm exec tsx src/main.ts
