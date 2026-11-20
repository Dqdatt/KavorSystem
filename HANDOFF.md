# HANDOFF — 20/11/2026 (phiên 23)

**Mục tiêu phiên vừa rồi:** review + sửa bản PWA thử nghiệm (Antigravity/Argon làm 18/11) — lỗi dải trống đáy màn hình khi mở từ icon iPhone.
Người dùng: **không dùng `giao`** ở dự án này — workflow agent Claude (timcode/laptrinh/chaylenh/kiemtra).

## Đã xong (không có commit code: PWA nằm ở `experiments/kavor-pwa`, ẩn khỏi git qua `.git/info/exclude`)
- Nguyên nhân: iOS standalone + `black-translucent` → `height:100%` hụt đúng safe-area-inset-top, iOS co viewport và không vẽ phần dưới.
  Sửa: `@media (display-mode: standalone){html,body{height:100vh}}` + `#root` fixed `inset:0` (`public/index.html`).
- Gỡ hack của Argon: `LIFT_BOTTOM` (đè `StyleSheet.create` theo số bottom) ở `shims/pwa.ts` + `shims/react-native.ts`, StyleSheet khỏi
  danh sách shim (`metro.config.js`, `babel.config.js`), beacon `/__diag` (`pwa.ts`, `tools/serve.mjs`), log debug `tools/smoke-ui.mjs`;
  sửa CSS khung desktop (`inset:auto` đè `top`).
- Kiểm: iOS Simulator 26.3 (iPhone 17e) thêm MH chính → kín đáy, Dock `bottom:24` như native; `node tools/smoke-ui.mjs` 10 màn 0 lỗi.
- Chứng chỉ HTTPS tạo lại cho IP LAN mới `192.168.1.7` (cũ .14). `docs/TASKS.md`: thêm mục (Tùy chọn) PWA.

## Đang dở
- Server PWA chạy nền (dữ liệu mẫu): `https://192.168.1.7:8443` (iPhone) và `http://localhost:8090`; tắt: `pkill -f "tools/serve.mjs"`.
- Chưa thử trên iPhone thật: xóa icon cũ (IP .14) → Safari mở URL trên, chấp nhận chứng chỉ → Thêm vào MH chính → mở từ icon.

## Quyết định đã chốt (đừng hỏi lại — xem PROGRESS "Quyết định đã chốt", `docs/plans/hoan-thien-v1.md`)
- **v1 `d22f97f` là bản phát hành**; dịch vụ trả phí + quảng bá khi có khách. Tạm ứng 2 bước: **chặn** một người duyệt cả 2 bước.
- Tham số luật, máy chủ Singapore, bản đồ OSM: dùng tạm. Mục "(Tùy chọn)" mặc định không làm, người dùng muốn thì kéo vào Vòng 2.
- PWA là bản thử, không đụng hệ thống hiện tại (không vào workspace/turbo/verify-all/deploy).

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `attendance.ts` hàng đợi của người không đăng nhập lại; `leave.service.ts` sổ phép năm trước.
- PWA: service worker là bản tự xóa mọi cache (mất offline, xóa cache ảnh `kavor-img`) — khôi phục trước khi dùng PWA thật.

## Việc tiếp theo
1. Nếu người dùng muốn tiếp PWA: khôi phục SW (HTML network-first, asset hash cache-first), gom 3 cơ chế chuyển hướng `react-native`
   (babel + metro + sửa singleton) về một, thử `build:api` + iPhone thật — `[opus high]`.
2. Backlog Vòng 1 (chỉ khi người dùng giao): tạm ứng + `payroll_law` ngày VN + phạm vi phòng ban con + phép tồn theo năm `[opus xhigh]`.
3. Vòng 1 phần còn lại (mobile bảo mật, validate API, …) → verify-all → deploy → UAT ngắn `[opus high]`. iPhone 11 hết hạn ký ~26/11 → cài lại.

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (Cạm bẫy), `experiments/kavor-pwa/README.md`, `experiments/kavor-pwa/shims/pwa.ts`, `PROGRESS.md` mục đầu.
