# Kavor HRM — Permission Matrix

> Phiên bản: 1.0  
> Ngày: 20/10/2026  
> Mô hình: RBAC kết hợp phạm vi tổ chức và thuộc tính dữ liệu

## 1. Vai trò chuẩn

| Mã | Vai trò | Mô tả |
|---|---|---|
| `employee` | Employee | Tự phục vụ dữ liệu của chính mình |
| `manager` | Manager | Quản lý và phê duyệt trong phạm vi đội ngũ |
| `hr_ops` | HR Operations | Vận hành hồ sơ, công, phép, đơn từ |
| `payroll` | Payroll/Accountant | Vận hành lương, tạm ứng và dữ liệu tài chính |
| `tenant_admin` | Tenant Admin | Quản trị tenant, user, role và cấu hình |
| `auditor` | Auditor | Đọc dữ liệu/audit được cấp, không chỉnh sửa |
| `platform_operator` | Kavor Platform Operator | Vận hành tenant và nền tảng |
| `platform_support` | Kavor Support | Hỗ trợ có lý do, thời hạn và scope |

Một người có thể mang nhiều role. Quyền hiệu lực là hợp các quyền cho phép trong phạm vi tương ứng; dữ liệu nhạy cảm vẫn yêu cầu permission riêng.

## 2. Phạm vi

| Scope | Ý nghĩa |
|---|---|
| `self` | Chính nhân viên hiện tại |
| `direct_reports` | Nhân viên báo cáo trực tiếp |
| `management_tree` | Toàn bộ cây quản lý được cấu hình |
| `team` | Một hoặc nhiều nhóm |
| `department` | Một hoặc nhiều phòng ban |
| `branch` | Một hoặc nhiều chi nhánh |
| `legal_entity` | Một hoặc nhiều pháp nhân |
| `tenant` | Toàn tenant |
| `platform` | Nền tảng Kavor, không tự động bao gồm dữ liệu tenant nhạy cảm |

## 3. Ký hiệu

- `✓`: Có quyền mặc định trong scope.
- `R`: Chỉ đọc.
- `A`: Được thực hiện khi là người duyệt được workflow gán.
- `S`: Cần permission nhạy cảm cấp riêng.
- `—`: Không có quyền mặc định.
- `JIT`: Chỉ có trong support session hợp lệ, có lý do và thời hạn.

## 4. Ma trận chức năng doanh nghiệp

| Chức năng | Employee | Manager | HR Ops | Payroll | Tenant Admin | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| Xem hồ sơ cơ bản của mình | ✓ | ✓ | ✓ | ✓ | ✓ | R |
| Đề nghị sửa hồ sơ của mình | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Xem hồ sơ nhân viên trong scope | — | R | ✓ | R giới hạn | ✓ | R |
| Sửa hồ sơ nhân viên | — | — | ✓ | — | ✓ | — |
| Xem PII nhạy cảm | Self/S | — | S | S | S | S |
| Xem tài khoản ngân hàng | Self/S | — | — | S | S | S |
| Quản lý cơ cấu tổ chức | — | R | ✓ | R | ✓ | R |
| Import nhân viên | — | — | ✓ | — | ✓ | — |
| Kết nối Google Sheets | — | — | Theo cấp | Theo cấp | ✓ | — |
| Xem mapping/sync log | — | — | ✓ | ✓ payroll | ✓ | R |
| Chạy đồng bộ nhân sự | — | — | ✓ | — | ✓ | — |
| Chạy đồng bộ payroll | — | — | — | ✓ | S | — |
| Xem ca/lịch của mình | ✓ | ✓ | ✓ | R | ✓ | R |
| Xem lịch đội ngũ | — | ✓ | ✓ | R | ✓ | R |
| Quản lý ca/lịch | — | Theo cấp | ✓ | — | ✓ | — |
| Chấm công | Self | Self | Self | Self | Self | — |
| Xem attendance event gốc | Self | R scope | ✓ | R | ✓ | R |
| Điều chỉnh công | — | A | ✓ | — | ✓ | — |
| Khóa/mở kỳ công | — | — | ✓ | — | ✓ | — |
| Xem số dư phép của mình | ✓ | ✓ | ✓ | R | ✓ | R |
| Xem số dư phép đội ngũ | — | R | ✓ | R | ✓ | R |
| Điều chỉnh leave ledger | — | — | ✓ | — | S | — |
| Tạo đơn của mình | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Duyệt đơn | — | A | A | A | A | — |
| Cấu hình workflow | — | — | Theo cấp | Theo cấp | ✓ | R |
| Xem payroll của mình | Self | Self | Self nếu là NV | Self | Self | — |
| Xem payroll nhân viên khác | — | — | — | S | S | S |
| Cấu hình payroll | — | — | — | ✓ | S | R/S |
| Import payroll | — | — | — | ✓ | S | — |
| Duyệt payroll | — | — | — | A | A+S | — |
| Công bố phiếu lương | — | — | — | ✓ | S | — |
| Mở lại kỳ lương đã khóa | — | — | — | S | S | — |
| Tạo yêu cầu tạm ứng | Self | Self | Self | Self | Self | — |
| Xác nhận đã chi tạm ứng | — | — | — | ✓ | S | — |
| Xem tài liệu cá nhân | Self | Self | ✓ scope | R giới hạn | ✓ | R/S |
| Upload tài liệu nhân sự | — | — | ✓ | — | ✓ | — |
| Xuất bản thông báo | — | Theo cấp | ✓ | Theo cấp | ✓ | — |
| Xem báo cáo tổng hợp | Self | Scope | Scope | Payroll scope | Tenant | R |
| Export dữ liệu | Self | Scope hạn chế | Theo cấp | Payroll | Theo cấp | R/S |
| Quản lý user/role | — | — | — | — | ✓ | R |
| Xem audit log | Hoạt động của mình | Scope hạn chế | Scope | Payroll scope | Tenant | R |
| Sửa/xóa audit log | — | — | — | — | — | — |

## 5. Ma trận Kavor Console

| Chức năng | Platform Operator | Platform Support | Tenant role |
|---|---:|---:|---:|
| Tạo/suspend/close tenant | ✓ | — | — |
| Gán gói và quota | ✓ | — | — |
| Xem usage tổng hợp | ✓ | R | Chỉ tenant mình |
| Quản lý feature flag | ✓ | — | — |
| Quản lý minimum mobile version iOS/Android | ✓ | R | — |
| Xem system health/incident | ✓ | R | Trạng thái công khai/phù hợp |
| Retry platform job an toàn | ✓ | Theo runbook | — |
| Xem sync job metadata của tenant | R | JIT | Theo quyền tenant |
| Xem raw import payload | — mặc định | JIT+S | Theo quyền tenant |
| Truy cập HR/Admin của tenant | — mặc định | JIT | — |
| Xem hồ sơ cá nhân | — | JIT+S | Theo quyền tenant |
| Xem payroll/tài khoản ngân hàng | — | — mặc định; exception hai cấp | Theo quyền tenant |
| Tạo support session | Theo policy | Yêu cầu | — |
| Duyệt support session nhạy cảm | ✓ tách người yêu cầu | — | Tenant Admin tùy policy |
| Xem platform audit | ✓ | R phạm vi mình | — |
| Sửa/xóa audit | — | — | — |

## 6. Permission code đề xuất

### Identity và tenant

- `tenant.read`, `tenant.settings.manage`
- `membership.read`, `membership.invite`, `membership.disable`
- `role.read`, `role.manage`, `role.assign`

### People

- `employee.self.read`, `employee.self.change_request`
- `employee.read`, `employee.create`, `employee.update`, `employee.terminate`
- `employee.sensitive.read`, `employee.bank.read`, `employee.bank.update`
- `organization.read`, `organization.manage`

### Time và leave

- `attendance.self.clock`, `attendance.self.read`
- `attendance.read`, `attendance.adjust`, `timesheet.lock`, `timesheet.unlock`
- `schedule.read`, `schedule.manage`
- `leave.self.read`, `leave.self.request`
- `leave.read`, `leave.manage_policy`, `leave.adjust_balance`
- `overtime.self.request`, `overtime.read`, `overtime.manage`

### Workflow

- `request.self.create`, `request.self.read`, `request.self.cancel`
- `request.read`, `request.approve`, `request.administer`
- `workflow.read`, `workflow.manage`

### Payroll

- `payroll.self.read`
- `payroll.read`, `payroll.config.manage`, `payroll.import`
- `payroll.review`, `payroll.approve`, `payroll.publish`
- `payroll.cycle.reopen`, `payroll.export`
- `salary_advance.process`

### Documents và communication

- `document.self.read`, `document.read`, `document.upload`, `document.manage`
- `announcement.read`, `announcement.publish`
- `notification.manage`

### Integration và audit

- `integration.read`, `integration.connect`, `integration.sync`
- `integration.raw_payload.read`
- `report.read`, `report.export`
- `audit.read`

### Platform

- `platform.tenant.manage`, `platform.subscription.manage`
- `platform.usage.read`, `platform.incident.manage`
- `platform.feature_flag.manage`, `platform.release.manage`
- `platform.job.retry`, `platform.audit.read`
- `platform.support.request`, `platform.support.approve`

## 7. Quy tắc dữ liệu nhạy cảm

### Payroll

- Manager không xem lương chỉ vì quản lý nhân viên.
- Tenant Admin không xem lương chỉ vì là admin hệ thống.
- `payroll.read` phải được cấp riêng, có audit khi truy cập/export.
- Export hàng loạt có thể yêu cầu re-authentication và step-up approval.

### PII và tài khoản ngân hàng

- UI mask dữ liệu khi không cần hiển thị đầy đủ.
- API không trả field nhạy cảm nếu thiếu permission.
- Log, analytics và error report không chứa giá trị thật.

### Tài liệu

- Quyền metadata và quyền tải file được kiểm tra riêng.
- Signed URL ngắn hạn, gắn đúng tenant và resource.

## 8. Quy tắc Manager scope

- Scope tính từ assignment có hiệu lực tại thời điểm truy cập.
- Có thể chọn `direct_reports` hoặc `management_tree` theo tenant.
- Không cho phép vòng lặp trong cây quản lý.
- Thay đổi manager cập nhật scope nhưng không thay đổi lịch sử approval đã hoàn tất.
- Acting manager/delegate phải có thời hạn và audit.

## 9. Quy tắc approval

- Có permission `request.approve` chưa đủ; user phải là assignee hợp lệ của task.
- Không được tự duyệt request của mình trừ khi policy cho phép rõ ràng.
- Delegation và escalation lưu actor gốc, actor thực hiện và lý do.
- Approval đã hoàn tất là append-only; sửa sai bằng action mới hoặc quy trình mở lại.

## 10. Support access

Mỗi phiên phải có:

- Tenant cụ thể.
- Ticket/lý do.
- Scope tối thiểu.
- Thời gian bắt đầu và hết hạn.
- Người yêu cầu và người phê duyệt khi cần.
- Banner hiển thị đang ở support mode.
- Audit riêng cho mọi read/export/mutation.

Phiên hết hạn phải bị từ chối ở API dù trình duyệt chưa reload.

## 11. Quy trình cấp quyền

1. Tenant Admin chọn role template.
2. Chọn scope tổ chức và ngày hiệu lực.
3. Nếu có permission nhạy cảm, hệ thống cảnh báo và có thể yêu cầu người duyệt thứ hai.
4. Hệ thống tạo role assignment và audit.
5. Token/session cũ được refresh hoặc thu hồi theo mức độ thay đổi.

Không cấp permission trực tiếp cho user nếu có thể biểu diễn bằng role; exception phải có ngày hết hạn.

## 12. Kiểm thử bắt buộc

- Employee không xem được dữ liệu của nhân viên khác bằng đổi ID.
- Manager không xem được nhân viên ngoài scope.
- HR chi nhánh A không xem chi nhánh B nếu không được cấp.
- Tenant Admin không xem payroll nếu thiếu permission nhạy cảm.
- Payroll không sửa cơ cấu tổ chức.
- User tenant A không gọi được resource tenant B.
- Support session hết hạn mất quyền ngay.
- Platform Operator không đọc payroll qua Console mặc định.
- Export và signed URL không vượt scope.
- Role thay đổi có hiệu lực trên API và RLS.
