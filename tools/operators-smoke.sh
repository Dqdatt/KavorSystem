#!/usr/bin/env bash
# Kavor Console — quản trị viên đầu tiên tự kích hoạt (CONSOLE_BOOTSTRAP_EMAIL, mặc định dev admin@kavor.test), mời / đổi vai trò / khóa /
# đặt lại xác thực hai lớp nhân viên Kavor, quên mật khẩu. Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
clear_mail() { curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null; }
mails() { curl -s "$MAIL/api/v1/search?query=to:$1" | python3 -c "import json,sys; print(json.load(sys.stdin).get('messages_count', 0))"; }
start() { local b="{\"email\":\"$1\"}"; call POST console/auth/password/start "" "$b"; }
# Đặt mật khẩu bằng OTP: $1 email, $2 mật khẩu → in access token
setpw() { local code b; code=$(otp "$1"); b="{\"email\":\"$1\",\"code\":\"$code\",\"password\":\"$2\"}"; call POST console/auth/password/verify "" "$b" | field data.session.accessToken; }
clogin() { local b="{\"email\":\"$1\",\"password\":\"$2\"}"; call POST console/auth/login "" "$b"; }
# Cùng email quản trị viên đầu tiên với API dev (apps/api/.env.local)
[ -f "$(dirname "$0")/../apps/api/.env.local" ] && { set -a; . "$(dirname "$0")/../apps/api/.env.local"; set +a; }
ADMIN=${CONSOLE_BOOTSTRAP_EMAIL:-admin@kavor.test}; NEWOP=ops.moi@kavor.test; SUPP=ho.tro@kavor.test
P1=KavorAdm1n2026; P2=KavorOps2026x; P3=KavorOpsMoi99
clear_mail

echo "— Quản trị viên đầu tiên (không chạy lệnh)"
check "Nền tảng chưa có quản trị viên" "$(sql "select count(*) from public.platform_operators where role='platform_admin'")" 0
r=$(start nobody@kavor.test)
check "Email lạ: cùng câu trả lời 'đã gửi' (không lộ ai là nhân viên Kavor)" "$(echo "$r" | field data.sent)" True
sleep 1; check "…nhưng không có thư nào được gửi" "$(mails nobody@kavor.test)" 0
start "$ADMIN" >/dev/null
code=$(otp "$ADMIN")
_s1=$(call POST console/auth/password/verify "" "{\"email\":\"$ADMIN\",\"code\":\"$code\",\"password\":\"yeu\"}") || :
check "Mật khẩu yếu bị từ chối" "$(echo "$_s1" | field error.code)" AUTH_WEAK_PASSWORD
_s1=$(call POST console/auth/password/verify "" "{\"email\":\"$ADMIN\",\"code\":\"000000\",\"password\":\"$P1\"}") || :
check "Mã OTP sai bị từ chối" "$(echo "$_s1" | field error.code)" AUTH_OTP_INVALID
_s1=$(call POST console/auth/password/verify "" "{\"email\":\"$ADMIN\",\"code\":\"$code\",\"password\":\"$P1\"}") || :
T=$(echo "$_s1" | field data.session.accessToken); need "Kích hoạt quản trị viên đầu tiên bằng OTP email" "$T"
check "Vai trò Quản trị Console" "$(echo "$_s1" | field data.operator.role)" platform_admin
check "Chưa bật xác thực hai lớp thì chưa dùng được" "$(status GET console/operators "$T")" 403
ADM=$(mfa "$T" console); need "Quản trị viên liên kết ứng dụng xác thực" "$ADM"
check "Xem danh sách nhân viên Kavor" "$(call GET console/operators "$ADM" | py "[(o['email'], o['role'], o['mfa'], o['self']) for o in d['operators']]")" "[('$ADMIN', 'platform_admin', True, True)]"
clear_mail
check "Đã có quản trị viên: email bootstrap chỉ còn là Quên mật khẩu" "$(sql "select count(*) from public.platform_operators where email='$ADMIN'")" 1

echo "— Mời nhân viên Kavor"
_s2=$(call POST console/operators/invites "$ADM" "{\"email\":\"$NEWOP\",\"fullName\":\"Trần Vận Hành\",\"role\":\"platform_operator\"}") || :
check "Mời Vận hành nền tảng + gửi thư" "$(echo "$_s2" | py "(d['invite']['status'], d['invite']['role'], d['mail']['sent'])")" "('pending', 'platform_operator', True)"
INV=$(echo "$_s2" | field data.invite.id)
sleep 1; check "Thư mời có trong hộp thư" "$(mails "$NEWOP")" 1
_s2=$(call POST console/operators/invites "$ADM" "{\"email\":\"$NEWOP\",\"fullName\":\"Trần Vận Hành\",\"role\":\"platform_operator\"}") || :
check "Mời trùng email đang chờ → 409" "$(echo "$_s2" | field error.code)" CONFLICT
check "Gửi lại thư ngay → 429" "$(status POST "console/operators/invites/$INV/resend" "$ADM")" 429
HRT=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên doanh nghiệp kích hoạt app" "$HRT"
_s2=$(call POST console/operators/invites "$ADM" '{"email":"thao.ha@haidang.vn","fullName":"Hà Thảo","role":"platform_support"}') || :
check "Không mời email đang là tài khoản nhân viên doanh nghiệp" "$(echo "$_s2" | field error.code)" CONFLICT
_s2=$(call POST console/operators/invites "$ADM" '{"email":"x@kavor.test","fullName":"X Y","role":"root"}') || :
check "Vai trò lạ → 400" "$(echo "$_s2" | field error.code)" VALIDATION_FAILED

echo "— Người được mời tự kích hoạt"
clear_mail; start "$NEWOP" >/dev/null
OPT=$(setpw "$NEWOP" "$P2"); need "Kích hoạt bằng OTP + đặt mật khẩu" "$OPT"
OPN=$(mfa "$OPT" console); need "Liên kết ứng dụng xác thực" "$OPN"
check "Vai trò đúng như lời mời" "$(call GET console/me "$OPN" | field data.role)" platform_operator
check "Vận hành nền tảng không quản lý nhân viên Kavor → 403" "$(status GET console/operators "$OPN")" 403
check "…nhưng dùng được Console (danh sách doanh nghiệp)" "$(status GET console/tenants "$OPN")" 200
check "Lời mời chuyển 'đã kích hoạt'" "$(call GET console/operators "$ADM" | py "[i['status'] for i in d['invites'] if i['email']=='$NEWOP']")" "['accepted']"
OPN_ID=$(call GET console/operators "$ADM" | py "[o['userId'] for o in d['operators'] if o['email']=='$NEWOP'][0]")

echo "— Thu hồi lời mời"
_s3=$(call POST console/operators/invites "$ADM" "{\"email\":\"$SUPP\",\"fullName\":\"Lê Hỗ Trợ\",\"role\":\"platform_support\"}") || :
SINV=$(echo "$_s3" | field data.invite.id)
check "Thu hồi lời mời" "$(call POST "console/operators/invites/$SINV/revoke" "$ADM" | py "[i['status'] for i in d['invites'] if i['id']=='$SINV']")" "['revoked']"
clear_mail; start "$SUPP" >/dev/null; sleep 1
check "Đã thu hồi: không gửi mã kích hoạt" "$(mails "$SUPP")" 0
check "Thu hồi lần nữa → 409" "$(status POST "console/operators/invites/$SINV/revoke" "$ADM")" 409
_s3=$(call POST console/operators/invites "$ADM" "{\"email\":\"$SUPP\",\"fullName\":\"Lê Hỗ Trợ\",\"role\":\"platform_support\"}") || :
check "Thu hồi xong mời lại được" "$(echo "$_s3" | field data.invite.status)" pending

echo "— Đổi vai trò, khóa, mở khóa"
ME_ID=$(call GET console/me "$ADM" | field data.userId)
check "Không tự khóa chính mình → 403" "$(status POST "console/operators/$ME_ID" "$ADM" '{"status":"disabled","reason":"Thử tự khóa"}')" 403
check "Thiếu lý do → 400" "$(status POST "console/operators/$OPN_ID" "$ADM" '{"status":"disabled"}')" 400
check "Không thay đổi gì → 400" "$(status POST "console/operators/$OPN_ID" "$ADM" '{"role":"platform_operator","reason":"Không đổi gì"}')" 400
_s4=$(call POST "console/operators/$OPN_ID" "$ADM" '{"status":"disabled","reason":"Nghỉ việc ở Kavor"}') || :
check "Khóa nhân viên Kavor" "$(echo "$_s4" | py "[o['status'] for o in d['operators'] if o['userId']=='$OPN_ID']")" "['disabled']"
check "Phiên đang mở của người bị khóa bị chặn ngay" "$(status GET console/tenants "$OPN")" 403
check "Người bị khóa không đăng nhập được" "$(clogin "$NEWOP" "$P2" | field error.code)" AUTH_INVALID_CREDENTIALS
clear_mail; start "$NEWOP" >/dev/null; sleep 1
check "Người bị khóa không dùng được Quên mật khẩu" "$(mails "$NEWOP")" 0
_s4=$(call POST "console/operators/$OPN_ID" "$ADM" '{"status":"active","role":"platform_support","reason":"Quay lại, chuyển sang hỗ trợ"}') || :
check "Mở khóa + đổi sang Hỗ trợ Kavor" "$(echo "$_s4" | py "[(o['status'], o['role']) for o in d['operators'] if o['userId']=='$OPN_ID']")" "[('active', 'platform_support')]"
check "Hỗ trợ Kavor không tạo được doanh nghiệp → 403" "$(status POST console/tenants "$OPN" '{"code":"THU-01","name":"Thử","plan":"trial","employeeLimit":5,"adminName":"A B","adminEmail":"a@thu.test"}')" 403
_s4=$(call POST "console/operators/$OPN_ID" "$ADM" '{"role":"platform_admin","reason":"Thêm quản trị viên thứ hai"}') || :
check "Nâng lên Quản trị Console" "$(echo "$_s4" | py "[o['role'] for o in d['operators'] if o['userId']=='$OPN_ID']")" "['platform_admin']"
check "Quản trị viên thứ hai xem được danh sách" "$(status GET console/operators "$OPN")" 200

echo "— Mất điện thoại: đặt lại xác thực hai lớp"
check "Không tự đặt lại của mình → 403" "$(status POST "console/operators/$ME_ID/reset-mfa" "$ADM" '{"reason":"Thử tự đặt lại"}')" 403
_s5=$(call POST "console/operators/$OPN_ID/reset-mfa" "$ADM" '{"reason":"Mất điện thoại, đã gọi video xác minh"}') || :
check "Đặt lại xác thực hai lớp" "$(echo "$_s5" | py "[o['mfa'] for o in d['operators'] if o['userId']=='$OPN_ID']")" "[False]"
check "Đặt lại lần nữa (chưa liên kết) → 409" "$(status POST "console/operators/$OPN_ID/reset-mfa" "$ADM" '{"reason":"Thử lần hai nữa"}')" 409
T2=$(clogin "$NEWOP" "$P2" | field data.session.accessToken)
check "Đăng nhập lại phải liên kết ứng dụng xác thực mới" "$(call GET console/mfa "$T2" | py "(d['enrolled'], d['verified'])")" "(False, False)"

echo "— Quên mật khẩu"
clear_mail; start "$NEWOP" >/dev/null
T3=$(setpw "$NEWOP" "$P3"); need "Đặt mật khẩu mới bằng OTP" "$T3"
check "Mật khẩu cũ không còn dùng được" "$(clogin "$NEWOP" "$P2" | field error.code)" AUTH_INVALID_CREDENTIALS
need "Mật khẩu mới đăng nhập được" "$(clogin "$NEWOP" "$P3" | field data.session.accessToken)"
check "Quên mật khẩu không đổi vai trò" "$(sql "select role from public.platform_operators where email='$NEWOP'")" platform_admin

echo "— Nhật ký"
check "Nhật ký ghi đủ thao tác" "$(sql "select string_agg(distinct action, ',' order by action) from public.audit_logs where action like 'operator.%' or action = 'console.password_reset'")" \
  "console.password_reset,operator.activated,operator.bootstrapped,operator.invite_revoked,operator.invited,operator.mfa_reset,operator.updated"
echo "operators-smoke: đạt"
