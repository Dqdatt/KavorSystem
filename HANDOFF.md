# HANDOFF — 21/11/2026 (phiên 25: feedback PWA iPhone — push, UI OTP, quyền vị trí)

**Mục tiêu:** sửa 3 lỗi người dùng gặp khi dùng PWA trên iPhone: (1) HR đăng bản tin nhưng máy không có thông báo đẩy,
(2) 6 ô OTP tràn ngang màn hình và hiện khung xanh khi gõ, (3) app luôn báo "Kavor chưa có quyền vị trí".
**Từ 21/11 dự án dùng `giao`** (người dùng yêu cầu; đã `giao init`). Runner: `caffeinate -i giao chay` trong một tab Terminal.

## Trạng thái: code xong, đã gộp vào nhánh local; CHƯA push (push nhánh = deploy, chờ người dùng bảo)
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
6. Kiểm tra: verify-all đầy đủ trên API 4100 — pgTAP 711/711 (sau reset), 33 smoke đạt; `operators` chỉ lỗi vì API preview không đọc được
   `apps/api/.env.local` (lệch email quản trị đầu tiên) — ép cùng email thì đạt. Sau đó mobile tsc + 6 test + build PWA đạt; verify-all --quick chạy lại.
7. Simulator (iOS 26.3, PWA cài ra Màn hình chính, API 4100): đăng nhập, đăng xuất, đăng ký thiết bị → gọi `/meta` ~1 giây sau (syncPush chạy).
   **Simulator không đăng ký Web Push được**: `pushManager.subscribe` báo `NotAllowedError: User denied push permission` kể cả khi chạm trực tiếp
   (trang thử `permtest`). Bước nhận push thật phải thử trên iPhone.

## Việc người dùng cần làm
- Render: đặt `API_VAPID_PUBLIC_KEY`, `API_VAPID_PRIVATE_KEY` (tạo: `cd apps/api && npx web-push generate-vapid-keys`), `API_VAPID_SUBJECT=mailto:<email thật>`.
- Bảo push nhánh `claude/ecstatic-pascal-dblg7v` (deploy Render + Vercel), rồi trên iPhone: mở PWA từ Màn hình chính → cho phép thông báo →
  HR đăng bản tin → khóa máy chờ ≤ 20 giây. Online là dữ liệu thật: thử với công ty thử, không gửi mời kích hoạt.

## Còn mở / lưu ý
- Nhãn thiết bị PWA hiện "iPhone (PWA) · Android 18.7" (lỗi hiển thị có từ trước, `deviceSummary()` trong `apps/mobile/src/attendance.ts`) — chưa sửa.
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
