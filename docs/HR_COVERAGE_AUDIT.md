# Rà soát: mobile cần HR quản lý những gì

Ngày rà: 22/10/2026. Đối chiếu toàn bộ màn mobile (`apps/mobile/src`), dữ liệu mẫu, các chỗ còn "mô phỏng" với 14 trang của `Kavor HR Admin Prototype.html` và `DATABASE_SCHEMA.md`. Mô hình quyền/rules: `docs/adr/0001-tenant-admin-va-bo-rules.md`.

Cột **Prototype HR**: có = đã có trang/khối trong prototype HR Admin; thiếu = phải thiết kế bổ sung theo phong cách prototype (đánh dấu "thiết kế bổ sung" trong checklist so sánh UI để PO duyệt riêng).
Cột **Schema**: thiết kế trong `DATABASE_SCHEMA.md` (đã có migration hay chưa ghi ở cột Trạng thái).

## 1. Mobile cần, prototype HR thiếu

| # | Tính năng | Mobile hiện tại | HR cần quản lý | Schema | Trạng thái |
|---|---|---|---|---|---|
| 1 | Thông báo | Danh sách cứng 6 mục; mục U02 chỉ là toast | Lưu thông báo, push APNs/FCM, đã đọc; cấu hình nhắc chấm công/hạn giải trình; gửi thủ công theo nhóm | `notifications`, `notification_deliveries`, `tenant_settings.notification_settings` | Chưa làm |
| 2 | Thương hiệu công ty | Ảnh bìa SVG cứng (`screens/profile.tsx` `COVER`), không có logo công ty | Logo, ảnh bìa chung, tên hiển thị; cần Storage | `tenant_settings.branding` (chưa chi tiết) | Chưa làm |
| 3 | Ảnh đại diện | Chữ viết tắt | Nhân viên tự đổi hoặc HR tải lên; có/không cần duyệt | Chưa có trường | Chưa làm |
| 4 | Địa điểm chấm công | Nút dev `/dev/work-location` | Bản đồ, tọa độ, bán kính, sai số tối đa; nhiều địa điểm; gán theo nhóm | `work_locations` (đã có migration), chưa có bảng gán | Một phần |
| 5 | Thiết bị chấm công | Màn E19, "yêu cầu chuyển máy" mô phỏng | Duyệt/từ chối/reset/thu hồi; lịch sử máy | `employee_devices` (đã có migration) | API chỉ có phía nhân viên |
| 6 | Quy định giải trình | Cứng 3 lượt/tháng, hạn 22/10 | Số lượt, hạn = chốt công − N ngày, bắt buộc đính kèm | Chưa có | Chưa làm |
| 7 | Chính sách tạm ứng | Cứng 30% lương, khóa ngày 20, chặn thử việc/sắp nghỉ, 6 bước | % hạn mức, ngày khóa, đối tượng; kế toán đánh dấu đã chi; trừ vào kỳ lương | `salary_advances`, `salary_advance_events` (chưa có policy) | Chưa làm |
| 8 | Lịch nghỉ lễ | Đơn phép chỉ bỏ T7/CN | Lịch lễ quốc gia (Kavor) + ngày nghỉ riêng (công ty) | Chưa có bảng | Chưa làm |
| 9 | Liên hệ HR | Cứng "028 3822 0142 · hr@haidang.vn" | Thông tin hỗ trợ trong cài đặt công ty | `tenant_settings` | Chưa làm |
| 10 | Tài khoản nhân viên | — | Ai chưa kích hoạt, gửi lại lời mời, khóa khi nghỉ việc, đăng xuất mọi thiết bị | `memberships`, Supabase Auth | Chưa làm |
| 11 | Đồng ý dữ liệu cá nhân | Checkbox lúc kích hoạt, không lưu | Điều khoản có phiên bản, lưu ai đồng ý lúc nào (NĐ 13/2023) | Chưa có | Chưa làm |
| 12 | Luồng duyệt | Quản lý duyệt trên mobile; tạm ứng 6 bước | Prototype chỉ có nút "Cấu hình workflow" — cần trang: ai duyệt loại đơn nào, mấy cấp, SLA | `workflow_definitions/versions/steps` | Chưa làm |

## 2. Mobile cần, prototype HR có (port + nối dữ liệu)

| Mobile | Trang HR Admin | Schema |
|---|---|---|
| Bản tin: danh mục, ghim, quan trọng, đính kèm | Bản tin nội bộ (tạo, lên lịch, người nhận, theo dõi đã đọc) | `announcements`, `announcement_audiences`, `announcement_reads` |
| Hồ sơ: phòng ban, quản lý trực tiếp, ngày vào làm, hợp đồng | Nhân viên, Tổ chức | `employees`, `employee_assignments`, `employment_contracts` |
| Đề nghị sửa thông tin (HS-0221) | Phê duyệt | `requests`, `request_versions` |
| Nghỉ phép, số dư | Nghỉ phép (chính sách, định mức, chuyển năm, lịch sử version) | `leave_*` |
| Giải trình, OT, tạm ứng | Phê duyệt | `requests`, `approval_tasks` |
| Bảng công tháng | Chấm công (bảng công, khóa kỳ) | `daily_timesheets`, `monthly_timesheets`, `timesheet_locks` |
| Ca cố định/linh hoạt | Lịch làm (mẫu ca, cảnh báo) | `shift_definitions`, `work_schedules`, `shift_assignments` |
| Phiếu lương | Payroll | `payroll_*`, `payslips` |
| Hợp đồng và quyết định (P05–P06, toast) | Tài liệu | `documents`, `document_versions`, `employee_documents` |
| Quản lý duyệt đơn | Phân quyền, Tổ chức | `role_assignments` (scope) |

## 3. Thuộc Kavor Console

- Bảo trì, bắt cập nhật app (màn lỗi, toast "Đã cập nhật lên phiên bản 2.4.0") → Releases, Flags, Incidents.
- Đăng nhập SSO công ty (mô phỏng) → sau pilot.
- Tạo tenant, mời Tenant Admin đầu tiên, gói dịch vụ → Tenants, Subscriptions.

## 4. Chỉ phía mobile, chưa làm

- Quên PIN (A11): khôi phục bằng mật khẩu + OTP.
- Lưu bài viết, sao chép liên kết bản tin (lưu theo người dùng).
- Từ chối hàng loạt cần lý do chung (R08) — prototype cũng chưa dựng.

## 5. Thứ tự triển khai đã chốt

1. **Khép module chấm công**: HR/Admin đăng nhập theo role; nhân viên + tài khoản (#10); thiết bị (#5); địa điểm + ca có tầng (#4, ADR 0001); realtime web ↔ mobile.
2. **Nền rules có tầng/phiên bản + cài đặt công ty**: thương hiệu (#2), liên hệ (#9), lịch lễ (#8), mẫu mặc định theo luật VN, checklist thiết lập ban đầu, đồng ý dữ liệu cá nhân (#11).
3. **Kavor Console tối thiểu**: tạo tenant, mời Tenant Admin.
4. **Thông báo** (#1): lưu, push, nhắc nhở.
5. Công tháng + giải trình (#6) + workflow duyệt (#12) → nghỉ phép/OT → tạm ứng (#7) → payroll/phiếu lương → bản tin/tài liệu → phần còn lại của Console.

Mỗi module "xong" khi đi trọn vòng nhân viên (mobile) ↔ HR (web) với dữ liệu thật; trang web chỉ port khi module của nó tới lượt (không port trang rỗng gắn "dữ liệu mẫu").
