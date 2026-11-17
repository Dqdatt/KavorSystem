# HANDOFF — 18/11/2026 (phiên 19)

**Mục tiêu phiên vừa rồi:** vòng 1 của v1 — sửa nốt P0 Đợt 3–4, thử Simulator + Android emulator. Xong code và kiểm; **chưa deploy**.

## Đã xong (commit vòng 1, chưa push)
- Mobile: crash `reqItems` khi mở app mất mạng; widget mô phỏng không đổi giờ thật; hàng đợi chấm công gắn `emp` + `locked()` + `keepQueued`;
  nhãn bước Kế toán ở chi tiết đơn; Android GPS nền không hỏi "Location Accuracy" lặp (`mayShowUserSettingsDialog`).
- API/web: `csvCell` chặn công thức CSV; mailer/trạm thư/OTP ghi log nguyên nhân, trạm 401/404 → `EMAIL_NOT_CONFIGURED`; tạo NV kèm mời lỗi → `inviteError`.
- Migration `202612120001_offboard_admin_tenant_date.sql`: chặn nghỉ quản trị viên cuối theo ngày công ty (trước dùng UTC → hở 00:00–07:00 VN).
- Kiểm: verify-all đầy đủ tối 17/11 (smoke lương MFA lỗi giả do tải, chạy lại đạt); sau đó pgTAP 695 + smoke offboard + requests đạt;
  `tools/punch-queue-mobile-test.mjs` 10 ca; Simulator + Android emulator Release theo kịch bản trong TASKS Đợt 3.

## Đang dở (cần người dùng)
1. **Deploy vòng 1** (hỏi trước khi làm): migration `202612120001` lên cloud bằng `tools/cloud-supabase.sh` **trước**, rồi push nhánh
   `claude/ecstatic-pascal-dblg7v` (Render + Vercel tự deploy). Migration chỉ thay định nghĩa hàm, không đổi dữ liệu. Kiểm online chỉ xem.
2. **Cài iPhone 11 qua cáp**: build `xcodebuild … -destination 'generic/platform=iOS' -derivedDataPath ios/build-device` với
   `EXPO_PUBLIC_API_URL=https://kavor-api.onrender.com/api/v1` (xóa `$TMPDIR/metro-cache`, không bật QA) → `xcrun devicectl device install app`.
3. 6 mục "Cần người dùng chốt" (`docs/plans/hoan-thien-v1.md`); `docs/plans/roadmap-competitive.md` vẫn chưa commit (mục 6).

## Quyết định đã chốt
- Đăng xuất **không xóa** lần chấm chưa gửi: giữ trên máy gắn mã NV, chỉ người đó gửi khi đăng nhập lại (tránh mất công); quá hạn offline thì máy chủ từ chối và app báo.
- Lỗi tạm thời giữ trong hàng đợi: mạng/5xx/401/429/chờ đồng ý điều khoản/máy chờ duyệt. Lỗi khác bỏ và báo.

## Nợ Ponytail
- `attendance.ts`: lần chấm của người không bao giờ đăng nhập lại nằm mãi trên máy (shortcut có ghi trong code).
- `leave.service.ts`: sổ phép năm trước theo quy định hiện hành (Sau v1).

## Việc tiếp theo — vòng 2 (UAT) `[opus high]`
- `bash tools/db-reset.sh && bash tools/scale-data.sh 30`, theo `docs/TEST_WORKFLOW.md`: Console → HR → app → chấm công → đơn → duyệt → khóa kỳ →
  tính lương → phiếu (iPhone + Android emulator). Chỉ sửa P0; còn lại ghi Sau v1. Deploy một lần cuối vòng.
- Thử API mới không đụng cổng 4000 của người dùng: bật API thứ hai `API_PORT=4100` (lệnh trong `tools/dev-backend.sh`), app build trỏ 4100.
- APK Release thử local cần tạm `usesCleartextTraffic` (xem AGENTS Cạm bẫy); emulator khởi động xong máy rất tải — tắt Simulator trước.

## File cần đọc đầu tiên
- `docs/TASKS.md` (Đợt 5), `docs/TEST_WORKFLOW.md`, `docs/plans/hoan-thien-v1.md`, `AGENTS.md` (Cạm bẫy)
