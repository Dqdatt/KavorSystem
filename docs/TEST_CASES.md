# Bộ test case thử tay Kavor — một công ty mới hoàn toàn (Console → web HR → app)

Dùng cho người dùng tự thử trên Mac + iPhone theo đúng thứ tự một khách hàng thật. Ghi kết quả vào cột **KQ**:
`Đạt` / `Lỗi: <mô tả + ảnh>` / `Bỏ qua: <lý do>`. Lỗi nào cũng ghi lại, kể cả chữ khó hiểu hay bố cục xấu.

Quy ước:
- **Mailpit** = hộp thư dev http://127.0.0.1:55324 — mọi thư mời và mã OTP (email) nằm ở đây, chưa gửi email thật.
- **Ứng dụng xác thực** = Google Authenticator / Microsoft Authenticator / 1Password trên điện thoại (mã 6 số đổi mỗi 30 giây).
- Mật khẩu tự đặt: ≥ 8 ký tự, có chữ hoa, chữ thường, số. Ghi lại ở chỗ an toàn, không gửi qua chat.
- Công ty mẫu "Hải Đăng" có sẵn trong DB để so sánh; mọi bước dưới đây làm trên **công ty mới** do anh tạo.
- **Email quản trị viên Console đầu tiên**: `CONSOLE_BOOTSTRAP_EMAIL` trong `apps/api/.env.local` của máy (không commit; không đặt thì là
  `admin@kavor.test`). Thư OTP vẫn vào Mailpit, không gửi tới hộp thư thật.
- Tên vai trò: **Quản trị Console** (toàn quyền + quản lý nhân viên Kavor), **Vận hành nền tảng**, **Hỗ trợ Kavor** (chỉ xem).

## 0. Chuẩn bị (agent làm trước, anh kiểm lại)

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| P-01 | Agent chạy `bash tools/db-reset.sh`, `bash tools/dev-backend.sh`, `pnpm dev:admin`, `pnpm dev:console` | http://localhost:3001 (Console) và http://localhost:3000 (web HR) mở được; Mailpit mở được | |
| P-02 | App trên iPhone build với `EXPO_PUBLIC_API_URL=http://<IP Mac>:4000/api/v1`, iPhone cùng Wi-Fi với Mac | App mở được màn đăng nhập | |
| P-03 | Chuẩn bị 3 email giả (vd. `boss@abc.test`, `ketoan@abc.test`, `nv1@abc.test`) — không cần có thật, thư rơi vào Mailpit | — | |

## 1. Kavor Console — quản trị viên đầu tiên (không chạy lệnh)

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| C-01 | Mở http://localhost:3001 → bấm **Kích hoạt tài khoản / Quên mật khẩu** → nhập **email quản trị viên đầu tiên** → **Gửi mã OTP** | Chuyển sang màn "Đặt mật khẩu"; Mailpit có thư mã 6 số gửi tới email đó | |
| C-02 | Nhập mã OTP sai (vd. 000000) + mật khẩu hợp lệ | Báo "Mã OTP không đúng hoặc đã hết hạn", không đăng nhập | |
| C-03 | Nhập mã đúng + mật khẩu yếu (vd. `abc`) | Báo yêu cầu mật khẩu (8 ký tự, chữ hoa, số) | |
| C-04 | Nhập mã đúng, hai ô mật khẩu khác nhau | Báo "Hai lần nhập mật khẩu không khớp" | |
| C-05 | Nhập mã đúng + mật khẩu mạnh, nhập lại khớp → **Đặt mật khẩu và đăng nhập** | Sang màn "Xác thực hai lớp" có mã QR + khóa thủ công | |
| C-06 | Quét QR bằng ứng dụng xác thực, nhập mã 6 số | Vào trang Tổng quan nền tảng; góc trái dưới: "Quản trị Kavor · Quản trị Console"; menu có mục **Hệ thống → Nhân viên Kavor** | |
| C-07 | Đăng xuất → đăng nhập lại bằng email quản trị viên + mật khẩu → nhập mã từ ứng dụng | Vào được; lần này không hiện QR nữa | |
| C-08 | Đăng xuất → **Kích hoạt tài khoản / Quên mật khẩu** với một email lạ (vd. `ai@do.test`) | Vẫn hiện "đã gửi mã" (không lộ email nào là nhân viên Kavor) nhưng Mailpit **không** có thư cho email đó | |
| C-09 | Sai mật khẩu 5 lần liên tiếp ở màn đăng nhập | Lần sau báo thử quá nhiều lần, đợi vài phút | |

## 2. Kavor Console — nhân viên Kavor

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| C-10 | **Nhân viên Kavor → Mời nhân viên Kavor**: họ tên, email `ops1@kavor.test`, vai trò **Vận hành nền tảng** → Gửi lời mời | Toast "Đã gửi thư mời…"; bảng Lời mời có dòng "Chờ kích hoạt", hết hạn sau 7 ngày; Mailpit có thư "Kavor Console: bạn được mời…" | |
| C-11 | Mời lại đúng `ops1@kavor.test` | Báo email đang có lời mời chờ kích hoạt | |
| C-12 | Bấm **Gửi lại thư** ngay | Báo vừa gửi, đợi một phút; sau 1 phút bấm lại thì gửi được thư thứ hai | |
| C-13 | Mời `ops2@kavor.test` vai trò **Hỗ trợ Kavor** → bấm **Thu hồi** | Trạng thái "Đã thu hồi"; thử kích hoạt bằng ops2 (C-08) → không có thư OTP | |
| C-14 | Mở cửa sổ ẩn danh (hoặc trình duyệt khác) → Console → **Kích hoạt tài khoản** với `ops1@kavor.test` → OTP → mật khẩu → quét QR (thêm tài khoản thứ hai trong ứng dụng xác thực) | Vào Console với vai trò "Vận hành nền tảng"; **không** thấy mục Nhân viên Kavor | |
| C-15 | (cửa sổ admin) tải lại trang Nhân viên Kavor | ops1 hiện trong danh sách, "Đã bật" xác thực hai lớp; lời mời chuyển "Đã kích hoạt" | |
| C-16 | Ở dòng của chính mình | Không có nút thao tác (không tự khóa/đổi vai trò) | |
| C-17 | ops1 → **Đổi vai trò** → Hỗ trợ Kavor, lý do "thử quyền" | Lưu được; ops1 tải lại Console: không còn nút Tạo doanh nghiệp / Đổi gói / Tạm khóa | |
| C-18 | ops1 → **Khóa**, lý do "thử khóa" | Cửa sổ của ops1 bấm bất kỳ trang nào → bị đẩy ra / báo lỗi quyền; đăng nhập lại → "Email hoặc mật khẩu không đúng" | |
| C-19 | ops1 → **Mở khóa** + **Đổi vai trò** về Vận hành nền tảng | ops1 đăng nhập lại được | |
| C-20 | ops1 → **Đặt lại xác thực** (giả mất điện thoại), lý do ≥ 5 ký tự | Cột xác thực "Chưa liên kết"; ops1 đăng nhập → phải quét QR mới | |
| C-21 | ops1 dùng **Quên mật khẩu** → OTP → mật khẩu mới | Mật khẩu cũ không dùng được, mật khẩu mới dùng được, vai trò giữ nguyên | |
| C-22 | **Nhật ký hoạt động** | Thấy các dòng: kích hoạt quản trị viên đầu tiên, mời, thu hồi, kích hoạt, đổi vai trò/trạng thái, đặt lại xác thực, đặt lại mật khẩu | |

## 3. Kavor Console — tạo công ty mới

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| C-30 | **Doanh nghiệp → Tạo doanh nghiệp**: mã `ABC-001`, tên "Công ty ABC", tên pháp lý, gói **Dùng thử**, giới hạn 50, quản trị viên "Nguyễn Sếp" `boss@abc.test` | Toast thành công; ABC-001 trong danh sách, trạng thái Hoạt động, 1 quản trị viên "chờ kích hoạt"; Mailpit có thư mời gửi boss@abc.test có mã nhân viên **ADMIN01** | |
| C-31 | Tạo lại với mã `ABC-001` | Báo mã doanh nghiệp đã tồn tại | |
| C-32 | Tạo với mã sai định dạng (`ab`, có dấu cách…) | Báo định dạng mã (3–20 ký tự, chữ in hoa, số, gạch) | |
| C-33 | Mở chi tiết ABC-001 → gửi lại thư mời quản trị viên | Thư mới trong Mailpit (bấm 2 lần liền → báo đợi 1 phút) | |
| C-34 | **Gói dịch vụ**: xem thẻ gói và số doanh nghiệp mỗi gói | ABC-001 được đếm vào gói Dùng thử | |

## 4. Web HR — quản trị viên công ty kích hoạt

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-01 | Mở http://localhost:3000 → **Kích hoạt tài khoản**: mã `ADMIN01` + `boss@abc.test` | Gửi OTP; Mailpit có mã | |
| H-02 | Nhập sai mã nhân viên (vd. ADMIN02) | Báo mã nhân viên và email không khớp | |
| H-03 | OTP đúng → đặt mật khẩu → quét QR (thêm tài khoản thứ ba trong ứng dụng xác thực) | Vào Tổng quan của **Công ty ABC** (không thấy dữ liệu Hải Đăng) | |
| H-04 | Đăng xuất → đăng nhập bằng email (hoặc mã ADMIN01) + mật khẩu + mã xác thực | Vào được | |
| H-05 | Console → chi tiết ABC-001 | Quản trị viên chuyển "đã kích hoạt" | |

## 5. Web HR — thiết lập công ty

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-10 | **Tổng quan → Thiết lập ban đầu** | Danh sách bước còn thiếu (địa điểm, nhân viên…) | |
| H-11 | **Cài đặt doanh nghiệp → Doanh nghiệp**: sửa thông tin, tải logo, ảnh bìa, liên hệ phòng Nhân sự | Lưu được; logo hiện ở web; (sau này) app hiện logo + liên hệ HR | |
| H-12 | **Cài đặt → Quy định**: xem Phép năm, Làm thêm giờ, Giải trình công, Tạm ứng lương, Nhắc nhở | Có sẵn bộ mẫu theo luật VN; thêm phiên bản mới có ngày hiệu lực được; không sửa đè phiên bản cũ | |
| H-13 | Quy định **Làm thêm giờ**: đổi "Tối đa mỗi ngày làm việc" (vd. 3 giờ) từ hôm nay | Phiên bản mới hiệu lực từ hôm nay | |
| H-14 | **Cài đặt → Ngày lễ** | Có lịch lễ VN; thêm ngày nghỉ riêng của công ty được | |
| H-15 | **Cài đặt → Dữ liệu cá nhân** | Có điều khoản; nhân viên phải đồng ý khi kích hoạt app | |
| H-16 | **Cơ cấu tổ chức → Danh sách → Thêm đơn vị**: phòng "Kinh doanh", phòng con "Kinh doanh miền Nam" | Hiện trong cây và sơ đồ | |
| H-17 | **Ngừng** một phòng đang có nhân viên | Bị chặn, nêu lý do; phòng trống thì ngừng được | |
| H-18 | **Ca & địa điểm → Mẫu ca** | Có ca mặc định; thêm ca mới (vd. 08:00–17:00, nghỉ trưa) được | |
| H-19 | **Ca & địa điểm → Địa điểm → Thêm địa điểm**: tìm địa chỉ, kéo ghim, bán kính 50–100 m. Muốn thử ở nhà: bấm "Dùng vị trí hiện tại của trình duyệt" (Chrome/Safari) | Bản đồ hiện, ghim kéo được, vòng tròn đúng bán kính; lưu được | |
| H-20 | **Ca & địa điểm → Áp dụng → Áp dụng mới**: Địa điểm (H-19) + Ca, tầng **Toàn công ty** | Hiện trong bảng áp dụng; Thiết lập ban đầu bớt một bước | |

## 6. Web HR — nhân viên và phân quyền

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-30 | **Nhân viên → Thêm nhân viên**: `NV001`, `nv1@abc.test`, phòng Kinh doanh, **quản lý trực tiếp = ADMIN01**, tích "Gửi email mời" | Hồ sơ tạo được; Mailpit có thư mời app | |
| H-31 | Thêm `KT001` (`ketoan@abc.test`), quản lý = ADMIN01 | Tạo được | |
| H-32 | Thêm nhân viên trùng mã hoặc trùng email | Báo trùng | |
| H-33 | **Nhập từ file**: tải file mẫu, mở Excel, thêm 3 dòng (1 dòng cố ý sai email), lưu CSV UTF-8 → tải lên | Xem trước báo đúng dòng lỗi, không nhập khi còn lỗi; sửa xong nhập được cả 3 | |
| H-34 | File CSV Excel lưu bằng dấu chấm phẩy | Vẫn đọc được | |
| H-35 | Nút **Gửi lời mời (N)** cho người chưa mời | Gửi hàng loạt; người đã kích hoạt/thiếu email bị bỏ qua có lý do | |
| H-36 | **Vai trò & phân quyền → Gán vai trò**: ADMIN01 = **Kế toán** | Gán được; menu Lương & tạm ứng hiện đủ | |
| H-37 | Gán **Kế toán** cho KT001 (người duyệt kỳ lương thứ hai) | Gán được | |
| H-38 | Gán **Nhân sự vận hành** phạm vi một phòng cho một nhân viên → người đó đăng nhập web | Chỉ thấy nhân viên phòng đó | |
| H-39 | Thu hồi vai trò ở H-38 | Mất quyền ngay | |
| H-40 | Thêm nhân viên vượt giới hạn gói (Console đổi giới hạn còn 3 trước) | Báo đã đủ nhân sự của gói; Console đổi lại 50 thì thêm được | |

## 7. App iPhone — nhân viên

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| M-01 | App → **Kích hoạt tài khoản**: `NV001` + `nv1@abc.test` → OTP (Mailpit) → mật khẩu → đồng ý điều khoản | Vào trang chủ; logo/tên Công ty ABC; máy đầu tiên tự được duyệt | |
| M-02 | Bật Face ID khi được hỏi | Lần mở sau dùng Face ID hệ thống | |
| M-03 | Ở ngoài bán kính địa điểm → nhấn giữ **Vào ca** | Báo ngoài phạm vi, không ghi nhận | |
| M-04 | Trong bán kính → nhấn giữ **Vào ca** | Ghi nhận giờ vào; web HR **Chấm công → Hôm nay** thấy ngay | |
| M-05 | Tắt Wi-Fi + 4G → **Ra ca** → bật lại mạng | Lần chấm vào hàng đợi rồi tự gửi khi có mạng | |
| M-06 | **+ → Xin nghỉ phép**: chọn khoảng 2 ngày | Dải ngày tô màu; số dư phép trừ tạm (giữ chỗ) | |
| M-07 | **+ → Làm thêm giờ**: bánh xe giờ | Phút đi theo bước 5; vượt giới hạn ngày (H-13) bị chặn | |
| M-08 | **+ → Giải trình công** cho ngày thiếu công | Gửi được | |
| M-09 | **+ → Tạm ứng** | Lần đầu bắt tạo PIN 6 số (chặn PIN dễ như 123456); sau đó nhập PIN/Face ID mới gửi được; hạn mức theo lương cơ bản (chưa nhập lương thì báo không có hạn mức) | |
| M-10 | Nhập sai PIN 5 lần | Xóa PIN + đăng xuất | |
| M-11 | **Hồ sơ → Đề nghị sửa**: đổi số điện thoại + tài khoản ngân hàng | Hồ sơ hiện thẻ "đang chờ HR" | |
| M-12 | **Hồ sơ → Bảo mật và thiết bị → Đổi mã PIN** | Đổi được (cần PIN cũ) | |
| M-13 | Cài app trên máy thứ hai (simulator) đăng nhập cùng NV001 | Máy thứ hai chờ HR duyệt; web HR **Chấm công → Thiết bị** → Duyệt thiết bị → máy hai dùng được | |

## 8. Duyệt đơn và chấm công (web HR)

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-50 | **Đơn & phê duyệt**: duyệt đơn nghỉ phép M-06 | App (đang mở) nhận thông báo trong ~30 giây; số dư phép trừ thật | |
| H-51 | Từ chối đơn làm thêm M-07 có lý do | App thấy "Bị từ chối" + lý do | |
| H-52 | Duyệt giải trình M-08 | Bảng công ngày đó được sửa (không sửa lần chấm gốc) | |
| H-53 | Duyệt đề nghị sửa hồ sơ M-11 | Hồ sơ app + web đổi; nơi khác chỉ hiện 4 số cuối tài khoản | |
| H-54 | Tạm ứng M-09: quản lý duyệt → Kế toán **Lương & tạm ứng → Tạm ứng** xử lý → đánh dấu đã chi | App thấy trạng thái theo từng bước | |
| H-55 | **Chấm công → Bảng công**: xem kỳ công tháng này | Có ngày công NV001; **lưu ý**: ngày nghỉ phép chưa được cộng công (giới hạn đã biết) | |
| H-56 | **Khóa kỳ công** | Khóa xong không sửa/giải trình vào kỳ đó được | |
| H-57 | **Nghỉ phép**: sổ phép NV001 | Có giao dịch cấp/giữ chỗ/trừ khớp đơn | |

## 9. Lương (cần hai Kế toán)

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-60 | (ADMIN01) **Lương & tạm ứng → Lương cơ bản**: nhập lương NV001 | Lưu được; người không phải Kế toán không thấy số tiền | |
| H-61 | **Kỳ lương → Mở kỳ lương** → **Tải file mẫu** → điền số → **Nhập kết quả lương** | Xem trước đúng; nhập được | |
| H-62 | **Gửi kiểm tra** → ADMIN01 thử tự duyệt | Bị chặn (người nhập ≠ người duyệt) | |
| H-63 | Đăng nhập KT001 (kích hoạt web như H-01, mã KT001) → **Duyệt kỳ lương** → **Công bố phiếu lương** | Công bố được | |
| H-64 | App NV001 → **Phiếu lương** | Mở bằng PIN/Face ID, số khớp file | |

## 10. Bản tin và tài liệu

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-70 | **Bản tin**: đăng bài có PDF, gửi cả công ty, bật thông báo trong app | App thấy bài + thông báo, mở được PDF | |
| H-71 | Bài hẹn giờ 15 phút sau | Đúng giờ (±10 phút) app mới thấy | |
| H-72 | Bài chỉ gửi phòng Kinh doanh | Nhân viên phòng khác không thấy | |
| H-73 | **Tài liệu**: tải hợp đồng cho NV001 (chia sẻ HR + nhân viên) | App: Hồ sơ → Hợp đồng và quyết định (qua PIN/Face ID) mở được | |
| H-74 | Thay file hợp đồng | Thành phiên bản mới, bản cũ vẫn xem lại được | |

## 11. Console vận hành công ty

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| C-40 | Chi tiết ABC-001 → **Đổi gói** (Starter, 100) có lý do | Web HR Cài đặt thấy gói mới | |
| C-41 | **Tạm khóa** ABC-001 có lý do | Web HR và app báo "Công ty tạm ngừng sử dụng Kavor"; Hải Đăng vẫn dùng bình thường | |
| C-42 | **Mở lại** | Web HR + app dùng lại được | |
| C-43 | **Quyền hỗ trợ → Yêu cầu truy cập** ABC-001 (mã phiếu, lý do, phạm vi Cấu hình công ty) | Web HR (ADMIN01) thấy banner yêu cầu | |
| C-44 | Web HR **Cài đặt → Hỗ trợ Kavor → Duyệt** → Console **Mở phiên** | Console xem chỉ đọc, có đếm ngược; không có lương/liên hệ cá nhân | |
| C-45 | Web HR **Thu hồi** | Console mất quyền xem ngay | |
| C-46 | **Khôi phục chủ sở hữu**: ops1 tạo yêu cầu đặt lại xác thực cho ADMIN01 → quản trị viên Console duyệt | Người tạo không tự duyệt được; người thứ hai duyệt được; ADMIN01 đăng nhập phải quét QR mới | |
| C-47 | **Nhật ký hoạt động** (Console) và nhật ký web HR | Thấy đủ thao tác của Kavor trên ABC-001 | |
| C-48 | (Tùy chọn, không hoàn tác) tạo công ty phụ `XOA-001` → Tạm khóa → **Đóng doanh nghiệp** (gõ lại mã) | Đóng xong không mở lại được | |

## 12. Kiểm tra cách ly dữ liệu

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| S-01 | Đăng nhập web HR ABC → tìm nhân viên Hải Đăng (vd. HD0007) | Không thấy | |
| S-02 | Nhân viên ABC không thấy bản tin/tài liệu/đơn của Hải Đăng trên app | Đúng | |
| S-03 | Nhân viên thường (NV001) thử đăng nhập web HR | Không có quyền vào các trang quản trị | |
| S-04 | Đăng nhập Console bằng tài khoản web HR (boss@abc.test) | Báo "Email hoặc mật khẩu không đúng" | |

## Giới hạn đã biết của bản dev (không cần báo lỗi)
- Chỉ chạy trên Mac + iPhone cùng Wi-Fi; thư chỉ vào Mailpit; thông báo chỉ đến khi app đang mở (chưa có push khi tắt app).
- Bảng công chưa cộng ngày nghỉ phép / giờ làm thêm đã duyệt; lương là nhập kết quả từ file (chưa tự tính); chưa có widget.
- Bản đồ dùng máy chủ cộng đồng (dev); production sẽ dùng nhà cung cấp bản đồ Việt Nam.
- Reset DB (`tools/db-reset.sh`) xóa mọi thứ: quản trị viên Console phải kích hoạt lại (C-01).
