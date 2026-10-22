# PROGRESS
_Cập nhật: 2026-10-22 09:45 +07 — bởi Claude (Opus 5.5)_

## Mục tiêu đang làm
Port toàn bộ `Kavor HRM Prototype.html` sang app React Native sao cho giống prototype, sửa các lỗi UI nhỏ và cài bản build lên iPhone 11 thật ("Dqdatt"). Xong khi 70 trạng thái prototype/native khớp và app chạy được trên máy thật. Chưa push git (theo yêu cầu người dùng).

## Đã xong
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
- Bước 1 đã xong và commit (22/10). Người dùng cần thử trên iPhone thật: Face ID thật (đăng nhập mật khẩu một lần rồi thử nút Face ID; nút Face ID trong PIN), mở lại app phải vào thẳng trang chủ, đăng xuất phải về màn đăng nhập.
- Chưa có Sentry (cần tài khoản); `src/crash.tsx` chỉ lưu lỗi trong máy.

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
- Face ID và PIN vẫn là mô phỏng UI (chưa gọi LocalAuthentication); chưa có backend.
- Android chưa build/kiểm tra lại sau khi viết lại UI (code dùng API chung của RN 0.86, `boxShadow`/`experimental_backgroundImage` cần kiểm tra trên Android).
- Test tự động của admin-web, console-web, mobile, web-ui vẫn là placeholder.
- Trên bản dev, gõ phím "r" khi không focus ô nhập sẽ làm Metro reload (chỉ ảnh hưởng dev).

## Bước tiếp theo
1. Nền tảng: Supabase staging, secret/config validation, migration check trên CI.
2. Sprint 2: auth/activation/OTP thật, tenant context + RLS + audit; viết `httpApi` theo interface `KavorApi` và nối đăng nhập mobile.
3. Chấm công thật: API idempotent + geofence + hàng đợi offline trên mobile.
4. Web app (HR/Admin `apps/admin-web`, Kavor Console `apps/console-web`).
5. Sentry khi có tài khoản.

## Câu hỏi đang chờ người dùng trả lời
- Không có.

## Nhật ký
- 2026-10-22 — Bước 1 xong: Face ID thật, Keychain, crash handler, lớp api, Android emulator 70/70 trạng thái; cài Release lên iPhone.
- 2026-10-22 — Thêm splash screen, build Release lên iPhone 11 thật, commit + push.
- 2026-10-22 — Đổi icon app (nền emerald, logo trắng); commit c60232d, tag mobile-v0.1.0, push.
- 2026-10-22 — Viết lại app mobile theo prototype, 70/70 trạng thái khớp, cài Release lên iPhone 11 thật.
- 2026-10-22 — Chụp đủ 63 màn prototype, 33 màn native và bàn giao chính xác phần ghép/đánh giá UI còn dở.
