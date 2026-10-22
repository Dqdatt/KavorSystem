#!/usr/bin/env bash
# Kiểm thử đầu-cuối luồng auth trên Supabase local: kích hoạt → OTP (Mailpit) → đăng nhập → quên/đặt lại mật khẩu.
# Yêu cầu: `supabase start` (có mailpit) + API chạy ở $API với SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY local,
# và DB vừa `supabase db reset` (HD0142 chưa kích hoạt).
set -euo pipefail
API=${API:-http://localhost:4000/api/v1}
MAIL=${MAIL:-http://127.0.0.1:55324}
EMAIL=thao.ha@haidang.vn
PW1='Kavor2026A'
PW2='Kavor2026B'

post() { curl -s -X POST "$API/$1" -H 'content-type: application/json' -d "$2"; }
field() { python3 -c "import json,sys; d=json.load(sys.stdin); v=d; [v:=v[k] if v is not None else None for k in sys.argv[1].split('.')]; print(v if v is not None else '')" "$1"; }
otp() {
  sleep 2
  local id; id=$(curl -s "$MAIL/api/v1/search?query=to:$EMAIL" | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['ID'])")
  curl -s "$MAIL/api/v1/message/$id" | python3 -c "import json,sys,re; print(re.search(r'\b(\d{6})\b', json.load(sys.stdin)['Text']).group(1))"
}
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; else echo "✘ $1 (được: '$2', cần: '$3')"; exit 1; fi; }

curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

r=$(post auth/login "{\"identifier\":\"HD0142\",\"password\":\"$PW1\"}")
check "Đăng nhập trước khi kích hoạt bị chặn" "$(echo "$r" | field error.code)" AUTH_NOT_ACTIVATED

r=$(post auth/activate/start '{"employeeCode":"HD0142","email":"sai@haidang.vn"}')
check "Sai email không kích hoạt được" "$(echo "$r" | field error.code)" AUTH_EMPLOYEE_NOT_FOUND

r=$(post auth/activate/start "{\"employeeCode\":\"hd0142\",\"email\":\"$EMAIL\"}")
check "Gửi OTP kích hoạt" "$(echo "$r" | field data.destination)" "th*****@haidang.vn"
code=$(otp)

r=$(post auth/activate/verify "{\"email\":\"$EMAIL\",\"code\":\"$code\",\"password\":\"yeu\"}")
check "Mật khẩu yếu bị từ chối" "$(echo "$r" | field error.code)" AUTH_WEAK_PASSWORD

r=$(post auth/activate/verify "{\"email\":\"$EMAIL\",\"code\":\"000000\",\"password\":\"$PW1\"}")
check "OTP sai bị từ chối" "$(echo "$r" | field error.code)" AUTH_OTP_INVALID

r=$(post auth/activate/verify "{\"email\":\"$EMAIL\",\"code\":\"$code\",\"password\":\"$PW1\"}")
check "Kích hoạt thành công" "$(echo "$r" | field data.me.employeeCode)" HD0142
token=$(echo "$r" | field data.session.accessToken)

me=$(curl -s "$API/me" -H "authorization: Bearer $token")
check "GET /me trả đúng công ty" "$(echo "$me" | field data.tenant.code)" HDG-001

r=$(post auth/activate/start "{\"employeeCode\":\"HD0142\",\"email\":\"$EMAIL\"}")
check "Không kích hoạt lại được" "$(echo "$r" | field error.code)" AUTH_ALREADY_ACTIVATED

r=$(post auth/login "{\"identifier\":\"HD0142\",\"password\":\"SaiMatKhau1\"}")
check "Sai mật khẩu" "$(echo "$r" | field error.code)" AUTH_INVALID_CREDENTIALS

r=$(post auth/login "{\"identifier\":\"HD0142\",\"password\":\"$PW1\"}")
check "Đăng nhập bằng mã nhân viên" "$(echo "$r" | field data.me.fullName)" "Trần Thu Hà"
refresh=$(echo "$r" | field data.session.refreshToken)

r=$(post auth/refresh "{\"refreshToken\":\"$refresh\"}")
check "Làm mới phiên" "$(echo "$r" | field data.me.employeeCode)" HD0142

curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
sleep 31  # Supabase giới hạn 1 email OTP / 30 giây cho cùng địa chỉ
r=$(post auth/password/forgot "{\"identifier\":\"$EMAIL\"}")
check "Gửi OTP quên mật khẩu" "$(echo "$r" | field data.sent)" True
code=$(otp)
r=$(post auth/password/reset "{\"email\":\"$EMAIL\",\"code\":\"$code\",\"newPassword\":\"$PW2\"}")
check "Đặt lại mật khẩu" "$(echo "$r" | field data.me.employeeCode)" HD0142

r=$(post auth/login "{\"identifier\":\"HD0142\",\"password\":\"$PW1\"}")
check "Mật khẩu cũ không dùng được nữa" "$(echo "$r" | field error.code)" AUTH_INVALID_CREDENTIALS
r=$(post auth/login "{\"identifier\":\"HD0142\",\"password\":\"$PW2\"}")
check "Đăng nhập bằng mật khẩu mới" "$(echo "$r" | field data.me.employeeCode)" HD0142
echo "Tất cả bước auth đều đạt."
