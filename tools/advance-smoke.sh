#!/usr/bin/env bash
# Kiểm thử tạm ứng lương: hạn mức = lương cơ bản × %, tối thiểu, bước 10.000 ₫, mỗi tháng một đơn, Quản lý → HR (trên 5 triệu) → Kế toán,
# Kế toán xác nhận đã chi → thông báo, HR không xem lương / không chi, lương cơ bản có phiên bản, nhật ký không ghi số tiền lương.
# Quy định riêng cho nhân viên thử (hạn đến cuối tháng, 50%) để không phụ thuộc ngày chạy.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
HA=60000000-0000-4000-8000-000000000142
LINH=60000000-0000-4000-8000-000000000005
TODAY=$(today)
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán Đỗ Hồng Nhung bật MFA" "$PAY"
adv() { call POST me/requests/advance "$EMP" "{\"amount\":$1,\"reason\":\"${2:-Chi phí y tế}\"}"; }
advs() { status POST me/requests/advance "$EMP" "{\"amount\":$1}"; }

echo "— Quy định mẫu"
check "Quy định mẫu: 30%, tối thiểu 500.000, hạn ngày 20; luồng Quản lý → Kế toán" "$(call GET me/advance "$EMP" | py "(d['policy']['maxPercent'], d['policy']['minAmount'], d['policy']['deadlineDay'], d['baseSalary'], d['limit'], d['approvers'], d['hrOverAmount'])")" "(30, 500000, 20, 15000000, 4500000, ['Lê Quang Huy', 'Kế toán'], 5000000)"
B='{"kind":"salary_advance","code":"TU-THU","name":"Tạm ứng thử nghiệm","config":{"enabled":true,"maxPercent":50,"excludeProbation":true,"excludeNoticePeriod":true,"deadlineDay":31,"minAmount":500000},"effectiveFrom":"'$TODAY'"}'
RID=$(call POST admin/rules "$HR" "$B" | field data.id); need "Tạo quy định riêng (50%, nhận đơn đến cuối tháng)" "$RID"
B="{\"kind\":\"salary_advance\",\"targetId\":\"$RID\",\"scopeType\":\"employee\",\"scopeId\":\"$HA\",\"effectiveFrom\":\"$TODAY\",\"reason\":\"Thử nghiệm tạm ứng\"}"
check "Áp dụng riêng cho Trần Thu Hà" "$(call POST admin/policy-assignments "$HR" "$B" | field data.state)" active
check "Hạn mức theo quy định riêng: 7.500.000, còn hạn" "$(call GET me/advance "$EMP" | py "(d['limit'], d['deadlinePassed'], d['ineligible'])")" "(7500000, False, None)"

echo "— Kiểm tra đơn"
check "Dưới tối thiểu → 400" "$(advs 300000)" 400
check "Vượt hạn mức → 400" "$(advs 8000000)" 400
check "Không theo bước 10.000 ₫ → 400" "$(advs 1005000)" 400

echo "— Trên 5 triệu cần HR; hủy"
r=$(adv 6000000)
check "Đơn 6 triệu: Quản lý → HR → Kế toán" "$(echo "$r" | py "(d['no'][:3], d['type'], d['payload']['amount'], [s['status'] for s in d['steps']])")" "('TU-', 'salary_advance', 6000000, ['pending', 'waiting', 'waiting'])"
check "Mỗi tháng một đơn → 409" "$(advs 1000000)" 409
check "Hủy đơn" "$(call POST me/requests/$(echo "$r" | field data.id)/cancel "$EMP" | field data.status)" cancelled

echo "— Đơn 2 triệu: Quản lý → Kế toán → chi"
r=$(adv 2000000); RQ=$(echo "$r" | field data.id); NO=$(echo "$r" | field data.no); T1=$(echo "$r" | field data.steps.0.taskId)
check "Đơn 2 triệu: bỏ qua HR" "$(echo "$r" | py "[s['status'] for s in d['steps']]")" "['pending', 'skipped', 'waiting']"
check "Chưa duyệt chưa chi được → 409" "$(status POST admin/advances/$RQ/paid "$PAY" '{}')" 409
call POST me/approvals/$T1/approve "$MGR" '{}' >/dev/null
check "Kế toán nhận thông báo cần duyệt" "$(call GET admin/notifications "$PAY" | py "[n['title'] for n in d['items']]")" "['Đơn $NO cần bạn duyệt']"
check "HR không duyệt được bước Kế toán" "$(call GET "admin/requests?status=pending" "$HR" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO'][0]")" "None"
T3=$(call GET "admin/requests?status=pending" "$PAY" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO'][0]")
check "Kế toán duyệt → hoàn tất" "$(call POST admin/approvals/$T3/approve "$PAY" '{}' | field data.status)" approved
r=$(call GET admin/advances "$PAY")
check "Danh sách tạm ứng tháng: 1 chờ chi" "$(echo "$r" | py "(d['metrics']['toPay'], [x['request']['no'] for x in d['rows']][0])")" "(1, '$NO')"
check "HR không vào được danh sách chi" "$(status GET admin/advances "$HR")" 403
check "Kế toán xác nhận đã chi" "$(call POST admin/advances/$RQ/paid "$PAY" '{"note":"CK Vietcombank 25/10"}' | py "(d['payout']['paidBy'], d['payout']['note'])")" "('Đỗ Hồng Nhung', 'CK Vietcombank 25/10')"
check "Chi lại → 409" "$(status POST admin/advances/$RQ/paid "$PAY" '{}')" 409
check "Nhân viên nhận thông báo đã chi" "$(call GET me/notifications "$EMP" | py "(d['items'][0]['kind'], d['items'][0]['title'])")" "('advance.paid', 'Tạm ứng $NO đã chi')"
check "Màn tạm ứng: đơn tháng này đã chi" "$(call GET me/advance "$EMP" | py "(d['current']['no'], d['current']['payout'] is not None, len(d['history']))")" "('$NO', True, 2)"

echo "— Lương cơ bản"
check "HR không xem lương" "$(status GET admin/compensations "$HR")" 403
r=$(call GET admin/compensations "$PAY")
check "Kế toán xem lương" "$(echo "$r" | py "([x['baseSalary'] for x in d['rows'] if x['employee']['code']=='HD0142'][0], d['canManage'])")" "(15000000, True)"
B="{\"baseSalary\":20000000,\"effectiveFrom\":\"$TODAY\",\"note\":\"Tăng lương định kỳ\"}"
check "Kế toán đổi lương Võ Thảo Linh từ hôm nay" "$(call POST admin/compensations/$LINH "$PAY" "$B" | py "[(x['baseSalary'], len(x['history'])) for x in d['rows'] if x['employee']['id']=='$LINH'][0]")" "(20000000, 2)"
check "Trùng ngày hiệu lực → 409" "$(status POST admin/compensations/$LINH "$PAY" "$B")" 409
check "HR không đổi lương được" "$(status POST admin/compensations/$LINH "$HR" "$B")" 403
check "Nhật ký hồ sơ có đổi lương nhưng không ghi số tiền" "$(call GET admin/employees/$LINH "$HR" | py "[str(x['after']) for x in d['audit'] if x['action']=='compensation.changed'][0]")" "{'effective_from': '$TODAY'}"
echo "Tất cả bước tạm ứng lương đều đạt."
