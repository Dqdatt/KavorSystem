#!/usr/bin/env bash
# Kavor tính kỳ lương từ bảng lương đầu vào đã chốt (docs/plans/payroll-calc.md phần 2): cài đặt lương công ty, xem trước, ghi vào kỳ,
# luồng duyệt/công bố giữ nguyên. Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
PAY=$(mfa "$(activate HD0215 nhung.do@haidang.vn)"); need "Kế toán bật MFA" "$PAY"

echo "— Cài đặt lương của công ty"
check "Mặc định Kavor: vùng I, thử việc 85% không phụ cấp, HĐ thử việc riêng, thu đoàn phí theo luật, chia trên tổng, chưa có phiên bản" \
  "$(call GET admin/settings "$HR" | py "(lambda p: (p['region'], p['probationRate'], p['probationAllowances'], p['probationContract'], p['unionFee'], p['prorate'], p['effectiveFrom']))(d['payroll'])")" \
  "(1, 0.85, False, 'separate', {'collect': True, 'rate': None}, 'total', None)"
_r=$(call PATCH admin/settings "$HR" '{"payroll":{"region":2,"probationRate":0.9,"probationContract":"in_contract","unionFee":{"collect":false,"rate":null}}}') || :
check "Lưu quy chế thành phiên bản từ hôm nay" "$(echo "$_r" | py "(lambda p: (p['region'], p['probationRate'], p['probationContract'], p['unionFee']['collect'], p['effectiveFrom']))(d['payroll'])")" "(2, 0.9, 'in_contract', False, '$(today)')"
check "Lương thử việc dưới 85% → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/admin/settings" -H 'content-type: application/json' -H "authorization: Bearer $HR" -d '{"payroll":{"probationRate":0.8}}')" 400
check "Vùng sai → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/admin/settings" -H 'content-type: application/json' -H "authorization: Bearer $HR" -d '{"payroll":{"region":5}}')" 400
check "Ngày áp dụng quá xa trong quá khứ → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/admin/settings" -H 'content-type: application/json' -H "authorization: Bearer $HR" -d "{\"payroll\":{\"region\":1,\"effectiveFrom\":\"$(today -90)\"}}")" 400
call PATCH admin/settings "$HR" '{"payroll":{"region":1,"probationRate":0.85,"probationContract":"separate","unionFee":{"collect":true,"rate":null}}}' >/dev/null
check "Lưu lại cùng ngày = sửa phiên bản đó (không thêm phiên bản)" "$(sql "select count(*) || '|' || max(settings->>'region') from public.payroll_policy_versions v join public.tenants t on t.id = v.tenant_id where t.code = 'HDG-001'")" "1|1"

echo "— Chuẩn bị: khóa kỳ công tháng trước, mở kỳ lương"
CUR=$(call GET admin/payroll/inputs "$HR" | py "d['month']")
PREV=$(python3 -c "y,m=map(int,'$CUR'.split('-')); print(f'{y-(m==1)}-{m-1 or 12:02d}')")
B="{\"month\":\"$PREV\",\"payDate\":\"$(today)\"}"
call POST admin/payroll/cycles "$PAY" "$B" >/dev/null
check "Chưa chốt bảng đầu vào → không tính (409)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/payroll/cycles/$PREV/compute" -H 'content-type: application/json' -H "authorization: Bearer $PAY" -d '{}')" 409
B="{\"month\":\"$PREV\",\"reason\":\"Đối soát xong\"}"
check "Khóa kỳ công $PREV" "$(call POST admin/timesheets/lock "$HR" "$B" | field data.period.locked)" True
check "Chốt bảng lương đầu vào" "$(call POST admin/payroll/inputs/$PREV/finalize "$HR" '{}' | py "d['source']")" final

echo "— Xem trước"
R=$(call POST admin/payroll/cycles/$PREV/compute "$PAY" '{}')
check "Tính được nhân viên có lương; tổng khớp từng dòng" "$(echo "$R" | py "(d['totals']['employees'] > 0, d['totals']['net'] == sum(r['net'] for r in d['rows']), all(r['net'] == r['gross'] - r['deduction'] for r in d['rows']))")" "(True, True, True)"
check "Mỗi dòng có lương theo công + công thức; BH hoặc lý do không đóng BH; cảnh báo luật chưa đối chiếu" "$(echo "$R" | py "(all(any(l['code']=='BASE' and '/' in l['formula'] for l in r['lines']) for r in d['rows']), all(any(l['code']=='INS_SI' for l in r['lines']) or any('không đóng BH' in w for w in r['warnings']) for r in d['rows']), len(d['unverified']) > 0)")" "(True, True, True)"
check "Không ai thực nhận âm vì BH khi không có công" "$(echo "$R" | py "all(r['net'] >= 0 or r['gross'] > 0 for r in d['rows'])")" True
check "Xem trước không ghi kết quả" "$(sql "select count(*) from public.payroll_results r join public.payroll_cycles c on c.id = r.cycle_id where c.month='$PREV'")" 0
check "HR (không có quyền nhập lương) → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/payroll/cycles/$PREV/compute" -H 'content-type: application/json' -H "authorization: Bearer $HR" -d '{}')" 403

echo "— Ghi vào kỳ lương"
N=$(echo "$R" | py "d['totals']['employees']"); NET=$(echo "$R" | py "d['totals']['net']")
check "Ghi: kỳ chuyển sang đã có kết quả" "$(call POST admin/payroll/cycles/$PREV/compute "$PAY" '{"dryRun":false}' | py "(d['batch']['fileName'].startswith('Kavor tính'), d['batch']['applied'])")" "(True, True)"
check "Kết quả trong DB khớp bản xem trước" "$(sql "select count(*) || '|' || sum(net) from public.payroll_results r join public.payroll_cycles c on c.id = r.cycle_id where c.month='$PREV'")" "$N|$NET"
check "Phiếu có dòng công thức (label) + dòng Thực nhận" "$(sql "select (count(*) filter (where i.component_code='BASE' and i.label like '%công%') > 0) || '|' || (count(*) filter (where i.component_code='NET') = $N) from public.payroll_result_items i join public.payroll_results r on r.id = i.result_id join public.payroll_cycles c on c.id = r.cycle_id where c.month='$PREV'")" "true|true"
check "Gửi kiểm tra được (luồng duyệt giữ nguyên)" "$(call POST admin/payroll/cycles/$PREV/submit "$PAY" '{}' | py "d['cycle']['status']")" under_review
check "Audit payroll.computed" "$(sql "select count(*) from public.audit_logs where action='payroll.computed'")" 1
echo "Tất cả bước tính kỳ lương đều đạt."
