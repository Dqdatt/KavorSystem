# Kế hoạch hoàn thiện Kavor v1

> Viết 16/11/2026 (Claude, phiên 17). Trạng thái từng việc nằm ở `docs/TASKS.md` (chia theo đợt dưới đây); file này giữ
> định nghĩa "xong", luật phạm vi và thứ tự. Đổi phạm vi v1 = sửa file này, có người dùng đồng ý.

## Vì sao cần

- 16 phiên, ~180 commit. Mỗi lần review hoặc so prototype lại sinh thêm việc (review 16/11: +24 việc), không có mốc "xong"
  nên danh sách không ngắn lại.
- Bản online đã có dữ liệu thật (1 công ty, 30 nhân viên) trong khi còn lỗ hổng đã biết: MFA bị lách → đọc được lương/CCCD;
  trần 1000 dòng sẽ cắt bảng công khi 30 người chấm đủ một tháng (~1.300 lượt) → khóa kỳ sai → lương sai.

## v1 là gì

Một công ty 30–100 nhân viên dùng thật trọn một kỳ: chấm công → đơn → bảng công → khóa kỳ → Kavor tính lương →
công bố phiếu trên app, **không lộ dữ liệu, không sai số, không mất dữ liệu**. Giao diện hiện tại coi là đủ dùng.

**Xong v1 khi đủ cả 4:**
1. Mọi việc của Đợt 1–4 (sau khi cắt phạm vi 17/11) đã đánh dấu xong trong `docs/TASKS.md`, `verify-all.sh` đạt, đã deploy.
2. Đợt 5 (chạy thử trọn vòng) không còn lỗi P0.
3. Các mục "Cần người dùng chốt" đã có câu trả lời.
4. Không còn việc P0 nào mở.

## Luật để không sửa hoài

1. **Phạm vi v1 đóng.** Phát hiện mới phân loại ngay:
   - **P0** = sai tiền/công, lộ dữ liệu, mất dữ liệu, crash luồng chính → thêm vào đợt đang làm.
   - Còn lại → `docs/TASKS.md` mục "Sau v1". Không làm trước khi xong v1, trừ khi đang sửa đúng chỗ đó và thêm < 5 dòng.
2. **Không review toàn dự án, không so prototype** cho tới hết v1. Mỗi đợt chỉ review diff của đợt
   (phiên chính tự review phần nhạy cảm, `kiemtra` phần thường).
3. **Mỗi phiên làm một đợt (hoặc một mục lớn)** có tiêu chí xong; cuối phiên: verify-all → commit → đánh dấu TASKS → HANDOFF.
4. **Deploy:** Đợt 1 deploy ngay từng mục (dữ liệu thật đang online); đợt khác deploy cuối đợt. Đợt 2 phải lên online
   trước khi công ty thật khóa kỳ công tháng 12.
5. **Tính năng mới** (giai đoạn 2–5 của `roadmap-competitive.md`) chỉ bắt đầu sau v1, theo phản hồi của công ty dùng thật.

## Các đợt (thứ tự cố định, ước 11–15 phiên)

> **Cắt phạm vi 17/11/2026 (người dùng đồng ý):** Đợt 1–2 đã xong + deploy. Để xong v1 trong 2 vòng nữa, Đợt 3–4 chỉ còn việc P0
> (vòng 1), Đợt 5 là vòng 2; phần còn lại của Đợt 3–4 chuyển "Sau v1" trong `docs/TASKS.md`. Mỗi vòng deploy một lần cuối vòng.

### Đợt 1 — Bảo mật · 3–4 phiên · phiên chính, Opus xhigh
1. Deploy `a6d559e` (migration `202612070001` lên cloud trước, rồi push).
2. MFA bị lách + CCCD/BHXH + payload đơn sửa hồ sơ: thu SELECT của `authenticated` trừ 7 bảng Realtime, `/api/realtime` từ chối aal1.
3. Đăng nhập: `trust proxy`, `forgotPassword` lộ email, `ilike` không escape; `next=/\evil.com` ở web HR + Console.
4. Phân quyền nhỏ: khóa/mời theo `membership.*`, nhắc chấm công, lý do nghỉ trong lịch theo phạm vi.

Xong khi: pgTAP chứng minh token aal1 không đọc được bảng nào ngoài 7 bảng Realtime và aal2 chỉ đọc đúng phạm vi;
smoke giả `X-Forwarded-For` không lách được giới hạn thử; đã deploy, kiểm online chỉ xem.

### Đợt 2 — Đúng số công/lương · 3–4 phiên · phiên chính, Opus xhigh
1. `decide_approval` duyệt 2 lần bỏ qua bước sau.
2. Trần 1000 dòng: helper phân trang chung + chia lô `.in()` ≤ 100 id; **bộ dữ liệu ≥ 30 NV đủ một tháng công** (dùng lại ở Đợt 5).
3. Race tạo dữ liệu: đơn nghỉ trùng/vượt số dư, chấm công 2 lần, giải trình vượt hạn mức.
4. Phép tồn năm trước thiếu.
5. Sửa hồ sơ NV gom một RPC (kiểm phạm vi trước khi ghi).

Xong khi: smoke 30+ NV khóa kỳ ra đúng tổng công/lương; có test gọi song song cho duyệt và đơn nghỉ; đã deploy.

### Đợt 3 + 4 — vòng 1: P0 còn lại · 1 phiên · phiên chính Opus high, phần nhỏ giao `laptrinh`
1. Mobile: crash offline `reqItems`; widget mô phỏng sửa `S.clockIn`; hàng đợi chấm công offline gắn NV + xóa khi đăng xuất + giữ lỗi tạm thời
   (race `enqueue`/`flushQueue`).
2. Web/API: `mailer` báo lỗi khi không gửi được thư mời/OTP; CSV xuất chặn công thức `= + - @`.

Xong khi: verify-all đạt; trên iPhone 11 và Android emulator: mất mạng mở app bấm đơn/thông báo không crash, chấm offline → đăng xuất →
người khác đăng nhập thì không gửi hộ; build cài lên iPhone; đã deploy.

### Đợt 5 — vòng 2: chạy thử trọn vòng · 1 phiên
Trên DB local, công ty mẫu ≥ 30 NV, một tháng công (`tools/scale-data.sh 30`), theo `docs/TEST_WORKFLOW.md`: Console tạo công ty →
HR nhập NV → mời → app kích hoạt → chấm công (iPhone + Android emulator) → đơn nghỉ/OT/giải trình/tạm ứng → duyệt →
khóa kỳ → bảng lương đầu vào → Kavor tính → duyệt → công bố → phiếu trên app.
Mỗi lỗi phân loại theo luật 1. Xong khi: trọn vòng không có P0, kết quả ghi vào PROGRESS.

## Cần người dùng chốt (không phải code, trước Đợt 5)

1. Công ty online `TS-3010` (30 NV) có phải công ty pilot không; ngày họ khóa kỳ công đầu tiên (đặt hạn cho Đợt 2).
2. Bản đồ production (mạng VNPT chặn OSM): mua key dịch vụ bản đồ VN, hay v1 chỉ nhập tọa độ lấy từ điện thoại tại chỗ.
3. Tham số luật đang "Cần đối chiếu" (thuế suất biểu 5 bậc, ngưỡng khấu trừ 10% thời vụ): Kế toán/chuyên gia xác nhận trước kỳ lương thật.
4. Dữ liệu cá nhân thật đang lưu ở Singapore: cần người hiểu luật xác nhận thủ tục chuyển dữ liệu ra nước ngoài.
5. Phạm vi "phòng ban" có gồm phòng ban con không.
6. `roadmap-competitive.md`: giữ làm định hướng sau v1 (phần "Hiện trạng" đã cũ — Kavor đã tự tính lương) hay bỏ.

## Đóng băng sau v1

- Các việc "(Tùy chọn)" trong TASKS; thời hạn thử việc → "hết thử việc".
- Lệch prototype còn lại: P3 trang Lương, thẻ tóm tắt hồ sơ, Tính thử tự cập nhật, xem trước/yêu cầu tài liệu, Ctrl K,
  phân trang Ngày lễ, sửa dòng lỗi trong hộp nhập file.
- Hiệu năng: N+1 bảng phép/bản tin, đọc toàn bộ lịch sử đơn, đếm exact, mời hàng loạt tuần tự (đủ cho ≤ 100 NV).
- Console: chữ < 12px, `PageActions`, gộp `kit.tsx`/`client.ts` vào `@kavor/web-ui`.
- Dọn code (`/ponytail ultra`).
- "Vấn đề còn tồn tại" trong PROGRESS không có tên ở Đợt 1–5.
- Lộ trình cạnh tranh giai đoạn 2–5 (hợp đồng, xếp ca, nghỉ việc trọn gói, push/Zalo, AI), file ngân hàng/D02,
  staging và dịch vụ trả phí (mua khi xong v1, theo quyết định 24/10).
