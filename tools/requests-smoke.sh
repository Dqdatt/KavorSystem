#!/bin/bash
# Kiểm thử danh sách đơn web HR để đối chiếu: đếm theo trạng thái (đơn đã duyệt không mất), lọc loại/phòng ban/ngày áp dụng/ngày gửi/tìm,
# phân trang ở máy chủ, xuất CSV theo bộ lọc (ghi nhật ký), phạm vi quản lý, tham số sai.
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
T=$(call GET "admin/requests?status=pending&q=$HS" "$HR" | py "d['items'][0]['myTaskId']")
call POST "admin/approvals/$T/approve" "$HR" '{}' >/dev/null
r=$(q "status=pending")
check "Duyệt xong: rời tab Chờ duyệt, sang Đã duyệt" "$(echo "$r" | py "(d['counts']['pending'], d['counts']['approved'])")" "(2, 1)"
check "Tab Đã duyệt có đơn vừa duyệt" "$(q "status=approved" | py "[i['no'] for i in d['items']]")" "['$HS']"
check "Tham số cũ status=rejected vẫn nhận (gộp Từ chối/Hủy)" "$(q "status=rejected" | py "d['total']")" 0

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
echo "Tất cả bước danh sách đơn đều đạt."
