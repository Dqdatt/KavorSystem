# Kavor sample data

Toàn bộ dữ liệu trong thư mục này là hư cấu và chỉ dùng cho development, demo, automated test và UAT.

## Thứ tự import

1. `departments.csv`
2. `positions.csv`
3. `employees.csv`
4. `shifts.csv`
5. `schedules.csv`
6. `attendance_events.csv`
7. `leave_opening_balances.csv`
8. `payroll_results.csv`

## Khóa liên kết

- Tenant: `HDG-001`.
- Employee: `employee_code`.
- Department: `department_code`.
- Position: `position_code`.
- Shift: `shift_code`.
- Payroll component dùng các cột chuẩn trong file kết quả mẫu.

## Kịch bản có chủ ý

- `HDG0005` làm ca đêm.
- `HDG0007` có event ngoài geofence để kiểm thử review.
- `HDG0008` có check-in gửi trễ từ Android offline queue.
- `HDG0010` đang thử việc, số dư phép năm bằng 0.
- Payroll sử dụng số tiền giả; không phản ánh chính sách hay thu nhập thật.
- `payroll_import_2026-10.csv`: file thử trang web Lương & tạm ứng → Kỳ lương → Import kết quả, đúng định dạng importer
  (cột theo mã thành phần, `NET` = thu nhập − khấu trừ) cho 9 nhân viên seed Hải Đăng. Nhập được ngay; cảnh báo kỳ công chưa
  khóa và ngày công lệch bảng công là đúng dự kiến. `payroll_results.csv` là định dạng cũ, importer không đọc.

## Quy tắc

- Không đưa dữ liệu thật vào commit.
- Nếu cần bộ dữ liệu lớn, sinh thêm từ các pattern này thay vì sao chép hồ sơ thật.
- File lỗi riêng nên được tạo trong automated tests để kiểm thử duplicate, missing mapping và invalid value.
