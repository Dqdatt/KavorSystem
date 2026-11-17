# HANDOFF — 17/11/2026 (phiên 18)

**Mục tiêu phiên vừa rồi:** Đợt 2 của kế hoạch v1 (đúng số công/lương), lên online trước khi công ty thật khóa kỳ tháng 12 — xong.

## Đã xong (đã deploy: migration lên Supabase cloud + push nhánh)
- `318c68c` duyệt bấm 2 lần không bỏ qua bước sau (`202612090001`).
- `cec4bab` trần 1.000 dòng: `apps/api/src/db/rows.ts` (`all`, `allIn`); `tools/scale-data.sh` + `scale-smoke.sh` (120 NV, dùng lại khi UAT).
- `3d2b37c` race tạo đơn/chấm công: khóa theo nhân viên + kiểm lại trong SQL, kể cả hạn mức OT (`202612100001`).
- `125a5d8` phép tồn năm trước; `6bc76d4` sửa hồ sơ NV một RPC `save_employee` (`202612110001`).
- verify-all đầy đủ đạt (pgTAP 695, unit 92); mọi test mới chạy trên code cũ đều hỏng đúng chỗ. Web online đã xem (chỉ xem) với dữ liệu thật.
- Các commit chỉ tài liệu sau `53d41db` **chưa push** — đi cùng lần push code của vòng 1, tránh Render khởi động lại vô ích.

## Đang dở
- Không có code dở. API cổng 4000 (terminal người dùng) chạy code cũ → `bash tools/dev-backend.sh` trước khi thử local; DB local là dữ liệu mẫu.
- Chưa xác nhận Render đã chạy commit cuối (health không có số phiên bản).

## Quyết định đã chốt
- Tạm ứng: hạn mức theo từng đơn, không cộng dồn trong tháng (17/11). Phép tồn: năm trước khi dùng Kavor không tạo sổ, HR nhập tay.
- Cắt phạm vi v1 (17/11): Đợt 3–4 chỉ còn 6 việc P0 (vòng 1), Đợt 5 = vòng 2; mỗi vòng deploy một lần cuối vòng.
- Công ty thật TS-3010: 229 hồ sơ = 30 đang làm + 199 đã nghỉ (nhập file).

## Nợ Ponytail
- `leave.service.ts`: sổ năm trước bổ sung theo quy định phép năm đang áp dụng hôm nay — quay lại khi quy định có lịch sử theo năm (đã ghi Sau v1).

## Việc tiếp theo — xong v1 trong 2 vòng (người dùng chốt cắt phạm vi 17/11)
1. **Vòng 1 — sửa nốt P0 còn lại, deploy một lần cuối vòng** `[opus high]` (phần nhỏ giao `laptrinh`):
   mobile crash offline `reqItems`; widget mô phỏng sửa `S.clockIn`; hàng đợi chấm công offline gắn NV + xóa khi đăng xuất + giữ lỗi tạm thời;
   `mailer` báo lỗi khi không gửi được thư mời; CSV xuất chặn công thức. Build cài iPhone + thử Android emulator.
2. **Vòng 2 — UAT trọn vòng** `[opus high]`: `bash tools/db-reset.sh && bash tools/scale-data.sh 30`, theo `docs/TEST_WORKFLOW.md`
   (Console → HR → app → chấm công → đơn → duyệt → khóa kỳ → tính lương → phiếu). Chỉ sửa P0; còn lại ghi Sau v1.
3. **Người dùng (không phải code, làm song song):** trả lời 6 mục "Cần người dùng chốt" trong `docs/plans/hoan-thien-v1.md`
   (ngày khóa kỳ đầu, bản đồ, tham số thuế, pháp lý dữ liệu ở Singapore, phòng ban con, roadmap).
- Mọi việc khác của Đợt 3–4 (GPS/pin, múi giờ hiển thị, idempotent tạo đơn, che màn hình/PIN nền, hộp thoại web, validate lặt vặt, ghi nửa chừng
  ca/quy định, ngừng phòng ban, ngưỡng cứng ADR…) đã chuyển "Sau v1" (TASKS, kế hoạch v1).

## File cần đọc đầu tiên
- `docs/plans/hoan-thien-v1.md`, `docs/TASKS.md` (Đợt 3–5), `AGENTS.md` (Cạm bẫy), `docs/TEST_WORKFLOW.md`, `apps/mobile/src/attendance.ts`
