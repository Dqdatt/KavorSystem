# Cơ cấu tổ chức + Vai trò & phân quyền (web HR)

Người dùng giao (26/10): "đang dùng cloud nên cứ làm tiếp, done thì push". Lý do làm module này: công ty mới tạo trên Kavor chỉ có bộ tổ chức tối thiểu
và **không có cách nào** gán HR/Quản lý/Kế toán cho người khác hay thêm phòng ban — chặn pilot. Quyết định dưới đây là **mặc định do Claude chọn**,
chờ người dùng review.

Nguồn: `PERMISSION_MATRIX.md` §1, §2, §4 ("Quản lý cơ cấu tổ chức": HR Ops ✓, Tenant Admin ✓, Manager/Payroll/Auditor R; "Quản lý user/role":
Tenant Admin ✓, Auditor R), §6 (`organization.manage`, `role.assign`), §11 (quy trình cấp quyền), §12 (kiểm thử); `Kavor HR Admin Prototype.html`
page-organization (sơ đồ khối + chỉ số) và page-roles (bảng vai trò). Prototype không có form thêm đơn vị, chi tiết vai trò, gán vai trò → thiết kế bổ sung.

## Cơ cấu tổ chức (`/organization`)

- Pháp nhân → chi nhánh → phòng ban (phòng ban có phòng ban cha trong cùng chi nhánh) + danh mục chức danh. Mã duy nhất trong tenant.
- Thêm đơn vị: ngày hiệu lực mặc định hôm nay, không lùi về quá khứ. Đổi tên/mã: sửa tại chỗ + audit trước/sau (chưa có phiên bản tên).
- Ngừng đơn vị = đặt ngày kết thúc (không xóa). Chặn khi còn nhân viên đang/sẽ được phân công vào đơn vị đó, còn đơn vị con đang hoạt động, hoặc
  còn vai trò đang gán theo phạm vi đơn vị đó. Đơn vị đã ngừng không còn trong danh sách chọn khi thêm/sửa nhân viên.
- Quyền: xem `organization.read`; sửa `organization.manage` (cấp cho HR Ops + Tenant Admin, phạm vi toàn công ty).
- Chưa có: import cơ cấu từ file, khối (nhóm phòng ban nhiều chi nhánh), sơ đồ kéo thả, vị trí định biên/"vị trí đang trống".

## Vai trò & phân quyền (`/roles`)

- Dùng 5 vai trò mẫu hệ thống (Tenant Admin, HR Operations, Payroll, Manager, Auditor); vai trò Employee tự gán khi kích hoạt, không gán tay.
  Chưa cho tạo vai trò tùy chỉnh (prototype có nút "Tạo vai trò" → để sau; PERMISSION_MATRIX §11 bắt đầu từ "role template").
- Gán vai trò (quyền mới `role.assign`, chỉ Tenant Admin toàn công ty): chọn nhân viên chưa nghỉ việc, vai trò, phạm vi, ngày hiệu lực (từ hôm nay),
  ngày kết thúc (không bắt buộc). Nhân viên chưa kích hoạt vẫn gán được (membership "invited", quyền có tác dụng khi kích hoạt).
- Phạm vi cho phép: Tenant Admin → toàn công ty; Payroll → toàn công ty / pháp nhân; HR Ops, Auditor → toàn công ty / pháp nhân / chi nhánh /
  phòng ban; Manager → phòng ban / chi nhánh / pháp nhân / đội ngũ trực tiếp.
- Vai trò có dữ liệu nhạy cảm (Tenant Admin, Payroll) hiện cảnh báo trước khi gán; chưa có người duyệt thứ hai (§11 "có thể").
- Thu hồi: hết hiệu lực từ hôm nay (ngày kết thúc = hôm qua; gán bắt đầu từ hôm nay trở đi thì xóa). Không gỡ được Tenant Admin cuối cùng (trigger cũ).
  Quyền thay đổi có hiệu lực ngay ở request kế tiếp (API đọc quyền mỗi request) và RLS.
- Không trùng: cùng người + vai trò + phạm vi đang mở thì báo đã có.
- Xem: `role.read` (Tenant Admin, Auditor).
