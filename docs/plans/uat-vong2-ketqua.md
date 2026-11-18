# UAT vòng 2 — nhánh A (công ty mới ABC-001) — kết quả 18/11/2026
Mức: P0 = sai tiền/công, lộ dữ liệu, mất dữ liệu, crash luồng chính; P1 = sai/khó dùng; P2 = chữ/bố cục.

| Mã | KQ | Ghi chú |
|---|---|---|
| ENV | Ghi chú | API 4100 chạy qua Preview không đọc được `apps/api/.env.local` (sandbox chặn .env) → quản trị viên Console đầu tiên = admin@kavor.test. Không phải lỗi sản phẩm |
| C-01 | Đạt | |
| C-02 | Đạt | "Mã OTP không đúng hoặc đã hết hạn." |
| C-04 | Đạt | "Hai lần nhập mật khẩu không khớp." |
| C-05/06 | Đạt | QR + khóa thủ công; vào Tổng quan, "Quản trị Kavor · Quản trị Console", có Hệ thống → Nhân viên Kavor |
| C-07–C-09, C-11–C-15, C-17–C-21 | Bỏ qua | Có `operators-smoke.sh`/`auth-smoke.sh` trong verify-all; UAT tập trung luồng khách hàng |
| C-10 | Đạt | Toast "Đã gửi thư mời…", lời mời "Chờ kích hoạt", hết hạn 25/11 |
| C-16 | Đạt | Dòng của chính mình không có nút |
| C-30 | Đạt | Toast kèm mã ADMIN01; thư mời đúng mã + link localhost:3000 |
| C-35 | Đạt | 2 mục "Cần đối chiếu" (khấu trừ 10%, miễn thuế OT) hiển thị rõ |
| H-01/H-03 | Đạt | Vào Tổng quan Công ty ABC; banner "chỉ 1 quản trị viên" |
| H-02 | Đạt | "Mã nhân viên và email công ty không khớp…" |
| H-10 | Đạt | 7/16 bước, mỗi bước nêu thiếu gì |
| H-15b | Đạt | 80% bị chặn "Lương thử việc từ 85% đến 100%…" |
| H-19 | **Lỗi P0 → đã sửa** | Công ty mới chưa có địa điểm: khung trống KHÔNG có nút "Thêm địa điểm" (nút chỉ nằm trên thẻ địa điểm đầu tiên) → không tạo được địa điểm → không ai chấm công được. Mẫu ca cùng lỗi. Sửa: `Empty` nhận `action`, `schedules/page.tsx` đặt nút ở khung trống |
| H-20 | Đạt | Ca hành chính có sẵn áp dụng toàn công ty; địa điểm áp dụng toàn công ty được |
| H-20 (P2) | Ghi Sau v1 | Ca mặc định cột "Người tạo" = "Người dùng" (nên là "Kavor"/"Hệ thống") |
| H-11 | Bỏ qua | Tải logo/ảnh bìa cần chọn file từ máy — trình duyệt trong app không chọn file được |
| ENV | Ghi chú | Web HR kích hoạt chỉ một ô mật khẩu, Console có ô nhập lại (không thống nhất — P2) |
| H-16 | Đạt | Thêm phòng Kinh doanh (KD) — hiện trong sơ đồ + danh sách chọn phòng |
| H-30 | Đạt | NV001 tạo được, toast "Đã tạo hồ sơ và gửi lời mời kích hoạt" |
| H-30 (P2) | Ghi Sau v1 | Ô mã NV gợi ý "HD0301" (tiền tố Hải Đăng) ở công ty khác |
| H-36 | Đạt | Gán Kế toán cho ADMIN01, cảnh báo quyền nhạy cảm |
| H-41 | Đạt | Nhập lương 12.000.000 ₫ hiệu lực 18/11 |
| H-31–H-35, H-37–H-40 | Bỏ qua | Thời gian; phạm vi phòng/giới hạn gói có pgTAP + hr-smoke |
| M-01 | Đạt (sau sửa) | Kích hoạt NV001 trên Simulator: ô trống, OTP, đăng ký máy, trang chủ "CÔNG TY ABC", vị trí "Văn phòng ABC Quận 1" |
| M-01 | **Lỗi P0 (lộ dữ liệu) → đã sửa** | Trang chủ NV001 (vào làm hôm nay, 0 lượt chấm) hiện "Hạn giải trình công: Ngày 13/11 muộn 21 phút · 3/3 lượt" = bảng công của người trước trên máy. Nguyên nhân: (1) cache trên máy khóa theo MÃ NV (trùng giữa công ty: NV001…); (2) `signIn` không xóa bảng công/đơn/thông báo/phép/OT/bản tin của người trước; (3) đăng ký máy / HR duyệt máy xong chỉ tải "hôm nay" → dữ liệu người trước nằm lại. Sửa `store.ts`: khóa cache theo `employeeId`, `signIn` reset trường CACHED khi đổi người, `registerDevice`/`checkPending` gọi `refreshWork()` |
| ENV | Ghi chú | App Android (màn E15) gọi `/auth/refresh` 401 lặp lại định kỳ khi đang ở màn phiên hết hạn — xem lại (P2) |
| H-56 | Đạt | Kỳ 26/10–25/11 chưa kết thúc → "Vẫn khóa kỳ" bị khóa, nêu rõ ngày |
| H-70 (một phần) | Đạt | Bài "Thông báo thử UAT vòng 2" (toàn công ty, thông báo trong app) hiện ở "Bản tin mới" trên app. Chưa thử PDF (trình duyệt trong app không chọn file) |
| M-04 | Đạt | "Đã vào ca lúc 11:31 · Muộn 3 giờ 31 phút", 0 m, web/DB có lượt vào |
| M-05 | Đạt | API tắt → "Đã ra ca 11:32 · Lưu trên máy · chờ gửi"; hộp ra ca sớm hỏi trước |
| M-05b | Đạt | Đăng xuất báo "Còn 1 lần chấm công chưa gửi…"; ADMIN01 đăng nhập cùng máy: trang chủ của ADMIN01 (không lẫn NV001), lần chấm NV001 KHÔNG bị gửi hộ; NV001 đăng nhập lại → gửi đúng giờ 11:32:35 (nhận 11:35:09) |
| P1 | Ghi Sau v1 | "Widget chấm công" hướng dẫn "Tìm Kavor, chọn cỡ vừa" + hộp đăng xuất "Widget sẽ ngừng hoạt động" — widget thật chưa có, người dùng sẽ tìm không thấy |
| Web (dev) | Ghi chú | Trang tải lần đầu ~30 s khi máy tải cao (Next dev biên dịch) — không phải lỗi |
| M-06 | Đạt | Đơn nghỉ phép năm 20/11 → NP-0001, giữ chỗ 1 ngày, "Còn 0 ngày" |
| M-08 | Ghi chú | Muộn hôm nay chưa giải trình được ("Không còn ngày nào cần giải trình") — chờ hết ngày, đúng thiết kế |
| M-09 | Đạt | Tạo PIN 6 số; hạn mức 3.600.000 = 30% × 12 tr; TU-0001 1.000.000 ₫, 5 bước |
| M-09 (P1) | Ghi Sau v1 | Tạm ứng "Nhận vào: Tài khoản nhận lương" nhưng NV chưa có số tài khoản — không chặn/không cảnh báo, Kế toán không biết chuyển vào đâu |
| Menu "+" (P2) | **Đã sửa** | "Phiếu lương · Tháng 09/2026" là chữ mẫu ghi cứng hiện cả bản thật → "Xem phiếu đã công bố" (`store.ts quickItems`) |
| PIN (môi trường) | Ghi chú | Bấm nhanh liên tiếp trên Simulator khi máy tải cao mất phím — không phải lỗi app |
| H-50 | Đạt | Duyệt NP-0001 trên web, toast "Đã duyệt NP-0001" |
| H-54 | Đạt | TU-0001: Quản lý duyệt → bước HR tự bỏ qua (≤ 5 tr) → Kế toán duyệt → "Xác nhận đã chi" → "Đã chi 18/11 11:40" |
| H-54 (cần quyết) | Ghi Sau v1 | Cùng một người (quản lý trực tiếp kiêm Kế toán) duyệt cả 2 bước tạm ứng — chưa có quy tắc "2 bước phải khác người" như kỳ lương. Công ty nhỏ hay gặp; người dùng quyết có chặn không |
| H-54 (P1) | Ghi Sau v1 | Hộp "Xác nhận đã chi" không hiện/không cảnh báo thiếu tài khoản ngân hàng của NV |
| H-50/H-54 app | Đạt | App nhận đủ thông báo: bản tin, NP-0001 duyệt "đã trừ vào sổ phép", TU-0001 duyệt, TU-0001 đã chi |
| C-41 | Đạt | Tạm khóa ABC-001 có lý do → web HR "Công ty đang tạm ngừng sử dụng Kavor"; app (mở lại từ nền) màn E16 |
| C-41 (P2) | Ghi Sau v1 | App đang mở không tự chuyển E16 (403 ở thông báo bị bỏ qua) — chỉ khi vào lại từ nền |
| C-42 | Đạt (web) / **P1** app | Mở lại → web dùng lại được; app kẹt E16 dù vào lại từ nền, phải tắt hẳn app (hoặc đăng xuất) mới dùng lại → cả công ty phải tự tắt app sau khi mở lại. Ghi Sau v1 (không mất dữ liệu) |
| S-01 | Đạt | Web ABC: danh sách NV/bảng công chỉ có 2 người ABC, không thấy Hải Đăng |
| H-58, H-5A, H-5B, H-71–H-74, C-43–C-51, S-02–S-04, M-02/M-07/M-10–M-16 | Bỏ qua | Có smoke/pgTAP tương ứng (timesheet/pause/offboard/announcements/documents/support/purge/auth); hoặc cần thiết bị thật (Face ID) / chọn file |
| Android | Một phần | Build Release mới (có sửa `store.ts`/`money.tsx`/`home.tsx`, kiểm chuỗi trong bundle) cài lên `Kavor_Pixel_6`, mở được: E15 → đăng nhập HD0215 → màn đồng ý điều khoản dữ liệu. Emulator tự tắt rồi bật lại bị treo ("QEMU2 main loop" không phản hồi, máy tải 17) → dừng. Logic sửa là JS dùng chung, đã kiểm trên iOS. Cần thử lại Android khi máy rảnh |

## Tóm tắt nhánh A
- **P0 đã sửa (chưa commit, chờ verify-all):**
  1. Web HR: công ty mới không có nút "Thêm địa điểm"/"Tạo ca" khi chưa có thẻ nào → không thiết lập được chấm công (`_ui/kit.tsx` `Empty.action`, `schedules/page.tsx`).
  2. App: dữ liệu người trước trên máy (bảng công/đơn/thông báo…) hiện cho người đăng nhập sau — cache khóa theo mã NV, `signIn` không xóa, đăng ký máy không tải lại (`apps/mobile/src/store.ts`). Hàng đợi chấm offline đã khóa theo `employeeId` từ trước — không bị.
- Sửa kèm (P2, 1 dòng): menu "+" hiện "Phiếu lương · Tháng 09/2026" giả ở bản thật.
- Sau v1 mới: app kẹt E16 sau khi công ty mở lại (phải tắt hẳn app); app đang mở không tự báo tạm khóa; app ở màn E15 gọi `/auth/refresh` lặp; widget hướng dẫn thêm widget không có thật; tạm ứng không cảnh báo thiếu tài khoản ngân hàng; một người duyệt cả 2 bước tạm ứng (cần người dùng quyết); ca mặc định "Người tạo: Người dùng"; ô mã NV gợi ý "HD0301"; web HR kích hoạt chỉ một ô mật khẩu.
- Môi trường: API thử ở cổng 4100 (`.claude/launch.json` `api-4100`, không đọc `.env.local` → quản trị Console đầu tiên `admin@kavor.test`); APK Android tạm thêm `android:usesCleartextTraffic="true"` vào `<application>` (gỡ thuộc tính này sau UAT; thư mục native không theo git).

# UAT vòng 2 — nhánh B (lương Hải Đăng, kỳ 2026-10 = 26/09–25/10) — 18/11/2026
Môi trường: API 4100, web HR 3000 (trỏ 4100). SC0001…SC0030 lương 10.900.000 ₫, 20/20 công.

| Mã | KQ | Ghi chú |
|---|---|---|
| H-60 | Đạt | Kỳ 10/2026 chưa khóa: nút "Chốt bảng" bị khóa (gợi ý "Khóa kỳ công trước khi chốt") + dải báo; gọi thẳng API cũng bị chặn 409 "Khóa kỳ công 2026-10 ở Bảng công trước khi chốt…" |
| H-61 | Đạt | Bảng công tháng 10/2026: 600 ngày công; 30 người SC đều 20/20 (có SC0030 cuối danh sách); 9 người Hải Đăng 0/20 (dữ liệu mẫu không chấm kỳ này) → hộp khóa kỳ nêu "Còn 180 ngày của 9 nhân viên", "Vẫn khóa kỳ" kèm ghi chú → toast "Kỳ công đã khóa", nút đổi thành "Mở lại kỳ công" |
| H-62 | Đạt | Kỳ 10/2026: Nhân viên 39 · Cần rà soát 39 (SC: "Chưa có tài khoản ngân hàng") · **Chưa nhập lương 5** (HD0215, HD0216, HDG0001, HDG0002, HDG0004). Hộp chốt báo "Còn 39 dòng cần rà soát… Vẫn chốt được" → "Đã chốt", "chốt lần 1 … bởi Mai Phương Thảo — <ghi chú>". Xuất CSV `bang-luong-dau-vao-2026-10.csv`: 39 dòng + tiêu đề; ghi chú không nằm trong file nên chống công thức dựa vào unit test `csv.test.ts` (inputs export dùng `csvCell`) |
| H-62 (P2) | Ghi Sau v1 | Rời trang Lương rồi quay lại, ô kỳ tự về tháng hiện tại (11/2026) — phải chọn lại kỳ đang làm |
| H-63 (quyền) | Đạt | HD0007 (Quản trị, không Kế toán): không có tab Kỳ lương; gọi thẳng API xem/mở/tính kỳ lương → 403 |
| H-63 | Đạt | (HD0215) Mở kỳ lương 10/2026 (ngày trả dự kiến tự điền 05/11) → Kavor tính lương: "Chốt 18/11 12:01 · 34 người · bỏ qua 5" (5 người chưa có mức lương, nêu tên); tổng thu nhập 327.000.000 / khấu trừ 34.335.000 / thực nhận 292.665.000 / chi phí công ty 403.845.000; có khối "Luật cần đối chiếu" (2 mục). Dòng SC0001 có công thức từng khoản; người 0 công nêu "Không hưởng lương 20 ngày (từ 14 ngày làm việc) — tháng này không đóng BH" |
| H-64 | Đạt | "Ghi vào kỳ lương (34 người)" → "Kỳ 10/2026 · Đã nhập", 34/34 dòng hợp lệ, 0 lỗi, 42 cảnh báo đối chiếu; API: 34 dòng, tổng thực nhận 292.665.000 = xem trước |
| H-65 | Đạt | Tay SC0001: 10.900.000 × 20/20; BHXH 8% 872.000 + BHYT 1,5% 163.500 + BHTN 1% 109.000 = 1.144.500; TN tính thuế < 0 sau giảm trừ 15,5 tr → thuế 0; thực nhận 9.755.500 ✔. Tổng: 30 × 1.144.500 = 34.335.000 ✔; chi phí công ty 327 tr × 123,5% (BHXH 17,5 + BHYT 3 + BHTN 1 + KPCĐ 2) = 403.845.000 ✔. Kỳ này không ai chịu thuế → đối chiếu thuế bằng **Tính thử lương** 30 tr: 1 NPT → TNTT 5.150.000 (giảm trừ 21,7 tr) thuế 257.500, thực nhận 26.592.500 ✔; 0 NPT → TNTT 11.350.000, thuế 10 tr×5% + 1,35 tr×10% = 635.000, thực nhận 26.215.000 ✔ |
| H-65 (P2) | Ghi Sau v1 | Chi tiết dòng trong kỳ lương không hiện dòng "Thuế TNCN 0 ₫" kèm giảm trừ khi thuế = 0 (Tính thử có) — Kế toán không thấy vì sao thuế 0 |
| H-63 (P2) | Ghi Sau v1 | Kỳ lương trống ghi "…rồi nhập file kết quả CSV" (đã có Kavor tính); khối lỗi ghi lẫn "Phải về 0 trước khi duyệt payroll cảnh báo đối chiếu không chặn" (chữ dính + "payroll" tiếng Anh); mọi cảnh báo nhóm "Khác"; đầu trang HD0215 hiện vai trò "Nhân viên" thay vì "Kế toán" |
| ENV | Ghi chú | Nút "Đăng xuất" web dùng `confirm()` của trình duyệt — trình duyệt trong app tự đóng hộp này nên bấm không có tác dụng; đổi tài khoản qua `/login?switch=1`. Không phải lỗi sản phẩm |
| H-66 | Đạt | HD0215 "Gửi kiểm tra" (hộp tóm tắt: 34 phiếu, 292.665.000 ₫, 42 cảnh báo) → "Đang kiểm tra · Chờ Kế toán khác duyệt"; HD0215 không có nút Duyệt; gọi thẳng API duyệt → 403 "Người nhập kết quả lần cuối không được tự duyệt kỳ lương." |
| H-67 | Ghi lại | Sau khi HD0216 duyệt, không ai có "Mở lại" (HD0216 gọi API mở lại → 403; HD0007 không xem được kỳ lương). Đúng mô tả: quyền mở lại không nằm trong vai trò mặc định — muốn sửa sau duyệt phải cấp quyền riêng. Không thử nhánh cấp quyền |
| H-68 | Đạt | (HD0216) "Duyệt kỳ lương" → "Đã duyệt" (Tổng thực lĩnh "Đã khóa sau duyệt") → "Công bố phiếu lương" (hộp nêu "Không hoàn tác được") → "Đã công bố", bước 4 "Dự kiến trả 05/11/2026"; gọi tính lại → 409 "Kỳ lương đã duyệt, không tính lại được." |
| H-68 (P2) | Ghi Sau v1 | Ngày trả lương dự kiến tự điền 05/11 (đã qua 13 ngày) — hộp Gửi kiểm tra/Duyệt/Công bố không cảnh báo ngày trả đã qua. 4 người 0 công (lương 0 ₫) vẫn nhận phiếu 0 ₫ |
| H-68 (P2) | Ghi Sau v1 | Tổng quan của Kế toán thứ hai (HD0216) không nhắc "Kỳ lương 10/2026 chờ bạn duyệt" trong "Việc cần xử lý" |
| H-69 | Đạt | iOS Simulator: đăng xuất NV001 (ABC) → kích hoạt SC0001 (OTP Mailpit) → đăng ký máy → trang chủ "HẢI ĐĂNG GROUP", **không còn dữ liệu NV001** (xác nhận bản sửa P0 đổi người khác công ty; thẻ "Ngày 13/11 không chấm công" đúng của SC0001 — DB không có lượt chấm từ 10/11); hạn mức tạm ứng 3.270.000 = 30% × 10,9 tr. Phiếu lương: tạo PIN → "Thực lĩnh tháng 10/2026 9.755.500 đ · Công bố 18-11 · dự kiến trả 05/11"; chi tiết 10.900.000 − 872.000 − 163.500 − 109.000 = 9.755.500 khớp web H-64 |
| H-69 | **Lỗi (luật) → đã sửa** | Phiếu lương trên app chỉ hiện công thức ("10.900.000 đ × 8%") thay cho tên khoản — không ghi BHXH/BHYT/BHTN, thu nhập không ghi "Lương cơ bản" (BLLĐ Điều 95: phiếu phải ghi rõ nội dung khoản khấu trừ). Nguyên nhân `money.tsx` `k={i.label ?? i.name}` (label của Kavor tính là công thức). Sửa: tên khoản làm nhãn, công thức làm dòng phụ. **Kiểm lại trên Simulator bản build mới:** "Lương cơ bản / BHXH / BHYT / BHTN" + công thức dòng dưới, trang chủ "Phiếu lương · Xem phiếu", phiếu "đã trả 18-11" sau H-69b |
| H-69 | **Lỗi P2 → đã sửa** | Trang chủ app "Của bạn": "Phiếu lương 09/2026 · Đã công bố" là chữ mẫu ghi cứng hiện cả bản thật (`home.tsx`) → bản thật "Phiếu lương · Xem phiếu" |
| H-69 (P2) | Ghi Sau v1 | Ngày "Công bố 18-11" (gạch) lệch kiểu "05/11" (gạch chéo) cùng dòng; màn Widget hiện ngày/khoảng cách mẫu "Thứ Sáu, 16/10 · Cách văn phòng 126 m" ở bản thật (cùng mục widget Sau v1) |
| PIN (môi trường) | Ghi chú | Máy tải 9–12 (Android emulator + Simulator + dev server): bàn phím PIN mất phím khi bấm liên tục, phải cách ~2 giây/phím — như vòng trước, không phải lỗi app |
| H-69b | Đạt | (HD0216) "Đánh dấu đã trả lương" (hộp: "Không hoàn tác được") → "Đã trả lương" → "Đóng kỳ lương" ("nhân viên vẫn xem được phiếu") → "Kỳ 10/2026 · Đã đóng", 100% |
| H-69c | Bỏ qua | Nhập kết quả CSV cần chọn file — trình duyệt trong app không chọn file được; có `payroll-smoke.sh` |

## Tóm tắt nhánh B
- Luồng lương trọn vòng đạt: chặn chốt khi chưa khóa kỳ (UI + API) → khóa kỳ công → chốt bảng → Kế toán 1 mở kỳ, Kavor tính, ghi kỳ → chặn tự duyệt (API 403) → Kế toán 2 duyệt → công bố (chặn tính lại 409) → phiếu trên app → đã trả → đóng.
- Số tiền khớp tay đến từng đồng: SC0001 thực nhận 9.755.500; tổng 34 người 292.665.000; chi phí công ty 403.845.000; thuế TNCN kiểm qua Tính thử (bậc 5% và 10%, giảm trừ 15,5 tr + 6,2 tr/NPT).
- Sửa (chưa commit, cần build lại app): phiếu lương app thiếu tên khoản (dính BLLĐ Điều 95) — `money.tsx`; nhãn "Phiếu lương 09/2026" ghi cứng ở trang chủ — `home.tsx`. Typecheck + test mobile đạt.
- Sau v1 mới: ô kỳ lương tự về tháng hiện tại; chi tiết dòng kỳ lương không hiện "Thuế TNCN 0" + giảm trừ; chữ khối lỗi kỳ lương ("…duyệt payroll cảnh báo…"), cảnh báo đều nhóm "Khác", HD0215 hiện vai trò "Nhân viên"; kỳ lương trống còn ghi "nhập file CSV"; ngày trả dự kiến đã qua không cảnh báo, người 0 công vẫn nhận phiếu 0 ₫; Tổng quan Kế toán 2 không nhắc kỳ chờ duyệt; app "18-11" lệch kiểu ngày; web Kế toán chi tiết dòng kỳ lương (`cycles.tsx`) cũng hiện công thức thay tên khoản (có kèm mã khoản, chỉ nội bộ); quyền mở lại kỳ lương không có trong vai trò mặc định (đúng thiết kế, cần hướng dẫn).
