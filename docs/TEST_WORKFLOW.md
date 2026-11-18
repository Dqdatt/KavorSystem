# Thử Kavor như một quy trình thật: Kavor Console → HR → nhân viên (bản dev trên Mac)

Bộ test case chi tiết từng bước (kèm kết quả mong đợi, cột ghi kết quả): `docs/TEST_CASES.md`. Cập nhật 18/11/2026 theo hiện trạng
(Kavor tự tính lương, bảng công có phép/làm thêm/tạm nghỉ/ngày lễ).

Hai nhánh, chạy trên cùng một DB:
- **Nhánh A — công ty mới** tạo trên Console: thử luồng khách hàng mới (thiết lập, mời, app, đơn, duyệt, bản tin, vận hành).
- **Nhánh B — công ty mẫu Hải Đăng + 30 nhân viên đủ công kỳ trước** (`tools/scale-data.sh 30`): thử khóa kỳ công → bảng lương đầu vào →
  Kavor tính lương → duyệt → công bố → phiếu trên app với số người đủ lớn (vượt trần 1.000 dòng của PostgREST).

Chuẩn bị (agent làm trước khi giao): `bash tools/db-reset.sh && bash tools/scale-data.sh 30` (in ra tháng kỳ công đã sinh), `pnpm dev:backend`,
`pnpm dev:admin` (http://localhost:3000), `pnpm dev:console` (http://localhost:3001), Mailpit http://127.0.0.1:55324 (mọi thư/OTP nằm ở đây — chưa
có SMTP thật). App: iOS Simulator / Android emulator build với `EXPO_PUBLIC_API_URL` trỏ API local (emulator: `http://10.0.2.2:<cổng>/api/v1`, APK
Release cần tạm `usesCleartextTraffic` — AGENTS.md Cạm bẫy); iPhone thật build với `http://<IP LAN Mac>:4000/api/v1`, cùng Wi-Fi với Mac (iPhone 11
đang cài bản online — cài bản local thì sau UAT phải cài lại). Ghi lại mọi chỗ vướng/khó hiểu để sửa.

## A. Kavor Console — nhân viên Kavor tạo khách hàng
1. Mở http://localhost:3001 → **Kích hoạt tài khoản / Quên mật khẩu** → email quản trị viên đầu tiên → mã OTP (Mailpit) → đặt mật khẩu.
   Đây là quản trị viên Console đầu tiên, luôn có sau mỗi lần reset DB (không chạy lệnh). Mời thêm nhân viên Kavor ở **Hệ thống → Nhân viên Kavor**.
2. Quét mã QR bằng ứng dụng xác thực (Google Authenticator…) → nhập mã 6 số.
3. **Doanh nghiệp → Tạo doanh nghiệp**: mã (vd. `TEST-001`), tên, tên pháp lý, gói Dùng thử, họ tên + email quản trị viên công ty
   (email bất kỳ, vd. `admin@test.vn` — thư mời rơi vào Mailpit). Kiểm: doanh nghiệp hiện trong danh sách, thư mời có trong Mailpit.
4. **Tham số luật lương**: xem phiên bản đang hiệu lực (lương tối thiểu vùng, BH, giảm trừ gia cảnh, biểu thuế), **Tính thử**.

## B. Web HR — quản trị viên công ty thiết lập
5. Mở thư mời trong Mailpit → http://localhost:3000 → **Kích hoạt tài khoản**: mã nhân viên (trong thư) + email → mã OTP (Mailpit) → đặt mật khẩu
   → quét QR ứng dụng xác thực. *(Web HR và Console dùng cookie khác nhau nên mở song song trong cùng trình duyệt được.)*
6. **Cài đặt → Thiết lập ban đầu**: xem các bước còn thiếu. **Cài đặt → Doanh nghiệp**: thông tin công ty, logo, liên hệ phòng Nhân sự.
   **Cài đặt → Kỳ công & lương**: ngày bắt đầu kỳ công, Quy chế lương (vùng, tỷ lệ thử việc ≥ 85%…).
7. **Ca & địa điểm → Địa điểm → Thêm địa điểm**: tìm địa chỉ hoặc bấm "Dùng vị trí hiện tại của trình duyệt" (Chrome/Safari, không phải trình duyệt
   trong app Claude), kéo ghim, bán kính ≥ 50 m. Rồi **Áp dụng → Áp dụng mới**: loại Địa điểm, tầng Toàn công ty. *(Doanh nghiệp mới không có
   địa điểm sẵn — thiếu bước này nhân viên không chấm công được.)*
8. **Cơ cấu tổ chức** (nếu cần thêm phòng ban/chức danh) → **Nhân viên → Thêm nhân viên**: tạo chính anh (email bất kỳ), quản lý trực tiếp = quản trị
   viên ở bước 5 (để có người duyệt đơn), tích "Gửi email mời". Hoặc **Nhập từ file** (hộp 3 bước: tải mẫu .xlsx → tải file lên → xem trước).
9. **Vai trò & phân quyền → Gán vai trò**: gán *Kế toán* cho quản trị viên (cần để xem lương, tạm ứng, tính lương). Kỳ lương cần **người tính/nhập
   khác người duyệt** → gán thêm Kế toán cho một nhân viên thứ hai nếu muốn thử hết luồng lương.
10. (Kế toán) Hồ sơ nhân viên → **Lương** → **Nhập lương**, hoặc **Lương & tạm ứng → Mức lương** (để có hạn mức tạm ứng và để Kavor tính lương). **Lương & tạm ứng → Khoản phụ cấp**:
    **Thêm khoản mẫu** / **Thêm khoản**.

## C. App — nhân viên
11. App → **Kích hoạt tài khoản**: mã nhân viên + email ở bước 8 → OTP (Mailpit) → đặt mật khẩu → đồng ý điều khoản → máy đầu tiên tự được duyệt.
12. Trang chủ → **nhấn giữ nút Vào ca** (phải ở trong bán kính địa điểm bước 7). Thử Ra ca; thử tắt mạng rồi chấm (hàng đợi offline: "Chờ gửi").
13. Nút **+** → Xin nghỉ phép (chọn khoảng ngày, xem dải tô), Làm thêm giờ (bánh xe giờ, bước 5 phút), Giải trình công (nếu có ngày thiếu),
    Tạm ứng lương (nhập PIN — lần đầu tạo PIN), Sửa hồ sơ (đề nghị đổi số điện thoại/tài khoản ngân hàng).
14. Hồ sơ → Bảo mật và thiết bị: bật Face ID, đổi mã PIN.

## D. Duyệt và theo dõi (web HR)
15. **Đơn & phê duyệt**: duyệt / từ chối từng đơn ở bước 13 → app nhận thông báo (app đang mở: trong ~30 giây). Tạm ứng: Quản lý duyệt → HR (khi
    vượt ngưỡng) → Kế toán **Lương & tạm ứng → Tạm ứng** → **Xác nhận đã chi**. Đề nghị sửa hồ sơ: duyệt xong hồ sơ trên app đổi theo.
16. **Chấm công → Hôm nay**: thấy lần chấm, nút **Nhắc**; **Bảng công tháng**: ngày nghỉ phép/làm thêm/ngày lễ hiện đúng; **Sửa giờ** một ngày (có lý do).
17. **Bản tin**: đăng bài có PDF, bật "Gửi thông báo trong app" → app thấy bài + thông báo, mở PDF. **Tài liệu**: tải hợp đồng cho nhân viên
    (HR + Nhân viên) → app: Hồ sơ → Hợp đồng và quyết định (qua PIN/Face ID).
18. Hồ sơ nhân viên → ⋮: **Chuyển sang tạm nghỉ** / **Kết thúc tạm nghỉ**; **Cho nghỉ việc** (đơn chờ bị hủy, tài khoản bị khóa sau ngày cuối).

## E. Lương — nhánh B, công ty Hải Đăng (30 nhân viên SC0001–SC0030 đủ công kỳ trước)
19. Đăng nhập web HR bằng HR Admin Hải Đăng (HD0007, kích hoạt trên trang đăng nhập, OTP ở Mailpit). **Chấm công → Bảng công tháng**: kỳ trước đủ
    công 30 người → **Khóa kỳ công**.
20. **Lương & tạm ứng → Bảng lương kỳ này** (chọn kỳ trước): rà cảnh báo, **Chốt bảng**.
21. Kế toán thứ nhất (HD0215) → **Kỳ lương → Mở kỳ lương** → **Kavor tính lương** → xem trước → **Ghi vào kỳ lương (N người)** → **Gửi kiểm tra**.
    Thử tự duyệt → bị chặn.
22. Kế toán thứ hai (HD0216) → **Duyệt kỳ lương** → **Công bố phiếu lương** → **Đánh dấu đã trả lương** → **Đóng kỳ lương**.
23. Đối chiếu tay 2–3 người (lương theo công, BH, thuế TNCN, thực nhận) với tham số luật trên Console. App: kích hoạt **SC0001** (mã + email
    `sc0001@scale.test`, OTP ở Mailpit) → **Phiếu lương** (qua PIN/Face ID) → số khớp web.

## F. Quay lại Console — vận hành khách hàng
24. Doanh nghiệp → **Mở** → **Tạm khóa** (ghi lý do) → web HR và app hiện "Công ty tạm ngừng sử dụng Kavor" → **Mở lại**.
25. **Quyền hỗ trợ → Yêu cầu quyền hỗ trợ** → web HR (quản trị viên) thấy banner, **Cài đặt → Hỗ trợ Kavor → Duyệt** → Console **Mở phiên** (chỉ đọc,
    đếm ngược) → web HR **Thu hồi**.
26. **Nhật ký hoạt động**: thấy đủ các thao tác của Kavor ở trên.

## Giới hạn của bản dev (biết trước khi thử)
- Chỉ chạy trên Mac (+ iPhone cùng Wi-Fi); Mac tắt/đổi IP là app trên iPhone mất kết nối (đổi IP phải build lại app). Thư chỉ vào Mailpit.
- Chưa có push từ máy chủ: thông báo trong app chỉ đến khi app đang mở; thông báo cục bộ chỉ có nhắc hạn giải trình công. Widget chấm công chỉ là
  màn mô phỏng (chưa có widget thật).
- Tham số luật lương "Cần đối chiếu" (biểu thuế 5 bậc, khấu trừ 10% thời vụ) dùng tạm — chưa dùng số này để trả lương thật.
- Bản đồ dùng máy chủ tile cộng đồng (dev); chưa chọn nhà cung cấp bản đồ cho production.
