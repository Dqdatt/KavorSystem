#!/usr/bin/env bash
# Kiểm thử Kavor Console: đăng nhập nhân viên Kavor + MFA, tạo tenant + mời Tenant Admin đầu tiên, Tenant Admin kích hoạt và
# dùng ngay (bộ mẫu có tổ chức/ca/quy định), khôi phục chủ sở hữu hai người (đặt lại MFA, cấp Tenant Admin mới), audit.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
pw() { python3 -c "import secrets; print('Kv' + secrets.token_urlsafe(12) + '9')"; }
clogin() { local b="{\"email\":\"$1\",\"password\":\"$2\"}"; call POST console/auth/login "" "$b" | field data.session.accessToken; }
mail_subject() { curl -s "$MAIL/api/v1/search?query=to:$1" | python3 -c "import json,sys; m=json.load(sys.stdin).get('messages') or []; print(m[0]['Subject'] if m else '')"; }
mail_text() { local id; id=$(curl -s "$MAIL/api/v1/search?query=to:$1" | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['ID'])"); curl -s "$MAIL/api/v1/message/$id" | python3 -c "import json,sys; print(json.load(sys.stdin)['Text'])"; }
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
TODAY=$(today)

echo "— Nhân viên Kavor đăng nhập Console"
PA=$(pw); PB=$(pw)
OPERATOR_PASSWORD=$PA bash "$(dirname "$0")/create-operator.sh" op.a@kavor.test "Nguyễn Vận Hành" >/dev/null
OPERATOR_PASSWORD=$PB bash "$(dirname "$0")/create-operator.sh" op.b@kavor.test "Trần Duyệt" >/dev/null
echo "✔ Tạo 2 nhân viên Kavor"
check "Sai mật khẩu → 401" "$(call POST console/auth/login "" '{"email":"op.a@kavor.test","password":"SaiMatKhau1"}' | field error.code)" AUTH_INVALID_CREDENTIALS
HRT=$(activate HD0007 thao.mai@haidang.vn)
B="{\"email\":\"thao.mai@haidang.vn\",\"password\":\"$PW\"}"
check "Tài khoản tenant đúng mật khẩu vẫn không vào được Console" "$(call POST console/auth/login "" "$B" | field error.code)" AUTH_INVALID_CREDENTIALS
A1=$(clogin op.a@kavor.test "$PA"); need "Nhân viên Kavor đăng nhập (phiên mật khẩu)" "$A1"
check "Chưa MFA: Console bị chặn" "$(call GET console/overview "$A1" | field error.code)" MFA_REQUIRED
A=$(mfa "$A1" console); need "Liên kết ứng dụng xác thực → phiên aal2" "$A"
BOP=$(mfa "$(clogin op.b@kavor.test "$PB")" console); need "Nhân viên Kavor thứ hai bật MFA" "$BOP"
check "Đúng người đăng nhập" "$(call GET console/me "$A" | field data.fullName)" "Nguyễn Vận Hành"
check "HR của tenant không gọi được API Console" "$(status GET console/me "$(mfa "$HRT")")" 403
check "Nhân viên Kavor không vào được web HR/Admin" "$(status GET admin/me "$A")" 403

echo "— Tổng quan, tạo tenant"
r=$(call GET console/overview "$A")
check "Đếm tenant, cảnh báo tenant chỉ còn 1 admin" "$(echo "$r" | py "(d['tenants']['total'], d['singleAdminTenants'], d['noActiveAdminTenants'])")" "(2, 1, 1)"
check "Mã tenant sai → 400" "$(status POST console/tenants "$A" '{"code":"a","name":"X","plan":"trial","employeeLimit":10,"adminName":"A B","adminEmail":"a@b.test"}')" 400
B='{"code":"anp-002","name":"An Phú Retail","legalName":"Công ty TNHH An Phú","plan":"starter","employeeLimit":100,"adminName":"Phạm Thị Lan","adminEmail":"Lan.Pham@anphu.test"}'
r=$(call POST console/tenants "$A" "$B")
TID=$(echo "$r" | field data.tenant.id)
check "Tạo tenant ANP-002 và gửi thư mời" "$(echo "$r" | py "(d['tenant']['code'], d['invite']['sent'], d['tenant']['tenantAdmins'][0]['code'], d['tenant']['tenantAdmins'][0]['account'])")" "('ANP-002', True, 'ADMIN01', 'invited')"
check "Trùng mã tenant → 409" "$(status POST console/tenants "$A" "$B")" 409
check "Thư mời Tenant Admin" "$(mail_subject lan.pham@anphu.test)" "Kavor: bạn là quản trị viên của An Phú Retail"
check "Thư ghi mã ADMIN01 và địa chỉ web HR" "$(mail_text lan.pham@anphu.test | python3 -c "import sys; t=sys.stdin.read(); print('ADMIN01' in t and 'http://localhost:3000' in t)")" True
ADM=$(echo "$r" | field data.tenant.tenantAdmins.0.employeeId)
check "Gửi lại thư ngay lập tức bị giới hạn" "$(status POST console/tenants/$TID/admins/$ADM/invite "$A")" 429

B='{"code":"SGC-003","name":"Saigon Creative","plan":"trial","employeeLimit":50,"adminName":"Đỗ Hoàng Nam","adminEmail":"nam@sgc.test"}'
check "Tenant thứ hai cũng có Tenant Admin mã ADMIN01" "$(call POST console/tenants "$A" "$B" | field data.tenant.tenantAdmins.0.code)" ADMIN01

echo "— Tenant Admin kích hoạt và dùng ngay"
LAN1=$(activate ADMIN01 lan.pham@anphu.test); need "Tenant Admin kích hoạt bằng mã ADMIN01 (mã trùng giữa hai công ty)" "$LAN1"
LAN=$(mfa "$LAN1"); need "Tenant Admin bật MFA trên web HR" "$LAN"
org=$(call GET admin/org "$LAN")
check "Bộ mẫu có pháp nhân, phòng ban, chức danh" "$(echo "$org" | py "(d['legalEntities'][0]['name'], len(d['departments']), len(d['positions']))")" "('Công ty TNHH An Phú', 2, 3)"
DEP=$(echo "$org" | py "[x['id'] for x in d['departments'] if x['name']=='Hành chính – Nhân sự'][0]")
POS=$(echo "$org" | py "[x['id'] for x in d['positions'] if x['name']=='Nhân viên'][0]")
for n in 1 2; do
  B="{\"employeeCode\":\"AP00$n\",\"fullName\":\"Nhân viên $n\",\"workEmail\":\"nv$n@anphu.test\",\"hireDate\":\"$TODAY\",\"employmentType\":\"official\",\"departmentId\":\"$DEP\",\"positionId\":\"$POS\"}"
  check "Tạo nhân viên thứ $n trên web (trước đây nhân viên thứ hai bị chặn nhầm)" "$(call POST admin/employees "$LAN" "$B" | field data.code)" "AP00$n"
done
check "Bộ mẫu có ca HC + 5 quy định (giải trình, tạm ứng, nhắc nhở, phép năm, làm thêm giờ)" "$(call GET admin/rules "$LAN" | py "len(d)") $(call GET admin/shifts "$LAN" | py "d[0]['code']")" "5 HC"
check "Tenant mới không thấy dữ liệu tenant khác" "$(status GET admin/employees/60000000-0000-4000-8000-000000000142 "$LAN")" 404
r=$(call GET console/tenants/$TID "$A")
check "Console thấy admin đã kích hoạt + đã có MFA" "$(echo "$r" | py "(d['tenantAdmins'][0]['account'], d['tenantAdmins'][0]['mfaEnrolled'], d['admins']['active'], d['employees'])")" "('active', True, 1, 3)"
check "Không gửi lời mời cho admin đã kích hoạt" "$(status POST console/tenants/$TID/admins/$ADM/invite "$A")" 404

echo "— Khôi phục: đặt lại MFA (Tenant Admin mất điện thoại)"
B="{\"tenantId\":\"$TID\",\"kind\":\"mfa_reset\",\"targetEmployeeId\":\"$ADM\",\"verification\":\"ngắn\",\"reason\":\"Mất điện thoại\"}"
check "Thiếu mô tả xác minh → 400" "$(status POST console/recoveries "$A" "$B")" 400
B="{\"tenantId\":\"$TID\",\"kind\":\"mfa_reset\",\"targetEmployeeId\":\"$ADM\",\"verification\":\"Gọi lại số tổng đài trên giấy ĐKKD, đối chiếu CCCD qua video\",\"reason\":\"Tenant Admin báo mất điện thoại\"}"
REC=$(call POST console/recoveries "$A" "$B" | field data.id); need "Tạo yêu cầu đặt lại MFA" "$REC"
check "Trùng yêu cầu đang chờ → 409" "$(status POST console/recoveries "$A" "$B")" 409
check "Người tạo không tự duyệt" "$(status POST console/recoveries/$REC/approve "$A" '{}')" 403
r=$(call POST console/recoveries/$REC/approve "$BOP" '{"note":"Đã gọi lại xác nhận"}')
check "Người thứ hai duyệt → xóa ứng dụng xác thực" "$(echo "$r" | py "(d['status'], d['result']['removedFactors'], d['decidedBy'])")" "('approved', 1, 'Trần Duyệt')"
check "Đã duyệt không duyệt lại được" "$(status POST console/recoveries/$REC/approve "$BOP" '{}')" 409
check "Tenant Admin phải liên kết lại ứng dụng xác thực" "$(call GET admin/mfa "$LAN" | field data.enrolled)" False
check "Tenant thấy việc Kavor đặt lại MFA trong audit" "$(call GET admin/employees/$ADM "$LAN" | py "'auth.mfa_reset' in [a['action'] for a in d['audit']]")" True

echo "— Khôi phục: cấp Tenant Admin mới (admin cũ nghỉ việc)"
B="{\"tenantId\":\"$TID\",\"kind\":\"grant_admin\",\"newAdminName\":\"Võ Minh Tâm\",\"newAdminEmail\":\"tam.vo@anphu.test\",\"verification\":\"Công văn có dấu đỏ của công ty, gọi lại giám đốc theo số ĐKKD\",\"reason\":\"Tenant Admin cũ đã nghỉ việc\"}"
G1=$(call POST console/recoveries "$A" "$B" | field data.id)
check "Từ chối phải có lý do" "$(status POST console/recoveries/$G1/reject "$BOP" '{}')" 400
check "Từ chối yêu cầu" "$(call POST console/recoveries/$G1/reject "$BOP" '{"note":"Chưa đủ giấy tờ xác minh"}' | field data.status)" rejected
G2=$(call POST console/recoveries "$A" "$B" | field data.id)
check "Người khác không hủy hộ được" "$(status POST console/recoveries/$G2/cancel "$BOP" '{}')" 403
r=$(call POST console/recoveries/$G2/approve "$BOP" '{}')
check "Duyệt → tạo hồ sơ ADMIN02 + gửi thư mời" "$(echo "$r" | py "(d['status'], d['result']['employeeCode'], d['result']['invited'])")" "('approved', 'ADMIN02', True)"
check "Thư mời tới người mới" "$(mail_subject tam.vo@anphu.test)" "Kavor: bạn là quản trị viên của An Phú Retail"
check "Tenant có 2 Tenant Admin (1 chờ kích hoạt)" "$(call GET console/tenants/$TID "$A" | py "sorted((a['code'], a['account']) for a in d['tenantAdmins'])")" "[('ADMIN01', 'active'), ('ADMIN02', 'invited')]"
B="{\"tenantId\":\"$TID\",\"kind\":\"grant_admin\",\"newAdminName\":\"Người Thử\",\"newAdminEmail\":\"thu@anphu.test\",\"verification\":\"Thử hủy yêu cầu tạo nhầm trong smoke\",\"reason\":\"Tạo nhầm để thử hủy\"}"
G3=$(call POST console/recoveries "$A" "$B" | field data.id)
check "Người tạo tự hủy được" "$(call POST console/recoveries/$G3/cancel "$A" '{}' | field data.status)" cancelled

echo "— Audit nền tảng"
check "Audit ghi tạo tenant, mời, khôi phục" "$(call GET console/audit "$A" | py "all(x in {a['action'] for a in d} for x in ['console.login','tenant.created','employee.invited','owner_recovery.requested','owner_recovery.approved','owner_recovery.rejected','owner_recovery.cancelled','auth.mfa_reset','role.granted'])")" True
check "Tổng quan: không còn yêu cầu chờ" "$(call GET console/overview "$A" | py "(d['tenants']['total'], d['pendingRecoveries'])")" "(4, 0)"
echo "Tất cả bước Kavor Console đều đạt."
