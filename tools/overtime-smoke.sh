#!/usr/bin/env bash
# Kiểm thử làm thêm giờ: quy định OT mẫu theo luật, loại ngày + hệ số, bước 5 phút, không trùng ca chính / đơn khác,
# giới hạn ngày/tháng (quy định tra theo ngày làm thêm), Quản lý → HR duyệt, bảng công có giờ OT, từ chối không tính giới hạn,
# web HR tổng hợp theo tháng + phạm vi quản lý.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGRW=$(mfa "$MGR"); need "Quản lý bật MFA cho web" "$MGRW"
ot() { call POST me/requests/overtime "$EMP" "{\"date\":\"$1\",\"start\":\"$2\",\"end\":\"$3\",\"reason\":\"${4:-Hoàn thiện báo cáo chiến dịch}\"}"; }
ots() { status POST me/requests/overtime "$EMP" "{\"date\":\"$1\",\"start\":\"$2\",\"end\":\"$3\",\"reason\":\"Hoàn thiện báo cáo\"}"; }

echo "— Quy định và lịch"
r=$(call GET me/overtime "$EMP")
check "Quy định OT mẫu theo luật, người duyệt" "$(echo "$r" | py "(d['policy']['weekdayRate'], d['policy']['weekendRate'], d['policy']['holidayRate'], d['policy']['dailyLimitHours'], d['policy']['monthlyLimitHours'], d['policy']['yearlyLimitHours'], d['approver'])")" "(150, 200, 300, 4, 40, 200, 'Lê Quang Huy')"
WD=$(echo "$r" | py "[x['date'] for x in d['days'] if x['dayKind']=='workday' and x['date']>d['today']][0]")
WE=$(echo "$r" | py "[x['date'] for x in d['days'] if x['dayKind']=='weekend' and x['date']>=d['today']][0]")
WE2=$(echo "$r" | py "[x['date'] for x in d['days'] if x['dayKind']=='weekend' and x['date']>=d['today']][2]")
OLD=$(python3 -c "import datetime; print(datetime.date.today()-datetime.timedelta(days=5))")
check "Ngày làm việc có ca chính 08:00–17:00" "$(echo "$r" | py "[(x['shift']['start'], x['shift']['end']) for x in d['days'] if x['date']=='$WD'][0]")" "('08:00', '17:00')"
need "Ngày làm việc $WD, ngày nghỉ $WE, $WE2" "$WE2"

echo "— Kiểm tra đơn"
check "Giờ kết thúc trước giờ bắt đầu → 400" "$(ots "$WD" 19:00 18:00)" 400
check "Không theo bước 5 phút → 400" "$(ots "$WD" 17:00 17:42)" 400
check "Trùng giờ ca chính → 400" "$(ots "$WD" 16:00 18:00)" 400
check "Quá hạn đăng ký bù → 400" "$(ots "$OLD" 18:00 19:00)" 400
check "Quá 4 giờ trong ngày làm việc → 409" "$(ots "$WD" 17:00 21:30)" 409

echo "— Đơn ngày thường + ngày nghỉ"
r=$(ot "$WD" 17:30 19:30); NO1=$(echo "$r" | field data.no); T1=$(echo "$r" | field data.steps.0.taskId)
check "Đơn OT ngày thường: 2 giờ, hệ số 150%, Quản lý → HR" "$(echo "$r" | py "(d['no'][:3], d['type'], d['payload']['hours'], d['payload']['dayKind'], d['payload']['ratePercent'], [s['status'] for s in d['steps']])")" "('OT-', 'overtime', 2, 'workday', 150, ['pending', 'waiting'])"
check "Trùng giờ đơn đang chờ → 409" "$(ots "$WD" 19:00 20:00)" 409
r=$(ot "$WE" 08:00 12:00); T2=$(echo "$r" | field data.steps.0.taskId)
check "Đơn OT ngày nghỉ: 4 giờ, hệ số 200%" "$(echo "$r" | py "(d['payload']['hours'], d['payload']['dayKind'], d['payload']['ratePercent'])")" "(4, 'weekend', 200)"
check "Ngày nghỉ tối đa 12 giờ → 409" "$(ots "$WE" 12:00 21:00)" 409
check "Lịch hiện giờ đã đăng ký" "$(call GET me/overtime "$EMP" | py "[b['start']+'-'+b['end'] for x in d['days'] if x['date']=='$WD' for b in x['booked']]")" "['17:30-19:30']"

echo "— Giới hạn tháng theo quy định hiệu lực vào ngày làm thêm"
RID=$(call GET admin/rules "$HR" | py "[x['id'] for x in d if x['kind']=='overtime'][0]")
B="{\"config\":{\"weekdayRate\":150,\"weekendRate\":200,\"holidayRate\":300,\"dailyLimitHours\":4,\"monthlyLimitHours\":3,\"yearlyLimitHours\":200,\"submitAfterDays\":1},\"effectiveFrom\":\"$WE2\",\"note\":\"Thử giới hạn\"}"
check "Hệ số thấp hơn luật → 400" "$(status POST admin/rules/$RID/versions "$HR" '{"config":{"weekdayRate":120,"weekendRate":200,"holidayRate":300,"dailyLimitHours":4,"monthlyLimitHours":40,"yearlyLimitHours":200,"submitAfterDays":1},"effectiveFrom":"2099-01-01"}')" 400
call POST admin/rules/$RID/versions "$HR" "$B" >/dev/null
check "Từ ngày đó giới hạn 3 giờ/tháng → đơn 4 giờ bị chặn" "$(ots "$WE2" 08:00 12:00)" 409

echo "— Duyệt"
call POST me/approvals/$T1/approve "$MGR" '{}' >/dev/null
H1=$(call GET "admin/requests?status=pending" "$HR" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO1'][0]")
check "HR duyệt đơn OT" "$(call POST admin/approvals/$H1/approve "$HR" '{}' | field data.status)" approved
check "Người gửi nhận thông báo" "$(call GET me/notifications "$EMP" | py "d['items'][0]['title']")" "Đơn $NO1 đã được duyệt"
M=$(python3 -c "
import datetime; d=datetime.date.fromisoformat('$WD'); s=26
m=d.month+1 if d.day>=s else d.month; y=d.year+(1 if m==13 else 0); m=1 if m==13 else m; print(f'{y}-{m:02d}')")
check "Bảng công có giờ OT đã duyệt" "$(call GET "me/timesheet?month=$M" "$EMP" | py "([x['overtime'] for x in d['days'] if x['date']=='$WD'][0]['minutes'], d['summary']['overtimeMinutes'])")" "(120, 120)"
check "Quản lý từ chối đơn ngày nghỉ" "$(call POST me/approvals/$T2/reject "$MGR" '{"comment":"Không cần làm cuối tuần này"}' | field data.status)" rejected
check "Đơn bị từ chối không còn tính giờ, đăng ký lại được" "$(ot "$WE" 08:00 10:00 | py "d['payload']['hours']")" 2

echo "— Web HR"
MON=${WD:0:7}
r=$(call GET "admin/overtime?month=$MON" "$HR")
check "HR thấy tổng hợp OT tháng" "$(echo "$r" | py "[(x['employee']['code'], x['approvedHours'], x['byKind']['workday'], x['monthLimit']) for x in d['rows']]")" "[('HD0142', 2, 2, 40)]"
check "Danh sách đơn OT trong tháng" "$(echo "$r" | py "len(d['requests'])>=2")" True
check "Quản lý xem được phòng mình" "$(status GET "admin/overtime?month=$MON" "$MGRW")" 200
check "Nhân viên không vào web được" "$(status GET admin/overtime "$EMP")" 403
echo "Tất cả bước làm thêm giờ đều đạt."
