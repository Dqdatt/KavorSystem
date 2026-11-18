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
| Android | Chưa thử | App Android cài + chạy (màn E15 → đăng nhập được); sẽ thử lại sau khi build bản có sửa store.ts |

## Tóm tắt nhánh A
- **P0 đã sửa (chưa commit, chờ verify-all):**
  1. Web HR: công ty mới không có nút "Thêm địa điểm"/"Tạo ca" khi chưa có thẻ nào → không thiết lập được chấm công (`_ui/kit.tsx` `Empty.action`, `schedules/page.tsx`).
  2. App: dữ liệu người trước trên máy (bảng công/đơn/thông báo…) hiện cho người đăng nhập sau — cache khóa theo mã NV, `signIn` không xóa, đăng ký máy không tải lại (`apps/mobile/src/store.ts`). Hàng đợi chấm offline đã khóa theo `employeeId` từ trước — không bị.
- Sửa kèm (P2, 1 dòng): menu "+" hiện "Phiếu lương · Tháng 09/2026" giả ở bản thật.
- Sau v1 mới: app kẹt E16 sau khi công ty mở lại (phải tắt hẳn app); app đang mở không tự báo tạm khóa; app ở màn E15 gọi `/auth/refresh` lặp; widget hướng dẫn thêm widget không có thật; tạm ứng không cảnh báo thiếu tài khoản ngân hàng; một người duyệt cả 2 bước tạm ứng (cần người dùng quyết); ca mặc định "Người tạo: Người dùng"; ô mã NV gợi ý "HD0301"; web HR kích hoạt chỉ một ô mật khẩu.
- Môi trường: API thử ở cổng 4100 (`.claude/launch.json` `api-4100`, không đọc `.env.local` → quản trị Console đầu tiên `admin@kavor.test`); APK Android tạm thêm `android:usesCleartextTraffic="true"` vào `<application>` (gỡ thuộc tính này sau UAT; thư mục native không theo git).
