# Quy chế lương theo từng công ty + danh mục giấy tờ hồ sơ (sau feedback HR C&B)

> Viết bởi Claude ngày 10/11/2026 sau feedback của một HR chuyên C&B (quy trình tính lương "nhân viên A – chính thức", thử việc, giấy tờ hồ sơ),
> cập nhật cùng ngày theo câu trả lời của người dùng. Nguyên tắc: cách làm trong feedback là **mặc định**, công ty sửa được trong cài đặt
> (ADR 0001) — không viết cứng theo một công ty. **Chưa code.**

## 1. Tên gọi (người dùng chốt 10/11)

**Lương cứng** = mức thỏa thuận khi nhận việc (ví dụ 15tr) = **lương đóng BHXH** + **các khoản phụ cấp**. Từ lương cứng, theo công, OT, … tính ra
**lương thực lĩnh**. Trùng với cách Kavor đang hiển thị ("Lương cứng = cơ bản + phụ cấp") → giữ chữ "Lương cứng", chỉ đổi nhãn "Lương cơ bản"
thành **"Lương đóng BHXH"** ở form lương, bảng lương đầu vào, phiếu lương. Ô "lương đóng BH khác lương cơ bản" (đang có) gộp lại: lương đóng BHXH
= cơ bản + khoản phụ cấp có tính BH (xem 3.4), không cho nhập tay thêm một con số thứ ba (bớt chỗ lệch).

## 2. Đối chiếu ví dụ trong feedback

Lương cứng 10tr = đóng BHXH 7tr + cơm trưa 730k + điện thoại 1,5tr + xăng xe 770k; công 25/27.
- Gross = 10.000.000 ÷ 27 × 25 = **9.259.259** (feedback ghi 9.239.259 — lỗi gõ), BHXH 10,5% × 7tr = 735.000, đoàn phí theo % công ty
  (feedback 35.000 = 0,5%), thuế 0 → thực lĩnh **8.489.259** (feedback ghi 8.469.259). Dùng số đúng làm ca unit test.
- Kavor hiện tính được ca này nếu mọi khoản để "theo công"; chỉ lệch vài đồng do làm tròn từng dòng (xử lý ở 3.2).

## 3. Thay đổi

Cài đặt lương đổi từ JSON một bản (`tenant_settings.payroll_settings`) sang **phiên bản quy chế lương** (`payroll_policy_versions`: `tenant_id`,
`effective_from`, `settings jsonb`, bất biến khi đã hiệu lực, giống `payroll_law_versions`), tra theo ngày cuối kỳ; dữ liệu cũ thành phiên bản đầu;
kỳ lương đã tính lưu ảnh chụp quy chế đã dùng.

### 3.1 Công chuẩn = theo lịch làm việc (người dùng chốt)
- Giữ cách hiện tại: số ngày làm việc theo ca trong kỳ — ca đã chọn được T2–T6 hoặc T2–T7 (`shift_versions.work_days`), công ty làm T7 thì công chuẩn tự lớn hơn.
- **Đổi:** ngày lễ rơi vào ngày làm việc **tính vào cả công chuẩn và công thực tế** (feedback: "công thực tế đã có ngày lễ"; luật: lễ là ngày nghỉ hưởng
  lương). Hiện lễ bị loại khỏi cả hai → tháng đi đủ thì như nhau, nhưng thiếu công thì người lao động bị thiệt một chút. Sửa ở `summarize`
  (`timesheet/compute.ts`) để bảng công, bảng lương đầu vào, kỳ lương cùng một số. Không làm "cố định 26" khi chưa có công ty cần.
- **Thêm T7 nửa ngày** (rà soát luật: nhiều công ty trừ nửa ngày T7 khi tính công chuẩn): ca cho đánh dấu ngày làm nửa ngày → 0,5 công chuẩn,
  chấm đủ buổi = 0,5 công.

### 3.2 Làm tròn
Thêm lựa chọn **"chia theo công trên tổng"**: (đóng BHXH + khoản "theo công") ÷ công chuẩn × công thực tế, làm tròn một lần; phiếu vẫn tách dòng
theo tỷ lệ, dòng cuối nhận phần lẻ → khớp từng đồng với Excel kiểu feedback. Mặc định bật.

> **Sau rà soát luật 10/11** (`payroll-law-research-2026-11.md`) các mục 3.3–3.7 đã sửa lại.

### 3.0 Sửa tham số luật Kavor — **đã làm 10/11** (`202611300001_payroll_law_fix.sql`; trang phục 5tr/năm và lương ngày phép không nghỉ chưa làm)
Migration sửa dữ liệu phiên bản 01/01/2026 + 01/07/2026 (tạm bỏ guard, ghi lý do): đoàn phí **0,5%** (từ 01/07/2025); ngưỡng khấu trừ 10% **5tr**
từ 01/07/2026; đánh dấu biểu thuế 5 bậc `verified: true`. Thêm tham số mới: miễn thuế ăn giữa ca (1,2tr/tháng từ 01/07/2026, trước đó 730k),
tiền trang phục (5tr/năm), OT/làm đêm **miễn toàn bộ** trong giới hạn giờ luật lao động (kỳ tính thuế 2026), lương ngày phép không nghỉ miễn thuế.
Bộ tính `cycle-calc.ts` đổi OT: hết "chỉ miễn phần chênh lệch". Kỳ lương đã tính trước đó không tự tính lại; Kế toán tính lại kỳ chưa công bố.

### 3.3 Đoàn phí (sửa: Kavor duy trì tỷ lệ, công ty bật/tắt)
Tỷ lệ do Tổng LĐLĐ quy định chung (0,5% lương đóng BHXH, trần 10% lương cơ sở) → nằm ở tham số luật, không để công ty tự nhập (dễ sai).
Quy chế lương công ty: **"Có công đoàn cơ sở, thu đoàn phí qua lương"** bật/tắt; đoàn viên đánh dấu từng người (đã có). Cho ghi đè tỷ lệ chỉ khi bật
"mức riêng" kèm cảnh báo. Không thu khi nhân viên nghỉ không lương/hưởng BHXH cả tháng. KPCĐ 2% phía công ty luôn tính (kể cả chưa có công đoàn cơ sở).
*Người dùng đã muốn "công ty tự nhập %" — chờ đồng ý đổi.*

### 3.4 Phụ cấp tính BHXH (sửa: theo ý người dùng)
Luật BHXH 2024 Điều 31 + NĐ 158/2025 Điều 7, BHXH TP.HCM xác nhận: khoản **cố định, ghi trong HĐLĐ, trả đều mỗi kỳ** (kể cả cơm trưa, điện thoại)
tính đóng BHXH; khoản theo năng suất/chất lượng (chuyên cần, KPI…) không tính. Kavor:
- Mặc định "Tính đóng BH" theo cách trả: **cố định / theo công → có**, **có điều kiện → không**; công ty vẫn sửa được từng khoản (cơ quan BHXH các nơi
  hiểu khác nhau), nhưng tắt BH cho khoản cố định thì hiện cảnh báo "có rủi ro truy thu theo NĐ 158/2025".
- Lương đóng BHXH = lương cơ bản + khoản có BH (đã vậy khi để trống).
- Không ảnh hưởng thuế: thuế từng khoản vẫn riêng (cơm trưa miễn đến 1,2tr, xăng xe cố định chịu thuế…).
- Báo lại HR: ví dụ 7tr đóng BHXH + 3tr phụ cấp cố định có rủi ro theo cách hiểu mới.

### 3.5 Thử việc (người dùng chốt 85% lương cứng, không phụ cấp — giữ, sửa phần BH/thuế)
- Phiên bản lương ghi **lương cứng chính thức**; khi thử việc: lương = **tỷ lệ × lương cứng** × công thực tế ÷ công chuẩn, **một dòng**, không dòng phụ cấp.
  Cách này an toàn với BLLĐ Điều 26 (sàn 85% "tiền lương" — Điều 90 tính cả phụ cấp). `probationRate` mặc định 85%, **nhập dưới 85% bị chặn**;
  `probationAllowances` mặc định tắt (luật không bắt bỏ phụ cấp — là lựa chọn công ty).
- **BH và thuế khi thử việc phụ thuộc loại hợp đồng, không phải cài đặt chung của công ty:** thêm ở hồ sơ/phiên bản lương "Hình thức thử việc":
  - *Hợp đồng thử việc riêng* → không đóng BH; khấu trừ 10% nếu từ 5tr/lần (trừ khi có cam kết 08/CK-TNCN).
  - *Thử việc trong HĐLĐ* (từ 1 tháng) → **đóng BH** từ ngày đầu; thuế lũy tiến nếu HĐ từ 3 tháng.
  Mặc định của công ty chỉ là giá trị điền sẵn. Bỏ lựa chọn `probation: insured|withholding` hiện tại (chuyển thành mặc định điền sẵn).
- Thêm cờ **cam kết 08/CK-TNCN** ở hồ sơ thuế (yêu cầu có MST) → không khấu trừ 10%.
- **Dữ liệu cũ:** phiên bản lương "thử việc" có thể đã nhập mức đã giảm → áp 85% sẽ giảm hai lần. Migration không đổi số; bảng lương đầu vào cảnh báo các
  phiên bản thử việc tạo trước ngày đổi để HR kiểm.

### 3.6 Thực tập (sửa ngưỡng)
Không HĐLĐ hoặc HĐ dưới 3 tháng → không đóng BH, khấu trừ 10% khi chi **từ 5tr/lần** (từ 01/07/2026; trước đó 2tr), dưới mức chỉ khấu trừ khi cá nhân
yêu cầu (thêm cờ "yêu cầu khấu trừ"). Có cam kết 08 → không khấu trừ. Nhận phụ cấp như chính thức.

### 3.7 Không hưởng lương từ 14 ngày
Giữ quy tắc không đóng BH tháng đó (Luật 2024 Điều 33 k5); để sau: cờ "thỏa thuận vẫn đóng" theo nhân viên/tháng.

## 4. Danh mục giấy tờ hồ sơ (checklist)

- `document_checklist_items` (theo công ty): tên, bắt buộc hay không, áp dụng cho tình trạng lao động nào, thứ tự, ngừng dùng thay cho xóa.
  Mẫu gợi ý (công ty sửa tự do): Sơ yếu lý lịch, CCCD (bản sao), Giấy khám sức khỏe, Bằng cấp/chứng chỉ, Xác nhận cư trú (CT07), Ảnh 3×4,
  Sổ BHXH, Mã số thuế cá nhân, Thông tin tài khoản ngân hàng, Quyết định thôi việc nơi cũ, Hồ sơ người phụ thuộc.
- `employee_checklist_status`: nhân viên × mục → `submitted` (ngày nộp, người tích, **bản sao / đã đối chiếu bản chính** — BLLĐ Điều 17 cấm giữ bản
  chính) / `waived` (không áp dụng, lý do); không có dòng = chưa nộp.
- Luật Bảo vệ dữ liệu cá nhân 2025: mỗi mục có ghi chú mục đích thu thập; khi nhân viên nghỉ việc nhắc HR xử lý bản sao không còn cần lưu.
  Tùy chọn gắn một tài liệu đã tải. Nhật ký `checklist.*`.
- Web: tab **Giấy tờ** trong hồ sơ nhân viên (tích nhanh), bộ lọc "Thiếu giấy tờ" ở danh sách nhân viên, cài đặt danh mục ở Cài đặt doanh nghiệp.
  Quyền dùng lại `document.read/manage`. Mobile (sau): nhân viên xem mục còn thiếu.

## 5. Thứ tự làm (khuôn module)

0. **Phần 0 – sửa tham số luật (3.0)** — ưu tiên vì công thức hiện tại đang tính sai đoàn phí, ngưỡng 10%, miễn thuế OT/cơm trưa.
1. **Phần A – checklist giấy tờ — đã làm 11/11** (migration `202612010001_document_checklist.sql`, `tools/checklist-smoke.sh`; route API `checklist/*`, `employees/:id/checklist`): migration + pgTAP → contracts → API → smoke → web.
2. **Phần B – quy chế lương — đã làm 11/11 (trừ T7 nửa ngày)** (migration `202612020001_payroll_policy.sql`): migration (`payroll_policy_versions`, cờ cam kết 08) → `compute.ts` (ngày lễ) → `cycle-calc.ts` (chia trên tổng, đoàn phí %,
   thử việc 85%) với unit test: ca feedback (ra 9.259.259 / 735.000 / thuế 0), thử việc 85% × 15tr không phụ cấp, thực tập trên/dưới 2tr, tháng có lễ
   → web (Cài đặt → Lương, nhãn "Lương đóng BHXH") → `payroll-compute-smoke.sh` mở rộng.
3. **Phần C – tham số luật:** đối chiếu đoàn phí, danh sách khoản thuộc căn cứ đóng BHXH.
4. Mỗi phần: `bash tools/verify-all.sh`, cập nhật PROGRESS, chạy migration cloud trước khi push.
