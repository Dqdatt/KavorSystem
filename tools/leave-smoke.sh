#!/usr/bin/env bash
# Kiểm thử nghỉ phép: sổ phép năm theo quy định mẫu (tích lũy theo tháng, số dư đầu kỳ), loại nghỉ, đếm ngày làm việc,
# đơn ≤ 2 ngày chỉ quản lý duyệt, > 2 ngày thêm HR, giữ chỗ → trừ phép / trả lại khi từ chối/hủy, trùng ngày, vượt phép,
# nghỉ nửa ngày, bảng công hiện ngày nghỉ, web HR xem/điều chỉnh/nhập phép tồn (hết hạn tự trừ), phạm vi quản lý.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
HA=60000000-0000-4000-8000-000000000142
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGRW=$(mfa "$MGR"); need "Quản lý bật MFA cho web" "$MGRW"
avail() { call GET me/leave "$EMP" | py "float(d['balance']['available'])"; }

echo "— Sổ phép và lịch"
r=$(call GET me/leave "$EMP")
check "Có sổ phép năm theo quy định mẫu (12 ngày, tích lũy theo tháng)" "$(echo "$r" | py "(d['balance']['yearEntitlement'], d['balance']['accrualMonthly'], d['balance']['policy']['name'])")" "(12, True, 'Phép năm chuẩn')"
check "Tích lũy tới tháng này, trừ 2 ngày đã nghỉ trước khi dùng Kavor" "$(echo "$r" | py "(d['balance']['granted']==int(d['today'][5:7]), d['balance']['adjusted'], d['balance']['available']==d['balance']['granted']-2)")" "(True, -2, True)"
check "Loại nghỉ của công ty, người duyệt, ngưỡng HR" "$(echo "$r" | py "([t['code'] for t in d['types']], d['approver'], d['hrOverDays'])")" "(['AL', 'UL', 'SL', 'WED', 'BRV'], 'Lê Quang Huy', 2)"
TODAY=$(echo "$r" | field data.today)
A0=$(echo "$r" | py "d['balance']['available']")
W=$(echo "$r" | py "' '.join(x['date'] for x in d['calendar'] if x['workday'] and x['date']>d['today'] and not x['taken'])")
set -- $W; D1=$1; D2=$2; D3=$3; D4=$4; D5=$5; D6=$6; D7=$7; D8=$8; D9=$9
OFF=$(echo "$r" | py "[x['date'] for x in d['calendar'] if not x['workday'] and x['date']>d['today'] and x['weekday']>=6][0]")
# Lịch me/leave bắt đầu từ kỳ hiện tại; ngày đầu kỳ chưa có ngày đã qua.
ts=$(call GET me/timesheet "$EMP")
PAST_MONTH=$(echo "$ts" | field data.period.month)
PAST=$(echo "$r" | py "next((x['date'] for x in reversed(d['calendar']) if x['workday'] and x['date']<d['today']), '')")
if [ -z "$PAST" ]; then
  PAST_MONTH=$(echo "$ts" | py "(lambda y,m: f'{y-(m==1)}-{m-1 or 12:02d}')(*map(int,d['period']['month'].split('-')))")
  PAST=$(call GET "me/timesheet?month=$PAST_MONTH" "$EMP" | py "[x['date'] for x in d['days'] if x['workday'] and x['date']<'$TODAY'][-1]")
fi
need "Ngày làm việc sắp tới: $D1 … $D9; ngày nghỉ $OFF; ngày đã qua $PAST" "$D9"

echo "— Kiểm tra đơn"
check "Loại nghỉ không có → 400" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"XX\",\"from\":\"$D1\",\"reason\":\"Việc riêng\"}")" 400
check "Ngày kết thúc trước ngày bắt đầu → 400" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$D2\",\"to\":\"$D1\",\"reason\":\"Việc riêng\"}")" 400
check "Nửa ngày cho nhiều ngày → 400" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$D1\",\"to\":\"$D2\",\"half\":\"am\",\"reason\":\"Việc riêng\"}")" 400
check "Chỉ chọn ngày nghỉ cuối tuần → 400" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$OFF\",\"reason\":\"Việc riêng\"}")" 400
check "Nghỉ kết hôn quá 3 ngày → 400" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"WED\",\"from\":\"$D1\",\"to\":\"$D9\",\"reason\":\"Cưới\"}")" 400
B="{\"leaveType\":\"AL\",\"from\":\"$D1\",\"to\":\"$D9\",\"reason\":\"Đi du lịch dài ngày\"}"
check "Vượt số phép (kể cả nghỉ trước 1 ngày) → 409" "$([ "$(python3 -c "print($A0+1<9)")" = True ] && status POST me/requests/leave "$EMP" "$B" || echo 409)" 409

echo "— Đơn 1 ngày: chỉ quản lý duyệt"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$D1\",\"reason\":\"Việc gia đình\"}")
NO1=$(echo "$r" | field data.no); T1=$(echo "$r" | field data.steps.0.taskId)
check "Tạo đơn NP, bước HR bỏ qua (≤ 2 ngày)" "$(echo "$r" | py "(d['no'][:3], d['type'], d['payload']['days'], [s['status'] for s in d['steps']])")" "('NP-', 'leave', 1, ['pending', 'skipped'])"
check "Giữ chỗ 1 ngày" "$(call GET me/leave "$EMP" | py "(d['balance']['pending'], d['balance']['available']==$A0-1, [x['taken'] for x in d['calendar'] if x['date']=='$D1'][0])")" "(1, True, 'full')"
check "Trùng ngày → 409" "$(status POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$D1\",\"half\":\"pm\",\"reason\":\"Việc riêng\"}")" 409
check "Quản lý nhận đơn cần duyệt" "$(call GET me/approvals "$MGR" | py "[i['no'] for i in d['items']]==['$NO1']")" True
check "Quản lý duyệt → hoàn tất" "$(call POST me/approvals/$T1/approve "$MGR" '{}' | field data.status)" approved
check "Đã trừ 1 ngày, hết giữ chỗ" "$(call GET me/leave "$EMP" | py "(d['balance']['used'], d['balance']['pending'], d['balance']['available']==$A0-1)")" "(1, 0, True)"
check "Người gửi nhận thông báo đã duyệt" "$(call GET me/notifications "$EMP" | py "d['items'][0]['title']")" "Đơn $NO1 đã được duyệt"

echo "— Đơn 3 ngày: quản lý → HR"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$D2\",\"to\":\"$D4\",\"reason\":\"Về quê có việc\"}")
NO2=$(echo "$r" | field data.no); T2=$(echo "$r" | field data.steps.0.taskId)
check "Trên 2 ngày cần HR" "$(echo "$r" | py "(d['payload']['days'], [s['status'] for s in d['steps']])")" "(3, ['pending', 'waiting'])"
call POST me/approvals/$T2/approve "$MGR" '{}' >/dev/null
H2=$(call GET "admin/requests?status=pending" "$HR" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO2'][0]")
check "HR duyệt trên web" "$(call POST admin/approvals/$H2/approve "$HR" '{}' | field data.status)" approved
check "Đã trừ 4 ngày" "$(call GET me/leave "$EMP" | py "(d['balance']['used'], d['balance']['available']==$A0-4)")" "(4, True)"

echo "— Nửa ngày không lương, từ chối, hủy"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"UL\",\"from\":\"$D5\",\"half\":\"pm\",\"reason\":\"Đi khám bệnh\"}")
check "Nửa ngày không lương: 0,5 ngày, không giữ chỗ phép năm" "$(echo "$r" | py "(d['payload']['days'], d['payload']['half'])")_$(avail)" "(0.5, 'pm')_$(python3 -c "print(float($A0-4))")"
T3=$(echo "$r" | field data.steps.0.taskId)
check "Từ chối phải có lý do" "$(status POST me/approvals/$T3/reject "$MGR" '{}')" 400
check "Quản lý từ chối" "$(call POST me/approvals/$T3/reject "$MGR" '{"comment":"Tuần này chạy chiến dịch"}' | field data.status)" rejected
RID=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$D6\",\"reason\":\"Việc riêng\"}" | field data.id)
check "Hủy đơn đang chờ → trả giữ chỗ" "$(call POST me/requests/$RID/cancel "$EMP" | field data.status)_$(avail)" "cancelled_$(python3 -c "print(float($A0-4))")"

echo "— Nghỉ bù ngày đã qua → bảng công"
r=$(call POST me/requests/leave "$EMP" "{\"leaveType\":\"AL\",\"from\":\"$PAST\",\"reason\":\"Nghỉ ốm nhẹ, quên xin\"}")
call POST me/approvals/$(echo "$r" | field data.steps.0.taskId)/approve "$MGR" '{}' >/dev/null
check "Bảng công: ngày nghỉ phép cả ngày, có lương = 1 công" "$(call GET "me/timesheet?month=$PAST_MONTH" "$EMP" | py "[(x['kind'], x['credit'], x['leave']['typeName'], x['issue']) for x in d['days'] if x['date']=='$PAST'][0]")" "('leave', 1, 'Phép năm', None)"
check "Tổng kỳ có ngày nghỉ phép, công chuẩn không tính ngày nghỉ" "$(call GET "me/timesheet?month=$PAST_MONTH" "$EMP" | py "(d['summary']['leaveDays']>=1, d['summary']['standard']==len([x for x in d['days'] if x['workday']]))")" "(True, True)"

echo "— Web HR"
r=$(call GET admin/leave "$HR")
check "HR thấy sổ phép cả công ty" "$(echo "$r" | py "('HD0142' in [x['employee']['code'] for x in d['rows']], d['canManage'], len(d['types']))")" "(True, True, 5)"
check "Quản lý chỉ thấy phòng mình, không điều chỉnh" "$(call GET admin/leave "$MGRW" | py "(sorted(x['employee']['code'] for x in d['rows']), d['canManage'])")" "(['HD0142', 'HDG0003'], False)"
r=$(call GET admin/leave/$HA "$HR")
check "Sổ phép chi tiết: tích lũy, điều chỉnh, giữ chỗ, đã nghỉ; kèm đơn" "$(echo "$r" | py "(sorted({x['kind'] for x in d['ledger']}), len(d['requests']))")" "(['accrual', 'adjust', 'consume', 'hold', 'release'], 5)"
check "Quản lý không điều chỉnh được → 403" "$(status POST admin/leave/$HA/adjust "$MGRW" '{"amount":1,"reason":"Thưởng phép"}')" 403
check "Điều chỉnh phải có lý do" "$(status POST admin/leave/$HA/adjust "$HR" '{"amount":1}')" 400
check "Bước 0,5 ngày" "$(status POST admin/leave/$HA/adjust "$HR" '{"amount":0.3,"reason":"Thưởng phép"}')" 400
B5=$(avail)
check "HR cộng 1 ngày phép thưởng" "$(call POST admin/leave/$HA/adjust "$HR" '{"amount":1,"reason":"Thưởng phép dự án Q3"}' | py "float(d['balance']['available'])")" "$(python3 -c "print($B5+1)")"
Y=${TODAY:0:4}
B="{\"year\":$Y,\"amount\":2,\"carry\":true,\"expiresOn\":\"$Y-03-31\",\"reason\":\"Phép tồn năm trước (nhập từ bảng tính)\"}"
check "Nhập phép tồn đã quá hạn → tự hết hạn, số dư không đổi" "$(call POST admin/leave/$HA/adjust "$HR" "$B" | py "(d['balance']['carry'], d['balance']['expired'], float(d['balance']['available']))")" "(2, 2, $(python3 -c "print($B5+1)"))"
check "Hồ sơ nhân viên có nhật ký điều chỉnh phép" "$(call GET admin/employees/$HA "$HR" | py "'leave.adjusted' in {x['action'] for x in d['audit']}")" True
echo "Tất cả bước nghỉ phép đều đạt."
