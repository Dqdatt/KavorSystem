# HANDOFF — 16/11/2026 (phiên 14)

**Mục tiêu phiên vừa rồi:** tìm và xử lý "lỗi 403 trang Tổng quan" trên web online.

## Đã xong
- `/batdau`: CLAUDE.md + TASKS.md đã đủ, không đổi. HANDOFF.md vẫn commit (không gitignore).
- "403 Tổng quan" KHÔNG phải lỗi: là `POST /api/auth/login` trả 403 `MFA_REQUIRED` cố ý (`api/auth/_shared.ts` → trang login chuyển bước nhập mã).
  Mọi tài khoản web bắt buộc MFA nên mỗi lần đăng nhập console có một dòng 403. Đã ghi vào AGENTS.md mục Cạm bẫy.
  Kiểm online (chỉ xem): mọi request trang Tổng quan trả 200, Realtime kết nối được trên cloud.
- `b7901fc` (đã push, Vercel đã lên): nhãn Realtime lúc mới mở là "Đang kết nối…" thay vì "Mất kết nối cập nhật"
  (`_lib/client.ts` cờ `known`, `(app)/shell.tsx`). Đã thấy trên online: "Đang kết nối…" → "Đang cập nhật trực tiếp".
- verify-all --quick đạt (pgTAP 656).

## Đang dở
- Không có việc code dở. Chỉ còn `docs/plans/roadmap-competitive.md` chưa track — người dùng chưa quyết (không commit).
- iPhone 11 vẫn chạy bản có `f39d263`, CHƯA có `ef972be` (sửa nhãn Tạm ứng + màn E19).
- Simulator iPhone 17e cài bản Release trỏ **API local** (`ios/build-sim`), đăng nhập HD0142. DB local: HD0142 có máy giả `fake-iphone-11-local` (revoked) + máy simulator active.
- Lúc push, Render deploy lại API → vài giây `overview`/`settings/checklist` trả 502 rồi tự hết (bình thường khi Render đổi bản).

## Quyết định đã chốt
- Không đổi mã 403 của bước MFA (luồng đăng nhập là vùng nhạy cảm, lợi ích chỉ là bớt một dòng console).
- Push nhánh deploy sau khi verify-all đạt: người dùng đồng ý cho commit phiên này.
- Dữ liệu online là thật: chỉ xem; duyệt thiết bị online người dùng tự bấm. Test thao tác ghi thì dùng DB local.

## Nợ Ponytail
- Không có `shortcut:` mới. Nợ cũ: `apps/api/src/timesheet/pause.ts` (50% theo ngày lịch, nghỉ ốm không cộng đơn lẻ).

## Việc tiếp theo
1. ~~"Xem số tài khoản"~~ xong (16/11, chưa deploy: chạy migration `202612070001` lên cloud bằng `tools/cloud-supabase.sh` rồi mới push)
1b. CCCD/sổ BHXH hở qua RLS `employee_profiles` (xem TASKS) — `[opus xhigh]`
2. (Khi tiện) build lại bản iPhone thật có `ef972be` rồi cài qua cáp (lệnh trong PROGRESS "Cài bản mới lên iPhone") — `[sonnet]`
3. Thời hạn thử việc trong hồ sơ → "hết thử việc" ở khối Sắp tới — `[opus high]`

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (mục phân quyền + Cạm bẫy)
- `apps/api/src/admin/` (employees service), `supabase/migrations/` (quyền `employee.sensitive.read`)
