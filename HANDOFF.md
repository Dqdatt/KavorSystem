# HANDOFF — 21/11/2026 (phiên 25: feedback PWA iPhone — push, UI OTP, quyền vị trí)

**Mục tiêu:** sửa 3 lỗi người dùng gặp khi dùng PWA trên iPhone: (1) HR đăng bản tin nhưng máy không có thông báo đẩy,
(2) 6 ô OTP tràn ngang màn hình và hiện khung xanh khi gõ, (3) app luôn báo "Kavor chưa có quyền vị trí".
**Từ 21/11 dự án dùng `giao`** (người dùng yêu cầu; đã `giao init`). Runner: `caffeinate -i giao chay` trong một tab Terminal.

## Trạng thái: ĐÃ deploy (21/11) — push `93647b4`, migration web push lên cloud, Render có 3 biến VAPID; `/meta` trả `webPushKey` (87 ký tự),
cả qua `kavor-app.vercel.app/api/v1/meta`. CÒN: người dùng thử push thật trên iPhone (bước 4).
1. ✅ UI OTP (`cda37c0`): `experiments/kavor-pwa/shims/pwa.ts` CSS `#root input,#root textarea{…;min-width:0;outline:none}`.
2. ✅ Web Push máy chủ (`cda37c0`): migration `202612130001_web_push.sql`, `apps/api/src/push/push.service.ts`, route `/me/push/subscribe|unsubscribe`,
   `GET /meta` có `webPushKey`, biến `API_VAPID_*` (chặn tên miền .test/.local — Apple trả 403 BadJwtToken). Đã gửi thật tới web.push.apple.com.
3. ✅ giao 001 (đã gộp): `shims/geo-perm.ts` — iOS trả `permissions.query(geolocation)="prompt"` mỗi lần mở dù đã cấp → nhớ cờ khi lấy vị trí được.
4. ✅ giao 002 (đã gộp; nhân viên treo ở bước kiểm tra nên tôi tự kiểm + commit): SW xử lý `push`/bấm push mở `/notifications`;
   shim `getDevicePushTokenAsync`/`unregisterForNotificationsAsync`; `notify.ts` `syncPush`/`stopPush`/`onPushTap`; thẻ "Bật thông báo".
5. ✅ Sửa thêm sau khi thử Simulator (`store.ts`, chưa commit lúc viết):
   - `firstRunPerms()` gom khối hỏi quyền lần đầu + `syncPush`; gọi thêm sau khi đăng ký thiết bị / HR duyệt thiết bị (trước đây máy mới không được
     hỏi quyền và không đăng ký push tới lần mở app sau).
   - `onFix`: có vị trí thì đặt `S.perm.loc = "granted"` → thẻ "chưa có quyền vị trí" biến mất ngay (đã thấy trên Simulator).
   - `apps/mobile/src/os.ts` `IS_IOS`: Metro thay sẵn `Platform.OS` = "web" khi build PWA nên mọi nhánh iOS chết (thiết bị lưu `platform=android`,
     nhãn "Android 18.7", ghi chú Hồ sơ nói Android, "khuôn mặt" thay "Face ID", hộp chọn ảnh thiếu Hủy). Đã thay 7 chỗ bằng `IS_IOS`
     (native y nguyên). Simulator: nhãn "iPhone (PWA) · iOS 18.7", DB `platform=ios`. Máy PWA đã đăng ký trước đó vẫn lưu `android` tới khi đăng ký lại.
6. Kiểm tra: verify-all đầy đủ trên API 4100 — pgTAP 711/711 (sau reset), 33 smoke đạt; `operators` chỉ lỗi vì API preview không đọc được
   `apps/api/.env.local` (lệch email quản trị đầu tiên) — ép cùng email thì đạt. Sau đó mobile tsc + 6 test + build PWA đạt; verify-all --quick chạy lại.
7. Simulator (iOS 26.3, PWA cài ra Màn hình chính, API 4100): đăng nhập, đăng xuất, đăng ký thiết bị → gọi `/meta` ~1 giây sau (syncPush chạy).
   **Simulator không đăng ký Web Push được**: `pushManager.subscribe` báo `NotAllowedError: User denied push permission` kể cả khi chạm trực tiếp
   (trang thử `permtest`). Bước nhận push thật phải thử trên iPhone.

## 21–22/11: push tới iPhone ✅; đã sửa chậm khi khóa máy + chữ khó đọc (ĐÃ deploy)
- `push.service.ts`: `urgency: "high"`, rút hàng đợi 5 giây/lần (trước 20 giây).
- Chữ thông báo viết lại (QUY TẮC người dùng: không dấu "·", viết thành câu; không câu đệm; không số tiền):
  `202612140001_notification_text.sql` (giao 003 dựng khung, worker bỏ qua quy tắc "·" nên Claude tự sửa chữ) — hàm `notify_request_brief`,
  `request_type_noun`, `announcement_teaser`; `202612140002_notification_text_pay.sql` (Claude, chép nguyên hàm lương/tạm ứng, chỉ đổi chữ).
  Ví dụ: "Trần Thu Hà xin tạm ứng lương" / "Trừ vào lương 11/2026. Chờ bạn duyệt đơn TU-0001."; bản tin "Quan trọng: <tên>" / "Phòng Nhân sự: <120 ký tự đầu>…".
- Kiểm: pgTAP 718/718; verify-all đủ, 3 smoke ✘ lần đầu rồi chạy riêng đạt: announcements (check cũ "không chép nội dung" — đã đổi),
  checklist (lỗi giả khi máy tải nặng), operators (preview không đọc `.env.local` + giới hạn OTP khi chạy lặp; bản ép email đạt 48 bước).
- ✅ 22/11: 2 migration đã lên cloud (người dùng chạy `tools/cloud-supabase.sh`), đã push `01bec45` (Render health 200, còn `webPushKey`).
  CÒN: người dùng thử lại trên iPhone (push khi khóa máy có nhanh hơn không, chữ mới có dễ đọc không).
- 22/11 phản hồi tiếp (ĐÃ deploy `4524419` + migration icon lên cloud): (a) "from Kavor" do iOS tự thêm, không bỏ được.
  (b) Bản tin quan trọng → "❗ <tên bài>": migration `202612150001_announcement_important_icon.sql`.
  (c) giao 004 + Claude sửa 2 lỗi review: shim `ScrollView` PWA (`experiments/kavor-pwa/shims/react-native.ts`, `scroll-snap.ts`) — bỏ `overflow`
  để dải ngày cuộn được (trước kẹt 1–6/11), giả lập snapToInterval/snapToOffsets + onMomentumScrollEnd (bánh xe giờ tự khớp số; đọc props mới
  nhất, kẹp điểm khớp về mép cuộn). Đã thử preview pwa-4100 cỡ iPhone: dải ngày đơn nghỉ/OT cuộn được, bánh xe giờ OT + phút giải trình tự khớp.
  verify-all: 3 smoke lỗi môi trường (REST chưa sẵn sàng sau reset ×2, operators email) → chạy riêng đạt.
  CÒN: người dùng thử vuốt thật trên iPhone; ĐỔI mật khẩu ứng dụng Gmail (lỡ dán vào chat 22/11) → cập nhật Vercel `SMTP_URL` + chạy lại cloud-supabase.sh.

## Việc người dùng cần làm (thứ tự trong `docs/DEPLOY.md` mục 7b "Thông báo khi app tắt")
1. ✅ `tools/cloud-supabase.sh` đã áp `202612130001_web_push.sql` (lỗi "Storage config databasePoolMode" của CLI 2.108 bỏ qua được — Auth up to date).
2. ✅ Render đã có 3 biến `API_VAPID_*` (khóa giữ cố định; đổi khóa = mọi máy phải đăng ký push lại).
3. ✅ Đã push nhánh `claude/ecstatic-pascal-dblg7v` (deploy Render + Vercel). Kiểm: `GET https://kavor-api.onrender.com/api/v1/meta` phải có `webPushKey` khác null.
4. iPhone (CHƯA thử): mở PWA từ Màn hình chính → cho phép thông báo → HR đăng bản tin → khóa máy chờ ≤ 20 giây. Online là dữ liệu thật: không gửi mời kích hoạt.

## Còn mở / lưu ý
- Verify-all chạy trong preview API 4100: smoke `operators` lệch email quản trị đầu tiên (preview không đọc được `apps/api/.env.local`) — lỗi môi trường.
- iOS web app trên localhost hỏi lại quyền vị trí sau khi app bị tắt hẳn (hành vi iOS); trên tên miền https thật cần xem lại trên iPhone.
- giao: lệnh kiểm KHÔNG dùng `pnpm test` (treo vì node_modules symlink) — gọi thẳng `node tools/<x>-mobile-test.mjs`; worktree cần symlink
  `apps/mobile/node_modules` và `apps/api/node_modules`.
- pgTAP local ✘ `hr_rls` #22 + `offboarding` chỉ khi DB còn dữ liệu thử cũ; DB vừa reset thì đạt hết.

## Quyết định đã chốt (đừng hỏi lại)
- PWA dùng thật trước app native; push nhánh `claude/ecstatic-pascal-dblg7v` = deploy. Hạn chế push lặt vặt.
- Push từ máy chủ chỉ làm cho PWA (Web Push, miễn phí). App native vẫn chưa có push (cần tài khoản Apple trả phí).
- Render miễn phí ngủ khi rảnh: thông báo rơi vào lúc API ngủ sẽ push khi API thức (bỏ thông báo đã đọc hoặc cũ hơn 12 giờ).

## File cần đọc đầu tiên
- `experiments/kavor-pwa/README.md`, `apps/api/src/push/push.service.ts`, `apps/mobile/src/notify.ts`, `apps/mobile/src/store.ts` (`firstRunPerms`).
