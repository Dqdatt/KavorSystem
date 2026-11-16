# HANDOFF — 16/11/2026 (phiên 12)

**Mục tiêu phiên vừa rồi:** deploy "HR điều chỉnh công" (8cf718b) lên bản online, kiểm, build lại app và test trên simulator.

## Đã xong
- verify-all --quick đạt (pgTAP 656). Migration `202612060001` đã lên Supabase cloud (`supabase db push --linked`; config Auth không đổi từ 23/10 nên không cần `cloud-supabase.sh`).
- Push `0801ea6` → Render/Vercel đã deploy. Kiểm online chỉ xem: route adjust trả 401; quyền `attendance.adjust` = Nhân sự vận hành + Quản trị viên công ty;
  ngăn kéo chấm công TSNV002 có nút bút, 04/11 ghi "HR điều chỉnh" 08:23–19:51.
- Simulator iPhone 17e (bản Release, API online) đăng nhập TSNV002: trang chủ, Bảng công, chi tiết 04/11 "HR đã điều chỉnh" + lý do đều đúng.
- `f39d263` (chưa push): mobile đếm "Đi muộn" khớp web — trước đó app bỏ mọi ngày có giải trình (kể cả giải trình giờ ra) → 1 thay vì 3.

## Đang dở
- **iPhone 11 thật của TSNV002 đã bị THU HỒI** (16/11 16:14) khi người dùng duyệt máy simulator (mỗi NV 1 máy active). Lần cài tới iPhone sẽ chờ HR duyệt.
- Bản build iPhone thật `apps/mobile/ios/build-device` là bản TRƯỚC `f39d263`, chưa cài (devicectl báo iPhone "Dqdatt" unavailable — chưa cắm cáp/chưa Tin cậy).
- PIN thử trên simulator chỉ nằm trong keychain simulator (không lên máy chủ); xóa app simulator là mất.
- Lỗi 403 Tổng quan web online vẫn chưa rõ nguồn. `docs/plans/roadmap-competitive.md` chưa track, người dùng chưa quyết (không commit).

## Quyết định đã chốt
- Đếm đi muộn: mọi ngày có phút muộn (như `summarize()` API); giải trình không xóa muộn, chỉ điều chỉnh giờ vào mới hết muộn.
- Dữ liệu online là thật: chỉ xem; ghi DB online phải hỏi trước (người dùng đã duyệt riêng migration 202612060001). Mật khẩu online người dùng tự gõ.
- Các quyết định HR điều chỉnh công / vào-nghỉ giữa kỳ / giờ ra ≤ giờ vào: giữ như AGENTS.md.

## Nợ Ponytail
- Không có `shortcut:` mới. Nợ cũ: `apps/api/src/timesheet/pause.ts` (50% theo ngày lịch, nghỉ ốm không cộng đơn lẻ).

## Việc tiếp theo
1. Cài app iPhone thật: build lại bản device (có `f39d263`, lệnh trong PROGRESS "Cài bản mới lên iPhone"), cắm cáp, cài; HR duyệt lại iPhone 11 trên web
   (Chấm công → Thiết bị) — duyệt iPhone sẽ tự thu hồi simulator. Có thể push `f39d263` cùng lúc (chỉ đổi mobile) — `[sonnet]`
2. Hai lệch mobile thấy khi test: trang Tạm ứng dòng người duyệt không có nhãn; màn "Đang chờ HR xử lý" hiện dữ liệu không khớp
   ("iPhone 15", 08:03, Mai Phương Thảo, E19) và "Làm mới trạng thái" không đổi gì — nghi còn dữ liệu mẫu — `[opus high]`
3. Lỗi 403 Tổng quan web online, rồi việc mở trong `docs/TASKS.md` ("Xem số tài khoản" `[opus xhigh]`) — `[opus high]`

## File cần đọc đầu tiên
- `docs/TASKS.md`, `PROGRESS.md` (mục "Cài bản mới lên iPhone")
- `apps/mobile/src/screens/attendance.tsx` (lệch 2 nằm gần đây: tìm "Đang chờ HR xử lý", "Hạn nhận đơn")
