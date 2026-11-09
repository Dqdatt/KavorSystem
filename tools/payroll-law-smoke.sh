#!/usr/bin/env bash
# Tham số luật lương (Console sửa, web HR xem + tính thử). Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
pw() { python3 -c "import secrets; print('Kv' + secrets.token_urlsafe(12) + '9')"; }
clogin() { local b="{\"email\":\"$1\",\"password\":\"$2\"}"; call POST console/auth/login "" "$b" | field data.session.accessToken; }
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"

echo "— Web HR: xem + tính thử"
check "Xem 2 phiên bản 2026, có mục chưa đối chiếu" "$(call GET admin/payroll/law "$HR" | py "(sorted(v['effectiveFrom'] for v in d)[:2], any(not s['verified'] for v in d for s in v['sources']))")" "(['2026-01-01', '2026-07-01'], True)"
_r=$(call POST admin/payroll/calc-preview "$HR" '{"date":"2026-03-31","gross":20000000,"region":1}') || :
check "Tính thử 20 triệu tháng 3/2026: BH 2,1 tr, thuế 120.000, thực nhận 17,78 tr, kèm cảnh báo chưa đối chiếu" "$(echo "$_r" | py "(d['lawFrom'], d['totals']['insurance'], d['totals']['pit'], d['totals']['net'], len(d['unverified']) > 0)")" "('2026-01-01', 2100000, 120000, 17780000, True)"
_r=$(call POST admin/payroll/calc-preview "$HR" '{"date":"2026-08-31","gross":60000000,"region":1}') || :
check "Tháng 8/2026 dùng phiên bản 01/07 (trần BHXH 50,6 tr)" "$(echo "$_r" | py "(d['lawFrom'], [l['amount'] for l in d['employee'] if l['key']=='si'][0])")" "('2026-07-01', 4048000)"
check "Quản lý (không xem lương) → 403" "$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/payroll/law" -H "authorization: Bearer $MGR")" 403
check "Đầu vào sai → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/payroll/calc-preview" -H 'content-type: application/json' -H "authorization: Bearer $HR" -d '{"gross":-1}')" 400
echo "— Console: chỉ Quản trị Console sửa được"
PA=$(pw); PO=$(pw)
OPERATOR_PASSWORD=$PA bash "$(dirname "$0")/create-operator.sh" law.admin@kavor.test "Quản Trị Luật" platform_admin >/dev/null
OPERATOR_PASSWORD=$PO bash "$(dirname "$0")/create-operator.sh" law.op@kavor.test "Vận Hành Luật" platform_operator >/dev/null
CA=$(mfa "$(clogin law.admin@kavor.test "$PA")" console); need "Quản trị Console bật MFA" "$CA"
CO=$(mfa "$(clogin law.op@kavor.test "$PO")" console); need "Vận hành bật MFA" "$CO"
FUT=$(today 60)
P=$(call GET console/payroll-law "$CA" | py "json.dumps({'effectiveFrom':'$FUT','params':[v for v in d if v['effectiveFrom']=='2026-07-01'][0]['params'],'sources':[{'item':'Lương cơ sở','ref':'Thử','verified':True}],'note':'smoke'})")
check "Vận hành không tạo được phiên bản → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/console/payroll-law" -H 'content-type: application/json' -H "authorization: Bearer $CO" -d "$P")" 403
_c=$(call POST console/payroll-law "$CA" "$P") || :
check "Quản trị Console tạo phiên bản tương lai" "$(echo "$_c" | py "[(v['state'], v['editable']) for v in d if v['effectiveFrom']=='$FUT'][0]")" "('future', True)"
OLD=$(call GET console/payroll-law "$CA" | py "[v['id'] for v in d if v['effectiveFrom']=='2026-01-01'][0]")
check "Phiên bản đã hiệu lực không sửa được → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/console/payroll-law/$OLD" -H 'content-type: application/json' -H "authorization: Bearer $CA" -d "$P")" 400
BAD=$(echo "$P" | python3 -c "import json,sys; d=json.load(sys.stdin); d['effectiveFrom']='$(today 61)'; d['params']['pit']=[{'upTo':10,'rate':0.05}]; print(json.dumps(d))")
check "Biểu thuế sai cấu trúc → 400" "$(curl -s -X POST "$API/console/payroll-law" -H 'content-type: application/json' -H "authorization: Bearer $CA" -d "$BAD" | field error.message)" "Bậc thuế cuối phải không có mức trên (upTo: null)."
echo "Tất cả bước tham số luật lương đều đạt."
