#!/usr/bin/env bash
# Nhập nhân viên hàng loạt từ CSV (docs/plans/employee-import.md): xem trước, chặn khi còn lỗi, ghi nguyên khối, nhập lại không trùng,
# phạm vi HR, giới hạn gói. Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HDG=10000000-0000-4000-8000-000000000001
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
body() { python3 -c "import json,sys; print(json.dumps({'fileName': sys.argv[1], 'csv': open(sys.argv[2], encoding='utf-8').read(), 'dryRun': sys.argv[3] == 'dry'}))" "$1" "$2" "$3" > "$TMPF"; }
TMPF=$(mktemp); trap 'rm -f "$TMPF" "$BAD"' EXIT
imp() { curl -s -X POST "$API/admin/employees/import" -H 'content-type: application/json' -H "authorization: Bearer $1" --data-binary @"$TMPF"; }
SAMPLE="$(dirname "$0")/../sample-data/employees_import_sample.csv"

HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"
BEFORE=$(sql "select count(*) from public.employees where tenant_id='$HDG'")

echo "— Xem trước"
body employees_import_sample.csv "$SAMPLE" dry
R=$(imp "$HR")
check "File mẫu: 3 dòng tạo mới, không lỗi, chưa ghi" "$(echo "$R" | py "(d['totals'], d['applied'], d['fileErrors'])")" "({'rows': 3, 'create': 3, 'exists': 0, 'error': 0}, False, [])"
check "Xem trước không ghi gì" "$(sql "select count(*) from public.employees where tenant_id='$HDG'")" "$BEFORE"
check "Quản lý không nhập được (thiếu employee.create) → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/employees/import" -H 'content-type: application/json' -H "authorization: Bearer $MGR" --data-binary @"$TMPF")" 403

BAD=$(mktemp --suffix=.csv)
printf 'employee_code,full_name,work_email,hire_date,employment_type,department_code,position_code,manager_code\nHD0601,Võ Văn Một,mot.vo@haidang.vn,2026-11-01,Chính thức,MKT,AE,\nHD0602,Hai,thao.ha@haidang.vn,30/02/2026,Chính thức,KHONGCO,AE,\nHD0603,Lê Ba,ba.le@haidang.vn,01/11/2026,Chính thức,MKT,AE,HD0602\nHD0007,Trùng mã có sẵn,khac@haidang.vn,2026-11-01,Chính thức,MKT,AE,\n' > "$BAD"
body bad.csv "$BAD" dry
R=$(imp "$HR")
check "File lỗi: 1 tạo mới, 1 đã có, 2 lỗi" "$(echo "$R" | py "d['totals']")" "{'rows': 4, 'create': 1, 'exists': 1, 'error': 2}"
check "Lý do lỗi từng dòng: email đã dùng, phòng ban không có, ngày sai, quản lý ở dòng lỗi" "$(echo "$R" | py "[(r['code'], sorted(r['errors'])) for r in d['rows'] if r['action']=='error']")" \
  "[('HD0602', ['Email đã dùng cho hồ sơ khác', 'Ngày vào làm dạng YYYY-MM-DD hoặc DD/MM/YYYY', 'Phòng ban KHONGCO không có hoặc đã ngừng']), ('HD0603', ['Quản lý HD0602 ở dòng có lỗi'])]"
body bad.csv "$BAD" apply
check "Còn lỗi thì không nhập (422), không ghi dòng nào" "$(imp "$HR" | field error.code):$(sql "select count(*) from public.employees where employee_code='HD0601'")" "IMPORT_HAS_ERRORS:0"

echo "— Nhập"
body employees_import_sample.csv "$SAMPLE" apply
R=$(imp "$HR")
check "Nhập file mẫu: tạo 3 hồ sơ" "$(echo "$R" | py "(d['applied'], d['totals']['create'])")" "(True, 3)"
check "Hồ sơ, phân công, quản lý trong cùng file, loại hợp đồng, ngày vào làm" "$(sql "select e.employee_code || '|' || e.employment_type || '|' || e.hire_date || '|' || d.code || '|' || coalesce(m.employee_code,'-') from public.employees e join public.employee_assignments a on a.employee_id = e.id join public.departments d on d.id = a.department_id left join public.employees m on m.id = a.manager_employee_id where e.employee_code='HD0501'")" "HD0501|probation|2026-11-01|MKT|HD0503"
check "Nhân viên mới hiện trong danh sách web HR" "$(call GET admin/employees "$HR" | py "sorted(e['code'] for e in d if e['code'].startswith('HD05'))")" "['HD0501', 'HD0502', 'HD0503']"
R=$(imp "$HR")
check "Nhập lại cùng file: 3 dòng đã có, không tạo trùng" "$(echo "$R" | py "(d['totals']['create'], d['totals']['exists'])"):$(sql "select count(*) from public.employees where employee_code like 'HD050%'")" "(0, 3):3"
check "Audit: 1 dòng nhập + 3 hồ sơ tạo, không chép email" "$(sql "select count(*) filter (where action='employee.imported') || '|' || count(*) filter (where action='employee.created' and after_data->>'source'='import') || '|' || count(*) filter (where after_data::text like '%lan.nguyen%') from public.audit_logs where tenant_id='$HDG'")" "1|3|0"

echo "— Giới hạn gói"
sql "update public.tenants set employee_limit = (select count(*) from public.employees where tenant_id='$HDG' and status <> 'terminated') + 1 where id='$HDG'"
printf 'employee_code,full_name,work_email,hire_date,employment_type,department_code,position_code\nHD0701,Một Người,mot.nguoi@haidang.vn,2026-11-01,official,MKT,AE\nHD0702,Hai Người,hai.nguoi@haidang.vn,2026-11-01,official,MKT,AE\n' > "$BAD"
body limit.csv "$BAD" dry
check "Vượt giới hạn gói: lỗi cả file" "$(imp "$HR" | py "d['fileErrors'][0].startswith('Vượt giới hạn gói')")" True
echo "Tất cả bước nhập nhân viên đều đạt."
