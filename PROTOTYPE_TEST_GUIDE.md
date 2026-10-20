# Kavor — Hướng dẫn kiểm thử prototype một vòng

> Phạm vi: HR/Admin Web, Kavor Console và Mobile iOS/Android.  
> Dữ liệu hiện là dữ liệu mẫu lưu trong bộ nhớ; tải lại trang hoặc reload app sẽ đưa trạng thái về ban đầu.

## 1. Khởi động

Mở ba cửa sổ Terminal tại thư mục project.

### HR/Admin Web

```bash
cd "/Users/dqdatt/Desktop/KavorSystem"
pnpm dev:admin
```

Mở `http://localhost:3000`.

### Kavor Console

```bash
cd "/Users/dqdatt/Desktop/KavorSystem"
pnpm dev:console
```

Mở `http://localhost:3001`.

### Mobile Expo

```bash
cd "/Users/dqdatt/Desktop/KavorSystem"
pnpm --filter @kavor/mobile start -- --clear
```

Điện thoại và máy tính cần dùng cùng mạng. Mở project trong Expo Go bằng dev server hiển thị trong app hoặc QR code.

## 2. HR/Admin Web

Kiểm thử lần lượt menu bên trái:

1. **Tổng quan:** tìm kiếm, lọc nhân sự cần chú ý, ẩn thông báo, mở bảng công từ banner.
2. **Nhân viên:** tìm kiếm, lọc cần xử lý, mở chi tiết, thêm nhân viên mẫu, import mẫu.
3. **Tổ chức:** xem chi tiết đơn vị và tạo đơn vị mới.
4. **Chấm công:** lọc bất thường, mở bản ghi và cập nhật trạng thái.
5. **Lịch làm:** xem ca, tạo ca và phân lịch mẫu.
6. **Nghỉ phép:** xem số dư, import và điều chỉnh số dư mẫu.
7. **Phê duyệt:** mở chi tiết, duyệt/từ chối một đơn, sau đó thử duyệt hàng loạt.
8. **Payroll:** kiểm tra lỗi đầu vào, mở chi tiết nhân viên và công bố/import kết quả mẫu.
9. **Tài liệu:** xem chi tiết, tạo thư mục và tải tài liệu mẫu.
10. **Bản tin:** xem bài, tạo bản tin mẫu.
11. **Báo cáo:** tìm báo cáo, tạo và xuất mẫu.
12. **Tích hợp dữ liệu:** xem job Sheet/CSV, kết nối và import mẫu.
13. **Phân quyền:** mở vai trò, tạo vai trò mẫu.
14. **Cài đặt:** xem cấu hình tenant và lưu thay đổi mẫu.

## 3. Kavor Console

1. **Tổng quan:** mở system status và xử lý thông báo.
2. **Doanh nghiệp:** tìm tenant, mở drawer chi tiết, tạo tenant mẫu.
3. **Gói dịch vụ:** xem giới hạn và tạo gói mẫu.
4. **Usage & giới hạn:** lọc tenant gần giới hạn và xuất usage mẫu.
5. **Sync jobs:** lọc job lỗi, mở chi tiết và retry; trạng thái phải đổi thành `Đang chạy`.
6. **Sự cố & cảnh báo:** tạo incident mẫu và mở chi tiết.
7. **Releases:** xem phiên bản web/mobile và tạo release mẫu.
8. **Feature flags:** mở flag và bật/tắt trạng thái.
9. **Support access:** mở phiên đang hiệu lực và thu hồi quyền.
10. **Audit log:** tìm kiếm/lọc và xuất log mẫu.
11. **Cài đặt nền tảng:** xem minimum mobile version và safety controls.

## 4. Mobile iOS/Android

1. **Trang chủ:** mở bản tin, thông báo, hồ sơ và nhấn giữ nút chấm công.
2. **Bảng công:** lọc đi muộn/thiếu công và tạo giải trình.
3. **Nghỉ phép:** xem số dư → tạo đơn → chọn ngày/buổi → gửi → xem đơn mới.
4. **Giải trình:** thử gửi khi chưa nhập mô tả để kiểm tra validation, sau đó nhập và gửi.
5. **OT:** chọn ngày, tăng/giảm số giờ, nhập lý do và gửi.
6. **Tạm ứng:** chọn số tiền, kiểm tra tài khoản nhận, gửi bằng PIN mô phỏng.
7. **Đơn của tôi:** lọc trạng thái, mở chi tiết và hủy đơn đang chờ.
8. **Cần tôi duyệt:** duyệt và từ chối các đơn của đội ngũ.
9. **Phiếu lương:** ẩn/hiện tiền, mở chi tiết tháng và tải PDF mẫu.
10. **Bản tin:** mở danh sách và đọc bài chi tiết.
11. **Hồ sơ:** sửa số điện thoại, gửi HR duyệt và xem thiết bị.
12. **Widget:** xem hướng dẫn cài widget iOS/Android.
13. **Đăng nhập:** từ Hồ sơ chọn đăng xuất, sau đó thử Google hoặc tài khoản demo.
14. **Nút +:** mở nhanh đơn nghỉ, giải trình và OT.

## 5. Cách ghi nhận phản hồi

Với mỗi lỗi, ghi lại:

- Bề mặt: Admin, Console, iOS hoặc Android.
- Màn hình và thao tác vừa thực hiện.
- Kết quả mong đợi và kết quả thực tế.
- Ảnh chụp màn hình hoặc video ngắn.
- Mức độ: Blocker, Nghiêm trọng, Trung bình hoặc Nhỏ.

## 6. Giới hạn của vòng prototype

- Chưa kết nối Supabase/API thật.
- Dữ liệu không tồn tại sau khi reload.
- Upload, download, GPS, PIN, sinh trắc học, Google OAuth, push notification và đồng bộ Google Sheets đang được mô phỏng.
- Animation mobile đã có trong backlog và sẽ được triển khai trong vòng polish sau khi chốt luồng.
