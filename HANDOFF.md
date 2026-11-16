# HANDOFF — 16/11/2026 (phiên 10)

**Mục tiêu phiên vừa rồi:** sửa lương người vào làm/nghỉ việc giữa kỳ (ngày ngoài hợp đồng bị bỏ khỏi công chuẩn → vẫn nhận đủ lương tháng).

## Đã xong
- `2b7babf` (đã push, verify-all đầy đủ đạt): công chuẩn cả kỳ (cách a).
  - `timesheet/compute.ts`: `not_employed` giữ `workday`/`paidHoliday` theo ca, 0 công, `leave: null`. `timesheet.service.ts`: ngày ngoài hợp đồng lấy ca của ngày vào/ngày cuối.
  - `employedStandard` (contracts, `payroll/inputs.service.ts`) + cảnh báo "Vào/nghỉ giữa kỳ"; `payroll/cycle-calc.ts` nhân khoản cố định theo tỷ lệ, chuyên cần ghi lý do.
  - Test `compute.test.ts`, `cycle-calc.test.ts`; bước smoke trong `tools/payroll-inputs-smoke.sh`; AGENTS.md, TASKS.md đã cập nhật.
- API local đã khởi động lại bằng `tools/dev-backend.sh` (chạy code mới); DB local vừa reset về dữ liệu mẫu.

## Đang dở
- Đã push 16/11 tới `79014e6` (gồm `2b7babf`, `f589ec2`, bản mobile): GitHub CI + 2 bản Vercel đạt. App iPhone chưa build lại.
- Kiểm online 16/11 (chỉ GET qua web HR kavor-system.vercel.app, tài khoản quản trị đã đăng nhập sẵn):
  - Render đã chạy code mới: bảng lương đầu vào trả `employedStandard` + cảnh báo "Vào/nghỉ giữa kỳ" (`2b7babf`); TSNV002 04/11 ra "Thiếu ra", 0 công (`f589ec2`).
  - Không có kỳ công nào đang khóa (quét 2019-10 → 2026-11); bảng lương đầu vào 08–11/2026 chưa chốt lần nào → không có kỳ nào phải mở khóa/khóa lại/chốt lại. Kỳ lương (cycles): tài khoản quản trị bị 403 (thiếu `payroll.read`), không xem được; tính lương từ hệ thống cần bảng đầu vào đã chốt nên không kỳ nào bị luật mới làm sai.
  - Vào/nghỉ giữa kỳ đang mở: 10/2026 TSNV001, TSNV002 (vào 30/10, công chuẩn 1/22, chưa có mức lương tháng 10 → không ra tiền). 11/2026: 2439 (nghỉ 07/11, 5/21), 2496 (vào 03/11, 20/21), HD007 (vào 10/11, thử việc, 15/21), NV0006 (nghỉ 10/11, 7/21). Luật cũ: làm đủ = đủ lương tháng; luật mới vd 2496 15tr × 20/21 = 14.285.714, 2439 17tr × 5/21 = 4.047.619, NV0006 7tr × 7/21 = 2.333.333, HD007 7,5tr × tỷ lệ thử việc (mặc định 85%, chưa xem cài đặt online) × 15/21. Kỳ 11 khóa cuối tháng sẽ tự theo luật mới.
  - TSNV002 04/11 (kỳ 11 chưa khóa): vào 20:30 (giải trình GT-0003 đã duyệt, chấm gốc 08:23) / ra 19:51 → 0 công (trước 1 công + 750 phút trễ ảo). Lương theo công giảm 5.315.000/21 ≈ 253.095 đ (gross). OT-0002 duyệt 180 phút nhưng tính 0 phút (giờ vào 20:30) — không đổi so với trước. Hạn giải trình hết 09/11; theo cách 2 không có công cụ HR sửa tay → báo HR.
- Web: lịch mini hồ sơ nhân viên giờ tô ngày trước khi vào làm kiểu "chưa tới" (giống lưới bảng công) thay vì kiểu cuối tuần. Chưa xem trên trình duyệt.
- Từ phiên 9: chưa rõ Render đã deploy `8113500`; simulator đang cài bản local, Keychain đã xoá (test online lại phải build bản online, người dùng tự gõ mật khẩu TSNV002, đăng ký lại thiết bị — hỏi trước); lỗi 403 Tổng quan web online chưa rõ nguồn.
- `docs/plans/roadmap-competitive.md` chưa track. Người dùng chưa quyết thì không commit.

## Quyết định đã chốt
- Dữ liệu online là thật: chỉ xem. Chấm công, gửi đơn, đăng ký thiết bị, "Gửi lời mời" đều phải hỏi. Mật khẩu online do người dùng tự gõ. Kiểm bản sửa giao diện trên bản local.
- Tạm nghỉ: ngày tạm nghỉ vẫn tính vào công chuẩn. Phép năm trừ theo lý do (NĐ 145/2020). Đơn nghỉ đã duyệt trùng khoảng thì chặn, không tự hủy.
- Vào/nghỉ giữa kỳ (cách a): công chuẩn cả kỳ theo lịch ca; ngày ngoài hợp đồng tính vào công chuẩn, 0 công. Vd 10tr, công chuẩn 26, vào ngày 13 làm đủ 15 công → 10tr × 15/26. Phụ cấp cố định × công chuẩn trong hợp đồng ÷ công chuẩn kỳ (vắng/nghỉ phép không trừ). Chuyên cần tháng vào/nghỉ không đạt. Giảm trừ gia cảnh, hạn mức tạm ứng không đổi. BH theo quy tắc 14 ngày sẵn có. Bảng đã chốt giữ số cũ.
- Giờ ra ≤ giờ vào (16/11/2026, cách 2 — đổi luật, không làm công cụ HR sửa tay): ngày làm việc đã qua coi là "Thiếu ra", 0 công (nghỉ nửa ngày có lương giữ 0,5), không tính muộn/sớm, không giờ làm. Còn hạn + lượt thì giải trình được; ngày đã có giải trình duyệt ra giờ ngược (TSNV002 04/11, GT-0003) giữ 0 công. OT không đổi. Kỳ đã khóa giữ snapshot cũ.

## Nợ Ponytail
- Phiên này không có `shortcut:` mới. Nợ cũ ở `apps/api/src/timesheet/pause.ts`: quy tắc 50% đếm theo ngày lịch, nghỉ ốm không cộng đơn nghỉ ốm lẻ.

## Việc tiếp theo
1. ~~Kiểm online sau deploy~~ — xong 16/11: không kỳ nào cần mở/khóa/chốt lại. Còn: build lại app iPhone.
   - TSNV002 04/11: đã sửa 16/11 theo cách 1 — thêm dòng `attendance_adjustments` không gắn đơn, giờ vào 08:23 (máy chấm công; GT-0003 là lỗi thiết bị, đề nghị nhầm 20:30) qua `supabase db query --linked`. Web online: 08:23→19:51, 1 công, muộn 23 phút. Còn: build lại app iPhone — `[opus high]`
2. ~~Giờ vào > giờ ra vẫn 1 công~~ — đã sửa theo cách 2 (16/11, đã push, verify-all đầy đủ đạt): `compute.ts` (`pair`/`inverted`), test `compute.test.ts`, bước smoke "Giờ ra ≤ giờ vào" trong `timesheet-smoke.sh`, AGENTS.md, TASKS.md. Sau deploy TSNV002 04/11 thành 0 công nếu kỳ chưa khóa (việc 1 kiểm) — `[opus high]`
3. ~~Trang chủ mobile ngày nghỉ~~ — đã sửa (16/11, đã push; iPhone cần build lại): `apps/mobile/src/store.ts` `sh.off` theo `workDays` → dòng ca "Hôm nay nghỉ · <ca>, T2–T6", vẫn cho chấm ("Đã ghi nhận"), ra ca không hỏi về sớm. Đã kiểm simulator bản local, verify-all --quick đạt.

## Mẹo
- SQL trên DB online: `supabase db query --linked "..."` (project `scrsvjxjxwmrvlomwrjq`, đã liên kết lại 16/11). Lệnh ghi phải hỏi người dùng.
- API local không tự nạp code: sửa API xong chạy lại `bash tools/dev-backend.sh` trước smoke. verify-all đầy đủ mất ~15 phút, reset DB nhiều lần.
- Build simulator: trong `apps/mobile`, `LANG=en_US.UTF-8 EXPO_PUBLIC_API_URL=<url> xcodebuild -workspace ios/Kavor.xcworkspace -scheme Kavor -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build-sim[-local] build` (online: `https://kavor-api.onrender.com/api/v1`; local: `http://localhost:4000/api/v1`). Bản Release nuốt lỗi chữ ngoài `<Text>`.

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (mục Tạm nghỉ, bảng công)
- `apps/api/src/timesheet/compute.ts` (`computeDay`)
- `apps/api/src/payroll/cycle-calc.ts`
