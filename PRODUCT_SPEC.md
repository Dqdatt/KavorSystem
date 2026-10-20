# Kavor HRM — Product Requirements Document

> Phiên bản: 1.0  
> Ngày: 20/10/2026  
> Trạng thái: Baseline để discovery, estimation và triển khai MVP  
> Tham chiếu: `plan.md`, `Kavor HRM Prototype.html`, `Kavor HR Admin Prototype.html`, `Kavor Console Prototype.html`

## 1. Mục đích

Kavor là nền tảng HRM SaaS đa doanh nghiệp, giúp số hóa hồ sơ nhân sự, công–phép–đơn từ, payroll operations, tài liệu và truyền thông nội bộ. Mỗi doanh nghiệp là một `tenant` độc lập về dữ liệu, chính sách, workflow, cấu hình payroll và tích hợp.

Việc tạo tenant trên Kavor chỉ tạo không gian sử dụng phần mềm. Đây không phải dịch vụ đăng ký kinh doanh hoặc thủ tục pháp lý với cơ quan nhà nước.

## 2. Bề mặt sản phẩm

| Bề mặt | Người dùng | Vai trò trong MVP |
|---|---|---|
| Mobile iOS | Nhân viên, quản lý | Tác vụ hằng ngày, chấm công, đơn từ, phê duyệt, phiếu lương |
| Mobile Android | Nhân viên, quản lý | Cùng nghiệp vụ với iOS |
| Employee Web | Nhân viên, quản lý | Kênh dự phòng và thao tác trên máy tính |
| HR/Admin Web | HR, Payroll, quản lý, Tenant Admin | Trung tâm vận hành doanh nghiệp |
| Kavor Console | Platform Operator, Support, SRE | Quản trị tenant và vận hành nền tảng |

Ứng dụng iOS và Android dùng chung codebase React Native/TypeScript nhưng có build, signing, kiểm thử thiết bị và phát hành riêng. Không được giả định hành vi GPS, notification, background task và biometric giống hoàn toàn giữa hai hệ điều hành.

## 3. Mục tiêu MVP

- Một doanh nghiệp 50–300 nhân viên có thể vận hành một kỳ công–phép–đơn từ–phiếu lương trên Kavor.
- Loại bỏ đơn giấy đối với nghỉ phép, OT, giải trình công và tạm ứng trong phạm vi pilot.
- Cho phép chuyển đổi từng bước từ Excel/Google Sheets.
- Không truy cập chéo tenant.
- Mọi thao tác nhạy cảm có phân quyền và audit.
- Mobile hoạt động ổn định trên cả iOS và Android, kể cả khi mạng yếu.

## 4. Ngoài phạm vi MVP

- Chữ ký số hoặc hạ tầng ký điện tử.
- Payroll engine đáp ứng mọi công thức và quy định cho mọi doanh nghiệp.
- Tuyển dụng, KPI/OKR, LMS, quản lý tài sản đầy đủ.
- Đồng bộ hai chiều cho cùng một dataset.
- Ngân hàng, chuyển lương tự động và marketplace tích hợp.

## 5. Persona

### 5.1. Employee

- Xem và đề nghị cập nhật hồ sơ cá nhân.
- Chấm công, xem bảng công và gửi giải trình.
- Xem số dư phép, tạo đơn nghỉ và đăng ký OT.
- Xem phiếu lương, tạm ứng, tài liệu và bản tin.

### 5.2. Manager

- Có toàn bộ quyền tự phục vụ của Employee.
- Xem dữ liệu cần thiết của nhân viên thuộc phạm vi quản lý.
- Duyệt/từ chối đơn, xem lịch và tình trạng công của đội.
- Không mặc định xem lương của nhân viên.

### 5.3. HR Operations

- Quản lý hồ sơ, cơ cấu, công, phép, workflow và tài liệu.
- Import dữ liệu, xử lý sai lệch và khóa kỳ công.
- Không mặc định xem dữ liệu lương chi tiết nếu chưa được cấp quyền.

### 5.4. Payroll/Accountant

- Quản lý payroll configuration, import payroll và công bố phiếu lương.
- Xử lý tạm ứng và dữ liệu tài chính được cấp quyền.
- Không tự động có quyền sửa cơ cấu tổ chức.

### 5.5. Tenant Admin

- Quản lý người dùng, vai trò, cấu hình tenant, integration và audit.
- Không mặc định xem số tiền lương; quyền payroll phải cấp riêng.

### 5.6. Kavor Platform Operator

- Tạo/khóa tenant, quản lý subscription, feature flag và version policy.
- Theo dõi health, job và incident.
- Không mặc định truy cập PII hoặc payroll của tenant.

## 6. Luồng nghiệp vụ bắt buộc

### 6.1. Khởi tạo tenant

1. Platform Operator tạo tenant và gói dịch vụ.
2. Hệ thống tạo cấu hình mặc định, namespace storage và Tenant Admin đầu tiên.
3. Tenant Admin thiết lập pháp nhân, chi nhánh, múi giờ, lịch ngày lễ và branding.
4. Tenant Admin mời HR/Payroll/Manager.
5. Mọi thao tác được ghi audit.

Tiêu chí:

- Tạo tenant mới không cần sửa code.
- Không có dữ liệu mẫu nhạy cảm trong production.
- Tenant bị khóa không thể đăng nhập hoặc gọi API nghiệp vụ.

### 6.2. Import nhân viên

Nguồn: Excel, CSV hoặc Google Sheets.

Luồng:

1. HR chọn nguồn và file/tab.
2. Mapping cột nguồn với trường Kavor.
3. Hệ thống lưu raw snapshot và đưa vào staging.
4. Hệ thống validate, deduplicate và hiển thị preview/diff.
5. HR sửa mapping hoặc tải báo cáo lỗi.
6. HR xác nhận ghi dữ liệu.
7. Domain service ghi transaction, audit và kết quả import.

Tiêu chí:

- Hỗ trợ tối thiểu 1.000 dòng trong MVP.
- Chạy lại cùng batch không tạo nhân viên trùng.
- Không tự xóa nhân viên khi dòng biến mất khỏi Sheet.
- `employee_code` là duy nhất trong tenant.

### 6.3. Chấm công trên iOS và Android

1. Nhân viên mở app và chọn vào/ra ca.
2. App xin quyền vị trí khi cần và thu thập timestamp, location, accuracy, device ID.
3. App tạo idempotency key trên thiết bị.
4. Nếu offline, event được mã hóa và xếp hàng cục bộ.
5. Khi có mạng, app gửi event; API xác minh tenant, user, device và geofence.
6. API lưu event gốc, kết quả xác minh và trả trạng thái.

Tiêu chí:

- Không tạo event trùng khi người dùng nhấn nhiều lần hoặc app retry.
- Event gốc không bị sửa; điều chỉnh tạo bản ghi riêng.
- Giao diện giải thích rõ khi location permission bị từ chối.
- iOS và Android phải có test matrix riêng cho permission, background/resume và mạng yếu.

### 6.4. Giải trình công

1. Hệ thống hoặc HR đánh dấu bất thường.
2. Nhân viên tạo giải trình và đính kèm minh chứng.
3. Workflow tạo approval task cho quản lý/HR.
4. Khi duyệt, hệ thống tạo attendance adjustment.
5. Timesheet được tính lại, giữ nguyên event gốc.

### 6.5. Nghỉ phép

1. Nhân viên xem số dư và tạo đơn.
2. Hệ thống kiểm tra chính sách, ngày trùng, lịch làm và số dư.
3. Hệ thống giữ tạm số dư nếu chính sách yêu cầu.
4. Workflow thực hiện phê duyệt.
5. Khi duyệt/từ chối/hủy, leave ledger được cập nhật tương ứng.

Không cho phép sửa trực tiếp số dư hiện tại; mọi thay đổi phải là giao dịch ledger.

### 6.6. OT

- Tenant cấu hình loại OT, điều kiện, hệ số và workflow.
- Đơn OT đã duyệt tạo payroll input hoặc dữ liệu export.
- Thay đổi sau khóa kỳ phải qua adjustment/correction.

### 6.7. Payroll theo doanh nghiệp

MVP ưu tiên chế độ import kết quả cuối cùng:

1. Payroll tạo kỳ lương từ configuration version của tenant.
2. Hệ thống lấy snapshot công, phép, OT và tạm ứng liên quan.
3. Payroll import file/Google Sheet theo mapping riêng.
4. Hệ thống validate mã nhân viên, component, tổng tiền và trạng thái nhân sự.
5. Payroll xử lý lỗi, gửi duyệt và khóa kỳ.
6. Người có quyền công bố phiếu lương.
7. Nhân viên xem phiếu của chính mình trên iOS, Android hoặc Employee Web.

Yêu cầu:

- Configuration có version và ngày hiệu lực.
- Không hard-code công thức dùng chung cho tất cả tenant.
- Kỳ đã đóng không được sửa trực tiếp.
- Phiếu lương yêu cầu re-authentication trước khi hiển thị dữ liệu nhạy cảm.
- Signed URL tải PDF có thời hạn.

### 6.8. Google Sheets

MVP hỗ trợ:

- Import một lần.
- Đồng bộ thủ công một chiều Sheet → Kavor.
- Lưu mapping để dùng lại.
- Preview/diff, validation, retry và báo cáo lỗi.
- Export bảng công/payroll input khi được cấp quyền.

Kavor PostgreSQL là database vận hành. Google Sheets không được dùng trực tiếp cho authentication, workflow, attendance event, audit hoặc session.

### 6.9. Tài liệu

- Upload, phân loại, version, ngày hiệu lực/hết hạn.
- Gắn tài liệu với nhân viên hoặc audience.
- Signed URL, quyền xem/tải và audit.
- Không có chữ ký số trong MVP.

### 6.10. Thông báo

Kênh:

- In-app.
- Push qua APNs cho iOS và FCM cho Android.
- Email tùy cấu hình tenant.

Hệ thống phải chống gửi trùng, retry có giới hạn và lưu delivery status.

### 6.11. Support access

1. Nhân sự Kavor nhập tenant, lý do và thời hạn.
2. Hệ thống kiểm tra quyền và yêu cầu phê duyệt nếu policy quy định.
3. Phiên support chỉ cấp scope tối thiểu và tự hết hạn.
4. Banner support phải hiển thị trong suốt phiên.
5. Toàn bộ hoạt động được ghi audit riêng.

Không cấp mặc định quyền xem payroll, tài khoản ngân hàng hoặc tài liệu cá nhân.

## 7. Yêu cầu theo bề mặt

### 7.1. Mobile iOS/Android

P0:

- Activation/login/OTP/recovery.
- Đăng ký và thu hồi thiết bị.
- Check-in/check-out và trạng thái ca.
- Bảng công, bất thường, giải trình.
- Phép, OT, tạm ứng và lịch sử đơn.
- Approval inbox cho Manager.
- Phiếu lương có re-authentication.
- Bản tin, notification, hồ sơ cá nhân.
- Offline queue giới hạn cho attendance và draft request.

Yêu cầu nền tảng:

- Cùng feature set cốt lõi trên iOS và Android.
- Deep link từ push notification.
- APNs/FCM token được quản lý theo device installation.
- Permission chỉ được hỏi tại thời điểm có ngữ cảnh.
- Biometric dùng cơ chế hệ điều hành; không lưu dữ liệu sinh trắc học.
- Có minimum-version policy và forced update cho bản lỗi nghiêm trọng.
- Analytics và crash reporting không chứa PII/payroll value.

Baseline đề xuất cho pilot: iOS 15+ và Android 9+; cần xác nhận lại từ dữ liệu thiết bị của doanh nghiệp pilot.

### 7.2. HR/Admin Web

- Dashboard và cảnh báo vận hành.
- Employee list/profile/import.
- Organization, shift, schedule, attendance và timesheet.
- Leave/OT/explanation/request center.
- Payroll operation và payslip publication.
- Documents, announcements, reports.
- Integrations, role, permission, audit và settings.

### 7.3. Kavor Console

- Tenant lifecycle và subscription.
- Usage/quota.
- Sync jobs và retry.
- Incidents và service health.
- Release/mobile version policy.
- Feature flags.
- Support access có thời hạn.
- Platform audit.

### 7.4. Employee Web

- Hồ sơ, công, phép, OT, đơn từ, phiếu lương, tài liệu và bản tin.
- Không bắt buộc chấm công GPS trên web trong pilot.

## 8. Yêu cầu phi chức năng

### 8.1. Bảo mật

- TLS cho dữ liệu truyền; encryption at rest theo hạ tầng managed.
- RBAC kết hợp scope tổ chức.
- RLS cho bảng tenant-scoped.
- API không tin `tenant_id` từ client.
- Secret/token không xuất hiện trong log.
- Re-authentication cho thao tác payroll nhạy cảm.
- Dependency scan và security test trong CI.

### 8.2. Hiệu năng mục tiêu ban đầu

- API đọc thông thường: P95 dưới 500 ms, chưa gồm tác vụ nặng.
- Chấm công: phản hồi online P95 dưới 2 giây.
- Dashboard: usable trong 3 giây với tenant 300 nhân viên.
- Import chạy background, có progress và không khóa request web.

### 8.3. Khả dụng và phục hồi

- Backup tự động và restore rehearsal.
- Queue job idempotent, retry với backoff.
- Outbox pattern cho side effect quan trọng.
- Mobile hiển thị trạng thái pending khi offline, không báo thành công giả.

### 8.4. Accessibility và ngôn ngữ

- Web hỗ trợ keyboard, focus state, contrast và semantic label.
- Mobile hỗ trợ Dynamic Type/font scaling và screen reader ở luồng chính.
- MVP tiếng Việt; code sẵn sàng cho i18n.

## 9. Analytics và KPI

- Activation rate theo iOS/Android.
- Crash-free users và crash-free sessions theo OS/app version.
- Tỷ lệ chấm công thành công, offline retry và duplicate prevented.
- Tỷ lệ request hoàn thành, SLA phê duyệt.
- Thời gian HR chốt công.
- Tỷ lệ sync Sheet thành công.
- Số lỗi payroll trước công bố.
- Số quy trình giấy được loại bỏ.

## 10. Acceptance criteria cấp MVP

- Tenant A không thể truy cập dữ liệu tenant B bằng UI, API hoặc truy vấn trực tiếp được expose.
- Import nhân viên idempotent và có báo cáo lỗi theo dòng.
- Chấm công chạy được trên thiết bị iOS và Android thật, bao gồm offline/retry.
- Leave ledger giải thích được mọi biến động số dư.
- Workflow chạy đúng vai trò và phạm vi tổ chức.
- Payroll configuration và mapping tách riêng theo tenant.
- Phiếu lương chỉ hiển thị cho đúng nhân viên và vai trò payroll được cấp quyền.
- Google Sheets sync có preview, audit, retry và conflict handling.
- Kavor Support không thể tự ý xem dữ liệu nhạy cảm.
- Backup đã được restore thử trước pilot.
- Doanh nghiệp pilot hoàn thành một kỳ công–phép–payroll mà không quay lại giấy cho các quy trình P0.

## 11. Quyết định cần xác nhận với doanh nghiệp pilot

- Số nhân viên, chi nhánh, pháp nhân và loại ca.
- Tỷ lệ thiết bị iOS/Android và phiên bản hệ điều hành thực tế.
- Phương thức chấm công: GPS, QR, Wi-Fi hay máy chấm công.
- Source of truth của employee master trong giai đoạn chuyển đổi.
- Dataset nào tiếp tục dùng Google Sheets.
- Payroll dùng import kết quả hay import đầu vào.
- Workflow và SLA của từng loại đơn.
- Yêu cầu lưu trữ dữ liệu, data residency, SSO và domain riêng.

## 12. Definition of Done cho một feature

- User story và acceptance criteria được duyệt.
- Có permission và tenant-scope rõ ràng.
- API contract và migration được review.
- Unit/integration test đạt.
- Luồng quan trọng có E2E test.
- Web responsive; mobile kiểm tra cả iOS và Android.
- Có audit, analytics và error handling phù hợp.
- Không chứa PII trong log/analytics.
- QA pass trên staging và Product Owner nghiệm thu.
- Tài liệu vận hành/runbook được cập nhật nếu feature ảnh hưởng production.
