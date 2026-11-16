# HANDOFF — 16/11/2026 (phiên 13)

**Mục tiêu phiên vừa rồi:** cài lại app lên iPhone 11 thật (có sửa đếm đi muộn) và sửa hai lệch mobile thấy khi test.

## Đã xong
- `/batdau`: CLAUDE.md + TASKS.md đã đủ, không đổi. HANDOFF.md vẫn commit (không gitignore).
- verify-all --quick đạt (pgTAP 656) → push `f39d263` + `3c25ada`, sau đó push `ef972be`. Nhánh remote = `ef972be`.
- iPhone 11 cài bản Release trỏ API online, build 16:31 (có `f39d263`, CHƯA có `ef972be`). Người dùng đã duyệt lại iPhone 11 trên web online (simulator tự bị thu hồi).
- `ef972be` mobile: nhãn "Duyệt" ở Tạm ứng bị giá trị dài bóp về 0 → `InfoRow` nhãn `minWidth: "35%"` (`ui.tsx`);
  màn E19 "Đang chờ HR xử lý" (bản API) lấy tên máy + giờ gửi từ `S.att.info` (registeredAt), bỏ dữ liệu mẫu; làm mới cập nhật `S.att.info`.
  Đã kiểm trên simulator với API local: E19 hiện đúng, duyệt trên DB → bấm làm mới vào trang chủ; trang Tạm ứng nhãn + căn phải đúng.

## Đang dở
- Simulator iPhone 17e hiện cài bản Release trỏ **API local** (`ios/build-sim`), đăng nhập HD0142, PIN thử nằm trong keychain simulator.
  Muốn test online lại trên simulator phải build lại với URL online (và HR duyệt máy — sẽ thu hồi iPhone 11).
- DB local: HD0142 có thêm máy giả `fake-iphone-11-local` (revoked) + máy simulator active. Reset DB nếu cần sạch.
- Lỗi 403 Tổng quan: đã rõ — là 403 `MFA_REQUIRED` cố ý lúc đăng nhập (ghi trong AGENTS.md cạm bẫy). Nhãn Realtime lúc mới mở giờ là "Đang kết nối…" (chưa commit). `docs/plans/roadmap-competitive.md` chưa track, người dùng chưa quyết (không commit).

## Quyết định đã chốt
- Push nhánh deploy sau khi verify-all đạt: người dùng đã đồng ý cho các commit phiên này.
- Dữ liệu online là thật: chỉ xem; duyệt thiết bị online người dùng tự bấm. Test thao tác ghi thì dùng DB local.
- Màn E19 giữ mã "E19" như prototype; bước HR ghi "Phòng Nhân sự" (API không trả tên người duyệt máy).

## Nợ Ponytail
- Không có `shortcut:` mới. Nợ cũ: `apps/api/src/timesheet/pause.ts` (50% theo ngày lịch, nghỉ ốm không cộng đơn lẻ).

## Việc tiếp theo
1. ~~Lỗi 403 Tổng quan~~ xong (không phải lỗi). Commit bản sửa nhãn "Đang kết nối…" khi người dùng bảo.
2. (Khi tiện) build lại bản iPhone thật có `ef972be` rồi cài qua cáp (lệnh trong PROGRESS "Cài bản mới lên iPhone") — `[sonnet]`
3. "Xem số tài khoản" (`employee.sensitive.read`, audit khi xem) — `[opus xhigh]`

## File cần đọc đầu tiên
- `docs/TASKS.md`, `AGENTS.md` (mục web HR + phân quyền)
- `apps/admin-web/app/(app)/` trang Tổng quan, `apps/admin-web/app/api/kavor/[...path]/` (proxy API)
