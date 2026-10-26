#!/usr/bin/env bash
# Payroll đầu-cuối qua API thật. SQL chỉ tạo fixture quyền và đọc hậu điều kiện;
# không ghi kỳ/batch/kết quả/phiếu lương trực tiếp. Chạy trên DB vừa reset.
# Ngày lấy từ API tenant; đổi kỳ công về tháng dương lịch để OT hôm nay và tạm ứng cùng tháng luôn khớp.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
csvbody() { python3 -c 'import json,sys; print(json.dumps({"fileName":"payroll-smoke.csv","csv":sys.stdin.read()}))' <<< "$1"; }
HA=60000000-0000-4000-8000-000000000142
TENANT=10000000-0000-4000-8000-000000000001
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Kích hoạt nhân viên nhận phiếu" "$EMP"
LINH=$(activate HDG0005 linh.vo@example.test); need "Kích hoạt nhân viên thứ hai" "$LINH"
MGR=$(activate HDG0003 huy.le@example.test); need "Kích hoạt quản lý" "$MGR"
AN=$(activate HDG0001 an.nguyen@example.test); need "Kích hoạt người duyệt tạm ứng thứ hai" "$AN"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR bật MFA" "$HR"
PAY1=$(activate HD0215 nhung.do@haidang.vn); need "Kích hoạt Kế toán nhập" "$PAY1"
check "Kế toán chưa MFA bị chặn" "$(call GET admin/payroll/cycles "$PAY1" | field error.code)" MFA_REQUIRED
PAY1=$(mfa "$PAY1"); need "Kế toán nhập bật MFA" "$PAY1"
PAY2=$(mfa "$(activate HD0216 chau.nguyen@example.test)"); need "Kế toán duyệt bật MFA" "$PAY2"
MGRW=$(mfa "$MGR"); need "Quản lý bật MFA" "$MGRW"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant B bật MFA" "$TB"
check "Kích hoạt gán employee/self cho cả NV, quản lý, HR, Kế toán và tenant B" "$(sql "select count(*) from public.role_assignments ra join public.roles r on r.id=ra.role_id where r.code='employee' and r.tenant_id is null and ra.scope_type='self' and ra.effective_from=public.tenant_today(ra.tenant_id)")" 8
check "Kích hoạt không cấp role employee ở scope người khác" "$(sql "select count(*) from public.role_assignments ra join public.roles r on r.id=ra.role_id where r.code='employee' and r.tenant_id is null and ra.scope_type<>'self'")" 0
TODAY=$(call GET me/advance "$EMP" | field data.today); MON=${TODAY:0:7}
PREV=$(python3 -c "import datetime; d=datetime.date.fromisoformat('$TODAY').replace(day=1)-datetime.timedelta(days=1); print(d.strftime('%Y-%m'))")
NEXT=$(python3 -c "import datetime; d=datetime.date.fromisoformat('$TODAY').replace(day=28)+datetime.timedelta(days=4); print(d.strftime('%Y-%m'))")
ROOT=admin/payroll/cycles/$MON
check "Không token → 401" "$(status GET admin/payroll/cycles)" 401
check "HR/Admin không mặc định xem lương" "$(status GET admin/payroll/cycles "$HR")" 403
check "Quản lý không mặc định xem lương" "$(status GET admin/payroll/cycles "$MGRW")" 403
check "Nhân viên không nhập lương" "$(status POST admin/payroll/cycles "$EMP" '{}')" 403
check "Kế toán xem danh sách trống" "$(call GET admin/payroll/cycles "$PAY1" | py "len(d['cycles'])")" 0
check "Tháng sai → 400" "$(status GET admin/payroll/cycles/2026-13 "$PAY1")" 400
check "Kỳ không tồn tại → 404" "$(status GET "$ROOT" "$PAY1")" 404
check "Ngày trả không hợp lệ → 400" "$(status POST admin/payroll/cycles "$PAY1" '{"month":"2026-10","payDate":"2026-02-30"}')" 400

echo "— Mở kỳ và fixture quyền"
check "Đặt kỳ công ngày 1" "$(call PATCH admin/settings "$HR" '{"attendance":{"periodStartDay":1}}' | field data.attendance.periodStartDay)" 1
B="{\"month\":\"$MON\",\"payDate\":\"$TODAY\"}"
r=$(call POST admin/payroll/cycles "$PAY1" "$B"); CID=$(echo "$r" | field data.cycle.id)
check "Mở kỳ chụp đầu tháng" "$(echo "$r" | py "(d['cycle']['status'], d['cycle']['periodStart'])")" "('open', '$MON-01')"
check "Mở trùng kỳ → 409" "$(status POST admin/payroll/cycles "$PAY1" "$B")" 409
check "Không có kết quả chưa gửi được → 409" "$(status POST "$ROOT/submit" "$PAY1" '{}')" 409
check "Danh mục đọc từ tenant, có NET/ADVANCE" "$(call GET "$ROOT" "$PAY1" | py "set(['NET','ADVANCE']) <= {x['code'] for x in d['components']}")" True
# Chỉ fixture quyền. Vai trò scoped có toàn bộ permission payroll nhưng chỉ phòng Marketing.
sql "insert into public.roles (tenant_id, code, name) values ('$TENANT','payroll_smoke_scoped','Payroll smoke phạm vi'), ('$TENANT','payroll_smoke_reopen','Payroll smoke mở lại');
insert into public.role_permissions (role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.tenant_id='$TENANT' and ((r.code='payroll_smoke_scoped' and p.code in ('payroll.read','payroll.import','payroll.approve','payroll.publish','payroll.cycle.reopen')) or (r.code='payroll_smoke_reopen' and p.code='payroll.cycle.reopen'));
insert into public.role_assignments (tenant_id,membership_id,role_id,scope_type,scope_id,effective_from)
select '$TENANT',m.id,r.id,'department','40000000-0000-4000-8000-000000000005',public.tenant_today('$TENANT') from public.memberships m join public.roles r on r.code='payroll_smoke_scoped' and r.tenant_id='$TENANT' where m.employee_id='60000000-0000-4000-8000-000000000003';
insert into public.role_assignments (tenant_id,membership_id,role_id,scope_type,effective_from)
select m.tenant_id,m.id,r.id,'tenant',public.tenant_today(m.tenant_id) from public.memberships m join public.employees e on e.id=m.employee_id join public.roles r on r.code='payroll' and r.tenant_id is null where e.employee_code='BX0001';" >/dev/null
check "Phạm vi phòng không xem kỳ trống → 404" "$(status GET "$ROOT" "$MGRW")" 404
check "Phạm vi phòng không mở kỳ → 404" "$(status POST admin/payroll/cycles "$MGRW" "$B")" 404
check "Tenant khác có payroll.read vẫn trả 404" "$(status GET "$ROOT" "$TB")" 404
check "Tenant khác không liệt kê kỳ tenant A" "$(call GET admin/payroll/cycles "$TB" | py "len(d['cycles'])")" 0

echo "— Nhập lỗi, batch bất biến và chặn gửi"
B=$(csvbody $'employee_code,BASE,NET,work_days,UNKNOWN\nHD0142,1,1,0,\n')
check "Cột lạ là lỗi chặn" "$(call POST "$ROOT/import" "$PAY1" "$B" | py "(d['batch']['applied'], 'HEADER_UNKNOWN' in [x['code'] for x in d['batch']['errors']])")" "(False, True)"
B=$(csvbody $'employee_code,BASE,NET,work_days\nHD0142,10,9,32\nHD0142,abc,0,0\nBX0001,0,0,0\nKHONG_CO,0,0,0')
r=$(call POST "$ROOT/import" "$PAY1" "$B")
check "Trùng NV, mã lạ/khác tenant, ô số, NET, work_days đều được chẩn đoán" "$(echo "$r" | py "set(['EMPLOYEE_DUPLICATE','EMPLOYEE_UNKNOWN','MONEY_INVALID','NET_MISMATCH','WORK_DAYS_INVALID']) <= {x['code'] for x in d['batch']['errors']}")" True
check "Đếm dòng lỗi, không áp kết quả" "$(echo "$r" | py "(d['batch']['errorRows'], d['batch']['applied'])")" "(4, False)"
check "Chi tiết kỳ vẫn hiện lỗi mã không thuộc công ty" "$(call GET "$ROOT" "$PAY1" | py "sorted(x['employeeCode'] for x in d['errors'] if x['code']=='EMPLOYEE_UNKNOWN')")" "['BX0001', 'KHONG_CO']"
check "File lỗi chưa gửi được → 409" "$(status POST "$ROOT/submit" "$PAY1" '{}')" 409
B=$(csvbody $'employee_code,BASE\nHD0142,100')
check "Thiếu NET là lỗi chặn" "$(call POST "$ROOT/import" "$PAY1" "$B" | py "'HEADER_REQUIRED' in {x['code'] for x in d['batch']['errors']}")" True
B=$(csvbody $'employee_code,NET\nHD0142,0\nHD0142,0')
check "Mã trùng bị chặn" "$(call POST "$ROOT/import" "$PAY1" "$B" | py "'EMPLOYEE_DUPLICATE' in {x['code'] for x in d['batch']['errors']}")" True
B=$(csvbody $'employee_code,NET,note\nHD0142,0,"chưa đóng')
check "CSV quote lỗi được lưu batch" "$(call POST "$ROOT/import" "$PAY1" "$B" | py "'CSV_SYNTAX' in {x['code'] for x in d['batch']['errors']}")" True
B=$(csvbody '')
check "File trống được lưu và không áp" "$(call POST "$ROOT/import" "$PAY1" "$B" | py "(d['batch']['totalRows'], d['batch']['applied'], d['batch']['errors'][0]['code'])")" "(0, False, 'CSV_EMPTY')"
check "Batch trống vẫn chặn submit" "$(status POST "$ROOT/submit" "$PAY1" '{}')" 409

echo "— Tạm ứng/OT qua API, không phụ thuộc ngày chạy"
B='{"kind":"salary_advance","code":"PAYROLL-SMOKE","name":"Tạm ứng smoke payroll","config":{"enabled":true,"maxPercent":50,"excludeProbation":true,"excludeNoticePeriod":true,"deadlineDay":31,"minAmount":500000},"effectiveFrom":"'$TODAY'"}'
RID=$(call POST admin/rules "$HR" "$B" | field data.id); need "Tạo quy định nhận tạm ứng đến cuối tháng" "$RID"
B="{\"kind\":\"salary_advance\",\"targetId\":\"$RID\",\"scopeType\":\"employee\",\"scopeId\":\"$HA\",\"effectiveFrom\":\"$TODAY\",\"reason\":\"Smoke payroll không phụ thuộc ngày\"}"
check "Áp dụng quy định cho nhân viên thử" "$(call POST admin/policy-assignments "$HR" "$B" | field data.state)" active
r=$(call POST me/requests/advance "$EMP" '{"amount":2000000,"reason":"Smoke payroll"}'); ADV=$(echo "$r" | field data.id); T1=$(echo "$r" | field data.steps.0.taskId)
check "Quản lý duyệt tạm ứng" "$(call POST me/approvals/$T1/approve "$MGR" '{}' | field data.status)" pending
T3=$(call GET admin/requests/$ADV "$PAY1" | field data.myTaskId)
check "Kế toán duyệt tạm ứng, chưa chi" "$(call POST admin/approvals/$T3/approve "$PAY1" '{}' | field data.status)" approved
B=$(csvbody $'employee_code,BASE,ADVANCE,NET\nHD0142,15000000,2000000,13000000')
check "Đã duyệt nhưng chưa chi không tính vào đối chiếu" "$(call POST "$ROOT/import" "$PAY1" "$B" | py "'ADVANCE_MISMATCH' in {x['code'] for x in d['batch']['warnings']}")" True
check "Kế toán xác nhận đã chi" "$(call POST admin/advances/$ADV/paid "$PAY1" '{}' | py "d['payout'] is not None")" True
B="{\"date\":\"$TODAY\",\"start\":\"18:00\",\"end\":\"19:00\",\"reason\":\"Smoke đối chiếu payroll\"}"
r=$(call POST me/requests/overtime "$EMP" "$B"); OT=$(echo "$r" | field data.id); T1=$(echo "$r" | field data.steps.0.taskId)
check "Quản lý duyệt OT" "$(call POST me/approvals/$T1/approve "$MGR" '{}' | field data.status)" pending
T2=$(call GET admin/requests/$OT "$HR" | field data.myTaskId)
check "HR duyệt OT hoàn tất" "$(call POST admin/approvals/$T2/approve "$HR" '{}' | field data.status)" approved
# Hai khoản đã chi khác: một người có dòng nhưng ADVANCE lệch; một người thiếu hẳn dòng CSV.
paid_fixture() {
  local tok=$1 empid=$2 r rid task
  B="{\"kind\":\"salary_advance\",\"targetId\":\"$RID\",\"scopeType\":\"employee\",\"scopeId\":\"$empid\",\"effectiveFrom\":\"$TODAY\",\"reason\":\"Smoke khoản tạm ứng lệch hoặc thiếu\"}"
  call POST admin/policy-assignments "$HR" "$B" >/dev/null
  r=$(call POST me/requests/advance "$tok" '{"amount":1000000,"reason":"Smoke đối chiếu thiếu"}')
  rid=$(echo "$r" | field data.id); task=$(echo "$r" | field data.steps.0.taskId)
  call POST me/approvals/$task/approve "$AN" '{}' >/dev/null
  task=$(call GET admin/requests/$rid "$PAY1" | field data.myTaskId)
  call POST admin/approvals/$task/approve "$PAY1" '{}' >/dev/null
  call POST admin/advances/$rid/paid "$PAY1" '{}' >/dev/null
  printf '%s' "$rid"
}
ADV_LINH=$(paid_fixture "$LINH" 60000000-0000-4000-8000-000000000005)
ADV_MGR=$(paid_fixture "$MGR" 60000000-0000-4000-8000-000000000003)
check "Có thêm hai tạm ứng đã chi qua API" "$(sql "select count(*) from public.salary_advances where request_id in ('$ADV_LINH','$ADV_MGR') and paid_at is not null")" 2

echo "— Cảnh báo không chặn, kỳ chụp và phạm vi"
B=$(csvbody $'\357\273\277employee_code,BASE,OT_PAY,ADVANCE,NET,work_days,note\r\nHD0142,15.000.000,0,1.000.000,14.000.000,31,"Ghi chú, có ""quote"""\r\nHDG0005,10000000,100000,0,10100000,,')
r=$(call POST "$ROOT/import" "$PAY1" "$B"); GOOD=$(echo "$r" | field data.batch.id)
check "CSV BOM/CRLF/VND phân nhóm hợp lệ → prepared" "$(echo "$r" | py "(d['cycle']['status'], d['batch']['applied'], len(d['batch']['errors']))")" "('prepared', True, 0)"
check "Đủ cảnh báo tạm ứng/OT/ngày công/thiếu NV/kỳ chưa khóa" "$(echo "$r" | py "set(['ADVANCE_MISMATCH','OT_MISMATCH','WORK_DAYS_MISMATCH','EMPLOYEE_MISSING','TIMESHEET_UNLOCKED']) <= {x['code'] for x in d['batch']['warnings']}")" True
check "OT cảnh báo cả hai chiều" "$(echo "$r" | py "sorted(x['employeeCode'] for x in d['batch']['warnings'] if x['code']=='OT_MISMATCH')")" "['HD0142', 'HDG0005']"
check "Chi tiết giữ chẩn đoán và ghi chú CSV" "$(call GET "$ROOT" "$PAY1" | py "(len(d['warnings'])>0, d['results'][0]['note'], len(d['results']))")" "(True, 'Ghi chú, có \"quote\"', 2)"
check "Ngoài phạm vi đọc/nhập/chuyển trạng thái đều 404" "$(status GET "$ROOT" "$MGRW")/$(status POST "$ROOT/import" "$MGRW" "$B")/$(status POST "$ROOT/submit" "$MGRW" '{}')" "404/404/404"
check "Danh sách không lộ kỳ ngoài phạm vi" "$(call GET admin/payroll/cycles "$MGRW" | py "len(d['cycles'])")" 0
check "Nhân viên chưa thấy phiếu prepared" "$(status GET me/payslips/$MON "$EMP")" 404
check "Danh sách phiếu chưa công bố trống" "$(call GET me/payslips "$EMP" | py "len(d['items'])")" 0
check "Cảnh báo vẫn cho submit" "$(call POST "$ROOT/submit" "$PAY1" '{}' | field data.cycle.status)" under_review
B=$(csvbody $'employee_code,NET\nHD0142,abc')
r=$(call POST "$ROOT/import" "$PAY2" "$B")
check "Nhập lỗi khi đang review → prepared, không áp" "$(echo "$r" | py "(d['cycle']['status'], d['batch']['applied'])")" "('prepared', False)"
check "Kết quả cũ giữ nguyên, batch mới nhất lỗi chặn submit" "$(call GET "$ROOT" "$PAY1" | py "(len(d['results']), d['results'][0]['batchId']=='$GOOD', len(d['errors'])>0, 'submit' in d['actions'])")" "(2, True, True, False)"
check "Không âm thầm gửi lại kết quả cũ" "$(status POST "$ROOT/submit" "$PAY1" '{}')" 409
check "Đổi kỳ công hiện hành sau khi đã mở payroll" "$(call PATCH admin/settings "$HR" '{"attendance":{"periodStartDay":26}}' | field data.attendance.periodStartDay)" 26
B=$(csvbody $'employee_code,BASE,OT_PAY,ADVANCE,NET\nHD0142,15000000,100000,2000000,13100000\nHDG0005,10000000,0,0,10000000')
r=$(call POST "$ROOT/import" "$PAY1" "$B")
check "Kỳ đã chụp giữ đầu tháng và OT đối chiếu đúng dù cấu hình đổi" "$(echo "$r" | py "(d['cycle']['periodStart'], not any(x['code'] in ['OT_MISMATCH','ADVANCE_MISMATCH'] and x['employeeCode']=='HD0142' for x in d['batch']['warnings']))")" "('$MON-01', True)"
check "Cảnh báo tạm ứng gồm người có dòng lệch và người thiếu dòng" "$(echo "$r" | py "sorted(x['employeeCode'] for x in d['batch']['warnings'] if x['code']=='ADVANCE_MISMATCH')")" "['HDG0003', 'HDG0005']"
check "Submit lại" "$(call POST "$ROOT/submit" "$PAY1" '{}' | field data.cycle.status)" under_review
check "Người nhập không tự duyệt → 403" "$(status POST "$ROOT/approve" "$PAY1" '{}')" 403
check "Người thứ hai duyệt" "$(call POST "$ROOT/approve" "$PAY2" '{}' | field data.cycle.status)" approved
check "Approved khóa nhập lại → 409" "$(status POST "$ROOT/import" "$PAY1" "$B")" 409
check "Approved nhân viên chưa xem được" "$(status GET me/payslips/$MON "$EMP")" 404

echo "— Mở lại cần quyền riêng và lý do"
check "Kế toán mặc định không mở lại" "$(status POST "$ROOT/reopen" "$PAY2" '{"reason":"Bổ sung đối chiếu"}')" 403
sql "insert into public.role_assignments (tenant_id,membership_id,role_id,scope_type,effective_from)
select '$TENANT',m.id,r.id,'tenant',public.tenant_today('$TENANT') from public.memberships m join public.roles r on r.code='payroll_smoke_reopen' and r.tenant_id='$TENANT' where m.employee_id='60000000-0000-4000-8000-000000000216';" >/dev/null
check "Có quyền nhưng lý do ngắn → 400" "$(status POST "$ROOT/reopen" "$PAY2" '{"reason":"sửa"}')" 400
check "Mở approved → prepared, xóa dấu duyệt" "$(call POST "$ROOT/reopen" "$PAY2" '{"reason":"Kiểm tra lại kết quả nhập"}' | py "(d['cycle']['status'], d['cycle']['approvedBy'])")" "('prepared', None)"
check "Mở lại vẫn phải submit" "$(status POST "$ROOT/approve" "$PAY2" '{}')" 409
check "Lịch sử duyệt/mở lại còn nguyên" "$(call GET "$ROOT" "$PAY1" | py "all(a in [e['action'] for e in d['events']] for a in ['approve','reopen'])")" True
call POST "$ROOT/submit" "$PAY1" '{}' >/dev/null
check "Mở lại không bỏ quy tắc tách người nhập/người duyệt" "$(status POST "$ROOT/approve" "$PAY1" '{}')" 403
check "Duyệt lại" "$(call POST "$ROOT/approve" "$PAY2" '{}' | field data.cycle.status)" approved

echo "— Công bố, phiếu cá nhân, thông báo và khấu trừ"
check "Công bố kỳ" "$(call POST "$ROOT/publish" "$PAY1" '{}' | field data.cycle.status)" published
check "Công bố lại bị chặn" "$(status POST "$ROOT/publish" "$PAY1" '{}')" 409
check "Không mở lại published" "$(status POST "$ROOT/reopen" "$PAY2" '{"reason":"Thử mở lại công bố"}')" 409
r=$(call GET me/payslips/$MON "$EMP"); VIEWED=$(echo "$r" | field data.viewedAt)
check "Phiếu đúng người, đúng NET, đủ item và lần xem" "$(echo "$r" | py "(d['result']['employee']['code']=='HD0142', d['result']['net']==13100000, {x['code'] for x in d['result']['items']}==set(['BASE','OT_PAY','ADVANCE','NET']), bool(d['viewedAt']))")" "(True, True, True, True)"
check "Xem lại giữ thời điểm đầu" "$(call GET me/payslips/$MON "$EMP" | field data.viewedAt)" "$VIEWED"
check "Nhân viên khác chỉ thấy phiếu của mình" "$(call GET me/payslips/$MON "$LINH" | py "d['result']['employee']['code']")" HDG0005
check "HR không có kết quả không thấy phiếu người khác" "$(status GET me/payslips/$MON "$HR")" 404
check "Tenant khác không thấy phiếu" "$(status GET me/payslips/$MON "$TB")" 404
check "Danh sách phiếu công bố có lần xem" "$(call GET me/payslips "$EMP" | py "(len(d['items']), d['items'][0]['viewedAt']=='$VIEWED')")" "(1, True)"
check "Thông báo công bố có link payslip, không có tiền" "$(call GET me/notifications "$EMP" | py "[(n['link']['type'], n['link']['no'], n['body']=='Bạn có thể mở phiếu lương để xem chi tiết.', not any(c.isdigit() for c in n['body'])) for n in d['items'] if n['kind']=='payslip.published']")" "[('payslip', '$MON', True, True)]"
check "Tạm ứng khớp đã đánh dấu khấu trừ" "$(sql "select count(*) from public.salary_advances where request_id='$ADV' and deducted_cycle_id='$CID'")" 1
check "Lệch/thiếu dòng vẫn công bố nhưng không đánh dấu khấu trừ" "$(sql "select count(*) from public.salary_advances where request_id in ('$ADV_LINH','$ADV_MGR') and deducted_cycle_id is null")" 2
check "Công bố ghi hai sự kiện đối chiếu lệch không chứa tiền" "$(call GET "$ROOT" "$PAY1" | py "(len([e for e in d['events'] if e['action']=='advance_mismatch']), all(not any(c.isdigit() for c in e['reason']) for e in d['events'] if e['action']=='advance_mismatch'))")" "(2, True)"
check "Xác nhận đã trả" "$(call POST "$ROOT/paid" "$PAY1" '{}' | field data.cycle.status)" paid
check "Không mở lại paid" "$(status POST "$ROOT/reopen" "$PAY2" '{"reason":"Thử mở lại đã trả"}')" 409
check "Paid vẫn đọc được phiếu" "$(call GET me/payslips/$MON "$EMP" | field data.cycle.status)" paid
check "Đóng kỳ" "$(call POST "$ROOT/close" "$PAY1" '{}' | field data.cycle.status)" closed
check "Không mở lại closed" "$(status POST "$ROOT/reopen" "$PAY2" '{"reason":"Thử mở lại đã đóng"}')" 409
check "Closed vẫn đọc được phiếu" "$(call GET me/payslips/$MON "$EMP" | field data.cycle.status)" closed

echo "— Kỳ khác: phạm vi dòng mới, NET âm, snapshot khóa kỳ"
B="{\"month\":\"$NEXT\",\"payDate\":\"$TODAY\"}"
call POST admin/payroll/cycles "$PAY1" "$B" >/dev/null
B=$(csvbody $'employee_code,BASE,ADVANCE,NET\nHD0142,0,100,-100')
check "NET âm hợp lệ" "$(call POST admin/payroll/cycles/$NEXT/import "$PAY1" "$B" | field data.batch.applied)" True
B=$(csvbody $'employee_code,NET\nHDG0005,0')
check "Có quyền trên kết quả cũ nhưng nhập NV mới ngoài phạm vi → 404" "$(status POST admin/payroll/cycles/$NEXT/import "$MGRW" "$B")" 404
check "Kỳ trong phạm vi đọc được" "$(status GET admin/payroll/cycles/$NEXT "$MGRW")" 200
check "Chẩn đoán trong kỳ phạm vi hẹp không lộ người khác" "$(call GET admin/payroll/cycles/$NEXT "$MGRW" | py "all(x['employeeCode'] in [None,'HD0142','HDG0003'] for b in d['batches'] for x in b['warnings'])")" True
check "Đặt lại kỳ công ngày 1" "$(call PATCH admin/settings "$HR" '{"attendance":{"periodStartDay":1}}' | field data.attendance.periodStartDay)" 1
B="{\"month\":\"$PREV\",\"payDate\":\"$TODAY\"}"
call POST admin/payroll/cycles "$PAY1" "$B" >/dev/null
B="{\"month\":\"$PREV\",\"reason\":\"Smoke snapshot payroll\"}"
check "Khóa kỳ trước đã kết thúc qua API" "$(call POST admin/timesheets/lock "$HR" "$B" | field data.period.locked)" True
CREDIT=$(call GET "me/timesheet?month=$PREV" "$EMP" | field data.summary.credited)
call PATCH admin/settings "$HR" '{"attendance":{"periodStartDay":26}}' >/dev/null
B=$(csvbody "employee_code,NET,work_days
HD0142,0,$CREDIT")
check "Đối chiếu đúng snapshot kỳ đã khóa sau khi cấu hình đổi" "$(call POST admin/payroll/cycles/$PREV/import "$PAY1" "$B" | py "not any(x['code'] in ['WORK_DAYS_MISMATCH','TIMESHEET_UNLOCKED'] for x in d['batch']['warnings'])")" True

echo "— Audit chỉ metadata, không có số tiền/CSV/note lương"
check "Audit có xem danh sách, chi tiết, nhập, công bố và đọc phiếu" "$(sql "select count(distinct action) from public.audit_logs where action in ('payroll.cycles.viewed','payroll.cycle.viewed','payroll.import.recorded','payroll.cycle.publish','payslip.viewed','payslips.viewed')")" 6
check "Audit payroll không chép giá trị lương hay CSV" "$(sql "select count(*) from public.audit_logs where (action like 'payroll.%' or action like 'payslip%') and (coalesce(before_data::text,'') || coalesce(after_data::text,'') || coalesce(reason,'')) ~ '(15000000|13100000|2000000|employee_code|Ghi chú, có|gross|deduction|net|fileName)' ")" 0
sql "delete from public.role_assignments ra using public.roles r,public.memberships m where ra.role_id=r.id and ra.membership_id=m.id and r.code='employee' and r.tenant_id is null and m.employee_id='60000000-0000-4000-8000-000000000005';" >/dev/null
check "Thu hồi self.read chặn cả danh sách lẫn chi tiết, không tự cấp lại" "$(status GET me/payslips "$LINH")/$(status GET me/payslips/$MON "$LINH")" "404/404"
echo "Tất cả bước payroll đều đạt."
