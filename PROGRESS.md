# PROGRESS
_Cập nhật: 2026-10-22 21:15 +07 — bởi Claude (Opus 5.5)_

## Mục tiêu đang làm
Port toàn bộ `Kavor HRM Prototype.html` sang app React Native sao cho giống prototype, sửa các lỗi UI nhỏ và cài bản build lên iPhone 11 thật ("Dqdatt"). Xong khi 70 trạng thái prototype/native khớp và app chạy được trên máy thật. Chưa push git (theo yêu cầu người dùng).

## Đã xong
- Chấm công thật (22/10): migration `202610220003_attendance.sql` (work_locations, employee_devices, attendance_events bất biến + chống trùng, RLS) đã push lên project thật; pgTAP 9 test. API `/me/devices`, `/me/attendance/today`, `/me/attendance/events` (Idempotency-Key), `/dev/work-location` — `apps/api/src/attendance`, `tools/attendance-smoke.sh` 19/19. Mobile `src/attendance.ts`: GPS thật (`expo-location`, xin quyền khi chấm công), mã cài đặt trong Keychain, hàng đợi offline tự gửi lại khi mở app; biên nhận/ngoài vùng/E19/E20/E21 dùng dữ liệu thật. Đã thử trên simulator: đăng ký máy → vào ca trong vùng → ra ca ngoài vùng bị từ chối → mất mạng lưu hàng đợi → mở lại tự gửi (kiểm tra DB đúng giờ máy).
- Auth thật (22/10): migration `202610220002_service_role_grants.sql` (service_role không có quyền DML mặc định) — đã push cả hai migration lên project thật; OTP email tiếng Việt (`supabase/templates/otp.html`); giới hạn thử sai; chính sách mật khẩu dùng chung trong `@kavor/contracts`; ô OTP nhận gõ nhanh/tự điền mã; sửa lỗi mất phiên sau bước đăng ký thiết bị.
- Nền tảng (22/10): Supabase local chạy ở cổng 553xx (máy có project local khác chiếm 543xx); phát hiện và sửa: 3 bảng chưa bật RLS, client không có quyền SELECT nên policy cũ vô tác dụng, anon có TRUNCATE; audit_logs chỉ thêm. API kiểm tra cấu hình khi khởi động (`apps/api/src/config.ts`, 4 test). CI thêm job `database` (db reset + test db + lint).
- Mobile: màn Hồ sơ → Bảo mật và thiết bị (bật/tắt Face ID đăng nhập & mở khóa lương).
- Bước 1 (22/10): Face ID thật + phiên Keychain (`src/auth.ts`); bắt lỗi nội bộ (`src/crash.tsx`); lớp dữ liệu `src/api/` (KavorApi + mock); Android build chạy trên emulator `Kavor_Pixel_6`, chụp đủ 70 trạng thái (`docs/ui-comparison/android/`) và sửa các lỗi riêng Android (chữ bị cắt, blur, font nhúng native).
- Viết lại toàn bộ app mobile, port 1:1 từ prototype: dữ liệu mẫu, icon SVG gốc, minh họa ILLUS, state/router/actions, sheet, toast, netbar, quick menu, widget/springboard, lỗi E01–E31 — `apps/mobile/src/` (`apps/mobile/App.tsx` chỉ re-export `src/App`)
- Deep link `kavor://payslips|advance` giờ đi qua `go()` nên vẫn phải nhập PIN (trước đây bỏ qua PIN)
- Bộ so sánh 70 trạng thái, 70/70 có ảnh native, có manifest và README — `docs/ui-comparison/`
- Công cụ chụp/ghép tự động — `tools/ui-compare/` (states.mjs, capture-prototype.mjs, capture-native.py, pair.py, manifest.py)
- Đã build Release và cài lên iPhone 11 thật "Dqdatt" (UDID 00008030-001450C63C04202E), app mở được
- Splash screen: splash gốc nền #065F46 + logo trắng (`expo-splash-screen`, ảnh `apps/mobile/assets/splash-logo.png`), sau đó lớp phủ JS `apps/mobile/src/splash.tsx` hiện gradient, chữ KAVOR rồi mờ vào app (~1,3 s, tôn trọng Reduce Motion; tắt khi chạy QA). Đã cài Release lên iPhone thật.
- Icon app mới: nền gradient emerald (#12976F → #065F46), logo trắng — nguồn `apps/mobile/assets/icon.svg`; Android dùng `adaptive-icon.png` trên nền #065F46
- Kiểm tra ngày 22/10: `pnpm turbo run typecheck test build --force` pass 18/18 task (test thật chỉ có contracts 2 + api 2)

## Đang dở (QUAN TRỌNG NHẤT)
- Chấm công thật đã xong (xem "Đã xong"); người dùng cần thử trên iPhone: DB local vừa reset nên phải kích hoạt lại HD0142 (OTP xem ở Mailpit), đăng ký thiết bị, rồi dùng nút "Dev: đặt văn phòng tại vị trí hiện tại" ở màn Chấm công (vì văn phòng mẫu ở Q1).
- Ca/giờ muộn/về sớm trên mobile vẫn tính theo ca 08:00–17:00 cố định của prototype; chưa lấy `shift` từ API.
- Auth thật (22/10) đã xong và commit: API `/auth/*` + `/me` (apps/api/src/auth), mobile gọi API khi build có `EXPO_PUBLIC_API_URL`. Kiểm thử: `tools/auth-smoke.sh` 15/15 bước; trên simulator đã kích hoạt → đăng nhập → mở lại app giữ phiên.
- Bản trên iPhone trỏ tới API `http://192.168.1.22:4000/api/v1` (IP LAN của Mac): Mac phải chạy `pnpm dev:backend`, cùng Wi-Fi. Nếu IP Mac đổi phải build lại app.
- Chưa có môi trường staging thật cho auth: project Supabase thật mới có migration, chưa có dữ liệu nhân viên và SMTP riêng (SMTP mặc định của Supabase chỉ gửi tới thành viên project).
- Người dùng cần tự đổi publishable key trên Supabase Dashboard (Settings → API Keys: tạo publishable key mới, xóa key `default` cũ).

## Quyết định đã chốt
- Mobile hỗ trợ cả iOS và Android, không phụ thuộc Expo Go; dùng native build cho máy thật — vì người dùng muốn cài trực tiếp và Expo Go từng không tương thích.
- UI mobile phải bám sát prototype HTML, gồm liquid glass, animation, safe area và navbar tự ẩn/hiện khi cuộn — vì đây là tiêu chí chốt UI trước backend.
- Supabase/PostgreSQL là database chính; Google Sheets là nguồn import vào database chứ không phải database vận hành — vì doanh nghiệp có thể chưa sẵn sàng chuyển dữ liệu ngay.
- Payroll cấu hình theo từng công ty; không phát triển chữ ký số — theo yêu cầu sản phẩm đã chốt.
- Kavor là nền tảng SaaS quản trị nhân sự cho doanh nghiệp, không phải dịch vụ đăng ký kinh doanh — để tránh hiểu sai phạm vi sản phẩm.

## Đã thử nhưng bỏ
- Expo Go cho quy trình chạy mobile chính — bỏ vì lệch phiên bản SDK và không phù hợp kiểm thử native/Face ID trên thiết bị.
- Dùng icon Face ID tự vẽ/vector — bỏ vì không giống biểu tượng Apple; iOS chuyển sang `expo-symbols`.
- Áp safe area bằng dải nền trắng độc lập ở đầu/cuối màn hình — bỏ vì tạo khoảng trắng thừa; safe area phải hòa vào background/surface của từng màn.
- Giữ ảnh chụp toàn trang và ảnh simulator raw — bỏ vì trùng dữ liệu, làm commit phình to; chỉ giữ bản 390×844 dùng để so sánh.

## Vấn đề/bug còn tồn tại
- Ảnh native lấy từ simulator; chưa có ảnh/video từ iPhone 11 thật.
- Ngoài auth và chấm công, các màn (công tháng, đơn từ, lương, tin tức) vẫn dùng dữ liệu mẫu.
- Android chưa thử luồng chấm công thật (GPS/hàng đợi) trên emulator.
- Test tự động của admin-web, console-web, mobile, web-ui vẫn là placeholder.
- Trên bản dev, gõ phím "r" khi không focus ô nhập sẽ làm Metro reload (chỉ ảnh hưởng dev).

## Bước tiếp theo
1. Bảng công tháng/lịch sử chấm công từ API (màn Công đang dùng dữ liệu mẫu), ca theo tenant, giải trình công gửi lên API.
2. Staging thật: SMTP riêng (Resend/SES) cho project Supabase, nhập dữ liệu nhân viên, deploy API.
3. Web app (HR/Admin, Kavor Console) — HR tạo/nhập nhân viên để họ tự kích hoạt.
4. Sentry khi có tài khoản.

## Câu hỏi đang chờ người dùng trả lời
- Không có.

## Nhật ký
- 2026-10-22 — Chấm công thật: thiết bị, GPS, geofence, hàng đợi offline; push migration attendance lên project thật; cài bản dev lên iPhone.
- 2026-10-22 — Auth thật: kích hoạt/OTP/đăng nhập/quên mật khẩu qua API + Supabase Auth; push migration lên project thật; cài bản dùng API lên iPhone.
- 2026-10-22 — Màn Bảo mật và thiết bị; siết RLS + test cách ly tenant; config validation API; CI database job.
- 2026-10-22 — Bước 1 xong: Face ID thật, Keychain, crash handler, lớp api, Android emulator 70/70 trạng thái; cài Release lên iPhone.
- 2026-10-22 — Thêm splash screen, build Release lên iPhone 11 thật, commit + push.
- 2026-10-22 — Đổi icon app (nền emerald, logo trắng); commit c60232d, tag mobile-v0.1.0, push.
- 2026-10-22 — Viết lại app mobile theo prototype, 70/70 trạng thái khớp, cài Release lên iPhone 11 thật.
- 2026-10-22 — Chụp đủ 63 màn prototype, 33 màn native và bàn giao chính xác phần ghép/đánh giá UI còn dở.
