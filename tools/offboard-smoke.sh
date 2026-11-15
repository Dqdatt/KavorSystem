#!/usr/bin/env bash
# Cho nghỉ việc đầu-cuối qua API thật: xem trước đơn sẽ hủy → chặn sai quyền/đầu vào → Sắp nghỉ (vẫn dùng app tới ngày cuối, hủy đơn chờ)
# → quay lại làm việc → nghỉ ngay (khóa tài khoản, app bị chặn) → khôi phục + mở khóa. Vòng quét qua ngày cuối kiểm ở pgTAP (offboarding.test.sql).
# SQL chỉ đọc hậu điều kiện. Chạy trên DB vừa reset.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HA=60000000-0000-4000-8000-000000000142
HUY=60000000-0000-4000-8000-000000000003
THAO=60000000-0000-4000-8000-000000000007
# Ngày làm việc (T2–T6) đầu tiên từ hôm nay + N ngày
wd() { python3 -c "import datetime as t,zoneinfo; d=t.datetime.now(zoneinfo.ZoneInfo('Asia/Ho_Chi_Minh')).date()+t.timedelta(days=$1)
while d.weekday()>4: d+=t.timedelta(days=1)
print(d)"; }
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

EMP=$(activate HD0142 thao.ha@haidang.vn); need "Kích hoạt nhân viên" "$EMP"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR bật MFA" "$HR"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant B bật MFA" "$TB"
TODAY=$(today); LAST=$(today 7); BEFORE=$(wd 2); AFTER=$(wd 12)

echo "— Đơn đang chờ của người sắp nghỉ"
B='{"kind":"salary_advance","code":"TU-OFF","name":"Tạm ứng thử nghỉ việc","config":{"enabled":true,"maxPercent":50,"excludeProbation":true,"excludeNoticePeriod":true,"deadlineDay":31,"minAmount":500000},"effectiveFrom":"'$TODAY'"}'
RID=$(call POST admin/rules "$HR" "$B" | field data.id); need "Quy định tạm ứng nhận đơn tới cuối tháng" "$RID"
B="{\"kind\":\"salary_advance\",\"targetId\":\"$RID\",\"scopeType\":\"employee\",\"scopeId\":\"$HA\",\"effectiveFrom\":\"$TODAY\",\"reason\":\"Thử nghỉ việc\"}"
check "Áp dụng cho Trần Thu Hà" "$(call POST admin/policy-assignments "$HR" "$B" | field data.state)" active
ADV=$(call POST me/requests/advance "$EMP" '{"amount":1000000,"reason":"Chi phí y tế"}' | field data.no); need "Đơn tạm ứng $ADV" "$ADV"
LB=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$BEFORE\",\"reason\":\"Việc riêng\"}" | field data.no); need "Đơn nghỉ trước ngày cuối $LB" "$LB"
LA=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$AFTER\",\"reason\":\"Việc riêng\"}" | field data.no); need "Đơn nghỉ sau ngày cuối $LA" "$LA"
check "Xem trước: 1 tạm ứng, 2 đơn nghỉ đang chờ" "$(call GET "admin/employees/$HA/offboard" "$HR" | py "(d['pendingAdvances'], sorted(d['pendingLeaveStarts']), d['pendingApprovals'])")" "(1, ['$BEFORE', '$AFTER'], 0)"
check "Xem trước quản lý trực tiếp: có việc chờ duyệt" "$(call GET "admin/employees/$HUY/offboard" "$HR" | py "d['pendingApprovals'] >= 3")" True

echo "— Chặn"
OB() { echo "{\"lastDay\":\"$1\",\"reason\":\"${2:-resigned}\",\"handover\":${3:-false},\"note\":\"Đã nhận quyết định nghỉ việc\"}"; }
check "Quản lý không có quyền khóa tài khoản → 403" "$(status POST "admin/employees/$HA/offboard" "$MGR" "$(OB "$LAST")")" 403
check "Công ty khác → 404" "$(status POST "admin/employees/$HA/offboard" "$TB" "$(OB "$LAST")")" 404
check "Tự cho mình nghỉ → 409" "$(status POST "admin/employees/$THAO/offboard" "$HR" "$(OB "$LAST")")" 409
check "Ngày sai định dạng → 400" "$(status POST "admin/employees/$HA/offboard" "$HR" "$(OB 2026-13-01)")" 400
check "Lý do ngoài danh sách → 400" "$(status POST "admin/employees/$HA/offboard" "$HR" "$(OB "$LAST" fired)")" 400
check "Trước ngày vào làm → 400" "$(status POST "admin/employees/$HA/offboard" "$HR" "$(OB 2000-01-01)")" 400
check "Sửa hồ sơ sang Đã nghỉ việc → 409 (phải qua Cho nghỉ việc)" "$(status PATCH "admin/employees/$HA" "$HR" '{"status":"terminated"}')" 409

echo "— Sắp nghỉ"
check "Ngày cuối còn tới → Sắp nghỉ; hủy tạm ứng + đơn nghỉ sau ngày cuối" "$(call POST "admin/employees/$HA/offboard" "$HR" "$(OB "$LAST" resigned true)" | py "(d['status'], sorted(d['cancelled']))")" "('leaving', $(python3 -c "print(sorted(['$ADV','$LA']))"))"
check "Đơn nghỉ trong thời gian còn làm vẫn chờ duyệt" "$(sql "select status from public.requests where request_no='$LB'")" pending
check "Hồ sơ: Sắp nghỉ, ngày cuối, lý do, đã bàn giao, ghi chú" "$(call GET "admin/employees/$HA" "$HR" | py "(d['status'], d['terminationDate'], d['terminationReason'], d['terminationHandover'], d['terminationNote'], d['account'])")" "('leaving', '$LAST', 'resigned', True, 'Đã nhận quyết định nghỉ việc', 'active')"
check "Vẫn dùng app tới ngày cuối" "$(status GET me/profile "$EMP")" 200
check "Sắp nghỉ không gửi tạm ứng mới được" "$(status POST me/requests/advance "$EMP" '{"amount":1000000}')" 409
B="{\"leaveType\":\"UL\",\"from\":\"$AFTER\",\"reason\":\"Việc riêng\"}"  # body để biến riêng: bash 3.2 tách {…,…} trong "$(…)"
check "Không xin nghỉ được ngày sau ngày cuối" "$(call POST me/requests/leave "$EMP" "$B" | field error.code)" VALIDATION_FAILED
check "Audit ghi nghỉ việc kèm đơn đã hủy" "$(sql "select (after_data->'cancelled_requests')::text like '%$ADV%' from public.audit_logs where resource_id='$HA' and action='employee.offboarded'")" t
check "Đổi ý: sửa hồ sơ về Đang làm việc → xóa ngày cuối" "$(call PATCH "admin/employees/$HA" "$HR" '{"status":"active"}' | py "(d['status'], d['terminationDate'], d['terminationReason'])")" "('active', None, None)"

echo "— Nghỉ ngay"
check "Ngày cuối là hôm qua → Đã nghỉ việc" "$(call POST "admin/employees/$HA/offboard" "$HR" "$(OB "$(today -1)" contract_ended)" | field data.status)" terminated
check "Tài khoản bị khóa" "$(call GET "admin/employees/$HA" "$HR" | py "(d['status'], d['account'])")" "('terminated', 'locked')"
check "App bị chặn ngay (token còn hạn)" "$(status GET me/profile "$EMP")" 403
check "Đã nghỉ thì không cho nghỉ lần nữa → 409" "$(status POST "admin/employees/$HA/offboard" "$HR" "$(OB "$TODAY")")" 409

echo "— Khôi phục"
check "Quay lại làm việc: hồ sơ Đang làm việc, tài khoản vẫn khóa tới khi HR mở" "$(call PATCH "admin/employees/$HA" "$HR" '{"status":"active"}' | py "(d['status'], d['terminationDate'], d['account'])")" "('active', None, 'locked')"
check "Mở khóa tài khoản" "$(call POST "admin/employees/$HA/unlock" "$HR" '{}' | field data.account)" active

echo "✔ offboard-smoke xong"
