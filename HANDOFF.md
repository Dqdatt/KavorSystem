# HANDOFF — 15/11/2026 (phiên 4)

**Mục tiêu phiên vừa rồi:** làm việc 1 (dọn lệch nhỏ) và việc 2 (4 màn chỉ UI) của HANDOFF trước, push rồi so bản online.

## Đã xong
- `b4b13ee` "·" → vạch `vs()` / `<i className="vs" />` ở ~90 chỗ; tiêu đề hộp "X: Tên"; `Empty`, `SwitchRow` gọi vs(). API `requester.position` (thẻ người gửi "chức danh | phòng ban | mã"), `AnnouncementReader.hasApp` ("Chưa có app" ở khối Chưa đọc); chi tiết tài liệu theo prototype (đầu = tên + "danh mục, NV", `Dl`, note sắp hết hạn)
- `80e4025` popover "Điểm mới ở màn này" (topbar) + "Ghi chú phiên bản" (chân trang), nội dung `_ui/release-notes.ts`, khung `_ui/popover.tsx`; "Hồ sơ của tôi" ở menu tài khoản; "Thêm khoản mẫu" thành hộp tick, API `payroll/pay-items/templates` nhận `{ names }`, mẫu ở contracts `PAY_ITEM_TEMPLATES`
- Smoke thêm bước: requests (position), announcements (hasApp), payroll-inputs (chọn khoản, tên lạ/rỗng → 400). Đã đạt: typecheck, unit, pgTAP 586 (DB sạch), smoke requests/announcements/documents/payroll-inputs/payroll-compute
- Đã so online cả 2 đợt (chỉ xem): đúng prototype

## Đang dở
- Không có code dở. `docs/plans/roadmap-competitive.md` vẫn chưa track, không rõ của ai, không commit.
- DB local đã reset; HD0007 đã kích hoạt + MFA, secret TOTP trong scratchpad phiên này (mất khi xóa) → phiên sau kích hoạt lại theo mẹo dưới.

## Quyết định đã chốt
- Giữ "·" ở `<option>` (prototype cũng vậy), toast, tooltip, comment.
- "Điểm mới" chỉ ghi điều web có thật (đã đối chiếu từng ý); trang không có nội dung thì ẩn nút. Đổi phiên bản phải tự sửa `release-notes.ts`.
- `hasApp` = nhân viên có user (kể cả đang khóa). Chi tiết tài liệu không làm khung xem trước minh họa.
- Xong một việc khớp prototype → commit + push (= deploy) rồi so online; chưa xong → chỉ commit.

## Mẹo local
- `verify-all --quick` không reset DB: chạy ngay sau smoke có thể trượt pgTAP do fixture smoke (vd documents gán quyền cho HDG0003) → `bash tools/db-reset.sh` rồi `supabase test db`.
- Đăng nhập web local: `bash -c 'source tools/smoke-lib.sh; activate HD0007 thao.mai@haidang.vn'` → `admin/mfa/enroll` + `verify`, giữ secret, `totp <secret>` lúc đăng nhập (mật khẩu = `$PW` trong smoke-lib).
- API local không tự nạp code: sửa API thì chạy lại `bash tools/dev-backend.sh`.

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `kit.tsx` `vs()` cụm > 40 ký tự; `employees/page.tsx` DocTicks.

## Việc tiếp theo
1. Script nạp dữ liệu thử ổn định (`tools/demo-data.sh` lỗi "Bad Request" vài bước) `[sonnet]`
2. Nút "Nhắc" (chấm công/giấy tờ/bản tin): endpoint + migration kind thông báo + icon `[opus high]`
3. Màn nhạy cảm: Cho nghỉ việc, Tạm nghỉ, Xem số tài khoản — mỗi màn một kế hoạch `[opus xhigh]`

## File cần đọc đầu tiên
- `docs/TASKS.md`
- `docs/plans/web-hr-v2-checklist.md`
- `apps/admin-web/app/_ui/kit.tsx`
- `apps/admin-web/app/_ui/release-notes.ts`
- `tools/smoke-lib.sh`
