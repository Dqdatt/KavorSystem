# Nhập nhân viên hàng loạt (web HR)

Người dùng giao (26/10, phiên cloud): "cứ làm tiếp, done thì push". Module tiếp theo sau Cơ cấu tổ chức + Phân quyền vì công ty mới không thể thêm
từng người một. Quyết định dưới đây là **mặc định do Claude chọn**, chờ review.

Nguồn: `PERMISSION_MATRIX.md` §4 ("Import nhân viên": HR Ops ✓, Tenant Admin ✓); AGENTS.md (Google Sheets chỉ là nguồn import, Supabase là dữ liệu
vận hành); prototype HR page-organization có nút "Import" (chưa có màn) → thiết kế bổ sung trên trang Nhân viên.

- Định dạng: CSV UTF-8 (Excel "CSV UTF-8", Google Sheets "Tải xuống → CSV"); chưa đọc trực tiếp .xlsx hay kết nối Google Sheets.
- Cột (dòng tiêu đề bắt buộc, thứ tự tùy ý): `employee_code`, `full_name`, `work_email`, `hire_date`, `employment_type`, `department_code`,
  `position_code` (bắt buộc); `phone`, `manager_code` (không bắt buộc). Ngày `YYYY-MM-DD` hoặc `DD/MM/YYYY`; loại hợp đồng nhận mã
  (`official`…) hoặc chữ ("Chính thức", "Thử việc", "Cộng tác viên", "Thực tập"). File mẫu: `sample-data/employees_import_sample.csv`.
- Hai bước: tải file → xem trước từng dòng (Tạo mới / Đã có — bỏ qua / Lỗi + lý do) → "Nhập". Chỉ nhập khi **cả file không có lỗi**; ghi nguyên khối
  trong một transaction (`import_employees`). Mã nhân viên đã có thì bỏ qua (nhập lại cùng file không tạo trùng, không sửa hồ sơ cũ).
- Kiểm tra: bắt buộc, định dạng, trùng mã/email trong file, email đã dùng ở hồ sơ khác, phòng ban/chức danh tồn tại và còn hoạt động, phòng ban nằm
  trong phạm vi `employee.create` của người nhập, quản lý có sẵn hoặc có trong file, giới hạn nhân sự của gói (tính cả số dòng tạo mới). Tối đa 1.000 dòng.
- Không gửi lời mời tự động (HR gửi từng người hoặc làm "gửi lời mời hàng loạt" sau). Audit: một dòng `employee.imported` (tên file, số dòng) + mỗi
  hồ sơ một dòng `employee.created` nguồn import (không chép email/điện thoại vào audit tổng).
- Chưa có: cập nhật hồ sơ cũ bằng file, đọc .xlsx, đồng bộ Google Sheets định kỳ, nhập lương cơ bản/tài khoản ngân hàng.
