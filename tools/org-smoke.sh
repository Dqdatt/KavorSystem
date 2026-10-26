#!/usr/bin/env bash
# Cơ cấu tổ chức + vai trò & phân quyền trên web HR (docs/plans/org-roles.md): thêm/sửa/ngừng đơn vị, chặn ngừng khi còn người,
# gán vai trò theo phạm vi (có tác dụng ngay), thu hồi, không gỡ Tenant Admin cuối cùng. Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HDG=10000000-0000-4000-8000-000000000001; MKT=40000000-0000-4000-8000-000000000005; AE=50000000-0000-4000-8000-000000000008
BR_TB=30000000-0000-4000-8000-000000000012
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
TODAY=$(today)

HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "Tenant Admin + HR Hải Đăng bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"

echo "— Cơ cấu tổ chức"
O=$(call GET admin/organization "$HR")
check "HR xem cơ cấu: 1 pháp nhân, 3 chi nhánh, 6 phòng ban, sửa được" "$(echo "$O" | py "(d['metrics']['legalEntities'], d['metrics']['branches'], d['metrics']['departments'], d['canManage'])")" "(1, 3, 6, True)"
check "Đếm người theo phòng ban (Marketing)" "$(echo "$O" | py "[u['employees'] for u in d['units'] if u['code']=='MKT'][0] > 0")" True
MKT_BR=$(echo "$O" | py "[u['branchId'] for u in d['units'] if u['code']=='MKT'][0]")
check "Quản lý chỉ xem, không sửa" "$(call GET admin/organization "$MGR" | py "d['canManage']"):$(status POST admin/organization/units "$MGR" "{\"kind\":\"position\",\"code\":\"X\",\"name\":\"Thử quyền\"}")" "False:403"
check "Kế toán không xem cơ cấu → 403" "$(status GET admin/organization "$PAY")" 403
B="{\"kind\":\"department\",\"code\":\"mkt-dig\",\"name\":\"Digital Marketing\",\"branchId\":\"$MKT_BR\",\"parentId\":\"$MKT\"}"
O=$(call POST admin/organization/units "$HR" "$B")
DIG=$(echo "$O" | py "[u['id'] for u in d['units'] if u['code']=='MKT-DIG'][0]"); need "Thêm phòng Digital Marketing (mã viết hoa) dưới Marketing" "$DIG"
check "Phòng con thuộc Marketing, cùng chi nhánh" "$(echo "$O" | py "[(u['parentId'], u['branchId']) for u in d['units'] if u['code']=='MKT-DIG'][0] == ('$MKT', '$MKT_BR')")" True
check "Trùng mã → 409" "$(status POST admin/organization/units "$HR" "$B")" 409
check "Chi nhánh của công ty khác → 400" "$(status POST admin/organization/units "$HR" "{\"kind\":\"department\",\"code\":\"LA\",\"name\":\"Phòng lạ\",\"branchId\":\"$BR_TB\"}")" 400
check "Ngày hiệu lực trong quá khứ → 400" "$(status POST admin/organization/units "$HR" "{\"kind\":\"position\",\"code\":\"OLD\",\"name\":\"Cũ\",\"effectiveFrom\":\"2020-01-01\"}")" 400
check "Đổi tên phòng" "$(call PATCH "admin/organization/units/department/$DIG" "$HR" '{"name":"Marketing số"}' | py "[u['name'] for u in d['units'] if u['id']=='$DIG'][0]")" "Marketing số"
O=$(call POST admin/organization/units "$HR" '{"kind":"position","code":"DS","name":"Chuyên viên dữ liệu","jobLevel":"L2"}')
DS=$(echo "$O" | py "[u['id'] for u in d['units'] if u['code']=='DS'][0]"); need "Thêm chức danh" "$DS"
NEW="{\"employeeCode\":\"HD0400\",\"fullName\":\"Võ Minh Khoa\",\"workEmail\":\"khoa.vo@haidang.vn\",\"hireDate\":\"$TODAY\",\"employmentType\":\"official\",\"departmentId\":\"$DIG\",\"positionId\":\"$DS\"}"
check "Xếp nhân viên mới vào phòng/chức danh mới" "$(status POST admin/employees "$HR" "$NEW")" 201
check "Ngừng phòng còn người → 409" "$(call POST "admin/organization/units/department/$DIG/end" "$HR" '{"reason":"Sáp nhập phòng"}' | field error.message | grep -c '1 phân công nhân viên')" 1
check "Ngừng Marketing còn phòng con và người → 409" "$(call POST "admin/organization/units/department/$MKT/end" "$HR" '{"reason":"Thử ngừng"}' | field error.message | grep -c 'đơn vị con')" 1
O=$(call POST admin/organization/units "$HR" "{\"kind\":\"department\",\"code\":\"NHAM\",\"name\":\"Phòng tạo nhầm\",\"branchId\":\"$MKT_BR\"}")
NHAM=$(echo "$O" | py "[u['id'] for u in d['units'] if u['code']=='NHAM'][0]")
check "Ngừng phòng: thiếu lý do → 400" "$(status POST "admin/organization/units/department/$NHAM/end" "$HR" '{}')" 400
check "Phòng tạo nhầm hôm nay, chưa ai dùng: xóa hẳn" "$(call POST "admin/organization/units/department/$NHAM/end" "$HR" '{"reason":"Tạo nhầm"}' | py "'$NHAM' in [u['id'] for u in d['units']]")" False
O=$(call POST admin/organization/units "$HR" "{\"kind\":\"department\",\"code\":\"TMP\",\"name\":\"Phòng tạm\",\"branchId\":\"$MKT_BR\"}")
TMP=$(echo "$O" | py "[u['id'] for u in d['units'] if u['code']=='TMP'][0]")
sql "update public.departments set effective_from = '2026-01-01' where id = '$TMP'"  # giả lập phòng đã hoạt động từ đầu năm
check "Ngừng phòng cũ không còn ai: hết hiệu lực từ hôm nay, giữ lịch sử" "$(call POST "admin/organization/units/department/$TMP/end" "$HR" '{"reason":"Giải thể"}' | py "[(u['active'], u['effectiveTo'] is not None) for u in d['units'] if u['id']=='$TMP'][0]")" "(False, True)"
check "Phòng đã ngừng không còn trong danh sách chọn" "$(call GET admin/org "$HR" | py "'$TMP' in [x['id'] for x in d['departments']]")" False
check "Không xếp người vào phòng đã ngừng → 400" "$(status POST admin/employees "$HR" "$(echo "$NEW" | sed "s/HD0400/HD0401/; s/khoa.vo/khoa.vo2/; s/$DIG/$TMP/")")" 400

echo "— Vai trò & phân quyền"
R=$(call GET admin/roles "$HR")
check "5 vai trò mẫu, đúng thứ tự, có quyền gán" "$(echo "$R" | py "([r['code'] for r in d['roles']], d['canAssign'])")" "(['tenant_admin', 'hr_ops', 'payroll', 'manager', 'auditor'], True)"
check "Số người theo vai trò (Tenant Admin 1, Payroll 2)" "$(echo "$R" | py "{r['code']: r['members'] for r in d['roles']}['tenant_admin'], {r['code']: r['members'] for r in d['roles']}['payroll']")" "1 2"
check "Quản lý không xem phân quyền → 403" "$(status GET admin/roles "$MGR")" 403
check "Trước khi gán: Thu Hà chưa vào được web HR" "$(call GET admin/employees "$EMP" | field error.code)" FORBIDDEN
HA=60000000-0000-4000-8000-000000000142
check "Quản lý gán vai trò → 403" "$(status POST admin/roles/assignments "$MGR" "{\"employeeId\":\"$HA\",\"roleCode\":\"hr_ops\",\"scopeType\":\"department\",\"scopeId\":\"$MKT\",\"effectiveFrom\":\"$TODAY\"}")" 403
check "Phạm vi không hợp lệ cho Manager (toàn công ty) → 400" "$(status POST admin/roles/assignments "$HR" "{\"employeeId\":\"$HA\",\"roleCode\":\"manager\",\"scopeType\":\"tenant\",\"effectiveFrom\":\"$TODAY\"}")" 400
check "Không gán vai trò Employee bằng tay → 400" "$(status POST admin/roles/assignments "$HR" "{\"employeeId\":\"$HA\",\"roleCode\":\"employee\",\"scopeType\":\"tenant\",\"effectiveFrom\":\"$TODAY\"}")" 400
A="{\"employeeId\":\"$HA\",\"roleCode\":\"hr_ops\",\"scopeType\":\"department\",\"scopeId\":\"$MKT\",\"effectiveFrom\":\"$TODAY\"}"
R=$(call POST admin/roles/assignments "$HR" "$A")
AID=$(echo "$R" | py "[a['id'] for r in d['roles'] if r['code']=='hr_ops' for a in r['assignments'] if a['employee']['code']=='HD0142'][0]"); need "Gán HR Operations phạm vi Marketing cho Thu Hà" "$AID"
check "Hiển thị phạm vi theo tên phòng" "$(echo "$R" | py "[(a['scopeName'], a['state']) for r in d['roles'] for a in r['assignments'] if a['id']=='$AID'][0]")" "('Marketing', 'active')"
check "Gán trùng → 409" "$(status POST admin/roles/assignments "$HR" "$A")" 409
HAW=$(mfa "$EMP"); need "Thu Hà bật MFA cho web HR" "$HAW"
check "Có tác dụng ngay: Thu Hà chỉ thấy nhân viên Marketing" "$(call GET admin/employees "$HAW" | py "sorted(set(e['department']['name'] for e in d))")" "['Marketing']"
check "Ngoài phạm vi (HR) → 404" "$(status GET admin/employees/60000000-0000-4000-8000-000000000007 "$HAW")" 404
KHOA=$(sql "select id from public.employees where employee_code='HD0400' and tenant_id='$HDG'")
check "Gán cho người chưa kích hoạt (membership chờ)" "$(call POST admin/roles/assignments "$HR" "{\"employeeId\":\"$KHOA\",\"roleCode\":\"manager\",\"scopeType\":\"direct_reports\",\"effectiveFrom\":\"$TODAY\"}" | py "[a['account'] for r in d['roles'] for a in r['assignments'] if a['employee']['code']=='HD0400'][0]")" not_invited
check "Thu hồi HR Operations của Thu Hà" "$(call POST "admin/roles/assignments/$AID/revoke" "$HR" '{"reason":"Hết kiêm nhiệm"}' | py "[a['id'] for r in d['roles'] for a in r['assignments'] if a['id']=='$AID']")" "[]"
check "Thu hồi có tác dụng ngay (cùng phiên)" "$(call GET admin/employees "$HAW" | field error.code)" FORBIDDEN
TA=$(call GET admin/roles "$HR" | py "[a['id'] for r in d['roles'] if r['code']=='tenant_admin' for a in r['assignments']][0]")
check "Không thu hồi Tenant Admin cuối cùng → 409" "$(call POST "admin/roles/assignments/$TA/revoke" "$HR" '{}' | field error.code)" LAST_TENANT_ADMIN
check "Audit gán/thu hồi vai trò và thay đổi cơ cấu" "$(sql "select string_agg(distinct action, ',' order by action) from public.audit_logs where tenant_id='$HDG' and action in ('role.granted','role.revoked','organization.unit_created','organization.unit_updated','organization.unit_ended')")" \
  "organization.unit_created,organization.unit_ended,organization.unit_updated,role.granted,role.revoked"
echo "Tất cả bước cơ cấu tổ chức và phân quyền đều đạt."
