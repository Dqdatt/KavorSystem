#!/usr/bin/env bash
# Tài liệu nhân sự đầu-cuối qua API thật. SQL chỉ tạo fixture quyền (HR phạm vi phòng Marketing) và đọc hậu điều kiện.
# Chạy trên DB vừa reset (seed chưa có tài liệu nào).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
b64() { python3 -c "import base64,sys; sys.stdout.write(base64.b64encode(sys.stdin.buffer.read()).decode())"; }
day() { python3 -c "import datetime,zoneinfo; print((datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Ho_Chi_Minh'))+datetime.timedelta(days=int('$1'))).date())"; }
TENANT=10000000-0000-4000-8000-000000000001
HA=60000000-0000-4000-8000-000000000142
MKT=40000000-0000-4000-8000-000000000005
ANH=$(sql "select id from public.employees where employee_code='HDG0004'")
BX=$(sql "select id from public.employees where employee_code='BX0001'")
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

EMP=$(activate HD0142 thao.ha@haidang.vn); need "Kích hoạt nhân viên Marketing" "$EMP"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR bật MFA" "$HR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant B bật MFA" "$TB"
# Fixture quyền: vai trò riêng chỉ có quyền tài liệu, phạm vi phòng Marketing, gán cho quản lý HDG0003
# (không dùng hr_ops để test RLS khác chạy sau vẫn thấy quản lý không có quyền HR)
sql "insert into public.roles (tenant_id, code, name) values ('$TENANT','documents_smoke_scoped','Tài liệu smoke phạm vi');
insert into public.role_permissions (role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p
where r.tenant_id='$TENANT' and r.code='documents_smoke_scoped' and p.code in ('document.read','document.upload','document.manage');
insert into public.role_assignments (tenant_id,membership_id,role_id,scope_type,scope_id,effective_from)
select m.tenant_id,m.id,r.id,'department','$MKT',public.tenant_today(m.tenant_id) from public.memberships m join public.employees e on e.id=m.employee_id
join public.roles r on r.code='documents_smoke_scoped' and r.tenant_id='$TENANT' where e.employee_code='HDG0003';" >/dev/null

echo "— Bảng tài liệu và quyền"
check "Kế toán không có quyền tài liệu → 403" "$(status GET admin/documents "$PAY")" 403
B=$(call GET admin/documents "$HR")
check "Chưa có tài liệu; 9 nhân viên chưa có hợp đồng" "$(echo "$B" | py "(len(d['items']), d['metrics']['missingContract'], d['canUpload'], d['canManage'])")" "(0, 9, True, True)"

echo "— Tải lên"
printf '%%PDF-1.4\n%% HDLD ban 1\n%%%%EOF\n' > /tmp/doc-smoke-v1.pdf
printf '%%PDF-1.4\n%% HDLD ban 2 da ky\n%%%%EOF\n' > /tmp/doc-smoke-v2.pdf
V1=$(b64 < /tmp/doc-smoke-v1.pdf); V2=$(b64 < /tmp/doc-smoke-v2.pdf)
SHA1=$(python3 -c "import hashlib; print(hashlib.sha256(open('/tmp/doc-smoke-v1.pdf','rb').read()).hexdigest())")
PNG=$(python3 -c "import base64; print(base64.b64encode(bytes([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])+b'\0'*32).decode())")
SOON=$(day 20); PAST=$(day -400)
R=$(call POST admin/documents "$HR" "{\"employeeId\":\"$HA\",\"category\":\"contract\",\"title\":\"Hợp đồng lao động 2026\",\"docNo\":\"HĐLĐ-0142/2026\",\"issuedOn\":\"$PAST\",\"expiresOn\":\"$SOON\",\"visibility\":\"hr_employee\",\"fileName\":\"HDLD-HD0142.pdf\",\"dataBase64\":\"$V1\",\"note\":\"Bản scan\"}")
DOC=$(echo "$R" | field data.item.id); need "Tạo hợp đồng cho HD0142" "$DOC"
check "Phiên bản 1, đúng SHA-256, sắp hết hạn" "$(echo "$R" | py "(d['item']['current']['versionNo'], d['item']['current']['sha256']=='$SHA1', d['item']['expiry'], d['item']['current']['scanStatus'])")" "(1, True, 'soon', 'not_scanned')"
CCCD=$(call POST admin/documents "$HR" "{\"employeeId\":\"$HA\",\"category\":\"personal\",\"title\":\"CCCD\",\"visibility\":\"hr_only\",\"fileName\":\"CCCD.png\",\"dataBase64\":\"$PNG\"}" | field data.item.id); need "Tạo CCCD chỉ HR xem" "$CCCD"
SVG=$(printf '<svg onload=alert(1)></svg>' | b64)
check "File SVG → 400" "$(status POST admin/documents "$HR" "{\"employeeId\":\"$HA\",\"category\":\"other\",\"title\":\"x\",\"visibility\":\"hr_only\",\"fileName\":\"x.pdf\",\"dataBase64\":\"$SVG\"}")" 400
check "Hết hạn trước ngày hiệu lực → 400" "$(status POST admin/documents "$HR" "{\"employeeId\":\"$HA\",\"category\":\"other\",\"title\":\"x\",\"visibility\":\"hr_only\",\"issuedOn\":\"$SOON\",\"expiresOn\":\"$PAST\",\"fileName\":\"x.pdf\",\"dataBase64\":\"$V1\"}")" 400
check "Nhân viên tenant khác → 404" "$(status POST admin/documents "$HR" "{\"employeeId\":\"$BX\",\"category\":\"other\",\"title\":\"x\",\"visibility\":\"hr_only\",\"fileName\":\"x.pdf\",\"dataBase64\":\"$V1\"}")" 404
check "Kế toán không tải lên được → 403" "$(status POST admin/documents "$PAY" "{\"employeeId\":\"$HA\",\"category\":\"other\",\"title\":\"x\",\"visibility\":\"hr_only\",\"fileName\":\"x.pdf\",\"dataBase64\":\"$V1\"}")" 403
OTHER=$(call POST admin/documents "$HR" "{\"employeeId\":\"$ANH\",\"category\":\"decision\",\"title\":\"Quyết định điều chuyển\",\"visibility\":\"hr_employee\",\"fileName\":\"QD.pdf\",\"dataBase64\":\"$V1\"}" | field data.item.id); need "Tạo quyết định cho HDG0004" "$OTHER"
check "Chỉ số: 3 tài liệu, 1 sắp hết hạn, 8 người chưa có hợp đồng" "$(call GET admin/documents "$HR" | py "(d['metrics']['total'], d['metrics']['expiringSoon'], d['metrics']['missingContract'])")" "(3, 1, 8)"

echo "— Nhân viên xem tài liệu của mình"
check "Chỉ thấy hợp đồng (CCCD là Chỉ HR)" "$(call GET me/documents "$EMP" | py "[(i['title'], i['versionNo'], i['expiry']) for i in d['items']]")" "[('Hợp đồng lao động 2026', 1, 'soon')]"
check "Hồ sơ trên app: phòng ban, quản lý, hợp đồng HR chia sẻ" "$(call GET me/profile "$EMP" | py "(d['employeeCode'], d['department'], d['manager'], d['contract']['title'], d['contract']['expiresOn']=='$SOON')")" "('HD0142', 'Marketing', 'Lê Quang Huy', 'Hợp đồng lao động 2026', True)"
check "Không lấy được liên kết CCCD → 404" "$(status POST "me/documents/$CCCD/file-link" "$EMP")" 404
check "Không lấy được tài liệu người khác → 404" "$(status POST "me/documents/$OTHER/file-link" "$EMP")" 404
P=$(call POST "me/documents/$DOC/file-link" "$EMP" | field data.path); need "Nhận liên kết tải hợp đồng" "$P"
check "Mở liên kết không cần header, đúng bản 1" "$(curl -s "$API/$P" | sha256sum | cut -c1-64)" "$SHA1"
check "Sửa chữ ký → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/${P%sig=*}sig=AAAA")" 404

echo "— Phiên bản mới"
check "Thêm bản 2" "$(call POST "admin/documents/$DOC/versions" "$HR" "{\"fileName\":\"HDLD-HD0142-da-ky.pdf\",\"dataBase64\":\"$V2\",\"note\":\"Bản đã ký\"}" | py "(d['item']['current']['versionNo'], len(d['versions']))")" "(2, 2)"
V1ID=$(call GET "admin/documents/$DOC" "$HR" | py "[v['id'] for v in d['versions'] if v['versionNo']==1][0]")
check "HR vẫn tải được bản 1" "$(curl -s "$API/admin/documents/$DOC/file?version=$V1ID" -H "authorization: Bearer $HR" | sha256sum | cut -c1-64)" "$SHA1"
check "Nhân viên mở liên kết nhận bản mới nhất" "$(curl -s "$API/$P" | head -c 40 | grep -c 'da ky')" 1

echo "— Phạm vi HR theo phòng"
check "HR phòng Marketing chỉ thấy tài liệu Marketing" "$(call GET admin/documents "$MGR" | py "sorted(i['employee']['code'] for i in d['items'])")" "['HD0142', 'HD0142']"
check "Không mở tài liệu ngoài phòng → 404" "$(status GET "admin/documents/$OTHER" "$MGR")" 404
check "Không tải lên cho người ngoài phòng → 404" "$(status POST admin/documents "$MGR" "{\"employeeId\":\"$ANH\",\"category\":\"other\",\"title\":\"x\",\"visibility\":\"hr_only\",\"fileName\":\"x.pdf\",\"dataBase64\":\"$V1\"}")" 404
check "Tenant khác không mở được → 404" "$(status GET "admin/documents/$DOC" "$TB")" 404

echo "— Sửa thông tin, đổi quyền xem, gỡ"
check "Đổi sang Chỉ HR" "$(call PATCH "admin/documents/$DOC" "$HR" "{\"category\":\"contract\",\"title\":\"Hợp đồng lao động 2026\",\"docNo\":\"HĐLĐ-0142/2026\",\"issuedOn\":\"$PAST\",\"expiresOn\":\"$SOON\",\"visibility\":\"hr_only\"}" | py "d['item']['visibility']")" hr_only
check "Liên kết cũ hết dùng được khi đổi sang Chỉ HR → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/$P")" 404
check "Nhân viên không còn thấy" "$(call GET me/documents "$EMP" | py "len(d['items'])")" 0
check "Hồ sơ trên app không còn hiện hợp đồng Chỉ HR" "$(call GET me/profile "$EMP" | py "d['contract']")" None
check "Gỡ thiếu lý do → 400" "$(status POST "admin/documents/$CCCD/archive" "$HR" '{"reason":""}')" 400
check "Gỡ CCCD" "$(call POST "admin/documents/$CCCD/archive" "$HR" '{"reason":"Nhân viên cập nhật CCCD mới"}' | py "(d['item']['archivedAt'] is not None, d['canUpload'], d['canManage'])")" "(True, False, False)"
check "Đã gỡ không thêm phiên bản → 409" "$(status POST "admin/documents/$CCCD/versions" "$HR" "{\"fileName\":\"x.png\",\"dataBase64\":\"$PNG\"}")" 409
check "Đã gỡ không sửa → 409" "$(status PATCH "admin/documents/$CCCD" "$HR" '{"category":"personal","title":"x","visibility":"hr_only"}')" 409

echo "— Audit"
check "Ghi tải xuống của HR và nhân viên" "$(sql "select count(*) filter (where after_data->>'by'='hr') > 0 and count(*) filter (where after_data->>'by'='self') > 0 from public.audit_logs where action='document.downloaded'")" t
check "Lượt tải tuần này trên bảng" "$(call GET admin/documents "$HR" | py "d['metrics']['downloadsWeek'] >= 3")" True
check "Audit đủ thao tác" "$(sql "select count(distinct action) from public.audit_logs where action in ('document.created','document.version_added','document.updated','document.archived','document.downloaded','documents.viewed')")" 6
check "Audit không chép tiêu đề, tên file, lý do gỡ" "$(sql "select count(*) from public.audit_logs where action like 'document%' and (coalesce(before_data::text,'') || coalesce(after_data::text,'')) ~ '(HDLD|CCCD|Hợp đồng lao động|cập nhật CCCD)'")" 0
rm -f /tmp/doc-smoke-v1.pdf /tmp/doc-smoke-v2.pdf
echo "Tất cả bước tài liệu đều đạt."
