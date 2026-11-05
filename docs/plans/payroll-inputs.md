# Lương đầu vào HCNS + bảng lương đầu vào theo kỳ (giai đoạn A, B)

> Viết bởi Claude ngày 05/11/2026. Người dùng duyệt "Làm A rồi B" sau khi tham khảo quy trình thực tế của một HR:
> HCNS lập bảng lương gồm công (thực tế, tăng ca, lễ…), thông tin người lao động (STK, email, họ tên, chức vụ, phòng ban…), mức lương,
> người phụ thuộc, tình trạng (chính thức/thử việc) → Kế toán nhận file, tính lương chi tiết (BHXH, thuế TNCN, công đoàn, thực nhận)
> và dùng bảng đó khai thuế.

## Quyết định (Claude tự quyết, chờ người dùng review)

- **Quyền:** Nhân sự vận hành và Quản trị viên công ty được `compensation.read/manage` (trước đây chỉ Kế toán). Quản lý trực tiếp vẫn không
  thấy lương. Duyệt/công bố kỳ lương vẫn chỉ Kế toán (`payroll.*`). Migration `202611180001_payroll_inputs.sql`.
- **Phiên bản lương** (`employee_compensations`, bất biến): thêm lương đóng BH (trống = bằng lương cơ bản), phụ cấp cố định (một con số tổng),
  tình trạng lao động từ ngày hiệu lực (trống = theo hồ sơ). Đổi thử việc → chính thức giữa kỳ = phiên bản mới từ ngày đó.
  Không tự sửa `employees.employment_type` (hồ sơ vẫn sửa ở form nhân viên) — hai nơi có thể lệch, bảng đầu vào ưu tiên phiên bản lương.
- **MST + đoàn viên công đoàn** (`employee_tax_profiles`, sửa được, nhật ký không ghi MST). **Người phụ thuộc** (`employee_dependents`):
  tháng bắt đầu/kết thúc; hết giảm trừ thì đặt tháng kết thúc, xóa chỉ khi nhập nhầm (phải ghi lý do).
- **Bảng lương đầu vào** (`GET /admin/payroll/inputs?month=`): tính trực tiếp từ bảng công (kỳ công của công ty), phiên bản lương (tách đoạn
  khi đổi trong kỳ, công từng đoạn), nghỉ phép có/không lương, ngày lễ, OT theo hệ số, người phụ thuộc đang tính trong tháng, tạm ứng đã chi
  trừ tháng đó, tài khoản ngân hàng (số đầy đủ chỉ khi có `employee.sensitive.read`). Cảnh báo: chưa nhập lương, đổi trong kỳ, thiếu công chưa
  giải trình, giải trình chờ duyệt, chưa có tài khoản ngân hàng.
- **Chốt** (`POST …/:month/finalize`, quyền `compensation.manage` toàn công ty): bắt buộc kỳ công đã khóa; lưu ảnh chụp bất biến
  `payroll_input_sheets` (chốt lại = bản mới, bản cũ giữ). Ảnh chụp không lưu số tài khoản; khi xem đọc bản hiện hành. Client không đọc trực
  tiếp bảng này (không grant), chỉ qua API có lọc phạm vi.
- **Xuất Excel** = CSV UTF-8 có BOM (giống bảng công), cột OT theo từng hệ số có trong kỳ. Audit `payroll_input.viewed/finalized/exported`,
  `compensation.viewed` (loại tài nguyên `employee_pay` để không lấn lịch sử hồ sơ) — không ghi số tiền.

## Bổ sung 05/11: danh mục khoản phụ cấp theo doanh nghiệp + lương cứng

Người dùng (theo HR thực tế): "lương cứng" (thỏa thuận lúc phỏng vấn, ví dụ 15tr) = lương cơ bản (đóng BH) + các khoản phụ cấp/thưởng;
mỗi công ty tách khoản khác nhau → tự khai trong doanh nghiệp, **số tiền do công ty tự điền**. Tạm ứng tính trên lương cứng.

- `pay_items` (migration `202611190001_pay_items.sql`): tên, loại (phụ cấp/thưởng), cách trả (chia theo công / cố định / có điều kiện),
  tính đóng BH, thuế (chịu / không chịu / miễn đến mức công ty nhập), mức mặc định (công ty nhập, chỉ để điền sẵn). Sửa được (nhật ký
  `pay_item.*`), ngừng dùng thay cho xóa. Quản lý bằng `compensation.manage` toàn công ty. Mẫu phổ biến (7 khoản) chỉ có tên + cách tính gợi ý.
- `employee_compensation_items`: số tiền từng khoản của phiên bản lương (bất biến); `allowance` = tổng (ghi bằng `add_employee_compensation`
  nguyên khối). Dữ liệu phụ cấp một con số cũ được chuyển thành khoản "Phụ cấp khác".
- Lương cứng = `base_salary + allowance`: hiện ở hồ sơ, tab Mức lương, bảng lương đầu vào, file Excel (cột từng khoản). Hạn mức tạm ứng
  = % lương cứng (`MyAdvance.fixedSalary`; app hiện "Lương cứng").
- **Lệch với ADR 0001 (chờ review):** mức miễn thuế là luật nhà nước nhưng hiện công ty tự nhập (Kavor chưa có bảng tham số luật);
  giai đoạn C nên thay bằng tham số Kavor duy trì theo ngày hiệu lực. Danh mục khoản chưa có phiên bản theo ngày hiệu lực (sửa áp dụng
  cho cả kỳ chưa chốt); điều kiện của khoản "có điều kiện" chưa mô tả được.

## Đã làm

API `apps/api/src/payroll/inputs.service.ts`; web: mục **Lương** trong hồ sơ nhân viên (`employees/pay.tsx`), tab **Bảng lương đầu vào**
ở Lương & tạm ứng (`payroll/inputs.tsx`), modal lương dùng chung cho tab Lương cơ bản. pgTAP `payroll_inputs` 14,
smoke `tools/payroll-inputs-smoke.sh` 31 bước.

## Chưa làm / để sau

- Giai đoạn C: Kavor tự tính lương chi tiết (BHXH/BHYT/BHTN có trần, thuế TNCN lũy tiến/khấu trừ 10%, đoàn phí, thực nhận) — cần mẫu bảng
  tính của Kế toán, quy tắc công chuẩn, lương đóng BH, phụ cấp không chịu thuế; tham số luật Kavor duy trì theo ngày hiệu lực.
- Kế toán nhận thông báo khi HCNS chốt; nhân viên xem MST/người phụ thuộc của mình trên app; nhập lương/người phụ thuộc hàng loạt từ file.
- Chưa build/thử trên bản online (cần chạy migration trên cloud trước khi push API).
