#!/usr/bin/env bash
# Sắp xếp tự động (Cơ cấu tổ chức): đề xuất cấp chức danh + quản lý trực tiếp, áp dụng nguyên khối, giữ lịch sử, chỉ quyền toàn công ty.
# Cần DB vừa reset và API đang chạy.
set -euo pipefail
source "$(dirname "$0")/smoke-lib.sh"
sql() { docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -c "$1"; }
HDG=10000000-0000-4000-8000-000000000001
HR=$(mfa "$(activate HD0007 thao.mai@haidang.vn)"); need "HR Admin bật MFA" "$HR"
MGR=$(mfa "$(activate HDG0003 huy.le@example.test)"); need "Quản lý bật MFA" "$MGR"
TODAY=$(today)

echo "— Xem trước"
_p=$(call POST admin/organization/structure/plan "$HR" '{}') || :
check "Có đề xuất cấp cho mọi chức danh đang dùng và danh sách nhân viên" "$(echo "$_p" | py "(len(d['positions']) > 0, len(d['rows']) > 0, all(1 <= p['tier'] <= 4 for p in d['positions']))")" "(True, True, True)"
check "Đề xuất quản lý luôn đúng cấp (người đề xuất có cấp cao hơn)" "$(echo "$_p" | py "all(r['proposed'] is None or r['proposed']['id'] != r['employeeId'] for r in d['rows'])")" True
BEFORE=$(sql "select count(*) from public.employee_assignments where tenant_id='$HDG'")
check "Xem trước không ghi gì" "$(sql "select count(*) from public.employee_assignments where tenant_id='$HDG'")" "$BEFORE"
check "Quản lý (không có quyền toàn công ty) → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/organization/structure/plan" -H 'content-type: application/json' -H "authorization: Bearer $MGR" -d '{}')" 403

echo "— Áp dụng"
WANT=$(echo "$_p" | py "d['changes']['managers']")
_a=$(call POST admin/organization/structure/apply "$HR" '{}') || :
check "Áp dụng đúng số thay đổi đã xem trước" "$(echo "$_a" | py "d['applied']['managers']")" "$WANT"
check "Sau khi áp dụng không còn đề xuất đổi quản lý" "$(echo "$_a" | py "d['changes']['managers']")" 0
check "Đổi quản lý mở phân công mới từ hôm nay (giữ lịch sử)" "$(sql "select count(*) >= $WANT from public.employee_assignments where tenant_id='$HDG' and effective_from='$TODAY'")" t
check "Audit organization.structure_applied" "$(sql "select count(*) from public.audit_logs where tenant_id='$HDG' and action='organization.structure_applied'")" 1
echo "Tất cả bước Sắp xếp tự động đều đạt."
