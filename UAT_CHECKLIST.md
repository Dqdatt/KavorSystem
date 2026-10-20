# Kavor HRM — UAT Checklist mẫu

> Tenant: Hải Đăng Group (`HDG-001`)  
> Dùng cho staging/pilot với dữ liệu hư cấu  
> Ký hiệu: `[ ]` chưa chạy, `[x]` đạt, `[!]` lỗi/blocker

## 1. Điều kiện bắt đầu UAT

- [ ] Build web, API, iOS và Android đã deploy đúng môi trường staging.
- [ ] Migration và seed sample data thành công.
- [ ] Tester có tài khoản Employee, Manager, HR, Payroll, Tenant Admin và Platform Operator.
- [ ] Có ít nhất hai thiết bị iOS và ba thiết bị Android đại diện.
- [ ] Email/push sandbox hoạt động.
- [ ] Backup staging gần nhất thành công.
- [ ] Không dùng dữ liệu cá nhân hoặc lương thật.

## 2. Tenant và bảo mật

- [ ] Platform Operator tạo tenant `HDG-001` mà không sửa code.
- [ ] Tenant Admin nhận invitation và kích hoạt tài khoản.
- [ ] Tenant bị suspend không gọi được API nghiệp vụ.
- [ ] User tenant A không đọc resource tenant B khi đổi URL/ID.
- [ ] RLS chặn truy vấn chéo tenant.
- [ ] Role mới có hiệu lực sau refresh/revoke session theo policy.
- [ ] Audit ghi actor, tenant, action, thời gian và correlation ID.
- [ ] Không sửa/xóa audit qua API/UI.

## 3. Organization và employee

- [ ] Tạo pháp nhân, ba chi nhánh và các phòng ban mẫu.
- [ ] Mã phòng ban trùng trong tenant bị từ chối.
- [ ] Import `employees.csv` hiển thị preview đúng.
- [ ] Mapping cột được lưu và dùng lại.
- [ ] Dòng lỗi chỉ rõ trường và nguyên nhân.
- [ ] Xác nhận import tạo đúng số nhân viên.
- [ ] Chạy lại cùng batch không tạo bản ghi trùng.
- [ ] Điều chuyển nhân viên giữ assignment history.
- [ ] Employee chỉ xem hồ sơ của mình.
- [ ] Manager chỉ xem nhân viên trong scope.
- [ ] PII/tài khoản ngân hàng được mask nếu thiếu quyền.

## 4. Google Sheets

- [ ] OAuth chỉ xin scope cần thiết.
- [ ] Chọn đúng spreadsheet và tab.
- [ ] Token không xuất hiện trong log/browser response.
- [ ] Sync tạo raw snapshot và job record.
- [ ] Preview phân biệt create/update/error/conflict.
- [ ] Dòng biến mất khỏi Sheet không tự xóa Kavor.
- [ ] Conflict không bị ghi đè trước khi HR xác nhận.
- [ ] Retry job không tạo dữ liệu trùng.
- [ ] Revoke connection khiến sync mới bị từ chối.
- [ ] Lỗi quota trả retryable state và backoff.

## 5. Mobile iOS

- [ ] Cài đặt qua TestFlight/internal build.
- [ ] Activation/login/logout/recovery thành công.
- [ ] Token lưu trong Keychain/secure storage.
- [ ] Cho phép/từ chối location đều có hướng dẫn rõ.
- [ ] Check-in/check-out trong geofence thành công.
- [ ] Ngoài geofence tạo `needs_review`.
- [ ] Mạng offline tạo pending event.
- [ ] Có mạng lại tự retry và không tạo trùng.
- [ ] App kill/resume không mất event pending.
- [ ] Push mở đúng deep link.
- [ ] Payslip yêu cầu re-authentication.
- [ ] Thu hồi thiết bị làm session mất hiệu lực.

## 6. Mobile Android

- [ ] Cài đặt qua Play Internal/Closed Testing.
- [ ] Activation/login/logout/recovery thành công.
- [ ] Token lưu trong encrypted secure storage.
- [ ] Exact/approximate location được xử lý đúng.
- [ ] Check-in/check-out trong geofence thành công.
- [ ] Ngoài geofence tạo `needs_review`.
- [ ] Airplane mode tạo pending event.
- [ ] Retry sau mạng yếu không tạo trùng.
- [ ] App bị OEM hạn chế background vẫn đồng bộ khi mở lại.
- [ ] Push mở đúng deep link.
- [ ] Payslip yêu cầu re-authentication.
- [ ] Thu hồi thiết bị làm session mất hiệu lực.

## 7. Attendance và timesheet

- [ ] Import/tạo shift và lịch mẫu.
- [ ] Ca đêm tính theo ngày bắt đầu ca.
- [ ] Event gốc không chỉnh/xóa được.
- [ ] Thiếu check-in/check-out tạo exception.
- [ ] Đi muộn/về sớm áp dụng đúng grace period.
- [ ] Employee thấy bảng công đúng kỳ.
- [ ] HR lọc bất thường theo chi nhánh/phòng ban.
- [ ] Giải trình được Manager/HR duyệt đúng workflow.
- [ ] Approval tạo adjustment và tính lại timesheet.
- [ ] Khóa kỳ ngăn mutation.
- [ ] Mở lại kỳ yêu cầu permission, lý do và audit.

## 8. Leave và OT

- [ ] Import số dư phép đầu kỳ.
- [ ] Số dư bằng tổng leave transactions.
- [ ] Submit đơn tạo hold.
- [ ] Reject/cancel giải phóng hold.
- [ ] Approve tạo consume đúng số ngày.
- [ ] Không cho tạo đơn trùng thời gian.
- [ ] Nghỉ quá 2 ngày chạy Manager → HR.
- [ ] Không cho self-approval.
- [ ] OT làm tròn theo 0,5 giờ.
- [ ] OT được duyệt tạo payroll input đúng source.

## 9. Payroll

- [ ] Tạo config version riêng tenant.
- [ ] Import `payroll_results.csv` theo `employee_code`.
- [ ] Component chưa mapping bị báo lỗi.
- [ ] Employee không tồn tại bị báo lỗi.
- [ ] Gross/deduction/net inconsistency bị cảnh báo.
- [ ] Kỳ còn blocker không gửi duyệt/publish được.
- [ ] Transition đúng state machine và permission.
- [ ] Tenant Admin thiếu `payroll.read` không xem được số lương.
- [ ] Publish tạo đúng phiếu lương cho từng nhân viên.
- [ ] Push không chứa số tiền.
- [ ] Employee chỉ xem phiếu của mình.
- [ ] Signed URL hết hạn đúng.
- [ ] Closed cycle không sửa trực tiếp.

## 10. Documents và announcements

- [ ] Upload đúng loại/kích thước file.
- [ ] File chưa scan không được phát hành.
- [ ] Tạo version mới không xóa version cũ.
- [ ] Employee chỉ xem tài liệu được gán.
- [ ] Download được ghi audit.
- [ ] Không có chức năng chữ ký số.
- [ ] Bản tin chỉ hiển thị đúng audience.
- [ ] Xác nhận đã đọc được ghi một lần.

## 11. Kavor Console

- [ ] Tenant list hiển thị đúng status, plan và usage.
- [ ] Feature flag target đúng tenant.
- [ ] Minimum version thiết lập riêng iOS/Android.
- [ ] Retry sync job giữ idempotency.
- [ ] Incident hiển thị severity và affected tenants.
- [ ] Support request bắt buộc lý do/scope/expiry.
- [ ] Support mode hiển thị banner liên tục.
- [ ] Session hết hạn mất quyền ngay cả khi chưa reload.
- [ ] Support không xem payroll mặc định.
- [ ] Platform audit ghi đầy đủ thao tác support.

## 12. Hiệu năng và độ tin cậy

- [ ] Attendance online P95 dưới 2 giây trong test mục tiêu.
- [ ] Import 1.000 nhân viên không timeout request web.
- [ ] Publish payslip hàng loạt chạy background.
- [ ] Queue retry có giới hạn, không loop vô hạn.
- [ ] API `429` trả `Retry-After`.
- [ ] Dashboard usable trong 3 giây với dữ liệu pilot.
- [ ] Backup thành công và có cảnh báo khi thất bại.
- [ ] Restore rehearsal giữ nguyên RLS/constraint/audit.

## 13. Accessibility

- [ ] Web dùng được bằng keyboard ở luồng chính.
- [ ] Focus state rõ và modal trap focus đúng.
- [ ] Label/form error đọc được bằng screen reader.
- [ ] Mobile hỗ trợ font scaling ở màn chính.
- [ ] VoiceOver/TalkBack đọc đúng nút chấm công và trạng thái.
- [ ] Không chỉ dùng màu để biểu thị lỗi/trạng thái.

## 14. Go-live gate

- [ ] Tất cả test P0 đạt hoặc có waiver được Product Owner phê duyệt.
- [ ] Không còn lỗi cross-tenant, payroll disclosure hoặc data-loss.
- [ ] HR/Payroll ký xác nhận reconciliation.
- [ ] Crash-free sessions mobile đạt mục tiêu pilot.
- [ ] Runbook và người trực hỗ trợ sẵn sàng.
- [ ] Ngày cutover và thời điểm nguồn cũ read-only đã chốt.
- [ ] Rollback plan đã được diễn tập.

## 15. Biên bản nghiệm thu

| Vai trò | Họ tên | Kết quả | Ngày | Ghi chú |
|---|---|---|---|---|
| Product Owner |  |  |  |  |
| HR Lead |  |  |  |  |
| Payroll Lead |  |  |  |  |
| QA Lead |  |  |  |  |
| Engineering Lead |  |  |  |  |
| Security/SRE |  |  |  |  |
