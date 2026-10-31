#!/bin/bash
# Kiểm thử minh chứng đính kèm đơn: nghỉ ốm từ 2 ngày bắt buộc minh chứng (bước duyệt cuối bị chặn khi chưa có), tải lên chỉ PDF/ảnh,
# chỉ người gửi khi đơn đang chờ, tối đa 3 file; mở file qua liên kết ký 5 phút (người gửi, quản lý được giao), web HR tải trực tiếp; audit.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"
OTHER=$(activate HDG0005 linh.vo@example.test); need "Nhân viên khác (Võ Thảo Linh) kích hoạt" "$OTHER"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"

W=$(call GET me/leave "$EMP" | py "' '.join(x['date'] for x in d['calendar'] if x['workday'] and x['date']>d['today'] and not x['taken'])")
set -- $W; D1=$1; D2=$2; D4=$4; D6=$6; D8=$8
need "Ngày làm việc sắp tới $D1 … $D8" "$D8"
B64=$(python3 -c "import base64; print(base64.b64encode(b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').decode())")
TXT=$(python3 -c "import base64; print(base64.b64encode(b'hello world, not a pdf').decode())")
up() { call POST "me/requests/$1/attachments" "${3:-$EMP}" "{\"fileName\":\"$2\",\"dataBase64\":\"${4:-$B64}\"}"; }
ups() { status POST "me/requests/$1/attachments" "${3:-$EMP}" "{\"fileName\":\"$2\",\"dataBase64\":\"${4:-$B64}\"}"; }
mgrtask() { call GET me/approvals "$MGR" | py "[i['myTaskId'] for i in d['items'] if i['id']=='$1'][0]"; }

echo "— Đơn nghỉ ốm 2 ngày: bắt buộc minh chứng"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"SL\",\"from\":\"$D1\",\"to\":\"$D2\",\"reason\":\"Sốt xuất huyết\"}"); R1=$(echo "$r" | field data.id)
check "Đơn cần minh chứng, chưa có file, người gửi đính kèm được" "$(echo "$r" | py "(d['attachmentRequired'], len(d['attachments']), d['canAttach'])")" "(True, 0, True)"
T1=$(mgrtask "$R1")
_s1=$(status POST "me/approvals/$T1/approve" "$MGR" '{}') || :
check "Quản lý là bước cuối → chưa có minh chứng không duyệt được (409)" "$_s1" 409
_s1=$(ups "$R1" note.txt "$EMP" "$TXT") || :
check "File không phải PDF/ảnh → 400" "$_s1" 400
_s1=$(ups "$R1" giay-kham.pdf "$MGR") || :
check "Người không phải người gửi không đính kèm được → 404" "$_s1" 404
r=$(up "$R1" "giay-kham/benh-vien.pdf"); A1=$(echo "$r" | py "d['attachments'][0]['id']")
check "Đính kèm PDF: tên file bỏ ký tự đường dẫn, nhận dạng theo nội dung" "$(echo "$r" | py "[(a['name'], a['type']) for a in d['attachments']]")" "[('giay-kham_benh-vien.pdf', 'application/pdf')]"
check "Quản lý thấy minh chứng trong đơn cần duyệt" "$(call GET me/approvals "$MGR" | py "[len(i['attachments']) for i in d['items'] if i['id']=='$R1'][0]")" 1

echo "— Mở file"
P=$(call POST "me/requests/$R1/attachments/$A1/file-link" "$EMP" | field data.path)
F=$(mktemp)
_s1=$(curl -s "$API/$P" -o "$F" -w '%{http_code} %{content_type}') || :
check "Người gửi mở bằng liên kết ký: đúng file PDF" "$_s1 $(head -c 5 "$F")" "200 application/pdf %PDF-"
rm -f "$F"
P2=$(call POST "me/requests/$R1/attachments/$A1/file-link" "$MGR" | field data.path)
check "Quản lý được giao duyệt mở được" "$(curl -s -o /dev/null -w '%{http_code}' "$API/$P2")" 200
check "Sửa chữ ký → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/${P2%sig=*}sig=AAAA")" 404
check "Nhân viên khác không lấy được liên kết → 404" "$(status POST "me/requests/$R1/attachments/$A1/file-link" "$OTHER")" 404
check "Web HR tải trực tiếp" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$API/admin/requests/$R1/attachments/$A1/file" -H "authorization: Bearer $HR")" "200 application/pdf"
check "Mỗi lần tải ghi audit" "$(sql "select count(*) from public.audit_logs where action='request.attachment_downloaded' and resource_id='$R1'")" 3

echo "— Giới hạn và duyệt"
up "$R1" anh-2.pdf >/dev/null; r=$(up "$R1" anh-3.pdf)
check "Đủ 3 file thì hết quyền đính kèm" "$(echo "$r" | py "(len(d['attachments']), d['canAttach'])")" "(3, False)"
_s1=$(ups "$R1" anh-4.pdf) || :
check "File thứ 4 → 409" "$_s1" 409
check "Có minh chứng → quản lý duyệt được" "$(call POST "me/approvals/$T1/approve" "$MGR" '{}' | field data.status)" approved
_s1=$(ups "$R1" sau-khi-duyet.pdf) || :
check "Đơn đã xử lý không thêm file → 409" "$_s1" 409

echo "— Đơn 3 ngày: quản lý → HR, HR là bước cuối"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"SL\",\"from\":\"$D4\",\"to\":\"$D6\",\"reason\":\"Điều trị nội trú\"}"); R2=$(echo "$r" | field data.id)
check "Quản lý duyệt bước đầu dù chưa có minh chứng" "$(call POST "me/approvals/$(mgrtask "$R2")/approve" "$MGR" '{}' | py "[s['status'] for s in d['steps']]")" "['approved', 'pending']"
H2=$(call GET "admin/requests/$R2" "$HR" | field data.myTaskId)
r=$(call POST "admin/approvals/$H2/approve" "$HR" '{}')
check "HR duyệt bước cuối khi chưa có minh chứng → bị chặn kèm hướng dẫn" "$(echo "$r" | field error.code) $(echo "$r" | field error.message | cut -d. -f1)" "CONFLICT Đơn cần minh chứng nhưng nhân viên chưa đính kèm"
up "$R2" giay-ra-vien.pdf >/dev/null
check "Có minh chứng → HR duyệt được" "$(call POST "admin/approvals/$H2/approve" "$HR" '{}' | field data.status)" approved

echo "— Đơn không yêu cầu minh chứng"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$D8\",\"reason\":\"Việc riêng\"}")
_s1=$(echo "$r" | py "(d['attachmentRequired'], d['canAttach'])")
check "Nghỉ không lương 1 ngày: không bắt buộc, vẫn đính kèm được" "$_s1" "(False, True)"
echo "Tất cả bước minh chứng đều đạt."
