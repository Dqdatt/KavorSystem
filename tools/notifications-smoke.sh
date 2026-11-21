#!/usr/bin/env bash
# Kiểm thử thông báo trong app: đơn mới báo quản lý, bước HR tới lượt báo HR (web), kết quả báo người gửi (duyệt/từ chối kèm lý do),
# thông báo "cần duyệt" hết tác dụng khi bước đã xử lý, máy mới được duyệt báo nhân viên, đánh dấu đã đọc (một/tất cả), chỉ thấy của mình.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"

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
echo "— Đơn mới → báo quản lý"
check "Chưa có thông báo" "$(call GET me/notifications "$MGR" | py "(len(d['items']), d['unread'])")" "(0, 0)"
B="{\"workDate\":\"$OUTDAY\",\"kind\":\"missing_out\",\"clockOut\":\"17:00\",\"reason\":\"Họp khách tới 17:00, quên chấm ra\"}"
r=$(call POST me/requests/explanations "$EMP" "$B"); NO=$(echo "$r" | field data.no); T1=$(echo "$r" | field data.steps.0.taskId)
r=$(call GET me/notifications "$MGR")
check "Quản lý nhận thông báo giải trình, bấm vào được để duyệt" "$(echo "$r" | py "(d['unread'], d['items'][0]['kind'], d['items'][0]['title'], d['items'][0]['link']['no'], d['items'][0]['actionable'])")" "(1, 'approval.pending', 'Trần Thu Hà gửi giải trình công', '$NO', True)"
check "Nội dung có loại giải trình và mã đơn" "$(echo "$r" | py "'quên chấm ra' in d['items'][0]['body'] and 'Chờ bạn duyệt đơn $NO.' in d['items'][0]['body'] and '·' not in d['items'][0]['body']")" True
check "Người gửi không nhận thông báo duyệt" "$(call GET me/notifications "$EMP" | py "d['unread']")" 0
check "HR chưa nhận khi bước quản lý chưa xong" "$(call GET admin/notifications "$HR" | py "d['unread']")" 0

echo "— Quản lý duyệt → báo HR; HR duyệt → báo người gửi"
call POST "me/approvals/$T1/approve" "$MGR" '{}' >/dev/null
check "Thông báo của quản lý hết tác dụng sau khi duyệt" "$(call GET me/notifications "$MGR" | py "d['items'][0]['actionable']")" False
r=$(call GET admin/notifications "$HR")
check "HR nhận trên web" "$(echo "$r" | py "(d['unread'], d['items'][0]['title'], d['items'][0]['actionable'])")" "(1, 'Trần Thu Hà gửi giải trình công', True)"
T2=$(call GET "admin/requests?status=pending" "$HR" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO'][0]")
call POST "admin/approvals/$T2/approve" "$HR" '{}' >/dev/null
r=$(call GET me/notifications "$EMP")
check "Người gửi nhận \"đã được duyệt\" kèm người duyệt" "$(echo "$r" | py "(d['unread'], d['items'][0]['kind'], d['items'][0]['title'], 'Mai Phương Thảo đã duyệt' in d['items'][0]['body'])")" "(1, 'request.approved', 'Đơn giải trình công đã được duyệt', True)"

echo "— Từ chối"
B="{\"workDate\":\"$LATEDAY\",\"kind\":\"late\",\"clockIn\":\"08:00\",\"reason\":\"Kẹt xe do tai nạn trên cầu\"}"
r=$(call POST me/requests/explanations "$EMP" "$B"); NO2=$(echo "$r" | field data.no); T3=$(echo "$r" | field data.steps.0.taskId)
call POST "me/approvals/$T3/reject" "$MGR" '{"comment":"Không có minh chứng"}' >/dev/null
DAYLBL=$(python3 -c "import datetime; d=datetime.date.fromisoformat('$LATEDAY'); print(['T2','T3','T4','T5','T6','T7','CN'][d.weekday()]+' '+d.strftime('%d/%m'))")
check "Người gửi nhận \"bị từ chối\" kèm lý do" "$(call GET me/notifications "$EMP" | py "(d['items'][0]['title'], d['items'][0]['body'])")" "('Đơn giải trình công bị từ chối', 'Lê Quang Huy: Không có minh chứng. $DAYLBL, đến muộn có lý do. Mã đơn $NO2.')"

echo "— Máy mới được duyệt"
call POST me/devices "$EMP" '{"installationId":"smoke-notif-iphone","platform":"ios","deviceModel":"iPhone 11"}' >/dev/null
PIX=$(call POST me/devices "$EMP" '{"installationId":"smoke-notif-pixel","platform":"android","deviceModel":"Pixel 6"}' | field data.id)
call POST "admin/devices/$PIX/approve" "$HR" >/dev/null
check "Nhân viên nhận \"Máy đã được duyệt\"" "$(call GET me/notifications "$EMP" | py "(d['items'][0]['kind'], d['items'][0]['body'])")" "('device.approved', 'Pixel 6 dùng được để chấm công từ bây giờ.')"

echo "— Đã đọc"
r=$(call GET me/notifications "$EMP"); ONE=$(echo "$r" | field data.items.0.id)
check "Nhân viên có 3 thông báo chưa đọc" "$(echo "$r" | py "d['unread']")" 3
check "Mã thông báo sai → 400" "$(status POST me/notifications/read "$EMP" '{"ids":["x"]}')" 400
check "Không đánh dấu được thông báo của người khác" "$(call POST me/notifications/read "$MGR" "{\"ids\":[\"$ONE\"]}" >/dev/null; call GET me/notifications "$EMP" | py "d['unread']")" 3
check "Đánh dấu một thông báo" "$(call POST me/notifications/read "$EMP" "{\"ids\":[\"$ONE\"]}" | py "(d['unread'], d['items'][0]['readAt'] is not None)")" "(2, True)"
check "Đánh dấu tất cả" "$(call POST me/notifications/read "$EMP" '{}' | py "d['unread']")" 0
check "Web HR đánh dấu đã đọc" "$(call POST admin/notifications/read "$HR" '{}' | py "d['unread']")" 0
check "Cần đăng nhập" "$(status GET me/notifications)" 401

# Nhắc việc từ HR. Giả định: hôm nay là ngày làm việc của HD0142 (attendance_events đã truncate nên chưa chấm vào);
# vào cuối tuần/lễ bước nhắc chấm công sẽ cho sent=0. Giấy tờ bắt buộc tạo mới (seed có thể chưa có).
EMPID=60000000-0000-4000-8000-000000000142
has() { call GET me/notifications "$EMP" | py "'$1' in [i['kind'] for i in d['items']]"; }
B="{\"employeeIds\":[\"$EMPID\"]}"
echo "— HR nhắc chấm công"
# Ngày nghỉ/lễ của HD0142 thì không có ai cần nhắc
due=$(call GET admin/attendance/board "$HR" | py "[r['state'] for r in d['rows'] if r['employee']['id'] == '$EMPID' and not (r['leave'] and r['leave']['half'] == 'full')] in (['not_started'], ['absent'])")
if [ "$due" = True ]; then
  check "Nhắc chấm công: gửi 1 người" "$(call POST admin/attendance/remind "$HR" "$B" | py "(d['sent'], d['total'])")" "(1, 1)"
  check "Nhân viên thấy reminder.attendance" "$(has reminder.attendance)" True
  check "Nhắc lại cùng ngày → không trùng" "$(call POST admin/attendance/remind "$HR" "$B" | py "d['sent']")" 0
else
  check "Hôm nay HD0142 không cần chấm → không nhắc" "$(call POST admin/attendance/remind "$HR" "$B" | py "(d['sent'], d['total'])")" "(0, 0)"
fi
check "Nhân viên thường không được nhắc → 403" "$(status POST admin/attendance/remind "$EMP" "$B")" 403

echo "— HR nhắc giấy tờ"
check "Tạo giấy tờ bắt buộc" "$(status POST admin/checklist/items "$HR" '{"name":"Smoke giấy tờ nhắc việc","required":true}')" 201
check "Nhắc giấy tờ: gửi 1 người" "$(call POST admin/checklist/remind "$HR" "$B" | py "(d['sent'], d['total'] >= d['sent'])")" "(1, True)"
check "Nhân viên thấy reminder.documents" "$(has reminder.documents)" True
check "Nhắc giấy tờ lại → không trùng" "$(call POST admin/checklist/remind "$HR" "$B" | py "d['sent']")" 0

echo "— HR nhắc đọc bản tin"
r=$(call POST admin/announcements "$HR" '{"category":"notice","title":"Smoke nhắc đọc","body":"Bài thử nhắc đọc.","audience":"tenant"}'); AN=$(echo "$r" | field data.id); need "Tạo bài nháp" "$AN"
check "Bài nháp nhắc → 409" "$(status POST "admin/announcements/$AN/remind" "$HR")" 409
call POST "admin/announcements/$AN/publish" "$HR" '{}' >/dev/null
r=$(call POST "admin/announcements/$AN/remind" "$HR")
check "Bài đã xuất bản: nhắc người chưa đọc" "$(echo "$r" | py "(d['sent'] >= 1, d['total'] >= d['sent'])")" "(True, True)"
check "Nhân viên thấy reminder.announcement" "$(has reminder.announcement)" True
check "Nhắc bài lại → không trùng" "$(call POST "admin/announcements/$AN/remind" "$HR" | py "d['sent']")" 0
echo "Tất cả bước thông báo đều đạt."
