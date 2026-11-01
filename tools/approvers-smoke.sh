#!/bin/bash
# Kiểm thử người duyệt ở công ty vừa tạo từ Console (chỉ có Quản trị viên, chưa ai giữ Nhân sự vận hành/Kế toán):
# quản trị viên duyệt được bước Phòng Nhân sự và nhận thông báo, không tự duyệt đơn của mình; checklist cảnh báo thiếu vai trò;
# hồ sơ/danh sách lựa chọn hiện vai trò đang giữ; gán thêm vai trò giữ nguyên vai trò cũ.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
clogin() { call POST console/auth/login "" "{\"email\":\"$1\",\"password\":\"$2\"}" | field data.session.accessToken; }
pw() { python3 -c "import secrets; print('Kv' + secrets.token_urlsafe(12) + '9a')"; }
TODAY=$(today)

echo "— Công ty mới từ Console"
PA=$(pw); OPERATOR_PASSWORD=$PA bash "$(dirname "$0")/create-operator.sh" op.duyet@kavor.test "Vận Hành Duyệt" >/dev/null
OP=$(mfa "$(clogin op.duyet@kavor.test "$PA")" console); need "Nhân viên Kavor bật MFA" "$OP"
B='{"code":"TSD-001","name":"Thủy Sinh Demo","plan":"trial","employeeLimit":50,"adminName":"Đoàn Quản Trị","adminEmail":"admin@tsd.test"}'
check "Tạo công ty, quản trị viên đầu tiên mã ADMIN01" "$(call POST console/tenants "$OP" "$B" | field data.tenant.tenantAdmins.0.code)" ADMIN01
ADM1=$(activate ADMIN01 admin@tsd.test); need "Quản trị viên kích hoạt" "$ADM1"
ADM=$(mfa "$ADM1"); need "Quản trị viên bật MFA" "$ADM"
check "Quản trị viên chỉ có vai trò Quản trị viên công ty" "$(call GET admin/me "$ADM" | py "sorted(r['code'] for r in d['roles'])")" "['employee', 'tenant_admin']"

r=$(call GET admin/settings/checklist "$ADM")
check "Checklist cảnh báo chưa có Nhân sự vận hành (quản trị viên duyệt thay) và chưa có Kế toán" \
  "$(echo "$r" | py "[(s['key'], s['state'], 'duyệt thay' in s['detail']) for s in d['steps'] if s['key'] in ('hr_ops','payroll')]")" "[('hr_ops', 'warn', True), ('payroll', 'warn', False)]"

echo "— Nhân viên gửi đơn chỉ có bước Phòng Nhân sự"
org=$(call GET admin/org "$ADM")
DEP=$(echo "$org" | py "[x['id'] for x in d['departments'] if x['name']=='Hành chính – Nhân sự'][0]")
POS=$(echo "$org" | py "[x['id'] for x in d['positions'] if x['name']=='Nhân viên'][0]")
ADMIN_ID=$(echo "$org" | py "[x['id'] for x in d['employees'] if x['code']=='ADMIN01'][0]")
check "Danh sách chọn quản lý có vai trò đang giữ" "$(echo "$org" | py "[x['roles'] for x in d['employees'] if x['code']=='ADMIN01'][0]")" "['tenant_admin']"
B="{\"employeeCode\":\"TS001\",\"fullName\":\"Đoàn Nhân Viên\",\"workEmail\":\"nv1@tsd.test\",\"hireDate\":\"$TODAY\",\"employmentType\":\"official\",\"departmentId\":\"$DEP\",\"positionId\":\"$POS\",\"managerEmployeeId\":\"$ADMIN_ID\"}"
NV_ID=$(call POST admin/employees "$ADM" "$B" | field data.id); need "Tạo nhân viên, quản lý trực tiếp là quản trị viên" "$NV_ID"
EMP=$(activate TS001 nv1@tsd.test); need "Nhân viên kích hoạt trên app" "$EMP"
RQ=$(call POST me/requests/profile "$EMP" '{"phone":"0901234567"}')
RID=$(echo "$RQ" | field data.id); NO=$(echo "$RQ" | field data.no)
check "Đơn sửa hồ sơ chờ bước Phòng Nhân sự" "$(echo "$RQ" | py "[(s['resolver'], s['status']) for s in d['steps'] if s['status']!='skipped']")" "[('hr', 'pending')]"
T=$(call GET "admin/requests/$RID" "$ADM" | field data.myTaskId)
need "Quản trị viên (không có Nhân sự vận hành) thấy nút duyệt bước HR" "$T"
check "Quản trị viên nhận thông báo đơn chờ duyệt" "$(call GET me/notifications "$ADM1" | py "any('$NO' in (i['title'] + i['body']) for i in d['items'])")" True
check "Quản trị viên duyệt bước HR → đơn hoàn tất" "$(call POST "admin/approvals/$T/approve" "$ADM" '{}' | field data.status)" approved

echo "— Không tự duyệt đơn của mình"
R2=$(call POST me/requests/profile "$ADM1" '{"phone":"0907654321"}' | field data.id)
check "Đơn của chính quản trị viên: không có nút duyệt" "$(call GET "admin/requests/$R2" "$ADM" | field data.myTaskId)" ""

echo "— Gán thêm vai trò giữ nguyên vai trò cũ"
B="{\"employeeId\":\"$ADMIN_ID\",\"roleCode\":\"hr_ops\",\"scopeType\":\"tenant\",\"effectiveFrom\":\"$TODAY\"}"
check "Gán thêm Nhân sự vận hành cho quản trị viên" "$(status POST admin/roles/assignments "$ADM" "$B")" 201
check "Hồ sơ hiện cả hai vai trò" "$(call GET admin/employees/$ADMIN_ID "$ADM" | py "sorted(r['code'] for r in d['roles'])")" "['hr_ops', 'tenant_admin']"
check "Checklist hết cảnh báo Nhân sự vận hành" "$(call GET admin/settings/checklist "$ADM" | py "[s['state'] for s in d['steps'] if s['key']=='hr_ops'][0]")" done
echo "— Cấp quản lý của chức danh và quản lý trực tiếp"
org=$(call GET admin/org "$ADM")
check "Chức danh mẫu có cấp quản lý" "$(echo "$org" | py "sorted((x['name'], x['tier']) for x in d['positions'] if x['tier'])")" "[('Ban Giám đốc', 4), ('Nhân viên', 1), ('Quản lý', 3)]"
pid() { echo "$org" | py "[x['id'] for x in d['positions'] if x['name']=='$1'][0]"; }
P_NV=$(pid "Nhân viên"); P_QL=$(pid "Quản lý"); P_QTV=$(pid "Quản trị viên")
emp() { echo "{\"employeeCode\":\"$1\",\"fullName\":\"$2\",\"workEmail\":\"$3\",\"hireDate\":\"$TODAY\",\"employmentType\":\"official\",\"departmentId\":\"$DEP\",\"positionId\":\"$4\"${5:+,\"managerEmployeeId\":\"$5\"}}"; }
r=$(call POST admin/employees "$ADM" "$(emp TS002 'Nhân Viên Hai' nv2@tsd.test "$P_NV" "$NV_ID")")
check "Nhân viên không làm quản lý trực tiếp của nhân viên → 409 kèm lý do" "$(echo "$r" | field error.code) $(echo "$r" | field error.message | cut -d: -f1)" "CONFLICT Quản lý trực tiếp phải có cấp quản lý cao hơn"
QL_ID=$(call POST admin/employees "$ADM" "$(emp TS003 'Trưởng Phòng' ql@tsd.test "$P_QL")" | field data.id); need "Tạo quản lý (cấp Quản lý)" "$QL_ID"
check "Quản lý quản lý nhân viên được" "$(call PATCH admin/employees/$NV_ID "$ADM" "{\"managerEmployeeId\":\"$QL_ID\"}" | field data.manager.name)" "Trưởng Phòng"
check "Đổi nhân viên lên chức danh Quản lý khi quản lý cũng là Quản lý → 409" "$(status PATCH admin/employees/$NV_ID "$ADM" "{\"positionId\":\"$P_QL\"}")" 409
check "Danh sách chọn quản lý có cấp, chức danh của từng người" "$(call GET admin/org "$ADM" | py "[(x['tier'], x['position']) for x in d['employees'] if x['code']=='TS003'][0]")" "(3, 'Quản lý')"
Q2=$(call POST admin/employees "$ADM" "$(emp TS004 'Trợ Lý' tl@tsd.test "$P_QTV" "$ADMIN_ID")" | field data.id); need "Chức danh chưa phân cấp: không chặn" "$Q2"
r=$(call PATCH admin/employees/$ADMIN_ID "$ADM" "{\"managerEmployeeId\":\"$Q2\"}")
check "A quản lý B thì B không quản lý A được (vòng) → 409" "$(echo "$r" | field error.code) $(echo "$r" | field error.message | grep -c 'vòng quản lý')" "CONFLICT 1"
check "Checklist: không sai, còn chức danh chưa đặt cấp" "$(call GET admin/settings/checklist "$ADM" | py "[(s['state'], 'chưa đặt cấp' in s['detail']) for s in d['steps'] if s['key']=='reporting'][0]")" "('todo', True)"
CSV=$(mktemp); printf 'employee_code,full_name,work_email,hire_date,employment_type,department_code,position_code,manager_code\nTS010,Mười,muoi@tsd.test,%s,official,HCNS,QTV,TS011\nTS011,Mười Một,muoimot@tsd.test,%s,official,HCNS,QTV,TS010\nTS012,Mười Hai,muoihai@tsd.test,%s,official,HCNS,QL,TS002X\nTS013,Mười Ba,muoiba@tsd.test,%s,official,HCNS,QL,TS005\nTS005,Năm,nam@tsd.test,%s,official,HCNS,NV,\n' "$TODAY" "$TODAY" "$TODAY" "$TODAY" "$TODAY" > "$CSV"
B=$(python3 -c "import json,sys; print(json.dumps({'fileName':'x.csv','csv':open(sys.argv[1],encoding='utf-8').read(),'dryRun':True}))" "$CSV"); rm -f "$CSV"
r=$(call POST admin/employees/import "$ADM" "$B")
check "Nhập file: vòng quản lý giữa hai dòng mới bị báo lỗi" "$(echo "$r" | py "[any('vòng' in e for e in x['errors']) for x in d['rows'] if x['code'] in ('TS010','TS011')]")" "[True, True]"
check "Nhập file: quản lý cấp thấp hơn (Nhân viên quản lý Quản lý) bị báo lỗi" "$(echo "$r" | py "[any('cấp cao hơn' in e for e in x['errors']) for x in d['rows'] if x['code']=='TS013']")" "[True]"
echo "Tất cả bước người duyệt ở công ty mới đều đạt."
