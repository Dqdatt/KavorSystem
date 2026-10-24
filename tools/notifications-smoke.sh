#!/usr/bin/env bash
# Kiểm thử thông báo trong app: đơn mới báo quản lý, bước HR tới lượt báo HR (web), kết quả báo người gửi (duyệt/từ chối kèm lý do),
# thông báo "cần duyệt" hết tác dụng khi bước đã xử lý, máy mới được duyệt báo nhân viên, đánh dấu đã đọc (một/tất cả), chỉ thấy của mình.
# Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy (bash tools/dev-backend.sh).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null
EMP=$(activate HD0142 thao.ha@haidang.vn); need "Nhân viên Trần Thu Hà kích hoạt" "$EMP"
MGR=$(activate HDG0003 huy.le@example.test); need "Quản lý Lê Quang Huy kích hoạt" "$MGR"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"

echo "— Đơn mới → báo quản lý"
check "Chưa có thông báo" "$(call GET me/notifications "$MGR" | py "(len(d['items']), d['unread'])")" "(0, 0)"
r=$(call GET me/timesheet "$EMP")
OUTDAY=$(echo "$r" | py "[x['date'] for x in d['days'] if x['issue']=='missing_out' and x['canExplain']][0]")
LATEDAY=$(echo "$r" | py "[x['date'] for x in d['days'] if x['issue']=='late' and x['canExplain']][0]")
B="{\"workDate\":\"$OUTDAY\",\"kind\":\"missing_out\",\"clockOut\":\"17:00\",\"reason\":\"Họp khách tới 17:00, quên chấm ra\"}"
r=$(call POST me/requests/explanations "$EMP" "$B"); NO=$(echo "$r" | field data.no); T1=$(echo "$r" | field data.steps.0.taskId)
r=$(call GET me/notifications "$MGR")
check "Quản lý nhận \"$NO cần bạn duyệt\", bấm vào được để duyệt" "$(echo "$r" | py "(d['unread'], d['items'][0]['kind'], d['items'][0]['title'], d['items'][0]['link']['no'], d['items'][0]['actionable'])")" "(1, 'approval.pending', 'Đơn $NO cần bạn duyệt', '$NO', True)"
check "Nội dung có người gửi + loại giải trình" "$(echo "$r" | py "d['items'][0]['body'].startswith('Trần Thu Hà · Giải trình công') and 'quên chấm ra' in d['items'][0]['body']")" True
check "Người gửi không nhận thông báo duyệt" "$(call GET me/notifications "$EMP" | py "d['unread']")" 0
check "HR chưa nhận khi bước quản lý chưa xong" "$(call GET admin/notifications "$HR" | py "d['unread']")" 0

echo "— Quản lý duyệt → báo HR; HR duyệt → báo người gửi"
call POST "me/approvals/$T1/approve" "$MGR" '{}' >/dev/null
check "Thông báo của quản lý hết tác dụng sau khi duyệt" "$(call GET me/notifications "$MGR" | py "d['items'][0]['actionable']")" False
r=$(call GET admin/notifications "$HR")
check "HR nhận trên web" "$(echo "$r" | py "(d['unread'], d['items'][0]['title'], d['items'][0]['actionable'])")" "(1, 'Đơn $NO cần bạn duyệt', True)"
T2=$(call GET "admin/requests?status=pending" "$HR" | py "[i['myTaskId'] for i in d['items'] if i['no']=='$NO'][0]")
call POST "admin/approvals/$T2/approve" "$HR" '{}' >/dev/null
r=$(call GET me/notifications "$EMP")
check "Người gửi nhận \"đã được duyệt\" kèm người duyệt" "$(echo "$r" | py "(d['unread'], d['items'][0]['kind'], d['items'][0]['title'], 'Mai Phương Thảo duyệt' in d['items'][0]['body'])")" "(1, 'request.approved', 'Đơn $NO đã được duyệt', True)"

echo "— Từ chối"
B="{\"workDate\":\"$LATEDAY\",\"kind\":\"late\",\"clockIn\":\"08:00\",\"reason\":\"Kẹt xe do tai nạn trên cầu\"}"
r=$(call POST me/requests/explanations "$EMP" "$B"); NO2=$(echo "$r" | field data.no); T3=$(echo "$r" | field data.steps.0.taskId)
call POST "me/approvals/$T3/reject" "$MGR" '{"comment":"Không có minh chứng"}' >/dev/null
check "Người gửi nhận \"bị từ chối\" kèm lý do" "$(call GET me/notifications "$EMP" | py "(d['items'][0]['title'], d['items'][0]['body'])")" "('Đơn $NO2 bị từ chối', 'Lê Quang Huy: Không có minh chứng')"

echo "— Máy mới được duyệt"
call POST me/devices "$EMP" '{"installationId":"smoke-notif-iphone","platform":"ios","deviceModel":"iPhone 11"}' >/dev/null
PIX=$(call POST me/devices "$EMP" '{"installationId":"smoke-notif-pixel","platform":"android","deviceModel":"Pixel 6"}' | field data.id)
call POST "admin/devices/$PIX/approve" "$HR" >/dev/null
check "Nhân viên nhận \"Máy đã được duyệt\"" "$(call GET me/notifications "$EMP" | py "(d['items'][0]['kind'], d['items'][0]['body'])")" "('device.approved', 'Pixel 6 dùng được để chấm công từ bây giờ.')"

echo "— Đã đọc"
r=$(call GET me/notifications "$EMP"); ONE=$(echo "$r" | field data.items.0.id)
check "Nhân viên có 3 thông báo chưa đọc" "$(echo "$r" | py "d['unread']")" 3
check "Mã thông báo sai → 400" "$(status POST me/notifications/read "$EMP" '{"ids":["x"]}')" 400
check "Không đánh dấu được thông báo của người khác" "$(call POST me/notifications/read "$MGR" "{\"ids\":[\"$ONE\"]}" >/dev/null; call GET me/notifications "$EMP" | py "d['unread']")" 3
check "Đánh dấu một thông báo" "$(call POST me/notifications/read "$EMP" "{\"ids\":[\"$ONE\"]}" | py "(d['unread'], d['items'][0]['readAt'] is not None)")" "(2, True)"
check "Đánh dấu tất cả" "$(call POST me/notifications/read "$EMP" '{}' | py "d['unread']")" 0
check "Web HR đánh dấu đã đọc" "$(call POST admin/notifications/read "$HR" '{}' | py "d['unread']")" 0
check "Cần đăng nhập" "$(status GET me/notifications)" 401
echo "Tất cả bước thông báo đều đạt."
