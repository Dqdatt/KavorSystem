# Kavor HRM — User Stories MVP

> Tenant giả lập: Hải Đăng Group  
> Mức ưu tiên: P0 = bắt buộc pilot, P1 = sau pilot

## Epic 1 — Tenant và Identity

### US-001 · Tạo tenant — P0

Là Platform Operator, tôi muốn tạo tenant mới để doanh nghiệp có không gian dữ liệu và cấu hình độc lập.

Acceptance criteria:

- Nhập tên, mã, region, timezone, gói và Tenant Admin.
- Mã tenant duy nhất.
- Provisioning thất bại có trạng thái và retry an toàn.
- Tạo audit log.
- Không tạo hồ sơ đăng ký kinh doanh hoặc gửi dữ liệu cơ quan nhà nước.

### US-002 · Mời người dùng — P0

Là Tenant Admin, tôi muốn mời HR/Manager/Payroll để phân công vận hành.

- Invitation có hạn dùng và chỉ dùng một lần.
- Role và scope được chọn trước khi gửi.
- Không mời trùng membership active.
- Có thể thu hồi lời mời.

### US-003 · Đăng nhập mobile — P0

Là Employee, tôi muốn đăng nhập trên iOS hoặc Android để sử dụng Kavor.

- Hỗ trợ activation, login, OTP/recovery và logout.
- Token lưu trong secure storage của hệ điều hành.
- Thiết bị được đăng ký và có thể thu hồi.
- Session bị thu hồi phải mất quyền ở lần gọi API tiếp theo.

## Epic 2 — Organization và Employee

### US-010 · Quản lý cơ cấu — P0

Là HR, tôi muốn tạo chi nhánh, phòng ban và chức danh để tổ chức dữ liệu nhân sự.

- Code duy nhất trong tenant.
- Có ngày hiệu lực.
- Không xóa node đang được sử dụng; cho phép ngừng hiệu lực.
- Lưu audit trước/sau.

### US-011 · Import nhân viên — P0

Là HR, tôi muốn import CSV/Excel/Google Sheets để không nhập tay từng người.

- Mapping cột và lưu template.
- Preview dữ liệu hợp lệ/lỗi/conflict.
- Không ghi production trước khi HR xác nhận.
- `employee_code` trùng bị phát hiện.
- Chạy lại cùng batch không tạo trùng.
- Tải được báo cáo lỗi theo dòng.

### US-012 · Xem hồ sơ cá nhân — P0

Là Employee, tôi muốn xem hồ sơ trên web/mobile để kiểm tra thông tin.

- Chỉ thấy dữ liệu của mình.
- Trường nhạy cảm được mask.
- Không đưa PII vào analytics/log.

### US-013 · Đề nghị sửa hồ sơ — P0

Là Employee, tôi muốn đề nghị sửa thông tin để HR xác nhận thay vì sửa trực tiếp.

- Hiển thị giá trị cũ/mới.
- Trường nhạy cảm yêu cầu minh chứng nếu policy quy định.
- HR duyệt/từ chối và thay đổi có ngày hiệu lực.
- Có lịch sử/audit.

## Epic 3 — Google Sheets

### US-020 · Kết nối Sheet — P0

Là Tenant Admin, tôi muốn kết nối Google Sheets read-only để import dữ liệu.

- OAuth scope tối thiểu.
- Hiển thị rõ spreadsheet/tab được cấp quyền.
- Token không xuất hiện trong UI/log.
- Có thể revoke kết nối.

### US-021 · Đồng bộ thủ công — P0

Là HR, tôi muốn bấm đồng bộ và xem diff trước khi ghi.

- Job chạy background và hiển thị tiến độ.
- Có raw snapshot, mapping version và checksum.
- Conflict không bị ghi đè tự động.
- Retry không tạo dữ liệu trùng.

### US-022 · Đồng bộ theo lịch — P1

Là HR, tôi muốn lịch sync định kỳ để giảm thao tác thủ công.

- Tenant chọn lịch trong giới hạn gói.
- Lỗi quota dùng backoff và gửi notification.
- Dữ liệu cần xác nhận không tự ghi nếu policy không cho phép.

## Epic 4 — Attendance

### US-030 · Chấm công online — P0

Là Employee, tôi muốn check-in/check-out bằng GPS trên iOS/Android.

- App giải thích và xin location permission đúng ngữ cảnh.
- Gửi timestamp, location, accuracy, device và idempotency key.
- Hiển thị kết quả trong 2 giây ở điều kiện bình thường.
- Ngoài geofence được lưu với cảnh báo, không mất event.

### US-031 · Chấm công offline — P0

Là Employee, tôi muốn ghi nhận thao tác khi mất mạng để gửi lại sau.

- Event được xếp hàng mã hóa trên thiết bị.
- UI hiển thị `Đang chờ đồng bộ`, không báo thành công server.
- Retry tự động khi có mạng.
- Không tạo bản ghi trùng.

### US-032 · Xem bảng công — P0

Là Employee, tôi muốn xem ngày công và bất thường để kịp giải trình.

- Hiển thị theo kỳ công tenant.
- Phân biệt event gốc, kết quả tính và adjustment.
- Có CTA giải trình cho bất thường còn hạn.

### US-033 · Xử lý bất thường — P0

Là HR, tôi muốn xem và lọc bất thường để chốt công.

- Lọc theo kỳ, chi nhánh, phòng ban, loại và trạng thái.
- Có bulk action chỉ với thao tác được policy cho phép.
- Adjustment không sửa event gốc.

### US-034 · Khóa kỳ công — P0

Là HR được cấp quyền, tôi muốn khóa kỳ để payroll sử dụng snapshot ổn định.

- Hệ thống cảnh báo request/bất thường chưa xử lý.
- Sau khóa, mutation bị từ chối.
- Mở lại yêu cầu permission riêng, lý do và audit.

## Epic 5 — Leave, OT và Workflow

### US-040 · Tạo đơn nghỉ — P0

Là Employee, tôi muốn gửi đơn nghỉ trên mobile/web.

- Kiểm tra lịch làm, trùng ngày, số dư và chính sách.
- Tạo hold trong leave ledger khi submit.
- Hiển thị approver và trạng thái.

### US-041 · Duyệt đơn — P0

Là Manager, tôi muốn duyệt/từ chối đơn được gán.

- Chỉ assignee hợp lệ thực hiện được.
- Có đủ ngữ cảnh nhưng không lộ payroll/PII không cần thiết.
- Approve/reject cập nhật ledger và gửi notification.
- Không tự duyệt đơn của mình.

### US-042 · Giải trình công — P0

Là Employee, tôi muốn gửi giải trình cho ngày thiếu công.

- Chọn bất thường, nhập lý do và đính kèm.
- Manager và HR duyệt theo rulebook.
- Approval tạo adjustment và tính lại timesheet.

### US-043 · Đăng ký OT — P0

Là Employee, tôi muốn đăng ký OT để được phê duyệt và đưa vào payroll input.

- Tối thiểu/làm tròn theo policy.
- Manager → HR phê duyệt.
- Request đã duyệt tạo payroll input có source reference.

### US-044 · Cấu hình workflow — P1

Là Tenant Admin, tôi muốn cấu hình nhiều cấp/điều kiện mà không sửa code.

- Version và ngày hiệu lực.
- Test/simulate approver trước khi active.
- Request đang chạy tiếp tục dùng snapshot cũ.

## Epic 6 — Payroll

### US-050 · Cấu hình payroll theo tenant — P0

Là Payroll Admin, tôi muốn cấu hình kỳ, component và mapping riêng cho công ty.

- Config có version và ngày hiệu lực.
- Tenant khác không dùng chung config.
- Thay đổi có audit.

### US-051 · Import kết quả lương — P0

Là Payroll, tôi muốn import Google Sheet/CSV để kiểm tra và công bố.

- Mapping theo `employee_code` và component code.
- Validate nhân viên, trạng thái, component, currency và tổng.
- Lỗi theo dòng, không publish khi còn lỗi blocker.
- Chạy lại batch an toàn.

### US-052 · Duyệt kỳ lương — P0

Là người duyệt payroll, tôi muốn review tổng hợp và phê duyệt kỳ.

- Chỉ role có quyền và approval task hợp lệ.
- Snapshot dữ liệu kỳ không đổi ngoài luồng điều chỉnh.
- Mọi chuyển trạng thái có audit.

### US-053 · Xem phiếu lương — P0

Là Employee, tôi muốn xem phiếu lương của mình an toàn trên iOS/Android/web.

- Re-authentication trước khi hiển thị.
- Chỉ xem đúng employee hiện tại.
- Push không chứa số tiền.
- File tải bằng signed URL có hạn.

## Epic 7 — Documents và Communication

### US-060 · Quản lý tài liệu — P0

Là HR, tôi muốn upload, version và gắn tài liệu với nhân viên.

- Metadata và file được phân quyền riêng.
- Scan status trước khi phát hành.
- Có hạn dùng và reminder.
- Không có chữ ký số.

### US-061 · Xuất bản bản tin — P0

Là HR, tôi muốn gửi bản tin theo audience.

- Chọn chi nhánh/phòng ban/role.
- Có lịch xuất bản và tùy chọn xác nhận đã đọc.
- Người ngoài audience không xem được.

## Epic 8 — Kavor Console

### US-070 · Theo dõi usage — P0

Là Platform Operator, tôi muốn xem seat, storage, API và sync usage.

- Dữ liệu tổng hợp, không lộ PII.
- Cảnh báo gần/vượt quota.

### US-071 · Retry sync job — P0

Là Operator, tôi muốn retry job theo runbook.

- Chỉ job retryable mới có CTA.
- Giữ idempotency và tenant context.
- Ghi actor, reason và correlation ID.

### US-072 · Support access — P0

Là Support, tôi muốn xin phiên truy cập có thời hạn để xử lý ticket.

- Tenant, lý do, scope và expiry bắt buộc.
- Permission nhạy cảm yêu cầu phê duyệt riêng.
- Banner support mode luôn hiển thị.
- Hết hạn mất quyền ngay.

### US-073 · Quản lý mobile version — P0

Là Platform Operator, tôi muốn đặt minimum version riêng cho iOS/Android.

- Có recommended và minimum version theo OS.
- Rollout theo phần trăm/tenant qua feature flag.
- Forced update chỉ khi được phê duyệt.

## Epic 9 — Reliability và Audit

### US-080 · Xem audit — P0

Là Auditor, tôi muốn truy vết thay đổi mà không thể sửa log.

- Tìm theo actor, resource, action, tenant và thời gian.
- Before/after được mask theo quyền.
- Audit append-only.

### US-081 · Backup/restore — P0

Là SRE, tôi muốn kiểm chứng restore để bảo đảm phục hồi được dữ liệu.

- Backup tự động có cảnh báo thất bại.
- Restore rehearsal trên môi trường cô lập.
- Policy, constraint và audit được giữ nguyên.

## Definition of Ready

- Story có owner, priority, acceptance criteria và dependency.
- UI/state/error được thiết kế.
- Permission, tenant scope và audit requirement rõ.
- API/schema impact được review.
- Dữ liệu mẫu/test case sẵn sàng.

## Definition of Done

- Code review và automated test pass.
- Migration có rollback/forward strategy.
- Web responsive; mobile test cả iOS và Android.
- Security/PII/logging được kiểm tra.
- QA staging pass và Product Owner nghiệm thu.
