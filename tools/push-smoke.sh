#!/usr/bin/env bash
# Kiểm thử Web Push của PWA qua API: /meta có khóa VAPID; đăng ký chỉ nhận máy chủ push thật (chặn SSRF) và khóa hợp lệ;
# cần đăng nhập; người khác không hủy được đăng ký của mình; hủy thì xóa. API chưa đặt API_VAPID_* thì kiểm phần "tắt push".
# Không tạo thông báo nên không gửi push ra ngoài. Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"

read -r P256 AUTH < <(node -e 'const c=require("crypto"); const e=c.createECDH("prime256v1"); e.generateKeys(); console.log(e.getPublicKey().toString("base64url"), c.randomBytes(16).toString("base64url"))')
EP="https://web.push.apple.com/smoke-$(uuid)"
sub() { echo "{\"endpoint\":\"$1\",\"keys\":{\"p256dh\":\"$2\",\"auth\":\"$AUTH\"}}"; }
count() { sql "select count(*) from public.push_subscriptions where endpoint = '$EP'"; }

check "Chưa đăng nhập không đăng ký được" "$(status POST me/push/subscribe "" "$(sub "$EP" "$P256")")" "401"
KEY=$(call GET meta | field data.webPushKey)
if [ -z "$KEY" ]; then
  check "API chưa có khóa VAPID: đăng ký trả enabled=false" "$(call POST me/push/subscribe "$EMP" "$(sub "$EP" "$P256")" | field data.enabled)" "False"
  check "… và không lưu" "$(count)" "0"
  exit 0
fi
check "/meta có khóa công khai VAPID (87 ký tự)" "${#KEY}" "87"
check "Endpoint không phải máy chủ push → 400" "$(status POST me/push/subscribe "$EMP" "$(sub "https://127.0.0.1:4000/x" "$P256")")" "400"
check "Endpoint giả dạng (fcm.googleapis.com.evil) → 400" "$(status POST me/push/subscribe "$EMP" "$(sub "https://fcm.googleapis.com.evil.test/x" "$P256")")" "400"
check "Khóa trình duyệt sai → 400" "$(status POST me/push/subscribe "$EMP" "$(sub "$EP" "abc")")" "400"
check "Đăng ký trình duyệt → enabled=true" "$(call POST me/push/subscribe "$EMP" "$(sub "$EP" "$P256")" | field data.enabled)" "True"
check "… lưu cho đúng nhân viên" "$(sql "select e.employee_code from public.push_subscriptions s join public.employees e on e.id = s.employee_id where s.endpoint = '$EP'")" "HD0142"
check "Người khác gọi hủy endpoint của mình → không xóa" "$(call POST me/push/unsubscribe "$MGR" "{\"endpoint\":\"$EP\"}" >/dev/null; count)" "1"
check "Hủy đăng ký (đăng xuất) → xóa" "$(call POST me/push/unsubscribe "$EMP" "{\"endpoint\":\"$EP\"}" >/dev/null; count)" "0"
