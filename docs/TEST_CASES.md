# Bộ test case thử tay Kavor — một công ty mới hoàn toàn (Console → web HR → app)

Dùng cho người dùng tự thử trên Mac + iPhone theo đúng thứ tự một khách hàng thật. Ghi kết quả vào cột **KQ**:
`Đạt` / `Lỗi: <mô tả + ảnh>` / `Bỏ qua: <lý do>`. Lỗi nào cũng ghi lại, kể cả chữ khó hiểu hay bố cục xấu.
Cập nhật 18/11/2026 (vòng 2 UAT): mục 1–8, 10–12 làm trên **công ty mới**; mục 9 (lương) làm trên **Hải Đăng + 30 nhân viên** đủ công kỳ trước
(kỳ công tháng này của công ty mới chưa kết thúc nên chưa khóa/tính lương được). Luồng tổng: `docs/TEST_WORKFLOW.md`.

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
| P-01 | Agent chạy `bash tools/db-reset.sh && bash tools/scale-data.sh 30`, `bash tools/dev-backend.sh`, `pnpm dev:admin`, `pnpm dev:console` | scale-data in ra tháng kỳ công đã sinh (ghi lại); http://localhost:3001 (Console) và http://localhost:3000 (web HR) mở được; Mailpit mở được | |
| P-02 | App build với `EXPO_PUBLIC_API_URL` trỏ API local: iOS Simulator + Android emulator (`10.0.2.2`, APK Release tạm `usesCleartextTraffic`); iPhone thật thì `http://<IP Mac>:4000/api/v1`, cùng Wi-Fi | App mở được màn đăng nhập | |
| P-03 | Chuẩn bị 3 email giả (vd. `boss@abc.test`, `ketoan@abc.test`, `nv1@abc.test`) — không cần có thật, thư rơi vào Mailpit | — | |

## 1. Kavor Console — quản trị viên đầu tiên (không chạy lệnh)

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| C-01 | Mở http://localhost:3001 (thử nút con mắt ở ô mật khẩu) → bấm **Kích hoạt tài khoản / Quên mật khẩu** → nhập **email quản trị viên đầu tiên** → **Gửi mã OTP** | Chuyển sang màn "Đặt mật khẩu"; Mailpit có thư mã 6 số gửi tới email đó | |
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
| C-30 | **Doanh nghiệp → Tạo doanh nghiệp**: mã `ABC-001`, tên "Công ty ABC", tên pháp lý, gói **Dùng thử**, giới hạn 50, quản trị viên "Nguyễn Sếp" `boss@abc.test`, **Mã nhân viên của quản trị viên** để `ADMIN01` (hoặc đổi, vd. `NV0001`) | Toast thành công kèm mã nhân viên; ABC-001 trong danh sách, trạng thái Hoạt động, 1 quản trị viên "chờ kích hoạt"; Mailpit có thư mời gửi boss@abc.test ghi đúng mã đã chọn | |
| C-31 | Tạo lại với mã `ABC-001` | Báo mã doanh nghiệp đã tồn tại | |
| C-32 | Tạo với mã sai định dạng (`ab`, có dấu cách…) | Báo định dạng mã (3–20 ký tự, chữ in hoa, số, gạch) | |
| C-33 | Mở chi tiết ABC-001 → gửi lại thư mời quản trị viên | Thư mới trong Mailpit (bấm 2 lần liền → báo đợi 1 phút) | |
| C-34 | **Gói dịch vụ**: xem thẻ gói và số doanh nghiệp mỗi gói | ABC-001 được đếm vào gói Dùng thử | |
| C-35 | **Tham số luật lương**: xem phiên bản đang hiệu lực → **Tính thử** một mức lương | Có lương tối thiểu vùng, tỷ lệ BH, giảm trừ gia cảnh, biểu thuế; mục "Cần đối chiếu" được đánh dấu; phiên bản đã hiệu lực không sửa đè được (chỉ **Tạo phiên bản mới**) | |

## 4. Web HR — quản trị viên công ty kích hoạt

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-01 | Mở http://localhost:3000 → **Kích hoạt tài khoản**: mã nhân viên ở C-30 (vd. `ADMIN01`) + `boss@abc.test` | Gửi OTP; Mailpit có mã | |
| H-02 | Nhập sai mã nhân viên (vd. ADMIN02) | Báo mã nhân viên và email không khớp | |
| H-03 | OTP đúng → đặt mật khẩu → quét QR (thêm tài khoản thứ ba trong ứng dụng xác thực) | Vào Tổng quan của **Công ty ABC** (không thấy dữ liệu Hải Đăng) | |
| H-04 | Đăng xuất → đăng nhập bằng email (hoặc mã ADMIN01) + mật khẩu + mã xác thực | Vào được | |
| H-05 | Console → chi tiết ABC-001 | Quản trị viên chuyển "đã kích hoạt" | |

## 5. Web HR — thiết lập công ty

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-10 | **Cài đặt → Thiết lập ban đầu** (hoặc thẻ ở Tổng quan) | Danh sách bước còn thiếu; mỗi bước ghi rõ thiếu gì (vd. "Đã tạo 1 địa điểm nhưng chưa áp dụng…") và nút Mở đi đúng chỗ | |
| H-11 | **Cài đặt doanh nghiệp → Doanh nghiệp**: sửa thông tin, tải logo, ảnh bìa, liên hệ phòng Nhân sự | Lưu được; logo hiện ở web; (sau này) app hiện logo + liên hệ HR | |
| H-12 | **Cài đặt → Quy định** (các ô nhập thẳng hàng, ghi chú luật nằm dưới ô): xem Phép năm, Làm thêm giờ, Giải trình công, Tạm ứng lương, Nhắc nhở | Có sẵn bộ mẫu theo luật VN; thêm phiên bản mới có ngày hiệu lực được; không sửa đè phiên bản cũ | |
| H-13 | Quy định **Làm thêm giờ**: đổi "Tối đa mỗi ngày làm việc" (vd. 3 giờ) từ hôm nay | Phiên bản mới hiệu lực từ hôm nay | |
| H-14 | **Cài đặt → Ngày lễ** | Có lịch lễ VN; thêm ngày nghỉ riêng của công ty được | |
| H-15 | **Cài đặt → Dữ liệu cá nhân** | Có điều khoản; nhân viên phải đồng ý khi kích hoạt app | |
| H-15b | **Cài đặt → Kỳ công & lương**: ngày bắt đầu kỳ công; **Quy chế lương**: vùng, lương thử việc thử nhập 80% | 80% bị chặn (≥ 85%, BLLĐ Điều 26); lưu được giá trị hợp lệ | |
| H-16 | **Cơ cấu tổ chức → Danh sách → Thêm đơn vị**: phòng "Kinh doanh", phòng con "Kinh doanh miền Nam". *(Công ty mới chỉ có sẵn 2 phòng: Ban Giám đốc, Hành chính – Nhân sự — phải làm bước này thì H-30 mới chọn được phòng Kinh doanh)* | Hiện trong cây và sơ đồ; có trong danh sách chọn phòng ban khi thêm nhân viên | |
| H-17 | **Ngừng** một phòng đang có nhân viên | Bị chặn, nêu lý do; phòng trống thì ngừng được | |
| H-18 | **Ca & địa điểm → Mẫu ca** | Có ca mặc định; thêm ca mới (vd. 08:00–17:00, nghỉ trưa) được | |
| H-19 | **Ca & địa điểm → Địa điểm → Thêm địa điểm**: tìm địa chỉ, kéo ghim, bán kính 50–100 m, **Hiệu lực từ ngày = hôm nay** (chọn ngày mai thì hôm nay chưa chấm công được). Muốn thử ở nhà: bấm "Dùng vị trí hiện tại của trình duyệt" (Chrome/Safari) | Bản đồ hiện, ghim kéo được, vòng tròn đúng bán kính; lưu được; nếu chọn ngày sau thì bảng ghi "Chưa hiệu lực" | |
| H-20 | **Ca & địa điểm → Áp dụng → Áp dụng mới** hai lần: (1) loại **Địa điểm** = H-19, (2) loại **Ca** = ca hành chính; tầng **Toàn công ty**, hiệu lực từ hôm nay | Hai dòng "Đang áp dụng"; Thiết lập ban đầu: Địa điểm chấm công + Ca làm việc chuyển "Đã xong" | |

## 6. Web HR — nhân viên và phân quyền

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-30 | **Nhân viên → Thêm nhân viên**: `NV001`, `nv1@abc.test`, phòng Kinh doanh, **quản lý trực tiếp = ADMIN01**, tích "Gửi email mời" | Hồ sơ tạo được; Mailpit có thư mời app | |
| H-31 | Thêm `KT001` (`ketoan@abc.test`), quản lý = ADMIN01 | Tạo được | |
| H-32 | Thêm nhân viên trùng mã hoặc trùng email | Báo trùng | |
| H-33 | **Nhập từ file** (hộp 3 bước): **Tải mẫu** .xlsx, thêm 3 dòng (1 dòng cố ý sai email) → kéo thả file → xem trước | Xem trước báo đúng dòng lỗi, không nhập khi còn lỗi; sửa xong nhập được cả 3 | |
| H-34 | File CSV Excel lưu bằng dấu chấm phẩy | Vẫn đọc được | |
| H-35 | Nút **Gửi lời mời (N)** cho người chưa mời | Gửi hàng loạt; người đã kích hoạt/thiếu email bị bỏ qua có lý do | |
| H-36 | **Vai trò & phân quyền → Gán vai trò**: ADMIN01 = **Kế toán** | Gán được; menu Lương & tạm ứng hiện đủ | |
| H-37 | Gán **Kế toán** cho KT001 (người duyệt kỳ lương thứ hai) | Gán được | |
| H-38 | Gán **Nhân sự vận hành** phạm vi một phòng cho một nhân viên → người đó đăng nhập web | Chỉ thấy nhân viên phòng đó | |
| H-39 | Thu hồi vai trò ở H-38 | Mất quyền ngay | |
| H-40 | Thêm nhân viên vượt giới hạn gói (Console đổi giới hạn còn 3 trước) | Báo đã đủ nhân sự của gói; Console đổi lại 50 thì thêm được | |
| H-41 | (ADMIN01, Kế toán) hồ sơ NV001 → **Lương** → **Nhập lương** (hoặc **Lương & tạm ứng → Mức lương**) | Lưu được; người không phải Kế toán không thấy số tiền; NV001 có hạn mức tạm ứng | |
| H-42 | **Lương & tạm ứng → Khoản phụ cấp** → **Thêm khoản mẫu** | Có các khoản mẫu (cách tính theo công/cố định/chuyên cần, chịu thuế/miễn thuế) | |
| H-43 | Hồ sơ NV001 → **Lương** → tài khoản ngân hàng → **Hiện số** | Mặc định chỉ 4 số cuối; hiện số đầy đủ được ghi vào nhật ký | |

## 7. App iPhone — nhân viên

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| M-01 | App → **Kích hoạt tài khoản** (ô mã/email để trống, không điền sẵn): `NV001` + `nv1@abc.test` → OTP (Mailpit) → mật khẩu (thử nút con mắt ẩn/hiện) → đồng ý điều khoản | Vào trang chủ; tiêu đề là **tên công ty đã đăng ký** (không phải Hải Đăng); dòng vị trí là địa điểm của công ty (chưa áp dụng thì "Chưa có địa điểm chấm công · liên hệ HR"); máy đầu tiên tự được duyệt | |
| M-02 | Lần đầu đăng nhập bằng mật khẩu: app hỏi "Dùng Face ID cho Kavor?" → **Bật** | iOS hỏi Face ID một lần rồi bật luôn (Bảo mật và thiết bị: cả hai công tắc bật). Đăng xuất → màn đăng nhập điền sẵn mã của mình → bấm biểu tượng Face ID → vào thẳng trang chủ, **không** bắt đăng ký thiết bị lại | |
| M-02b | Hồ sơ: avatar góc trên đúng chữ viết tắt tên mình; Bảo mật và thiết bị → Thiết bị chấm công đúng máy (iPhone 11, iOS…, ngày đăng ký); cuộn Hồ sơ xuống → mở Bảo mật/Widget → quay lại | Không phải dữ liệu mẫu; Hồ sơ giữ nguyên chỗ đang cuộn | |
| M-03 | Ở ngoài bán kính địa điểm → nhấn giữ **Vào ca** | Báo ngoài phạm vi, không ghi nhận | |
| M-04 | Trong bán kính → nhấn giữ **Vào ca** | Ghi nhận giờ vào; web HR **Chấm công → Hôm nay** thấy ngay | |
| M-05 | Tắt Wi-Fi + 4G → **Ra ca** → bật lại mạng | Trang chủ hiện "Chờ gửi" + "N lần lưu trên máy"; có mạng thì tự gửi, web thấy giờ thật lúc chấm | |
| M-05b | Tắt mạng → chấm → **Đăng xuất** (báo còn N lần chưa gửi) → người khác đăng nhập máy đó, bật mạng | Không gửi hộ lần chấm của NV001; NV001 đăng nhập lại thì gửi | |
| M-05c | Mất mạng, mở lại app → bấm vào đơn / thông báo | Không crash; hiện dữ liệu đã lưu | |
| M-06 | **+ → Xin nghỉ phép**: chọn khoảng 2 ngày | Dải ngày tô màu; số dư phép trừ tạm (giữ chỗ) | |
| M-07 | **+ → Làm thêm giờ**: bánh xe giờ | Phút đi theo bước 5; vượt giới hạn ngày (H-13) bị chặn | |
| M-08 | **+ → Giải trình công** cho ngày thiếu công | Gửi được | |
| M-09 | **+ → Tạm ứng lương** | Lần đầu bắt tạo PIN 6 số (chặn PIN dễ như 123456); sau đó nhập PIN/Face ID mới gửi được; hạn mức = % lương cơ bản, kiểm từng đơn (vượt → "Vượt hạn mức"; chưa nhập lương thì báo không có hạn mức) | |
| M-10 | Nhập sai PIN 5 lần | Xóa PIN + đăng xuất | |
| M-11 | **Hồ sơ → Đề nghị sửa**: đổi số điện thoại + tài khoản ngân hàng | Hồ sơ hiện thẻ "đang chờ HR" | |
| M-12 | **Hồ sơ → Bảo mật và thiết bị → Đổi mã PIN** | Đổi được (cần PIN cũ) | |
| M-13 | Cài app trên máy thứ hai (simulator) đăng nhập cùng NV001 | Máy thứ hai chờ HR duyệt; web HR **Chấm công → Thiết bị** → Duyệt thiết bị → máy hai dùng được | |
| M-14 | Cài app lần đầu (xóa app rồi cài lại) → đăng nhập | Lần lượt hiện hộp thoại hệ thống xin quyền **Thông báo** và **Vị trí**, sau đó mới hỏi Face ID | |
| M-15 | Hồ sơ → Bảo mật và thiết bị → **Quyền của ứng dụng**: tắt công tắc Vị trí | Hiện cảnh báo "Không có quyền vị trí thì bạn không chấm công được…" → Mở Cài đặt; tắt xong quay lại app: công tắc tắt, có ghi chú cảnh báo, trang chủ hiện thẻ "Kavor chưa có quyền vị trí"; bật lại trong Cài đặt thì hết cảnh báo | |
| M-16 | Công tắc Thông báo: tắt/bật | Mở Cài đặt của máy để đổi; quay lại app công tắc đúng trạng thái | |

## 8. Duyệt đơn và chấm công (web HR)

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-50 | **Đơn & phê duyệt**: duyệt đơn nghỉ phép M-06 | App (đang mở) nhận thông báo trong ~30 giây; số dư phép trừ thật | |
| H-51 | Từ chối đơn làm thêm M-07 có lý do | App thấy "Bị từ chối" + lý do | |
| H-52 | Duyệt giải trình M-08 | Bảng công ngày đó được sửa (không sửa lần chấm gốc) | |
| H-53 | Duyệt đề nghị sửa hồ sơ M-11 | Hồ sơ app + web đổi; nơi khác chỉ hiện 4 số cuối tài khoản | |
| H-54 | Tạm ứng M-09: quản lý duyệt → (vượt ngưỡng: HR) → Kế toán **Lương & tạm ứng → Tạm ứng** → **Xem & duyệt** → **Xác nhận đã chi** | App thấy trạng thái theo từng bước; bấm duyệt 2 lần liền không bỏ qua bước sau | |
| H-55 | **Chấm công → Bảng công tháng**: xem kỳ công tháng này | Ngày công NV001 đúng; ngày nghỉ phép đã duyệt hiện loại nghỉ (có/không lương), ngày lễ "Ngày lễ", OT đã duyệt có nhãn OT | |
| H-56 | **Khóa kỳ công** (kỳ chưa kết thúc / còn ngày thiếu công chưa giải trình / còn thiết bị chờ duyệt) | Bị chặn, nêu lý do; kỳ đủ điều kiện thì khóa được, khóa xong không sửa/giải trình vào kỳ đó; **Mở lại kỳ công** cần lý do | |
| H-57 | **Nghỉ phép**: sổ phép NV001 | Có giao dịch cấp/giữ chỗ/trừ khớp đơn | |
| H-58 | Bảng công tháng → ngày thiếu giờ ra của NV001 → **Sửa giờ** (lý do bắt buộc) → **Lưu điều chỉnh** | Ngày đó đủ công; NV001 nhận thông báo; không tự sửa công của mình được; kỳ đã khóa thì không sửa được | |
| H-59 | **Chấm công → Hôm nay** → **Nhắc** người chưa chấm | App người đó nhận thông báo nhắc | |
| H-5A | Hồ sơ một NV → ⋮ → **Chuyển sang tạm nghỉ** (Nghỉ không lương, từ hôm nay) → **Kết thúc tạm nghỉ** | Bảng công hiện "Tạm nghỉ" các ngày đó; kết thúc xong chấm công lại bình thường | |
| H-5B | Hồ sơ một NV có đơn chờ duyệt → ⋮ → **Cho nghỉ việc** (ngày cuối = hôm nay) | Đơn chờ bị hủy; sau ngày cuối tài khoản bị khóa, app không vào được | |

## 9. Lương — công ty Hải Đăng + 30 nhân viên SC0001–SC0030 (kỳ công trước, cần hai Kế toán)

Tài khoản Hải Đăng (kích hoạt trên trang đăng nhập web/app, OTP ở Mailpit, web cần ứng dụng xác thực): **HD0007** `thao.mai@haidang.vn` (HR Admin),
**HD0215** `nhung.do@haidang.vn` và **HD0216** `chau.nguyen@example.test` (Kế toán). SC0001…: lương 10.900.000 ₫, đủ công thứ 2–6 kỳ trước.

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-60 | (HD0007) **Lương & tạm ứng → Bảng lương kỳ này**, chọn kỳ trước → **Chốt bảng** khi kỳ công chưa khóa | Bị chặn: khóa kỳ công ở Bảng công trước khi chốt | |
| H-61 | **Chấm công → Bảng công tháng**, kỳ trước | 30 người SC đủ công, không ngày thiếu (bảng > 1.000 lượt chấm vẫn đủ, không mất người cuối) → **Khóa kỳ công** được | |
| H-62 | **Bảng lương kỳ này** (kỳ trước): xem thẻ Nhân viên / Cần rà soát / Chưa nhập lương → **Chốt bảng** (ghi chú cho Kế toán) | Đủ 30 người SC; người Hải Đăng chưa có lương hiện ở "Chưa nhập lương" (ghi lại số); trạng thái "Đã chốt"; **Xuất Excel** mở được, ô bắt đầu bằng `= + - @` không thành công thức | |
| H-63 | (HD0215) **Kỳ lương → Mở kỳ lương** (kỳ trước) → **Kavor tính lương** → xem trước | Mỗi người có dòng lương theo công kèm công thức, BH (hoặc lý do không đóng), thuế TNCN, thực nhận = tổng thu nhập − khấu trừ; có cảnh báo tham số luật "Cần đối chiếu"; HD0007 (không phải Kế toán) không có nút này | |
| H-64 | **Ghi vào kỳ lương (N người)** | Kỳ chuyển "Đã nhập"; N và tổng thực nhận khớp xem trước | |
| H-65 | Đối chiếu tay SC0001 và một người khác: lương theo công, BH người lao động, giảm trừ, thuế, thực nhận theo tham số luật Console (C-35) | Khớp đến từng đồng (lệch → ghi lại cả hai số) | |
| H-66 | **Gửi kiểm tra** → HD0215 thử **Duyệt kỳ lương** | Bị chặn (người tính/nhập ≠ người duyệt) | |
| H-67 | (Tùy chọn) HD0216 **Duyệt kỳ lương** → **Mở lại** với lý do → HD0215 **Gửi kiểm tra** lại | Về "Đã nhập", nhật ký ghi lý do; không ai có nút → ghi lại (quyền mở lại không nằm trong vai trò mặc định) | |
| H-68 | (HD0216) **Duyệt kỳ lương** → **Công bố phiếu lương** | "Đã công bố"; không nhập/tính lại được nữa | |
| H-69 | App: kích hoạt SC0001 (mã + `sc0001@scale.test`) → **Phiếu lương** | Mở bằng PIN/Face ID; số khớp web H-64 | |
| H-69b | **Đánh dấu đã trả lương** → **Đóng kỳ lương** | "Đã trả lương" → "Đã đóng" | |
| H-69c | (Cách cũ, tùy chọn) kỳ khác → **Nhập kết quả** → **Tải file mẫu** → điền số → **Bắt đầu kiểm tra** | Xem trước đúng; nhập được | |

## 10. Bản tin và tài liệu

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| H-70 | **Bản tin**: đăng bài có PDF, gửi cả công ty, bật thông báo trong app | App thấy bài + thông báo, mở được PDF | |
| H-71 | Bài hẹn giờ 15 phút sau | Đúng giờ (±10 phút) app mới thấy | |
| H-71b | Tạo bài, đặt **Hiển thị đến** = 5 phút sau, xuất bản ngay → chờ quá giờ | App thấy bài, quá giờ thì bài biến khỏi tab Bản tin và Trang chủ (kéo làm mới/mở lại tab); web hiện "Hết hạn"; sửa bài đặt giờ mới (gia hạn) thì app thấy lại | |
| H-72 | Bài chỉ gửi phòng Kinh doanh | Nhân viên phòng khác không thấy | |
| H-73 | **Tài liệu**: tải hợp đồng cho NV001 (chia sẻ HR + nhân viên) | App: Hồ sơ → Hợp đồng và quyết định (qua PIN/Face ID) mở được | |
| H-74 | Thay file hợp đồng | Thành phiên bản mới, bản cũ vẫn xem lại được | |

## 11. Console vận hành công ty

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| C-40 | Chi tiết ABC-001 → **Đổi gói** (Starter, 100) có lý do | Web HR Cài đặt thấy gói mới | |
| C-41 | **Tạm khóa** ABC-001 có lý do | Web HR và app báo "Công ty tạm ngừng sử dụng Kavor"; Hải Đăng vẫn dùng bình thường | |
| C-42 | **Mở lại** | Web HR + app dùng lại được | |
| C-43 | **Quyền hỗ trợ → Yêu cầu quyền hỗ trợ** ABC-001 (mã phiếu, lý do, phạm vi Cấu hình công ty) | Web HR (ADMIN01) thấy banner yêu cầu | |
| C-44 | Web HR **Cài đặt → Hỗ trợ Kavor → Duyệt** → Console **Mở phiên** | Console xem chỉ đọc, có đếm ngược; không có lương/liên hệ cá nhân | |
| C-45 | Web HR **Thu hồi** | Console mất quyền xem ngay | |
| C-46 | **Khôi phục chủ sở hữu**: ops1 tạo yêu cầu đặt lại xác thực cho ADMIN01 → quản trị viên Console duyệt | Người tạo không tự duyệt được; người thứ hai duyệt được; ADMIN01 đăng nhập phải quét QR mới | |
| C-47 | **Nhật ký hoạt động** (Console) và nhật ký web HR | Thấy đủ thao tác của Kavor trên ABC-001 | |
| C-48 | (Tùy chọn, không hoàn tác) tạo công ty phụ `XOA-001` → Tạm khóa → **Đóng doanh nghiệp** (gõ lại mã) | Đóng xong không mở lại được | |
| C-49 | (Quản trị Console) tạo công ty phụ `XOA-002`, kích hoạt quản trị viên trên web HR → Console: chi tiết → **Xóa vĩnh viễn** khi còn hoạt động | Không có nút (chỉ hiện khi tạm khóa/đã đóng); tài khoản Vận hành nền tảng cũng không có nút |  |
| C-50 | Tạm khóa XOA-002 → **Xóa vĩnh viễn**: thử bấm khi chưa tích ô / gõ sai mã | Nút Xóa bị khóa / báo gõ đúng mã |  |
| C-51 | Tích ô, gõ đúng mã, lý do ≥ 10 ký tự → Xóa vĩnh viễn | Toast "Đã xóa vĩnh viễn XOA-002: … dòng dữ liệu, … tài khoản, … file"; không còn trong danh sách; quản trị viên XOA-002 đăng nhập web HR → sai tài khoản; Nhật ký hoạt động có dòng "Xóa vĩnh viễn doanh nghiệp" kèm lý do; công ty ABC không mất gì |  |

## 12. Kiểm tra cách ly dữ liệu

| Mã | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|
| S-01 | Đăng nhập web HR ABC → tìm nhân viên Hải Đăng (vd. HD0007) | Không thấy | |
| S-02 | Nhân viên ABC không thấy bản tin/tài liệu/đơn của Hải Đăng trên app | Đúng | |
| S-03 | Nhân viên thường (NV001) thử đăng nhập web HR | Không có quyền vào các trang quản trị | |
| S-04 | Đăng nhập Console bằng tài khoản web HR (boss@abc.test) | Báo "Email hoặc mật khẩu không đúng" | |

## Giới hạn đã biết của bản dev (không cần báo lỗi)
- Chỉ chạy trên Mac (+ iPhone cùng Wi-Fi); thư chỉ vào Mailpit; thông báo chỉ đến khi app đang mở (chưa có push khi tắt app; thông báo cục bộ chỉ
  nhắc hạn giải trình công). Widget chấm công chỉ là màn mô phỏng.
- Tham số luật "Cần đối chiếu" (biểu thuế 5 bậc, khấu trừ 10% thời vụ) dùng tạm; khóa kỳ công chưa chặn khi còn đơn làm thêm giờ chờ duyệt.
- Phạm vi "phòng ban" chỉ gồm đúng phòng đó, chưa gồm phòng con (H-38).
- Bản đồ dùng máy chủ cộng đồng (dev); production sẽ dùng nhà cung cấp bản đồ Việt Nam.
- Reset DB (`tools/db-reset.sh`) xóa mọi thứ: quản trị viên Console phải kích hoạt lại (C-01).
