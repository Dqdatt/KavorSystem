#!/usr/bin/env bash
# Kavor Console vận hành tenant (docs/plans/console-ops.md): gói dịch vụ + giới hạn nhân sự, tạm khóa / mở lại / đóng tenant.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
pw() { python3 -c "import secrets; print('Kv' + secrets.token_urlsafe(12) + '9')"; }
clogin() { local b="{\"email\":\"$1\",\"password\":\"$2\"}"; call POST console/auth/login "" "$b" | field data.session.accessToken; }
TB_ID=10000000-0000-4000-8000-000000000002
DEPT=40000000-0000-4000-8000-000000000012; POS=50000000-0000-4000-8000-000000000012
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
TODAY=$(today)

PA=$(pw); PS=$(pw)
OPERATOR_PASSWORD=$PA bash "$(dirname "$0")/create-operator.sh" ops.a@kavor.test "Nguyễn Vận Hành" >/dev/null
OPERATOR_PASSWORD=$PS bash "$(dirname "$0")/create-operator.sh" ops.s@kavor.test "Lê Hỗ Trợ" platform_support >/dev/null
OP=$(mfa "$(clogin ops.a@kavor.test "$PA")" console); need "Platform Operator đăng nhập + MFA" "$OP"
SUP=$(mfa "$(clogin ops.s@kavor.test "$PS")" console); need "Platform Support đăng nhập + MFA" "$SUP"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant Admin công ty Mẫu B bật MFA" "$TB"
EMPB=$(activate BX0002 bich@maub.test); need "Nhân viên công ty Mẫu B kích hoạt app" "$EMPB"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Hải Đăng bật MFA" "$HR"

echo "— Gói dịch vụ và giới hạn nhân sự"
check "Danh sách gói + số tenant mỗi gói" "$(call GET console/plans "$OP" | py "[(p['code'], p['employeeLimit'], p['tenants']) for p in d]")" \
  "[('trial', 50, 0), ('starter', 100, 1), ('growth', 500, 1), ('enterprise', None, 0)]"
check "Platform Support không đổi gói → 403" "$(status POST "console/tenants/$TB_ID/plan" "$SUP" '{"plan":"growth","employeeLimit":500,"reason":"Thử quyền"}')" 403
check "Thiếu lý do → 400" "$(status POST "console/tenants/$TB_ID/plan" "$OP" '{"plan":"starter","employeeLimit":3}')" 400
check "Không thay đổi gì → 400" "$(status POST "console/tenants/$TB_ID/plan" "$OP" '{"plan":"starter","employeeLimit":50,"reason":"Không đổi"}')" 400
r=$(call POST "console/tenants/$TB_ID/plan" "$OP" '{"plan":"starter","employeeLimit":3,"reason":"Hợp đồng thử 3 người"}')
check "Đổi giới hạn còn 3 nhân sự" "$(echo "$r" | py "(d['plan'], d['employeeLimit'], d['employees'])")" "('starter', 3, 2)"
check "Web HR thấy gói và số nhân sự đang dùng" "$(call GET admin/settings "$TB" | py "(d['tenant']['plan']['name'], d['tenant']['plan']['employeeLimit'], d['tenant']['plan']['employees'])")" "('Starter', 3, 2)"
emp() { echo "{\"employeeCode\":\"$1\",\"fullName\":\"Nhân viên $1\",\"workEmail\":\"$(echo "$1" | tr A-Z a-z)@maub.test\",\"hireDate\":\"$TODAY\",\"employmentType\":\"official\",\"departmentId\":\"$DEPT\",\"positionId\":\"$POS\"}"; }
check "Thêm nhân viên thứ 3 (còn trong giới hạn)" "$(status POST admin/employees "$TB" "$(emp BX0003)")" 201
r=$(call POST admin/employees "$TB" "$(emp BX0004)")
check "Nhân viên thứ 4 bị chặn: đủ giới hạn gói" "$(echo "$r" | field error.code)" EMPLOYEE_LIMIT_REACHED
check "Thông báo nêu giới hạn và cách xử lý" "$(echo "$r" | field error.message | grep -c 'đủ 3 nhân sự của gói Starter')" 1
B3=$(sql "select id from public.employees where employee_code='BX0003' and tenant_id='$TB_ID'")
check "Chuyển BX0003 sang đã nghỉ" "$(call PATCH "admin/employees/$B3" "$TB" '{"status":"terminated"}' | py "d['status']")" terminated
check "Nghỉ việc giải phóng chỗ: thêm BX0004 được" "$(status POST admin/employees "$TB" "$(emp BX0004)")" 201
check "Đưa BX0003 quay lại làm việc khi đã đủ → bị chặn" "$(call PATCH "admin/employees/$B3" "$TB" '{"status":"active"}' | field error.code)" EMPLOYEE_LIMIT_REACHED
check "Tổng quan Console: 1 tenant gần giới hạn" "$(call GET console/overview "$OP" | py "d['nearLimitTenants']")" 1
check "Tenant thấy dòng audit đổi gói của Kavor" "$(sql "select count(*) from public.audit_logs where tenant_id='$TB_ID' and action='tenant.plan_changed' and actor_type='platform' and reason='Hợp đồng thử 3 người'")" 1

echo "— Tạm khóa tenant"
check "Platform Support không khóa được → 403" "$(status POST "console/tenants/$TB_ID/status" "$SUP" '{"action":"suspend","reason":"Thử quyền"}')" 403
check "Đóng tenant đang hoạt động → 409" "$(status POST "console/tenants/$TB_ID/status" "$OP" '{"action":"close","reason":"Thử đóng","confirmCode":"MAUB-001"}')" 409
r=$(call POST "console/tenants/$TB_ID/status" "$OP" '{"action":"suspend","reason":"Quá hạn thanh toán"}')
check "Tạm khóa, lưu lý do" "$(echo "$r" | py "(d['status'], d['statusReason'], d['statusChangedAt'] is not None)")" "('suspended', 'Quá hạn thanh toán', True)"
check "Web HR (token còn hạn) bị chặn" "$(call GET admin/me "$TB" | field error.code)" AUTH_TENANT_SUSPENDED
check "App (token còn hạn) bị chặn" "$(call GET me/profile "$EMPB" | field error.code)" AUTH_TENANT_SUSPENDED
_s1=$(call POST auth/login "" "{\"identifier\":\"bich@maub.test\",\"password\":\"$PW\"}" | field error.message) || :
check "Đăng nhập lại bị chặn, nói rõ công ty tạm ngừng" "$_s1" "Công ty đang tạm ngừng sử dụng Kavor. Liên hệ phòng Nhân sự hoặc quản trị viên công ty."
check "Công ty khác không bị ảnh hưởng" "$(status GET admin/me "$HR")" 200
check "Tổng quan Console đếm tenant tạm khóa" "$(call GET console/overview "$OP" | py "d['tenants']['suspended']")" 1

echo "— Mở lại"
check "Mở lại" "$(call POST "console/tenants/$TB_ID/status" "$OP" '{"action":"reactivate","reason":"Đã thanh toán"}' | py "d['status']")" active
check "Web HR dùng lại được (cùng token)" "$(status GET admin/me "$TB")" 200
check "App dùng lại được" "$(call GET me/profile "$EMPB" | py "d['employeeCode']")" BX0002
check "Mở lại tenant đang hoạt động → 409" "$(status POST "console/tenants/$TB_ID/status" "$OP" '{"action":"reactivate","reason":"Thử lại"}')" 409

echo "— Đóng tenant"
call POST "console/tenants/$TB_ID/status" "$OP" '{"action":"suspend","reason":"Khách dừng hợp đồng"}' >/dev/null
check "Đóng mà không gõ đúng mã → 400" "$(status POST "console/tenants/$TB_ID/status" "$OP" '{"action":"close","reason":"Hết hợp đồng","confirmCode":"MAUB"}')" 400
check "Đóng tenant đang tạm khóa" "$(call POST "console/tenants/$TB_ID/status" "$OP" '{"action":"close","reason":"Hết hợp đồng","confirmCode":"maub-001"}' | py "d['status']")" closed
check "Đã đóng không mở lại được → 409" "$(status POST "console/tenants/$TB_ID/status" "$OP" '{"action":"reactivate","reason":"Thử mở lại"}')" 409
check "Đã đóng không đổi gói được → 409" "$(status POST "console/tenants/$TB_ID/plan" "$OP" '{"plan":"growth","employeeLimit":500,"reason":"Thử đổi"}')" 409
_s1=$(status POST console/recoveries "$OP" "{\"tenantId\":\"$TB_ID\",\"kind\":\"grant_admin\",\"newAdminName\":\"Ai Đó\",\"newAdminEmail\":\"ai@maub.test\",\"verification\":\"Gọi điện xác minh giám đốc\",\"reason\":\"Thử sau khi đóng\"}") || :
check "Đã đóng không tạo khôi phục chủ sở hữu → 409" "$_s1" 409
check "App báo công ty đã ngừng sử dụng" "$(call GET me/profile "$EMPB" | field error.message)" "Công ty đã ngừng sử dụng Kavor. Liên hệ phòng Nhân sự công ty để biết thêm."
check "Tổng quan không tính tenant đã đóng" "$(call GET console/overview "$OP" | py "(d['tenants']['total'], d['tenants']['suspended'])")" "(1, 0)"
check "Audit đủ: tạm khóa ×2, mở lại, đóng" "$(sql "select string_agg(action, ',' order by created_at) from public.audit_logs where tenant_id='$TB_ID' and action in ('tenant.suspended','tenant.reactivated','tenant.closed')")" "tenant.suspended,tenant.reactivated,tenant.suspended,tenant.closed"
echo "Tất cả bước vận hành tenant đều đạt."
