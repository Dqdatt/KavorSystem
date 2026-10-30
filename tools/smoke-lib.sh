# Hàm dùng chung cho các smoke script gọi Kavor API (source từ tools/*-smoke.sh). Cần API + Mailpit đang chạy.
API=${API:-http://localhost:4000/api/v1}
MAIL=${MAIL:-http://127.0.0.1:55324}
PW=${PW:-Kavor2026A}

call() { local m=$1 path=$2 tok=${3:-} body=${4:-}; curl -s -X "$m" "$API/$path" -H 'content-type: application/json' ${tok:+-H "authorization: Bearer $tok"} ${body:+-d "$body"}; }
status() { local m=$1 path=$2 tok=${3:-} body=${4:-}; curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API/$path" -H 'content-type: application/json' ${tok:+-H "authorization: Bearer $tok"} ${body:+-d "$body"}; }
field() { python3 -c "import json,sys; d=json.load(sys.stdin); v=d; [v:=v[k] if isinstance(v,dict) else (v[int(k)] if isinstance(v,list) else None) for k in sys.argv[1].split('.')]; print('' if v is None else v)" "$1"; }
py() { python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print($1)"; }
need() { if [ -n "$2" ]; then echo "✔ $1"; else echo "✘ $1 (không có giá trị)"; exit 1; fi; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; else echo "✘ $1 (được: '$2', cần: '$3')"; exit 1; fi; }
uuid() { python3 -c "import uuid; print(uuid.uuid4())"; }
otp() {
  local id="" i
  for i in $(seq 1 30); do
    id=$(curl -s "$MAIL/api/v1/search?query=to:$1%20subject:%22M%C3%A3%22" | python3 -c "import json,sys; m=json.load(sys.stdin).get('messages') or []; print(m[0]['ID'] if m else '')" 2>/dev/null || true)
    [ -n "$id" ] && break; sleep 0.5
  done
  curl -s "$MAIL/api/v1/message/$id" | python3 -c "import json,sys,re; print(re.search(r'\b(\d{6})\b', json.load(sys.stdin)['Text']).group(1))"
}
activate() { call POST auth/activate/start "" "{\"employeeCode\":\"$1\",\"email\":\"$2\"}" >/dev/null; local code; code=$(otp "$2"); call POST auth/activate/verify "" "{\"email\":\"$2\",\"code\":\"$code\",\"password\":\"$PW\",\"privacyAccepted\":true}" | field data.session.accessToken; }
today() { python3 -c "import datetime,zoneinfo; print((datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Ho_Chi_Minh'))+datetime.timedelta(days=int('${1:-0}'))).date())"; }

# Mã TOTP hiện tại (RFC 6238, 30 giây, 6 số) từ secret base32 — như ứng dụng xác thực trên điện thoại
totp() { python3 -c "import base64,hmac,hashlib,struct,time,sys; s=sys.argv[1]; k=base64.b32decode(s+'='*(-len(s)%8)); h=hmac.new(k,struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest(); o=h[-1]&15; print('%06d'%((struct.unpack('>I',h[o:o+4])[0]&0x7fffffff)%1000000))" "$1"; }
# Liên kết ứng dụng xác thực cho tài khoản web rồi nhập mã → in access token aal2. $2: admin (web HR) hoặc console
mfa() {
  local r fid sec code body p=${2:-admin}
  r=$(call POST "$p/mfa/enroll" "$1")
  fid=$(echo "$r" | field data.factorId); sec=$(echo "$r" | field data.secret); code=$(totp "$sec")
  body="{\"factorId\":\"$fid\",\"code\":\"$code\"}"
  call POST "$p/mfa/verify" "$1" "$body" | field data.accessToken
}
