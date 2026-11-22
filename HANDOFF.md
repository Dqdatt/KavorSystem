# HANDOFF — 22/11/2026 (phiên 26: push màn hình khóa "Gọn + icon")

**Mục tiêu phiên vừa rồi:** làm gọn push PWA trên màn hình khóa iPhone (đoạn trích bản tin, icon tiêu đề, chữ nhắc giải trình).

## Đã xong (đã deploy, migration đã lên cloud, người dùng thử iPhone thật: ổn)
- `202612160001_announcement_teaser_plain.sql`: hàm `announcement_plain_text` (chữ thuần theo quy tắc `parseAnnouncement`) +
  `announcement_teaser` bỏ tiền tố người đăng, cắt ≤ 90 ký tự ở ranh giới từ (`bf902b4`).
- `202612170001_announcement_teaser_lists.sql`: mục danh sách mỗi mục một dòng, giữ "1."/"•", cả dòng gõ tay (lưu dạng `\1. …`);
  cắt giữa danh sách thì bỏ dấu mục trơ trọi (`7c1a35f`).
- Icon đầu tiêu đề push theo loại: `PUSH_ICON` trong `apps/api/src/push/push.service.ts` (giao 005, `2ff1371`); tiêu đề có "❗" thì không thêm.
- `apps/mobile/src/notify.ts`: "Còn x/y lượt giải trình." thay cho "· còn x/y lượt".
- verify-all đầy đủ đạt (smoke `requests`/`settings` lỗi giả bước MFA khi máy tải nặng → chạy riêng đạt); pgTAP 725 test.

## Đang dở
- Không có.

## Quyết định đã chốt (đừng hỏi lại)
- "from Kavor" do iOS tự thêm cho push của web app, không bỏ được.
- Chữ thông báo: không dấu "·", viết thành câu, không câu đệm, không số tiền trên màn hình khóa.
- Push "Gọn + icon": icon chỉ có trong push (app có `NOTIF_ICON` riêng); bản tin không tiền tố người đăng, ≤ 90 ký tự;
  bài có danh sách mỗi mục một dòng (người dùng chọn 22/11), bài thường gộp một dòng.
- PWA dùng thật trước app native; push nhánh `claude/ecstatic-pascal-dblg7v` = deploy (Render + Vercel), chỉ push khi người dùng bảo.
- Online `TS-3010` là dữ liệu thật: chỉ xem. Migration chỉ đổi DB: phiên chính tự áp bằng `supabase db query --linked -f`
  (gói `begin; <migration>; insert into supabase_migrations.schema_migrations …; commit;`) khi người dùng đồng ý.
  `tools/cloud-supabase.sh` chỉ cần khi đổi cấu hình Auth — luôn đưa lệnh đầy đủ kèm biến môi trường.

## Nợ Ponytail
- Không có `shortcut:` mới trong phiên.

## Việc tiếp theo
1. [haiku] Người dùng: thử vuốt dải ngày/bánh xe giờ trên iPhone thật; ĐỔI mật khẩu ứng dụng Gmail (lỡ dán vào chat 22/11)
   → Vercel `SMTP_URL` + chạy lại `cloud-supabase.sh`.
2. [haiku] Vercel `kavorsystem-mobile` deploy lỗi ở mọi commit gần đây — nếu là project cũ không dùng thì người dùng gỡ.
3. [opus high] Feedback PWA tiếp theo của người dùng (xem `docs/TASKS.md`).
- Lưu ý verify-all: lỗi giả bước MFA / "Auth/REST chưa sẵn sàng" khi máy tải nặng → chạy riêng smoke đó;
  pgTAP `reminders` lỗi nếu chạy sau smoke mà chưa reset DB.

## File cần đọc đầu tiên
- `docs/TASKS.md`, `supabase/migrations/202612170001_announcement_teaser_lists.sql`, `apps/api/src/push/push.service.ts`
