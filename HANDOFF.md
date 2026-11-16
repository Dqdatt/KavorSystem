# HANDOFF — 16/11/2026 (phiên 10)

**Mục tiêu phiên vừa rồi:** sửa lương người vào làm/nghỉ việc giữa kỳ (ngày ngoài hợp đồng bị bỏ khỏi công chuẩn → vẫn nhận đủ lương tháng).

## Đã xong
- `2b7babf` (**chưa push**, verify-all đầy đủ đạt): công chuẩn cả kỳ (cách a).
  - `timesheet/compute.ts`: `not_employed` giữ `workday`/`paidHoliday` theo ca, 0 công, `leave: null`. `timesheet.service.ts`: ngày ngoài hợp đồng lấy ca của ngày vào/ngày cuối.
  - `employedStandard` (contracts, `payroll/inputs.service.ts`) + cảnh báo "Vào/nghỉ giữa kỳ"; `payroll/cycle-calc.ts` nhân khoản cố định theo tỷ lệ, chuyên cần ghi lý do.
  - Test `compute.test.ts`, `cycle-calc.test.ts`; bước smoke trong `tools/payroll-inputs-smoke.sh`; AGENTS.md, TASKS.md đã cập nhật.
- API local đã khởi động lại bằng `tools/dev-backend.sh` (chạy code mới); DB local vừa reset về dữ liệu mẫu.

## Đang dở
- Chưa push `2b7babf`, `e182bd8`, `f589ec2` và commit mobile (push nhánh = deploy Render/Vercel; app mobile phải build lại iPhone).
- Kỳ công đã khóa trước bản sửa vẫn giữ công chuẩn cũ (snapshot). Kỳ có người vào/nghỉ giữa kỳ phải mở khóa → khóa lại → chốt lại bảng lương. Chưa kiểm online; mở/khóa/chốt trên online là ghi, phải hỏi.
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
1. Push các commit trên, rồi xem online (chỉ đọc): kỳ đã khóa nào có người vào/nghỉ giữa kỳ; TSNV002 04/11 thành 0 công nếu kỳ chưa khóa (báo HR). Hỏi người dùng trước khi khóa/chốt lại. Build lại app iPhone — `[opus high]`
2. ~~Giờ vào > giờ ra vẫn 1 công~~ — đã sửa theo cách 2 (16/11, đã commit, **chưa push**, verify-all đầy đủ đạt): `compute.ts` (`pair`/`inverted`), test `compute.test.ts`, bước smoke "Giờ ra ≤ giờ vào" trong `timesheet-smoke.sh`, AGENTS.md, TASKS.md. Còn: push khi người dùng bảo (push = deploy); sau deploy TSNV002 04/11 thành 0 công nếu kỳ chưa khóa — `[opus high]`
3. ~~Trang chủ mobile ngày nghỉ~~ — đã sửa (16/11, đã commit, chưa push): `apps/mobile/src/store.ts` `sh.off` theo `workDays` → dòng ca "Hôm nay nghỉ · <ca>, T2–T6", vẫn cho chấm ("Đã ghi nhận"), ra ca không hỏi về sớm. Đã kiểm simulator bản local, verify-all --quick đạt.

## Mẹo
- API local không tự nạp code: sửa API xong chạy lại `bash tools/dev-backend.sh` trước smoke. verify-all đầy đủ mất ~15 phút, reset DB nhiều lần.
- Build simulator: trong `apps/mobile`, `LANG=en_US.UTF-8 EXPO_PUBLIC_API_URL=<url> xcodebuild -workspace ios/Kavor.xcworkspace -scheme Kavor -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build-sim[-local] build` (online: `https://kavor-api.onrender.com/api/v1`; local: `http://localhost:4000/api/v1`). Bản Release nuốt lỗi chữ ngoài `<Text>`.

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (mục Tạm nghỉ, bảng công)
- `apps/api/src/timesheet/compute.ts` (`computeDay`)
- `apps/api/src/payroll/cycle-calc.ts`
