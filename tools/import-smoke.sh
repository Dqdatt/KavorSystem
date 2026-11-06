#!/usr/bin/env bash
# Nhập nhân viên hàng loạt từ CSV (docs/plans/employee-import.md): xem trước, chặn khi còn lỗi, ghi nguyên khối, nhập lại không trùng,
# phạm vi HR, giới hạn gói. Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HDG=10000000-0000-4000-8000-000000000001
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
body() { python3 -c "import json,sys; print(json.dumps({'fileName': sys.argv[1], 'csv': open(sys.argv[2], encoding='utf-8').read(), 'dryRun': sys.argv[3] == 'dry'}))" "$1" "$2" "$3" > "$TMPF"; }
TMPF=$(mktemp); trap 'rm -f "$TMPF" "$TMPF.apply" "$BAD"' EXIT
imp() { curl -s -X POST "$API/admin/employees/import" -H 'content-type: application/json' -H "authorization: Bearer $1" --data-binary @"$TMPF"; }
SAMPLE="$(dirname "$0")/../sample-data/employees_import_sample.csv"

HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"
BEFORE=$(sql "select count(*) from public.employees where tenant_id='$HDG'")

echo "— Xem trước"
body employees_import_sample.csv "$SAMPLE" dry
R=$(imp "$HR")
check "File mẫu: 3 dòng tạo mới, không lỗi, chưa ghi" "$(echo "$R" | py "([d['totals'][k] for k in ('rows','create','exists','error')], d['applied'], d['fileErrors'])")" "([3, 3, 0, 0], False, [])"
check "Xem trước không ghi gì" "$(sql "select count(*) from public.employees where tenant_id='$HDG'")" "$BEFORE"
check "Quản lý không nhập được (thiếu employee.create) → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/employees/import" -H 'content-type: application/json' -H "authorization: Bearer $MGR" --data-binary @"$TMPF")" 403

BAD=$(mktemp)
printf 'employee_code,full_name,work_email,hire_date,employment_type,department_code,position_code,manager_code\nHD0601,Võ Văn Một,mot.vo@haidang.vn,2026-11-01,Chính thức,MKT,AE,\nHD0602,Hai,thao.ha@haidang.vn,30/02/2026,Chính thức,KHONGCO,MKTM,\nHD0603,Lê Ba,ba.le@haidang.vn,01/11/2026,Chính thức,MKT,AE,HD0602\nHD0007,Trùng mã có sẵn,khac@haidang.vn,2026-11-01,Chính thức,MKT,AE,\n' > "$BAD"
body bad.csv "$BAD" dry
R=$(imp "$HR")
check "File lỗi: 2 tạo mới, 1 đã có, 1 lỗi" "$(echo "$R" | py "[d['totals'][k] for k in ('rows','create','exists','error')]")" "[4, 2, 1, 1]"
check "Chỉ chặn ngày không có thật; phòng ban/chức danh lạ = tạo mới; email đã dùng + quản lý ở dòng lỗi = cảnh báo" "$(echo "$R" | py "([(r['code'], r['errors']) for r in d['rows'] if r['action']=='error'], sorted(u['value'] for u in d['analysis']['departments'] if not u['existing']), [w for r in d['rows'] if r['code']=='HD0603' for w in r['warnings'] if 'Quản lý' in w])")" \
  "([('HD0602', ['Ngày vào làm \"30/02/2026\" không phải ngày có thật'])], ['KHONGCO'], ['Quản lý HD0602 ở dòng không nhập được — gán sau'])"
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

echo "— File tự do (.xlsx, tiêu đề tiếng Việt, không mã, phòng ban mới)"
BR=$(sql "select branch_id from public.departments where tenant_id='$HDG' and code='MKT'")
python3 - "$TMPF" "$BR" <<'PY'
import base64, io, json, sys, zipfile
rows = [["DANH SÁCH NHÂN SỰ"], [], ["STT", "HỌ VÀ TÊN", "PHÒNG/ BAN", "CHỨC VỤ", "NGÀY BẮT ĐẦU LÀM VIỆC", "SĐT", "E MAIL", "TRẠNG THÁI"],
        ["1", "Phan Văn Kho", "Kho vận", "Nhân viên kho", "15/03/2024", 912345678, "kho.phan@gmail.com", "Đang làm việc"],
        ["2", "Đào Thị Vận", "Kho vận", "Nhân viên kho", 45474, "", "", "Đang làm việc"],
        ["3", "Người Đã Nghỉ", "Kho vận", "Nhân viên kho", "01/01/2020", "", "", "Đã nghỉ việc"]]
esc = lambda v: str(v).replace("&", "&amp;").replace("<", "&lt;")
col = lambda i: chr(65 + i)
def cell(r, i, v):
    return f'<c r="{col(i)}{r}"><v>{v}</v></c>' if isinstance(v, int) else f'<c r="{col(i)}{r}" t="inlineStr"><is><t>{esc(v)}</t></is></c>'
sheet = "".join(f'<row r="{r+1}">' + "".join(cell(r + 1, i, v) for i, v in enumerate(row) if v != "") + "</row>" for r, row in enumerate(rows))
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("xl/workbook.xml", '<workbook xmlns:r="r"><sheets><sheet name="KHO" sheetId="1" r:id="rId1"/></sheets></workbook>')
    z.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
    z.writestr("xl/worksheets/sheet1.xml", f"<worksheet><sheetData>{sheet}</sheetData></worksheet>")
data = base64.b64encode(buf.getvalue()).decode()
open(sys.argv[1], "w").write(json.dumps({"fileName": "nhan-su.xlsx", "file": data, "dryRun": True, "options": {"branchId": sys.argv[2]}}))
open(sys.argv[1] + ".apply", "w").write(json.dumps({"fileName": "nhan-su.xlsx", "file": data, "dryRun": False, "options": {"branchId": sys.argv[2]}}))
PY
R=$(imp "$HR")
check "xlsx: nhận cột, 2 đang làm + 1 đã nghỉ (lưu tra cứu), không lỗi" "$(echo "$R" | py "([d['totals'][k] for k in ('create','createLeft','skip','error')], d['fileErrors'], sorted(c['field'] for c in d['analysis']['columns'] if c['field']))")" \
  "([3, 1, 0, 0], [], ['department', 'full_name', 'hire_date', 'phone', 'position', 'status', 'work_email'])"
check "Tự đặt mã, đề xuất tạo phòng ban/chức danh mới, sửa số 0 đầu SĐT" "$(echo "$R" | py "([r['code'] for r in d['rows'] if r['action']=='create'], [(u['value'], u['choice']) for u in d['analysis']['departments']], [u['value'] for u in d['analysis']['positions']])")" \
  "(['NV0001', 'NV0002', 'NV0003'], [('Kho vận', 'new:kho van')], ['Nhân viên kho'])"
mv "$TMPF.apply" "$TMPF"
R=$(imp "$HR")
check "Nhập xlsx: tạo 2 hồ sơ + phòng ban KV hiệu lực từ ngày vào làm sớm nhất" "$(echo "$R" | py "(d['applied'], d['totals']['create'])"):$(sql "select d.code || '|' || d.effective_from || '|' || count(*) from public.employees e join public.employee_assignments a on a.employee_id = e.id join public.departments d on d.id = a.department_id where e.tenant_id='$HDG' and e.employee_code in ('NV0001','NV0002') group by d.code, d.effective_from")" "(True, 3):KV|2020-01-01|2"
check "Điện thoại, ngày vào làm (số ngày Excel), không email vẫn nhập" "$(sql "select string_agg(employee_code || '|' || coalesce(phone,'-') || '|' || hire_date || '|' || coalesce(work_email::text,'-'), ',' order by employee_code) from public.employees where tenant_id='$HDG' and employee_code in ('NV0001','NV0002')")" "NV0001|0912345678|2024-03-15|kho.phan@gmail.com,NV0002|-|2024-07-01|-"
check "Người đã nghỉ: hồ sơ terminated, phân công đóng, không tính gói; chức danh mới có cấp suy từ tên" "$(sql "select e.status || '|' || (a.effective_to is not null) || '|' || p.management_tier from public.employees e join public.employee_assignments a on a.employee_id = e.id join public.positions p on p.id = a.position_id where e.tenant_id='$HDG' and e.full_name='Người Đã Nghỉ'")" "terminated|true|1"
check "Tự gán quản lý: phòng chưa có Trưởng nhóm/Quản lý → Ban Giám đốc duy nhất của công ty" "$(sql "select string_agg(e.employee_code || '>' || coalesce(m.employee_code,'-'), ',' order by e.employee_code) from public.employees e join public.employee_assignments a on a.employee_id = e.id left join public.employees m on m.id = a.manager_employee_id where e.tenant_id='$HDG' and e.employee_code in ('NV0001','NV0002','NV0003')")" "NV0001>HDG0001,NV0002>HDG0001,NV0003>-"
check "Nhớ cách khớp cho lần sau" "$(sql "select (columns->>'ho va ten') || '|' || (department_values->>'kho van') from public.employee_import_mappings where tenant_id='$HDG'")" "full_name|code:KV"
R=$(imp "$HR")
check "Nhập lại cùng file (không có mã): nhận ra theo họ tên, không tạo trùng" "$(echo "$R" | py "[d['totals'][k] for k in ('create','exists','skip')]"):$(sql "select count(*) from public.employees where tenant_id='$HDG' and full_name in ('Phan Văn Kho','Đào Thị Vận','Người Đã Nghỉ')")" "[0, 3, 0]:3"

echo "— Gửi lời mời hàng loạt"
IDS=$(sql "select json_agg(id order by employee_code) from public.employees where employee_code in ('HD0501','HD0502','HD0503','HD0007') and tenant_id='$HDG'")
R=$(call POST admin/employees/invite "$HR" "{\"employeeIds\":$IDS}")
check "Gửi 3 người mới nhập; người đã kích hoạt bị bỏ qua kèm lý do" "$(echo "$R" | py "(d['sent'], [(x['code'], x['reason']) for x in d['skipped']])")" "(3, [('HD0007', 'Nhân viên đã kích hoạt tài khoản.')])"
check "Email lời mời tới hộp thư" "$(curl -s "$MAIL/api/v1/search?query=to:trang.dang@haidang.vn" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('messages') or []))")" 1
check "Gửi lại ngay: bỏ qua cả 3 (chờ 1 phút)" "$(call POST admin/employees/invite "$HR" "{\"employeeIds\":$IDS}" | py "(d['sent'], len(d['skipped']))")" "(0, 4)"
check "Quản lý không gửi lời mời → 403" "$(status POST admin/employees/invite "$MGR" "{\"employeeIds\":$IDS}")" 403

echo "— Giới hạn gói"
sql "update public.tenants set employee_limit = (select count(*) from public.employees where tenant_id='$HDG' and status <> 'terminated') + 1 where id='$HDG'"
printf 'employee_code,full_name,work_email,hire_date,employment_type,department_code,position_code\nHD0701,Một Người,mot.nguoi@haidang.vn,2026-11-01,official,MKT,AE\nHD0702,Hai Người,hai.nguoi@haidang.vn,2026-11-01,official,MKT,AE\n' > "$BAD"
body limit.csv "$BAD" dry
check "Vượt giới hạn gói: lỗi cả file" "$(imp "$HR" | py "d['fileErrors'][0].startswith('Vượt giới hạn gói')")" True
echo "Tất cả bước nhập nhân viên đều đạt."
