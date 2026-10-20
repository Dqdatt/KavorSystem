# Kavor HRM — Source of Truth Matrix mẫu

> Tenant: Hải Đăng Group (`HDG-001`)  
> Giai đoạn: Development và pilot giả lập  
> Nguyên tắc: Mỗi dataset chỉ có một nguồn được quyền chỉnh sửa tại một thời điểm

## 1. Ma trận nguồn dữ liệu

| Dataset | Nguồn ban đầu | Nguồn vận hành mục tiêu | Chiều đồng bộ | Tần suất mẫu | Khóa đối chiếu | Người xác nhận conflict |
|---|---|---|---|---|---|---|
| Tenant settings | Kavor | Kavor | Không sync | Khi thay đổi | `tenant_code` | Tenant Admin |
| Pháp nhân/chi nhánh | Google Sheets | Kavor | Sheet → Kavor | Thủ công | `entity_code`, `branch_code` | HR Admin |
| Phòng ban/chức danh | Google Sheets | Kavor | Sheet → Kavor | Thủ công | `department_code`, `position_code` | HR Admin |
| Employee master | Google Sheets | Kavor sau cutover | Sheet → Kavor | Thủ công | `employee_code` | HR Admin |
| Assignment/status | Google Sheets | Kavor sau cutover | Sheet → Kavor | Thủ công | `employee_code` + ngày hiệu lực | HR Admin |
| Tài khoản người dùng | Kavor | Kavor | Không sync | Real time | `user_id` | Tenant Admin |
| Role/permission | Kavor | Kavor | Không sync | Real time | `membership_id` | Tenant Admin |
| Ca làm | Kavor | Kavor | Có thể import lần đầu | Theo thay đổi | `shift_code` | HR Ops |
| Lịch làm | Kavor | Kavor | Import tùy chọn | Tuần/tháng | `employee_code` + `work_date` | HR Ops |
| Attendance event | Mobile/Kavor | Kavor | App/device → Kavor | Real time/offline retry | `idempotency_key` | HR Ops |
| Timesheet | Kavor tính | Kavor | Nội bộ | Khi event/adjustment đổi | Employee + kỳ | HR Ops |
| Leave opening balance | Google Sheets | Kavor | Import một lần | Cutover | Employee + leave type + năm | HR Ops |
| Leave ledger/request | Kavor | Kavor | Không sync | Real time | Transaction/request ID | HR Ops |
| OT/explanation | Kavor | Kavor | Không sync | Real time | Request ID | HR Ops |
| Payroll input | Kavor/export | Tùy tenant | Kavor → Sheet | Mỗi kỳ | Employee + component + kỳ | Payroll |
| Payroll result | Google Sheets | Sheet trong MVP | Sheet → Kavor | Mỗi kỳ | Employee + component + kỳ | Payroll |
| Payslip | Kavor | Kavor | Sinh từ payroll result | Mỗi kỳ | Employee + kỳ | Payroll |
| Tạm ứng | Kavor | Kavor | Có thể export | Real time/mỗi kỳ | Advance ID | Payroll |
| Document metadata | Kavor | Kavor | Không sync | Khi thay đổi | Document ID | HR Ops |
| Document binary | Object Storage | Object Storage | Không sync | Khi upload | Storage key + checksum | HR Ops |
| Request/workflow | Kavor | Kavor | Không sync | Real time | Request ID | Process owner |
| Audit log | Kavor | Kavor | Không sync | Real time | Audit ID | Auditor |
| Notification | Kavor | Kavor | Kavor → APNs/FCM/email | Event driven | Deduplication key | System owner |

## 2. Quy tắc cutover employee master

### Trước cutover

- Google Sheets là nguồn chỉnh sửa employee master.
- Kavor chỉ nhận dữ liệu sau preview và xác nhận.
- HR không chỉnh cùng một trường ở hai nơi.

### Trong cutover

1. Chốt thời điểm đóng chỉnh sửa Sheet.
2. Chụp raw snapshot và checksum.
3. Import, validate và reconcile số lượng/trạng thái.
4. HR ký xác nhận.
5. Đổi cấu hình source of truth sang Kavor.
6. Sheet chuyển read-only hoặc chỉ nhận export.

### Sau cutover

- Employee master chỉnh tại Kavor.
- Google Sheets chỉ dùng để export/report nếu cần.
- Mọi thay đổi hồ sơ nhạy cảm qua change request và audit.

## 3. Conflict policy

| Tình huống | Xử lý |
|---|---|
| Cùng `employee_code`, email khác | Đánh dấu conflict, không tự ghi đè |
| Dòng biến mất khỏi Sheet | Không xóa; tạo cảnh báo để HR xác nhận |
| Department code chưa tồn tại | Cho mapping hoặc tạo mới nếu có quyền |
| Hai dòng cùng khóa | Reject cả nhóm trùng, báo số dòng |
| Kavor đã sửa sau lần sync gần nhất | Hiển thị diff; HR chọn giữ Kavor hoặc nhận Sheet |
| Payroll thiếu employee | Reject dòng payroll |
| Payroll component chưa mapping | Reject dòng; Payroll bổ sung mapping |
| Sync job chạy lại | Dùng idempotency key/checksum, không ghi trùng |

## 4. Ownership

| Domain | Business owner | Technical owner |
|---|---|---|
| Employee/Organization | HR Lead | People module team |
| Attendance/Timesheet | HR Operations | Time module team |
| Leave/Workflow | HR Operations | Workflow module team |
| Payroll | Payroll Lead | Payroll module team |
| Google Sheets | HR/Payroll theo dataset | Integration team |
| Identity/Permission | Tenant Admin | Identity team |
| Platform health | Kavor Operations | Platform/SRE |

## 5. Kiểm soát bắt buộc

- Lưu raw snapshot trước normalize.
- Mapping có version.
- Mỗi job có tenant context, actor, source checksum và report.
- Không ghi thẳng staging vào production table.
- Domain service kiểm tra nghiệp vụ và transaction.
- Không hỗ trợ sync hai chiều cùng dataset trong MVP.
- Token Google dùng scope tối thiểu và có thể thu hồi.
