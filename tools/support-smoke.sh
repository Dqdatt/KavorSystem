#!/usr/bin/env bash
# Support access có thời hạn (docs/plans/console-ops.md phần B): Kavor yêu cầu → Tenant Admin duyệt trên web HR → xem chỉ đọc theo phạm vi
# → thu hồi / kết thúc / hết hạn. Cần DB vừa reset (bash tools/db-reset.sh) và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
pw() { python3 -c "import secrets; print('Kv' + secrets.token_urlsafe(12) + '9')"; }
clogin() { local b="{\"email\":\"$1\",\"password\":\"$2\"}"; call POST console/auth/login "" "$b" | field data.session.accessToken; }
HDG=10000000-0000-4000-8000-000000000001; TB_ID=10000000-0000-4000-8000-000000000002
curl -s -X DELETE "$MAIL/api/v1/messages" >/dev/null

P1=$(pw); P2=$(pw)
OPERATOR_PASSWORD=$P1 bash "$(dirname "$0")/create-operator.sh" sup.duy@kavor.test "Nguyễn Duy" platform_support >/dev/null
OPERATOR_PASSWORD=$P2 bash "$(dirname "$0")/create-operator.sh" sup.vy@kavor.test "Trần Vy" platform_support >/dev/null
DUY=$(mfa "$(clogin sup.duy@kavor.test "$P1")" console); need "Kỹ sư hỗ trợ 1 đăng nhập + MFA" "$DUY"
VY=$(mfa "$(clogin sup.vy@kavor.test "$P2")" console); need "Kỹ sư hỗ trợ 2 đăng nhập + MFA" "$VY"
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "Tenant Admin Hải Đăng bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý (không phải Tenant Admin) bật MFA" "$MGR"
TB=$(mfa "$(activate BX0001 admin@maub.test)"); need "Tenant Admin công ty Mẫu B bật MFA" "$TB"
req() { echo "{\"tenantId\":\"$HDG\",\"ticket\":\"$1\",\"reason\":\"Khách báo không xem được ca làm việc trên app\",\"scopes\":$2,\"minutes\":$3}"; }

echo "— Kavor gửi yêu cầu"
check "Phạm vi ngoài danh sách → 400" "$(status POST console/support "$DUY" "$(req T-1 '["payroll"]' 30)")" 400
check "Thời hạn 45 phút → 400" "$(status POST console/support "$DUY" "$(req T-1 '["settings"]' 45)")" 400
R=$(call POST console/support "$DUY" "$(req SUP-101 '["settings","directory"]' 60)")
S1=$(echo "$R" | field data.id); need "Gửi yêu cầu SUP-101" "$S1"
check "Chờ tenant duyệt, chưa có thời hạn" "$(echo "$R" | py "(d['status'], d['expiresAt'], d['scopes'], d['minutes'])")" "('pending', None, ['settings', 'directory'], 60)"
check "Gửi trùng khi đang chờ → 409" "$(status POST console/support "$DUY" "$(req SUP-102 '["audit"]' 30)")" 409
check "Chưa duyệt: không xem được" "$(call GET "console/support/$S1/view/settings" "$DUY" | field error.code)" SUPPORT_SESSION_INACTIVE

echo "— Tenant duyệt trên web HR"
check "Tenant Admin thấy banner có 1 yêu cầu chờ" "$(call GET admin/support/banner "$HR" | py "(d['canApprove'], d['pending'], d['active'])")" "(True, 1, [])"
check "Quản lý không thấy số chờ duyệt, không có quyền duyệt" "$(call GET admin/support/banner "$MGR" | py "(d['canApprove'], d['pending'])")" "(False, 0)"
check "Quản lý duyệt → 403" "$(status POST "admin/support/$S1/approve" "$MGR" '{}')" 403
check "Tenant khác không thấy, không duyệt được" "$(call GET admin/support "$TB" | py "len(d)"):$(status POST "admin/support/$S1/approve" "$TB" '{}')" "0:404"
check "Từ chối phải ghi lý do → 400" "$(status POST "admin/support/$S1/reject" "$HR" '{}')" 400
R=$(call POST "admin/support/$S1/approve" "$HR" '{"note":"Đồng ý, chỉ xem cấu hình"}')
check "Duyệt: hiệu lực ngay, đúng 60 phút" "$(echo "$R" | py "(d['status'], round((__import__('datetime').datetime.fromisoformat(d['expiresAt']) - __import__('datetime').datetime.fromisoformat(d['startsAt'])).total_seconds()/60), d['decidedBy'])")" "('active', 60, 'Mai Phương Thảo')"
check "Mọi người dùng web HR thấy banner phiên đang hỗ trợ" "$(call GET admin/support/banner "$MGR" | py "(len(d['active']), d['active'][0]['operator'])")" "(1, 'Nguyễn Duy (Kavor)')"

echo "— Kavor xem chỉ đọc theo phạm vi"
V=$(call GET "console/support/$S1/view/settings" "$DUY")
check "Cấu hình công ty: gói, quy định, luồng duyệt, ca, vai trò" "$(echo "$V" | py "(d['data']['tenant']['code'], len(d['data']['rules']) > 0, len(d['data']['workflows']) > 0, len(d['data']['shifts']) > 0, 'tenant_admin' in [r['code'] for r in d['data']['roles']])")" "('HDG-001', True, True, True, True)"
D=$(call GET "console/support/$S1/view/directory" "$DUY")
check "Danh sách nhân sự chỉ có trường tối thiểu" "$(echo "$D" | py "sorted([r for r in d['data'] if r['code']=='HD0142'][0].keys())")" "['account', 'code', 'department', 'fullName', 'position', 'status']"
check "Không lộ điện thoại, email, lương" "$(echo "$V$D" | grep -cE '0912345468|thao\.ha@haidang\.vn|base_?[sS]alary|15000000')" 0
check "Phạm vi không được duyệt (audit) → 403" "$(status GET "console/support/$S1/view/audit" "$DUY")" 403
check "Kỹ sư khác không dùng được phiên này → 403" "$(status GET "console/support/$S1/view/settings" "$VY")" 403
check "Mỗi lần xem ghi audit tenant thấy" "$(sql "select count(*) from public.audit_logs where tenant_id='$HDG' and action='support.viewed' and actor_type='platform'")" 2

echo "— Thu hồi, hủy, kết thúc, hết hạn"
check "Tenant Admin thu hồi" "$(call POST "admin/support/$S1/revoke" "$HR" '{}' | py "d['status']")" revoked
check "Thu hồi: mất quyền ngay" "$(call GET "console/support/$S1/view/settings" "$DUY" | field error.code)" SUPPORT_SESSION_INACTIVE
check "Banner không còn phiên" "$(call GET admin/support/banner "$MGR" | py "len(d['active'])")" 0
S2=$(call POST console/support "$VY" "$(req SUP-201 '["audit"]' 30)" | field data.id)
check "Người khác không hủy hộ được → 403" "$(status POST "console/support/$S2/close" "$DUY" '{}')" 403
check "Người yêu cầu hủy yêu cầu đang chờ" "$(call POST "console/support/$S2/close" "$VY" '{}' | py "d['status']")" cancelled
S3=$(call POST console/support "$VY" "$(req SUP-202 '["audit"]' 30)" | field data.id)
call POST "admin/support/$S3/approve" "$HR" '{}' >/dev/null
A=$(call GET "console/support/$S3/view/audit" "$VY")
check "Nhật ký 30 ngày: có thao tác duyệt của Tenant Admin, không có dữ liệu trước/sau" "$(echo "$A" | py "(any(r['action']=='support.approved' and r['actor']=='Mai Phương Thảo' for r in d['data']), sorted(d['data'][0].keys()))")" "(True, ['action', 'actor', 'at', 'resourceType'])"
check "Kỹ sư kết thúc phiên sớm" "$(call POST "console/support/$S3/close" "$VY" '{}' | py "d['status']")" ended
S4=$(call POST console/support "$VY" "$(req SUP-203 '["settings"]' 30)" | field data.id)
call POST "admin/support/$S4/approve" "$HR" '{}' >/dev/null
sql "alter table public.support_access_sessions disable trigger support_access_guard; update public.support_access_sessions set starts_at = now() - interval '31 minutes', expires_at = now() - interval '1 minute' where id = '$S4'; alter table public.support_access_sessions enable trigger support_access_guard;"
check "Hết thời hạn: mất quyền" "$(call GET "console/support/$S4/view/settings" "$VY" | field error.code)" SUPPORT_SESSION_INACTIVE
check "Console hiện đúng trạng thái các phiên" "$(call GET console/support "$VY" | py "sorted((s['ticket'], s['status'], s['mine']) for s in d)")" \
  "[('SUP-101', 'revoked', False), ('SUP-201', 'cancelled', True), ('SUP-202', 'ended', True), ('SUP-203', 'expired', True)]"
check "Thu hồi phiên đã hết hạn → 409" "$(status POST "admin/support/$S4/revoke" "$HR" '{}')" 409
_s1=$(sql "update public.tenants set status='suspended' where id='$TB_ID'"; status POST console/support "$DUY" "{\"tenantId\":\"$TB_ID\",\"ticket\":\"SUP-301\",\"reason\":\"Kiểm tra tenant đang khóa\",\"scopes\":[\"settings\"],\"minutes\":30}") || :
check "Tenant tạm khóa thì không gửi yêu cầu được" "$_s1" 409
check "Audit đủ vòng đời" "$(sql "select string_agg(distinct action, ',' order by action) from public.audit_logs where tenant_id='$HDG' and action like 'support.%'")" \
  "support.approved,support.cancelled,support.ended,support.requested,support.revoked,support.viewed"
echo "Tất cả bước support access đều đạt."
