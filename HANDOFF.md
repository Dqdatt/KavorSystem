# HANDOFF — 14/11/2026

**Mục tiêu phiên vừa rồi:** áp thiết kế mới web HR (`Kavor HR Admin Prototype v2.html`) lên hệ thống, giống prototype 100%.

## Đã xong (đã push `claude/ecstatic-pascal-dblg7v` → Render/Vercel deploy)
- `6e50bea` nền chung (Plus Jakarta Sans, token, khung) + Nhân viên + hồ sơ trang riêng `/employees/[id]`
- `4a3ded7` Đơn hộp thư (API `only=others`, `status=done`) · `0e7400c` Chấm công (API `cells`, board `leave`)
- `d0be6e5` Ca & địa điểm + Nghỉ phép (API `leave/calendar`) · `8f4db46` Cơ cấu + Tài liệu + Bản tin
- `e5188ed` Tổng quan + Cài đặt + Đăng nhập · `cfa1cd8` Vai trò + Lương (chỉ giao diện)
- `b8985ff` sửa sau rà online: ngày nghỉ trả `state:"off"` (hr-smoke kiểm), autofill ô nhập, thanh bên, `PageSub`
- `22bcd7e` `ThemeSync`: giữ theme đã chọn khi hệ điều hành tối (lỗi cũ: React xóa `data-theme` lúc hydrate)
- `verify-all` đầy đủ đạt ở `cfa1cd8`; các commit sau qua `--quick` + smoke liên quan.

## Đang dở
- Không có code dở. Chưa xem bản online sau deploy `22bcd7e`. Dòng phụ Cơ cấu/Nghỉ phép, số đỏ Bản tin chưa xem bằng mắt.

## Quyết định đã chốt
- Prototype v2 là chuẩn web HR; font Plus Jakarta Sans (mobile giữ Montserrat); Cài đặt có ở thanh bên + menu tài khoản.
- Giữ tên class/biến cũ trong `kavor.css`, đổi giá trị; PageActions vẫn ở topbar (prototype đặt cạnh tab ở vài trang).
- Nút giả của prototype không có API (Nhắc, Giải trình hộ, Ghi nhớ, link Bảo mật/Điều khoản) → bỏ, không làm nút giả.
- Giao việc UI cho agent `laptrinh` theo `docs/plans/web-hr-v2-port.md` (tự chụp đối chiếu); Lương/Vai trò/Đăng nhập phiên chính tự review.
- Rà bản online bằng Claude in Chrome phải do phiên chính (agent con không có quyền site).

## Nợ Ponytail
- Không có `shortcut:` mới.

## Việc tiếp theo
1. Người dùng xem bản online, chỉ lệch còn lại → sửa theo quy trình port. `[sonnet]`
2. P3 API: nút "Nhắc" (chấm công/giấy tờ/bản tin), tiến độ giấy tờ theo người, chức danh trưởng đơn vị, khối "Sắp tới", Tìm nhanh Ctrl K. `[opus high]`
3. P3 lương: tổng quỹ lương nhiều kỳ cho biểu đồ + cơ cấu quỹ; xem thanh 4 bước bằng Kế toán HD0215. `[opus xhigh]`

## File cần đọc đầu tiên
- `docs/plans/web-hr-v2.md`, `docs/plans/web-hr-v2-port.md`
- `apps/admin-web/app/(app)/shell.tsx`, `apps/admin-web/app/_ui/kit.tsx`
- `packages/web-ui/src/kavor.css` (các khối "v2" cuối file)

Ghi chú máy: Docker + Supabase local + API + dev 3000/3001 + server prototype 8765 đang chạy; HD0007 đăng nhập = activate bằng `tools/smoke-lib.sh`,
xóa `auth.mfa_factors` của user, đăng nhập lấy khóa TOTP. `docs/plans/roadmap-competitive.md` chưa theo dõi, có từ trước — hỏi người dùng.
