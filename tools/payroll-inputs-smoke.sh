#!/usr/bin/env bash
# Kiểm thử lương đầu vào HCNS (mục Lương trong hồ sơ) + bảng lương đầu vào theo kỳ:
# Danh mục khoản phụ cấp/thưởng do doanh nghiệp tự khai (mẫu, thêm, trùng tên, ngừng dùng);
# HR xem/sửa lương (phiên bản có lương đóng BH, các khoản phụ cấp, tình trạng lao động), lương cứng = cơ bản + phụ cấp, tạm ứng theo lương cứng, MST/công đoàn, người phụ thuộc theo tháng;
# Quản lý không thấy lương; bảng đầu vào tách đoạn khi đổi lương trong kỳ, có tạm ứng/người phụ thuộc; chốt cần khóa kỳ công,
# bản chốt bất biến (chốt lại = bản mới), xuất CSV; nhật ký không ghi số tiền.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
HA=60000000-0000-4000-8000-000000000142
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý Lê Quang Huy bật MFA" "$MGR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"

echo "— Danh mục khoản phụ cấp/thưởng"
check "Công ty mẫu chưa có khoản nào, HR quản lý được" "$(call GET admin/payroll/pay-items "$HR" | py "(len(d['items']), d['canManage'])")" "(0, True)"
check "Quản lý trực tiếp không xem danh mục → 403" "$(status GET admin/payroll/pay-items "$MGR")" 403
_t=$(call POST admin/payroll/pay-items/templates "$HR" '{}') || :
check "Thêm mẫu phổ biến: 7 khoản, không có số tiền" "$(echo "$_t" | py "(len(d['items']), all(x['defaultAmount'] is None for x in d['items']))")" "(7, True)"
check "Thêm mẫu lần hai không nhân đôi" "$(call POST admin/payroll/pay-items/templates "$HR" '{}' | py "len(d['items'])")" 7
LUNCH=$(echo "$_t" | py "[x['id'] for x in d['items'] if x['name']=='Phụ cấp ăn trưa'][0]")
B='{"name":"Phụ cấp ăn trưa","kind":"allowance","payMode":"by_workdays","insurable":false,"taxMode":"partial","taxFreeCap":730000,"defaultAmount":730000,"note":null}'
check "Công ty tự nhập mức ăn trưa + mức miễn thuế" "$(call POST admin/payroll/pay-items/$LUNCH "$HR" "$B" | py "[(x['defaultAmount'], x['taxFreeCap']) for x in d['items'] if x['id']=='$LUNCH'][0]")" "(730000, 730000)"
B='{"name":"Phụ cấp kỹ năng","kind":"allowance","payMode":"fixed","insurable":true,"taxMode":"taxable","defaultAmount":null,"note":"Theo chứng chỉ"}'
_k=$(call POST admin/payroll/pay-items "$HR" "$B") || :
SKILL=$(echo "$_k" | py "[x['id'] for x in d['items'] if x['name']=='Phụ cấp kỹ năng'][0]")
check "Tạo khoản riêng của công ty" "$(echo "$_k" | py "[(x['payMode'], x['insurable']) for x in d['items'] if x['id']=='$SKILL'][0]")" "('fixed', True)"
B='{"name":"phụ cấp KỸ NĂNG","kind":"allowance","payMode":"fixed","insurable":false,"taxMode":"taxable"}'
check "Trùng tên → 409" "$(status POST admin/payroll/pay-items "$HR" "$B")" 409
B='{"name":"X","kind":"allowance","payMode":"weekly","insurable":false,"taxMode":"taxable"}'
check "Cách trả sai → 400" "$(status POST admin/payroll/pay-items "$HR" "$B")" 400
check "Quản lý không tạo khoản → 403" "$(status POST admin/payroll/pay-items "$MGR" '{"name":"X","kind":"allowance","payMode":"fixed","taxMode":"taxable"}')" 403
HOUSE=$(echo "$_t" | py "[x['id'] for x in d['items'] if x['name']=='Phụ cấp nhà ở'][0]")
check "Ngừng dùng khoản nhà ở" "$(call POST admin/payroll/pay-items/$HOUSE/archive "$HR" '{}' | py "[x['archived'] for x in d['items'] if x['id']=='$HOUSE'][0]")" True

echo "— Mục Lương trong hồ sơ"
r=$(call GET admin/employees/$HA/pay "$HR")
check "HR xem lương của Trần Thu Hà (mẫu 15 triệu), được sửa" "$(echo "$r" | py "(d['current']['baseSalary'], d['canManage'], d['employmentType'])")" "(15000000, True, 'official')"
check "Quản lý trực tiếp không xem được lương → 403" "$(status GET admin/employees/$HA/pay "$MGR")" 403
CUR=$(call GET admin/payroll/inputs "$HR" | py "d['month']")
P=$(call GET "admin/payroll/inputs?month=$CUR" "$HR" | py "d['period']['start']")
PREV=$(python3 -c "y,m=map(int,'$CUR'.split('-')); print(f'{y-(m==1)}-{m-1 or 12:02d}')")
PS=$(call GET "admin/payroll/inputs?month=$PREV" "$HR" | py "d['period']['start']")
PE=$(call GET "admin/payroll/inputs?month=$PREV" "$HR" | py "d['period']['end']")
# Đổi lương giữa kỳ trước: thử việc → chính thức từ ngày 10 của kỳ (sau ngày bắt đầu kỳ)
MID=$(python3 -c "import datetime; print(datetime.date.fromisoformat('$PS')+datetime.timedelta(days=10))")
B="{\"baseSalary\":12000000,\"employmentType\":\"probation\",\"effectiveFrom\":\"$PS\",\"note\":\"Thử nghiệm\"}"
_s1=$(call POST admin/employees/$HA/pay/compensation "$HR" "$B") || :
check "HR nhập mức lương đầu kỳ trước (thử việc)" "$(echo "$_s1" | py "len(d['history'])")" 2
B="{\"baseSalary\":16000000,\"effectiveFrom\":\"$MID\",\"items\":[{\"itemId\":\"$HOUSE\",\"amount\":500000}]}"
check "Khoản đã ngừng dùng không nhập được → 400" "$(status POST admin/employees/$HA/pay/compensation "$HR" "$B")" 400
B="{\"baseSalary\":16000000,\"insuranceSalary\":9000000,\"employmentType\":\"official\",\"effectiveFrom\":\"$MID\",\"items\":[{\"itemId\":\"$LUNCH\",\"amount\":730000},{\"itemId\":\"$SKILL\",\"amount\":770000}]}"
_s2=$(call POST admin/employees/$HA/pay/compensation "$HR" "$B") || :
check "Chính thức từ giữa kỳ: lương 16 triệu, đóng BH 9 triệu, ăn trưa + kỹ năng = phụ cấp 1,5 triệu" "$(echo "$_s2" | py "[(h['baseSalary'], h['insuranceSalary'], h['allowance'], [x['name'] for x in h['items']], h['employmentType']) for h in d['history'] if h['effectiveFrom']=='$MID'][0]")" "(16000000, 9000000, 1500000, ['Phụ cấp ăn trưa', 'Phụ cấp kỹ năng'], 'official')"
B="{\"baseSalary\":16000000,\"effectiveFrom\":\"$P\",\"items\":[{\"itemId\":\"$LUNCH\",\"amount\":1},{\"itemId\":\"$LUNCH\",\"amount\":2}]}"
check "Một khoản nhập hai lần → 400" "$(status POST admin/employees/$HA/pay/compensation "$HR" "$B")" 400
B="{\"baseSalary\":16000000,\"effectiveFrom\":\"$MID\"}"
check "Trùng ngày hiệu lực → 409" "$(status POST admin/employees/$HA/pay/compensation "$HR" "$B")" 409
B="{\"baseSalary\":16000000,\"employmentType\":\"part\",\"effectiveFrom\":\"$P\"}"
check "Tình trạng lao động sai → 400" "$(status POST admin/employees/$HA/pay/compensation "$HR" "$B")" 400
B="{\"baseSalary\":16000000,\"effectiveFrom\":\"$P\"}"
check "Quản lý không sửa lương → 403" "$(status POST admin/employees/$HA/pay/compensation "$MGR" "$B")" 403
check "MST sai → 400" "$(status POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"12AB","unionMember":true}')" 400
check "Lưu MST + đoàn viên công đoàn" "$(call POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"8012345678","unionMember":true}' | py "(d['taxCode'], d['unionMember'])")" "('8012345678', True)"
check "Cam kết 08 khi chưa có MST → 400" "$(status POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":null,"unionMember":true,"commitment08":true}')" 400
check "Hình thức thử việc sai → 400" "$(status POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"8012345678","unionMember":true,"probationContract":"x"}')" 400
check "Lưu hình thức thử việc + cam kết 08, giữ nguyên khi không gửi" "$(call POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"8012345678","unionMember":true,"probationContract":"in_contract","commitment08":true}' | py "(d['probationContract'], d['commitment08'], d['withholdingRequested'])")|$(call POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"8012345678","unionMember":true}' | py "(d['probationContract'], d['commitment08'])")" "('in_contract', True, False)|('in_contract', True)"
B="{\"fullName\":\"A\",\"relation\":\"Con\",\"fromMonth\":\"$PREV\",\"toMonth\":\"2020-01\"}"
check "Tháng kết thúc trước tháng bắt đầu → 400" "$(status POST admin/employees/$HA/pay/dependents "$HR" "$B")" 400
B="{\"fullName\":\"Nguyễn Minh Khang\",\"relation\":\"Con\",\"birthDate\":\"2019-04-02\",\"fromMonth\":\"$PREV\"}"
_s3=$(call POST admin/employees/$HA/pay/dependents "$HR" "$B") || :
check "Thêm người phụ thuộc từ kỳ trước" "$(echo "$_s3" | py "(len(d['dependents']), d['activeDependents'])")" "(1, 1)"
DEP=$(echo "$_s3" | py "d['dependents'][0]['id']")
B="{\"fullName\":\"Nhập nhầm\",\"relation\":\"Mẹ\",\"fromMonth\":\"$CUR\"}"
_s4=$(call POST admin/employees/$HA/pay/dependents "$HR" "$B") || :
NOPE=$(echo "$_s4" | py "[x['id'] for x in d['dependents'] if x['fullName']=='Nhập nhầm'][0]")
check "Xóa người phụ thuộc phải có lý do" "$(status POST admin/employees/$HA/pay/dependents/$NOPE/remove "$HR" '{}')" 400
check "Xóa người phụ thuộc nhập nhầm" "$(call POST admin/employees/$HA/pay/dependents/$NOPE/remove "$HR" '{"reason":"Nhập nhầm"}' | py "len(d['dependents'])")" 1
B="{\"fullName\":\"Nguyễn Minh Khang\",\"relation\":\"Con\",\"fromMonth\":\"$PREV\",\"toMonth\":\"$PREV\"}"
check "Sửa người phụ thuộc (đặt tháng kết thúc)" "$(call POST admin/employees/$HA/pay/dependents/$DEP "$HR" "$B" | py "(d['dependents'][0]['toMonth'], d['activeDependents'])")" "('$PREV', 0)"
check "Nhật ký hồ sơ có đổi lương nhưng không ghi số tiền" "$(call GET admin/employees/$HA "$HR" | py "[str(x['after']) for x in d['audit'] if x['action']=='compensation.changed'][0]")" "{'effective_from': '$MID', 'employment_type': 'official'}"

echo "— Bảng lương đầu vào kỳ $PREV"
r=$(call GET "admin/payroll/inputs?month=$PREV" "$HR")
check "Bảng tạm (chưa chốt), HR chốt được" "$(echo "$r" | py "(d['source'], d['finalized'], d['canFinalize'], d['period']['locked'])")" "('live', None, True, False)"
check "Hà: 2 đoạn (thử việc 12tr → chính thức 16tr), tình trạng cuối kỳ chính thức, 1 người phụ thuộc, MST, công đoàn" \
  "$(echo "$r" | py "[(len(x['segments']), x['segments'][0]['baseSalary'], x['segments'][0]['employmentType'], x['segments'][1]['from'], x['baseSalary'], x['employmentType'], x['dependents'], x['taxCode'], x['unionMember'], 'Đổi lương/tình trạng trong kỳ' in x['warnings']) for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" \
  "(2, 12000000, 'probation', '$MID', 16000000, 'official', 1, '8012345678', True, True)"
check "Dòng của Hà có từng khoản phụ cấp" "$(echo "$r" | py "[[(i['name'], i['amount']) for i in x['items']] for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" "[('Phụ cấp ăn trưa', 730000), ('Phụ cấp kỹ năng', 770000)]"
check "Công từng đoạn cộng lại bằng công thực tế" "$(echo "$r" | py "[sum(s['credited'] for s in x['segments'])==x['credited'] and x['standard']>0 for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" True
check "Quản lý không xem được bảng → 403" "$(status GET "admin/payroll/inputs?month=$PREV" "$MGR")" 403
check "Kỳ công chưa khóa → không chốt (409)" "$(status POST admin/payroll/inputs/$PREV/finalize "$HR" '{}')" 409
B="{\"month\":\"$PREV\",\"reason\":\"Đối soát xong\"}"
check "Khóa kỳ công $PREV" "$(call POST admin/timesheets/lock "$HR" "$B" | field data.period.locked)" True
r=$(call POST admin/payroll/inputs/$PREV/finalize "$HR" '{"note":"Gửi Kế toán"}')
check "HR chốt bảng → bản chốt (lần 1)" "$(echo "$r" | py "(d['source'], d['finalized']['by'], d['finalized']['versions'], d['finalized']['note'])")" "('final', 'Mai Phương Thảo', 1, 'Gửi Kế toán')"
check "Kế toán xem bản đã chốt, thấy tài khoản ngân hàng hiện hành nếu có" "$(call GET "admin/payroll/inputs?month=$PREV" "$PAY" | py "(d['source'], 'HD0142' in [x['employee']['code'] for x in d['rows']])")" "('final', True)"
# Đổi lương sau khi chốt: bản chốt không đổi, bản tạm thấy ngay
B="{\"baseSalary\":17000000,\"effectiveFrom\":\"$PE\",\"items\":[{\"itemId\":\"$LUNCH\",\"amount\":730000},{\"itemId\":\"$SKILL\",\"amount\":770000}]}"
call POST admin/employees/$HA/pay/compensation "$HR" "$B" >/dev/null
check "Bản chốt giữ nguyên sau khi đổi lương" "$(call GET "admin/payroll/inputs?month=$PREV" "$HR" | py "[x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" 16000000
check "Bản tạm (source=live) thấy mức mới" "$(call GET "admin/payroll/inputs?month=$PREV&source=live" "$HR" | py "[x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" 17000000
check "Chốt lại → bản 2" "$(call POST admin/payroll/inputs/$PREV/finalize "$HR" '{}' | py "(d['finalized']['versions'], [x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0])")" "(2, 17000000)"
check "Xuất CSV (BOM, lương cứng 18,5tr, cột từng khoản, người phụ thuộc)" "$(curl -s "$API/admin/payroll/inputs/export?month=$PREV" -H "authorization: Bearer $HR" | python3 -c "import sys; t=sys.stdin.read(); print(t.startswith('﻿Mã NV') and 'Lương cứng' in t and 'Phụ cấp kỹ năng' in t and 'Số người phụ thuộc' in t and '18500000' in t)")" True
check "Quản lý không xuất CSV → 403" "$(status GET "admin/payroll/inputs/export?month=$PREV" "$MGR")" 403
check "Tạm ứng của Hà tính 30% lương cứng (17tr + 1,5tr phụ cấp)" "$(call GET me/advance "$EMP" | py "(d['baseSalary'], d['fixedSalary'], d['limit'])")" "(17000000, 18500000, 5550000)"
echo "Tất cả bước lương đầu vào đều đạt."
