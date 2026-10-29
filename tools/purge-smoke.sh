#!/usr/bin/env bash
# Kavor Console — xóa vĩnh viễn doanh nghiệp: chỉ Quản trị Console, chỉ khi tạm khóa/đã đóng, gõ lại mã; xóa dữ liệu, tài khoản đăng nhập, file.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
pw() { python3 -c "import secrets; print('Kv' + secrets.token_urlsafe(12) + '9')"; }
clogin() { local b="{\"email\":\"$1\",\"password\":\"$2\"}"; call POST console/auth/login "" "$b" | field data.session.accessToken; }
URL=${SUPABASE_URL:-http://127.0.0.1:55321}
SRK=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
rows() { sql "select sum(n) from (select (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I where tenant_id=''$1''', table_name), false, true, '')))[1]::text::int n from information_schema.columns where table_schema='public' and column_name='tenant_id' and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')) x"; }
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

PA=$(pw); PO=$(pw)
OPERATOR_PASSWORD=$PA bash "$(dirname "$0")/create-operator.sh" purge.admin@kavor.test "Quản Trị Xóa" platform_admin >/dev/null
OPERATOR_PASSWORD=$PO bash "$(dirname "$0")/create-operator.sh" purge.ops@kavor.test "Vận Hành Xóa" >/dev/null
ADM=$(mfa "$(clogin purge.admin@kavor.test "$PA")" console); need "Quản trị Console đăng nhập + MFA" "$ADM"
OPS=$(mfa "$(clogin purge.ops@kavor.test "$PO")" console); need "Vận hành nền tảng đăng nhập + MFA" "$OPS"

echo "— Tạo doanh nghiệp thử có dữ liệu, tài khoản, file"
_s1=$(call POST console/tenants "$ADM" '{"code":"XOA-001","name":"Công ty Xóa Thử","plan":"trial","employeeLimit":20,"adminName":"Lê Xóa","adminEmail":"le.xoa@xoa.test","adminCode":"QT01"}') || :
TID=$(echo "$_s1" | field data.tenant.id); need "Tạo doanh nghiệp XOA-001 (mã quản trị viên QT01)" "$TID"
check "Mã nhân viên quản trị viên đúng như chọn" "$(sql "select employee_code from public.employees where tenant_id='$TID'")" QT01
HRT=$(activate QT01 le.xoa@xoa.test); need "Quản trị viên công ty kích hoạt (có tài khoản đăng nhập)" "$HRT"
UID_X=$(sql "select user_id from public.employees where tenant_id='$TID'")
printf 'kavor-purge-test' > /tmp/kavor-purge.txt
check "Có file trong thư mục doanh nghiệp trên Storage" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/tenant-branding/$TID/thu/logo.png" -H "apikey: $SRK" -H "authorization: Bearer $SRK" -H 'content-type: image/png' --data-binary @/tmp/kavor-purge.txt)" 200
rm -f /tmp/kavor-purge.txt
HDG=$(sql "select id from public.tenants where code='HDG-001'"); HDG_ROWS=$(rows "$HDG")
need "Doanh nghiệp có dữ liệu (dòng)" "$(rows "$TID" | grep -v '^0$' || true)"

echo "— Chặn xóa sai"
check "Đang hoạt động → 409" "$(call POST "console/tenants/$TID/delete" "$ADM" '{"confirmCode":"XOA-001","reason":"Thử xóa khi đang hoạt động"}' | field error.code)" CONFLICT
call POST "console/tenants/$TID/status" "$ADM" '{"action":"suspend","reason":"Chuẩn bị xóa thử"}' >/dev/null
check "Vận hành nền tảng (không phải quản trị) → 403" "$(status POST "console/tenants/$TID/delete" "$OPS" '{"confirmCode":"XOA-001","reason":"Thử quyền xóa doanh nghiệp"}')" 403
check "Gõ sai mã → 400" "$(status POST "console/tenants/$TID/delete" "$ADM" '{"confirmCode":"XOA-002","reason":"Thử gõ sai mã doanh nghiệp"}')" 400
check "Thiếu lý do → 400" "$(status POST "console/tenants/$TID/delete" "$ADM" '{"confirmCode":"XOA-001"}')" 400

echo "— Xóa vĩnh viễn"
_s2=$(call POST "console/tenants/$TID/delete" "$ADM" '{"confirmCode":"xoa-001","reason":"Doanh nghiệp tạo để thử nghiệm"}') || :
check "Xóa xong: báo số tài khoản, file, không cảnh báo" "$(echo "$_s2" | py "(d['code'], d['accounts'], d['files'], d['warnings'], d['rows'] > 10)")" "('XOA-001', 1, 1, [], True)"
check "Không còn dòng dữ liệu nào của doanh nghiệp" "$(rows "$TID")" 0
check "Dòng doanh nghiệp đã xóa" "$(sql "select count(*) from public.tenants where id='$TID'")" 0
check "Tài khoản đăng nhập đã xóa khỏi Auth" "$(sql "select count(*) from auth.users where id='$UID_X'")" 0
check "File trên Storage đã xóa" "$(sql "select count(*) from storage.objects where name like '$TID/%'")" 0
check "Doanh nghiệp khác giữ nguyên" "$(rows "$HDG")" "$HDG_ROWS"
check "Danh sách doanh nghiệp không còn XOA-001" "$(call GET console/tenants "$ADM" | py "[t['code'] for t in d if t['code']=='XOA-001']")" "[]"
check "Nhật ký Kavor giữ một dòng tenant.deleted có lý do" "$(sql "select count(*) from public.audit_logs where action='tenant.deleted' and resource_id='$TID' and reason='Doanh nghiệp tạo để thử nghiệm'")" 1
check "Xem lại doanh nghiệp đã xóa → 404" "$(status GET "console/tenants/$TID" "$ADM")" 404
echo "purge-smoke: đạt"
