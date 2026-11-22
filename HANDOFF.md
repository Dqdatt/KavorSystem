# HANDOFF — 22/11/2026 (phiên 25: feedback PWA iPhone — push, chữ thông báo, cuộn/bánh xe giờ)

**Mục tiêu phiên vừa rồi:** sửa các lỗi người dùng gặp khi dùng PWA nhân viên trên iPhone thật (push, chữ thông báo, chọn ngày/giờ).

## Đã xong (đều đã deploy; migration đã lên cloud)
- Web Push cho PWA: `202612130001_web_push.sql`, `apps/api/src/push/push.service.ts` (urgency high, rút hàng đợi 5 giây/lần), Render có `API_VAPID_*`; push tới iPhone thật OK.
- Chữ thông báo viết lại, không "·", không số tiền: `202612140001_notification_text.sql`, `202612140002_notification_text_pay.sql` (`01bec45`).
- Bản tin quan trọng có tiêu đề "❗ <tên>": `202612150001_announcement_important_icon.sql`. Shim `ScrollView` PWA (`experiments/kavor-pwa/shims/react-native.ts`, `scroll-snap.ts`): dải ngày cuộn được, bánh xe giờ tự khớp số (`4524419`).
- UI OTP, quyền vị trí iOS, `IS_IOS` trong `apps/mobile/src/os.ts` (`93647b4`). Commit `07b1be1` (HANDOFF) chưa push.

## Tiến độ phiên 26 (22/11, chưa commit)
- Bước 1 XONG: `202612160001_announcement_teaser_plain.sql` (hàm mới `announcement_plain_text` + `announcement_teaser` không tiền tố, cắt 90 ký tự ở ranh giới từ);
  pgTAP `notification_text` 12 test đạt; smoke bản tin chờ body "Áp dụng từ tuần sau. Ý một. Ý hai". Migration đã áp local, CHƯA lên cloud.
- Bước 2 XONG: `giao` 005 (icon push) đã duyệt, gộp `2ff1371`. Bước 3 XONG (sửa tay 1 dòng `notify.ts`).
- verify-all đầy đủ trên API 4100: đạt hết trừ smoke `requests`/`settings` lỗi giả bước MFA (máy tải nặng); chạy riêng lại → đạt.
- Migration `202612160001` ĐÃ LÊN CLOUD (22/11, qua `supabase db query --linked`, người dùng đồng ý); kiểm lại: có trong schema_migrations, hàm chạy đúng, anon/authenticated không gọi được.
- Đã commit + push `bf902b4` (deploy Render + Vercel đạt; Vercel `kavorsystem-mobile` lỗi sẵn từ trước).
- Người dùng thử iPhone: bài có danh sách bị dính một dòng ("THÔNG BÁO 1. … 2. …") → chọn "mỗi mục một dòng, giữ số/chấm".
  Migration `202612170001_announcement_teaser_lists.sql` (pgTAP 725, smoke announcements + notifications đạt) ĐÃ LÊN CLOUD, đã commit + push. Chờ người dùng thử lại trên iPhone (chưa rõ iOS có hiện xuống dòng trong push web).

## Đang dở — bố cục push màn hình khóa "Gọn + icon" (người dùng ĐÃ CHỐT 22/11)
Ảnh iPhone: bản tin hiện `**` thô, tiền tố "Phòng Nhân sự:", dài 4 dòng → cao gấp đôi thông báo app khác.
1. Migration mới `create or replace public.announcement_teaser` (gốc ở `202612140001`): bỏ ký hiệu định dạng theo `parseAnnouncement`/`announcementPlainText`
   (`packages/contracts/src/index.ts`; lối thoát `\` xem `escText`/`escLineStart` ở `apps/admin-web/app/_ui/rich-text.tsx`): `**` `*` `++`, đầu dòng `- • * + 1. 1) # >`,
   dòng `---`/`___`. BỎ `author_label || ': '`. Cắt ~90 ký tự ở ranh giới từ + "…". Bài trống giữ "X đăng thông báo mới".
   Sửa theo: pgTAP `notification_text`, `announcements`, `reminders`; smoke `tools/announcements-smoke.sh` (đang chờ body có "Phòng Nhân sự: … - Ý một - Ý hai").
2. `push.service.ts` hàm `payload()`: icon đầu tiêu đề theo `r.kind`, CHỈ trong push (DB/app giữ nguyên; app có `NOTIF_ICON` ở `screens/profile.tsx`):
   approval.pending 📝, approval.due ⏰, request.approved ✅, request.rejected ❌, device.* 📱, advance.paid 💵, payslip.published 💰,
   announcement.published + reminder.announcement 📢 (tiêu đề đã có "❗" thì thôi), attendance.adjusted 🕘, reminder.attendance ⏰, reminder.documents 📄. Thêm test nhỏ.
3. `apps/mobile/src/notify.ts` nhắc hạn giải trình còn `· còn x/y lượt` → viết thành câu ("Còn 2/3 lượt giải trình.").
Sau đó: verify-all trên API 4100, người dùng chạy `tools/cloud-supabase.sh`, push khi người dùng bảo.

## Quyết định đã chốt (đừng hỏi lại)
- "from Kavor" do iOS tự thêm cho push của web app, không bỏ được (đã báo người dùng).
- Chữ thông báo: không dấu "·", viết thành câu, không câu đệm, không số tiền trên màn hình khóa. Bố cục "Gọn + icon" như trên.
- PWA dùng thật trước app native; push nhánh `claude/ecstatic-pascal-dblg7v` = deploy (Render + Vercel), chỉ push khi người dùng bảo.
- Online `TS-3010` là dữ liệu thật: chỉ xem, không gửi/lưu/mời kích hoạt. Migration cloud do người dùng chạy (`tools/cloud-supabase.sh`, cần mật khẩu).

## Nợ Ponytail
- Không có `shortcut:` mới trong phiên.

## Việc tiếp theo
1. [opus high] Làm 3 bước "Đang dở": bước 1 phiên chính tự làm; bước 2 và 3 gửi `giao` (lệnh kiểm không dùng pnpm; worktree cần symlink `apps/mobile/node_modules` + `apps/api/node_modules`).
2. [haiku] Người dùng: thử vuốt dải ngày/bánh xe giờ trên iPhone thật; ĐỔI mật khẩu ứng dụng Gmail (lỡ dán vào chat 22/11) → Vercel `SMTP_URL` + chạy lại `cloud-supabase.sh`.
- Lưu ý verify-all: lỗi giả "Auth/REST chưa sẵn sàng sau 30 giây" và `operators` lệch email ở preview → chạy riêng là đạt.

## File cần đọc đầu tiên
- `supabase/migrations/202612140001_notification_text.sql`, `apps/api/src/push/push.service.ts`, `apps/mobile/src/notify.ts`,
  `packages/contracts/src/index.ts` (`parseAnnouncement`), `tools/announcements-smoke.sh`
