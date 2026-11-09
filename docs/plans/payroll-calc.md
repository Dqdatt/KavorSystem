# Kavor tự tính lương (lộ trình giai đoạn 1 — `roadmap-competitive.md`)

## Phần 1 — tham số luật + bộ tính (08/11/2026, đã làm)

- **Tham số luật do Kavor duy trì** (`payroll_law_versions`, không thuộc công ty nào): lương cơ sở, lương tối thiểu vùng I–IV, tỷ lệ BHXH/BHYT/BHTN
  người lao động + công ty, hệ số trần (BHXH/BHYT × lương cơ sở, BHTN × lương tối thiểu vùng), giảm trừ bản thân/người phụ thuộc, biểu thuế lũy
  tiến, khấu trừ 10% thời vụ, đoàn phí. Phiên bản theo ngày hiệu lực; đã/đang hiệu lực thì bất biến (trigger), sửa = phiên bản mới. Mỗi mục có
  nguồn + `verified`; mục chưa đối chiếu văn bản gốc hiện "Cần đối chiếu" ở Console và kết quả tính.
- Phiên bản có sẵn: 01/01/2026 và 01/07/2026 (lương cơ sở 2.530.000, trần BHXH 50,6 triệu). **Cần đối chiếu:** thuế suất biểu 5 bậc (Điều 9
  Luật 109/2025/QH15 — nguồn tin lệch nhau), ngưỡng khấu trừ 10% thời vụ.
- **Bộ tính** `apps/api/src/payroll/calc.ts` (thuần, có unit test): gross → BH NLĐ (trần) → đoàn phí (trần 10% lương cơ sở) → thu nhập chịu thuế
  (trừ khoản miễn) → giảm trừ → thuế lũy tiến / 10% thời vụ → tạm ứng → thực nhận; chi phí công ty (BH + KPCĐ 2%). Mỗi dòng có công thức.
  Đoàn phí chưa trừ khi tính thuế; lương đóng BH thấp hơn lương tối thiểu vùng chỉ cảnh báo.
- Console **Tham số luật lương** (Quản trị Console tạo/sửa phiên bản tương lai, ai cũng tính thử); web HR **Lương & tạm ứng → Tính thử lương**
  (quyền xem lương). API: `GET/POST/PATCH /console/payroll-law`, `POST /console/payroll-law/preview`, `GET /admin/payroll/law`, `POST /admin/payroll/calc-preview`.

## Phần 2 — Kavor tính kỳ lương (08/11/2026, đã làm)

- **Mỗi công ty tự cấu hình** (Kavor không áp mẫu): khoản phụ cấp/thưởng (`pay_items`: theo công / cố định / chuyên cần, có tính BH, chịu thuế /
  miễn / miễn đến mức), công chuẩn + kỳ công (chấm công), lương từng người; thêm **Cài đặt doanh nghiệp → Lương**: vùng lương tối thiểu, thử việc
  (không đóng BH + khấu trừ 10% — mặc định, hoặc đóng BH như chính thức) — `tenant_settings.payroll_settings`.
- **Bộ tính một dòng** `apps/api/src/payroll/cycle-calc.ts` (thuần, có test): lương theo công từng đoạn; khoản theo danh mục (chuyên cần cần đủ công,
  không trễ, không thiếu chấm công, không nghỉ không lương); OT = lương giờ (cơ bản ÷ công chuẩn ÷ 8) × giờ × hệ số, phần trên giờ thường miễn thuế;
  lương đóng BH = mức trong phiên bản lương, trống thì cơ bản + khoản có BH; không hưởng lương từ 14 ngày làm việc → tháng đó không đóng BH;
  rồi bộ tính luật (phần 1).
- **Kỳ lương → Kavor tính lương** (quyền nhập kỳ + xem lương): cần bảng lương đầu vào đã chốt; xem trước từng người + từng khoản có công thức; ghi =
  `record_payroll_import` + `replace_payroll_results` như nhập file (thành phần BASE, ITEM_…, OT_PAY, INS_*, UNION_FEE, PIT, ADVANCE, NET tự tạo),
  công thức nằm ở nhãn từng dòng phiếu → luồng gửi kiểm tra / duyệt / công bố / phiếu lương trên app giữ nguyên. Audit `payroll.computed`.
- Kiểm thử: `bash tools/db-reset.sh && bash tools/payroll-compute-smoke.sh`.

## Phần 3 trở đi (chưa làm)
Vùng theo từng chi nhánh (hiện một vùng cho cả công ty); lương thử việc riêng (hiện dùng mức lương của phiên bản); phiếu lương trên app hiện công thức
rõ hơn (hiện ở nhãn dòng); so sánh với file Excel của Kế toán; xuất file ngân hàng + D02.
