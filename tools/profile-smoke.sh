#!/usr/bin/env bash
# Đề nghị sửa hồ sơ đầu-cuối qua API thật: nhân viên gửi → HR duyệt → hồ sơ cập nhật → Kế toán đọc tài khoản đã duyệt.
# SQL chỉ đọc hậu điều kiện. Chạy trên DB vừa reset.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HA=60000000-0000-4000-8000-000000000142
ACC=190123456789
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
check "HR thấy số tài khoản đầy đủ để đối chiếu" "$(echo "$H" | py "d['payload']['after']['bank']['accountNo']")" "$ACC"
check "Tenant khác không xem được → 404" "$(status GET "admin/requests/$ID" "$TB")" 404
check "Quản lý không duyệt thay HR → 403/404" "$(status POST "admin/approvals/$TASK/approve" "$MGR" '{}' | grep -cE '^(403|404)$')" 1

echo "— HR duyệt, hồ sơ cập nhật"
check "HR duyệt" "$(call POST "admin/approvals/$TASK/approve" "$HR" '{"comment":"Đã đối chiếu"}' | py "d['status']")" approved
P=$(call GET me/profile "$EMP")
check "Hồ sơ app: điện thoại, email, địa chỉ, liên hệ, tài khoản mới; hết đề nghị chờ" "$(echo "$P" | py "(d['phone'], d['personal']['personalEmail'], d['personal']['emergency']['relation'], d['personal']['bank']['accountNo'], d['pending'])")" "('0911222333', 'ha.tran@gmail.com', 'Bố', '$ACC', None)"
check "Nhân viên nhận thông báo đã duyệt" "$(sql "select count(*) from public.notifications n where n.recipient_employee_id='$HA' and n.link_id='$ID' and n.kind='request.approved'")" 1
check "HR xem hồ sơ nhân viên: thông tin cá nhân + số đầy đủ" "$(call GET "admin/employees/$HA" "$HR" | py "(d['personal']['address'], d['personal']['bank']['accountNo'])")" "('12 Trần Quang Khải, Tân Định, TP.HCM', '$ACC')"
check "Kế toán đọc tài khoản đã duyệt ở Lương cơ bản" "$(call GET admin/compensations "$PAY" | py "[(r['bank']['bankName'], r['bank']['accountNo']) for r in d['rows'] if r['employee']['code']=='HD0142'][0]")" "('Techcombank', '$ACC')"

echo "— Đề nghị khác: chỉ đổi địa chỉ, hủy và từ chối"
R2=$(call POST me/requests/profile "$EMP" '{"address":"Quận 1, TP.HCM"}'); ID2=$(echo "$R2" | field data.id)
check "Đơn chỉ đổi địa chỉ, lưu giá trị cũ để so sánh" "$(echo "$R2" | py "(d['payload']['fields'], d['payload']['before']['address'])")" "(['address'], '12 Trần Quang Khải, Tân Định, TP.HCM')"
check "Người gửi hủy đơn" "$(call POST "me/requests/$ID2/cancel" "$EMP" '{}' | py "d['status']")" cancelled
R3=$(call POST me/requests/profile "$EMP" '{"address":"Quận 7"}'); ID3=$(echo "$R3" | field data.id)
T3=$(call GET "admin/requests/$ID3" "$HR" | field data.myTaskId)
check "HR từ chối" "$(call POST "admin/approvals/$T3/reject" "$HR" '{"comment":"Thiếu giấy tờ"}' | py "d['status']")" rejected
check "Hủy/từ chối không đổi hồ sơ" "$(call GET me/profile "$EMP" | py "d['personal']['address']")" "12 Trần Quang Khải, Tân Định, TP.HCM"

echo "— Audit"
check "Audit gửi đơn chỉ ghi tên trường, không chép giá trị" "$(sql "select count(*) from public.audit_logs where action='request.submitted' and after_data->>'type'='profile_change' and (after_data::text ~ '($ACC|0911222333|Trần Quang Khải|gmail)')")" 0
echo "Tất cả bước đề nghị sửa hồ sơ đều đạt."
