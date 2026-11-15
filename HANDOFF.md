# HANDOFF — 15/11/2026

**Mục tiêu phiên vừa rồi:** chữ web HR không rớt dòng xấu, rồi verify web HR v2 với prototype `Kavor HR Admin Prototype v2.html`.

## Đã xong (đã push `claude/ecstatic-pascal-dblg7v` → deploy; chưa kiểm online)
- `64b9461` `vs()` giữ cụm ngắn liền dòng (`span.seg`, vạch dính cụm trước); `Dl` nhãn không ngắt, giá trị ngắt ở dấu phẩy; đơn sửa hồ sơ bỏ "—" gạch ngang; `.tag/.cap`/số thẻ nowrap; số + đơn vị dùng nbsp
- `127dbc4` hồ sơ: lịch sử lương + nhãn Lịch sử; Modal: nút đóng icon nền trong; Drawer: đầu như modal prototype (20px, đóng bên phải); chấm công một người có lịch tháng (`MonthMini` export từ profile.tsx); Sổ phép theo prototype; topbar ≤1280 ô Tìm nhanh thành nút tròn
- Checklist 82 màn prototype ↔ web + kết quả so: `docs/plans/web-hr-v2-checklist.md`
- verify-all --quick đạt (pgTAP 586) sau `db-reset`

## Đang dở
- Không có code dở. DB local vừa reset → không còn dữ liệu thử (đơn, giấy tờ, kỳ lương).
- Script nạp dữ liệu nháp ở scratchpad phiên cũ (có thể bị xóa): bước gọi trong script báo "Bad Request" nhưng gọi tay cùng body lại đạt — chưa rõ nguyên nhân. Lưu ý: chạy hàm smoke-lib trong zsh hỏng (`local path=` đè PATH) → luôn `bash`.
- Nạp "khoản phụ cấp mẫu" vào DB local làm pgTAP `payroll.test.sql:18` lỗi (13≠9 thành phần) → reset trước verify.

## Quyết định đã chốt
- Web chưa "giống 100%": người dùng chọn so các màn đã có trước; 11 màn web chưa có để sau (xem checklist).
- Không cắt chữ bằng "…" ở dữ liệu HR cần duyệt; cụm > 40 ký tự được xuống dòng.
- Prototype không có ngăn kéo bên phải: Drawer = hộp giữa màn hình; không thêm chân "Mở hồ sơ / Đóng".
- Giữ các phần web thêm (MFA/OTP, Kỳ lương, tab Tạm ứng, bảng Từng ngày, nút Sửa/Khác… giấy tờ).
- So UI ở 1280px, giao diện sáng (resize_window colorScheme light); prototype mở file:// trong browser pane, `go('route')`, `S.tab.x='y'; render()`.

## Nợ Ponytail
- `kit.tsx` `vs()`: cụm > 40 ký tự không nowrap — đổi khi cần đo bề ngang thật.
- `employees/page.tsx` DocTicks (từ trước).

## Việc tiếp theo
1. So tiếp các màn còn lại trong checklist + kiểm online `127dbc4` `[opus high]`
2. Script `tools/demo-data.sh` nạp dữ liệu thử ổn định (để so màn cần dữ liệu) `[sonnet]`
3. Trang Lương theo prototype (quỹ lương nhiều kỳ, cơ cấu quỹ) `[opus xhigh]`

## File cần đọc đầu tiên
- `docs/plans/web-hr-v2-checklist.md`, `docs/TASKS.md`
- `apps/admin-web/app/_ui/kit.tsx` (vs, Dl, Modal, Drawer)
- `packages/web-ui/src/kavor.css` (khối cuối file)
- `tools/smoke-lib.sh`
