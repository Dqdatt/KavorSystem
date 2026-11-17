#!/usr/bin/env bash
# Đề nghị sửa hồ sơ đầu-cuối qua API thật: nhân viên gửi → HR duyệt → hồ sơ cập nhật → HR/Kế toán chỉ thấy 4 số cuối, "Hiện số" có nhật ký.
# SQL chỉ đọc hậu điều kiện. Chạy trên DB vừa reset.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HA=60000000-0000-4000-8000-000000000142
ACC=190123456789
SUPABASE_URL=${SUPABASE_URL:-http://127.0.0.1:55321}
ANON=$(cd "$(dirname "$0")/.." && supabase status -o env 2>/dev/null | grep -E '^ANON_KEY=' | cut -d= -f2- | tr -d '"'); need "Khóa publishable Supabase local" "$ANON"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

EMP=$(activate HD0142 thao.ha@haidang.vn); need "Kích hoạt nhân viên" "$EMP"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý trực tiếp bật MFA" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR bật MFA" "$HR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant B bật MFA" "$TB"

echo "— Gửi đề nghị"
P=$(call GET me/profile "$EMP")
OLDPHONE=$(echo "$P" | field data.phone)
check "Hồ sơ ban đầu chưa có thông tin cá nhân, không có đề nghị chờ" "$(echo "$P" | py "(d['personal']['address'], d['personal']['bank'], d['pending'])")" "(None, None, None)"
check "Điện thoại sai → 400" "$(status POST me/requests/profile "$EMP" '{"phone":"abc"}')" 400
check "Số tài khoản có chữ → 400" "$(status POST me/requests/profile "$EMP" '{"bank":{"bankName":"VCB","accountNo":"12ab5678","holder":"A"}}')" 400
check "Liên hệ khẩn cấp thiếu quan hệ → 400" "$(status POST me/requests/profile "$EMP" '{"emergency":{"name":"Bình","phone":"0909123456","relation":""}}')" 400
check "Không có gì thay đổi → 400" "$(status POST me/requests/profile "$EMP" "{\"phone\":\"$OLDPHONE\"}")" 400
B="{\"phone\":\"0911 222 333\",\"personalEmail\":\"Ha.Tran@Gmail.com\",\"address\":\"12 Trần Quang Khải, Tân Định, TP.HCM\",\"emergency\":{\"name\":\"Trần Văn Bình\",\"phone\":\"0909123456\",\"relation\":\"Bố\"},\"bank\":{\"bankName\":\"Techcombank\",\"accountNo\":\"1901 2345 6789\",\"holder\":\"Tran Thu Ha\"},\"reason\":\"Đổi số điện thoại và tài khoản nhận lương\"}"
R=$(call POST me/requests/profile "$EMP" "$B")
ID=$(echo "$R" | field data.id); NO=$(echo "$R" | field data.no); need "Gửi đề nghị $NO" "$ID"
check "Đơn HS, đủ 5 trường, một bước HR" "$(echo "$R" | py "(d['no'][:3], d['type'], d['payload']['fields'], [s['resolver'] for s in d['steps']])")" "('HS-', 'profile_change', ['phone', 'personalEmail', 'address', 'emergency', 'bank'], ['hr'])"
check "Chuẩn hóa: điện thoại liền số, email thường, chủ tài khoản in hoa; người gửi thấy số đầy đủ" "$(echo "$R" | py "(d['payload']['after']['phone'], d['payload']['after']['personalEmail'], d['payload']['after']['bank']['holder'], d['payload']['after']['bank']['accountNo'])")" "('0911222333', 'ha.tran@gmail.com', 'TRAN THU HA', '$ACC')"
check "Nội dung đơn trong DB không có số tài khoản đầy đủ" "$(sql "select count(*) from public.request_versions where request_id='$ID' and payload::text like '%$ACC%'")" 0
check "Gửi đề nghị thứ hai khi đang chờ → 409" "$(status POST me/requests/profile "$EMP" '{"address":"Khác"}')" 409
check "Hồ sơ báo đề nghị đang chờ, thông tin cũ còn hiệu lực" "$(call GET me/profile "$EMP" | py "(d['pending']['no'], d['phone'])")" "('$NO', '$OLDPHONE')"
check "HR nhận thông báo cần duyệt" "$(sql "select count(*) > 0 from public.notifications n join public.employees e on e.id = n.recipient_employee_id where e.employee_code='HD0007' and n.link_id='$ID' and n.kind='approval.pending'")" t

echo "— Ai thấy gì"
check "Quản lý xem được đơn nhưng chỉ thấy 4 số cuối" "$(call GET "admin/requests/$ID" "$MGR" | py "(d['payload']['after']['bank']['last4'], 'accountNo' in d['payload']['after']['bank'], d['myTaskId'])")" "('6789', False, None)"
H=$(call GET "admin/requests/$ID" "$HR")
TASK=$(echo "$H" | field data.myTaskId); need "HR có bước duyệt" "$TASK"
check "HR thấy 4 số cuối, được bấm Hiện số" "$(echo "$H" | py "(d['payload']['after']['bank']['last4'], 'accountNo' in d['payload']['after']['bank'], d['payload']['after']['bank'].get('revealable'))")" "('6789', False, True)"
check "HR Hiện số trong đơn để đối chiếu" "$(call POST "admin/requests/$ID/bank-account/reveal" "$HR" '{}' | py "d['accountNo']")" "$ACC"
check "Quản lý/tenant khác không Hiện số được trong đơn → 403/404" "$(status POST "admin/requests/$ID/bank-account/reveal" "$MGR" '{}' | grep -cE '^(403|404)$') $(status POST "admin/requests/$ID/bank-account/reveal" "$TB" '{}')" "1 404"
check "Tenant khác không xem được → 404" "$(status GET "admin/requests/$ID" "$TB")" 404
check "Quản lý không duyệt thay HR → 403/404" "$(status POST "admin/approvals/$TASK/approve" "$MGR" '{}' | grep -cE '^(403|404)$')" 1

echo "— HR duyệt, hồ sơ cập nhật"
check "HR duyệt" "$(call POST "admin/approvals/$TASK/approve" "$HR" '{"comment":"Đã đối chiếu"}' | py "d['status']")" approved
P=$(call GET me/profile "$EMP")
check "Hồ sơ app: điện thoại, email, địa chỉ, liên hệ, tài khoản mới; hết đề nghị chờ" "$(echo "$P" | py "(d['phone'], d['personal']['personalEmail'], d['personal']['emergency']['relation'], d['personal']['bank']['accountNo'], d['pending'])")" "('0911222333', 'ha.tran@gmail.com', 'Bố', '$ACC', None)"
check "Nhân viên nhận thông báo đã duyệt" "$(sql "select count(*) from public.notifications n where n.recipient_employee_id='$HA' and n.link_id='$ID' and n.kind='request.approved'")" 1
check "HR xem hồ sơ nhân viên: thông tin cá nhân + 4 số cuối, được Hiện số" "$(call GET "admin/employees/$HA" "$HR" | py "(d['personal']['address'], d['personal']['bank']['last4'], 'accountNo' in d['personal']['bank'], d['personal']['bank'].get('revealable'))")" "('12 Trần Quang Khải, Tân Định, TP.HCM', '6789', False, True)"
check "HR Hiện số ở hồ sơ" "$(call POST "admin/employees/$HA/bank-account/reveal" "$HR" '{}' | py "d['accountNo']")" "$ACC"
check "Quản lý không Hiện số ở hồ sơ → 403/404" "$(status POST "admin/employees/$HA/bank-account/reveal" "$MGR" '{}' | grep -cE '^(403|404)$')" 1
check "Kế toán thấy tài khoản đã duyệt ở Mức lương (4 số cuối, được Hiện số)" "$(call GET admin/compensations "$PAY" | py "[(r['bank']['bankName'], 'accountNo' in r['bank'], r['bank'].get('revealable')) for r in d['rows'] if r['employee']['code']=='HD0142'][0]")" "('Techcombank', False, True)"
check "Kế toán Hiện số ở Mức lương" "$(call POST "admin/employees/$HA/bank-account/reveal" "$PAY" '{}' | py "d['accountNo']")" "$ACC"
check "Bảng lương đầu vào không trả số đầy đủ; file xuất có số đầy đủ để chuyển khoản" "$(call GET admin/payroll/inputs "$PAY" | grep -c "$ACC" || :) $(curl -s "$API/admin/payroll/inputs/export" -H "authorization: Bearer $PAY" | grep -c "$ACC" || :)" "0 1"
_bank=$(curl -s "$SUPABASE_URL/rest/v1/employee_bank_accounts?select=account_no" -H "apikey: $ANON" -H "authorization: Bearer $PAY" | field code)
check "Trình duyệt (token Kế toán) không đọc thẳng được bảng ngân hàng qua PostgREST" "$_bank" "42501"

echo "— Đề nghị khác: chỉ đổi địa chỉ, hủy và từ chối"
R2=$(call POST me/requests/profile "$EMP" '{"address":"Quận 1, TP.HCM"}'); ID2=$(echo "$R2" | field data.id)
check "Đơn chỉ đổi địa chỉ, lưu giá trị cũ để so sánh" "$(echo "$R2" | py "(d['payload']['fields'], d['payload']['before']['address'])")" "(['address'], '12 Trần Quang Khải, Tân Định, TP.HCM')"
check "Người gửi hủy đơn" "$(call POST "me/requests/$ID2/cancel" "$EMP" '{}' | py "d['status']")" cancelled
R3=$(call POST me/requests/profile "$EMP" '{"address":"Quận 7"}'); ID3=$(echo "$R3" | field data.id)
T3=$(call GET "admin/requests/$ID3" "$HR" | field data.myTaskId)
check "HR từ chối" "$(call POST "admin/approvals/$T3/reject" "$HR" '{"comment":"Thiếu giấy tờ"}' | py "d['status']")" rejected
check "Hủy/từ chối không đổi hồ sơ" "$(call GET me/profile "$EMP" | py "d['personal']['address']")" "12 Trần Quang Khải, Tân Định, TP.HCM"

echo "— Audit"
check "Mỗi lượt Hiện số ghi một dòng nhật ký có người xem, chỉ lưu 4 số cuối" "$(sql "select count(*), count(actor_user_id), count(*) filter (where after_data::text like '%$ACC%') from public.audit_logs where action='bank_account.revealed'")" "3|3|0"
check "Lượt xuất bảng lương ghi số tài khoản đã xuất" "$(sql "select (after_data->>'bank_accounts')::int > 0 from public.audit_logs where action='payroll_input.exported' order by created_at desc limit 1")" t
check "Audit gửi đơn chỉ ghi tên trường, không chép giá trị" "$(sql "select count(*) from public.audit_logs where action='request.submitted' and after_data->>'type'='profile_change' and (after_data::text ~ '($ACC|0911222333|Trần Quang Khải|gmail)')")" 0
echo "— Ảnh đại diện"
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
check "Chưa có ảnh: avatarVersion null, tải ảnh → 404" "$(call GET me/profile "$EMP" | py "d['avatarVersion']") $(status GET me/avatar "$EMP")" "None 404"
check "File không phải ảnh → 400" "$(status POST me/avatar "$EMP" '{"dataBase64":"aGVsbG8="}')" 400
_a1=$(call POST me/avatar "$EMP" "{\"dataBase64\":\"$PNG\"}") || :
V1=$(echo "$_a1" | py "d['avatarVersion']")
check "Đổi ảnh: hồ sơ trả đúng phiên bản, tải được ảnh" "$(call GET me/profile "$EMP" | py "d['avatarVersion']") $(status GET me/avatar "$EMP")" "$V1 200"
_a2=$(call POST me/avatar "$EMP" "{\"dataBase64\":\"$PNG\"}") || :
check "Đổi lần nữa: phiên bản mới, file cũ bị xóa khỏi Storage" "$( [ "$(echo "$_a2" | py "d['avatarVersion']")" != "$V1" ] && echo moi) $(sql "select count(*) from storage.objects where bucket_id='tenant-branding' and name like '%/avatar-%'")" "moi 1"
check "Gỡ ảnh: về null, file bị xóa, có audit" "$(call POST me/avatar/remove "$EMP" '{}' | py "d['avatarVersion']") $(sql "select count(*) from storage.objects where bucket_id='tenant-branding' and name like '%/avatar-%'") $(sql "select count(*) from public.audit_logs where action like 'employee.avatar_%'")" "None 0 3"
echo "Tất cả bước đề nghị sửa hồ sơ đều đạt."
