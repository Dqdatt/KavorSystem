# HANDOFF — 15/11/2026 (phiên 7)

**Mục tiêu phiên vừa rồi:** làm màn đầu tiên của việc 1 (các màn nhạy cảm) là "Cho nghỉ việc".

## Đã xong
- `abeb646`: migration `202612040001_offboarding.sql` (cột lý do/bàn giao/ghi chú). `offboard_employee`: ngày cuối đã qua → `terminated` + khóa membership ngay, chưa tới → `leaving`; hủy đơn tạm ứng chờ + đơn nghỉ chờ bắt đầu sau ngày cuối; chặn quản trị viên cuối, kỳ công đã khóa, ngày trước ngày vào làm.
- `apply_due_terminations` (vòng quét 10 phút của API): qua ngày cuối → `terminated` + khóa; khóa luôn hồ sơ đã nghỉ mà tài khoản còn mở.
- API có `GET|POST admin/employees/:id/offboard`. PATCH hồ sơ trả 409 nếu đặt `leaving`/`terminated`. Trước đây đổi thẳng sang `terminated` không khóa membership, nên RLS vẫn mở.
- Web: mục "Cho nghỉ việc" ở menu ⋮ hồ sơ, hộp theo prototype, cảnh báo khi người nghỉ đang quản lý trực tiếp.
- Kiểm thử: pgTAP 615/615 (`offboarding.test.sql` 18), `offboard-smoke.sh` và `console-ops-smoke.sh` đạt. Đã bấm thử trên web local.

## Đang dở
- Không có code dở. Chưa push (chưa deploy, migration online chưa chạy). Trước push chạy `bash tools/verify-all.sh` đầy đủ; phiên này mới chạy `--quick`.
- `docs/plans/roadmap-competitive.md` chưa track. Người dùng chưa quyết thì không commit.
- DB local: Võ Thảo Linh (HDG0005) đang "Sắp nghỉ" do bấm thử. Muốn sạch thì chạy `bash tools/db-reset.sh`.

## Quyết định đã chốt
- `termination_date` = ngày làm việc cuối, vẫn tính công ngày đó. Nhãn web là "Ngày làm việc cuối", app khóa từ ngày hôm sau.
- Bỏ "Quyết toán lương" của prototype vì chưa có kỳ lương riêng.
- Chỉ hủy đơn nghỉ bắt đầu sau ngày cuối; đơn trong thời gian còn làm để người duyệt xử lý.
- Người nghỉ đang quản lý: chỉ cảnh báo (chuyển người duyệt là việc tùy chọn trong TASKS). Quay lại làm qua "Sửa hồ sơ" thì xóa ngày cuối, tài khoản vẫn khóa tới khi HR mở.

## Mẹo local
- Smoke trên Mac: body JSON có `{…,…}` phải để vào biến trước. bash 3.2 tách chuỗi đó khi nằm trong `"$(…)"`.
- Thử web: mở thẳng `http://localhost:3000` (không chạy được server thứ 2 cùng thư mục). HD0007: mật khẩu `PW` trong `tools/smoke-lib.sh`, TOTP lấy secret ở `auth.mfa_factors` rồi chạy `totp` trong bash.
- Sửa API thì người dùng phải tự tắt API cũ và chạy lại `bash tools/dev-backend.sh`.

## Nợ Ponytail
- Không có `shortcut:` mới. Nợ cũ giữ nguyên: `demo-data.sh` chưa idempotent; `kit.tsx` `vs()`; `employees/page.tsx` DocTicks.

## Việc tiếp theo
1. Màn "Tạm nghỉ" (prototype `ov:pause` ~dòng 1540): trạng thái `on_leave`, không tính công, không tích lũy phép. Lập kế hoạch riêng trước — `[opus xhigh]`
2. Màn "Xem số tài khoản" (`employee.sensitive.read`, audit khi xem) — `[opus xhigh]`
3. Chạy verify-all đầy đủ rồi push khi người dùng bảo — `[haiku]`

## File cần đọc đầu tiên
- `docs/TASKS.md`
- `AGENTS.md` (mục Cho nghỉ việc, hồ sơ, `employee.sensitive.read`)
- `supabase/migrations/202612040001_offboarding.sql`
- `apps/api/src/admin/employees.service.ts`
- `apps/admin-web/app/(app)/employees/profile.tsx`
