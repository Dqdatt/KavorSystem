# HANDOFF — 13/11/2026

**Mục tiêu phiên vừa rồi:** làm gọn UI/UX web HR (bớt rối, bớt chữ giải thích, không rớt chữ, cài đặt/đăng xuất vào menu góc phải, bỏ hàng nút để trống).

## Đã xong (đã push nhánh `claude/ecstatic-pascal-dblg7v` → Render/Vercel tự deploy)
- `946adae` Menu tài khoản góc phải (`apps/admin-web/app/_ui/account-menu.tsx`): người dùng + vai trò, doanh nghiệp, Cài đặt, Thiết lập ban đầu,
  Hỗ trợ Kavor, giao diện Sáng/Tối/Tự động, trạng thái cập nhật, Đăng xuất. `Hint` (ⓘ tooltip) ở `@kavor/web-ui`; `Field hint` = ⓘ,
  `Field note` = dòng luôn hiện. Chữ tối thiểu 12px. Cài đặt tách tab "Kỳ công & lương". Lương đầu vào: cột Rà soát lên trước, cột người cố định.
- `63c7102` `PageActions` (kit.tsx) đưa nút của trang lên topbar ở 12 trang; Bản tin bỏ khối trùng → 4 thẻ số liệu bấm lọc; công tắc sát phải;
  chip "Thiếu N giấy tờ" xếp dọc; kỳ công thành nhãn cạnh ô tháng; thẻ số liệu 2 cột trên điện thoại.
- Cả hai lần: `bash tools/verify-all.sh` đầy đủ TẤT CẢ ĐẠT (pgTAP 586, 28 smoke, build, lint DB). Đã chụp mọi trang bằng Claude in Chrome (1664px) + khung 390px.

## Đang dở
- Không có code dở. `docs/plans/roadmap-competitive.md` chưa theo dõi — có từ trước phiên, không phải của phiên này (hỏi người dùng).
- Chưa xem bản online sau deploy. Chưa đăng nhập Kavor Console để xem (Console dùng chung `kavor.css`, chỉ xem trang đăng nhập).
- DB local đã reset bởi verify-all: muốn thử web phải kích hoạt lại HD0007 (OTP Mailpit) + liên kết TOTP.
- Cổng 3000 đang do dev server của phiên khác giữ (`next dev --port 3000` cố định cổng) nên `preview_start admin-web` báo bận.

## Quyết định đã chốt
- Cài đặt doanh nghiệp, giao diện, Đăng xuất chỉ ở menu tài khoản; thanh bên chỉ điều hướng.
- Giải thích dạng ⓘ; cảnh báo cần thấy ngay dùng `note`. Nút hành động trang lên topbar (`PageActions`); bộ lọc (chọn kỳ/tháng) giữ cạnh tab.
- Đã ghi vào AGENTS.md mục "Quy ước và tiêu chí UI".

## Nợ Ponytail
- Không có `shortcut:` mới.

## Việc tiếp theo
1. Xem bản online (Vercel) + đăng nhập Console xem các trang trong có lệch do CSS chung không. `[sonnet]`
2. Áp `PageActions`/ⓘ cho Kavor Console nếu người dùng muốn đồng bộ. `[opus high]`
3. Sơ đồ tổ chức: đường nối hàng con chưa chuẩn; biểu đồ Tổng quan chưa lấp ngang. `[sonnet]`

## File cần đọc đầu tiên
- `apps/admin-web/app/(app)/shell.tsx`, `apps/admin-web/app/_ui/kit.tsx`, `apps/admin-web/app/_ui/account-menu.tsx`
- `packages/web-ui/src/kavor.css` (phần cuối: topbar, ⓘ, menu), `PROGRESS.md` (2 mục đầu "Đã xong")
