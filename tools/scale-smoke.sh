#!/bin/bash
# Trần 1.000 dòng PostgREST (max_rows, cloud cũng 1000) không được cắt ngầm bảng công/lương: 120 nhân viên chấm đủ một kỳ
# (> 3.000 lượt chấm, > 1.000 dòng lương và phân công) → bảng công đủ người, đủ công → khóa kỳ chụp đúng tổng → bảng đầu vào
# lương đúng mức lương mới nhất và phòng ban của từng người.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
N=120
M=$(bash "$(dirname "$0")/scale-data.sh" "$N"); need "Sinh $N nhân viên, chấm công đủ kỳ $M" "$M"
check "Số lượt chấm công của bộ dữ liệu vượt xa 1.000" "$(sql "select count(*) > 3000 from public.attendance_events where client_event_id like 'scale-%'")" t
check "Lịch sử lương và phân công > 1.000 dòng" "$(sql "select (select count(*) from public.employee_compensations where note like 'Dữ liệu thử%') > 1000 and (select count(*) from public.employee_assignments where employee_id::text like '6c000000-%') > 1000")" t
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"

echo "— Bảng công kỳ $M"
_s1=$(call GET "admin/timesheets?month=$M" "$HR") || :
S=$(echo "$_s1" | py "d['period']['start']+' '+d['period']['end']"); set -- $S; PS=$1; PE=$2
# Công chuẩn tính độc lập: mọi thứ 2–6 trong kỳ (ngày lễ rơi vào ngày làm việc vẫn là 1 công)
EXP=$(python3 -c "import datetime as t,sys; a=t.date.fromisoformat(sys.argv[1]); b=t.date.fromisoformat(sys.argv[2]); print(sum((a+t.timedelta(i)).isoweekday()<=5 for i in range((b-a).days+1)))" "$PS" "$PE")
need "Kỳ $PS → $PE, mỗi người $EXP công" "$EXP"
check "Đủ $N người, ai cũng đủ $EXP công, không thiếu công" "$(echo "$_s1" | py "(lambda r: (len(r), sorted({x['summary']['credited'] for x in r}), sum(x['summary']['missingDays'] for x in r)))([x for x in d['rows'] if x['employee']['code'].startswith('SC')])")" "($N, [$EXP], 0)"

echo "— Khóa kỳ chụp đúng tổng"
_s3=$(status POST admin/timesheets/lock "$HR" "{\"month\":\"$M\",\"reason\":\"Thử trần 1.000 dòng\"}") || :
check "Khóa kỳ $M" "$_s3" 200
check "Ảnh chụp có $N người, tổng $((N * EXP)) công" "$(sql "select count(*) || ' ' || sum((r->'summary'->>'credited')::numeric)::int from public.timesheet_locks l, jsonb_array_elements(l.snapshot->'rows') r where l.unlocked_at is null and l.period_start = '$PS' and (r->>'employeeId') like '6c000000-%'")" "$N $((N * EXP))"

echo "— Bảng đầu vào lương kỳ $M"
_s2=$(call GET "admin/payroll/inputs?month=$M" "$HR") || :
check "Đủ $N người, đủ công, lương bản mới nhất, có phòng ban" "$(echo "$_s2" | py "(lambda r: (len(r), sorted({x['credited'] for x in r}), sorted({x['baseSalary'] for x in r}), sum(x['employee']['department'] is None for x in r)))([x for x in d['rows'] if x['employee']['code'].startswith('SC')])")" "($N, [$EXP], [10900000], 0)"
echo "Tất cả bước trần 1.000 dòng đều đạt."
