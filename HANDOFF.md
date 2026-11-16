# HANDOFF — 16/11/2026 (phiên 11)

**Mục tiêu phiên vừa rồi:** làm công cụ "HR điều chỉnh công" trên web, thay cho việc sửa giải trình duyệt nhầm giờ bằng SQL.

## Đã xong
- `8cf718b` (chưa push, verify-all đầy đủ đạt trước lần chỉnh UI cuối; typecheck web sau chỉnh đạt): migration `202612060001_attendance_hr_adjust.sql`
  (quyền `attendance.adjust`, thông báo `attendance.adjusted`, hàm `hr_adjust_attendance`), pgTAP 18, API `POST admin/timesheets/:employeeId/adjust`,
  `canAdjust` + `TimesheetDay.hrAdjustment`, smoke trong `timesheet-smoke.sh`, web nút bút ở ngăn kéo chấm công + hộp sửa giờ, mobile "HR đã điều chỉnh" + lý do.
- Đã xem trên web local bằng HR thử (Mai Phương Thảo): lưu được, bảng tự cập nhật, Lịch sử hồ sơ có "Điều chỉnh công", màn 375px dùng được.

## Đang dở
- Nhánh có 3 commit chưa push (`d4f1874`, `5a6f001`, `8cf718b`). Migration `202612060001` CHƯA lên Supabase cloud.
- App iPhone chưa build lại (gồm trang chủ ngày nghỉ `79014e6` + nhãn HR điều chỉnh).
- Từ phiên trước: lỗi 403 Tổng quan web online chưa rõ nguồn; `docs/plans/roadmap-competitive.md` chưa track, người dùng chưa quyết (không commit).
- DB local: đã nạp `tools/demo-data.sh` + một điều chỉnh thử ngày 13/11 của HDG0002.

## Quyết định đã chốt
- HR điều chỉnh công: nhập cả giờ vào và ra; quyền `attendance.adjust` chỉ HCNS + Quản trị viên công ty (không Quản lý); chặn tự sửa, ngày tới,
  ngoài thời gian làm việc, kỳ khóa, ngày có giải trình chờ; lý do 5–500 ký tự; nhật ký gắn hồ sơ NV; thông báo NV. Không thêm cột: `request_id` null = HR.
  Chưa hỗ trợ xóa một giờ, ca qua đêm. Dòng sửa tay TSNV002 04/11 sẽ hiện là "HR điều chỉnh".
- Dữ liệu online là thật: chỉ xem; không bấm lưu điều chỉnh, chấm công, gửi đơn, "Gửi lời mời". Mật khẩu online do người dùng tự gõ.
- Vào/nghỉ giữa kỳ (cách a), giờ ra ≤ giờ vào = Thiếu ra 0 công (cách 2), tạm nghỉ vẫn tính công chuẩn — chi tiết ở AGENTS.md.

## Nợ Ponytail
- Phiên này không có `shortcut:` mới. Nợ cũ: `apps/api/src/timesheet/pause.ts` (50% theo ngày lịch, nghỉ ốm không cộng đơn lẻ).

## Việc tiếp theo
1. Deploy: `bash tools/verify-all.sh --quick` → chạy migration lên cloud bằng `tools/cloud-supabase.sh` (hỏi người dùng trước, lệnh ghi DB thật) → push nhánh
   → kiểm online chỉ xem (nút bút hiện ở ngăn kéo; TSNV002 04/11 ghi "HR điều chỉnh") — `[opus high]`
2. Build lại app iPhone bản online (cắm cáp; người dùng tự gõ mật khẩu TSNV002) — `[sonnet]`
3. Việc mở kế tiếp trong `docs/TASKS.md`: "Xem số tài khoản" `[opus xhigh]` hoặc thông báo lặp chữ `[sonnet]`.

## File cần đọc đầu tiên
- `docs/TASKS.md`, `docs/DEPLOY.md`
- `supabase/migrations/202612060001_attendance_hr_adjust.sql`
- `tools/cloud-supabase.sh`
