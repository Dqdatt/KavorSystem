# So sánh UI: prototype HR Admin ↔ web HR/Admin

Ảnh ghép trên/dưới: trên là `Kavor HR Admin Prototype.html` (bỏ khung trình duyệt giả, cho chạy toàn trang như bản thật), dưới là `apps/admin-web` với **dữ liệu thật** từ API local. Cùng khung 1440×900, ảnh lưu ở 1/2 kích thước.

Chỉ chụp các trang của module đang làm (chấm công, bước 1 trong `docs/HR_COVERAGE_AUDIT.md` §5). Trang của module khác chưa port, không có trong menu.

| Trạng thái | Prototype | Web | Ghi chú |
| --- | --- | --- | --- |
| `dashboard` | Tổng quan | `/` | Bỏ thẻ Payroll, Nghỉ hôm nay, Sheet sync, Việc cần xử lý về đơn/payroll (module khác). Thay bằng số liệu chấm công thật, thiết bị chờ duyệt, chưa kích hoạt; banner cảnh báo khi chỉ có 1 Tenant Admin (ADR 0001). |
| `employees` | Nhân viên | `/employees` | Thêm cột Tài khoản. Bỏ checkbox chọn nhiều và nút Import (chưa làm). |
| `employee-drawer` | Drawer hồ sơ | `/employees?id=…` | Thêm khối Tài khoản (mời/khóa), Ca & địa điểm đang áp dụng kèm tầng nguồn, Thiết bị, Chấm công 14 ngày, Lịch sử thay đổi. |
| `employee-add` | Modal Thêm nhân viên | nút "Thêm nhân viên" | Thêm chức danh, quản lý trực tiếp, loại hợp đồng, tuỳ chọn gửi lời mời. |
| `attendance` | Bảng công tháng 10 | `/attendance` | **Khác chủ đích**: bước này là bảng chấm công hôm nay; bảng công tháng/khóa kỳ thuộc module "Công tháng" (bước 5). |
| `attendance-rejected` | — | `/attendance?tab=rejected` | Thiết kế bổ sung. |
| `attendance-devices` | — | `/attendance?tab=devices` | Thiết kế bổ sung (mục #5 audit). |
| `schedules` | Ca & lịch làm | `/schedules` | Prototype là lịch tuần theo nhóm; web là mẫu ca có phiên bản. Lịch tuần/xếp ca theo ngày chưa làm. |
| `schedules-locations` | — | `/schedules?tab=locations` | Thiết kế bổ sung (mục #4 audit). Chưa có bản đồ chọn vị trí: nhập tọa độ hoặc lấy vị trí trình duyệt, xem trên OpenStreetMap. |
| `schedules-assignments` | — | `/schedules?tab=assignments` | Thiết kế bổ sung: áp dụng theo tầng (ADR 0001). |
| Đăng nhập / kích hoạt | — | `/login` | Thiết kế bổ sung, chưa chụp tự động (cần phiên trống). |

Các trạng thái "thiết kế bổ sung" cần PO duyệt riêng.

## Chụp lại

```bash
pnpm dev:backend            # Supabase local + API (+ ghi apps/admin-web/.env.local)
pnpm dev:admin              # web ở http://localhost:3000
KAVOR_WEB_ID=HD0007 KAVOR_WEB_PW=<mật khẩu đã đặt khi kích hoạt> node tools/ui-compare/capture-web.mjs
```
