#!/usr/bin/env bash
# Kiểm thử API HR/Admin: quyền theo permission + phạm vi, cách ly tenant, nhân viên/tài khoản, thiết bị, ca theo tầng, audit.
# Cần DB vừa `supabase db reset` và API đang chạy (bash tools/dev-backend.sh, có SMTP Mailpit).
set -euo pipefail
HA=60000000-0000-4000-8000-000000000142     # Trần Thu Hà · Marketing
AN=60000000-0000-4000-8000-000000000001     # Nguyễn Minh An · Ban Điều hành
THAO=60000000-0000-4000-8000-000000000007   # Mai Phương Thảo · HR Admin
MKT=40000000-0000-4000-8000-000000000005; AE=50000000-0000-4000-8000-000000000008
OFFICE_LAT=10.774390; OFFICE_LNG=106.703940

source "$(dirname "$0")/smoke-lib.sh"

# bash 3.2 (macOS) phân tích sai chuỗi JSON có \" lồng trong "$(...)" (bung ngoặc nhọn, gọi API nhiều lần):
# luôn gán body vào biến B trước rồi mới gọi trong check
TODAY=$(today); YESTERDAY=$(today -1); NEXTWEEK=$(today 7)
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
HR=$(activate HD0007 thao.mai@haidang.vn); [ -n "$HR" ] && echo "✔ Kích hoạt HR Admin Mai Phương Thảo (role gán sẵn trước khi kích hoạt)"
EMP=$(activate HD0142 thao.ha@haidang.vn); [ -n "$EMP" ] && echo "✔ Kích hoạt nhân viên Trần Thu Hà"
MGR=$(activate HDG0003 huy.le@example.test); [ -n "$MGR" ] && echo "✔ Kích hoạt quản lý Lê Quang Huy (phạm vi phòng Marketing)"
TB=$(activate BX0001 admin@maub.test); [ -n "$TB" ] && echo "✔ Kích hoạt Tenant Admin của Công ty Mẫu B"
check "HR chưa xác thực hai lớp → chặn" "$(call GET admin/me "$HR" | field error.code)" MFA_REQUIRED
HR=$(mfa "$HR"); MGR=$(mfa "$MGR"); TB=$(mfa "$TB")
[ -n "$HR" ] && [ -n "$MGR" ] && [ -n "$TB" ] && echo "✔ HR, quản lý, admin tenant B liên kết ứng dụng xác thực (TOTP)"

echo "— Quyền và phạm vi"
r=$(call GET admin/me "$HR")
check "HR có quyền quản lý ca" "$(echo "$r" | py "'schedule.manage' in d['permissions']")" True
check "Cảnh báo tenant chỉ có 1 Tenant Admin" "$(echo "$r" | field data.tenantAdminCount)" 1
check "Không token → 401" "$(status GET admin/me)" 401
check "Nhân viên thường không vào được HR/Admin" "$(call GET admin/me "$EMP" | field error.code)" FORBIDDEN
check "Nhân viên thường không đọc được danh sách nhân viên" "$(status GET admin/employees "$EMP")" 403
check "Quản lý chỉ thấy nhân viên phòng Marketing" "$(call GET admin/employees "$MGR" | py "sorted(e['code'] for e in d)")" "['HD0142', 'HDG0003']"
check "Quản lý xem nhân viên ngoài phạm vi → 404" "$(status GET admin/employees/$AN "$MGR")" 404
check "Quản lý không tạo được mẫu ca (thiếu schedule.manage)" "$(status POST admin/shifts "$MGR" '{"code":"X","name":"Ca X","start":"08:00","end":"17:00","effectiveFrom":"2026-12-01"}')" 403
check "Quản lý không khóa được tài khoản (thiếu membership.disable)" "$(status POST admin/employees/$HA/lock "$MGR" '{"reason":"thử quyền"}')" 403
check "Quản lý chỉ thấy bảng công phòng Marketing" "$(call GET admin/attendance/board "$MGR" | py "d['summary']['inScope']")" 2

echo "— Cách ly tenant"
check "Admin tenant B không xem được nhân viên tenant A → 404" "$(status GET admin/employees/$HA "$TB")" 404
check "Admin tenant B không khóa được nhân viên tenant A → 404" "$(status POST admin/employees/$HA/lock "$TB" '{"reason":"thử khác tenant"}')" 404
check "Admin tenant B chỉ thấy nhân viên của mình" "$(call GET admin/employees "$TB" | py "sorted(e['code'] for e in d)")" "['BX0001', 'BX0002']"
check "Admin tenant B không thấy bản ghi tenant A" "$(call GET admin/attendance/rejected "$TB" | py "len(d)")" 0

echo "— Nhân viên và tài khoản"
NEW="{\"employeeCode\":\"HD0300\",\"fullName\":\"Phạm Minh Đức\",\"workEmail\":\"duc.pham@haidang.vn\",\"hireDate\":\"$TODAY\",\"employmentType\":\"probation\",\"departmentId\":\"$MKT\",\"positionId\":\"$AE\",\"managerEmployeeId\":\"60000000-0000-4000-8000-000000000003\",\"sendInvite\":true}"
r=$(call POST admin/employees "$HR" "$NEW")
DUC=$(echo "$r" | field data.id)
check "Tạo nhân viên mới và gửi lời mời" "$(echo "$r" | field data.account)" invited
check "Thư mời tới Mailpit" "$(curl -s "$MAIL/api/v1/search?query=to:duc.pham@haidang.vn" | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['Subject'])")" "Hải Đăng Group mời bạn dùng Kavor"
check "Trùng mã nhân viên → 409" "$(status POST admin/employees "$HR" "$NEW")" 409
check "Gửi lại lời mời ngay lập tức bị giới hạn" "$(status POST admin/employees/$DUC/invite "$HR")" 429
check "Quản lý thấy nhân viên mới trong phòng" "$(call GET admin/employees "$MGR" | py "len(d)")" 3
r=$(call PATCH admin/employees/$DUC "$HR" '{"phone":"0909000300","employmentType":"official"}')
check "Sửa hồ sơ" "$(echo "$r" | field data.employmentType)" official
check "Audit ghi tạo/mời/sửa" "$(echo "$r" | py "sorted({a['action'] for a in d['audit']})")" "['employee.created', 'employee.invited', 'employee.updated']"
check "Đổi email sau khi đã kích hoạt bị chặn" "$(status PATCH admin/employees/$HA "$HR" '{"workEmail":"khac@haidang.vn"}')" 409

check "Khóa không ghi lý do → 400" "$(status POST admin/employees/$HA/lock "$HR" '{}')" 400
check "HR khóa tài khoản Hà" "$(call POST admin/employees/$HA/lock "$HR" '{"reason":"Tạm khóa để kiểm tra"}' | field data.account)" locked
check "Tài khoản bị khóa: token cũ bị chặn ngay" "$(call GET me "$EMP" | field error.code)" AUTH_ACCOUNT_DISABLED
B="{\"identifier\":\"HD0142\",\"password\":\"$PW\"}"
check "Tài khoản bị khóa: đăng nhập lại bị chặn" "$(call POST auth/login "" "$B" | field error.code)" AUTH_ACCOUNT_DISABLED
check "HR mở khóa" "$(call POST admin/employees/$HA/unlock "$HR" '{}' | field data.account)" active
check "Mở khóa xong dùng lại được" "$(call GET me "$EMP" | field data.employeeCode)" HD0142
check "HR không tự khóa chính mình" "$(status POST admin/employees/$THAO/lock "$HR" '{"reason":"tự khóa thử"}')" 409

echo "— Thiết bị"
check "Máy đầu tiên tự hoạt động" "$(call POST me/devices "$EMP" '{"installationId":"smoke-ha-iphone","platform":"ios","deviceModel":"iPhone 11"}' | field data.status)" active
r=$(call POST me/devices "$EMP" '{"installationId":"smoke-ha-pixel","platform":"android","deviceModel":"Pixel 6"}')
PIX=$(echo "$r" | field data.id)
check "Máy thứ hai chờ HR duyệt" "$(echo "$r" | field data.status)" pending
check "HR thấy máy chờ duyệt" "$(call GET 'admin/devices?status=pending' "$HR" | py "[x['deviceModel'] for x in d]")" "['Pixel 6']"
check "Quản lý không duyệt được máy (thiếu attendance.device.manage)" "$(status POST admin/devices/$PIX/approve "$MGR")" 403
check "Admin tenant B không duyệt được máy tenant A → 404" "$(status POST admin/devices/$PIX/approve "$TB")" 404
check "Từ chối không có lý do → 400" "$(status POST admin/devices/$PIX/reject "$HR" '{}')" 400
check "HR duyệt máy mới" "$(call POST admin/devices/$PIX/approve "$HR" | field data.status)" active
check "Máy cũ tự bị thu hồi" "$(call GET 'me/attendance/today?installationId=smoke-ha-iphone' "$EMP" | field data.device.status)" revoked
check "Máy mới chấm công được" "$(call GET 'me/attendance/today?installationId=smoke-ha-pixel' "$EMP" | field data.device.status)" active
check "HR thu hồi máy (có lý do)" "$(call POST admin/devices/$PIX/revoke "$HR" '{"reason":"Nhân viên báo mất máy"}' | field data.status)" revoked
B="{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"smoke-ha-pixel\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}"
check "Máy bị thu hồi không chấm công được" "$(call POST me/attendance/events "$EMP" "$B" | field error.code)" ATT_DEVICE_NOT_REGISTERED
check "Đăng ký lại sau khi bị thu hồi phải chờ duyệt" "$(call POST me/devices "$EMP" '{"installationId":"smoke-ha-pixel","platform":"android","deviceModel":"Pixel 6"}' | field data.status)" pending
check "Nhân viên thấy lý do khi bị từ chối" "$(call POST admin/devices/$PIX/reject "$HR" '{"reason":"Dùng máy công ty cấp"}' >/dev/null; call GET 'me/attendance/today?installationId=smoke-ha-pixel' "$EMP" | field data.device.decisionReason)" "Dùng máy công ty cấp"
r=$(call POST me/devices "$EMP" '{"installationId":"smoke-ha-pixel","platform":"android","deviceModel":"Pixel 6"}')
call POST admin/devices/$(echo "$r" | field data.id)/approve "$HR" >/dev/null

echo "— Ca và địa điểm theo tầng"
r=$(call GET "me/attendance/today?installationId=smoke-ha-pixel" "$EMP")
check "Nhân viên nhận ca HC từ cấp công ty" "$(echo "$r" | field data.shift.start)-$(echo "$r" | field data.shift.end)" "08:00-17:00"
check "Nhân viên nhận địa điểm theo chi nhánh" "$(echo "$r" | field data.locations.0.name)" "Văn phòng Quận 1"
B="{\"start\":\"08:30\",\"end\":\"17:30\",\"effectiveFrom\":\"$YESTERDAY\"}"
check "Phiên bản hiệu lực trong quá khứ bị chặn" "$(status POST admin/shifts/90000000-0000-4000-8000-000000000001/versions "$HR" "$B")" 400
SH=$(call POST admin/shifts "$HR" "{\"code\":\"CA9\",\"name\":\"Ca 9 giờ\",\"start\":\"09:00\",\"end\":\"18:00\",\"breakStart\":\"12:00\",\"breakEnd\":\"13:00\",\"lateGraceMinutes\":5,\"effectiveFrom\":\"$TODAY\"}" | field data.id)
[ -n "$SH" ] && echo "✔ Tạo mẫu ca mới"
B="{\"kind\":\"shift\",\"targetId\":\"$SH\",\"scopeType\":\"employee\",\"scopeId\":\"$HA\",\"effectiveFrom\":\"$TODAY\"}"
check "Ngoại lệ cá nhân thiếu lý do → 400" "$(status POST admin/policy-assignments "$HR" "$B")" 400
B="{\"kind\":\"shift\",\"targetId\":\"$SH\",\"scopeType\":\"department\",\"scopeId\":\"$MKT\",\"effectiveFrom\":\"$TODAY\"}"
check "Áp dụng ca cho phòng Marketing" "$(call POST admin/policy-assignments "$HR" "$B" | field data.state)" active
r=$(call GET admin/employees/$HA "$HR")
check "Chi tiết nhân viên cho biết đang theo ca nào, vì sao" "$(echo "$r" | field data.policies.shift.code) · $(echo "$r" | field data.policies.shift.source.scopeName)" "CA9 · Marketing"
check "Nhân viên ngoài phòng vẫn theo ca công ty" "$(call GET admin/employees/$AN "$HR" | field data.policies.shift.code)" HC
check "Mobile nhận ca mới ngay" "$(call GET 'me/attendance/today?installationId=smoke-ha-pixel' "$EMP" | field data.shift.start)" "09:00"
B="{\"start\":\"09:30\",\"end\":\"18:30\",\"effectiveFrom\":\"$NEXTWEEK\"}"
check "Thêm phiên bản ca từ tuần sau" "$(call POST admin/shifts/$SH/versions "$HR" "$B" | field data.next.start)" "09:30"
check "Hôm nay vẫn dùng phiên bản cũ" "$(call GET 'me/attendance/today?installationId=smoke-ha-pixel' "$EMP" | field data.shift.start)" "09:00"

echo "— Chấm công hiện trên bảng HR"
call POST me/attendance/events "$EMP" "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"smoke-ha-pixel\",\"latitude\":10.7760,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}" >/dev/null
call POST me/attendance/events "$EMP" "{\"clientEventId\":\"$(uuid)\",\"kind\":\"in\",\"installationId\":\"smoke-ha-pixel\",\"latitude\":$OFFICE_LAT,\"longitude\":$OFFICE_LNG,\"accuracyM\":8}" >/dev/null
r=$(call GET admin/attendance/board "$HR")
check "Bảng hôm nay: Hà đang trong ca" "$(echo "$r" | py "[x['state'] for x in d['rows'] if x['employee']['code']=='HD0142'][0]")" working
check "Bảng hôm nay: đếm bản ghi bị từ chối" "$(echo "$r" | py "d['summary']['rejected']")" 1
check "Danh sách bị từ chối có lý do ngoài vùng" "$(call GET admin/attendance/rejected "$HR" | py "d[0]['rejectReason']+' · '+d[0]['employee']['code']")" "out_of_range · HD0142"
check "Tổng quan có số liệu thật" "$(call GET admin/overview "$HR" | py "(d['presentToday'], d['rejectedToday'], d['notActivated']>0)")" "(1, 1, True)"
check "Audit thiết bị: duyệt/thu hồi/từ chối" "$(call GET admin/employees/$HA "$HR" | py "all(a in {x['action'] for x in d['audit']} for a in ['device.approved','device.revoked','device.rejected','account.locked','account.unlocked'])")" True
echo "Tất cả bước HR/Admin đều đạt."
