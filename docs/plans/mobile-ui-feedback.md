# Phản hồi UI mobile của người dùng (26/10) — đã làm mục 1–8 (29/10), còn mục 9 (widget)

Người dùng thử app trên iPhone và ghi lại 9 điểm cần sửa. Làm trên Mac (cần simulator/iPhone để chụp + đối chiếu): mỗi màn đổi xong chụp lại
bằng `tools/ui-compare/` và thử trên máy thật (animation, Face ID, bàn phím phải xác nhận trên thiết bị vật lý). Vị trí code dưới đây tra ngày 26/10
trên nhánh `claude/ecstatic-pascal-dblg7v`, có thể đã đổi — đọc lại trước khi sửa.

| # | Phản hồi | Hiện tại | Hướng làm |
|---|---|---|---|
| 1 | Mở app: splash hiện **màu xanh đặc** rồi mới chuyển sang màn gradient → muốn vào thẳng màu/nền gradient | `apps/mobile/app.json`: `splash.backgroundColor` và plugin `expo-splash-screen` đều `#065F46`; màn đầu (`src/screens/auth.tsx`, style `auth`) là gradient sáng `#FBFBFD → #F9FBFA` | Đổi nền splash sang màu nền màn đầu (gradient không đặt được ở splash native → dùng ảnh splash full-screen có gradient, hoặc màu nền trùng màu chủ đạo của gradient) và logo phù hợp nền sáng; ẩn splash khi màn đầu đã vẽ. Cần `expo prebuild` → xem cạm bẫy prebuild trong AGENTS.md (sao lưu `project.pbxproj`/`Info.plist`). |
| 2a | Đăng ký **làm thêm giờ**: hiện kèm giờ check-in/check-out thật của ngày đó để đối chiếu | Form OT `src/screens/forms.tsx` (~dòng 350–390) chỉ có ngày + giờ; API OT (`apps/api/src/overtime`) chưa trả chấm công ngày đó | Khi chọn ngày, gọi dữ liệu bảng công/attendance của ngày (đã có `timesheetApi`/`/me/timesheet`) và hiện "Vào hh:mm · Ra hh:mm" (hoặc "Chưa chấm công"). Liên quan mục còn thiếu "đối chiếu giờ OT với chấm công thực tế" trong PROGRESS. |
| 2b | Chọn giờ: **vuốt chọn giờ/phút** (wheel) thay cho nút +/− | Component `Stepper` (`src/ui.tsx`) dùng ở form OT (bước 30 phút) và form giải trình (bước 5 phút, `forms.tsx` ~dòng 48, 85) | Thay bằng bộ chọn dạng bánh xe (iOS-style picker, cột giờ + phút theo bước của quy định). Kiểm tra cả Android. Áp dụng cho mọi chỗ đang dùng `Stepper` chọn giờ. |
| 3 | **Chưa có cài đặt mã PIN** cho nhân viên | **Lỗ hổng:** cổng PIN (`openPin` / `ACT` xử lý phím trong `src/store.ts`, ~dòng 1293–1295) chấp nhận **bất kỳ 6 số nào** (`S.pin.length === 6` → `pinSuccess`) | Thêm luồng tạo PIN lần đầu (nhập 2 lần), đổi PIN, quên PIN (A11: xác thực lại bằng mật khẩu + OTP); lưu băm PIN trong SecureStore (hoặc server), khóa tạm sau N lần sai. Ưu tiên cao vì PIN đang bảo vệ phiếu lương/tạm ứng/tài liệu. |
| 4 | Phiếu lương: trong modal PIN, bấm Face ID thì **gọi thẳng hộp thoại hệ thống của Apple**, bỏ modal Face ID tự vẽ của app | `ACT.faceid` (`src/store.ts` ~dòng 1298) đổi sheet sang `kind: "face"` (`src/sheets.tsx` case `"face"`: tiêu đề "Face ID", `FaceRing`, "Đang nhận diện…") rồi mới gọi `authenticate()` | Bỏ bước chuyển sang sheet `face`; gọi `authenticate()` ngay khi bấm (giữ sheet PIN phía sau làm phương án dự phòng). Xóa/ngưng dùng sheet `face` nếu không còn chỗ nào cần. |
| 5 | Sinh trắc học **theo hệ điều hành**: iOS là Face ID, Android là vân tay | `biometricLabel()` (`src/auth.ts` ~dòng 67) đã chọn theo phần cứng ("Face ID" / "vân tay" / "sinh trắc học"), nhưng biểu tượng/nhãn nhiều nơi trong UI vẫn vẽ cứng Face ID theo prototype (icon Face ID, chữ "Face ID" trong sheet, nút đăng nhập…) | Rà toàn bộ chữ + icon sinh trắc học: dùng `S.bioLabel` và icon tương ứng (Face ID trên iPhone có Face ID, vân tay trên Android/iPhone Touch ID). Thử trên Android emulator. |
| 6 | Bản tin: người đăng + thời gian **lúc căn giữa, lúc căn trái** → đồng nhất **căn trái** | `src/screens/news.tsx` (dòng meta dùng `by: a.authorLabel`, `rel`, `read`) ở danh sách/thẻ nổi bật/chi tiết | Rà mọi chỗ hiển thị meta tác giả/thời gian trong danh sách, thẻ trên Trang chủ và màn chi tiết; căn trái thống nhất. Chụp lại các màn bản tin. |
| 7 | Xin nghỉ nhiều ngày: chọn ngày bắt đầu và kết thúc thì **tô dải** từ ngày đầu tới ngày cuối | Lịch chọn ngày trong form nghỉ phép (`src/screens/forms.tsx`, màn `leaveNew`) | Hiện dải nền liền (range highlight) giữa ngày bắt đầu và kết thúc, ngày đầu/cuối bo tròn, ngày nghỉ/lễ trong dải vẫn phân biệt được; có hiệu ứng nhẹ khi chọn ngày cuối. |
| 8 | Nút **"?"** góc trên phải các modal/tính năng: bấm vào thì hiện **hướng dẫn sử dụng** tính năng đó | `HelpBtn` (`src/screen.tsx` dòng ~72) → `ACT.help` → sheet `help` (`src/sheets.tsx` ~dòng 93) đang hiện **ghi chú QA của prototype** (ví dụ "V03 – V04 Hạn mức = 30%…", "Widget cỡ vừa có nút chấm công (App Intent, iOS 17+)…") | Viết nội dung hướng dẫn cho người dùng theo từng màn/tính năng (chấm công, giải trình, nghỉ phép, OT, tạm ứng, phiếu lương, đơn từ, bản tin, hồ sơ…), tách khỏi ghi chú QA (ghi chú QA chỉ hiện khi bật `EXPO_PUBLIC_KAVOR_QA`). Nội dung không được chứa giá trị nghiệp vụ cứng (lấy số từ quy định qua API nếu cần). |
| 9 | **Widget chấm công** chưa làm, hiện chỉ là prototype | Màn `widgetGuide` (`src/screens/profile.tsx`, `widgetGuideSpec`) + mô phỏng `ACT.wpunch` trong `src/store.ts` (dữ liệu giả, `setTimeout`) | Làm widget thật: iOS WidgetKit (cỡ nhỏ xem trạng thái; cỡ vừa có nút chấm công qua App Intent, iOS 17+) + Android App Widget; cần target native riêng (config plugin / `expo-apple-targets` hoặc tương đương), chia sẻ phiên đăng nhập qua App Group/Keychain, gọi cùng API chấm công (kiểm GPS/thiết bị như app). Khối lượng lớn — lên kế hoạch riêng; có thể cần tài khoản Apple Developer cho App Group trên máy thật. |

**Mục 3 — đã làm 29/10 (Claude Desktop):** `apps/mobile/src/pin.ts` + luồng trong `store.ts`/`sheets.tsx`. Quyết định kỹ thuật: PIN lưu **trên máy**
(muối 16 byte + SHA-256 trong Keychain/Keystore `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, theo mã nhân viên), không gửi lên máy chủ — API vẫn chỉ tin phiên đăng
nhập, PIN chặn người cầm máy đang mở khóa. Lần đầu vào lương/tạm ứng/tài liệu phải tạo PIN (nhập 2 lần; chặn 6 số giống nhau và dãy liên tiếp); sai 5 lần
liên tiếp thì xóa PIN + đăng xuất; Face ID thành công xóa đếm sai; "Quên mã PIN?" xóa PIN + đăng xuất; Bảo mật và thiết bị → Đổi mã PIN (phải nhập PIN hiện
tại). Bản dữ liệu mẫu/QA giữ hành vi prototype (nhập 6 số bất kỳ). Test Node `tools/pin-mobile-test.mjs` (6 ca). Hạn chế: đổi máy/cài lại app phải tạo PIN
lại; muốn PIN dùng chung nhiều máy hoặc máy chủ chặn API lương khi chưa qua PIN thì cần thêm bước xác thực phía máy chủ (chưa làm).

**Mục 4 — đã làm 29/10:** bấm Face ID trong sheet PIN gọi thẳng `authenticate()` (hộp thoại hệ thống), không chuyển sang sheet `face` tự vẽ;
hủy/không khớp thì vẫn ở bàn phím PIN. Sheet `face` chỉ còn cho trạng thái QA `faceid-scanning`. Người dùng đã thử mục 3 trên iPhone 11 (29/10): ổn.

**Mục 5, 6 — đã làm 29/10 (`a064869`):** `biometricKind()` (src/auth.ts) trả loại + tên theo hệ điều hành (iPhone: Face ID/Touch ID; Android: vân tay,
khuôn mặt nếu không có vân tay); `BioIcon` thay icon Face ID cứng ở bàn phím PIN, nút đăng nhập, Bảo mật; bản QA cũng nạp loại sinh trắc học.
Chi tiết bản tin: dòng người đăng + thời gian luôn căn trái (prototype căn giữa với tin Thông báo). Kiểm: ảnh ghép news-detail/pin (simulator),
Android emulator 3 màn hiện vân tay.

**Mục 1, 2, 7, 8 — đã làm 29/10:**
- 1: splash gốc nền `#F9FBFA` + logo xanh (app.json + sửa trực tiếp `ios/` Images.xcassets/SplashScreen.storyboard và `android/` colors/drawable,
  **không chạy prebuild**); lớp chuyển cảnh `splash.tsx` dùng đúng gradient màn đăng nhập. Ảnh chuỗi khởi động trên simulator: không còn nền xanh đặc.
- 2: `TimeWheel` (src/ui.tsx) — cột giờ + phút vuốt chọn (OT bước 30 phút, giải trình bước 5 phút; phút lẻ hiện tại vẫn hiển thị đúng); form làm thêm
  giờ có dòng "Chấm công ngày này: Vào … · Ra …" lấy từ bảng công (`/me/timesheet`), ngày tương lai "Chưa tới ngày".
- 7: dải mint nối liền ngày đầu → ngày cuối (cả hai lịch mẫu/API), ngày nghỉ/lễ trong dải giữ ô mờ, hiện mờ dần.
- 8: `src/help.ts` hướng dẫn theo màn (không có số nghiệp vụ cứng) + liên hệ phòng Nhân sự; ghi chú QA cũ chỉ hiện ở bản QA.
- Kiểm: ảnh ghép leave-new-range/ot/explain (simulator), hướng dẫn "?" ở màn Làm thêm giờ. Bánh xe vuốt và splash cần xác nhận trên iPhone.

Thứ tự đề xuất: 3 (bảo mật PIN) → 4, 5 (sinh trắc học) → 1, 6 (nhỏ) → 2, 7 (form OT/nghỉ phép) → 8 (nội dung hướng dẫn) → 9 (widget, kế hoạch riêng).
