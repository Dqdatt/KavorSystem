#!/usr/bin/env bash
# Tạo chứng chỉ HTTPS tự ký cho máy Mac trong mạng LAN (.cert/cert.pem, .cert/key.pem).
# Trình duyệt iPhone đòi HTTPS mới cấp GPS, camera, Face ID (WebAuthn) và service worker khi không phải localhost.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cert
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -keyout .cert/key.pem -out .cert/cert.pem \
  -subj "/CN=Kavor PWA Dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${IP}"
echo "Đã tạo .cert/cert.pem cho localhost, 127.0.0.1, ${IP}"
echo "Chạy: HTTPS=1 node tools/serve.mjs  →  mở https://${IP}:8090 trên iPhone"
