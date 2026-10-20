# Kavor HRM — Pilot Rulebook mẫu

> Tenant mẫu: Hải Đăng Group (`HDG-001`)  
> Ngày baseline: 20/10/2026  
> Trạng thái: Giả định để phát triển; phải thay bằng rule thực tế trước production  
> Dữ liệu: Hoàn toàn hư cấu, không dùng cho tính lương hoặc quyết định nhân sự thật

## 1. Hồ sơ tenant mẫu

| Thuộc tính | Giá trị mẫu |
|---|---|
| Tên hiển thị | Hải Đăng Group |
| Mã tenant | `HDG-001` |
| Múi giờ | `Asia/Ho_Chi_Minh` |
| Ngôn ngữ | Tiếng Việt |
| Tiền tệ | VND |
| Quy mô | 248 nhân viên |
| Pháp nhân | 1 |
| Chi nhánh | TP.HCM, Hà Nội, Đà Nẵng |
| Kỳ công | Ngày 26 tháng trước đến ngày 25 tháng hiện tại |
| Kỳ lương | Theo tháng, trả ngày 05 tháng sau |
| Payroll MVP | Import kết quả cuối cùng từ Google Sheets |
| Mobile | iOS và Android |
| Chấm công | GPS/geofence; QR là phương án P1 |

## 2. Cơ cấu mẫu

- Ban Điều hành.
- Nhân sự.
- Tài chính – Kế toán.
- Kinh doanh.
- Vận hành.
- Công nghệ.
- Chăm sóc khách hàng.

Mỗi nhân viên có một assignment chính tại một thời điểm. Điều chuyển phòng ban, chi nhánh hoặc quản lý phải có ngày hiệu lực và không ghi đè lịch sử.

## 3. Vai trò pilot

- Employee: 238 người.
- Manager: 18 người; đồng thời vẫn là Employee.
- HR Operations: 3 người.
- Payroll/Accountant: 2 người.
- Tenant Admin: 2 người.
- Kavor Support: chỉ dùng support session có thời hạn.

## 4. Lịch và ca làm mẫu

### Ca văn phòng `OFFICE`

- Thứ Hai–Thứ Sáu.
- 08:30–17:30.
- Nghỉ trưa 12:00–13:00.
- Đi muộn sau 08:35.
- Về sớm trước 17:25.

### Ca sáng `SHIFT-A`

- 06:00–14:00.
- Nghỉ 30 phút.
- Grace period 5 phút.

### Ca chiều `SHIFT-B`

- 14:00–22:00.
- Nghỉ 30 phút.
- Grace period 5 phút.

### Ca đêm `SHIFT-C`

- 22:00–06:00 hôm sau.
- Nghỉ 45 phút.
- Ngày công tính theo ngày bắt đầu ca.

## 5. Quy tắc chấm công mẫu

- Chấm công bằng ứng dụng iOS/Android đã đăng ký thiết bị.
- Geofence mặc định 200 m; cấu hình riêng theo địa điểm.
- Location accuracy lớn hơn 100 m tạo cảnh báo cần kiểm tra.
- Event ngoài geofence vẫn được lưu nhưng mang trạng thái `needs_review`.
- Mỗi thao tác tạo `idempotency_key` tại thiết bị.
- Khi offline, app lưu event cục bộ và gửi lại khi có mạng.
- Event gốc không được sửa hoặc xóa trong nghiệp vụ bình thường.
- Điều chỉnh tạo `attendance_adjustment` và phải có lý do/audit.

### Bất thường mẫu

- Thiếu check-in hoặc check-out.
- Đi muộn/về sớm quá grace period.
- Chấm công ngoài geofence.
- Độ chính xác GPS không đạt.
- Hai event cùng loại trong khoảng thời gian ngắn.
- Event gửi trễ hơn 24 giờ.

## 6. Quy trình giải trình công

```text
Employee gửi giải trình
  → Manager duyệt
  → HR kiểm tra nếu thay đổi giờ công
  → Tạo adjustment
  → Tính lại timesheet
```

- Hạn gửi: 3 ngày làm việc sau ngày phát sinh.
- Cho phép ảnh/PDF, tối đa 10 MB/tệp.
- Manager SLA: 24 giờ làm việc.
- HR SLA: 24 giờ sau Manager.
- Sau khi khóa kỳ công, chỉ HR có `timesheet.unlock` mới được mở lại.

## 7. Chính sách phép mẫu

### Phép năm `AL`

- 12 ngày/năm cho nhân viên chính thức.
- Tích lũy 1 ngày vào đầu mỗi tháng.
- Nhân viên thử việc chưa tích lũy nhưng có thể xin không lương.
- Cho phép âm tối đa 1 ngày nếu quản lý và HR cùng duyệt.
- Số ngày được chuyển năm sau tối đa 3, hết hạn ngày 31/03.

### Nghỉ ốm `SL`

- Không trừ phép năm.
- Nghỉ từ 2 ngày liên tiếp yêu cầu minh chứng.
- HR kiểm tra sau Manager.

### Nghỉ không lương `UL`

- Không giới hạn cứng trong hệ thống mẫu.
- Từ 3 ngày trở lên cần Manager và HR duyệt.
- Tạo payroll input khấu trừ theo chính sách tenant.

Mọi biến động phép dùng ledger: `grant`, `accrual`, `hold`, `release`, `consume`, `adjust`, `expire`.

## 8. OT mẫu

- Employee tạo trước khi OT hoặc trong vòng 1 ngày sau khi phát sinh.
- Tối thiểu 0,5 giờ; làm tròn theo 0,5 giờ.
- Ngày thường: hệ số mẫu 1,5.
- Cuối tuần: hệ số mẫu 2,0.
- Ngày lễ: hệ số mẫu 3,0.
- Workflow: Manager → HR.
- OT được duyệt trở thành payroll input; hệ số chỉ là dữ liệu mô phỏng.

## 9. Workflow mẫu

| Loại yêu cầu | Luồng duyệt |
|---|---|
| Nghỉ phép ≤ 2 ngày | Manager |
| Nghỉ phép > 2 ngày | Manager → HR |
| Nghỉ không lương ≥ 3 ngày | Manager → HR |
| Giải trình công | Manager → HR nếu có adjustment |
| OT | Manager → HR |
| Sửa hồ sơ thường | HR |
| Sửa tài khoản ngân hàng | HR → Payroll |
| Tạm ứng ≤ 5.000.000 | Manager → Payroll |
| Tạm ứng > 5.000.000 | Manager → HR → Payroll |

- Người tạo không tự duyệt yêu cầu của mình.
- Nếu approver vắng, delegate có ngày bắt đầu/kết thúc.
- Request giữ snapshot rule tại thời điểm submit.

## 10. Payroll mẫu

### Chế độ

Doanh nghiệp tiếp tục tính lương trong Google Sheets. Kavor import kết quả để validate, duyệt, công bố phiếu lương và lưu audit.

### Thành phần mẫu

- `BASE`: Lương cơ bản.
- `ALLOWANCE`: Phụ cấp.
- `OT_PAY`: Tiền OT.
- `BONUS`: Thưởng.
- `UNPAID_LEAVE`: Khấu trừ nghỉ không lương.
- `INSURANCE`: Bảo hiểm.
- `PIT`: Thuế TNCN.
- `ADVANCE`: Khấu trừ tạm ứng.
- `NET`: Thực lĩnh.

### Chu kỳ

```text
Open → Prepared → Under Review → Approved → Published → Paid → Closed
```

- Payroll config riêng tenant, có version và ngày hiệu lực.
- Import dùng `employee_code` làm khóa.
- Tổng thực lĩnh mẫu: `gross - deductions`; chỉ dùng để kiểm tra consistency.
- Payroll phải xử lý hết lỗi mapping trước khi gửi duyệt.
- Phiếu lương chỉ công bố sau bước Approved.
- Kỳ Closed không sửa trực tiếp; adjustment đưa vào kỳ sau hoặc mở lại có audit.

## 11. Tài liệu và bản tin

- Tài liệu cá nhân chỉ Employee, HR được cấp scope và người có permission nhạy cảm xem được.
- File tải bằng signed URL có thời hạn.
- Hệ thống lưu version và audit download.
- Không triển khai chữ ký số.
- Bản tin quan trọng có thể yêu cầu xác nhận đã đọc.

## 12. Google Sheets mẫu

Các Sheet giả định:

- `Danh_sach_nhan_su_2026` → employee master trong giai đoạn chuyển đổi.
- `Payroll_10_2026` → payroll result.
- `Opening_Leave_2026` → số dư phép ban đầu, import một lần.

Quy tắc:

- Đồng bộ một chiều vào Kavor.
- Preview/diff trước khi ghi.
- Không tự xóa khi dòng biến mất.
- Conflict yêu cầu HR chọn nguồn đúng.
- Sau pilot, employee master dự kiến chuyển source of truth sang Kavor.

## 13. Notification mẫu

- Request mới cần duyệt: in-app + push.
- Request được duyệt/từ chối: in-app + push.
- Thiếu công/hạn giải trình: in-app + push.
- Phiếu lương mới: in-app + push, không chứa số tiền trong notification.
- Tài liệu sắp hết hạn: in-app + email cho HR.

## 14. Dữ liệu mẫu và giới hạn sử dụng

Thư mục `sample-data/` chứa dữ liệu hư cấu quy mô nhỏ để:

- Viết migration và seed development.
- Kiểm thử import/mapping.
- Demo prototype hoặc staging.
- Viết automated test.

Không dùng các con số trong rulebook này làm chính sách lao động, thuế, bảo hiểm hoặc tiền lương thực tế.

## 15. Điều kiện thay rule mẫu bằng rule thật

Trước UAT production, doanh nghiệp pilot phải xác nhận:

- Ca, grace period, geofence và phương thức chấm công.
- Cách tính ngày công, phép và OT.
- Workflow và SLA.
- Payroll component/mapping và người được xem lương.
- Nguồn dữ liệu chính cho từng dataset.
- Retention, domain, SSO và yêu cầu data residency.
