# HANDOFF — 15/11/2026 (phiên 6)

**Mục tiêu phiên vừa rồi:** làm việc 1 của HANDOFF trước, tức nút "Nhắc" của HR (chấm công / giấy tờ / bản tin).

## Đã xong
- `893bd7f`: migration `202612030001_reminders.sql` thêm 3 kind `reminder.*` và hàm `notify_reminders`. pgTAP `reminders.test.sql` có 11 test.
- API có 3 route: `attendance/remind`, `checklist/remind`, `announcements/:id/remind`. Danh sách người được nhắc lấy từ `board` / `gaps` / `detail` sẵn có, theo phạm vi quyền. Mỗi lần nhắc ghi audit `reminder.sent`.
- Web có 5 chỗ nút Nhắc, dùng hook `useRemind` trong `kit.tsx`. Chuông thông báo có icon fallback.
- Mobile có icon cho 3 kind mới, kind lạ dùng icon fallback. Bấm thông báo mở màn chấm công / giấy tờ / bài.
- `verify-all --quick` đạt (pgTAP 597). `notifications-smoke.sh` đạt. Đã bấm thử trên web local: nhắc giấy tờ và nhắc bản tin ra đúng thông báo và audit.

## Đang dở
- Không có code dở. Chưa push, tức chưa deploy, migration online cũng chưa chạy.
- Nhánh nhắc chấm công chưa được thử thật vì 15/11 là Chủ nhật: smoke chỉ chạy nhánh "không ai cần nhắc". Chạy smoke vào ngày làm việc để kiểm.
- `docs/plans/roadmap-competitive.md` chưa track. Người dùng chưa quyết thì không commit.

## Quyết định đã chốt
- Bỏ "nhắc ngày thiếu công cũ" trong ngăn kéo chấm công. Bỏ "Nhắc người duyệt", vì `notify_due_approvals` đã tự nhắc (TASKS có dòng tùy chọn).
- Nút Nhắc là ngoại lệ duy nhất mà API tạo thông báo (ghi ở AGENTS.md). Nội dung thông báo viết trong SQL.
- Mỗi người chỉ được nhắc 1 lần mỗi ngày cho mỗi loại (bản tin: mỗi bài), chặn trùng bằng `dedupe_key`. Người chưa có app hoặc đã nghỉ việc không nhận.
- Quyết định của phiên 4–5 vẫn giữ nguyên: "·" giữ ở `<option>`/toast/tooltip; push = deploy, chỉ push khi người dùng bảo.

## Mẹo local
- Muốn xem UI với dữ liệu thử: `bash tools/db-reset.sh && bash tools/demo-data.sh`. Dữ liệu thử chưa có danh mục giấy tờ, phải bấm "Thêm mẫu phổ biến" ở Tài liệu → Danh mục giấy tờ.
- Đăng nhập web bằng HD0007 (thao.mai@haidang.vn, mật khẩu trong `tools/smoke-lib.sh`). Lấy mã TOTP: lấy secret bằng `docker exec … psql` (máy không có `psql`), rồi chạy `totp` của smoke-lib trong **bash**, không phải zsh.
- Sửa API thì phải tắt API cũ ở terminal của người dùng rồi chạy lại `bash tools/dev-backend.sh`. Claude không được phép kill tiến trình đó. Trình xem trước không chạy được script ở Desktop.

## Nợ Ponytail
- Không có `shortcut:` mới.
- Nợ cũ: `demo-data.sh` chưa idempotent; `kit.tsx` `vs()` cụm > 40 ký tự; `employees/page.tsx` DocTicks.

## Việc tiếp theo
1. Các màn nhạy cảm: Cho nghỉ việc, Tạm nghỉ, Xem số tài khoản. Mỗi màn làm một kế hoạch riêng `[opus xhigh]`.
2. Ctrl K tìm đơn theo mã; nút Ctrl K trên màn hẹp; "Xuất danh sách" chấm công hôm nay; "Người đang áp dụng"; phân trang Ngày lễ `[sonnet]`.
3. Thời hạn thử việc → "hết thử việc" ở khối Sắp tới `[opus high]`.

## File cần đọc đầu tiên
- `docs/TASKS.md`
- `AGENTS.md` (vùng nhạy cảm, hồ sơ, `employee.sensitive.read`)
- `docs/plans/web-hr-v2-checklist.md`
- `apps/api/src/admin/employees.service.ts`
- `apps/admin-web/app/(app)/employees/profile.tsx`
