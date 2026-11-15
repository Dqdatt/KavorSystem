# HANDOFF — 15/11/2026 (phiên 2)

**Mục tiêu phiên vừa rồi:** so tiếp các màn trong `docs/plans/web-hr-v2-checklist.md` với prototype v2, kiểm bản online, sửa lệch.

## Đã xong
- Online (kavor-system.vercel.app) đã có `64b9461` + `127dbc4`; API `/health` ok
- `e7d90e3` chi tiết đơn (Lý do trước Chấm công gốc), đơn vị (vạch `|`), chi tiết bài viết theo prototype, "Lượt truy cập tuần này", Người phụ thuộc sau MST
- **Chưa commit** (24 file, verify-all --quick đạt, pgTAP 586):
  - Mọi hộp thoại: nút Hủy/Đóng/Để sau = `btn ghost` (39 chỗ)
  - Khóa kỳ công: tiêu đề "Khóa kỳ công 11/2026"; Gán vai trò: "Chọn nhân viên", "Đến" + hint
  - Thu hồi vai trò: quản trị viên duy nhất → hộp cảnh báo + "Gán người khác" (DB vẫn chặn LAST_TENANT_ADMIN)
  - Form người phụ thuộc, hộp Mời kích hoạt theo prototype
  - API `schedule.service.ts`: ngừng ca/địa điểm còn lượt áp dụng đang/sắp hiệu lực → 409; `hr-smoke.sh` +2 bước (đạt); web `schedules/page.tsx` có StopModal (chặn / xác nhận)

## Đang dở
- Không có code dở. API local :4000 chạy code cũ → `pnpm dev:backend` lại để thử luật 409.
- Hộp "Xác nhận ngừng" (ca/địa điểm chưa áp dụng) mới qua typecheck, chưa mở xem.
- Đăng nhập web local để so UI: Next 16 không cho chạy dev server thứ 2 → dùng thẳng localhost:3000. Tài khoản thử HD0007 / `PW` trong `tools/smoke-lib.sh`; MFA: xóa `auth.mfa_factors` của thao.mai@haidang.vn, gọi `admin/mfa/enroll` + `verify` (hàm `mfa`/`totp` trong smoke-lib), giữ secret để tính mã. JS không ghi được cookie phiên.

## Quyết định đã chốt
- Bản online là dữ liệu thật: chỉ xem, không bấm lưu/gửi/xác nhận (nhất là mời kích hoạt). Hộp thao tác so ở local.
- Ngừng ca/địa điểm đang áp dụng: chặn ở API (không chỉ giao diện).
- Giữ các phần web thêm: ô Ghi chú + "Vẫn khóa kỳ" khi khóa kỳ, ô Tìm nhân viên khi gán vai trò, "Đến tháng" ở người phụ thuộc.
- Chốt bảng lương theo prototype (hộp 4 bước) gộp vào việc trang Lương [opus xhigh].

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `kit.tsx` `vs()` cụm > 40 ký tự; `employees/page.tsx` DocTicks.

## Việc tiếp theo
1. Commit + push đợt chưa commit (push = deploy; verify-all đã đạt) `[haiku]`
2. Hộp Nhập file nhân viên 3 bước như prototype (Tải mẫu .xlsx, kéo thả, xem trước) — nhớ `import-generic-input`: mẫu chỉ là gợi ý, không bắt sửa theo mẫu `[opus high]`
3. Dọn lệch nhỏ còn lại: ~50 chỗ "·" → `|`; chức danh người gửi ở chi tiết đơn + "Chưa có app" ở người đọc bài (cần thêm trường API); so chi tiết tài liệu (tải 1 file thử ở local) `[sonnet]`

## File cần đọc đầu tiên
- `docs/plans/web-hr-v2-checklist.md` (bảng "Đợt so online" + "Đợt so local")
- `docs/TASKS.md`
- `apps/admin-web/app/_ui/kit.tsx` (Modal, vs, useAction)
- `apps/admin-web/app/_ui/employee-import.tsx` (cho việc 2)
- `tools/smoke-lib.sh`
