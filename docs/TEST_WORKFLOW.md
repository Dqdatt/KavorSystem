# Thử Kavor như một quy trình thật: Kavor Console → HR → nhân viên (bản dev trên Mac)

Mục đích: người dùng tự đi trọn một vòng như khách hàng thật, bắt đầu từ một **doanh nghiệp mới tạo trên Console** (không dùng dữ liệu mẫu Hải Đăng).
Chuẩn bị (agent làm trước khi giao): `bash tools/db-reset.sh`, `pnpm dev:backend`, `pnpm dev:admin` (http://localhost:3000), `pnpm dev:console`
(http://localhost:3001), Mailpit http://127.0.0.1:55324 (mọi thư/OTP nằm ở đây — chưa có SMTP thật), app trên iPhone build với
`EXPO_PUBLIC_API_URL=http://<IP LAN Mac>:4000/api/v1`, iPhone cùng Wi-Fi với Mac. Ghi lại mọi chỗ vướng/khó hiểu để sửa.

## A. Kavor Console — nhân viên Kavor tạo khách hàng
1. Tạo tài khoản nhân viên Kavor (chạy trên Mac, mật khẩu tự chọn, ≥ 10 ký tự):
   `OPERATOR_PASSWORD='<mật khẩu>' bash tools/create-operator.sh <email>@kavor.test "<Họ tên>"`
2. Mở http://localhost:3001 → đăng nhập → quét mã QR bằng ứng dụng xác thực (Google Authenticator…) → nhập mã 6 số.
3. **Doanh nghiệp → Tạo doanh nghiệp**: mã (vd. `TEST-001`), tên, tên pháp lý, gói Dùng thử, họ tên + email quản trị viên công ty
   (email bất kỳ, vd. `admin@test.vn` — thư mời rơi vào Mailpit). Kiểm: doanh nghiệp hiện trong danh sách, thư mời có trong Mailpit.

## B. Web HR — quản trị viên công ty thiết lập
4. Mở thư mời trong Mailpit → http://localhost:3000 → **Kích hoạt tài khoản**: mã nhân viên (trong thư) + email → mã OTP (Mailpit) → đặt mật khẩu
   → quét QR ứng dụng xác thực. *(Web HR và Console dùng cookie khác nhau nên mở song song trong cùng trình duyệt được.)*
5. **Tổng quan → Thiết lập ban đầu**: xem các bước còn thiếu. **Cài đặt doanh nghiệp**: thông tin công ty, logo, liên hệ phòng Nhân sự.
6. **Ca & địa điểm → Địa điểm → Thêm địa điểm**: tìm địa chỉ hoặc bấm "Dùng vị trí hiện tại của trình duyệt" (Chrome/Safari, không phải trình duyệt
   trong app Claude), kéo ghim, bán kính ≥ 50 m. Rồi **Áp dụng → Áp dụng mới**: loại Địa điểm, tầng Toàn công ty. *(Doanh nghiệp mới không có
   địa điểm sẵn — thiếu bước này nhân viên không chấm công được.)*
7. **Cơ cấu tổ chức** (nếu cần thêm phòng ban/chức danh) → **Nhân viên → Thêm nhân viên**: tạo chính anh (email bất kỳ), quản lý trực tiếp = quản trị
   viên ở bước 4 (để có người duyệt đơn), tích "Gửi email mời". Hoặc **Nhập từ file** (tải file mẫu, mở bằng Excel, lưu CSV UTF-8).
8. **Vai trò & phân quyền → Gán vai trò**: gán *Kế toán* cho quản trị viên (cần để xem lương, tạm ứng, nhập lương). Kỳ lương cần **hai Kế toán khác
   nhau** (người nhập ≠ người duyệt) → gán thêm Kế toán cho một nhân viên thứ hai nếu muốn thử hết luồng lương.
9. (Kế toán) **Lương & tạm ứng → Lương cơ bản**: nhập lương cơ bản cho nhân viên (để có hạn mức tạm ứng).

## C. App iPhone — nhân viên
10. App → **Kích hoạt tài khoản**: mã nhân viên + email ở bước 7 → OTP (Mailpit) → đặt mật khẩu → đồng ý điều khoản → máy đầu tiên tự được duyệt.
11. Trang chủ → **nhấn giữ nút Vào ca** (phải ở trong bán kính địa điểm bước 6). Thử Ra ca; thử tắt Wi-Fi rồi chấm (hàng đợi offline).
12. Nút **+** → Xin nghỉ phép (chọn khoảng ngày, xem dải tô), Làm thêm giờ (bánh xe giờ, bước 5 phút), Giải trình công (nếu có ngày thiếu),
    Tạm ứng (nhập PIN — lần đầu tạo PIN), Sửa hồ sơ (đề nghị đổi số điện thoại/tài khoản ngân hàng).
13. Hồ sơ → Bảo mật và thiết bị: bật Face ID, đổi mã PIN.

## D. Duyệt và theo dõi (web HR)
14. **Đơn & phê duyệt**: duyệt / từ chối từng đơn ở bước 12 → app nhận thông báo (app đang mở: trong ~30 giây). Tạm ứng: quản lý duyệt rồi Kế
    toán xử lý, đánh dấu đã chi. Đề nghị sửa hồ sơ: duyệt xong hồ sơ trên app đổi theo.
15. **Chấm công**: thấy lần chấm hôm nay; **Bảng công**: xem tháng, khóa kỳ công.
16. **Bản tin**: đăng bài có PDF, bật "Gửi thông báo trong app" → app thấy bài + thông báo, mở PDF. **Tài liệu**: tải hợp đồng cho nhân viên
    (HR + Nhân viên) → app: Hồ sơ → Hợp đồng và quyết định (qua PIN/Face ID).
17. **Lương**: mở kỳ, *Tải file mẫu*, điền số, Nhập kết quả → Gửi kiểm tra → Kế toán thứ hai duyệt → Công bố → app: Phiếu lương (qua PIN).

## E. Quay lại Console — vận hành khách hàng
18. Doanh nghiệp → chi tiết → **Tạm khóa** (ghi lý do) → web HR và app hiện "Công ty tạm ngừng sử dụng Kavor" → **Mở lại**.
19. **Quyền hỗ trợ → Yêu cầu truy cập** → web HR (quản trị viên) thấy banner, **Duyệt** → Console **Mở phiên** (chỉ đọc, đếm ngược) → web HR **Thu hồi**.
20. **Nhật ký hoạt động**: thấy đủ các thao tác của Kavor ở trên.

## Giới hạn của bản dev (biết trước khi thử)
- Chỉ chạy trên Mac + iPhone cùng Wi-Fi; Mac tắt/đổi IP là app mất kết nối (đổi IP phải build lại app). Thư chỉ vào Mailpit, chưa gửi email thật.
- Thông báo chỉ đến khi app đang mở (chưa có push khi app tắt — cần tài khoản Apple Developer trả phí). Chưa có widget chấm công.
- Bảng công chưa trừ ngày nghỉ phép / chưa cộng giờ làm thêm; lương là **nhập kết quả từ file**, Kavor chưa tự tính lương.
- Bản đồ dùng máy chủ tile cộng đồng (dev); chưa chọn nhà cung cấp bản đồ cho production.
