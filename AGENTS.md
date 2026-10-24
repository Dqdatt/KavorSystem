# AGENTS.md

## Kiến trúc

- Monorepo pnpm/Turborepo: `apps/admin-web` và `apps/console-web` là Next.js; `apps/mobile` là Expo/React Native; `apps/api` là backend TypeScript; `packages/contracts` chứa contract dùng chung; `packages/web-ui` chứa UI web dùng chung; `supabase/` chứa cấu hình/migration PostgreSQL.
- Quyết định kiến trúc ở `docs/adr/`. ADR 0001: Kavor cấp Tenant Admin, chính sách nghiệp vụ có tầng (công ty → nhóm → cá nhân) + phiên bản/ngày hiệu lực, tra theo ngày chứ không sao chép vào nhân viên; luật nhà nước do Kavor duy trì. Không thêm giá trị nghiệp vụ cứng mới vào mobile/web — đọc từ API. Phần HR cần quản lý và thứ tự module: `docs/HR_COVERAGE_AUDIT.md`.
- Prototype mobile chuẩn để đối chiếu là `Kavor HRM Prototype.html`. Deep link mobile dùng scheme `kavor://`.
- Kavor là SaaS quản trị nhân sự cho doanh nghiệp, không phải dịch vụ đăng ký kinh doanh. Payroll phải cấu hình theo tenant; không phát triển chữ ký số. Supabase/PostgreSQL là nguồn dữ liệu vận hành; Google Sheets chỉ là nguồn import/chuyển đổi.

## Lệnh chính

```bash
pnpm install
pnpm dev:admin
pnpm dev:console
pnpm dev:api
pnpm dev:mobile
pnpm typecheck
pnpm test
pnpm build
```

- Giai đoạn hiện tại là dev: không phân phối TestFlight/Google Play; người dùng tự test trên iPhone 11 thật ("Dqdatt"). Không có máy Android: kiểm tra Android bằng emulator.
- Mobile hỗ trợ iOS và Android. Quy trình chính dùng native build (`pnpm --filter @kavor/mobile ios|android`), không dựa vào Expo Go; thư mục native sinh ra được ignore.
- Không commit `.env`, key/token, `dist`, `.next`, `.expo`, native generated folders hoặc ảnh raw/trung gian.

## Quy ước và tiêu chí UI

- Giao tiếp/tài liệu dự án ưu tiên tiếng Việt; dùng dữ liệu mẫu để hoàn thiện toàn bộ flow trước backend.
- Mobile phải bám sát prototype: liquid glass, animation tự nhiên, safe area hòa vào background (không có dải trắng thừa), navbar ẩn/hiện khi cuộn và biểu tượng Face ID hệ thống trên iOS.
- Trước khi chốt UI, chụp và đối chiếu từng route/state prototype với native trên kích thước iPhone 11; trạng thái chưa triển khai phải được ghi rõ, không được bỏ khỏi checklist.
- Web HR/Admin và Kavor Console dùng layout full-page, tránh lặp title/header và tối ưu mật độ thông tin.

## Cạm bẫy

- `pnpm test` có thể pass dù một số package chỉ in thông báo “pending/no tests yet”; luôn ghi rõ mức độ test thực tế.
- `pod install`/`expo run:ios` lỗi Unicode Normalization nếu thiếu `LANG=en_US.UTF-8` (CocoaPods 1.17 + Ruby 4 khi shell không đặt locale UTF-8).
- Code mobile nằm trong `apps/mobile/src/` (port 1:1 từ prototype). So sánh UI dùng `tools/ui-compare/` + deep link `kavor://qa/<state>` (cần `EXPO_PUBLIC_KAVOR_QA=1`); tên state trong `states.mjs` và `src/qa.ts` phải trùng nhau.
- `npx expo prebuild -p ios` (kể cả không `--clean`) tạo lại `ios/`: mất `DEVELOPMENT_TEAM`, `RCTNewArchEnabled` trong Info.plist và thư mục Pods. Sao lưu `project.pbxproj`/`Info.plist` trước rồi khôi phục; Pods cài lại khi `expo run:ios`.
- Sau `pod install` chạy tay, build Debug iOS có thể lỗi link `facebook::react::Sealable::Sealable()`: file `ios/Pods/React-Core-prebuilt/.last_build_configuration` bị mất nên script không đổi React Native prebuilt về Debug. Ghi `Release` vào file đó rồi build lại.
- Android: JDK `/opt/homebrew/opt/openjdk@17`, SDK `~/Library/Android/sdk`, emulator `Kavor_Pixel_6`; app dev không nhận Fast Refresh khi Metro chạy chung với iOS — force-stop rồi mở lại qua `kavor://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` (cần `adb reverse tcp:8081 tcp:8081`).
- iOS Debug (dev client) crash khi khởi động nếu React prebuilt và Expo precompiled modules lệch flavor. Để chụp QA dùng bản Release có cờ: `EXPO_PUBLIC_KAVOR_QA=1 npx expo run:ios --configuration Release --no-bundler`. Biến `EXPO_PUBLIC_*` bị Metro cache: xóa `$TMPDIR/metro-cache` khi đổi cờ QA, kể cả trước khi build bản cho iPhone thật (không được lọt QA).
- Android: chữ bị cắt/xuống dòng sai trong bản Release nếu nạp font lúc chạy — Montserrat được nhúng native qua plugin `expo-font` (app.json), `useFonts` chỉ chạy trên iOS. `T` (src/ui.tsx) tự thêm NBSP cuối chuỗi trên Android; nhãn một dòng (nút, chip, seg, tag) dùng `numberOfLines={1}`.
- Chụp Android: `adb shell wm size 828x1792 && adb shell wm density 320`, rồi `UI_PLATFORM=android python3 -I tools/ui-compare/capture-native.py` và `UI_PLATFORM=android python3 -I tools/ui-compare/pair.py`.
- `supabase db reset` có lúc lỗi giữa chừng mà không báo rõ (bảng không tồn tại): luôn xem output; ngay sau reset PostgREST cần vài giây mới sẵn sàng (API báo "không tìm thấy nhân viên"), và Kong giữ IP cũ của Auth → Auth trả 502. Dùng `bash tools/db-reset.sh` (reset + khởi động lại Kong + chờ sẵn sàng) trước mỗi smoke script.
- Web HR/Admin bắt buộc MFA TOTP: smoke script lấy phiên aal2 bằng hàm `mfa` trong `tools/smoke-lib.sh`; thử trên trình duyệt thì lấy khóa thủ công ở bước liên kết và sinh mã bằng hàm `totp` của file đó. Đừng `source` file này trong zsh (biến `status` chỉ đọc) — chạy bằng bash.
- Supabase local của Kavor chạy cổng 553xx (API 55321, DB 55322) vì máy có project local khác (PharmaPOS_V3) chiếm 543xx — không stop project đó. Lệnh: `supabase start -x studio,imgproxy,vector,logflare,edge-runtime,postgres-meta` (Realtime cần cho web HR, Storage cho logo/ảnh bìa), `supabase db reset`, `supabase test db`.
- Supabase mới không tự GRANT SELECT cho anon/authenticated: bảng mới phải tự `enable row level security` + policy + `grant select ... to authenticated`; ghi dữ liệu đi qua API (service role). Thêm test vào `supabase/tests/`.
- Node cho Xcode đặt trong `apps/mobile/ios/.xcode.env.local` (`NODE_BINARY`); đổi Node thì cập nhật file này.
- Backend dev: `pnpm dev:backend` (Supabase local + Mailpit + API; ghi `apps/admin-web/.env.local` cho web). Web HR/Admin: `pnpm dev:admin` → http://localhost:3000, HR Admin mẫu HD0007 · thao.mai@haidang.vn kích hoạt ngay trên trang đăng nhập (OTP ở Mailpit). Mobile dùng API thật khi build có `EXPO_PUBLIC_API_URL=http://<IP LAN Mac>:4000/api/v1`; không có biến này hoặc bật QA thì dùng dữ liệu mẫu. OTP xem ở Mailpit `http://127.0.0.1:55324`. Kiểm thử auth: `supabase db reset && bash tools/auth-smoke.sh`.
- Kavor Console (`pnpm dev:console` → http://localhost:3001): nhân viên Kavor nằm ở `platform_operators`, tạo bằng `OPERATOR_PASSWORD='…' bash tools/create-operator.sh <email> "<Họ tên>"` (sau mỗi lần reset DB phải tạo lại); khôi phục chủ sở hữu cần hai người khác nhau. Cookie Console là `kc_*`, web HR là `kv_*` (cùng host localhost nên cookie không tách theo cổng). Kiểm thử: `bash tools/db-reset.sh && bash tools/console-smoke.sh`.
- Supabase Auth: signup công khai tắt; API tạo user bằng admin rồi gửi OTP (`shouldCreateUser:false`). Không dùng client admin để đăng nhập (supabase-js sẽ gắn token người dùng vào client) — dùng `authClient()` mới cho mỗi lần.
- Chấm công: ca và địa điểm do HR cấu hình trên web (Ca & địa điểm → áp dụng theo tầng, có phiên bản); muốn thử ở nhà thì thêm phiên bản địa điểm bằng nút "Dùng vị trí hiện tại của trình duyệt" (phiên bản chỉ hiệu lực từ hôm nay trở đi). Simulator: `xcrun simctl location booted set <lat>,<lng>` (văn phòng mẫu 10.774390,106.703940, bán kính 50 m). Kiểm thử: `supabase db reset && bash tools/attendance-smoke.sh` và `bash tools/hr-smoke.sh` (mỗi script cần DB vừa reset); test pgTAP không được giả định DB trống. Chỉ máy đầu tiên của nhân viên tự hoạt động; máy sau, hoặc máy từng bị thu hồi/từ chối, chờ HR duyệt — sau khi thử bằng simulator thì reset DB trước khi thử trên iPhone.
- Công tháng/giải trình: kỳ công theo `attendance.periodStartDay` của tenant (Hải Đăng 26 → 25, gọi theo tháng kết thúc); tính công trong `apps/api/src/timesheet/compute.ts`, không lưu kết quả ngày (chỉ snapshot khi khóa kỳ). Giải trình được duyệt tạo `attendance_adjustments`, không sửa `attendance_events`. Seed sinh chấm công theo ngày chạy reset nên số ngày công đổi theo ngày. Kiểm thử: `bash tools/db-reset.sh && bash tools/timesheet-smoke.sh`.
- Thông báo: tạo bằng trigger SQL (`202610260001_notifications.sql`), không gọi từ API; thêm loại đơn/sự kiện mới thì thêm trigger + `kind`. Nhắc hạn giải trình trên mobile là thông báo cục bộ (`src/notify.ts`, `expo-notifications` chỉ autolink + `pod install`, **không** thêm plugin vào app.json vì plugin thêm entitlement push `aps-environment`, chỉ ký được khi có tài khoản Apple Developer trả phí). Kiểm thử: `bash tools/db-reset.sh && bash tools/notifications-smoke.sh`.
- `expo run:ios --device` hay treo ở bước "Connecting to" iPhone: build bằng `xcodebuild ... -destination 'generic/platform=iOS'` rồi `xcrun devicectl device install app`.
- Ảnh simulator không đồng nghĩa với kiểm thử máy thật. Animation, safe area, Face ID và hành vi navbar phải xác nhận lại trên thiết bị vật lý.
- Không đưa Supabase publishable key hoặc thông tin đăng nhập vào tài liệu/commit; dùng biến môi trường.
