# HANDOFF — 15/11/2026 (phiên 8)

**Mục tiêu phiên vừa rồi:** màn "Tạm nghỉ" (việc nhạy cảm số 1 trong TASKS), deploy online, cài iPhone.

## Đã xong
- `8509125` đã push và deploy: Render, Vercel, migration online (reminders, offboarding, employee_pause). Bảng `employee_pauses`, `pause_employee`, `end_employee_pause`, `apply_due_pauses` (vòng quét 10 phút), trigger cắt khi ghi ngày cuối.
- API `POST admin/employees/:id/pause` + `/pause/end`. Bảng công: ngày `paused` vẫn trong công chuẩn, 0 công. Phép năm trừ theo lý do (`timesheet/pause.ts`, NĐ 145/2020). Chặn chấm công (`ATT_PAUSED`) và đơn nghỉ trùng ngày tạm nghỉ.
- Web: hộp Chuyển sang tạm nghỉ / Kết thúc tạm nghỉ. Mobile: ngày tạm nghỉ hiện như ngày nghỉ.
- Kiểm thử local: verify-all đầy đủ đạt (pgTAP 638, 33 smoke, build, lint). Online chỉ xem: hộp Tạm nghỉ đúng prototype, bảng công/chấm công/số dư phép không lỗi.
- iPhone "Dqdatt": đã cài Release trỏ API online, người dùng chưa mở thử.
- Simulator iPhone 17e (1113F02A-…): đã boot. App Release trỏ API online build ở `apps/mobile/ios/build-sim`.

## Test simulator online TSNV002 (phiên 9, chưa commit)
Đã đi hết các màn: trang chủ, Bảng công + chi tiết ngày, Nghỉ phép, Đơn từ + GT-0003, Thông báo, Hồ sơ, Bảo mật, Bản tin. Không crash, không lỗi API.
Đã sửa (verify-all --quick đạt; `timesheet-smoke` đạt trên API code mới cổng 4100):
- `ui.tsx` `Btn`/`Note`: chữ ghép (`Xem đơn {req.no}`, ghi chú ở Nghỉ phép, form xin nghỉ, thẻ quyền vị trí) không được bọc `<Text>` nên bản Release hiện nút/hộp **trống chữ**. Giờ bọc mọi children không phải phần tử JSX.
- `ui.tsx` `Ln`: giá trị dài ép nhãn co thành từng chữ ("Kết qu/ả/cô/ng"). Giá trị giờ tối đa 65% và xuống dòng.
- API `createExplanation`: chỉ đề nghị giờ vào thì phải trước giờ ra đã chấm (và ngược lại). GT-0003 online đề nghị vào 20:30 / ra 19:51 vẫn được duyệt, ngày 04/11 tính **1 công**, giờ làm 0. Smoke có thêm 1 bước.
Đã kiểm lại trên simulator bằng bản **local** (build `ios/build-sim-local`, API code mới cổng 4100, HD0142): nút "Xem đơn GT-0001" có chữ, "Kết quả công" xuống dòng đúng, hộp ⓘ Nghỉ phép có chữ.
Simulator hiện cài bản local và đã xoá Keychain (`simctl keychain reset`). Muốn test online lại: build/launch bản online, người dùng tự gõ mật khẩu TSNV002, rồi **đăng ký lại thiết bị** (mã cài đặt mới, là ghi lên online, hỏi trước). API local cổng 4000 vẫn chạy code cũ: khởi động lại `dev-backend`.
Còn mở (chưa sửa, cần người dùng quyết):
- Trang chủ Chủ Nhật (ngày nghỉ theo `workDays`) vẫn hiện "Ca hành chính 08:00–17:00 · VÀO CA". Prototype không vẽ ngày nghỉ. Mobile bỏ qua `shift.workDays`.
- Dữ liệu cũ: `computeDay` cho 1 công khi có đủ vào/ra kể cả vào > ra (04/11 của TSNV002). Đổi luật là việc lương.
- Thông báo HS-0001: "Sửa hồ sơ Sửa email cá nhân…" lặp chữ.

## Đang dở — việc của phiên mới
1. Commit 3 bản sửa khi người dùng bảo (đã kiểm xong). Push = deploy, hỏi trước.
2. Dữ liệu online là thật. Trên web HR online chỉ xem, không bấm lưu/gửi/xác nhận, nhất là "Gửi lời mời". Trên app thì thao tác ghi (chấm công, gửi đơn) phải hỏi người dùng trước.
3. Lỗi 403 lúc mở Tổng quan web online, chưa rõ nguồn. Có thể do Realtime ("Mất kết nối cập nhật", Realtime chưa từng kiểm trên cloud).
4. `docs/plans/roadmap-competitive.md` chưa track. Người dùng chưa quyết thì không commit.

## Quyết định đã chốt (phiên này)
- Ngày tạm nghỉ **vẫn tính vào công chuẩn** (lương theo công tự giảm). Không bỏ khỏi công chuẩn như `not_employed`.
- Phép năm: thai sản vẫn tính; ốm tối đa 60 ngày, không lương tối đa 30 ngày cộng dồn/năm; khác không tính. Tháng có phần được tính < 50% bị trừ. Khác prototype ("không tích lũy phép năm").
- Thêm "Kết thúc tạm nghỉ" (prototype không có). Người tạm nghỉ vẫn đăng nhập app, chỉ bị chặn chấm công.
- Có đơn nghỉ đã duyệt trong khoảng tạm nghỉ thì chặn, không tự hủy.

## Mẹo
- Build simulator: trong `apps/mobile`, `LANG=en_US.UTF-8 EXPO_PUBLIC_API_URL=https://kavor-api.onrender.com/api/v1 xcodebuild -workspace ios/Kavor.xcworkspace -scheme Kavor -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build-sim build`, rồi launch `ios/build-sim/Build/Products/Release-iphonesimulator/Kavor.app`.
- `source tools/smoke-lib.sh` phải chạy trong **bash**. Trong zsh, biến `path` của `call()` ghi đè `PATH` nên mất `curl`.
- Smoke: body JSON có dấu phẩy phải gán vào biến trước (bash 3.2).
- Sửa API thì người dùng tự khởi động lại `bash tools/dev-backend.sh`.

## Nợ Ponytail
- `shortcut:` mới ở `apps/api/src/timesheet/pause.ts`: quy tắc 50% đếm theo ngày lịch, ốm không cộng đơn nghỉ ốm lẻ.

## Việc tiếp theo (TASKS)
1. Test/fix app simulator (ở trên) — `[opus high]`
2. Lương người vào/nghỉ giữa kỳ: ngày ngoài hire..termination bị bỏ khỏi công chuẩn → trả đủ lương tháng — `[opus xhigh]`
3. Màn "Xem số tài khoản" — `[opus xhigh]`

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (mục Tạm nghỉ)
- `apps/mobile/src/screens/attendance.tsx`, `apps/mobile/src/store.ts` (xử lý lỗi API)
