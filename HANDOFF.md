# HANDOFF — 14/11/2026

**Mục tiêu phiên:** áp thiết kế mới web HR (`Kavor HR Admin Prototype v2.html`) lên hệ thống, giống prototype 100% (người dùng yêu cầu).
Kế hoạch: `docs/plans/web-hr-v2.md`; quy trình giao agent port từng trang: `docs/plans/web-hr-v2-port.md`.

## Đã xong (nhánh `claude/ecstatic-pascal-dblg7v`, **chưa push** — push = Render/Vercel deploy)
- `6e50bea` nền chung (font Plus Jakarta Sans tự host, token, khung trang) + Nhân viên + hồ sơ trang riêng `/employees/[id]`
- `4a3ded7` Đơn & phê duyệt hộp thư 2 cột (API `only=others`, `status=done`)
- `0e7400c` Chấm công · `d0be6e5` Ca & địa điểm + Nghỉ phép (API `leave/calendar`) · `8f4db46` Cơ cấu + Tài liệu + Bản tin
- `e5188ed` Tổng quan + Cài đặt + Đăng nhập + thẻ số liệu/thanh bên · commit cuối: Vai trò + Lương (chỉ giao diện)
- Mỗi commit qua `verify-all --quick`; smoke requests/timesheet/leave có kiểm mới và đạt.

## Còn lệch / cần API (P3)
- Việc chỉ là nút giả trong prototype, chưa có API: "Nhắc" (chấm công, giấy tờ, bản tin), "Giải trình hộ", xuất danh sách hôm nay, xuất Excel OT.
- Lương: biểu đồ quỹ lương theo tháng + cơ cấu quỹ (cần tổng tiền nhiều kỳ). Tab Bảng lương kỳ này/Tạm ứng/Khoản phụ cấp chưa đối chiếu ảnh;
  thanh 4 bước + "Cần rà soát" chưa xem bằng mắt (HD0007 không có `payroll.read` — dùng Kế toán HD0215).
- Vai trò: ma trận chỉ đọc (sửa quyền cần vai trò tùy chỉnh). Tìm nhanh Ctrl K chưa làm. Tổng quan: khối "Sắp tới" thay bằng Nhân viên mới.
- Tài liệu: tiến độ giấy tờ theo người; Cơ cấu: chức danh trưởng đơn vị (`OrgUnit.head`).
- Lịch nghỉ gọi `leave/calendar` lặp 4 lần khi mở trang; Tổng quan gọi `settings/checklist` 2 lần.

## Chưa kiểm
- Theme tối các trang mới; bên trong Console (dùng chung `.metric-card`, `pay-calc`); Duyệt/Từ chối trên hộp thư (HR mẫu không có đơn chờ mình).
- Bản online sau deploy.

## Trạng thái máy
- Docker + Supabase local + API (`tools/dev-backend.sh`) + dev server 3000/3001 đang chạy; server tĩnh prototype cổng 8765 (preview `proto-v2`, file ở scratchpad — đã gỡ khỏi launch.json).
- DB local bị reset nhiều lần; HD0007 đăng nhập bằng mật khẩu smoke + TOTP mới (xóa `auth.mfa_factors` của user rồi đăng nhập lại để lấy khóa).
- `docs/plans/roadmap-competitive.md` chưa theo dõi, có từ trước — hỏi người dùng.

## Việc tiếp theo
1. Người dùng xem từng trang, chỉ chỗ lệch. `[sonnet laptrinh]`
2. P3: API cho các mục "cần API" ở trên (tiền lương → Opus xhigh tự làm). 
3. Push lên nhánh deploy khi người dùng bảo (chạy `verify-all` đầy đủ trước).
