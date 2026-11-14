#!/usr/bin/env bash
# Danh mục giấy tờ hồ sơ đầu-cuối qua API thật (docs/plans/payroll-tenant-rules.md mục 4). Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HA=60000000-0000-4000-8000-000000000142
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR bật MFA" "$HR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Công ty B bật MFA" "$TB"

echo "— Danh mục của công ty"
check "Kế toán không có quyền tài liệu → 403" "$(status GET admin/checklist/items "$PAY")" 403
check "Chưa có danh mục, HR quản lý được" "$(call GET admin/checklist/items "$HR" | py "(len(d['items']), d['canManage'])")" "(0, True)"
_r=$(call POST admin/checklist/items/templates "$HR") || :
check "Thêm mẫu: 11 mục, có mục đích thu thập" "$(echo "$_r" | py "(len(d['items']), all(x['purpose'] for x in d['items']))")" "(11, True)"
check "Thêm mẫu lần nữa không trùng" "$(call POST admin/checklist/items/templates "$HR" | py "len(d['items'])")" 11
check "Trùng tên → 409" "$(status POST admin/checklist/items "$HR" '{"name":"cccd (BẢN SAO)","required":true,"employmentTypes":null}')" 409
check "Tình trạng lao động sai → 400" "$(status POST admin/checklist/items "$HR" '{"name":"X","required":true,"employmentTypes":["ceo"]}')" 400
_r=$(call POST admin/checklist/items "$HR" '{"name":"Cam kết thử việc","required":true,"employmentTypes":["probation"],"purpose":"Hồ sơ thử việc"}') || :
PROB=$(echo "$_r" | py "[x['id'] for x in d['items'] if x['name']=='Cam kết thử việc'][0]"); need "Tạo mục chỉ cho thử việc" "$PROB"
CCCD=$(echo "$_r" | py "[x['id'] for x in d['items'] if x['name']=='CCCD (bản sao)'][0]")
DEP=$(echo "$_r" | py "[x['id'] for x in d['items'] if x['name']=='Giấy tờ người phụ thuộc'][0]")
_r=$(call PATCH admin/checklist/items/$PROB "$HR" '{"name":"Cam kết thử việc (ký)","required":false,"employmentTypes":["probation","intern"],"purpose":"Hồ sơ thử việc"}') || :
check "Sửa mục" "$(echo "$_r" | py "[(x['name'], x['required'], x['employmentTypes']) for x in d['items'] if x['id']=='$PROB'][0]")" "('Cam kết thử việc (ký)', False, ['probation', 'intern'])"

echo "— Tích từng nhân viên"
E=$(call GET admin/employees/$HA/checklist "$HR")
check "Hà (chính thức): 12 mục, mục thử việc không áp dụng, thiếu 4 mục bắt buộc, HR sửa được" "$(echo "$E" | py "(len(d['entries']), [e['applies'] for e in d['entries'] if e['item']['id']=='$PROB'][0], d['missingRequired'], d['canEdit'])")" "(12, False, 4, True)"
check "Đã nộp thiếu hình thức → 400" "$(status POST admin/employees/$HA/checklist/$CCCD "$HR" '{"status":"submitted"}')" 400
check "Không có hình thức giữ bản chính → 400" "$(status POST admin/employees/$HA/checklist/$CCCD "$HR" '{"status":"submitted","form":"original_kept"}')" 400
check "Ngày nộp sau hôm nay → 400" "$(status POST admin/employees/$HA/checklist/$CCCD "$HR" "{\"status\":\"submitted\",\"form\":\"copy\",\"submittedOn\":\"$(today 3)\"}")" 400
_r=$(call POST admin/employees/$HA/checklist/$CCCD "$HR" '{"status":"submitted","form":"original_checked"}') || :
check "Tích CCCD đã đối chiếu bản chính (ngày nộp mặc định hôm nay) → còn thiếu 3" "$(echo "$_r" | py "([(e['status'], e['form'], e['submittedOn']) for e in d['entries'] if e['item']['id']=='$CCCD'][0], d['missingRequired'])")" "(('submitted', 'original_checked', '$(today 0)'), 3)"
check "Không áp dụng thiếu lý do → 400" "$(status POST admin/employees/$HA/checklist/$DEP "$HR" '{"status":"waived","note":" "}')" 400
_r=$(call POST admin/employees/$HA/checklist/$DEP "$HR" '{"status":"waived","note":"Chưa có người phụ thuộc"}') || :
check "Đánh dấu không áp dụng có lý do" "$(echo "$_r" | py "[(e['status'], e['note']) for e in d['entries'] if e['item']['id']=='$DEP'][0]")" "('waived', 'Chưa có người phụ thuộc')"
G=$(call GET admin/checklist/gaps "$HR")
check "Danh sách thiếu giấy tờ: Hà thiếu 3 mục, không còn CCCD" "$(echo "$G" | py "[(len(r['missing']), 'CCCD (bản sao)' in r['missing']) for r in d['rows'] if r['employeeId']=='$HA'][0]")" "(3, False)"
check "Thiếu giấy tờ: required = số mục bắt buộc áp dụng cho Hà" "$(echo "$G" | py "[r['required'] for r in d['rows'] if r['employeeId']=='$HA'][0]")" 4
_r=$(call POST admin/employees/$HA/checklist/$CCCD "$HR" '{"status":null}') || :
check "Bỏ tích CCCD → thiếu lại 4" "$(echo "$_r" | py "d['missingRequired']")" 4
_r=$(call POST admin/employees/$HA/checklist/$CCCD "$HR" '{"status":"submitted","form":"copy"}') || :
_r=$(call POST admin/checklist/items/$CCCD/archive "$HR" '{"archived":true}') || :
check "Ngừng dùng CCCD: vẫn hiện ở Hà vì đã tích, không tính thiếu" "$(call GET admin/employees/$HA/checklist "$HR" | py "([e['item']['archived'] for e in d['entries'] if e['item']['id']=='$CCCD'][0], d['missingRequired'])")" "(True, 3)"

echo "— Quyền và nhật ký"
check "Công ty khác không xem được nhân viên → 404" "$(status GET admin/employees/$HA/checklist "$TB")" 404
check "Công ty khác không tích được → 404" "$(status POST admin/employees/$HA/checklist/$CCCD "$TB" '{"status":null}')" 404
check "Kế toán không tích được → 403" "$(status POST admin/employees/$HA/checklist/$DEP "$PAY" '{"status":null}')" 403
check "Nhật ký: 4 lần cập nhật giấy tờ của Hà (lần lỗi không ghi)" "$(sql "select count(*) from public.audit_logs where action='checklist.updated' and resource_id='$HA'")" 4
echo "Tất cả bước danh mục giấy tờ đều đạt."
