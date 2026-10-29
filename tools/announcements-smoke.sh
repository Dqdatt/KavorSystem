#!/usr/bin/env bash
# Bản tin đầu-cuối qua API thật. SQL chỉ đọc hậu điều kiện và giả lập "tới giờ" cho bài hẹn (đổi publish_at rồi gọi hàm quét
# như chu kỳ 10 phút của API). Chạy trên DB vừa reset (seed có 11 bài: 8 toàn công ty, 1 riêng phòng Nhân sự, 1 hẹn giờ, 1 nháp).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
iso() { python3 -c "import datetime; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=int('$1'))).strftime('%Y-%m-%dT%H:%M:%SZ'))"; }
b64() { python3 -c "import base64,sys; sys.stdout.write(base64.b64encode(sys.stdin.buffer.read()).decode())"; }
MKT=40000000-0000-4000-8000-000000000005
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

EMP=$(activate HD0142 thao.ha@haidang.vn); need "Kích hoạt nhân viên Marketing" "$EMP"
HN=$(activate HDG0004 anh.pham@example.test); need "Kích hoạt nhân viên Hà Nội" "$HN"
HRA=$(activate HD0007 thao.mai@haidang.vn); need "Kích hoạt HR" "$HRA"
HR=$(mfa "$HRA"); need "HR bật MFA" "$HR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant B bật MFA" "$TB"

echo "— Dữ liệu mẫu và quyền"
B=$(call GET admin/announcements "$HR")
check "HR thấy 11 bài mẫu: 9 đang hiện, 1 hẹn, 1 nháp" "$(echo "$B" | py "sorted((s, sum(1 for i in d['items'] if i['status']==s)) for s in {i['status'] for i in d['items']})")" "[('draft', 1), ('published', 9), ('scheduled', 1)]"
check "Có danh sách chi nhánh/phòng ban để chọn" "$(echo "$B" | py "len([u for u in d['units'] if u['type']=='branch']) > 0 and len([u for u in d['units'] if u['type']=='department']) > 0")" True
check "Kế toán không có quyền đăng bài → 403" "$(status GET admin/announcements "$PAY")" 403
check "Tenant khác không thấy bài tenant A" "$(call GET admin/announcements "$TB" | py "len(d['items'])")" 0
check "Nhân viên Marketing thấy 8 bài toàn công ty" "$(call GET me/announcements "$EMP" | py "len(d['items'])")" 8
check "HR (phòng Nhân sự) thấy thêm bài riêng phòng mình" "$(call GET me/announcements "$HRA" | py "len(d['items'])")" 9
DRAFT=$(echo "$B" | py "[i['id'] for i in d['items'] if i['status']=='draft'][0]")
check "Nhân viên không mở được nháp → 404" "$(status GET "me/announcements/$DRAFT" "$EMP")" 404

echo "— Soạn bài riêng phòng Marketing, đính kèm PDF"
check "Thiếu tiêu đề → 400" "$(status POST admin/announcements "$HR" '{"category":"notice","audience":"tenant"}')" 400
check "Chọn đơn vị nhưng không có đơn vị → 400" "$(status POST admin/announcements "$HR" '{"category":"notice","title":"x","audience":"units","units":[]}')" 400
BX_DEPT=$(sql "select d.id from public.departments d join public.tenants t on t.id=d.tenant_id where t.code='MAUB-001' limit 1")
_s1=$(status POST admin/announcements "$HR" "{\"category\":\"notice\",\"title\":\"x\",\"audience\":\"units\",\"units\":[{\"type\":\"department\",\"id\":\"$BX_DEPT\"}]}") || :
check "Phòng ban của tenant khác → 400" "$_s1" 400
check "Kế toán không tạo được bài → 403" "$(status POST admin/announcements "$PAY" '{"category":"notice","title":"x","audience":"tenant"}')" 403
BODY='{"category":"policy","title":"Quy định mới cho Marketing","body":"Áp dụng từ tuần sau.\n\n- Ý một\n- Ý hai","authorLabel":"Phòng Nhân sự","important":true,"pinned":false,"notify":true,"audience":"units","units":[{"type":"department","id":"'$MKT'"}]}'
R=$(call POST admin/announcements "$HR" "$BODY"); ID=$(echo "$R" | field data.id)
check "Tạo bài nháp cho phòng Marketing (2 người nhận)" "$(echo "$R" | py "(d['status'], d['recipients'], d['units'][0]['name'])")" "('draft', 2, 'Marketing')"
PDF=$(printf '%%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%%%EOF\n' | b64)
_s1=$(call POST "admin/announcements/$ID/attachment" "$HR" "{\"fileName\":\"Quy-dinh.pdf\",\"dataBase64\":\"$PDF\"}" | py "(d['attachment']['type'], d['attachment']['name'])") || :
check "Đính kèm PDF" "$_s1" "('application/pdf', 'Quy-dinh.pdf')"
SVG=$(printf '<svg onload=alert(1)></svg>' | b64)
_s1=$(status POST "admin/announcements/$ID/attachment" "$HR" "{\"fileName\":\"x.pdf\",\"dataBase64\":\"$SVG\"}") || :
check "File SVG bị chặn → 400" "$_s1" 400
BIG=$(mktemp); python3 -c "import base64,json,sys; json.dump({'fileName':'big.pdf','dataBase64':base64.b64encode(b'%PDF-'+bytes(5_300_000)).decode()}, open(sys.argv[1],'w'))" "$BIG"
check "File quá 5 MB → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/announcements/$ID/attachment" -H 'content-type: application/json' -H "authorization: Bearer $HR" --data-binary "@$BIG")" 400
rm -f "$BIG"
check "HR tải lại file đính kèm" "$(curl -s "$API/admin/announcements/$ID/attachment" -H "authorization: Bearer $HR" | head -c 5)" "%PDF-"

echo "— Xuất bản ngay + thông báo"
check "Xuất bản" "$(call POST "admin/announcements/$ID/publish" "$HR" '{}' | py "(d['status'], d['notifiedAt'] is not None)")" "('published', True)"
check "Xuất bản lại → 409" "$(status POST "admin/announcements/$ID/publish" "$HR" '{}')" 409
check "Thông báo đúng 2 người nhận, không chép nội dung" "$(sql "select count(*) || '/' || count(*) filter (where body like '%Ý một%') from public.notifications where link_type='announcement' and link_id='$ID'")" "2/0"
check "Nhân viên nhận thông báo có link bài" "$(call GET me/notifications "$EMP" | py "[(i['kind'], i['link']['type']) for i in d['items'] if i['link'] and i['link']['id']=='$ID']")" "[('announcement.published', 'announcement')]"
check "Mở bài = đã đọc" "$(call GET "me/announcements/$ID" "$EMP" | py "(d['title'], d['readAt'] is not None, d['attachment']['name'])")" "('Quy định mới cho Marketing', True, 'Quy-dinh.pdf')"
check "Mở lại không ghi thêm lượt đọc" "$(call GET "me/announcements/$ID" "$EMP" >/dev/null; sql "select count(*) from public.announcement_reads where announcement_id='$ID'")" 1
check "Nhân viên Hà Nội không mở được bài Marketing → 404" "$(status GET "me/announcements/$ID" "$HN")" 404
check "Thống kê đã đọc 1/2, người chưa đọc đứng đầu" "$(call GET "admin/announcements/$ID" "$HR" | py "(d['item']['reads'], d['item']['recipients'], [r['code'] for r in d['readers']])")" "(1, 2, ['HDG0003', 'HD0142'])"

echo "— Tải file từ app qua liên kết ký"
P=$(call POST "me/announcements/$ID/file-link" "$EMP" | field data.path); need "Nhận liên kết tải" "$P"
check "Mở liên kết không cần header, đúng PDF" "$(curl -s -D - -o /dev/null "$API/$P" | grep -i '^content-type' | tr -d '\r')/$(curl -s "$API/$P" | head -c 5)" "content-type: application/pdf/%PDF-"
check "Sửa chữ ký → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/${P%sig=*}sig=AAAA")" 404
check "Nhân viên ngoài người nhận không lấy được liên kết → 404" "$(status POST "me/announcements/$ID/file-link" "$HN")" 404

echo "— Sửa, gỡ, xóa"
check "Sửa bài đã xuất bản được" "$(call PATCH "admin/announcements/$ID" "$HR" "${BODY/Quy định mới cho Marketing/Quy định mới cho Marketing (cập nhật)}" | py "(d['title'], d['status'])")" "('Quy định mới cho Marketing (cập nhật)', 'published')"
check "Không xóa bài đã xuất bản → 409" "$(status POST "admin/announcements/$ID/remove" "$HR" '{}')" 409
check "Tenant khác không gỡ được → 404" "$(status POST "admin/announcements/$ID/archive" "$TB" '{}')" 404
check "Gỡ bài" "$(call POST "admin/announcements/$ID/archive" "$HR" '{}' | field data.status)" archived
check "Bài đã gỡ không còn với nhân viên → 404" "$(status GET "me/announcements/$ID" "$EMP")" 404
check "Liên kết cũ cũng hết dùng được → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/$P")" 404
check "Bài đã gỡ không sửa được → 409" "$(status PATCH "admin/announcements/$ID" "$HR" "$BODY")" 409

echo "— Hẹn giờ"
S=$(call POST admin/announcements "$HR" '{"category":"event","title":"Hẹn giờ toàn công ty","body":"Nội dung","notify":true,"audience":"tenant"}' | field data.id)
check "Giờ hẹn trong quá khứ → 400" "$(status POST "admin/announcements/$S/publish" "$HR" "{\"publishAt\":\"$(iso -120)\"}")" 400
check "Hẹn ngày mai" "$(call POST "admin/announcements/$S/publish" "$HR" "{\"publishAt\":\"$(iso 1440)\"}" | py "(d['status'], d['notifiedAt'])")" "('scheduled', None)"
check "Bài hẹn chưa hiện với nhân viên" "$(status GET "me/announcements/$S" "$EMP")" 404
check "Hủy hẹn về nháp" "$(call POST "admin/announcements/$S/unschedule" "$HR" '{}' | field data.status)" draft
call POST "admin/announcements/$S/publish" "$HR" "{\"publishAt\":\"$(iso 30)\"}" >/dev/null
sql "update public.announcements set publish_at = now() - interval '1 minute' where id = '$S'" >/dev/null
# Hai câu lệnh: câu thứ hai mới thấy thông báo vừa tạo (cùng một câu lệnh dùng chung snapshot)
check "Tới giờ: chu kỳ quét gửi thông báo cho cả công ty" "$(sql "select public.notify_due_announcements()")/$(sql "select (select count(*) from public.notifications where link_id='$S') || '/' || (select count(*) from public.announcement_recipients('$S'))")" "1/9/9"
check "Bài đã tới giờ hiện với nhân viên" "$(status GET "me/announcements/$S" "$HN")" 200

echo "— Nháp xóa được, audit"
check "Xóa nháp" "$(call POST "admin/announcements/$DRAFT/remove" "$HR" '{}' | field data.id)" "$DRAFT"
check "Nháp đã xóa → 404" "$(status GET "admin/announcements/$DRAFT" "$HR")" 404
check "Audit đủ thao tác" "$(sql "select count(distinct action) from public.audit_logs where action in ('announcement.created','announcement.updated','announcement.published','announcement.unscheduled','announcement.archived','announcement.deleted','announcement.attachment_updated')")" 7
check "Audit không chép nội dung/tiêu đề bài" "$(sql "select count(*) from public.audit_logs where action like 'announcement.%' and (coalesce(before_data::text,'') || coalesce(after_data::text,'')) ~ '(Ý một|Marketing|Hẹn giờ toàn|Quy-dinh)'")" 0
echo "Tất cả bước bản tin đều đạt."
