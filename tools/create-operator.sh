#!/usr/bin/env bash
# Tạo tài khoản nhân viên Kavor cho Kavor Console (Supabase local). Không có màn hình cho việc này: người vận hành đầu tiên
# phải được tạo bằng dòng lệnh, có quyền service role.
#   OPERATOR_PASSWORD='…' bash tools/create-operator.sh email@kavor.vn "Họ tên" [platform_operator|platform_support]
# Mật khẩu đọc từ biến môi trường, không ghi ra file. Lần đầu đăng nhập Console sẽ phải liên kết ứng dụng xác thực.
set -euo pipefail
cd "$(dirname "$0")/.."
EMAIL=${1:?email}; NAME=${2:?họ tên}; ROLE=${3:-platform_operator}
: "${OPERATOR_PASSWORD:?Đặt OPERATOR_PASSWORD}"
URL=${SUPABASE_URL:-http://127.0.0.1:55321}
SRK=${SUPABASE_SERVICE_ROLE_KEY:-$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')}
H=(-H "apikey: $SRK" -H "authorization: Bearer $SRK" -H 'content-type: application/json')
body=$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$EMAIL" "$OPERATOR_PASSWORD")
uid=$(curl -s -X POST "$URL/auth/v1/admin/users" "${H[@]}" -d "$body" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
[ -n "$uid" ] || { echo "Chưa tạo được user (email đã tồn tại hoặc mật khẩu yếu)" >&2; exit 1; }
op=$(python3 -c 'import json,sys; print(json.dumps({"user_id":sys.argv[1],"email":sys.argv[2],"full_name":sys.argv[3],"role":sys.argv[4]}))' "$uid" "$EMAIL" "$NAME" "$ROLE")
curl -s -f -o /dev/null -X POST "$URL/rest/v1/platform_operators" "${H[@]}" -d "$op"
echo "$uid"
