# Kế hoạch: Đề nghị sửa hồ sơ nhân viên

> Viết bởi Claude ngày 26/10/2026. Prototype mobile: nút "Đề nghị sửa thông tin" + sheet `editProfile`, đơn mẫu HS-0221 "Đổi tài khoản
> ngân hàng". Prototype HR: đơn sửa hồ sơ duyệt ở "Phê duyệt" (HR_COVERAGE_AUDIT §2).

## Người dùng chốt (26/10/2026)

1. Trường nhân viên được đề nghị sửa: **điện thoại, email cá nhân, địa chỉ, liên hệ khẩn cấp** (tên, điện thoại, quan hệ).
2. **Số tài khoản ngân hàng là thông tin hồ sơ nhân viên**, sửa cùng đề nghị này (không phải luồng chuyển khoản/ngân hàng riêng).
3. **HR duyệt** là chính; **Kế toán chỉ đọc lại** thông tin chính xác HR đã duyệt.

## Quyết định kỹ thuật (Claude)

- Loại đơn mới `profile_change` (tiền tố HS) dùng khung đơn + luồng duyệt sẵn có; mẫu luồng: một bước HR (48 giờ). Mỗi nhân viên một
  đề nghị đang chờ (giống prototype: "đang có đề nghị chờ duyệt, chưa sửa tiếp được").
- Duyệt xong mới áp vào hồ sơ (trigger SQL cùng transaction duyệt); thông tin cũ giữ hiệu lực đến lúc đó. Nội dung đơn (bất biến) giữ
  giá trị trước/sau để HR so sánh và làm lịch sử.
- Số tài khoản là dữ liệu nhạy cảm (PERMISSION_MATRIX: mask PII): lưu riêng (`employee_bank_accounts`, `profile_change_bank`), nội dung đơn chỉ
  có 4 số cuối. Xem số đầy đủ: chính nhân viên, và người có `employee.sensitive.read` trong phạm vi (HR Operations, Tenant Admin, Kế toán).
  Quản lý trực tiếp xem đơn (`request.read`) chỉ thấy số đã che. Chưa mã hóa cột riêng (ổ đĩa DB đã mã hóa) — ghi vào PROGRESS.
- Kế toán xem tài khoản ngân hàng đã duyệt ở tab Lương cơ bản (Lương & tạm ứng).

## Thứ tự

migration `202611030001_profile_change.sql` → pgTAP → contracts → API → `tools/profile-smoke.sh` → web (Đơn & phê duyệt hiển thị
thay đổi trước/sau, hồ sơ nhân viên có mục Thông tin cá nhân, Kế toán thấy tài khoản ở Lương cơ bản) → mobile (sheet đề nghị sửa,
thông báo đang chờ, đơn HS trong Đơn của tôi) → verify-all → PROGRESS.
