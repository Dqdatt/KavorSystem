#!/usr/bin/env bash
# Chạy backend dev trên Mac: Supabase local (kèm hộp thư Mailpit, Storage cho logo/ảnh bìa) + Kavor API, cho app trên iPhone/simulator gọi tới.
#   bash tools/dev-backend.sh          # khởi động
#   bash tools/dev-backend.sh reset    # xóa sạch DB về dữ liệu mẫu (HD0142 chưa kích hoạt)
# Key Supabase local được đọc lúc chạy từ `supabase status`, không ghi ra file.
set -euo pipefail
cd "$(dirname "$0")/.."

docker info >/dev/null 2>&1 || { open -a Docker; echo "Đang mở Docker…"; until docker info >/dev/null 2>&1; do sleep 2; done; }
supabase status >/dev/null 2>&1 || supabase start -x studio,imgproxy,vector,logflare,edge-runtime,postgres-meta
[ "${1:-}" = "reset" ] && bash tools/db-reset.sh

SRK=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
ANON=$(supabase status -o env 2>/dev/null | grep -E '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
# Web HR/Admin (pnpm dev:admin) đọc file này: Realtime cần URL + publishable key local. File bị .gitignore.
printf 'KAVOR_API_URL=http://localhost:4000/api/v1\nSUPABASE_URL=http://127.0.0.1:55321\nSUPABASE_PUBLISHABLE_KEY=%s\n' "$ANON" > apps/admin-web/.env.local
# Cấu hình riêng của máy (vd. CONSOLE_BOOTSTRAP_EMAIL — email quản trị viên Console đầu tiên), file bị .gitignore
[ -f apps/api/.env.local ] && { set -a; . apps/api/.env.local; set +a; }
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo localhost)
pkill -f "tsx.*apps/api/src/main.ts|tsx.*src/main.ts" 2>/dev/null || true

echo
echo "API:      http://$IP:4000/api/v1   (build app với EXPO_PUBLIC_API_URL=http://$IP:4000/api/v1)"
echo "Web HR/Admin: pnpm dev:admin → http://localhost:3000"
echo "Hộp thư OTP (Mailpit): http://127.0.0.1:55324"
echo "Kavor Console: pnpm dev:console → http://localhost:3001 — quản trị viên đầu tiên: Kích hoạt tài khoản bằng ${CONSOLE_BOOTSTRAP_EMAIL:-admin@kavor.test}"
echo "Tài khoản mẫu: nhân viên HD0142 · thao.ha@haidang.vn — HR Admin HD0007 · thao.mai@haidang.vn (kích hoạt trên web)"
echo
cd apps/api
SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_SERVICE_ROLE_KEY="$SRK" SMTP_URL=smtp://127.0.0.1:55325 API_PORT=4000 exec pnpm exec tsx src/main.ts
