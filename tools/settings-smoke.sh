#!/usr/bin/env bash
# Kiểm thử cài đặt công ty + quy định có tầng (ADR 0001): MFA bắt buộc cho web, thông tin/thương hiệu/liên hệ, lịch lễ,
# điều khoản dữ liệu cá nhân + đồng ý trên mobile, quy định giải trình/tạm ứng/nhắc nhở theo tầng, checklist thiết lập.
# Cần DB vừa `supabase db reset` và API đang chạy (bash tools/dev-backend.sh — có Storage và Mailpit).
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
HA=60000000-0000-4000-8000-000000000142; THAO=60000000-0000-4000-8000-000000000007; HUY=60000000-0000-4000-8000-000000000003
MKT=40000000-0000-4000-8000-000000000005
PNG=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
TODAY=$(today); YESTERDAY=$(today -1); SOON=$(today 20)
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

echo "— Xác thực hai lớp cho web"
HR1=$(activate HD0007 thao.mai@haidang.vn); need "Kích hoạt HR Admin (phiên mật khẩu, aal1)" "$HR1"
check "Chưa MFA: mọi API HR/Admin bị chặn" "$(call GET admin/settings "$HR1" | field error.code)" MFA_REQUIRED
check "Chưa MFA: vẫn xem được trạng thái MFA" "$(call GET admin/mfa "$HR1" | py "(d['required'], d['enrolled'], d['verified'])")" "(True, False, False)"
r=$(call POST admin/mfa/enroll "$HR1")
FID=$(echo "$r" | field data.factorId); SEC=$(echo "$r" | field data.secret)
check "Liên kết: có mã QR + secret" "$(echo "$r" | py "d['qrCode'].startswith('data:image/svg') and len(d['secret'])>=16")" True
B="{\"factorId\":\"$FID\",\"code\":\"000000\"}"
check "Mã sai → 400" "$(call POST admin/mfa/verify "$HR1" "$B" | field error.code)" AUTH_OTP_INVALID
CODE=$(totp "$SEC"); B="{\"factorId\":\"$FID\",\"code\":\"$CODE\"}"
HR=$(call POST admin/mfa/verify "$HR1" "$B" | field data.accessToken)
check "Mã đúng → phiên aal2 dùng được web" "$(call GET admin/me "$HR" | field data.tenant.code)" HDG-001
check "Phiên cũ (aal1) vẫn bị chặn" "$(status GET admin/me "$HR1")" 403
check "Đã liên kết thì không tạo mã QR mới" "$(status POST admin/mfa/enroll "$HR")" 409
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý Lê Quang Huy bật MFA" "$MGR"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant Admin công ty Mẫu B bật MFA" "$TB"

echo "— Thông tin, thương hiệu, liên hệ"
r=$(call GET admin/settings "$HR")
check "HR Admin đọc cài đặt, được sửa" "$(echo "$r" | py "(d['tenant']['code'], d['canManage'], d['platform']['mfaRequired'])")" "('HDG-001', True, True)"
check "Liên hệ HR mẫu" "$(echo "$r" | field data.support.phone)" "028 3822 0142"
check "Quản lý đọc được nhưng không sửa được" "$(call GET admin/settings "$MGR" | field data.canManage)" False
check "Quản lý PATCH cài đặt → 403" "$(status PATCH admin/settings "$MGR" '{"legalName":"X"}')" 403
check "Mã số thuế sai → 400" "$(status PATCH admin/settings "$HR" '{"taxCode":"123"}')" 400
check "Email liên hệ sai → 400" "$(status PATCH admin/settings "$HR" '{"support":{"email":"khong-phai-email"}}')" 400
B='{"legalName":"Công ty Cổ phần Hải Đăng","taxCode":"0312345678","support":{"phone":"028 3822 0199","email":"nhansu@haidang.vn","hours":"8:00–17:30"}}'
r=$(call PATCH admin/settings "$HR" "$B")
check "Lưu tên pháp lý, MST, liên hệ" "$(echo "$r" | py "(d['tenant']['taxCode'], d['support']['phone'], d['support']['email'])")" "('0312345678', '028 3822 0199', 'nhansu@haidang.vn')"
check "Tenant B chỉ thấy cài đặt của mình" "$(call GET admin/settings "$TB" | field data.tenant.code)" MAUB-001
B="{\"dataBase64\":\"$(printf 'khong phai anh' | base64)\"}"
check "File không phải ảnh → 400" "$(status POST admin/settings/branding/logo "$HR" "$B")" 400
B="{\"dataBase64\":\"$PNG\"}"
check "Loại ảnh lạ → 400" "$(status POST admin/settings/branding/banner "$HR" "$B")" 400
LOGO=$(call POST admin/settings/branding/logo "$HR" "$B" | field data.branding.logoVersion)
need "Tải logo lên Storage (phiên bản $LOGO)" "$LOGO"
check "Web lấy được logo (PNG)" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$API/admin/settings/branding/logo" -H "authorization: Bearer $HR")" "200 image/png"
check "Admin tenant B không có logo của A" "$(status GET admin/settings/branding/logo "$TB")" 404
check "Quản lý không tải ảnh được" "$(status POST admin/settings/branding/cover "$MGR" "$B")" 403

echo "— Mobile: thông tin công ty, đồng ý dữ liệu cá nhân"
call POST auth/activate/start "" '{"employeeCode":"HD0142","email":"thao.ha@haidang.vn"}' >/dev/null
CODE=$(otp thao.ha@haidang.vn)
B="{\"email\":\"thao.ha@haidang.vn\",\"code\":\"$CODE\",\"password\":\"$PW\",\"privacyAccepted\":true,\"installationId\":\"smoke-settings\"}"
EMP=$(call POST auth/activate/verify "" "$B" | field data.session.accessToken)
need "Nhân viên kích hoạt, tích đồng ý điều khoản" "$EMP"
r=$(call GET me/company "$EMP")
check "App nhận liên hệ HR từ công ty" "$(echo "$r" | py "d['support']['phone']+' · '+d['support']['email']")" "028 3822 0199 · nhansu@haidang.vn"
check "App nhận phiên bản logo, chưa có ảnh bìa" "$(echo "$r" | py "(d['branding']['logoVersion'], d['branding']['coverVersion'])")" "('$LOGO', None)"
check "Đồng ý lúc kích hoạt được ghi nhận" "$(echo "$r" | py "(d['privacy']['required'], d['privacy']['acceptedVersionNo'])")" "(False, 1)"
check "Lịch nghỉ: quốc gia + riêng công ty" "$(echo "$r" | py "(sum(h['scope']=='national' for h in d['holidays'])>=12, [h['name'] for h in d['holidays'] if h['scope']=='company'])")" "(True, ['Tất niên công ty'])"
check "App tải được logo" "$(curl -s -o /dev/null -w '%{http_code}' "$API/me/company/branding/logo" -H "authorization: Bearer $EMP")" 200
check "Chưa có ảnh bìa → 404 (app dùng ảnh mặc định)" "$(status GET me/company/branding/cover "$EMP")" 404
check "Nhân viên không gọi được API cài đặt" "$(status GET admin/settings "$EMP")" 403
V1=$(echo "$r" | field data.privacy.terms.id)
B='{"title":"Điều khoản xử lý dữ liệu cá nhân","content":"Phiên bản 2: bổ sung mục đích gửi thông báo nhắc chấm công và thời hạn lưu dữ liệu vị trí 24 tháng."}'
check "Quản lý không công bố điều khoản được" "$(status POST admin/privacy/terms "$MGR" "$B")" 403
check "HR công bố điều khoản v2" "$(call POST admin/privacy/terms "$HR" "$B" | field data.current.versionNo)" 2
r=$(call GET me/company "$EMP")
check "App phải hỏi đồng ý lại" "$(echo "$r" | field data.privacy.required)" True
V2=$(echo "$r" | field data.privacy.terms.id)
B="{\"termsId\":\"$V1\"}"
check "Đồng ý bản cũ → 409" "$(call POST me/privacy-consents "$EMP" "$B" | field error.code)" PRIVACY_TERMS_CHANGED
B="{\"termsId\":\"$V2\",\"installationId\":\"smoke-settings\"}"
check "Đồng ý bản mới" "$(call POST me/privacy-consents "$EMP" "$B" | field data.acceptedVersionNo)" 2
check "Đồng ý lại cùng bản không lỗi" "$(status POST me/privacy-consents "$EMP" "$B")" 200
check "Không còn phải hỏi" "$(call GET me/company "$EMP" | field data.privacy.required)" False
r=$(call GET admin/privacy "$HR")
check "HR thấy ai chưa đồng ý bản hiện hành" "$(echo "$r" | py "('HD0142' in [p['code'] for p in d['pending']], 'HD0007' in [p['code'] for p in d['pending']], d['versions'][0]['consents'])")" "(False, True, 1)"
check "Quản lý không xem tình trạng đồng ý (thiếu privacy.read)" "$(status GET admin/privacy "$MGR")" 403

echo "— Lịch nghỉ lễ"
r=$(call GET 'admin/holidays?year=2026' "$HR")
check "Lịch quốc gia 2026 chưa được chuyên gia xác nhận" "$(echo "$r" | py "(d['national']['verified'], d['national']['source'])")" "(False, 'Bộ luật Lao động 2019, Điều 112')"
B="{\"date\":\"$YESTERDAY\",\"name\":\"Nghỉ bù\",\"kind\":\"company\"}"
check "Thêm ngày nghỉ trong quá khứ → 400" "$(status POST admin/holidays "$HR" "$B")" 400
check "Trùng ngày lễ quốc gia → 409" "$(status POST admin/holidays "$HR" '{"date":"2026-12-31","name":"Trùng","kind":"company"}')" 409
B="{\"date\":\"$SOON\",\"name\":\"Ngày hội công ty\",\"kind\":\"company\"}"
check "Quản lý không thêm ngày nghỉ được" "$(status POST admin/holidays "$MGR" "$B")" 403
r=$(call POST admin/holidays "$HR" "$B")
HID=$(echo "$r" | py "[h['id'] for h in d['holidays'] if h['date']=='$SOON'][0]")
need "Thêm ngày nghỉ riêng $SOON" "$HID"
check "App thấy ngày nghỉ mới" "$(call GET me/company "$EMP" | py "'Ngày hội công ty' in [h['name'] for h in d['holidays']]")" True
NID=$(call GET 'admin/holidays?year=2026' "$HR" | py "[h['id'] for h in d['holidays'] if h['scope']=='national'][0]")
check "Không xóa được ngày lễ quốc gia" "$(status POST admin/holidays/$NID/remove "$HR")" 404
check "Tenant B không xóa được ngày nghỉ của A" "$(status POST admin/holidays/$HID/remove "$TB")" 404
check "Xóa ngày nghỉ sắp tới" "$(call POST admin/holidays/$HID/remove "$HR" '{"reason":"Đổi kế hoạch"}' | py "'Ngày hội công ty' in [h['name'] for h in d['holidays']]")" False

echo "— Quy định có tầng/phiên bản"
r=$(call GET admin/rules "$HR")
check "Bộ mẫu: 3 quy định áp dụng toàn công ty" "$(echo "$r" | py "[(x['kind'], x['assignments'][0]['scopeType']) for x in d]")" "[('explanation', 'tenant'), ('salary_advance', 'tenant'), ('reminder', 'tenant')]"
EXP=$(echo "$r" | py "[x['id'] for x in d if x['kind']=='explanation'][0]")
ADV=$(echo "$r" | py "[x['id'] for x in d if x['kind']=='salary_advance'][0]")
check "Nhân viên tra quy định: 3 lượt giải trình, nguồn công ty" "$(call GET me/policies "$EMP" | py "(d['rules']['explanation']['config']['monthlyLimit'], d['rules']['explanation']['source']['scopeType'], d['rules']['salary_advance']['config']['maxPercent'])")" "(3, 'tenant', 30)"
B="{\"config\":{\"monthlyLimit\":99,\"deadlineDays\":3},\"effectiveFrom\":\"$TODAY\"}"
check "Cấu hình sai → 400" "$(status POST admin/rules/$EXP/versions "$HR" "$B")" 400
B="{\"config\":{\"monthlyLimit\":4,\"deadlineDays\":3},\"effectiveFrom\":\"$YESTERDAY\"}"
check "Phiên bản hiệu lực quá khứ → 400" "$(status POST admin/rules/$EXP/versions "$HR" "$B")" 400
B="{\"config\":{\"monthlyLimit\":5,\"deadlineDays\":3},\"effectiveFrom\":\"$(today 1)\",\"note\":\"Tăng lượt từ ngày mai\"}"
check "Phiên bản mới từ ngày mai" "$(call POST admin/rules/$EXP/versions "$HR" "$B" | py "(d['current']['config']['monthlyLimit'], d['next']['config']['monthlyLimit'])")" "(3, 5)"
check "Hôm nay vẫn 3 lượt, ngày mai 5 lượt" "$(call GET me/policies "$EMP" | py "d['rules']['explanation']['config']['monthlyLimit']") $(call GET "me/policies?date=$(today 1)" "$EMP" | py "d['rules']['explanation']['config']['monthlyLimit']")" "3 5"
B="{\"kind\":\"explanation\",\"code\":\"gt-mkt\",\"name\":\"Giải trình khối Marketing\",\"config\":{\"monthlyLimit\":1,\"deadlineDays\":2},\"effectiveFrom\":\"$TODAY\"}"
check "Quản lý không tạo quy định được" "$(status POST admin/rules "$MGR" "$B")" 403
MKTR=$(call POST admin/rules "$HR" "$B" | field data.id)
need "Tạo quy định riêng GT-MKT" "$MKTR"
check "Trùng mã quy định → 409" "$(status POST admin/rules "$HR" "$B")" 409
B="{\"kind\":\"salary_advance\",\"targetId\":\"$MKTR\",\"scopeType\":\"department\",\"scopeId\":\"$MKT\",\"effectiveFrom\":\"$TODAY\"}"
check "Áp dụng sai loại quy định → 404" "$(status POST admin/policy-assignments "$HR" "$B")" 404
B="{\"kind\":\"explanation\",\"targetId\":\"$MKTR\",\"scopeType\":\"department\",\"scopeId\":\"$MKT\",\"effectiveFrom\":\"$TODAY\"}"
check "Quản lý không áp dụng quy định được (thiếu policy.manage)" "$(status POST admin/policy-assignments "$MGR" "$B")" 403
check "Áp dụng GT-MKT cho phòng Marketing" "$(call POST admin/policy-assignments "$HR" "$B" | field data.state)" active
check "Nhân viên Marketing theo quy định của phòng" "$(call GET me/policies "$EMP" | py "(d['rules']['explanation']['config']['monthlyLimit'], d['rules']['explanation']['source']['scopeName'])")" "(1, 'Marketing')"
check "Áp dụng quy định không lẫn vào trang Ca & địa điểm" "$(call GET 'admin/policy-assignments?kind=schedule' "$HR" | py "sorted({a['kind'] for a in d})")" "['shift', 'work_location']"
check "Ngừng quy định tạm ứng" "$(call PATCH admin/rules/$ADV "$HR" '{"active":false}' | field data.active)" False
check "Nhân viên không còn quy định tạm ứng" "$(call GET me/policies "$EMP" | py "'salary_advance' in d['rules']")" False

echo "— Checklist thiết lập, đặt lại MFA"
r=$(call GET admin/settings/checklist "$HR")
check "Bước thông tin công ty đã xong (tên pháp lý + logo + liên hệ)" "$(echo "$r" | py "[s['state'] for s in d['steps'] if s['key']=='company'][0]")" done
check "Cảnh báo chỉ có 1 Tenant Admin" "$(echo "$r" | py "[s['state'] for s in d['steps'] if s['key']=='admins'][0]")" warn
check "Nghỉ phép/workflow chưa có module" "$(echo "$r" | py "sorted(s['key'] for s in d['steps'] if s['state']=='unavailable')")" "['leave', 'workflow']"
check "Không tự đặt lại MFA của mình" "$(status POST admin/employees/$THAO/mfa-reset "$HR" '{"reason":"Mất điện thoại"}')" 403
check "Đặt lại MFA phải có lý do" "$(status POST admin/employees/$HUY/mfa-reset "$HR" '{}')" 400
check "HR đặt lại MFA cho quản lý mất máy" "$(call POST admin/employees/$HUY/mfa-reset "$HR" '{"reason":"Quản lý báo mất điện thoại"}' | field data.removed)" 1
check "Quản lý phải liên kết lại" "$(call GET admin/mfa "$MGR" | field data.enrolled)" False
check "Audit ghi các thay đổi cài đặt" "$(call GET admin/employees/$HUY "$HR" | py "'auth.mfa_reset' in [a['action'] for a in d['audit']]")" True
echo "Tất cả bước cài đặt công ty đều đạt."
