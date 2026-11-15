# HANDOFF — 15/11/2026 (phiên 9)

**Mục tiêu phiên vừa rồi:** test app mobile trên simulator iPhone 17e với tài khoản online TSNV002, sửa lỗi thấy được.

## Đã xong
- `8113500` (đã push, verify-all đầy đủ đạt, Vercel + CI đạt):
  - `apps/mobile/src/ui.tsx` `Btn`/`Note`: chữ ghép (`Xem đơn {req.no}`, ghi chú Nghỉ phép, form xin nghỉ, thẻ quyền vị trí) bị trống trên bản Release. Giờ bọc mọi children không phải phần tử JSX trong `<Text>`.
  - `ui.tsx` `Ln`: giá trị tối đa 65% bề ngang và xuống dòng, nhãn không bị ép thành từng chữ.
  - API `createExplanation`: chỉ đề nghị một giờ thì phải hợp với giờ đã chấm (vào trước ra). Thêm bước trong `timesheet-smoke`.
- Đã đi hết các màn online: trang chủ, Bảng công, Nghỉ phép, Đơn từ, Thông báo, Hồ sơ, Bảo mật, Bản tin. Không crash, không lỗi API.
- Đã kiểm 3 bản sửa trên simulator bằng bản local (`ios/build-sim-local`, HD0142).

## Đang dở
- Render không báo trạng thái về GitHub: xem Render → Events đã deploy `8113500` chưa.
- Simulator đang cài bản **local** và Keychain đã bị xoá. Test online lại thì build bản online (lệnh ở Mẹo), người dùng tự gõ mật khẩu TSNV002, rồi **đăng ký lại thiết bị**. Đây là ghi lên online, phải hỏi trước. iPhone thật cũng cần build lại mới có bản sửa giao diện.
- `docs/plans/roadmap-competitive.md` chưa track. Người dùng chưa quyết thì không commit.
- Lỗi 403 lúc mở Tổng quan web online, chưa rõ nguồn (có thể do Realtime).

## Quyết định đã chốt
- Dữ liệu online là thật: chỉ xem. Chấm công, gửi đơn, đăng ký thiết bị, "Gửi lời mời" đều phải hỏi người dùng. Mật khẩu online do người dùng tự gõ.
- Kiểm bản sửa giao diện trên bản local, không dùng dữ liệu online.
- Tạm nghỉ (phiên 8): ngày tạm nghỉ vẫn tính vào công chuẩn. Phép năm trừ theo lý do (NĐ 145/2020). Có "Kết thúc tạm nghỉ". Đơn nghỉ đã duyệt trùng khoảng thì chặn, không tự hủy.

## Nợ Ponytail
- Phiên này không có `shortcut:` mới. Còn nợ cũ ở `apps/api/src/timesheet/pause.ts`: quy tắc 50% đếm theo ngày lịch, nghỉ ốm không cộng đơn nghỉ ốm lẻ.

## Việc tiếp theo
1. Lương người vào làm hoặc nghỉ việc giữa kỳ: ngày ngoài khoảng hire..termination bị bỏ khỏi công chuẩn, nên vào làm 13/26 ngày vẫn đủ lương. Đề xuất cách tính để người dùng chốt trước, rồi mới sửa — `[opus xhigh]`
2. Ngày có giờ vào > giờ ra (TSNV002 04/11) vẫn tính 1 công trong `computeDay`: người dùng chọn HR sửa tay hay đổi luật — `[opus xhigh]`
3. Trang chủ mobile ngày nghỉ theo `shift.workDays` vẫn hiện ca + "Vào ca". Đề xuất vẫn cho chấm, đổi dòng ca thành "Hôm nay nghỉ" — `[opus high]`

## Mẹo
- Build simulator online: trong `apps/mobile`, `LANG=en_US.UTF-8 EXPO_PUBLIC_API_URL=https://kavor-api.onrender.com/api/v1 xcodebuild -workspace ios/Kavor.xcworkspace -scheme Kavor -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build-sim build`. Bản local: URL `http://localhost:4000/api/v1`, `-derivedDataPath ios/build-sim-local`.
- Bản Release nuốt lỗi "chữ ngoài `<Text>`" (chỉ hiện trống). Component nhận chữ phải bọc `<Text>`.
- `verify-all --quick` và `db-reset` không chạy song song: reset làm pgTAP mất kết nối.

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (mục Tạm nghỉ, bảng công)
- `apps/api/src/timesheet/compute.ts` (`computeDay`, `not_employed`)
- `apps/api/src/payroll/` (cách dùng công chuẩn)
