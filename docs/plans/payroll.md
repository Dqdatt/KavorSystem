# Kế hoạch module Payroll (nhập kết quả lương, duyệt, phiếu lương)

> Viết bởi Claude ngày 25/10/2026 sau khi đọc PILOT_RULEBOOK §10, DATABASE_SCHEMA §11, PERMISSION_MATRIX (Payroll),
> prototype HR `page-payroll` (modal `payrollImport`) và prototype mobile `payslips`/`payslip`. Chưa có dòng code nào.
> Người làm tiếp: đọc `docs/AGENT_PLAYBOOK.md` mục 3 (khuôn module) và làm đúng thứ tự dưới đây.

## Chế độ

`final_result_import`: công ty vẫn tính lương trong Google Sheets; Kavor **nhập kết quả** (CSV xuất từ Sheet, khóa `employee_code`),
kiểm tra, duyệt, công bố phiếu lương, lưu audit. Kết nối Google Sheets trực tiếp để sau (giai đoạn này chỉ upload CSV).

## Phạm vi

**Làm:** thành phần lương theo tenant, kỳ lương theo tháng, nhập CSV có kiểm tra, danh sách lỗi (chặn) + cảnh báo (đối chiếu
với Kavor), gửi kiểm tra → duyệt → công bố → đã trả → đóng, mở lại có lý do, phiếu lương trên mobile, thông báo công bố
(**không có số tiền** — rulebook §13), đánh dấu tạm ứng đã khấu trừ khi công bố.

**Để sau:** tính lương trong Kavor, kết nối Google Sheets, PDF phiếu lương có mật khẩu, tài khoản ngân hàng, "Hỏi HR về lương"
(giữ dữ liệu cục bộ như hiện tại), xuất file ngân hàng.

## Quyền (PERMISSION_MATRIX — dữ liệu lương là quyền nhạy cảm)

Thêm permission: `payroll.self.read` (employee), `payroll.read`, `payroll.import`, `payroll.approve`, `payroll.publish`,
`payroll.cycle.reopen`. Gán mặc định cho vai trò **Kế toán** (`payroll`, đã có từ module tạm ứng): read, import, approve, publish.
`payroll.cycle.reopen` không gán mặc định (S — cấp riêng). HR/Tenant Admin/Quản lý **không** xem lương mặc định.
**Tách nhiệm vụ:** người duyệt ≠ người nhập lần cuối (chặn ở API + SQL). Audit khi xem danh sách lương / xuất file.

## Dữ liệu (migration mới, ví dụ `202610310001_payroll.sql`)

- `pay_components` (tenant, code, name, `kind` earning|deduction|net, display_order, unique (tenant, code)). Mẫu trong
  `tenant_policy_templates` + `provision_pay_components()`: BASE Lương cơ bản, ALLOWANCE Phụ cấp, OT_PAY Tiền làm thêm,
  BONUS Thưởng (earning); UNPAID_LEAVE Khấu trừ nghỉ không lương, INSURANCE Bảo hiểm, PIT Thuế TNCN, ADVANCE Trừ tạm ứng (deduction);
  NET Thực lĩnh (net).
- `payroll_cycles` (tenant, `month` YYYY-MM unique per tenant, period_start/end = kỳ công của tháng đó (`periodOf`),
  pay_date, status open|prepared|under_review|approved|published|paid|closed, imported_by/at, approved_by/at, published_by/at,
  paid_at, closed_at; reopen ghi vào bảng sự kiện). Chuyển trạng thái chỉ qua hàm SQL (khóa dòng, kiểm trạng thái trước).
- `payroll_import_batches` (cycle, file_name, total_rows, error_rows, warnings jsonb, created_by, created_at) — giữ lịch sử mọi lần nhập.
- `payroll_results` (cycle, employee, batch, gross, deduction, net, work_days numeric null, note) unique (cycle, employee);
  `payroll_result_items` (result, component, amount bigint, label null). Nhập lại chỉ khi cycle ở open/prepared/under_review:
  thay toàn bộ kết quả của cycle trong **một hàm SQL** (`replace_payroll_results(cycle, batch, rows jsonb)`).
  Từ approved trở đi: trigger chặn sửa/xóa.
- `payslip_views` (result, viewed_at) hoặc cột viewed_at — ghi lần đầu nhân viên mở phiếu.
- `salary_advances` thêm `deducted_cycle_id` (ghi khi công bố kỳ có ADVANCE tương ứng).
- Thông báo: thêm kind `payslip.published` (title "Phiếu lương 10/2026 đã công bố", body không có số tiền), link mới `payslip`.
- RLS: nhân viên đọc kết quả của mình **chỉ khi cycle đã published**; người có `payroll.read` trong phạm vi đọc tất cả.

## Nhập CSV

Header: `employee_code,<mã thành phần...>,NET[,work_days,note]`; số tiền VND nguyên (chấp nhận "15.000.000" và "15000000").
**Lỗi (chặn gửi kiểm tra):** mã nhân viên không có/không thuộc tenant, trùng dòng, ô số sai, thiếu NET,
`NET ≠ tổng earning − tổng deduction` (rulebook: chỉ để kiểm tra nhất quán), cột lạ không phải mã thành phần.
**Cảnh báo (không chặn, hiện cho Kế toán):** ADVANCE khác tổng tạm ứng **đã chi** có tháng khấu trừ = tháng kỳ; có OT_PAY nhưng không
có OT đã duyệt trong kỳ (hoặc ngược lại); `work_days` khác ngày công (`credited`) trong bảng công kỳ đó; nhân viên đang làm trong kỳ
nhưng thiếu trong file; kỳ công chưa khóa.

## API

Web (Kế toán): `GET /admin/payroll/cycles`, `POST /admin/payroll/cycles` {month, payDate}, `GET /admin/payroll/cycles/:month`
(kết quả + lỗi/cảnh báo + bước), `POST …/:month/import` {fileName, csv}, `POST …/:month/submit|approve|publish|paid|close`,
`POST …/:month/reopen` {reason}. Mobile: `GET /me/payslips` (chỉ đã công bố), `GET /me/payslips/:month` (ghi viewed).

## Web — trang "Lương & tạm ứng" (bám `page-payroll` của prototype HR)

Đổi mục menu Tài chính thành **Lương & tạm ứng** `/payroll` với tab: **Kỳ lương** (thẻ kỳ, modal "Import kết quả", 4 chỉ số
Nhân viên / Lỗi dữ liệu / Tổng thực lĩnh / Tiến độ, "Danh sách lỗi cần xử lý — phải về 0 trước khi duyệt", "Quy trình kỳ lương"
5 bước, bảng kết quả), **Tạm ứng** và **Lương cơ bản** (chuyển nguyên component từ `app/(app)/advances/page.tsx`; `/advances`
chuyển hướng sang `/payroll?tab=advances`).

## Mobile

Nhánh `REMOTE` của `payslipsSpec`/`payslipSpec` (`src/screens/money.tsx`): danh sách tháng đã công bố, "Tháng 11/2026 · chưa công bố
· dự kiến <payDate>", chi tiết Thu nhập / Khấu trừ / Thực lĩnh từ items (nhãn = tên thành phần hoặc `label`), ngày công từ `work_days`.
Giữ cổng PIN hiện có (`GATED`). Nút "Tải PDF" hiện "sẽ có ở bản sau". Nhánh mẫu/QA giữ nguyên.

## Kiểm thử

pgTAP `payroll.test.sql` (chuyển trạng thái hợp lệ/không hợp lệ, khóa sau approved, RLS nhân viên chỉ thấy khi published, tách
nhiệm vụ, thay kết quả nguyên tử); `tools/payroll-smoke.sh` (mở kỳ → nhập CSV có lỗi → sửa → cảnh báo tạm ứng/OT/ngày công →
gửi → người nhập không tự duyệt → duyệt → công bố → nhân viên thấy phiếu + thông báo không có số tiền → tạm ứng đánh dấu đã khấu trừ
→ đã trả → đóng → mở lại cần quyền + lý do). Cần thêm một tài khoản Kế toán thứ hai trong seed để thử tách nhiệm vụ.
Cuối cùng `bash tools/verify-all.sh`, build iPhone, người dùng thử, PROGRESS, commit.
