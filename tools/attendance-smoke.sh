#!/usr/bin/env bash
# Kiểm thử đầu-cuối chấm công: kích hoạt HD0142 → đăng ký thiết bị → chấm công trong/ngoài vùng, chống trùng,
# sai trình tự, máy thứ hai chờ duyệt, bản ghi offline, hai lượt vào cùng lúc. Cần DB vừa `supabase db reset` và API đang chạy (development).
set -euo pipefail
API=${API:-http://localhost:4000/api/v1}
MAIL=${MAIL:-http://127.0.0.1:55324}
EMAIL=thao.ha@haidang.vn
OFFICE_LAT=10.774390; OFFICE_LNG=106.703940

post() { curl -s -X POST "$API/$1" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} -d "$2"; }
get() { curl -s "$API/$1" -H "authorization: Bearer $TOKEN"; }
field() { python3 -c "import json,sys; d=json.load(sys.stdin); v=d; [v:=v[k] if isinstance(v,dict) else (v[int(k)] if isinstance(v,list) else None) for k in sys.argv[1].split('.')]; print('' if v is None else v)" "$1"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; else echo "✘ $1 (được: '$2', cần: '$3')"; exit 1; fi; }
uuid() { python3 -c "import uuid; print(uuid.uuid4())"; }

curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
post auth/activate/start "{\"employeeCode\":\"HD0142\",\"email\":\"$EMAIL\"}" >/dev/null
id=""
for _ in $(seq 1 30); do
  id=$(curl -s "$MAIL/api/v1/search?query=to:$EMAIL" | python3 -c "import json,sys; m=json.load(sys.stdin).get('messages') or []; print(m[0]['ID'] if m else '')" 2>/dev/null || true)
  [ -n "$id" ] && break; sleep 0.5
done
code=$(curl -s "$MAIL/api/v1/message/$id" | python3 -c "import json,sys,re; print(re.search(r'\b(\d{6})\b', json.load(sys.stdin)['Text']).group(1))")
TOKEN=$(post auth/activate/verify "{\"email\":\"$EMAIL\",\"code\":\"$code\",\"password\":\"Kavor2026A\",\"privacyAccepted\":true}" | field data.session.accessToken)
[ -n "$TOKEN" ] && echo "✔ Đã kích hoạt và đăng nhập HD0142"

r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"install-iphone-01\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}")
check "Máy chưa đăng ký không chấm công được" "$(echo "$r" | field error.code)" ATT_DEVICE_NOT_REGISTERED

r=$(post me/devices '{"installationId":"install-iphone-01","platform":"ios","deviceModel":"iPhone 11","osVersion":"18.5","appVersion":"0.1.0"}')
check "Đăng ký thiết bị đầu tiên → hoạt động" "$(echo "$r" | field data.status)" active
r=$(post me/devices '{"installationId":"install-iphone-01","platform":"ios","deviceModel":"iPhone 11"}')
check "Đăng ký lại cùng máy không tạo bản ghi mới" "$(echo "$r" | field data.status)" active
r=$(post me/devices '{"installationId":"install-pixel-02","platform":"android","deviceModel":"Pixel 6"}')
check "Máy thứ hai chờ HR duyệt" "$(echo "$r" | field data.status)" pending

r=$(get "me/attendance/today?installationId=install-iphone-01")
check "Hôm nay: có địa điểm Văn phòng Quận 1" "$(echo "$r" | field data.locations.0.name)" "Văn phòng Quận 1"
check "Hôm nay: chưa có bản ghi" "$(echo "$r" | field data.clockIn)" ""

r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"install-pixel-02\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}")
check "Máy đang chờ duyệt không chấm công được" "$(echo "$r" | field error.code)" ATT_DEVICE_PENDING

r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"out\",\"installationId\":\"install-iphone-01\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}")
check "Ra ca trước khi vào ca bị chặn" "$(echo "$r" | field error.code)" ATT_INVALID_SEQUENCE

r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"install-iphone-01\",\"latitude\":10.7760,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}")
check "Cách văn phòng ~180 m → từ chối ngoài vùng" "$(echo "$r" | field data.rejectReason)" out_of_range

r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"install-iphone-01\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":150}")
check "GPS sai số 150 m → từ chối" "$(echo "$r" | field data.rejectReason)" low_accuracy

KEY=$(uuid)
r=$(post me/attendance/events "{\"clientEventId\":\"$KEY\",\"kind\":\"in\",\"installationId\":\"install-iphone-01\",\"latitude\":10.77445,\"longitude\":106.70398,\"accuracyM\":9}")
check "Vào ca trong vùng được ghi nhận" "$(echo "$r" | field data.status)" accepted
first=$(echo "$r" | field data.id)
r=$(post me/attendance/events "{\"clientEventId\":\"$KEY\",\"kind\":\"in\",\"installationId\":\"install-iphone-01\",\"latitude\":10.77445,\"longitude\":106.70398,\"accuracyM\":9}")
check "Gửi lại cùng khóa trả đúng bản ghi cũ (không trùng)" "$(echo "$r" | field data.id)" "$first"

r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"install-iphone-01\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}")
check "Vào ca lần hai bị chặn" "$(echo "$r" | field error.code)" ATT_INVALID_SEQUENCE

old=$(python3 -c "import datetime; print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=30)).isoformat())")
r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"out\",\"installationId\":\"install-iphone-01\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8,\"offline\":true,\"occurredAt\":\"$old\"}")
check "Bản ghi offline quá 24 giờ bị từ chối" "$(echo "$r" | field error.code)" ATT_CLOCK_SKEW

recent=$(python3 -c "import datetime; print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=40)).isoformat())")
r=$(post me/attendance/events "{\"clientEventId\":\"$(uuid)\",\"kind\":\"out\",\"installationId\":\"install-iphone-01\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8,\"offline\":true,\"occurredAt\":\"$recent\"}")
check "Ra ca gửi từ hàng đợi offline giữ giờ trên máy" "$(echo "$r" | field data.offline)" True

r=$(get "me/attendance/today?installationId=install-iphone-01")
check "Hôm nay: đã có giờ vào" "$(echo "$r" | field data.clockIn.status)" accepted
check "Hôm nay: đã có giờ ra" "$(echo "$r" | field data.clockOut.status)" accepted
check "Hôm nay: thiết bị đang hoạt động" "$(echo "$r" | field data.device.status)" active

echo "— Hai lượt vào ca cùng lúc với khóa chống trùng khác nhau: lượt sau chờ khóa rồi bị chặn (trigger attendance_events_once_per_day)"
# Phiên A ghi lượt vào (HD0004, 03/06/2024) rồi giữ giao dịch 3 giây; phiên B ghi lượt vào cùng ngày đúng lúc đó (bản cũ: cả hai đều ghi)
pg() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -Atq "$@"; }
ev() { echo "insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, status) values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'in', '$1', '2024-06-03 $2+07', 'accepted');"; }
sleeping() { pg -c "select count(*) from pg_stat_activity where wait_event = 'PgSleep' and pid <> pg_backend_pid()"; }
pg -c "begin; $(ev race-smoke-a 07:58) select pg_sleep(3); commit;" >/dev/null &
A=$!
for _ in $(seq 1 50); do [ "$(sleeping)" = 1 ] && break; sleep 0.1; done
check "Phiên A đã ghi lượt vào và đang giữ giao dịch" "$(sleeping)" 1
T0=$(python3 -c "import time; print(time.time())")
_s=$(pg -c "$(ev race-smoke-b 07:59)" 2>&1) || :
WAITED=$(python3 -c "import time,sys; print(time.time() - float(sys.argv[1]) > 1)" "$T0")
wait $A || { echo "✘ Phiên A lỗi"; exit 1; }
check "Phiên B phải chờ khóa của phiên A" "$WAITED" True
check "Phiên B bị chặn: đã có lượt vào hợp lệ trong ngày" "$(echo "$_s" | grep -o ATT_DUPLICATE | head -1)" ATT_DUPLICATE
check "Ngày 03/06/2024 chỉ một lượt vào hợp lệ" "$(pg -c "select count(*) from public.attendance_events where employee_id = '60000000-0000-4000-8000-000000000004' and kind = 'in' and status = 'accepted' and occurred_at::date = '2024-06-03'")" 1
echo "Tất cả bước chấm công đều đạt."
