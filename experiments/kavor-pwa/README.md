# Kavor PWA — app nhân viên chạy trên trình duyệt (dùng trước khi có app trên App Store)

Bản PWA chạy **nguyên mã nguồn của app native** (`apps/mobile/src`, chế độ chỉ đọc) trên `react-native-web`, nên lên App Store
không phải viết lại gì: chỉ build app native rồi đổi link cài (`docs/DEPLOY.md` bước 7b/7c).
Thư mục nằm ngoài `pnpm-workspace.yaml`/`turbo.json` (không có dependency riêng: `node_modules` là symlink tới `apps/mobile/node_modules`,
`npm run build` tự tạo). `verify-all` chạy test proxy và build PWA; deploy là project Vercel riêng (`vercel.json`).

## Kiến trúc

| Thành phần | Cách hoạt động |
| --- | --- |
| Mã giao diện & nghiệp vụ | Dùng trực tiếp `../../apps/mobile/src` (32 màn hình/route, sheets, store, API client). |
| `metro.config.js` | Ghim `react`/`react-dom` về đúng bản `19.2.3` của `apps/mobile` và chuyển hướng các module native sang `./shims/`. |
| `babel.config.js` | Chuyển `experimental_backgroundImage` (React Native 0.86) thành `backgroundImage` để `react-native-web` vẽ đầy đủ mọi lớp gradient/liquid glass. |
| `shims/react-native.ts` | Đặt `Platform.OS = "ios"`, giới hạn khung rộng tối đa `440px` trên máy tính, bổ sung `Alert.alert` kiểu iOS (`shims/alert.ts`), `Linking.openURL` chống chặn popup cho liên kết PDF ký 5 phút, và chuyển đường dẫn `/clock`, `/leaveNew`… thành deep link `kavor://`. |
| `shims/safe-area-context.tsx` | Đọc `env(safe-area-inset-*)` trên iPhone khi cài ra Màn hình chính; trên trình duyệt thường/desktop giữ đệm trên `48px` như khung iPhone 11 để tỷ lệ khớp app native. |
| `shims/secure-store.ts` | Lưu phiên, PIN băm (`SHA-256 + salt`), hàng đợi chấm công offline trong `localStorage` (`kavor-pwa:*`). |
| `shims/local-authentication.ts` | Kết nối Face ID / Touch ID / vân tay thật của máy qua **WebAuthn platform authenticator** (chỉ mở khóa cục bộ như native; không có HTTPS/WebAuthn thì tự lùi về mã PIN 6 số). |
| `shims/attach.ts` | Chọn minh chứng (chụp ảnh, thư viện, PDF) qua `<input type="file">`, nén/xoay ảnh về JPEG `≤ 5 MB` (avatar cắt vuông `≤ 2 MB`) bằng `<canvas>`. |
| `shims/imgcache.ts` | Tải ảnh đại diện / ảnh bìa có header `Authorization` và lưu trong `Cache Storage` + `Blob URL`. |
| `shims/notifications.ts` | Quyền thông báo Web Notification + nhắc hạn giải trình qua Service Worker khi app đang mở. |
| `shims/symbols.tsx` | Vẽ SVG cho SF Symbols (`faceid`, `touchid`, `lock`). |
| `shims/geo-perm.ts` | Nhớ quyền vị trí trong `localStorage` giữa các lần mở app trên iOS (khắc phục lỗi permissions query luôn trả `prompt`). |
| `public/` + `tools/postbuild.mjs` | `manifest.webmanifest`, icon, splash HTML `#boot-splash` và `sw.js`: cài sẵn HTML + bundle JS + icon; HTML lấy mạng trước (mất mạng dùng bản lưu), file khác cache trước; mỗi bản build một cache `kavor-shell-*`, không đụng `/api/*` và cache ảnh `kavor-img`. |
| `api/proxy.mjs` | Proxy `/api/v1/*` → Kavor API (Vercel Function, `KAVOR_API_URL`). Refresh token chỉ nằm trong cookie HttpOnly `kv_rt` (Path `/api/v1/auth`); trang chỉ thấy chữ giữ chỗ `httponly`, proxy lắp lại khi gọi `/auth/refresh`, xóa cookie khi đăng xuất hoặc token chết. Test: `npm test`. |
| `tools/serve.mjs` | Máy chủ tĩnh không phụ thuộc gói ngoài, dùng chung `api/proxy.mjs` (tránh sửa `API_CORS_ORIGINS` của backend). Hỗ trợ cả HTTP và HTTPS LAN. |
| `shims/device.ts` | Tên máy gửi khi đăng ký thiết bị thêm `(PWA)` — HR phân biệt với app native khi duyệt máy mới. |
| `shims/install-banner.ts` | Đọc `appLinks` từ `GET /api/v1/meta` (biến `MOBILE_IOS_URL`/`MOBILE_ANDROID_URL` của API): link là App Store/Google Play thì hiện "Kavor đã có trên App Store"; đang mở trong tab trình duyệt thì hướng dẫn Thêm vào MH chính. |

## Cách chạy

Mọi lệnh chạy trong thư mục `experiments/kavor-pwa`:

```bash
cd experiments/kavor-pwa

# 1. Bản dữ liệu mẫu (giống prototype / app khi không đặt EXPO_PUBLIC_API_URL)
npm run build
npm run serve
# Mở http://localhost:8090

# 2. Bản nối Kavor API thật (cần backend đang chạy ở cổng 4000, hoặc đặt API_TARGET)
npm run build:api
API_TARGET=http://127.0.0.1:4000 npm run serve
# Hoặc nối API online:
# API_TARGET=https://<domain-api-render> npm run serve

# 3. Mở trên iPhone thật trong mạng Wi-Fi (cần HTTPS để iOS cấp GPS, Camera, Face ID, Service Worker)
bash tools/make-cert.sh
HTTPS=1 API_TARGET=http://127.0.0.1:4000 npm run serve
# Trên iPhone mở https://<IP-LAN-Mac>:8090 → Chia sẻ → Thêm vào MH chính
```

## Kiểm thử tự động

```bash
cd experiments/kavor-pwa
node tools/smoke-ui.mjs
```

Script mở Chrome headless ở kích thước iPhone 11 (`390×844 @2x`), đi qua 10 màn hình (Đăng nhập → Đăng ký thiết bị → Trang chủ → Bảng công → Đơn từ → Bản tin → Menu Tạo nhanh → Chấm công → Khóa PIN Phiếu lương → Hồ sơ), chụp ảnh vào `shots/` và kiểm tra không có bất kỳ lỗi console hay runtime nào.

## Khác biệt & giới hạn so với app native

1. **Bảo mật lưu trữ trên máy:** `localStorage` không được phần cứng mã hóa như iOS Keychain / Android Keystore. Refresh token đã chuyển sang cookie HttpOnly ở `api/proxy.mjs`; access token ngắn hạn, PIN băm, hàng đợi chấm công vẫn ở `localStorage`.
2. **Thiết bị chấm công mới:** Mỗi trình duyệt/PWA sinh một `installationId` riêng trong `localStorage`. Khi nối API thật, nếu nhân viên đã có máy native thì trình duyệt sẽ là máy thứ hai và chờ HR duyệt thiết bị.
3. **Thông báo đẩy & chạy nền:** Không có APNs/FCM hay geofence nền khi đóng hẳn PWA; lịch nhắc hạn giải trình chỉ bắn khi PWA còn mở.
4. **Widget iOS:** Màn hướng dẫn widget (`widgetGuide`, `springHome`, `springLock`) vẫn xem thử được trong PWA nhưng iOS không cho PWA cung cấp widget màn hình chính.
5. **File đính kèm tối đa 3 MB** (app native 5 MB): hàm Vercel nhận body ≤ 4,5 MB mà file gửi dạng base64.
6. **Thêm module native mới vào `apps/mobile`** → phải thêm shim ở `shims/` + `metro.config.js`, nếu không `verify-all`/Vercel build PWA báo lỗi.
