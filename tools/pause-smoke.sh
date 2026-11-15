#!/usr/bin/env bash
# Cho tạm nghỉ (nghỉ thai sản/không lương…) đầu-cuối qua API thật: chặn đầu vào sai → tạm nghỉ (hủy đơn nghỉ chờ) → khóa sửa trạng thái/đơn mới
# → bảng chấm công + bảng công hiện "tạm nghỉ" → kết thúc sớm → tạm nghỉ tương lai rồi hủy. Vòng quét đổi trạng thái theo ngày kiểm ở pgTAP (employee_pause.test.sql).
# SQL chỉ đọc hậu điều kiện. Chạy trên DB vừa reset.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HA=60000000-0000-4000-8000-000000000142
# Ngày làm việc (T2–T6) đầu tiên từ hôm nay + N ngày
wd() { python3 -c "import datetime as t,zoneinfo; d=t.datetime.now(zoneinfo.ZoneInfo('Asia/Ho_Chi_Minh')).date()+t.timedelta(days=$1)
while d.weekday()>4: d+=t.timedelta(days=1)
print(d)"; }
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

EMP=$(activate HD0142 thao.ha@haidang.vn); need "Kích hoạt nhân viên" "$EMP"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR bật MFA" "$HR"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant B bật MFA" "$TB"
TODAY=$(today); W3=$(wd 3); W5=$(wd 5); W10=$(wd 10); W20=$(wd 20)
PB() { echo "{\"from\":\"$1\",\"to\":\"$2\",\"reason\":\"${3:-unpaid}\",\"note\":\"Nghỉ không lương thử\"}"; }

echo "— Chặn"
check "Lý do ngoài danh sách → 400" "$(status POST "admin/employees/$HA/pause" "$HR" "$(PB "$TODAY" "$W10" holiday)")" 400
check "Đến ngày trước ngày bắt đầu → 400" "$(status POST "admin/employees/$HA/pause" "$HR" "$(PB "$W10" "$TODAY")")" 400
check "Công ty khác → bị chặn (404)" "$(status POST "admin/employees/$HA/pause" "$TB" "$(PB "$TODAY" "$W10")")" 404

echo "— Tạm nghỉ"
LA=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$W3\",\"reason\":\"Việc riêng\"}" | field data.no); need "Đơn nghỉ phép năm ngày $W3: $LA" "$LA"
check "Tạm nghỉ từ hôm nay: Đang tạm nghỉ, hủy đơn nghỉ chờ" "$(call POST "admin/employees/$HA/pause" "$HR" "$(PB "$TODAY" "$W10")" | py "(d['status'], d['cancelled'])")" "('on_leave', ['$LA'])"
check "Đơn nghỉ đã bị hủy" "$(sql "select status from public.requests where request_no='$LA'")" cancelled
check "Hồ sơ: khoảng tạm nghỉ bắt đầu hôm nay, Đang tạm nghỉ" "$(call GET "admin/employees/$HA" "$HR" | py "(d['pause']['from'], d['pause']['to'], d['pause']['reason'], d['status'])")" "('$TODAY', '$W10', 'unpaid', 'on_leave')"
check "Sửa hồ sơ khi đang tạm nghỉ → 409" "$(status PATCH "admin/employees/$HA" "$HR" '{"status":"active"}')" 409
check "Tạm nghỉ chồng khoảng đang có → 409" "$(status POST "admin/employees/$HA/pause" "$HR" "$(PB "$W5" "$W20")")" 409
check "Nhân viên xin nghỉ trong thời gian tạm nghỉ → 409" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$W5\",\"reason\":\"Việc riêng\"}")" 409

echo "— Hiển thị"
check "Bảng chấm công hôm nay: Nghỉ không lương cả ngày" "$(call GET admin/attendance/board "$HR" | py "[(x['leave']['typeName'], x['leave']['half']) for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" "('Nghỉ không lương', 'full')"
check "Bảng công tháng: hôm nay là tạm nghỉ" "$(call GET me/timesheet "$EMP" | py "[x['kind'] for x in d['days'] if x['date']=='$TODAY'][0]")" paused

echo "— Kết thúc"
# Khoảng bắt đầu hôm nay nên ngày đi làm lại = hôm nay thì hủy cả khoảng (không còn dòng nào)
check "Đi làm lại từ hôm nay → Đang làm việc" "$(call POST "admin/employees/$HA/pause/end" "$HR" "{\"returnDate\":\"$TODAY\"}" | field data.status)" active
check "Khoảng tạm nghỉ đã bị hủy" "$(sql "select count(*) from public.employee_pauses where employee_id='$HA'")" 0

echo "— Tạm nghỉ tương lai rồi hủy"
B="{\"from\":\"$W20\",\"reason\":\"other\"}"
check "Tạm nghỉ từ ngày làm việc sau: vẫn Đang làm việc" "$(call POST "admin/employees/$HA/pause" "$HR" "$B" | field data.status)" active
check "Hồ sơ thấy khoảng sắp tới" "$(call GET "admin/employees/$HA" "$HR" | py "(d['pause']['from'], d['pause']['to'], d['status'])")" "('$W20', None, 'active')"
check "Đi làm lại đúng ngày bắt đầu → hủy khoảng" "$(call POST "admin/employees/$HA/pause/end" "$HR" "{\"returnDate\":\"$W20\"}" | field data.status)" active
check "Hồ sơ không còn khoảng tạm nghỉ" "$(call GET "admin/employees/$HA" "$HR" | py "d['pause']")" None

echo "✔ pause-smoke xong"
