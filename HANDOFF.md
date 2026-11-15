# HANDOFF — 15/11/2026 (phiên 8)

**Mục tiêu phiên vừa rồi:** màn "Tạm nghỉ" (việc nhạy cảm số 1 trong TASKS), deploy online, cài iPhone.

## Đã xong
- `8509125` đã push và deploy: Render, Vercel, migration online (reminders, offboarding, employee_pause). Bảng `employee_pauses`, `pause_employee`, `end_employee_pause`, `apply_due_pauses` (vòng quét 10 phút), trigger cắt khi ghi ngày cuối.
- API `POST admin/employees/:id/pause` + `/pause/end`. Bảng công: ngày `paused` vẫn trong công chuẩn, 0 công. Phép năm trừ theo lý do (`timesheet/pause.ts`, NĐ 145/2020). Chặn chấm công (`ATT_PAUSED`) và đơn nghỉ trùng ngày tạm nghỉ.
- Web: hộp Chuyển sang tạm nghỉ / Kết thúc tạm nghỉ. Mobile: ngày tạm nghỉ hiện như ngày nghỉ.
- Kiểm thử local: verify-all đầy đủ đạt (pgTAP 638, 33 smoke, build, lint). Online chỉ xem: hộp Tạm nghỉ đúng prototype, bảng công/chấm công/số dư phép không lỗi.
- iPhone "Dqdatt": đã cài Release trỏ API online, người dùng chưa mở thử.
- Simulator iPhone 17e (1113F02A-…): đã boot. App Release trỏ API online build ở `apps/mobile/ios/build-sim`.

## Đang dở — việc của phiên mới
1. Test app trên simulator với tài khoản thử online **TSNV002**. Người dùng tự gõ mật khẩu trong khung simulator, vì Claude không nhập mật khẩu cho máy chủ không phải local. Đi qua: đăng nhập, Chấm công (bảng công tháng), Nghỉ phép (số dư, gửi đơn thì hỏi trước), Đơn từ, Thông báo, Hồ sơ. Lỗi nào thấy được thì sửa.
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
