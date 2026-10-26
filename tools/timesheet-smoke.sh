#!/usr/bin/env bash
# Kiểm thử công tháng + giải trình + luồng duyệt: bảng công tính từ chấm công mẫu, gửi giải trình (lượt, hạn, trùng ngày),
# Quản lý → HR duyệt tạo điều chỉnh, từ chối/hủy, không tự duyệt, phạm vi quản lý, khóa/mở kỳ, xuất CSV, đổi luồng duyệt.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
HA=60000000-0000-4000-8000-000000000142
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR1=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR1"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGRW=$(mfa "$MGR1"); need "Quản lý bật MFA cho web" "$MGRW"

# Chỉ fixture trên DB vừa reset: tạo 45 ngày theo ngày tenant, bỏ cuối tuần/lễ.
# Không dựa vào seed chỉ sinh từ đầu kỳ; không sửa ca, quy định hay mã API.
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
SMOKE_DATES=$(sql "
truncate table public.attendance_events;
with days as (
  select d::date d, t.timezone from public.tenants t
  cross join lateral generate_series(public.tenant_today(t.id)-45, public.tenant_today(t.id)-1, interval '1 day') d
  where t.id='10000000-0000-4000-8000-000000000001' and extract(isodow from d) between 1 and 5
    and not exists (select 1 from public.holidays h join public.holiday_calendars c on c.id=h.calendar_id
      where h.holiday_date=d::date and (c.tenant_id is null or c.tenant_id=t.id))
), ranked as (
  select *, row_number() over(order by d desc) n, count(*) over() total from days
)
insert into public.attendance_events (tenant_id,employee_id,kind,client_event_id,occurred_at,received_at,status)
select '10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000142',k.kind,
  'smoke-calendar-'||d||'-'||k.kind,(d+k.at) at time zone timezone,(d+k.at) at time zone timezone,'accepted'
from ranked cross join lateral (values
  ('in',case when n=2 or n%7=0 then time '08:21' else time '07:52' end),
  ('out',case when n=1 or n%11=0 or n=total then null::time else time '17:05' end)
) k(kind,at) where k.at is not null;
with days as (
  select distinct (occurred_at at time zone t.timezone)::date d from public.attendance_events e
  join public.tenants t on t.id=e.tenant_id where e.employee_id='60000000-0000-4000-8000-000000000142'
), ranked as (select d,row_number() over(order by d desc) n from days)
select concat_ws(' ',max(d) filter(where n=1),max(d) filter(where n=2),max(d) filter(where n=3),min(d)) from ranked;")
read -r OUTDAY LATEDAY OKDAY OLDDAY <<< "$SMOKE_DATES"
need "Fixture có ngày gần đây và ngày quá hạn: $OUTDAY / $LATEDAY / $OLDDAY" "$OLDDAY"
# Kỳ gọi theo tháng kết thúc; lấy ngày bắt đầu kỳ từ API, không dùng tháng của máy Mac.
CURRENT=$(call GET me/timesheet "$EMP")
START_DAY=$(echo "$CURRENT" | py "int(d['period']['start'][8:])")
month_for() { python3 -c 'import sys; y,m,d=map(int,sys.argv[1].split("-")); m+=int(d>=int(sys.argv[2])); y+=(m-1)//12; print(f"{y}-{(m-1)%12+1:02d}")' "$1" "$START_DAY"; }
OUTMONTH=$(month_for "$OUTDAY"); LATEMONTH=$(month_for "$LATEDAY")

echo "— Bảng công tháng (mobile)"
r=$CURRENT
check "Kỳ công 26 → 25" "$(echo "$r" | py "(d['period']['start'][8:], d['period']['end'][8:], d['period']['locked'])")" "('26', '25', False)"
PREV=$(echo "$CURRENT" | py "(lambda y,m: f'{y-(m==1)}-{m-1 or 12:02d}')(*map(int,d['period']['month'].split('-')))")
prev=$(call GET "me/timesheet?month=$PREV" "$EMP")
check "Hai kỳ có ngày đủ công, thiếu giờ và đi muộn từ fixture" "$(printf '%s\n%s\n' "$r" "$prev" | python3 -c "import json,sys; a=[json.loads(s)['data']['summary'] for s in sys.stdin]; print((sum(d['credited'] for d in a)>5, sum(d['missingDays'] for d in a)>=1, sum(d['lateDays'] for d in a)>=1))")" "(True, True, True)"
check "Lượt giải trình theo quy định công ty, người duyệt là quản lý" "$(echo "$r" | py "(d['explanation']['limit'], d['explanation']['used'], d['approver'])")" "(3, 0, 'Lê Quang Huy')"
need "Ngày quên chấm ra còn hạn: $OUTDAY" "$OUTDAY"; need "Ngày đi muộn còn hạn: $LATEDAY" "$LATEDAY"
check "Ngày nghỉ cuối tuần không tính công chuẩn" "$(echo "$r" | py "all(x['kind'] in ('off','holiday') for x in d['days'] if x['weekday']>=6 and x['kind']!='future')")" True

echo "— Gửi giải trình"
B="{\"workDate\":\"$OUTDAY\",\"kind\":\"missing_out\",\"reason\":\"Họp khách tới 17:00, quên chấm ra\"}"
check "Quên chấm ra mà không nhập giờ ra → 400" "$(status POST me/requests/explanations "$EMP" "$B")" 400
B="{\"workDate\":\"$OKDAY\",\"kind\":\"other\",\"clockIn\":\"08:00\",\"reason\":\"Thử ngày bình thường\"}"
check "Ngày không có bất thường → 400" "$(status POST me/requests/explanations "$EMP" "$B")" 400
B="{\"workDate\":\"$OLDDAY\",\"kind\":\"other\",\"clockIn\":\"08:00\",\"clockOut\":\"17:00\",\"reason\":\"Thử ngày đã quá hạn\"}"
check "Quá hạn giải trình → 409" "$(status POST me/requests/explanations "$EMP" "$B")" 409
B="{\"workDate\":\"$OUTDAY\",\"kind\":\"missing_out\",\"clockOut\":\"17:00\",\"reason\":\"Họp khách tới 17:00, quên chấm ra\"}"
r=$(call POST me/requests/explanations "$EMP" "$B")
RID=$(echo "$r" | field data.id); T1=$(echo "$r" | field data.steps.0.taskId); T2=$(echo "$r" | field data.steps.1.taskId)
check "Tạo đơn GT, bước 1 quản lý chờ, bước 2 HR chờ tới lượt" "$(echo "$r" | py "(d['no'][:3], d['steps'][0]['assignee'], d['steps'][0]['status'], d['steps'][1]['status'])")" "('GT-', 'Lê Quang Huy', 'pending', 'waiting')"
check "Trùng ngày → 409" "$(status POST me/requests/explanations "$EMP" "$B")" 409
check "Đã dùng 1 lượt, ngày đó hết nút giải trình" "$(call GET "me/timesheet?month=$OUTMONTH" "$EMP" | py "(d['explanation']['used'], [x['canExplain'] for x in d['days'] if x['date']=='$OUTDAY'][0])")" "(1, False)"

echo "— Duyệt: quản lý → HR"
check "Nhân viên không có quyền duyệt" "$(call GET me/approvals "$EMP" | py "(d['canApprove'], len(d['items']))")" "(False, 0)"
check "Người gửi không tự duyệt" "$(status POST me/approvals/$T1/approve "$EMP" '{}')" 403
r=$(call GET me/approvals "$MGR1")
check "Quản lý thấy đơn cần duyệt trên app" "$(echo "$r" | py "(d['canApprove'], [i['no'] for i in d['items']]==[i['no'] for i in d['items'] if i['myTaskId']], d['items'][0]['day']['rawOut'])")" "(True, True, None)"
check "HR chưa được duyệt bước quản lý" "$(status POST admin/approvals/$T1/approve "$HR" '{}')" 403
check "Quản lý duyệt bước 1" "$(call POST me/approvals/$T1/approve "$MGR1" '{"comment":"Đúng, có họp khách"}' | py "(d['steps'][0]['status'], d['steps'][1]['status'], d['status'])")" "('approved', 'pending', 'pending')"
check "Duyệt lại bước đã xong → 409" "$(status POST me/approvals/$T1/approve "$MGR1" '{}')" 409
check "Quản lý không duyệt bước HR" "$(status POST me/approvals/$T2/approve "$MGR1" '{}')" 403
r=$(call GET admin/requests "$HR")
check "Hàng đợi web: đơn chờ HR, có nút duyệt" "$(echo "$r" | py "[(i['no'][:3], bool(i['myTaskId'])) for i in d['items'] if i['id']=='$RID'][0]")" "('GT-', True)"
check "HR duyệt → đơn hoàn tất" "$(call POST admin/approvals/$T2/approve "$HR" '{}' | field data.status)" approved
check "Bảng công ghi nhận giờ ra 17:00, giữ giờ gốc, đủ công" "$(call GET "me/timesheet?month=$OUTMONTH" "$EMP" | py "[(x['clockOut'], x['rawOut'], x['adjusted'], x['issue'], x['credit']) for x in d['days'] if x['date']=='$OUTDAY'][0]")" "('17:00', None, True, None, 1)"

echo "— Từ chối, hủy"
USED_BEFORE=$(call GET "me/timesheet?month=$LATEMONTH" "$EMP" | field data.explanation.used)
B="{\"workDate\":\"$LATEDAY\",\"kind\":\"late\",\"clockIn\":\"08:00\",\"reason\":\"Kẹt xe do tai nạn trên cầu\"}"
T3=$(call POST me/requests/explanations "$EMP" "$B" | field data.steps.0.taskId)
check "Từ chối phải có lý do" "$(status POST me/approvals/$T3/reject "$MGR1" '{}')" 400
check "Quản lý từ chối" "$(call POST me/approvals/$T3/reject "$MGR1" '{"comment":"Không có minh chứng"}' | py "(d['status'], d['steps'][1]['status'])")" "('rejected', 'cancelled')"
r=$(call GET "me/timesheet?month=$LATEMONTH" "$EMP")
check "Bị từ chối: ngày vẫn đi muộn, được giải trình lại, không tốn lượt" "$(echo "$r" | py "([x['canExplain'] for x in d['days'] if x['date']=='$LATEDAY'][0], d['explanation']['used'])")" "(True, $USED_BEFORE)"
RID2=$(call POST me/requests/explanations "$EMP" "$B" | field data.id)
check "Người gửi hủy đơn đang chờ" "$(call POST me/requests/$RID2/cancel "$EMP" | field data.status)" cancelled
check "Hủy lại → 409" "$(status POST me/requests/$RID2/cancel "$EMP")" 409
check "Đơn của tôi: 3 đơn, mới nhất trước" "$(call GET me/requests "$EMP" | py "[i['status'] for i in d]")" "['cancelled', 'rejected', 'approved']"

echo "— Bảng công web, phạm vi, khóa kỳ"
r=$(call GET admin/timesheets "$HR")
check "HR thấy bảng công cả công ty" "$(echo "$r" | py "('HD0142' in [x['employee']['code'] for x in d['rows']], d['canLock'], d['periodStartDay'])")" "(True, True, 26)"
check "Quản lý chỉ thấy phòng Marketing" "$(call GET admin/timesheets "$MGRW" | py "sorted(x['employee']['code'] for x in d['rows'])")" "['HD0142', 'HDG0003']"
IN_PERIOD=1; [ "$OUTMONTH" != "$LATEMONTH" ] || IN_PERIOD=3
check "Chi tiết nhân viên kèm đơn đúng kỳ" "$(call GET "admin/timesheets/$HA?month=$OUTMONTH" "$HR" | py "(len(d['days'])>=28, len(d['requests']))")" "(True, $IN_PERIOD)"
check "Kỳ hiện tại chưa kết thúc → không khóa" "$(status POST admin/timesheets/lock "$HR" '{}')" 409
B="{\"month\":\"$PREV\"}"
check "Quản lý không khóa được kỳ" "$(status POST admin/timesheets/lock "$MGRW" "$B")" 403
B="{\"month\":\"$PREV\",\"reason\":\"Đã đối soát\"}"
check "Khóa kỳ trước" "$(call POST admin/timesheets/lock "$HR" "$B" | py "(d['period']['locked'], d['lock']['lockedBy'])")" "(True, 'Mai Phương Thảo')"
check "Khóa lại → 409" "$(status POST admin/timesheets/lock "$HR" "$B")" 409
check "Nhân viên thấy kỳ đã khóa" "$(call GET "me/timesheet?month=$PREV" "$EMP" | py "(d['period']['locked'], any(x['canExplain'] for x in d['days']))")" "(True, False)"
B="{\"month\":\"$PREV\"}"
check "Mở lại phải có lý do" "$(status POST admin/timesheets/unlock "$HR" "$B")" 400
B="{\"month\":\"$PREV\",\"reason\":\"Bổ sung giải trình muộn\"}"
check "Mở lại kỳ" "$(call POST admin/timesheets/unlock "$HR" "$B" | field data.period.locked)" False
check "Xuất CSV bảng công" "$(curl -s "$API/admin/timesheets/export" -H "authorization: Bearer $HR" | python3 -c "import sys; t=sys.stdin.read(); print(t.startswith('﻿Mã NV') and 'HD0142' in t)")" True

echo "— Luồng duyệt"
check "Luồng mặc định Quản lý → HR" "$(call GET admin/workflows "$HR" | py "[s['resolver'] for s in d[0]['current']['steps']]")" "['direct_manager', 'hr']"
check "Quản lý không đổi được luồng" "$(status POST admin/workflows/explanation/versions "$MGRW" '{"steps":[{"resolver":"direct_manager","slaHours":24}]}')" 403
B="{\"steps\":[{\"resolver\":\"direct_manager\",\"slaHours\":12}],\"effectiveFrom\":\"$(today 1)\",\"note\":\"Chỉ quản lý duyệt\"}"
check "HR đổi luồng từ ngày mai: chỉ quản lý" "$(call POST admin/workflows/explanation/versions "$HR" "$B" | py "len(d[0]['versions'])")" 2
check "Hồ sơ nhân viên có nhật ký gửi, duyệt, từ chối, hủy đơn" "$(call GET admin/employees/$HA "$HR" | py "all(a in {x['action'] for x in d['audit']} for a in ['request.submitted','approval.approved','approval.rejected','request.cancelled'])")" True
echo "Tất cả bước công tháng + giải trình đều đạt."
