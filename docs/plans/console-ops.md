# Kavor Console — vòng đời tenant, gói dịch vụ, support access

Người dùng giao "triển khai tiếp luôn" (26/10) sau module đề nghị sửa hồ sơ. Các quyết định dưới đây là **mặc định do Claude chọn**, ghi lại để
người dùng review; đổi được mà không phải làm lại DB.

Nguồn: `PRODUCT_SPEC.md` §5.6, §6.11; `USER_STORIES.md` US-072; `PERMISSION_MATRIX.md` §8, §10; `docs/adr/0001` (support access phải được tenant
duyệt); `Kavor Console Prototype.html` (page-subscriptions, page-usage, page-access, modal requestAccess). Prototype không có nút khóa/đóng tenant
và không có màn phía tenant duyệt support → thiết kế bổ sung.

## Phần A — vòng đời tenant + gói dịch vụ

- Trạng thái: `active` → `suspended` (tạm khóa) → `active` (mở lại); `suspended` → `closed` (đóng, **không mở lại được** — chặn bằng trigger).
  Chỉ Platform Operator (không phải Platform Support) được đổi. Bắt buộc lý do; đóng tenant phải gõ lại mã tenant để xác nhận và chỉ đóng được tenant
  đang tạm khóa. Dữ liệu giữ nguyên (xuất/xóa theo hợp đồng làm sau).
- Khi tenant không `active`: mọi người dùng của tenant bị chặn ở API (đăng nhập, làm mới phiên, mọi request kể cả token còn hạn — mã
  `AUTH_TENANT_SUSPENDED`), và ở RLS (`is_active_member`, `current_employee_ids`, `permission_scopes` chỉ trả kết quả cho tenant `active`) nên Realtime
  của web cũng dừng. App hiện màn lỗi "Công ty đang tạm ngừng sử dụng Kavor". Khôi phục chủ sở hữu vẫn tạo được khi tenant tạm khóa (để chuẩn bị mở lại),
  không tạo được khi đã đóng; không gửi lại lời mời khi tenant không hoạt động.
- Gói: bảng `platform_plans` (Kavor duy trì): Dùng thử 50, Starter 100, Growth 500, Enterprise theo hợp đồng (giới hạn nhập tay). Đổi gói = cập nhật
  `tenants.plan_code` + `employee_limit` (mặc định lấy theo gói, sửa được), bắt buộc lý do, ghi audit tenant thấy. Chưa có giá, tính năng theo gói,
  sửa/tạo gói trên Console (prototype có "Tạo gói"/"Chỉnh sửa" → để sau).
- Giới hạn nhân sự = số hồ sơ chưa nghỉ việc. Chặn ở API khi HR thêm nhân viên hoặc chuyển hồ sơ đã nghỉ về đang làm (mã `EMPLOYEE_LIMIT_REACHED`).
  Không chặn khi Kavor cấp Tenant Admin mới qua khôi phục chủ sở hữu (không để khách mất quyền vì đủ người). Giảm giới hạn thấp hơn số đang dùng
  được phép (chỉ chặn thêm mới) nhưng Console cảnh báo.
- "Gần giới hạn" = dùng ≥ 90%. Console: cột nhân sự tô màu, chỉ số ở Tổng quan, trang Gói dịch vụ (số tenant mỗi gói). Web HR: Cài đặt doanh nghiệp
  hiện gói + số nhân sự đang dùng.

## Phần B — support access có thời hạn

- Nhân viên Kavor (Operator hoặc Support) tạo yêu cầu: tenant, mã ticket/lý do, phạm vi (chọn ít nhất 1), thời hạn 30 hoặc 60 phút (tối đa 60 theo
  prototype "Support session max"). Mỗi tenant tối đa một yêu cầu đang chờ/đang hiệu lực của cùng người. Yêu cầu chờ quá 24 giờ thì hết hạn.
- **Tenant Admin duyệt** trên web HR (quyền mới `support_access.approve`, chỉ role Tenant Admin): banner trên mọi trang web HR khi có yêu cầu chờ;
  duyệt/từ chối kèm ghi chú. Thời hạn tính từ lúc duyệt. Trong suốt phiên, **mọi người dùng web HR của tenant thấy banner** "Kavor đang hỗ trợ … đến
  HH:MM"; Tenant Admin thu hồi được bất cứ lúc nào. Nhân viên Kavor cũng tự kết thúc được.
- Phạm vi (chỉ đọc, không có lương, tài khoản ngân hàng, tài liệu cá nhân, điện thoại/email/địa chỉ):
  - `settings` — cấu hình công ty: thông tin chung, quy định (phiên bản), ngày lễ, luồng duyệt, ca và địa điểm, vai trò/phân quyền (không có người).
  - `directory` — danh sách nhân sự tối thiểu: mã, họ tên, phòng ban, chức danh, trạng thái hồ sơ, trạng thái tài khoản/MFA (để xử lý ticket đăng
    nhập). Không có liên hệ, ngày sinh, lương.
  - `audit` — nhật ký hoạt động 30 ngày: thời gian, người làm, hành động, đối tượng (không có dữ liệu trước/sau).
- Console có chế độ hỗ trợ: banner đếm ngược suốt phiên, chỉ đọc. Mỗi lần xem ghi audit `support.viewed` (tenant thấy trong nhật ký của mình). Hết
  hạn/thu hồi là mất quyền ngay ở request kế tiếp (API kiểm tra mỗi request).
- Chưa có: phê duyệt hai lớp cho phạm vi nhạy cảm (chưa có phạm vi nhạy cảm nào), thông báo trên app/email cho Tenant Admin (chỉ banner web),
  ticket system tích hợp.
