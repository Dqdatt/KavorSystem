# AGENTS.md

## Cách làm việc (bắt buộc — đọc `docs/AGENT_PLAYBOOK.md` trước khi bắt đầu bất kỳ việc gì)

- Có `docs/CLOUD_HANDOFF.md` (việc làm từ phiên cloud, chưa test trên máy thật): đọc trước, cập nhật sau mỗi lần push từ cloud.
- Đọc file trước khi sửa; đọc `PROGRESS.md` và tài liệu nghiệp vụ liên quan trước khi làm module. Không đoán tên API/cột/hàm.
- Không báo "xong" khi chưa chạy kiểm tra: dán lệnh + kết quả thật (typecheck, test, smoke, ảnh chụp). Chưa kiểm thì ghi "chưa kiểm tra".
- Bước nhỏ, kiểm ngay sau mỗi bước. Cùng một lỗi sửa 2 lần chưa được → dừng đoán, đo nguyên nhân (log/DB/curl/ảnh) hoặc hỏi người dùng.
- Chuyển prototype → native: port nguyên văn từng màn (chép giá trị CSS, chữ, thứ tự), mỗi màn chụp + ghép ảnh bằng `tools/ui-compare/`
  rồi mới sang màn khác; đổi component dùng chung thì chụp lại toàn bộ. Chỉ ảnh ghép mới là bằng chứng "khớp".
- Làm theo khuôn module có sẵn (migration → pgTAP → contracts → API → smoke → web → mobile → kiểm thử tổng → PROGRESS). Không sửa lan ngoài yêu cầu.
- Kiểm tra toàn bộ: `bash tools/verify-all.sh` (bản `--quick` khi đang làm). Phải đạt trước khi báo xong/commit/bàn giao.
- Nhiều agent: mỗi lần một agent; bắt đầu bằng `git status` sạch + đọc `PROGRESS.md`, ghi "Đang làm: <agent>"; không force-push/rebase;
  **không sửa migration đã push** (tạo migration mới). Chi tiết: `docs/AGENT_PLAYBOOK.md` mục 4.

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
- Web: CSS dùng chung một nguồn `packages/web-ui/src/kavor.css` (màu là biến, theme sáng/tối qua `<html data-theme>`, không có thuộc tính =
  theo hệ điều hành; Montserrat tự host) — không viết mã màu cứng trong trang, không tạo CSS riêng cho từng web. Dropdown dùng `Select` của
  `@kavor/web-ui` (không dùng `<select>` gốc); tên trang chỉ ở topbar (page-head không có h2). Chữ hiển thị theo bảng từ Việt hóa trong
  `docs/plans/web-ui-polish.md` (tenant → công ty/doanh nghiệp, Tenant Admin → quản trị viên công ty…); mã kỹ thuật giữ nguyên.

## Cạm bẫy

- `pnpm test` có thể pass dù một số package chỉ in thông báo “pending/no tests yet”; luôn ghi rõ mức độ test thực tế.
- Smoke chạy bằng `/bin/bash` 3.2 trên macOS: JSON có `\"` nằm trong `"$( … )"` bị bung ngoặc nhọn (lệnh chạy nhiều lần, `check` đạt giả).
  Gán kết quả trước rồi kiểm: `_s1=$(call POST … "{\"a\":1,\"b\":2}") || :` rồi `check "…" "$_s1" …`. Không dùng `mktemp --suffix` (chỉ GNU).
- `pod install`/`expo run:ios` lỗi Unicode Normalization nếu thiếu `LANG=en_US.UTF-8` (CocoaPods 1.17 + Ruby 4 khi shell không đặt locale UTF-8).
- Code mobile nằm trong `apps/mobile/src/` (port 1:1 từ prototype). So sánh UI dùng `tools/ui-compare/` + deep link `kavor://qa/<state>` (cần `EXPO_PUBLIC_KAVOR_QA=1`); tên state trong `states.mjs` và `src/qa.ts` phải trùng nhau.
- `npx expo prebuild -p ios` (kể cả không `--clean`) tạo lại `ios/`: mất `DEVELOPMENT_TEAM`, `RCTNewArchEnabled` trong Info.plist và thư mục Pods. Sao lưu `project.pbxproj`/`Info.plist` trước rồi khôi phục; Pods cài lại khi `expo run:ios`.
- Splash iOS là ảnh gradient toàn màn hình + logo: `ios/Kavor/Images.xcassets/SplashScreenGradient` (nguồn `apps/mobile/assets/splash-gradient.png`)
  và imageView `KAVOR-SplashGradient` trong `SplashScreen.storyboard` — sửa tay vì plugin expo-splash-screen chỉ hỗ trợ màu đặc; `expo prebuild` sẽ xóa,
  phải thêm lại. iOS cache launch screen: đổi splash xong phải gỡ app (hoặc khởi động lại máy) mới thấy bản mới.
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
- Kavor Console (`pnpm dev:console` → http://localhost:3001): nhân viên Kavor nằm ở `platform_operators` (vai trò `platform_admin` = Quản trị Console,
  `platform_operator`, `platform_support`; kiểm quyền vận hành bằng `canOperate`). Quản trị viên đầu tiên **không cần lệnh**: khi chưa có `platform_admin`
  đang hoạt động, email `CONSOLE_BOOTSTRAP_EMAIL` (dev mặc định `admin@kavor.test`, đổi trong `apps/api/.env.local` — không commit; staging/production không có mặc định) tự kích hoạt ở "Kích hoạt tài
  khoản / Quên mật khẩu" (OTP Mailpit) — sau mỗi lần reset DB làm lại bước này. Người khác được mời ở **Nhân viên Kavor** (lời mời 7 ngày, tự đặt mật khẩu
  bằng OTP); DB luôn giữ ít nhất một Quản trị Console đang hoạt động (trigger). `tools/create-operator.sh` chỉ còn cho smoke. Khôi phục chủ sở hữu cần hai
  người khác nhau. Cookie Console là `kc_*`, web HR là `kv_*` (cùng host localhost nên cookie không tách theo cổng). Kiểm thử:
  `bash tools/db-reset.sh && bash tools/console-smoke.sh` và `bash tools/db-reset.sh && bash tools/operators-smoke.sh`.
- Supabase Auth: signup công khai tắt; API tạo user bằng admin rồi gửi OTP (`shouldCreateUser:false`). Không dùng client admin để đăng nhập (supabase-js sẽ gắn token người dùng vào client) — dùng `authClient()` mới cho mỗi lần.
- Bản đồ chọn vị trí chấm công (`apps/admin-web/app/_ui/location-map.tsx`, Leaflet): DNS nhà mạng VNPT trả NXDOMAIN cho mọi tên miền
  `openstreetmap.org` (tile + Nominatim) và CARTO bắt buộc API key → bản dev dùng `tile.openstreetmap.de` + Photon (komoot); đổi tile bằng
  `NEXT_PUBLIC_MAP_TILE_URL`/`_ATTRIBUTION`. Shell của agent chạy trong sandbox không ra Internet: kiểm bản đồ bằng trình duyệt trong app.
  `_ui/google-location-map.tsx` (Google Maps, bật khi có `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) **không dùng được với tài khoản thanh toán ở Việt Nam**
  (Google Maps Platform chặn khu vực — đã thử 10/2026, bị giữ tiền xác minh thẻ vô ích). Production chọn nhà cung cấp VN (Goong/VietMap/Map4D/TrackAsia)
  qua biến tile/geocoder; kiểm điều kiện đăng ký + tiền tạm giữ trước khi bảo người dùng đăng ký.
- Chấm công: ca và địa điểm do HR cấu hình trên web (Ca & địa điểm → áp dụng theo tầng, có phiên bản); muốn thử ở nhà thì thêm phiên bản địa điểm bằng nút "Dùng vị trí hiện tại của trình duyệt" (phiên bản chỉ hiệu lực từ hôm nay trở đi). Simulator: `xcrun simctl location booted set <lat>,<lng>` (văn phòng mẫu 10.774390,106.703940, bán kính 50 m). Kiểm thử: `supabase db reset && bash tools/attendance-smoke.sh` và `bash tools/hr-smoke.sh` (mỗi script cần DB vừa reset); test pgTAP không được giả định DB trống. Chỉ máy đầu tiên của nhân viên tự hoạt động; máy sau, hoặc máy từng bị thu hồi/từ chối, chờ HR duyệt — sau khi thử bằng simulator thì reset DB trước khi thử trên iPhone.
- Công tháng/giải trình: kỳ công theo `attendance.periodStartDay` của tenant (Hải Đăng 26 → 25, gọi theo tháng kết thúc); tính công trong `apps/api/src/timesheet/compute.ts`, không lưu kết quả ngày (chỉ snapshot khi khóa kỳ). Giải trình được duyệt tạo `attendance_adjustments`, không sửa `attendance_events`. Seed sinh chấm công theo ngày chạy reset nên số ngày công đổi theo ngày. Kiểm thử: `bash tools/db-reset.sh && bash tools/timesheet-smoke.sh`.
- Nghỉ phép: số dư = tổng `leave_transactions` (không có cột số dư); giao dịch cấp/tích lũy/thâm niên/phép tồn/hết hạn do API bổ sung khi đọc sổ (`apps/api/src/leave/leave.service.ts`, idempotent theo `source_key`), giữ chỗ/trả/trừ phép do SQL làm cùng đơn. Seed có số dư đầu kỳ −2 ngày cho HD0142. Kiểm thử: `bash tools/db-reset.sh && bash tools/leave-smoke.sh`.
- Làm thêm giờ: hệ số/giới hạn tra theo quy định hiệu lực vào ngày làm thêm (`apps/api/src/overtime`), giờ đang chờ + đã duyệt tính vào giới hạn; tháng/năm là dương lịch (không theo kỳ công). Kiểm thử: `bash tools/db-reset.sh && bash tools/overtime-smoke.sh`.
- Tạm ứng/lương: dữ liệu lương chỉ vai trò Kế toán (`payroll`, quyền `compensation.*`, `salary_advance.process`) xem; không đưa số tiền lương vào nhật ký hay ảnh chụp đơn. Kế toán mẫu HD0215 · nhung.do@haidang.vn. Quy định mẫu nhận đơn đến ngày 20 — smoke tạo quy định riêng hạn 31 để không phụ thuộc ngày. Kiểm thử: `bash tools/db-reset.sh && bash tools/advance-smoke.sh`.
- Thông báo: tạo bằng trigger SQL (`202610260001_notifications.sql`), không gọi từ API; thêm loại đơn/sự kiện mới thì thêm trigger + `kind`. Nhắc hạn giải trình trên mobile là thông báo cục bộ (`src/notify.ts`, `expo-notifications` chỉ autolink + `pod install`, **không** thêm plugin vào app.json vì plugin thêm entitlement push `aps-environment`, chỉ ký được khi có tài khoản Apple Developer trả phí). Kiểm thử: `bash tools/db-reset.sh && bash tools/notifications-smoke.sh`.
- Bản tin: người nhận tính lúc đọc (`announcement_recipients`, phòng ban gồm phòng con); thông báo do HR chọn từng bài, bài hẹn giờ được gửi ở chu kỳ quét 10 phút của API; "Hiển thị đến" (`visible_until`) quá giờ thì bài tự ẩn (hàm `announcement_visible`, API `mine`, app lọc thêm phía máy), trạng thái web `expired`, sửa được cả khi đã xuất bản; app mở file đính kèm qua liên kết ký 5 phút (khóa ngẫu nhiên theo tiến trình API — khởi động lại API thì liên kết cũ hết hạn). Kiểm thử: `bash tools/db-reset.sh && bash tools/announcements-smoke.sh`.
- Tài liệu nhân sự: phiên bản bất biến (thay file = phiên bản mới), gỡ thay cho xóa; mọi lần tải ghi audit `document.downloaded`. File riêng tư + liên kết ký dùng chung `apps/api/src/files/private-files.ts` (chữ ký gắn loại tài nguyên). Smoke dùng vai trò riêng chỉ có quyền tài liệu — đừng gán `hr_ops` cho nhân viên mẫu trong smoke (test RLS khác chạy sau sẽ lỗi). Kiểm thử: `bash tools/db-reset.sh && bash tools/documents-smoke.sh`.
- Xóa vĩnh viễn doanh nghiệp (Console, chỉ Quản trị Console, doanh nghiệp phải tạm khóa/đã đóng, gõ lại mã): `purge_tenant` xóa mọi bảng có
  `tenant_id` (lặp tới khi hết, bỏ qua trigger bảo vệ nhờ cờ cục bộ `kavor.purge_tenant`), API xóa tiếp tài khoản Auth chỉ thuộc doanh nghiệp đó và file
  `<tenantId>/` trên mọi bucket; nhật ký nền tảng giữ dòng `tenant.deleted`. **Trigger mới trong schema public phải có
  `WHEN (coalesce(current_setting('kavor.purge_tenant', true), '') = '')`** (pgTAP `platform_purge` kiểm); bảng mới không có `tenant_id` nhưng trỏ
  vào dữ liệu doanh nghiệp thì thêm lệnh xóa riêng trong `purge_tenant`. Kiểm thử: `bash tools/db-reset.sh && bash tools/purge-smoke.sh`.
- Vận hành tenant (Console): tenant `suspended`/`closed` bị chặn ở API (`assertTenantOpen` trong `auth.service.ts`, mã `AUTH_TENANT_SUSPENDED`) và ở RLS (`is_active_member`, `current_employee_ids`, `permission_scopes` bỏ qua tenant đó); `closed` là trạng thái cuối (trigger). Giới hạn nhân sự = hồ sơ chưa nghỉ việc, kiểm ở API (`apps/api/src/tenancy/plan.ts`) khi thêm/khôi phục hồ sơ — không chặn khôi phục chủ sở hữu. Smoke đóng tenant Mẫu B nên cần DB vừa reset. Kiểm thử: `bash tools/db-reset.sh && bash tools/console-ops-smoke.sh`.
- Nhập nhân viên: `POST /admin/employees/import` mặc định chỉ xem trước (`dryRun`); ghi bằng `import_employees` (nguyên khối, mã đã có bỏ qua). Thêm cột mới thì cập nhật `EMPLOYEE_IMPORT_COLUMNS` (contracts) + `parseEmployeeCsv` + file mẫu. Kiểm thử: `bash tools/db-reset.sh && bash tools/import-smoke.sh`.
- Cơ cấu tổ chức/vai trò: đơn vị không xóa (ngừng = `effective_to`; chỉ xóa đơn vị tạo nhầm chưa từng hiệu lực), gán vai trò chỉ theo 5 vai trò mẫu với phạm vi trong `ROLE_META` (`apps/api/src/admin/org.service.ts`); vai trò Employee tự gán khi kích hoạt. Quyền mới cần cho vai trò hệ thống thì tạo bản ghi `permissions` ngay trong migration (seed chạy sau migration). Kiểm thử: `bash tools/db-reset.sh && bash tools/org-smoke.sh`.
- Support access: phiên do Tenant Admin duyệt (`support_access_sessions`, thời hạn do trigger tính, không tin client); API Console kiểm `support_session_active` ở mỗi lần xem và ghi audit `support.viewed`. Thêm bảng cần Realtime cho web HR thì phải thêm vào danh sách cố định trong `apps/admin-web/app/_lib/client.ts` (`startRealtime`) và kênh chỉ nhận sự kiện sau khi "Subscribed to PostgreSQL" (vài giây sau khi mở trang). Kiểm thử: `bash tools/db-reset.sh && bash tools/support-smoke.sh`.
- Đề nghị sửa hồ sơ (đơn `profile_change`, mã HS): duyệt xong trigger SQL `apply_profile_change` áp vào `employees.phone`/`employee_profiles`/`employee_bank_accounts` — không ghi hồ sơ từ API. Số tài khoản đầy đủ chỉ ở `profile_change_bank`/`employee_bank_accounts` (nội dung đơn, audit, thông báo chỉ 4 số cuối); trả số đầy đủ khi là chính nhân viên hoặc có `employee.sensitive.read` trong phạm vi. Kiểm thử: `bash tools/db-reset.sh && bash tools/profile-smoke.sh`.
- Ngày "hôm nay" luôn theo múi giờ tenant: SQL dùng `public.tenant_today(tenant_id)` (không dùng `current_date` — DB chạy UTC), API dùng `localParts(new Date(), tz)` hoặc `TimesheetService.tenantClock`, web dùng `tenantToday(tz)` (không dùng `toISOString().slice(0, 10)` cho ngày hiện tại). `supabase test db` có thể trả mã lỗi do telemetry (PostHog timeout) dù "Result: PASS" — đọc dòng Result.
- `expo run:ios --device` hay treo ở bước "Connecting to" iPhone: build bằng `xcodebuild ... -destination 'generic/platform=iOS'` rồi `xcrun devicectl device install app`.
- Quyền Thông báo/Vị trí của app (`apps/mobile/src/perms.ts`): lần đầu vào trang chủ hỏi bằng hộp thoại mặc định của hệ điều hành (một lần, cờ
  `kavor.permsAsked` trong Keychain), sau đó hỏi Face ID. App không tự thu hồi quyền được: công tắc trong Bảo mật và thiết bị mở Cài đặt của máy; tắt vị trí
  có cảnh báo, trang chủ hiện thẻ "Kavor chưa có quyền vị trí". Test Node phải mock `./perms`.
- Ảnh simulator không đồng nghĩa với kiểm thử máy thật. Animation, safe area, Face ID và hành vi navbar phải xác nhận lại trên thiết bị vật lý.
- Không đưa Supabase publishable key hoặc thông tin đăng nhập vào tài liệu/commit; dùng biến môi trường.
