# HANDOFF — 18/11/2026 (phiên 19)

**Mục tiêu phiên vừa rồi:** vòng 1 của v1 — sửa nốt P0 Đợt 3–4, thử Simulator + Android emulator, deploy, cài iPhone 11. Xong hết.

## Đã xong
- `1c79ea4` (đã deploy 18/11 ~08:09, Render/Vercel success): mobile crash `reqItems` offline; widget mô phỏng không đổi giờ thật; hàng đợi chấm công
  gắn `emp` + `locked()` + `keepQueued`; nhãn bước Kế toán; Android GPS nền không hỏi "Location Accuracy" lặp; `csvCell` chặn công thức CSV;
  mailer/trạm thư/OTP ghi log nguyên nhân + `inviteError`; migration `202612120001` (quản trị viên cuối theo ngày công ty, đã áp lên cloud).
- Kiểm: verify-all đầy đủ, pgTAP 695 (đạt cả lúc 06:33 VN), smoke offboard/requests, test hàng đợi 10 ca, Simulator + Android emulator Release.
- Đã cài iPhone 11 "Dqdatt" bản `1c79ea4` trỏ API online. Các commit sau `1c79ea4` chỉ là tài liệu, **chưa push** (đi cùng lần push code sau).

## Đang dở
- Không có code dở. Mục 6 đã chốt: giữ `roadmap-competitive.md` làm định hướng sau v1 (`6e59d8e`).
- Chưa đăng nhập bản online xem dữ liệu sau deploy; người dùng tự mở app trên iPhone thử (không chấm công thử — dữ liệu thật).

## Quyết định đã chốt
- Đăng xuất **không xóa** lần chấm chưa gửi: giữ trên máy gắn mã NV, chỉ người đó gửi khi đăng nhập lại; quá hạn offline thì máy chủ từ chối, app báo.
- Lỗi tạm giữ trong hàng đợi: mạng/5xx/401/429/chờ đồng ý điều khoản/máy chờ duyệt; lỗi khác bỏ và báo.
- Migration cloud không cần mật khẩu: `supabase db query --linked -f` (cùng giao dịch ghi `schema_migrations`), xem ghi nhớ deploy.
- Tạm ứng: hạn mức theo từng đơn (17/11). Phạm vi v1 đã cắt (17/11): chỉ P0, còn lại "Sau v1" trong TASKS.

## Nợ Ponytail
- `apps/mobile/src/attendance.ts`: lần chấm của người không bao giờ đăng nhập lại nằm mãi trên máy — dọn theo tuổi nếu thấy hàng đợi phình (Sau v1).
- `leave.service.ts`: sổ phép năm trước theo quy định hiện hành — khi quy định có lịch sử theo năm.

## Việc tiếp theo
1. **Người dùng** chốt 5 mục còn lại "Cần người dùng chốt" (`docs/plans/hoan-thien-v1.md`), nhất là tham số thuế (Kế toán xác nhận) — trước vòng 2.
2. **Vòng 2 — UAT trọn vòng** `[opus high]` (phần lương `[opus xhigh]`): `bash tools/db-reset.sh && bash tools/scale-data.sh 30`, theo
   `docs/TEST_WORKFLOW.md`: Console → HR → app → chấm công → đơn → duyệt → khóa kỳ → tính lương → phiếu. Chỉ sửa P0, còn lại ghi Sau v1; deploy cuối vòng.
   Thử API mới ở cổng 4100 (lệnh trong `tools/dev-backend.sh`); APK Release thử local cần tạm `usesCleartextTraffic` (AGENTS Cạm bẫy).

## File cần đọc đầu tiên
- `docs/TASKS.md` (Đợt 5), `docs/TEST_WORKFLOW.md`, `docs/plans/hoan-thien-v1.md`, `AGENTS.md` (Cạm bẫy)
