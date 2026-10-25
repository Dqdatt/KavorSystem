#!/usr/bin/env bash
# Kiểm tra toàn bộ dự án bằng một lệnh — chạy trước khi báo "xong" và trước mỗi commit/bàn giao.
#   bash tools/verify-all.sh          # đầy đủ: typecheck, unit test, pgTAP, mọi smoke (mỗi smoke trên DB vừa reset), build, lint DB
#   bash tools/verify-all.sh --quick  # nhanh: typecheck, unit test, pgTAP (không reset DB, không smoke)
# Cần: Docker + Supabase local đang chạy, API đang chạy (bash tools/dev-backend.sh) cho phần smoke.
# Bản đầy đủ RESET DB nhiều lần (mất dữ liệu đang thử trên iPhone) và mất khoảng 10–15 phút.
# Kết quả chi tiết: $TMPDIR/kavor-verify.log. Thoát mã 0 khi tất cả đạt.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="${TMPDIR:-/tmp}/kavor-verify.log"; : > "$LOG"
FAIL=0
step() { printf '%-44s' "$1"; }
ok() { echo "✔"; }
bad() { echo "✘  (xem $LOG)"; FAIL=1; }

step "Typecheck (mọi package)"; if pnpm -s typecheck >>"$LOG" 2>&1; then ok; else bad; fi
step "Unit test"; if pnpm -s test >>"$LOG" 2>&1; then ok; else bad; fi
# supabase test db có thể trả mã lỗi do telemetry (PostHog timeout) dù test đạt → đọc dòng "Result:"
step "pgTAP (supabase test db)"; OUT=$(supabase test db 2>&1); echo "$OUT" >>"$LOG"
if echo "$OUT" | grep -q "^Result: PASS"; then echo "✔  $(echo "$OUT" | grep -o 'Tests=[0-9]*')"; else bad; fi

if [ "${1:-}" != "--quick" ]; then
  if ! curl -s -o /dev/null --max-time 3 http://127.0.0.1:4000/api/v1/health; then
    echo "API chưa chạy (http://127.0.0.1:4000). Chạy: bash tools/dev-backend.sh — rồi chạy lại." >&2; exit 1
  fi
  for s in tools/*-smoke.sh; do
    name=$(basename "$s" -smoke.sh)
    step "Smoke $name (DB vừa reset)"
    OUT=""; if bash tools/db-reset.sh >>"$LOG" 2>&1 && OUT=$(bash "$s" 2>&1); then echo "✔  $(echo "$OUT" | grep -c '✔') bước"; else bad; fi
    echo "$OUT" >>"$LOG"
  done
  bash tools/db-reset.sh >>"$LOG" 2>&1
  step "Build"; if pnpm -s build >>"$LOG" 2>&1; then ok; else bad; fi
  # Lint cần gỡ extension pgtap do test để lại
  docker exec supabase_db_kavor-system psql -U postgres -c "drop extension if exists pgtap" >/dev/null 2>&1
  step "Lint DB (supabase db lint)"; LINT=$(supabase db lint 2>&1); echo "$LINT" >>"$LOG"
  # Cảnh báo đã biết: grant_tenant_admin có tham số p_actor chưa dùng (level "warning extra")
  if echo "$LINT" | grep -q '"level":"error"'; then bad; else ok; fi
fi

if [ $FAIL = 0 ]; then echo "TẤT CẢ ĐẠT"; else echo "CÓ BƯỚC LỖI — xem $LOG"; fi
exit $FAIL
