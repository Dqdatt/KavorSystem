#!/usr/bin/env bash
# Nạp dữ liệu thử để rà UI web HR (đơn đủ loại, giấy tờ, người phụ thuộc, tạm ứng, kỳ lương tháng trước) qua API thật.
# Chạy trên DB local đang dùng (không reset), cần `pnpm dev:backend`. Không dùng cho cloud.
# shortcut: chạy lại sẽ tạo thêm đơn/tài liệu trùng, bước lỗi (409…) chỉ in ra rồi đi tiếp; reset DB nếu cần sạch.
set -uo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -Atq -c "$1"; }
HA=60000000-0000-4000-8000-000000000142
TODAY=$(today)
# say "nhãn" <kết quả> hoặc say "nhãn" METHOD path token [body]. Không viết say "…" "$(call … "{\"k\":…}")": bash 3.2 của macOS
# đọc sai \" trong "$(…)" rồi brace-expand body JSON thành nhiều từ → API trả "Bad Request".
say() { local n=$1 r; shift; if [ $# -gt 1 ]; then r=$(call "$@"); else r=$1; fi
  echo "• $n: $(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); e=d.get('error'); print(('lỗi ' + (e.get('message') if isinstance(e,dict) else str(d.get('message', e)))) if e else 'ok')" 2>/dev/null || echo "$r" | head -c 200)"; }

# Đã kích hoạt: đăng nhập; chưa: kích hoạt qua OTP Mailpit. Web cần MFA: dùng factor sẵn có (secret trong DB local), chưa có thì liên kết mới.
token() { local t; t=$(call POST auth/login "" "{\"identifier\":\"$2\",\"password\":\"$PW\"}" | field data.session.accessToken 2>/dev/null)
  [ -n "$t" ] || t=$(activate "$1" "$2"); echo "$t"; }
admin() { local fid sec
  read -r fid sec <<<"$(sql "select f.id, f.secret from auth.mfa_factors f join auth.users u on u.id=f.user_id where u.email='$2' and f.status='verified' limit 1" | tr '|' ' ')"
  if [ -n "$fid" ]; then call POST admin/mfa/verify "$1" "{\"factorId\":\"$fid\",\"code\":\"$(totp "$sec")\"}" | field data.accessToken; else mfa "$1"; fi; }

curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(token HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà" "$EMP"
MGR=$(token HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy" "$MGR"
HR=$(admin "$(token HD0007 thao.mai@haidang.vn)" thao.mai@haidang.vn); need "HR (MFA)" "$HR"
PAY=$(admin "$(token HD0215 nhung.do@haidang.vn)" nhung.do@haidang.vn); need "Kế toán (MFA)" "$PAY"

echo "— Đơn nghỉ phép"
say "Phép năm 2 ngày (chờ duyệt)" POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$(today 3)\",\"to\":\"$(today 4)\",\"reason\":\"Về quê có việc gia đình\"}"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$(today 10)\",\"reason\":\"Việc riêng\"}"); say "Phép năm 1 ngày" "$r"
T=$(echo "$r" | field data.steps.0.taskId 2>/dev/null); [ -n "$T" ] && say "Quản lý duyệt" POST me/approvals/$T/approve "$MGR" '{}'

echo "— Đơn sửa hồ sơ (địa chỉ dài, liên hệ khẩn cấp, ngân hàng)"
B='{"personalEmail":"ha.tran@example.test","address":"12/34B Đường số 7, phường Linh Trung, TP. Thủ Đức, TP. HCM","emergency":{"name":"Trần Văn Bình","phone":"0909123456","relation":"Bố"},"bank":{"bankName":"Techcombank","accountNo":"190123456789","holder":"Tran Thu Ha"},"reason":"Cập nhật thông tin cá nhân"}'
say "Gửi đề nghị sửa hồ sơ" POST me/requests/profile "$EMP" "$B"

echo "— Tạm ứng: một đơn đã chi"
r=$(call POST me/requests/advance "$EMP" '{"amount":2000000,"reason":"Chi phí y tế"}'); say "Đơn tạm ứng 2 triệu" "$r"
RQ=$(echo "$r" | field data.id 2>/dev/null); NO=$(echo "$r" | field data.no 2>/dev/null); T=$(echo "$r" | field data.steps.0.taskId 2>/dev/null)
if [ -n "$T" ]; then
  call POST me/approvals/$T/approve "$MGR" '{}' >/dev/null
  T3=$(call GET "admin/requests?status=pending" "$PAY" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO'][0]")
  say "Kế toán duyệt" POST admin/approvals/$T3/approve "$PAY" '{}'
  say "Xác nhận đã chi" POST admin/advances/$RQ/paid "$PAY" '{"note":"CK Vietcombank"}'
fi

echo "— Giấy tờ, thuế, người phụ thuộc, khoản phụ cấp"
PDF=$(printf '%%PDF-1.4\n%%Kavor demo\n' | base64)
say "Hợp đồng lao động" POST admin/documents "$HR" "{\"employeeId\":\"$HA\",\"category\":\"contract\",\"title\":\"Hợp đồng lao động 2026\",\"docNo\":\"HĐLĐ-0142/2026\",\"issuedOn\":\"$(today -200)\",\"visibility\":\"hr_employee\",\"fileName\":\"HDLD-HD0142.pdf\",\"dataBase64\":\"$PDF\"}"
say "CCCD" POST admin/documents "$HR" "{\"employeeId\":\"$HA\",\"category\":\"personal\",\"title\":\"CCCD\",\"visibility\":\"hr_only\",\"fileName\":\"CCCD.pdf\",\"dataBase64\":\"$PDF\"}"
say "MST + công đoàn" POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"8012345678","unionMember":true}'
say "Người phụ thuộc" POST admin/employees/$HA/pay/dependents "$HR" "{\"fullName\":\"Trần Minh Khang\",\"relation\":\"Con\",\"birthDate\":\"2018-03-12\",\"fromMonth\":\"$(echo "$TODAY" | cut -c1-7)\"}"
say "Khoản phụ cấp mẫu" POST admin/payroll/pay-items/templates "$HR" '{}'

echo "— Kỳ lương tháng trước: khóa công, chốt đầu vào, tính, gửi kiểm tra"
CUR=$(call GET admin/payroll/inputs "$HR" | py "d['month']")
PREV=$(python3 -c "y,m=map(int,'$CUR'.split('-')); print(f'{y-(m==1)}-{m-1 or 12:02d}')")
say "Mở kỳ lương $PREV" POST admin/payroll/cycles "$PAY" "{\"month\":\"$PREV\",\"payDate\":\"$TODAY\"}"
say "Khóa kỳ công $PREV" POST admin/timesheets/lock "$HR" "{\"month\":\"$PREV\",\"reason\":\"Đối soát xong\"}"
say "Chốt bảng đầu vào" POST admin/payroll/inputs/$PREV/finalize "$HR" '{"note":"Gửi Kế toán"}'
say "Tính và ghi kết quả" POST admin/payroll/cycles/$PREV/compute "$PAY" '{"dryRun":false}'
say "Gửi kiểm tra" POST admin/payroll/cycles/$PREV/submit "$PAY" '{}'
echo "Xong."
