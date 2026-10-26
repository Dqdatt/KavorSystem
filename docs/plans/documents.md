# Kế hoạch module Tài liệu nhân sự

> Viết bởi Claude ngày 26/10/2026 sau khi đọc PILOT_RULEBOOK §11, DATABASE_SCHEMA §12, PERMISSION_MATRIX (Xem tài liệu cá nhân,
> Upload tài liệu nhân sự, mục "Tài liệu"), USER_STORIES US-060, API_CONTRACT §10, prototype HR `page-documents` và prototype mobile
> (chỉ có toast "P05–P06: hợp đồng, quyết định và trình xem PDF" ở Hồ sơ → màn app là thiết kế bổ sung).
> Người dùng giao "cứ làm tiếp, review sau" (26/10): các quyết định dưới đây là mặc định Claude chọn, **chờ người dùng review**.

## Phạm vi

**Làm:** HR tải tài liệu gắn với một nhân viên (danh mục, tiêu đề, số văn bản, ngày hiệu lực, ngày hết hạn, quyền xem
"HR + Nhân viên" hoặc "Chỉ HR"), mỗi lần thay file là **phiên bản mới** (bất biến, giữ lịch sử), sửa thông tin, gỡ tài liệu (có lý do,
không xóa), tải từng phiên bản; mọi lần tải đều ghi audit. Nhân viên xem/tải tài liệu "HR + Nhân viên" của mình trên app
(Hồ sơ → Hợp đồng và quyết định). Chỉ số: tổng tài liệu, sắp hết hạn (30 ngày), nhân viên chưa có hợp đồng, lượt tải tuần này.

**Để sau:** "Tạo từ mẫu" (sinh hợp đồng từ mẫu), quét virus (chưa có dịch vụ — phiên bản ghi `scan_status = not_scanned`, chỉ nhận
PDF/PNG/JPEG/WebP theo byte đầu), nhắc hạn tự động (`document.expiring`), danh mục do công ty tự định nghĩa, tài liệu chung cho cả công ty
(dùng file đính kèm Bản tin), quyền xem giới hạn cho Kế toán/Kiểm soát, nhân viên tự tải hồ sơ lên. Không làm chữ ký số.

## Quyết định (Claude, chờ review)

- Một bảng `employee_documents` (mỗi tài liệu thuộc một nhân viên) + `document_versions` (bất biến). Không tách `documents` chung như
  DATABASE_SCHEMA phác thảo vì chưa có tài liệu dùng chung ngoài Bản tin.
- Danh mục cố định: Hợp đồng lao động, Phụ lục hợp đồng, Quyết định, Hồ sơ cá nhân, Bảo hiểm, Khác.
- Quyền: `document.self.read` (Nhân viên), `document.read` / `document.upload` / `document.manage` (HR Operations, Tenant Admin) theo phạm vi
  phân quyền; hàm SQL kiểm lại phạm vi (`employee_in_scope`). Tài liệu "Chỉ HR" không hiện với nhân viên.
- File ≤ 5 MB ở bucket riêng tư `employee-documents`; web tải qua route Next cùng origin; app mở bằng trình duyệt hệ thống qua liên kết
  ký 5 phút (dùng chung cơ chế với Bản tin, chữ ký có tiền tố theo loại tài nguyên). Lưu SHA-256 mỗi phiên bản.
- "Sắp hết hạn" = hết hạn trong 30 ngày tới theo ngày của công ty.

## Thứ tự

migration `202611020001_documents.sql` → pgTAP → contracts → API `apps/api/src/documents/` → `tools/documents-smoke.sh` →
web `/documents` (bám `page-documents`) → mobile màn "Hợp đồng và quyết định" (nhánh REMOTE) → verify-all → PROGRESS.
