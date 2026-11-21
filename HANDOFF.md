# HANDOFF — 21/11/2026 (phiên 25: feedback PWA iPhone — push, UI OTP, quyền vị trí)

**Mục tiêu:** sửa 3 lỗi người dùng gặp khi dùng PWA trên iPhone: (1) HR đăng bản tin nhưng máy không có thông báo đẩy,
(2) 6 ô OTP tràn ngang màn hình và hiện khung xanh khi gõ, (3) app luôn báo "Kavor chưa có quyền vị trí".
**Từ 21/11 dự án dùng `giao`** (người dùng yêu cầu; đã `giao init`). Runner: `caffeinate -i giao chay` trong một tab Terminal.

## Plan đã chốt (7 bước)
1. ✅ `giao init`, sửa memory.
2. ✅ (`cda37c0`) UI: `experiments/kavor-pwa/shims/pwa.ts` CSS `#root input,#root textarea{…;min-width:0;outline:none}`.
   Nguyên nhân: `<input>` có bề rộng mặc định ~20 ký tự nên `flex:1` không co được. Đã kiểm trên preview 375px: 6 ô vừa, mất khung xanh.
3. ✅ Thử trên iOS 26 Simulator (PWA cài ra Màn hình chính):
   - Quyền vị trí được iOS nhớ (lấy vị trí không hỏi lại), nhưng mở lại app thì `permissions.query({name:"geolocation"})`
     trả `"prompt"` cho tới lần lấy vị trí đầu → `expo-location` báo undetermined.
   - Hỏi quyền thông báo qua hẹn giờ vẫn hiện hộp thoại. `PushManager` có trong web app (`navigator.standalone`).
4. ⏳ giao **001** `cho_duyet`: đã đọc diff nhánh `giao/001`, đúng đặc tả và test đạt. Chưa `giao xong`: còn thử trên PWA đã đăng nhập
   (Simulator, cùng lúc với bước 7).
5. ✅ (`cda37c0`) Web Push phía máy chủ:
   - Migration `202612130001_web_push.sql`: `push_subscriptions` và `push_outbox`; trigger `notifications_push` có điều kiện purge;
     `push_subscribe` (chuyển chủ theo endpoint, giữ 5 trình duyệt mới nhất); `push_claim` (lấy rồi xóa, bỏ thông báo đã đọc
     hoặc cũ hơn 12 giờ). pgTAP `web_push.test.sql` 16 test.
   - API `apps/api/src/push/push.service.ts`: chỉ nhận máy chủ push của Apple/Google/Mozilla/Microsoft (chống SSRF), kiểm khóa P-256.
     Rút hàng đợi mỗi 20 giây; 404/410 thì xóa đăng ký. Route `POST /me/push/subscribe` và `/me/push/unsubscribe` (body `{endpoint}`).
     `GET /meta` có `webPushKey`.
   - Config `API_VAPID_PUBLIC_KEY`, `API_VAPID_PRIVATE_KEY`, `API_VAPID_SUBJECT`; chặn tên miền .test/.local. Đã thử thật: Apple trả
     403 BadJwtToken với `mailto:…@kavor.test`, nhận JWT khi dùng tên miền thật.
   - `tools/dev-backend.sh` tự tạo khóa dev vào `apps/api/.env.local`. Launch `api-4100` tự sinh khóa tạm (preview bị macOS chặn đọc `.env.local`).
   - Đã kiểm: unit API 106/106; pgTAP push/purge/notifications đạt; `tools/push-smoke.sh` 11/11 trên API 4100 (bản đăng nhập vì DB
     chưa reset). Vòng gửi thật tới web.push.apple.com chạy hết, Apple trả 400 BadWebPushToken cho token giả, đúng như mong đợi.
   - Chưa: `verify-all` đầy đủ (cần db-reset, hỏi người dùng); PROGRESS.md (để sau bước 6).
6. ⏳ giao **002** (`cho_lam`): PWA đăng ký push. Đặc tả gồm:
   - SW: xử lý `push`; bấm thông báo push khi chưa mở cửa sổ nào → mở `/notifications`.
   - Shim: `getDevicePushTokenAsync` / `unregisterForNotificationsAsync`.
   - Mobile (`notify.ts`): `syncPush` / `stopPush` / `onPushTap`, chỉ chạy khi có `PushManager`, nên native không làm gì.
     `syncPush` gọi khi quyền thông báo đã cấp; `stopPush` gọi lúc đăng xuất.
   - Trang chủ: thẻ "Bật thông báo" gọi thẳng `setPerm` (iOS cần người dùng chạm).
   Duyệt: đọc diff nhánh `giao/002`; xem `onPushTap`/`replayPushTap` có đúng mẫu `onReminderTap` không, `stopPush` có nằm trong `logoutGo` không.
7. ☐ Duyệt diff, preview, `verify-all`. Người dùng đặt 3 biến VAPID trên Render rồi thử iPhone. Push nhánh deploy khi người dùng bảo.

## Lưu ý giao
- Worktree giao chỉ có symlink `node_modules` gốc. Lệnh kiểm phải `ln -sfn /Users/dqdatt/Desktop/KavorSystem/apps/mobile/node_modules apps/mobile/node_modules` trước.
  `.git/info/exclude` có `node_modules`, nên symlink không bị commit. Đã thử: build PWA trong worktree chạy được.
- `shims/pwa.ts` đang sửa chưa commit. Đừng giao việc sửa file này trước khi commit, kẻo `giao xong` merge xung đột.

## Quyết định đã chốt (đừng hỏi lại)
- PWA dùng thật trước app native; link cài để ở biến Render. Push nhánh `claude/ecstatic-pascal-dblg7v` = deploy. Hạn chế push lặt vặt.
- Push từ máy chủ chỉ làm cho PWA (Web Push, miễn phí). App native vẫn chưa có push (cần tài khoản Apple trả phí).
- Render miễn phí ngủ khi rảnh: bản tin hẹn giờ rơi vào lúc API ngủ sẽ đến khi API thức lại (chấp nhận).

## Còn treo từ phiên 24
- Người dùng chưa đặt `MOBILE_IOS_URL`/`MOBILE_ANDROID_URL` trên Render. pgTAP local ✘ `hr_rls` #22 + `offboarding` do dữ liệu thử; cần `db-reset` (hỏi trước).

## File cần đọc đầu tiên
- `experiments/kavor-pwa/README.md`, `supabase/migrations/202610260001_notifications.sql`, `apps/api/src/notifications/notifications.service.ts`,
  `apps/mobile/src/perms.ts`, `apps/mobile/src/notify.ts`.
