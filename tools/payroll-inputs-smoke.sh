#!/usr/bin/env bash
# Kiểm thử lương đầu vào HCNS (mục Lương trong hồ sơ) + bảng lương đầu vào theo kỳ:
# HR xem/sửa lương (phiên bản có lương đóng BH, phụ cấp, tình trạng lao động), MST/công đoàn, người phụ thuộc theo tháng;
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
B="{\"baseSalary\":16000000,\"insuranceSalary\":9000000,\"allowance\":1500000,\"employmentType\":\"official\",\"effectiveFrom\":\"$MID\"}"
_s2=$(call POST admin/employees/$HA/pay/compensation "$HR" "$B") || :
check "Chính thức từ giữa kỳ: lương 16 triệu, đóng BH 9 triệu, phụ cấp 1,5 triệu" "$(echo "$_s2" | py "[(h['baseSalary'], h['insuranceSalary'], h['allowance'], h['employmentType']) for h in d['history'] if h['effectiveFrom']=='$MID'][0]")" "(16000000, 9000000, 1500000, 'official')"
B="{\"baseSalary\":16000000,\"effectiveFrom\":\"$MID\"}"
check "Trùng ngày hiệu lực → 409" "$(status POST admin/employees/$HA/pay/compensation "$HR" "$B")" 409
B="{\"baseSalary\":16000000,\"employmentType\":\"part\",\"effectiveFrom\":\"$P\"}"
check "Tình trạng lao động sai → 400" "$(status POST admin/employees/$HA/pay/compensation "$HR" "$B")" 400
B="{\"baseSalary\":16000000,\"effectiveFrom\":\"$P\"}"
check "Quản lý không sửa lương → 403" "$(status POST admin/employees/$HA/pay/compensation "$MGR" "$B")" 403
check "MST sai → 400" "$(status POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"12AB","unionMember":true}')" 400
check "Lưu MST + đoàn viên công đoàn" "$(call POST admin/employees/$HA/pay/tax "$HR" '{"taxCode":"8012345678","unionMember":true}' | py "(d['taxCode'], d['unionMember'])")" "('8012345678', True)"
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
check "Công từng đoạn cộng lại bằng công thực tế" "$(echo "$r" | py "[sum(s['credited'] for s in x['segments'])==x['credited'] and x['standard']>0 for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" True
check "Quản lý không xem được bảng → 403" "$(status GET "admin/payroll/inputs?month=$PREV" "$MGR")" 403
check "Kỳ công chưa khóa → không chốt (409)" "$(status POST admin/payroll/inputs/$PREV/finalize "$HR" '{}')" 409
B="{\"month\":\"$PREV\",\"reason\":\"Đối soát xong\"}"
check "Khóa kỳ công $PREV" "$(call POST admin/timesheets/lock "$HR" "$B" | field data.period.locked)" True
r=$(call POST admin/payroll/inputs/$PREV/finalize "$HR" '{"note":"Gửi Kế toán"}')
check "HR chốt bảng → bản chốt (lần 1)" "$(echo "$r" | py "(d['source'], d['finalized']['by'], d['finalized']['versions'], d['finalized']['note'])")" "('final', 'Mai Phương Thảo', 1, 'Gửi Kế toán')"
check "Kế toán xem bản đã chốt, thấy tài khoản ngân hàng hiện hành nếu có" "$(call GET "admin/payroll/inputs?month=$PREV" "$PAY" | py "(d['source'], 'HD0142' in [x['employee']['code'] for x in d['rows']])")" "('final', True)"
# Đổi lương sau khi chốt: bản chốt không đổi, bản tạm thấy ngay
call POST admin/employees/$HA/pay/compensation "$HR" "{\"baseSalary\":17000000,\"effectiveFrom\":\"$PE\"}" >/dev/null
check "Bản chốt giữ nguyên sau khi đổi lương" "$(call GET "admin/payroll/inputs?month=$PREV" "$HR" | py "[x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" 16000000
check "Bản tạm (source=live) thấy mức mới" "$(call GET "admin/payroll/inputs?month=$PREV&source=live" "$HR" | py "[x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" 17000000
check "Chốt lại → bản 2" "$(call POST admin/payroll/inputs/$PREV/finalize "$HR" '{}' | py "(d['finalized']['versions'], [x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0])")" "(2, 17000000)"
check "Xuất CSV (BOM, có cột lương + người phụ thuộc)" "$(curl -s "$API/admin/payroll/inputs/export?month=$PREV" -H "authorization: Bearer $HR" | python3 -c "import sys; t=sys.stdin.read(); print(t.startswith('﻿Mã NV') and 'Số người phụ thuộc' in t and 'HD0142' in t and '17000000' in t)")" True
check "Quản lý không xuất CSV → 403" "$(status GET "admin/payroll/inputs/export?month=$PREV" "$MGR")" 403
echo "Tất cả bước lương đầu vào đều đạt."
