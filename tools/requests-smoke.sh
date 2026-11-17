#!/bin/bash
# Kiểm thử danh sách đơn web HR để đối chiếu: đếm theo trạng thái (đơn đã duyệt không mất), lọc loại/phòng ban/ngày áp dụng/ngày gửi/tìm,
# phân trang ở máy chủ, xuất CSV theo bộ lọc (ghi nhật ký), phạm vi quản lý, tham số sai, duyệt song song (bấm 2 lần không bỏ qua bước).
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý kích hoạt" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGRW=$(mfa "$MGR"); need "Quản lý bật MFA cho web" "$MGRW"
TODAY=$(today)

echo "— Ba đơn: hai đơn nghỉ khác ngày, một đơn sửa hồ sơ"
r=$(call GET me/leave "$EMP")
W=$(echo "$r" | py "' '.join(x['date'] for x in d['calendar'] if x['workday'] and x['date']>d['today'] and not x['taken'])"); set -- $W; D1=$1; D3=$3
need "Ngày làm việc sắp tới $D1, $D3" "$D3"
L1=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$D1\",\"reason\":\"Việc riêng\"}" | field data.no)
L2=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$D3\",\"reason\":\"Khám bệnh\"}" | field data.no)
HS=$(call POST me/requests/profile "$EMP" '{"phone":"0901234567"}' | field data.no)
need "Gửi $L1, $L2, $HS" "$HS"
q() { call GET "admin/requests?$1" "$HR"; }

echo "— Đếm theo trạng thái, ngày áp dụng"
r=$(q "status=pending")
check "Tab Chờ duyệt: 3 đơn; đếm Đã duyệt/Từ chối-Hủy/Tất cả" "$(echo "$r" | py "(d['counts']['pending'], d['counts']['approved'], d['counts']['closed'], d['counts']['all'], d['total'])")" "(3, 0, 0, 3, 3)"
check "Đơn nghỉ có ngày áp dụng, sửa hồ sơ không có" "$(echo "$r" | py "sorted((i['no'], i['applied'] and i['applied']['from']) for i in d['items'])")" "[('$HS', None), ('$L1', '$D1'), ('$L2', '$D3')]"
check "Người gửi có phòng ban và chức danh" "$(echo "$r" | py "sorted({(i['requester']['code'], i['requester']['department'] is not None, i['requester']['position'] is not None) for i in d['items']})")" "[('HD0142', True, True)]"
T=$(call GET "admin/requests?status=pending&q=$HS" "$HR" | py "d['items'][0]['myTaskId']")
call POST "admin/approvals/$T/approve" "$HR" '{}' >/dev/null
r=$(q "status=pending")
check "Duyệt xong: rời tab Chờ duyệt, sang Đã duyệt" "$(echo "$r" | py "(d['counts']['pending'], d['counts']['approved'])")" "(2, 1)"
check "Tab Đã duyệt có đơn vừa duyệt" "$(q "status=approved" | py "[i['no'] for i in d['items']]")" "['$HS']"
check "Tham số cũ status=rejected vẫn nhận (gộp Từ chối/Hủy)" "$(q "status=rejected" | py "d['total']")" 0
check "Tab Đã xử lý (duyệt + từ chối/hủy)" "$(q "status=done" | py "(d['counts']['done'], [i['no'] for i in d['items']])")" "(1, ['$HS'])"
_s1=$(q "status=pending&only=others") || :
check "Đang chờ người khác = chờ duyệt trừ đơn của tôi" "$(echo "$_s1" | py "(d['total']==d['counts']['pending']-d['counts']['mine'], all(i['myTaskId'] is None for i in d['items']))")" "(True, True)"

echo "— Lọc"
check "Theo loại đơn" "$(q "status=all&type=leave" | py "d['total']")" 2
check "Theo ngày áp dụng $D1" "$(q "status=all&from=$D1&to=$D1" | py "[i['no'] for i in d['items']]")" "['$L1']"
check "Theo ngày gửi hôm nay: cả 3" "$(q "status=all&dateBy=submitted&from=$TODAY&to=$TODAY" | py "d['total']")" 3
check "Tìm theo mã đơn" "$(q "status=all&q=$L2" | py "[i['no'] for i in d['items']]")" "['$L2']"
check "Tìm tên không dấu" "$(q "status=all&q=tran%20thu" | py "d['total']")" 3
DEP=$(call GET admin/org "$HR" | py "[x['department'] for x in d['employees'] if x['code']=='HD0142'][0]")
DEP_ID=$(call GET admin/org "$HR" | py "[x['id'] for x in d['departments'] if x['name']=='$DEP'][0]")
OTHER=$(call GET admin/org "$HR" | py "[x['id'] for x in d['departments'] if x['name']!='$DEP'][0]")
check "Theo phòng ban của người gửi / phòng khác" "$(q "status=all&departmentId=$DEP_ID" | py "d['total']") $(q "status=all&departmentId=$OTHER" | py "d['total']")" "3 0"
EMP_ID=$(call GET admin/org "$HR" | py "[x['id'] for x in d['employees'] if x['code']=='HD0142'][0]")
check "Theo nhân viên (mục Đơn từ trong hồ sơ)" "$(q "status=all&employeeId=$EMP_ID&pageSize=10" | py "d['total']")" 3

echo "— Phân trang, tham số sai, phạm vi"
check "Trang 2, mỗi trang 1 đơn" "$(q "status=all&page=2&pageSize=1" | py "(len(d['items']), d['page'], d['pageSize'], d['total'])")" "(1, 2, 1, 3)"
check "Trạng thái sai → 400" "$(status GET "admin/requests?status=xyz" "$HR")" 400
check "Từ ngày sau đến ngày → 400" "$(status GET "admin/requests?from=$D3&to=$D1" "$HR")" 400
check "Quản lý chỉ thấy đơn trong phạm vi" "$(call GET "admin/requests?status=all" "$MGRW" | py "d['total']")" 3

echo "— Xuất CSV"
F=$(mktemp)
_s1=$(curl -s -o "$F" -w '%{http_code} %{content_type}' "$API/admin/requests/export?type=leave" -H "authorization: Bearer $HR") || :
check "Xuất CSV theo bộ lọc (2 đơn nghỉ + dòng tiêu đề, có BOM)" "$_s1 $(python3 -c "import sys; t=open(sys.argv[1],encoding='utf-8').read(); print(t.startswith('﻿Mã đơn'), len(t.strip().splitlines()))" "$F")" "200 text/csv; charset=utf-8 True 3"
check "File có ngày áp dụng và các bước duyệt" "$(python3 -c "import sys; t=open(sys.argv[1],encoding='utf-8').read(); print('$D1' in t and 'Quản lý trực tiếp: đang chờ' in t)" "$F")" True
rm -f "$F"
check "Xuất file ghi nhật ký" "$(sql "select count(*) from public.audit_logs where action='request.exported'")" 1

echo "— Duyệt song song: bấm 2 lần không bỏ qua bước HR (decide_approval khóa đơn trước khi đọc bước)"
# Hai khối 3 ngày làm việc chưa có đơn, cùng năm → đơn nghỉ > 2 ngày đi Quản lý → HR
_s1=$(call GET me/leave "$EMP") || :
BLK=$(echo "$_s1" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']; cal=[x for x in d['calendar'] if x['date']>d['today']]
W=[x['date'] for x in cal if x['workday'] and not x['taken']]
out=[]; i=0
while i+2<len(W) and len(out)<4:
  f,t=W[i],W[i+2]
  if f[:4]==t[:4] and (not out or f>out[-1]) and not any(x['workday'] and x['taken'] for x in cal if f<=x['date']<=t): out+=[f,t]; i+=3
  else: i+=1
print(' '.join(out))")
set -- $BLK; F1=${1:-}; T1=${2:-}; F2=${3:-}; T2=${4:-}
need "Hai khối ngày nghỉ $F1→$T1, $F2→$T2" "$T2"
LA=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$F1\",\"to\":\"$T1\",\"reason\":\"Về quê có việc\"}" | field data.no)
LB=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$F2\",\"to\":\"$T2\",\"reason\":\"Đưa con đi khám\"}" | field data.no)
need "Gửi $LA, $LB" "$LB"
steps() { sql "select r.status || ' ' || string_agg(t.resolver || ':' || t.status, ',' order by t.step_no) from public.requests r join public.approval_tasks t on t.request_id = r.id where r.request_no = '$1' group by r.status"; }
task1() { sql "select t.id from public.approval_tasks t join public.requests r on r.id = t.request_id where r.request_no = '$1' and t.step_no = 1"; }
check "Đơn $LA có 2 bước: Quản lý đang chờ, HR chờ tới lượt" "$(steps "$LA")" "pending direct_manager:pending,hr:waiting"
TA=$(task1 "$LA"); MU=$(sql "select user_id from public.employees where employee_code = 'HDG0003'")
# Phiên A duyệt rồi giữ khóa 3 giây; phiên B gọi đúng lúc đó → phải chờ khóa rồi thấy bước đã duyệt (bản cũ: B duyệt tiếp, đơn thành approved)
pg() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -Atq "$@"; }
sleeping() { sql "select count(*) from pg_stat_activity where wait_event = 'PgSleep' and pid <> pg_backend_pid()"; }
pg -c "begin; select public.decide_approval('$TA', '$MU', true); select pg_sleep(3); commit;" >/dev/null &
A=$!
for _ in $(seq 1 50); do [ "$(sleeping)" = 1 ] && break; sleep 0.1; done
check "Phiên A đã duyệt và đang giữ khóa đơn" "$(sleeping)" 1
T0=$(python3 -c "import time; print(time.time())")
_s2=$(pg -c "select public.decide_approval('$TA', '$MU', true)" 2>&1) || :
WAITED=$(python3 -c "import time,sys; print(time.time() - float(sys.argv[1]) > 1)" "$T0")
wait $A || { echo "✘ Phiên A lỗi"; exit 1; }
check "Phiên B phải chờ khóa của phiên A" "$WAITED" True
check "Phiên B bị chặn: bước vừa được duyệt" "$(echo "$_s2" | grep -o TASK_NOT_PENDING | head -1)" TASK_NOT_PENDING
check "Đơn $LA vẫn chờ, bước HR đang chờ duyệt" "$(steps "$LA")" "pending direct_manager:approved,hr:pending"
# Qua API: quản lý bấm duyệt 2 lần cùng lúc
TB=$(task1 "$LB"); F=$(mktemp)
status POST "me/approvals/$TB/approve" "$MGR" '{}' >"$F.1" &
status POST "me/approvals/$TB/approve" "$MGR" '{}' >"$F.2" &
wait
R=$( (cat "$F.1"; echo; cat "$F.2"; echo) | sort | tr '\n' ' ')
rm -f "$F" "$F.1" "$F.2"
check "Hai lần bấm duyệt cùng lúc: một 200, một 409" "$R" "200 409 "
check "Đơn $LB vẫn chờ, bước HR đang chờ duyệt" "$(steps "$LB")" "pending direct_manager:approved,hr:pending"
echo "Tất cả bước danh sách đơn đều đạt."
