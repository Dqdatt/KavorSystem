#!/usr/bin/env bash
# Đẩy migration + cấu hình Auth (tắt đăng ký công khai, OTP 6 số, MFA TOTP, mẫu email, giới hạn) lên project Supabase Cloud.
# Không đẩy seed (dữ liệu mẫu Hải Đăng). supabase/config.toml giữ localhost cho dev: script chép thư mục supabase/ ra thư mục tạm,
# thay địa chỉ web và thêm SMTP Gmail rồi mới push — file trong repo không đổi.
# Cần: `supabase login` một lần. Chạy lại được nhiều lần (chỉ áp migration chưa có).
#   SUPABASE_PROJECT_REF=abcd... ADMIN_WEB_URL=https://kavor-hr.vercel.app CONSOLE_WEB_URL=https://kavor-console.vercel.app \
#   GMAIL_USER=ban@gmail.com bash tools/cloud-supabase.sh
# Mật khẩu ứng dụng Gmail và mật khẩu DB được hỏi khi chạy (không lưu, không in ra). DRY_RUN=1: chỉ in cấu hình sẽ đẩy.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_PROJECT_REF:?Thiếu SUPABASE_PROJECT_REF (Project Settings → General → Reference ID)}"
: "${ADMIN_WEB_URL:?Thiếu ADMIN_WEB_URL (địa chỉ web HR trên Vercel, https://…)}"
: "${CONSOLE_WEB_URL:?Thiếu CONSOLE_WEB_URL (địa chỉ Kavor Console trên Vercel, https://…)}"
: "${GMAIL_USER:?Thiếu GMAIL_USER (địa chỉ Gmail gửi OTP)}"
ADMIN_WEB_URL=${ADMIN_WEB_URL%/}; CONSOLE_WEB_URL=${CONSOLE_WEB_URL%/}
if [ -z "${GMAIL_APP_PASSWORD:-}" ]; then
  read -r -s -p "Mật khẩu ứng dụng Gmail (16 ký tự, không dấu cách): " GMAIL_APP_PASSWORD; echo
fi
export GMAIL_APP_PASSWORD

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/supabase"
cp -R supabase/config.toml supabase/migrations supabase/templates "$TMP/supabase/"
python3 -I - "$TMP/supabase/config.toml" "$ADMIN_WEB_URL" "$CONSOLE_WEB_URL" "$GMAIL_USER" <<'PY'
import sys
p, admin, console, user = sys.argv[1:]
s = open(p, encoding="utf-8").read()
old_site = 'site_url = "http://localhost:3000"'
old_redir = 'additional_redirect_urls = ["http://localhost:3000/**", "http://localhost:3001/**", "kavor://**"]'
assert old_site in s and old_redir in s, "config.toml đã đổi dạng site_url/additional_redirect_urls — sửa script"
s = s.replace(old_site, f'site_url = "{admin}"')
s = s.replace(old_redir, f'additional_redirect_urls = ["{admin}/**", "{console}/**", "kavor://**"]')
# Không đẩy Storage: CLI 2.108 đọc cấu hình Storage của cloud lỗi (SchemaError databasePoolMode); giới hạn file mặc định đủ, bucket do API tạo
old_storage = '[storage]\nenabled = true'
assert old_storage in s, "config.toml đã đổi dạng [storage] — sửa script"
s = s.replace(old_storage, '[storage]\nenabled = false')
# Mật khẩu đọc từ biến môi trường lúc push (env()), không ghi vào file tạm
s += f'''
[auth.email.smtp]
enabled = true
host = "smtp.gmail.com"
port = 587
user = "{user}"
pass = "env(GMAIL_APP_PASSWORD)"
admin_email = "{user}"
sender_name = "Kavor"
'''
open(p, "w", encoding="utf-8").write(s)
PY

if [ -n "${DRY_RUN:-}" ]; then diff supabase/config.toml "$TMP/supabase/config.toml" || true; ls "$TMP/supabase/migrations" | wc -l | xargs echo "migration:"; exit 0; fi
echo "— Liên kết project $SUPABASE_PROJECT_REF (CLI hỏi mật khẩu DB đặt lúc tạo project)"
supabase --workdir "$TMP" link --project-ref "$SUPABASE_PROJECT_REF"
echo "— Áp migration (không có seed)"
supabase --workdir "$TMP" db push
# Project Free dùng email mặc định thì Supabase từ chối đổi mẫu email (400) — kể cả khi cùng lượt có bật SMTP riêng.
# Lượt 1: cấu hình Auth + SMTP Gmail, bỏ mẫu email; lượt 2: cấu hình đầy đủ (lúc này đã có SMTP riêng).
FULL="$TMP/config.full.toml"; cp "$TMP/supabase/config.toml" "$FULL"
python3 -I - "$TMP/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'\n\[auth\.email\.template\.[a-z_]+\][^\[]*', '\n', s)
assert n, "Không tìm thấy mẫu email trong config.toml — sửa script"
open(p, "w", encoding="utf-8").write(s)
PY
echo "— Đẩy cấu hình Auth + SMTP Gmail (lượt 1/2, chưa có mẫu email)"
supabase --workdir "$TMP" config push --project-ref "$SUPABASE_PROJECT_REF"
cp "$FULL" "$TMP/supabase/config.toml"
echo "— Đẩy mẫu email OTP (lượt 2/2)"
supabase --workdir "$TMP" config push --project-ref "$SUPABASE_PROJECT_REF"
echo "Xong. Kiểm tra trên Dashboard: Authentication → Sign In / Providers: 'Allow new users to sign up' phải TẮT."
