# HANDOFF — 18/11/2026 (phiên 21)

**Mục tiêu phiên vừa rồi:** đóng UAT vòng 2 — commit P0 nhánh A, chạy nhánh B (lương Hải Đăng), build lại app, verify-all, deploy.

## Đã xong
- `d71f286`: 2 P0 nhánh A (nút "Thêm địa điểm"/"Tạo ca" khi trống; app lộ dữ liệu người trước — cache theo `employeeId`).
- Nhánh B đạt trọn vòng (H-60…H-69b), khớp tay từng đồng: SC0001 thực nhận 9.755.500; tổng 292.665.000; chi phí công ty 403.845.000; thuế qua Tính thử (bậc 5%/10%). Chi tiết `docs/plans/uat-vong2-ketqua.md`.
- `9ca3593`: phiếu lương app hiện tên khoản BHXH/BHYT/BHTN/Lương cơ bản (trước chỉ hiện công thức — BLLĐ Điều 95) `money.tsx`; trang chủ bỏ "Phiếu lương 09/2026" ghi cứng `home.tsx`. Đã kiểm trên iOS Simulator bản Release mới.
- verify-all đầy đủ ở API 4100 đạt (2 lỗi môi trường chạy lại đạt — xem ghi nhớ `verify-all-machine-load`). Push `9ca3593`: Vercel 2 project + CI `database`/`verify` success, API online health ok. Không có migration.

## Đang dở
- **Android chưa thử hết:** APK mới (`10.0.2.2:4100`) đã cài + mở được, emulator treo khi máy tải 17 (QEMU main loop) → đã tắt. Thử lại khi máy rảnh, xong gỡ `android:usesCleartextTraffic="true"` (AndroidManifest, native không theo git). JDK: `JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.20.1/libexec/openjdk.jdk/Contents/Home`, adb ở `~/Library/Android/sdk/platform-tools`.
- **iPhone 11 (bản online) chưa có bản mobile mới** — cài qua cáp theo PROGRESS "Cài bản mới lên iPhone" (API online).
- DB local đã reset bởi verify-all (dữ liệu UAT mất). API 4100 (Preview, không đọc `.env.local`) và API 4000 cũ (16/11) vẫn chạy; Simulator đã tắt.

## Quyết định đã chốt
- Phiếu lương thiếu tên khoản sửa ngay dù không phải P0 tiền/công vì dính BLLĐ Điều 95 (kèm build lại).
- (Trước đó) Chỉ sửa P0, còn lại "Sau v1"; đăng xuất không xóa lần chấm chưa gửi; 6 mục chốt 18/11; tạm ứng hạn mức theo từng đơn; migration cloud `supabase db query --linked -f`.

## Chờ người dùng
- Một người (quản lý trực tiếp kiêm Kế toán) duyệt cả 2 bước tạm ứng — có chặn không. Claude đề nghị **chặn** (giống kỳ lương: người duyệt ≠ người nhập).

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `attendance.ts` hàng đợi của người không đăng nhập lại; `leave.service.ts` sổ phép năm trước.

## Việc tiếp theo
1. Người dùng quyết tạm ứng 2 bước → làm nếu chặn `[opus xhigh]` (migration + pgTAP + API + smoke).
2. Thử lại Android + gỡ cleartext `[haiku]`; cài iPhone 11 bản mới `[haiku]` (`docs/TASKS.md` Đợt 5).
3. Đợt 5 xong thì v1 xong → chọn việc từ "Sau v1" (`docs/TASKS.md`).

## File cần đọc đầu tiên
- `docs/plans/uat-vong2-ketqua.md` (tóm tắt nhánh A/B), `docs/TASKS.md` (Đợt 5 + Sau v1), `AGENTS.md` (Cạm bẫy)
