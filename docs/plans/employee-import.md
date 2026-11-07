# Nhập nhân viên hàng loạt (web HR)

Người dùng giao (26/10, phiên cloud): "cứ làm tiếp, done thì push". Module tiếp theo sau Cơ cấu tổ chức + Phân quyền vì công ty mới không thể thêm
từng người một. Quyết định dưới đây là **mặc định do Claude chọn**, chờ review.

Nguồn: `PERMISSION_MATRIX.md` §4 ("Import nhân viên": HR Ops ✓, Tenant Admin ✓); AGENTS.md (Google Sheets chỉ là nguồn import, Supabase là dữ liệu
vận hành); prototype HR page-organization có nút "Import" (chưa có màn) → thiết kế bổ sung trên trang Nhân viên.

- Định dạng: CSV UTF-8 (Excel "CSV UTF-8", Google Sheets "Tải xuống → CSV"); chưa đọc trực tiếp .xlsx hay kết nối Google Sheets.
- Cột (dòng tiêu đề bắt buộc, thứ tự tùy ý): `employee_code`, `full_name`, `work_email`, `hire_date`, `employment_type`, `department_code`,
  `position_code` (bắt buộc); `phone`, `manager_code` (không bắt buộc). Ngày `YYYY-MM-DD` hoặc `DD/MM/YYYY`; loại hợp đồng nhận mã
  (`official`…) hoặc chữ ("Chính thức", "Thử việc", "Cộng tác viên", "Thực tập"). File mẫu: `sample-data/employees_import_sample.csv`.
- Hai bước: tải file → xem trước từng dòng (Tạo mới / Đã có — bỏ qua / Lỗi + lý do) → "Nhập". Chỉ nhập khi **cả file không có lỗi**; ghi nguyên khối
  trong một transaction (`import_employees`). Mã nhân viên đã có thì bỏ qua (nhập lại cùng file không tạo trùng, không sửa hồ sơ cũ).
- Kiểm tra: bắt buộc, định dạng, trùng mã/email trong file, email đã dùng ở hồ sơ khác, phòng ban/chức danh tồn tại và còn hoạt động, phòng ban nằm
  trong phạm vi `employee.create` của người nhập, quản lý có sẵn hoặc có trong file, giới hạn nhân sự của gói (tính cả số dòng tạo mới). Tối đa 1.000 dòng.
- Không gửi lời mời tự động (HR gửi từng người hoặc làm "gửi lời mời hàng loạt" sau). Audit: một dòng `employee.imported` (tên file, số dòng) + mỗi
  hồ sơ một dòng `employee.created` nguồn import (không chép email/điện thoại vào audit tổng).
- Chưa có: cập nhật hồ sơ cũ bằng file, đọc .xlsx, đồng bộ Google Sheets định kỳ, nhập lương cơ bản/tài khoản ngân hàng.

## Giai đoạn 1 — nhận file bất kỳ (06/11/2026, thay phần "Định dạng/Cột" ở trên)

Lý do: khách không làm lại bảng theo mẫu; mỗi công ty quản trị một kiểu → nhận dạng theo quy tắc chung, không theo file của một khách.

- File: `.xlsx` (đọc trực tiếp, không thư viện ngoài — `apps/api/src/admin/import/spreadsheet.ts`), `.csv/.tsv/.txt` (UTF-8/UTF-16/Windows-1258,
  dấu `,` `;` tab). `.xls` cũ: báo lưu lại thành .xlsx. Tối đa 5 MB, 1000 người mới/lần.
- Nhận dạng (`import/detect.ts`, thuần, có unit test nhiều kiểu file): mỗi sheet tìm dòng tiêu đề (25 dòng đầu, cần cột họ tên); khớp cột bằng từ điển
  đồng nghĩa bỏ dấu Việt/Anh, cột lạ đoán email/điện thoại theo nội dung cả cột; cột đã nhận ra nhưng chưa lưu (ngày sinh, CCCD, ngân hàng, lương…)
  hiện "chưa nhập ở bước này". Sheet chỉ có tên + mã = bảng tra mã. Sheet tên "đã nghỉ việc", trạng thái nghỉ việc, ngày nghỉ đã qua → bỏ qua.
- Giá trị: ngày nhiều dạng + số ngày Excel; ngày/tháng hay tháng/ngày quyết theo cả file, không phân biệt được thì hỏi HR; SĐT mất số 0/+84;
  loại hợp đồng chữ tự do ("1 năm", "HĐTV"…), ngày chính thức còn ở tương lai = thử việc.
- Chỉ chặn khi thiếu họ tên/phòng ban/ngày vào làm hoặc ngày sai. Không có mã → khớp hồ sơ có sẵn theo tên, bảng tra, hoặc tự đặt `NV0001…`;
  email/SĐT sai, email trùng, quản lý không xác định → cảnh báo và bỏ trống (nhập được, bổ sung sau). Không có chức danh → "Nhân viên".
- Phòng ban/chức danh: khớp mã hoặc tên; chưa có → tạo mới cùng transaction (`import_employees_with_units`, hiệu lực từ ngày vào làm sớm nhất);
  viết tắt (MKT/Marketing, GT/Kênh GT, HCNS) được đề xuất gộp, HR đổi được. Nhiều chi nhánh → HR chọn chi nhánh cho phòng ban mới.
- Nhớ cách khớp theo công ty (`employee_import_mappings`: tên cột chuẩn hóa → trường, tên đơn vị → mã; không lưu dữ liệu người).
- Giai đoạn 2 (chưa làm): ngày sinh, giới tính, CCCD, địa chỉ, ngân hàng (4 số cuối), lương (chỉ khi có `compensation.*`), lịch sử hợp đồng.

## Giai đoạn 1b (06/11/2026)

- Người đã nghỉ (sheet "đã nghỉ việc", trạng thái nghỉ, ngày nghỉ đã qua) được **nhập làm hồ sơ tra cứu** (mặc định bật, tắt được ở màn xem trước):
  `status = terminated`, ngày nghỉ, phân công đóng tại ngày nghỉ; không tính vào gói, không gửi lời mời. Thiếu dữ liệu → bỏ qua dòng đó (không chặn
  file); trùng người đang làm (tái tuyển) → giữ dòng đang làm; mã chấm công dùng lại cho người khác → đặt mã mới. Đơn vị chỉ có người đã nghỉ được
  tạo ở trạng thái đã ngừng (khớp lại đơn vị đã ngừng khi nhập lần sau).
- **Hệ cấp bậc chuẩn** (`inferTier` ở contracts): Nhân viên/Staff → Trưởng nhóm/Team Lead → Quản lý/Manager → Ban Giám đốc/Director, suy từ tên chức
  danh Việt/Anh (từ chức vụ đứng đầu tiếng Việt; tiếng Anh ở bất kỳ vị trí). Chức danh mới nhận cấp suy ra; chức danh có sẵn chưa đặt cấp được đặt
  (không ghi đè cấp đã có). HR đổi cấp ở màn xem trước.
- **Tự gán quản lý trực tiếp** khi file không có cột quản lý: người cấp cao hơn gần nhất trong cùng phòng (Nhân viên → Trưởng nhóm → Quản lý); phòng
  không có ai cao hơn → Ban Giám đốc nếu công ty chỉ có một người; nhiều người cùng cấp → không đoán, cảnh báo để HR chọn.

## Giai đoạn 2 — hồ sơ chi tiết (07/11/2026)

- Trường mới: ngày sinh, giới tính, CCCD (số, ngày cấp, nơi cấp), thường trú, địa chỉ hiện tại, số sổ BHXH (`employee_profiles`), mã số thuế
  (`employee_tax_profiles`), tài khoản ngân hàng (`employee_bank_accounts`), lương cơ bản + lương đóng BHXH (phiên bản lương đầu tiên, hiệu lực từ ngày vào làm).
- **Chỉ điền chỗ đang trống**, không ghi đè dữ liệu đã có/đã duyệt; lương chỉ tạo khi nhân viên chưa có phiên bản nào. Người đã có trong Kavor mà file có
  thêm thông tin → "Bổ sung hồ sơ" (nhập lại file cũ để điền thông tin còn thiếu).
- Quyền: giấy tờ/BHXH/thuế/ngân hàng cần `employee.sensitive.read`, lương cần `compensation.manage` (toàn công ty); thiếu quyền thì bỏ cột đó + thông báo,
  không chặn. Xem trước không hiện giá trị mẫu của cột nhạy cảm; audit không chép giá trị.
- Chuẩn hóa: CCCD/sổ BHXH mất số 0 đầu → thêm lại; số dạng `8.96E9` → chữ số; tiền chữ tự do ("15tr", "12,000,000 + KPI", "Từ 1/11: LCB …") lấy mức đầu
  tiên ≥ 100.000, nhiều mức theo ngày thì cảnh báo kiểm lại. Lương thử việc, phụ cấp, lịch sử hợp đồng: chưa nhập (hiện "chưa nhập ở bước này").
