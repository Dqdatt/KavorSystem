# ADR 0001 — Cấp quyền admin công ty và bộ rules theo công ty

- Trạng thái: **Đã chốt** (22/10/2026)
- Người quyết định: Product Owner (hướng nghiệp vụ) + Claude (cấu trúc kỹ thuật)
- Liên quan: `PERMISSION_MATRIX.md`, `DATABASE_SCHEMA.md`, `plan.md` §24, `docs/HR_COVERAGE_AUDIT.md`

## Bối cảnh

Khi phát hành thật, Kavor không tự vận hành từng công ty. Kavor cấp quyền cho admin của công ty; admin cài đặt công ty; nhân viên dùng app theo "bộ rules" của công ty đó. Mobile đã port 100% prototype nhưng nhiều giá trị nghiệp vụ còn cứng trong code (giờ ca 08:00–17:00, 3 lượt giải trình, hạn mức tạm ứng 30%, ảnh bìa, liên hệ HR…). Cần chốt mô hình trước khi làm web HR/Admin và cài đặt công ty.

## Quyết định

### 1. Chuỗi cấp quyền

```text
Kavor Console (platform_operator)
  └─ tạo tenant + mời Tenant Admin đầu tiên (qua email, tự kích hoạt)
       └─ Tenant Admin mời thêm admin/HR/Payroll/Manager/Auditor, gán role + phạm vi
            └─ HR tạo hồ sơ nhân viên (hoặc import) → nhân viên tự kích hoạt trên mobile
```

- "Cấp tài khoản nhân viên" = HR tạo **hồ sơ nhân viên**; tài khoản đăng nhập do nhân viên tự kích hoạt (mã NV + email công ty + OTP) — luồng đã chạy.
- Quyền gán qua `role_assignments` (role + `scope_type`/`scope_id` + ngày hiệu lực). Không có "siêu quyền" ngầm.
- **Tenant Admin không mặc định xem dữ liệu lương**; quyền lương thuộc role Payroll.
- Admin và Payroll bắt buộc MFA.
- **Chống mất quyền**: hệ thống chặn gỡ/khóa Tenant Admin cuối cùng, và cảnh báo thường trực (checklist thiết lập + banner) khi tenant chỉ có 1 Tenant Admin — khuyến nghị luôn ≥ 2. Khôi phục chủ sở hữu chỉ qua Kavor Console, có xác minh, hai người Kavor tham gia và ghi audit.
- Nhân viên Kavor không đọc dữ liệu tenant trừ qua `support_access_sessions` có lý do, thời hạn, phạm vi, được tenant duyệt và ghi audit.

### 2. Rules có tầng, tra theo ngày, có phiên bản

```text
Luật nhà nước (Kavor duy trì, áp cho mọi tenant)
  └─ Mặc định công ty
       └─ Ghi đè theo nhóm: pháp nhân / chi nhánh / phòng ban / loại hợp đồng
            └─ Ngoại lệ cá nhân (hiếm, bắt buộc lý do, ghi audit)
```

- Nhân viên **không được sao chép rule lúc tạo tài khoản**. Rule áp dụng được **tra tại thời điểm dùng** từ assignment hiện hành của nhân viên (phòng ban, chi nhánh, loại hợp đồng) và ngày nghiệp vụ.
- Mỗi chính sách có **phiên bản bất biến** với `effective_from`/`effective_to`. Sửa chính sách = tạo phiên bản mới, không sửa phiên bản cũ. Tính công/lương tháng N dùng phiên bản hiệu lực trong tháng N; kết quả lưu `policy_snapshot` để tái lập được.
- Thứ tự ưu tiên khi nhiều tầng cùng khớp: cá nhân > phòng ban > chi nhánh > pháp nhân > công ty > luật. Rule tầng dưới **không được vi phạm sàn của luật** (ví dụ phép năm < 12 ngày bị chặn khi lưu).
- Áp dụng cho mọi module có cấu hình: ca và địa điểm chấm công, giải trình, nghỉ phép/OT, tạm ứng, workflow duyệt, payroll, thông báo nhắc nhở.

### 3. Phân chia ai sở hữu rule nào

| Loại | Chủ sở hữu | Ví dụ |
|---|---|---|
| Luật nhà nước | **Kavor** (cập nhật tập trung, có phiên bản theo ngày hiệu lực của văn bản) | Tỷ lệ BHXH/BHYT/BHTN, biểu thuế TNCN, giảm trừ gia cảnh, ngày lễ quốc gia, phép năm tối thiểu, giới hạn giờ OT |
| Mặc định theo luật | Kavor cung cấp **mẫu**, công ty chỉnh trong giới hạn luật | Phép năm 12 ngày, ca hành chính 8 giờ |
| Chính sách riêng | **Công ty** (Tenant Admin/HR/Payroll theo quyền) | Ca, địa điểm, bán kính GPS, hạn mức tạm ứng, số lượt giải trình, luồng duyệt, ảnh bìa, logo, liên hệ HR, lịch nghỉ riêng |
| Theo gói dịch vụ | **Kavor Console** | Số nhân viên tối đa, Employee Web, Google Sheets sync, số địa điểm… |

- Số liệu luật **phải được HR/Payroll SME hoặc luật sư xác nhận** trước pilot. Số trong `PILOT_RULEBOOK.md` và dữ liệu mẫu chỉ để phát triển.

### 4. Công ty mới chạy được ngay

- Tạo tenant sẽ sinh sẵn **bộ mẫu mặc định theo luật Việt Nam**: role hệ thống, ca hành chính, chính sách phép chuẩn, workflow duyệt 1 cấp (quản lý trực tiếp), quy định giải trình, thông báo nhắc nhở cơ bản, lịch lễ quốc gia.
- Tenant Admin có **checklist thiết lập ban đầu** (theo `plan.md` §24.1): thông tin công ty + thương hiệu → pháp nhân/chi nhánh/phòng ban → địa điểm chấm công → ca → chính sách phép → workflow → nhập nhân viên → mời quản lý → chạy thử. Mỗi bước hiển thị trạng thái xong/chưa.

### 5. Đồng ý xử lý dữ liệu cá nhân

- Điều khoản xử lý dữ liệu cá nhân có **phiên bản**; lưu ai đồng ý phiên bản nào, lúc nào, trên thiết bị nào (Nghị định 13/2023/NĐ-CP — cần chuyên gia pháp lý xác nhận nội dung).
- Đổi điều khoản → nhân viên phải đồng ý lại ở lần mở app kế tiếp.

## Hệ quả kỹ thuật

- `tenant_settings` (JSON phẳng một dòng/tenant) chỉ giữ cấu hình **không cần tầng/phiên bản** (thương hiệu, liên hệ, chính sách nền tảng). Chính sách nghiệp vụ chuyển sang bảng có phiên bản + bảng gán theo phạm vi (xem `DATABASE_SCHEMA.md` §20).
- API có một hàm dùng chung `resolvePolicy(kind, employee, date)` trả phiên bản áp dụng + nguồn (tầng nào), để web hiển thị "nhân viên này đang theo rule nào, vì sao".
- Mobile không còn giá trị nghiệp vụ cứng: đọc từ API (ví dụ `GET /me/policies?date=`).
- Mỗi thay đổi chính sách ghi audit (ai, khi nào, phiên bản trước/sau).
- Module chấm công (bước kế tiếp) làm địa điểm và ca theo mô hình này ngay từ đầu.

## Phương án đã cân nhắc

- **Một bộ rules phẳng cho cả công ty**: đơn giản nhưng không đáp ứng thực tế (thử việc ≠ chính thức, khối văn phòng ≠ ca đêm) → bỏ.
- **Sao chép rule vào nhân viên khi tạo**: sửa rule không áp được cho người cũ, hoặc làm sai lương quá khứ → bỏ.
- **Để công ty tự nhập luật nhà nước**: dễ sai, mỗi lần luật đổi phải sửa từng công ty → Kavor duy trì tập trung.
