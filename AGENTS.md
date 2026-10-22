# AGENTS.md

## Kiến trúc

- Monorepo pnpm/Turborepo: `apps/admin-web` và `apps/console-web` là Next.js; `apps/mobile` là Expo/React Native; `apps/api` là backend TypeScript; `packages/contracts` chứa contract dùng chung; `packages/web-ui` chứa UI web dùng chung; `supabase/` chứa cấu hình/migration PostgreSQL.
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
- Ảnh simulator không đồng nghĩa với kiểm thử máy thật. Animation, safe area, Face ID và hành vi navbar phải xác nhận lại trên thiết bị vật lý.
- Không đưa Supabase publishable key hoặc thông tin đăng nhập vào tài liệu/commit; dùng biến môi trường.
