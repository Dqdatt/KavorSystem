# HANDOFF — 15/11/2026

**Mục tiêu phiên vừa rồi:** web HR v2 giống prototype `Kavor HR Admin Prototype v2.html` 100% (chỉ UI, chưa làm số liệu/API mới).

## Đã xong (đã push `claude/ecstatic-pascal-dblg7v` → Vercel deploy; chưa kiểm online sau `977f0cc`)
- `1ab49be` sửa lệch đợt 1 + P3: khối Sắp tới, Tìm nhanh Ctrl K, giấy tờ 3/4 (API `checklist/gaps` thêm `required`, `requiredCount`), chức danh trưởng đơn vị; sửa smoke leave/timesheet đạt giả (bash 3.2 bung `{a,b}`)
- `ec8236f` spacing đo trên bản online: topbar 14px 28px, toolbar 0 20px, bảng 13.5px + `table-wrap` 0 10px 8px, menu trái gap 2px, chân trang
- `8454334` rà local từng trang: chi tiết đơn (.note quá hạn), nút trang lên hàng tab (`#tab-actions`), bộ icon = prototype, avatar 6 màu (`--av0..5`), `.small/.sub/.row/.col`, Empty có icon, hồ sơ tab Chấm công (lịch + Từng ngày) và Cá nhân
- `977f0cc` ô chấm công đơn OT gọn, đường dẫn hồ sơ có tên, Cài đặt đổi mục bằng state (nút topbar không chớp)
- verify-all đầy đủ đạt ở `1ab49be`; các commit sau `--quick` (typecheck, unit, pgTAP 586)

## Đang dở
- Không có code dở. Chưa so được (thiếu dữ liệu local): hồ sơ tab Lương/Giấy tờ/Đơn từ/Lịch sử, ngăn kéo/hộp thoại, tab phụ trang Lương.
- DB local đang có dữ liệu thử: đơn GT-0004/0005 quá hạn, OT-0001, hạn giải trình nới 31 ngày (sửa thẳng `policy_versions`) — reset DB là mất.

## Quyết định đã chốt
- Chỉ sửa UI; giữ chức năng thật dù prototype không có: ô tìm Bản tin/Tài liệu, dropdown "Đang làm việc", nút lọc danh sách đơn, phần áp dụng/lịch sử thẻ quy định.
- Giữ logo Kavor thật; không làm nút/link giả (Ghi nhớ, Điều khoản, nút ✦ prototype, Nhắc).
- Trang có tab: nút trang ở bên phải hàng tab; không có tab: ở topbar. Phân cách meta dùng vạch `.vs` (chuỗi " | " qua `vs()`).
- Đường dẫn hồ sơ hiện "Nhân viên / Tên" (người dùng không muốn kiểu "Nhân viên /").
- Rà online bằng Claude in Chrome (extension không đọc `file://`; prototype phục vụ ở `127.0.0.1:8765`/`localhost:8765` từ scratchpad).

## Nợ Ponytail
- `employees/page.tsx` DocTicks: người đủ giấy tờ vẽ theo tổng mục bắt buộc của công ty — sửa khi `checklist/gaps` trả cả người đủ.

## Việc tiếp theo
1. Kiểm bản online sau deploy `977f0cc` + rà các phần chưa so (hồ sơ tab Lương/Giấy tờ/Đơn từ/Lịch sử, drawer/modal) với dữ liệu thử đầy đủ `[opus high]`
2. Nút "Nhắc" (endpoint HR + migration kind thông báo + icon fallback web/mobile) `[opus high]`
3. Trang Lương theo prototype (quỹ lương nhiều kỳ, cơ cấu quỹ) `[opus xhigh]`

## File cần đọc đầu tiên
- `docs/plans/web-hr-v2-port.md`, `docs/TASKS.md`
- `apps/admin-web/app/(app)/shell.tsx`, `apps/admin-web/app/_ui/kit.tsx`
- `packages/web-ui/src/kavor.css` (khối cuối file)
