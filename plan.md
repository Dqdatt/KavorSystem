# Kavor HRM — Kế hoạch sản phẩm và triển khai

> Trạng thái: Đang triển khai — đã hoàn tất baseline kỹ thuật Sprint 1 bằng dữ liệu mẫu  
> Ngày cập nhật: 20/10/2026  
> Tài liệu đầu vào: `Kavor HRM Prototype.html`  
> Định hướng: HRM SaaS đa doanh nghiệp, ưu tiên số hóa công–phép–đơn từ–lương và giảm thao tác giấy tờ

Tài liệu triển khai đi kèm:

- `PRODUCT_SPEC.md` — yêu cầu sản phẩm và tiêu chí nghiệm thu.
- `DATABASE_SCHEMA.md` — mô hình dữ liệu và nguyên tắc multi-tenant.
- `PERMISSION_MATRIX.md` — vai trò, quyền và phạm vi dữ liệu.
- `IMPLEMENTATION_ROADMAP.md` — kế hoạch sprint, pilot và phát hành iOS/Android.
- `PILOT_RULEBOOK.md` — rule nghiệp vụ giả lập của tenant Hải Đăng Group.
- `SOURCE_OF_TRUTH_MATRIX.md` — nguồn dữ liệu và chính sách cutover.
- `USER_STORIES.md` — backlog MVP cùng acceptance criteria.
- `API_CONTRACT.md` — REST API baseline cho web, iOS và Android.
- `ERD.md` — quan hệ dữ liệu cấp cao.
- `UAT_CHECKLIST.md` — bộ kiểm thử nghiệm thu pilot.
- `sample-data/` — dữ liệu CSV hư cấu dùng cho development và UAT.

## 0. Trạng thái triển khai hiện tại

Đã hoàn thành ngày 20/10/2026:

- Monorepo pnpm/Turborepo cho Web, Mobile, API và package dùng chung.
- HR/Admin Web và Kavor Console theo prototype đã chốt, có tìm kiếm, điều hướng và thông báo tương tác trên dữ liệu mẫu.
- Mobile Expo/React Native dùng chung codebase và build được bundle iOS/Android.
- NestJS API foundation với health check, metadata nền tảng và tenant mẫu.
- Supabase/PostgreSQL migration nền tảng cho tenant, membership, RBAC, tổ chức, nhân viên, assignment, audit và RLS đọc cơ bản.
- Seed tenant hư cấu Hải Đăng Group; không liên quan tới dịch vụ đăng ký kinh doanh.
- CI, typecheck, unit test và production build baseline.
- Mobile UI đã được đối chiếu lại theo prototype gốc; vòng tiếp theo bổ sung micro-interaction và chuyển cảnh có kiểm soát sau khi khóa luồng nghiệp vụ.
- Prototype dữ liệu mẫu đã phủ các module điều hướng của HR/Admin Web và Kavor Console; mobile đã nối các luồng chấm công, công/giải trình, nghỉ phép, OT, tạm ứng, phiếu lương, đơn từ/phê duyệt, bản tin, hồ sơ, thông báo, widget và đăng nhập demo.
- Checklist kiểm thử hợp nhất được lưu tại `PROTOTYPE_TEST_GUIDE.md`.

Chưa hoàn thành trong Sprint 1:

- Chưa kết nối các giao diện vào Supabase/API thật; UI hiện dùng dữ liệu mẫu trong source.
- Chưa chạy migration Supabase local do máy phát triển chưa có Docker/OrbStack.
- Chưa cấu hình môi trường staging, secret manager, signing iOS/Android, crash reporting và phân phối nội bộ.
- Chưa có component/device test tự động cho Web và Mobile; hiện mới kiểm thử build cùng smoke test giao diện.
- Chưa hoàn thiện animation mobile: chuyển tab/màn, mở quick action, phản hồi nhấn giữ chấm công, success state và skeleton/loading; animation phải hỗ trợ Reduce Motion trên iOS/Android.

Ưu tiên kế tiếp là hoàn thiện các hạng mục còn lại của Sprint 1, sau đó triển khai Sprint 2: Tenant, Auth, RBAC, RLS và audit end-to-end.

---

## 1. Tóm tắt điều hành

Kavor được định hướng là một hệ thống HRM SaaS cho nhiều doanh nghiệp. Mỗi doanh nghiệp sử dụng Kavor có một không gian dữ liệu riêng, gọi là `tenant`. Tenant không phải chức năng đăng ký kinh doanh và Kavor không thay mặt doanh nghiệp thực hiện thủ tục pháp lý với cơ quan nhà nước.

Sản phẩm gồm bốn bề mặt chính:

1. Mobile App cho nhân viên và quản lý, phát hành trên cả iOS và Android.
2. Employee Web Portal cho nhân viên sử dụng trên máy tính.
3. HR/Admin Web cho HR, quản lý, kế toán và quản trị doanh nghiệp.
4. Kavor Console cho đội vận hành nền tảng Kavor.

Prototype hiện tại đã mô tả khá đầy đủ trải nghiệm mobile của nhân viên: đăng nhập, chấm công GPS, bảng công, giải trình, nghỉ phép, OT, phiếu lương, tạm ứng, phê duyệt, bản tin, hồ sơ và thiết bị. Phần cần xây mới lớn nhất là backend, mô hình dữ liệu đa tenant và Web Admin.

Kiến trúc dữ liệu được đề xuất:

- PostgreSQL là database nghiệp vụ chuẩn.
- Supabase Managed được sử dụng trong giai đoạn MVP để cung cấp PostgreSQL, Auth, Storage và công cụ vận hành.
- Google Sheets được hỗ trợ như một nguồn import hoặc đồng bộ có kiểm soát.
- Google Sheets không được dùng làm database giao dịch trực tiếp cho chấm công, workflow, phân quyền, audit và phiên đăng nhập.
- Payroll phải cấu hình theo từng công ty, có version và ngày hiệu lực; không hard-code công thức chung cho mọi tenant.
- Chữ ký số không nằm trong phạm vi sản phẩm hiện tại.

Mục tiêu là đưa một doanh nghiệp pilot từ 50–300 nhân viên chạy hết một chu kỳ công–phép–đơn từ–phiếu lương trên Kavor trong khoảng 18–20 tuần.

---

## 2. Bối cảnh và mục tiêu

### 2.1. Vấn đề cần giải quyết

Nhiều doanh nghiệp đang quản trị nhân sự bằng sự kết hợp của:

- Hồ sơ giấy.
- Biểu mẫu xin nghỉ, OT, giải trình và tạm ứng bằng giấy.
- Google Sheets/Excel theo từng phòng ban.
- Máy chấm công hoặc dữ liệu chấm công rời rạc.
- Phiếu lương gửi thủ công.
- Phê duyệt qua tin nhắn hoặc email.
- Dữ liệu nhân viên không có lịch sử thay đổi đáng tin cậy.

Hệ quả:

- Dữ liệu trùng hoặc sai lệch giữa nhiều file.
- Khó truy vết ai đã thay đổi dữ liệu.
- HR mất nhiều thời gian tổng hợp.
- Quản lý không thấy đầy đủ ngữ cảnh khi duyệt.
- Nhân viên không biết trạng thái đơn của mình.
- Khó mở rộng khi doanh nghiệp có nhiều chi nhánh.

### 2.2. Mục tiêu sản phẩm

Kavor cần đạt các mục tiêu sau:

- Tập trung dữ liệu nhân sự vào một nguồn vận hành thống nhất.
- Số hóa các quy trình giấy phổ biến.
- Cho phép doanh nghiệp cấu hình chính sách riêng.
- Cung cấp trải nghiệm mobile đơn giản cho nhân viên.
- Cung cấp Web Admin mạnh cho HR và kế toán.
- Cho phép doanh nghiệp chuyển đổi dần từ Google Sheets, không bắt buộc chuyển toàn bộ ngay lập tức.
- Có đầy đủ phân quyền, audit, backup và khả năng phục hồi.
- Có kiến trúc đủ linh hoạt để phục vụ nhiều doanh nghiệp trên cùng nền tảng.

### 2.3. Nguyên tắc sản phẩm

1. **Cấu hình thay vì hard-code:** chính sách công, phép, OT, tạm ứng và payroll phải cấu hình theo tenant.
2. **Một nguồn chính cho mỗi loại dữ liệu:** từng dataset phải xác định rõ nguồn chính là Kavor, Google Sheets hay hệ thống ngoài.
3. **Dữ liệu gốc không bị ghi đè:** bản ghi chấm công, phê duyệt và giao dịch phép phải lưu lịch sử đầy đủ.
4. **Mobile để thao tác nhanh, web để vận hành sâu:** không cố đưa toàn bộ chức năng quản trị lên mobile.
5. **Chuyển đổi từng bước:** cho phép import và đồng bộ Sheet trong giai đoạn doanh nghiệp chưa muốn thay đổi quy trình ngay.
6. **Bảo mật mặc định:** quyền truy cập được kiểm tra ở API và database, không chỉ ở giao diện.
7. **MVP tập trung:** ưu tiên Core HR, công, phép, workflow, payroll operations và tài liệu; chưa mở rộng sang tuyển dụng hay đánh giá hiệu suất.

---

## 3. Phạm vi sản phẩm

### 3.1. Trong phạm vi MVP

- Multi-tenancy.
- Thiết lập doanh nghiệp, pháp nhân, chi nhánh và cơ cấu tổ chức.
- Hồ sơ nhân viên và lịch sử công tác.
- Import Excel/CSV và kết nối Google Sheets.
- Ca làm, lịch làm việc và chấm công.
- Bảng công, bất thường và giải trình.
- Chính sách phép và đơn nghỉ.
- Đăng ký OT.
- Workflow phê duyệt dùng chung.
- Payroll theo mô hình import đầu vào/kết quả và công bố phiếu lương.
- Tạm ứng lương.
- Hồ sơ/tài liệu nhân viên, không có chữ ký số.
- Bản tin và thông báo.
- Employee Web Portal.
- HR/Admin Web.
- Mobile App cho nhân viên/quản lý.
- Báo cáo, export và audit log.
- Kavor Console ở mức vận hành tenant cơ bản.

### 3.2. Ngoài phạm vi MVP

- Chữ ký số hoặc tự xây hạ tầng ký điện tử.
- Payroll engine Việt Nam đầy đủ cho mọi tình huống.
- Tuyển dụng/ATS.
- Đánh giá hiệu suất/KPI/OKR.
- Đào tạo/LMS.
- Quản lý tài sản đầy đủ.
- Quản lý chi phí công tác.
- Benefits marketplace.
- AI chấm công hoặc nhận diện khuôn mặt.
- Marketplace tích hợp bên thứ ba.

### 3.3. Giai đoạn sau MVP

- Payroll engine cấu hình nâng cao.
- Onboarding/offboarding checklist nâng cao.
- SSO SAML/OIDC cho enterprise.
- Database hoặc deployment riêng cho enterprise.
- Public API và webhook mở rộng.
- Tích hợp phần mềm kế toán/ngân hàng.
- QR, Wi-Fi và BLE cho chấm công tại địa điểm khó dùng GPS.
- Tuyển dụng, hiệu suất, đào tạo và tài sản nếu thị trường yêu cầu.

---

## 4. Các bề mặt sản phẩm

### 4.1. Mobile App

Đối tượng:

- Nhân viên.
- Quản lý trực tiếp.

Nền tảng phát hành:

- iOS qua Apple App Store.
- Android qua Google Play.
- Dùng chung codebase React Native/TypeScript; chỉ bổ sung native module khi GPS, push notification, biometric hoặc yêu cầu hệ điều hành bắt buộc.
- Hai nền tảng dùng chung API, nghiệp vụ, analytics và feature flag nhưng có quy trình build, ký ứng dụng, kiểm thử và phát hành độc lập.

Chức năng chính:

- Đăng nhập, kích hoạt, OTP và khôi phục tài khoản.
- Đăng ký thiết bị.
- Chấm công vào/ra.
- Xem bảng công và bất thường.
- Tạo giải trình.
- Xem phép và tạo đơn nghỉ.
- Đăng ký OT.
- Xem phiếu lương.
- Tạo và theo dõi tạm ứng.
- Xem đơn từ.
- Duyệt/từ chối đơn của đội ngũ.
- Bản tin và thông báo.
- Hồ sơ cá nhân và yêu cầu sửa thông tin.
- Widget chấm công ở giai đoạn phù hợp.

### 4.2. Employee Web Portal

Employee Web dùng chung backend và quyền với Mobile App.

Chức năng:

- Xem hồ sơ.
- Xem công, phép, OT.
- Tạo đơn và theo dõi trạng thái.
- Xem phiếu lương.
- Xem tài liệu cá nhân.
- Đọc bản tin.
- Quản lý thông báo và thiết bị.

Không nhất thiết đưa chấm công GPS web vào MVP, trừ khi doanh nghiệp có nhu cầu chấm công tại máy tính văn phòng.

### 4.3. HR/Admin Web

Đây là trung tâm vận hành chính của doanh nghiệp.

Các khu vực:

1. Tổng quan.
2. Nhân sự.
3. Cơ cấu tổ chức.
4. Thời gian và chấm công.
5. Nghỉ phép và đơn từ.
6. Workflow/phê duyệt.
7. Lương và tạm ứng.
8. Tài liệu.
9. Truyền thông.
10. Báo cáo.
11. Tích hợp dữ liệu.
12. Cấu hình và phân quyền.
13. Audit log.

### 4.4. Kavor Console

Đối tượng: đội vận hành Kavor.

Chức năng MVP:

- Tạo, khóa và xem trạng thái tenant.
- Theo dõi gói dịch vụ và số người dùng.
- Theo dõi job đồng bộ và lỗi hệ thống.
- Hỗ trợ tenant theo cơ chế có lý do, có thời hạn và có audit.
- Quản lý feature flag.
- Theo dõi version mobile tối thiểu.
- Không mặc định cho phép nhân viên Kavor xem dữ liệu lương hoặc thông tin cá nhân nhạy cảm.

---

## 5. Vai trò và phạm vi quyền

### 5.1. Vai trò chuẩn

| Vai trò | Phạm vi |
|---|---|
| Employee | Dữ liệu và đơn từ của chính mình |
| Manager | Dữ liệu cần thiết của đội ngũ và phê duyệt trong phạm vi quản lý |
| HR Operations | Hồ sơ, công, phép, đơn từ và tài liệu |
| Payroll/Accountant | Payroll, tạm ứng, tài khoản ngân hàng và dữ liệu tài chính được cấp quyền |
| Tenant Admin | Cấu hình tenant, vai trò, tích hợp và chính sách |
| Auditor | Chỉ đọc báo cáo và audit log |
| Kavor Support | Truy cập hỗ trợ có thời hạn, được ghi log |
| Kavor Super Admin | Quản trị tenant và hạ tầng, không mặc định đọc dữ liệu nhạy cảm |

### 5.2. Phạm vi dữ liệu

Quyền cần kết hợp vai trò với phạm vi:

- Toàn doanh nghiệp.
- Pháp nhân.
- Chi nhánh.
- Phòng ban.
- Nhóm.
- Nhân viên cụ thể.
- Chỉ bản thân.

Ví dụ:

- Manager có thể xem bảng công của đội mình nhưng không xem lương nếu không có quyền payroll.
- HR chi nhánh Hà Nội không mặc định thấy dữ liệu nhân viên TP.HCM.
- Payroll có thể xem lương nhưng không được sửa cơ cấu tổ chức.

---

## 6. Thiết lập doanh nghiệp trên Kavor

### 6.1. Khái niệm tenant

Mỗi doanh nghiệp sử dụng Kavor được tạo một tenant riêng. Tenant là ranh giới:

- Dữ liệu.
- Người dùng.
- Chính sách.
- Workflow.
- Tích hợp.
- Branding.
- Báo cáo.

Tenant không phải hồ sơ đăng ký doanh nghiệp với cơ quan nhà nước.

### 6.2. Dữ liệu thiết lập

- Tên hiển thị.
- Tên pháp lý.
- Mã số thuế nếu doanh nghiệp muốn lưu.
- Logo và màu thương hiệu.
- Địa chỉ.
- Người đại diện/đầu mối HR.
- Pháp nhân.
- Chi nhánh và văn phòng.
- Múi giờ.
- Tiền tệ.
- Ngôn ngữ.
- Lịch làm việc và ngày lễ.
- Kỳ công và kỳ lương.
- Cấu hình email/push notification.
- Chính sách dữ liệu.

### 6.3. Cơ cấu tổ chức

- Công ty/pháp nhân.
- Chi nhánh.
- Khối.
- Phòng ban.
- Nhóm.
- Chức danh.
- Cấp bậc.
- Quản lý trực tiếp.
- Quản lý chức năng nếu cần.
- Cost center nếu doanh nghiệp sử dụng.

Mọi thay đổi cơ cấu phải có `effective_from` và tùy chọn `effective_to` để giữ lịch sử.

---

## 7. Core HR và hồ sơ nhân viên

### 7.1. Hồ sơ nhân viên

Nhóm thông tin:

- Thông tin cá nhân.
- Thông tin liên hệ.
- Địa chỉ.
- Liên hệ khẩn cấp.
- Thông tin công việc.
- Phòng ban/chức danh/quản lý.
- Ngày vào làm.
- Loại lao động và trạng thái.
- Hợp đồng.
- Tài khoản ngân hàng.
- Mã số thuế và thông tin bảo hiểm nếu tenant sử dụng.
- Tài liệu đính kèm.
- Trường tùy chỉnh.

### 7.2. Trạng thái nhân sự

- Preboarding.
- Active.
- Probation.
- Official.
- Suspended.
- On leave.
- Leaving.
- Terminated.

Trạng thái cần có lịch sử và ngày hiệu lực.

### 7.3. Yêu cầu sửa thông tin

Nhân viên không sửa trực tiếp các trường nhạy cảm. Luồng đề xuất:

1. Nhân viên gửi giá trị cũ và giá trị mới.
2. HR nhận thông báo.
3. HR kiểm tra minh chứng nếu cần.
4. HR phê duyệt hoặc từ chối.
5. Dữ liệu mới có hiệu lực theo ngày được chọn.
6. Toàn bộ thay đổi được ghi audit.

### 7.4. Import nhân viên

Hỗ trợ:

- Excel.
- CSV.
- Google Sheets.
- Template chuẩn của Kavor.

Yêu cầu:

- Preview trước khi ghi.
- Mapping cột.
- Kiểm tra mã nhân viên trùng.
- Kiểm tra email/số điện thoại.
- Kiểm tra phòng ban và chức danh tồn tại.
- Cho phép tạo phòng ban/chức danh mới nếu người dùng có quyền.
- Trả về file lỗi theo từng dòng.
- Import idempotent.

---

## 8. Thời gian, ca làm và chấm công

### 8.1. Loại ca

- Ca cố định.
- Ca linh hoạt.
- Ca xoay.
- Ca qua đêm.
- Ca theo giờ.
- Ngày nghỉ.

Mỗi ca có thể cấu hình:

- Giờ bắt đầu/kết thúc.
- Thời gian nghỉ.
- Khoảng cho phép đi sớm/về muộn.
- Grace period.
- Số giờ chuẩn.
- Điều kiện tính đủ công.
- Quy tắc OT.
- Địa điểm được phép chấm công.

### 8.2. Xếp lịch

- Theo nhân viên.
- Theo nhóm/phòng ban.
- Theo chu kỳ.
- Copy lịch từ tuần trước.
- Import từ Sheet.
- Cảnh báo trùng ca.
- Lưu version lịch đã công bố.

### 8.3. Chấm công

Mỗi attendance event lưu:

- Tenant.
- Nhân viên.
- Loại sự kiện vào/ra/nghỉ/bắt đầu lại nếu có.
- Giờ thiết bị.
- Giờ máy chủ.
- Latitude/longitude.
- Độ chính xác vị trí.
- Địa điểm/geofence.
- Thiết bị.
- Nguồn: mobile, web, QR, máy chấm công, import.
- IP và metadata kỹ thuật cần thiết.
- Idempotency key.
- Trạng thái xác thực.

Bản ghi gốc không được sửa. Nếu điều chỉnh, hệ thống tạo adjustment và liên kết tới bản ghi gốc.

### 8.4. GPS và geofence

Bán kính 3 m trong prototype chỉ nên xem là dữ liệu mô phỏng. Sản phẩm thật cần:

- Cho tenant cấu hình bán kính theo từng địa điểm.
- Kiểm tra cả khoảng cách và `accuracy` từ thiết bị.
- Không thu thập vị trí liên tục.
- Chỉ lấy vị trí khi người dùng thực hiện thao tác chấm công.
- Có fallback bằng QR, Wi-Fi hoặc BLE cho môi trường trong nhà.
- Ghi rõ lý do từ chối nếu vị trí không đủ tin cậy.

### 8.5. Bảng công

Luồng dữ liệu:

```text
Attendance events
      ↓
Ghép bản ghi theo ca
      ↓
Daily timesheet
      ↓
Phát hiện bất thường
      ↓
Giải trình/điều chỉnh
      ↓
Monthly timesheet
      ↓
Khóa kỳ công
      ↓
Payroll input
```

Web Admin cần bảng công dạng ma trận:

- Hàng là nhân viên.
- Cột là ngày.
- Màu cho đủ công, thiếu công, đi muộn, nghỉ, OT.
- Bộ lọc chi nhánh/phòng ban/ca/trạng thái.
- Mở chi tiết bản ghi gốc.
- Duyệt điều chỉnh.
- Khóa/mở kỳ có audit.
- Export Excel.

### 8.6. Mạng yếu và gửi trùng

MVP nên yêu cầu kết nối mạng để máy chủ xác thực thời gian và vị trí.

Để tránh gửi trùng:

- Client tạo idempotency key cho mỗi lần chấm công.
- API trả lại kết quả cũ nếu cùng key được gửi lại.
- UI hiển thị trạng thái đang gửi/đang xác minh.
- Không tạo event mới khi người dùng bấm nhiều lần.

---

## 9. Nghỉ phép

### 9.1. Chính sách phép

Mỗi tenant có thể có nhiều chính sách:

- Phép năm.
- Nghỉ không lương.
- Nghỉ ốm.
- Nghỉ kết hôn.
- Nghỉ tang.
- Nghỉ thai sản hoặc loại tùy chỉnh.

Mỗi chính sách cấu hình:

- Đối tượng áp dụng.
- Số ngày được cấp.
- Cách tích lũy theo tháng/năm.
- Quy tắc làm tròn.
- Cho phép âm hay không.
- Chuyển phép sang năm sau.
- Ngày hết hạn phép tồn.
- Minh chứng bắt buộc.
- Số ngày gửi trước.
- Người duyệt.

### 9.2. Sổ giao dịch phép

Không chỉ lưu một con số `leave_balance`. Cần lưu ledger:

- Cấp phép.
- Chuyển phép.
- Giữ chỗ khi đơn đang chờ.
- Trừ phép khi duyệt.
- Hoàn phép khi hủy/từ chối.
- Điều chỉnh bởi HR.
- Hết hạn.

Nhờ vậy có thể giải thích số dư tại bất kỳ thời điểm nào.

### 9.3. Tạo đơn nghỉ

- Chọn loại nghỉ.
- Chọn một hoặc nhiều ngày.
- Nghỉ cả ngày/nửa ngày.
- Tự loại trừ cuối tuần và ngày lễ theo lịch tenant.
- Kiểm tra xung đột ca/đơn khác.
- Kiểm tra số dư.
- Giữ chỗ số dư khi gửi.
- Hoàn lại khi hủy/từ chối.
- Đính kèm minh chứng nếu chính sách yêu cầu.

---

## 10. Giải trình công và OT

### 10.1. Giải trình công

Tenant có thể cấu hình:

- Loại giải trình.
- Số lượt tối đa theo tháng.
- Hạn gửi theo ngày chốt công.
- Minh chứng bắt buộc hoặc tùy chọn.
- Người duyệt.
- Có cho HR override hay không.

Các loại mặc định:

- Quên chấm vào.
- Quên chấm ra.
- Đi công tác.
- Lỗi GPS/thiết bị.
- Khác.

Sau khi được duyệt, hệ thống tạo adjustment; không thay đổi attendance event gốc.

### 10.2. OT

- Chọn ngày và khoảng giờ.
- Kiểm tra trùng ca chính.
- Hệ số theo loại ngày.
- Cho phép đăng ký trước hoặc xác nhận sau.
- Phê duyệt theo manager/HR.
- Chuyển kết quả được duyệt sang payroll input.

---

## 11. Workflow và phê duyệt

### 11.1. State machine chung

```text
Draft
  ↓ submit
Submitted
  ↓
In Approval
  ├── Approved
  ├── Rejected
  └── Cancelled
```

Một request phải lưu snapshot thông tin tại thời điểm gửi để thay đổi chính sách sau đó không làm thay đổi lịch sử.

### 11.2. Workflow cấu hình theo tenant

Cho phép cấu hình:

- Một hoặc nhiều cấp duyệt.
- Tuần tự hoặc song song.
- Quản lý trực tiếp.
- Quản lý cấp tiếp theo.
- HR.
- Payroll/kế toán.
- Người có vai trò cụ thể.
- Điều kiện theo số tiền, loại đơn, phòng ban hoặc chi nhánh.
- Người duyệt thay thế.
- SLA và escalation.

Ví dụ tạm ứng:

```text
Nhân viên gửi
      ↓
Quản lý trực tiếp
      ↓
HR kiểm tra điều kiện
      ↓
Kế toán xác nhận chi
      ↓
Đã chi
      ↓
Đã khấu trừ trong kỳ lương
```

### 11.3. Yêu cầu audit

Mỗi hành động phải lưu:

- Ai thực hiện.
- Vai trò và phạm vi lúc thực hiện.
- Thời gian.
- Giá trị trước/sau.
- Lý do.
- IP/thiết bị nếu cần.
- Correlation ID của request.

---

## 12. Payroll theo từng doanh nghiệp

### 12.1. Nguyên tắc

- Không hard-code công thức lương chung.
- Mỗi tenant có payroll configuration riêng.
- Configuration có version và ngày hiệu lực.
- Kỳ lương đã khóa phải dùng snapshot rule của kỳ đó.
- Mọi thay đổi payroll configuration phải có audit.

### 12.2. Ba chế độ payroll

#### Chế độ A — Import kết quả cuối cùng

Doanh nghiệp tính lương bằng Google Sheets/Excel/phần mềm cũ. Kavor:

- Import dữ liệu thực lĩnh và các thành phần.
- Kiểm tra tổng.
- Duyệt/công bố.
- Tạo phiếu lương.
- Cho nhân viên gửi câu hỏi.

Đây là chế độ ưu tiên cho MVP.

#### Chế độ B — Import đầu vào

Kavor tổng hợp:

- Ngày công.
- OT.
- Nghỉ không lương.
- Phụ cấp/thưởng/khấu trừ.
- Tạm ứng.

Sau đó export sang Sheet hoặc phần mềm payroll của doanh nghiệp.

#### Chế độ C — Tính lương trong Kavor

Kavor sử dụng rule engine cấu hình theo tenant. Chế độ này triển khai sau khi mô hình dữ liệu và công thức đã được kiểm chứng với nhiều doanh nghiệp.

### 12.3. Thành phần cấu hình payroll

- Kỳ lương.
- Ngày chốt công.
- Ngày trả lương.
- Tiền tệ.
- Thành phần thu nhập.
- Thành phần khấu trừ.
- Công thức.
- Điều kiện áp dụng.
- Nguồn dữ liệu.
- Quy tắc làm tròn.
- Thứ tự tính.
- Mức ưu tiên.
- Version.
- Ngày hiệu lực.

### 12.4. Chu kỳ payroll

```text
Open
  ↓ collect inputs
Prepared
  ↓ validation
Under Review
  ↓ approval
Approved
  ↓ publish
Published
  ↓ payment confirmation
Paid
  ↓
Closed
```

Chỉ người có quyền mới được chuyển trạng thái. Kỳ đã `Closed` không được sửa trực tiếp; điều chỉnh phải tạo correction ở kỳ sau hoặc mở lại với audit.

### 12.5. Phiếu lương

- Mỗi nhân viên chỉ xem phiếu của mình.
- Yêu cầu xác thực lại bằng PIN/mật khẩu/biometric local.
- Số tiền có thể ẩn/hiện.
- PDF tải về dùng signed URL có thời hạn.
- Có lịch sử công bố và tải.
- Có kênh gửi câu hỏi tới HR/payroll.

### 12.6. Tạm ứng

Tenant cấu hình:

- Hạn mức theo phần trăm hoặc số tiền.
- Số lần mỗi kỳ/tháng.
- Hạn nhận đơn.
- Nhóm nhân viên đủ điều kiện.
- Điều kiện thử việc/sắp nghỉ.
- Kỳ khấu trừ.
- Workflow duyệt.

---

## 13. Tài liệu và thay thế giấy tờ

### 13.1. Phạm vi

Không triển khai chữ ký số.

Module tài liệu hỗ trợ:

- Upload tài liệu.
- Phân loại tài liệu.
- Gắn tài liệu với nhân viên.
- Version tài liệu.
- Ngày phát hành/ngày hết hạn.
- Nhắc tài liệu sắp hết hạn.
- Phân quyền xem/tải.
- Template tạo PDF nếu cần.
- Audit tải xuống và thay đổi.

### 13.2. Quy trình giấy được số hóa

| Quy trình hiện tại | Quy trình trên Kavor |
|---|---|
| Đơn nghỉ giấy | Form số + workflow + cập nhật phép |
| Đơn OT | Form số + phê duyệt + payroll input |
| Giải trình công | Form số + minh chứng + adjustment |
| Đề nghị tạm ứng | Form số + nhiều cấp duyệt |
| Phiếu lương giấy | Phiếu lương bảo mật |
| Cập nhật thông tin | Change request + lịch sử |
| Hồ sơ nhân viên | Kho tài liệu phân quyền |
| Xác nhận chính sách | Bản tin + xác nhận đã đọc tùy chọn |
| Bảng công ký tay | Khóa kỳ điện tử + audit |

---

## 14. Bản tin và thông báo

### 14.1. Bản tin

- Danh mục: chính sách, thông báo, sự kiện.
- Bài quan trọng.
- Ghim bài.
- File đính kèm.
- Nhóm người nhận.
- Lên lịch xuất bản.
- Tùy chọn yêu cầu xác nhận đã đọc.
- Thống kê lượt đọc/xác nhận.

### 14.2. Notification

Kênh:

- In-app.
- Push mobile.
- Email tùy tenant.

Sự kiện:

- Đơn mới cần duyệt.
- Đơn được duyệt/từ chối.
- Thiếu công.
- Hạn giải trình.
- Phiếu lương được công bố.
- Tạm ứng đã chi.
- Tài liệu sắp hết hạn.
- Bản tin quan trọng.

Notification cần chống gửi trùng và lưu trạng thái đã gửi/đã đọc.

---

## 15. Google Sheets và chiến lược dữ liệu chuyển tiếp

### 15.1. Nguyên tắc

Google Sheets là connector và nguồn dữ liệu chuyển tiếp, không phải database giao dịch của Kavor.

Doanh nghiệp có thể tiếp tục sử dụng Sheet trong giai đoạn đầu. Kavor đồng bộ một bản dữ liệu vào PostgreSQL để phục vụ:

- Mobile và web.
- Workflow.
- Phân quyền.
- Báo cáo.
- Audit.
- Tính toán nghiệp vụ.

### 15.2. Chế độ tích hợp

#### Một lần

- Chọn Sheet/tab.
- Mapping cột.
- Preview.
- Validate.
- Import.

#### Đồng bộ thủ công

- HR bấm “Đồng bộ ngay”.
- Kavor đọc Sheet và hiển thị diff.
- HR xác nhận trước khi ghi.

Đây là chế độ MVP ưu tiên.

#### Đồng bộ định kỳ một chiều

- Chạy theo lịch.
- Sheet → staging → validate → production.
- Có notification khi lỗi.

#### Export từ Kavor sang Sheet

- Bảng công đã khóa.
- Payroll input.
- Báo cáo nhân sự.
- Danh sách đơn.

#### Hai chiều

Không triển khai hai chiều cho cùng một dataset ở MVP. Nếu triển khai sau này phải có conflict resolution rõ ràng.

### 15.3. Ma trận nguồn dữ liệu

| Dataset | Có thể lấy từ Sheet | Nguồn chính khuyến nghị |
|---|---:|---|
| Nhân viên | Có | Sheet trong giai đoạn chuyển đổi, sau đó Kavor |
| Phòng ban/chức danh | Có | Kavor hoặc Sheet, chọn một |
| Ca/lịch làm việc | Có | Kavor sau khi vận hành ổn định |
| Số dư phép ban đầu | Có | Kavor sau import |
| Payroll input | Có | Tùy tenant |
| Payroll result | Có | Sheet/phần mềm payroll hoặc Kavor |
| Attendance event | Không nên | Kavor/máy chấm công tích hợp |
| Request/workflow | Không | Kavor |
| Audit log | Không | Kavor |
| Auth/session | Không | Kavor |
| Notification | Không | Kavor |

### 15.4. Pipeline đồng bộ

```text
Google Sheet
    ↓ OAuth/read permission
Connector job
    ↓
Raw import snapshot
    ↓
Staging tables
    ↓ normalize + validate + deduplicate
Import preview/diff
    ↓ HR confirmation or auto policy
Domain service
    ↓ transaction
Production tables
    ↓
Audit log + import report
```

### 15.5. Quy tắc đồng bộ

- Mỗi dòng cần khóa ổn định, ví dụ `employee_code` hoặc `external_id`.
- Lưu version mapping cột.
- Lưu hash dữ liệu nguồn để phát hiện thay đổi.
- Import phải idempotent.
- Không tự xóa dữ liệu khi dòng biến mất khỏi Sheet.
- Dữ liệu biến mất được đánh dấu để HR xác nhận.
- Không ghi đè thay đổi thủ công trên Kavor nếu có conflict.
- Lưu snapshot nguồn và báo cáo lỗi.
- Cho phép retry job.
- Batch read/write để giảm API call.
- Dùng exponential backoff khi Google trả lỗi quota.

### 15.6. Bảng dữ liệu connector

- `data_connections`
- `google_sheet_connections`
- `mapping_templates`
- `sync_jobs`
- `sync_job_rows`
- `raw_import_snapshots`
- `staging_employees`
- `staging_payroll_inputs`
- `sync_conflicts`
- `sync_audit_logs`

### 15.7. Bảo mật kết nối Google

- Dùng OAuth 2.0.
- Yêu cầu scope tối thiểu.
- Ưu tiên read-only cho import.
- Token được mã hóa khi lưu.
- Cho tenant thu hồi kết nối.
- Không log access token.
- Hiển thị rõ file và tab Kavor có quyền truy cập.

---

## 16. Kiến trúc kỹ thuật

### 16.1. Stack đề xuất

| Thành phần | Đề xuất |
|---|---|
| Admin/Employee Web | Next.js + TypeScript |
| Mobile iOS/Android | React Native + TypeScript, native module khi cần |
| Backend API | NestJS + TypeScript |
| Database | PostgreSQL trên Supabase Managed |
| Auth | Supabase Auth hoặc identity layer tích hợp qua backend |
| File | Supabase Storage/S3-compatible storage |
| Cache/job | Redis + queue worker |
| API contract | REST + OpenAPI |
| Push | APNs + FCM |
| Monitoring | Structured log, error tracking, metrics, tracing |
| CI/CD | Pipeline cho dev, staging và production |

### 16.2. Sơ đồ logic

```text
┌─────────────────────────────────────────────────────┐
│ Mobile App │ Employee Web │ HR/Admin Web            │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS/JWT
                        ▼
┌─────────────────────────────────────────────────────┐
│ Kavor API                                            │
│ Auth │ Tenant │ HR │ Time │ Workflow │ Payroll      │
│ Docs │ News │ Integration │ Reporting │ Audit       │
└─────────────┬──────────────────┬────────────────────┘
              │                  │
              ▼                  ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ PostgreSQL/Supabase  │  │ Redis/Background Workers │
└───────────┬──────────┘  └────────────┬─────────────┘
            │                          │
            ▼                          ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ Object Storage       │  │ Google Sheets/APNs/FCM   │
└──────────────────────┘  └──────────────────────────┘
```

### 16.3. Modular monolith

MVP dùng modular monolith, gồm các module tách biệt về code và schema logic:

- Identity.
- Tenant.
- Organization.
- People.
- Time & Attendance.
- Leave.
- Workflow.
- Payroll.
- Documents.
- Communication.
- Integration.
- Reporting.
- Audit.

Không cần microservices ở giai đoạn đầu. Khi một module có nhu cầu scale hoặc đội vận hành độc lập mới tách service.

### 16.4. API layer

Frontend không được trực tiếp thực hiện nghiệp vụ nhạy cảm bằng cách ghi thẳng database.

Kavor API chịu trách nhiệm:

- Xác thực tenant và user.
- Kiểm tra quyền và phạm vi.
- Validate nghiệp vụ.
- Transaction.
- Idempotency.
- Audit.
- Phát domain event.
- Trả error code ổn định cho mobile/web.

### 16.5. Multi-tenancy

MVP sử dụng shared database, shared schema:

- Mọi bảng nghiệp vụ có `tenant_id`.
- Unique constraint bao gồm `tenant_id` khi phù hợp.
- RLS kiểm tra tenant.
- API luôn resolve tenant từ token/session, không tin `tenant_id` do client tự gửi.
- Background job mang theo tenant context.
- Audit và log có tenant context.

Gói Enterprise có thể hỗ trợ:

- Supabase project riêng.
- PostgreSQL instance riêng.
- Deployment riêng hoặc self-host.

### 16.6. Môi trường

- Local development.
- Development shared.
- Staging/UAT.
- Production.

Production data không được copy nguyên bản về development. Dữ liệu test phải được sinh hoặc ẩn danh.

---

## 17. Mô hình dữ liệu cấp cao

### 17.1. Tenant và tổ chức

- `tenants`
- `tenant_settings`
- `legal_entities`
- `branches`
- `work_locations`
- `departments`
- `teams`
- `positions`
- `job_levels`
- `cost_centers`
- `holiday_calendars`
- `holidays`

### 17.2. Người dùng và nhân viên

- `users`
- `user_identities`
- `employees`
- `employee_contacts`
- `employee_bank_accounts`
- `employee_assignments`
- `employment_status_history`
- `employment_contracts`
- `employee_custom_fields`
- `employee_custom_values`
- `registered_devices`

### 17.3. Time & Attendance

- `shift_definitions`
- `shift_assignments`
- `work_schedules`
- `attendance_events`
- `attendance_event_verifications`
- `daily_timesheets`
- `monthly_timesheets`
- `attendance_exceptions`
- `attendance_adjustments`
- `timesheet_locks`

### 17.4. Leave

- `leave_types`
- `leave_policies`
- `leave_policy_assignments`
- `leave_accounts`
- `leave_transactions`
- `leave_requests`

### 17.5. Workflow

- `request_types`
- `requests`
- `request_versions`
- `workflow_definitions`
- `workflow_versions`
- `workflow_steps`
- `workflow_instances`
- `approval_tasks`
- `approval_actions`
- `request_comments`
- `attachments`

### 17.6. Payroll

- `payroll_configs`
- `payroll_config_versions`
- `pay_components`
- `pay_component_rules`
- `employee_compensation`
- `payroll_cycles`
- `payroll_inputs`
- `payroll_import_batches`
- `payroll_results`
- `payslips`
- `payroll_questions`
- `salary_advances`
- `salary_advance_events`

### 17.7. Tài liệu và truyền thông

- `document_categories`
- `employee_documents`
- `document_versions`
- `document_templates`
- `announcements`
- `announcement_audiences`
- `announcement_reads`
- `notifications`
- `notification_deliveries`

### 17.8. Hệ thống

- `roles`
- `permissions`
- `role_assignments`
- `audit_logs`
- `outbox_events`
- `idempotency_keys`
- `feature_flags`
- `integration_connections`
- `sync_jobs`
- `webhooks`

---

## 18. Bảo mật và quyền riêng tư

### 18.1. Xác thực

- Email/employee code + mật khẩu.
- OTP cho kích hoạt và khôi phục.
- MFA cho admin/payroll.
- SSO ở giai đoạn enterprise.
- Session có thời hạn.
- Re-authentication trước dữ liệu nhạy cảm.

### 18.2. Mật khẩu và token

- Không tự lưu mật khẩu dạng có thể giải mã.
- Refresh token có cơ chế thu hồi.
- Service secret không xuất hiện ở frontend.
- Token tích hợp được mã hóa.
- Có rotation và expiration.

### 18.3. Phân quyền

- Kiểm tra ở API.
- RLS ở PostgreSQL là defense in depth.
- Kiểm tra quyền cho từng hành động, không chỉ từng màn hình.
- Test cả allow và deny.

### 18.4. Dữ liệu nhạy cảm

- Mã hóa trường ngân hàng, lương và định danh cần thiết.
- File dùng signed URL có thời hạn.
- Không đưa dữ liệu nhạy cảm vào application log.
- Mask dữ liệu trên UI khi không cần hiển thị đầy đủ.
- Không lưu dữ liệu Face ID; biometric chỉ được hệ điều hành xác thực cục bộ.

### 18.5. Audit

Audit log cần append-only và bao gồm:

- Actor.
- Tenant.
- Action.
- Resource.
- Before/after hoặc diff.
- Timestamp.
- Request/correlation ID.
- IP/device metadata phù hợp.

### 18.6. Backup và phục hồi

- Backup database tự động.
- Point-in-time recovery cho production khi gói hạ tầng hỗ trợ.
- File storage có version/backup riêng; backup database không đồng nghĩa đã backup file.
- Diễn tập restore định kỳ.
- Ghi rõ RPO/RTO trong SLA.

---

## 19. Yêu cầu phi chức năng

### 19.1. Hiệu năng ban đầu

- P95 API thông thường dưới 500 ms, không tính job dài.
- Trang danh sách lớn dùng pagination phía server.
- Import chạy background job.
- Bảng công và báo cáo nặng được cache hoặc dựng materialized view khi cần.
- Chấm công phải chịu được tải tăng đột biến đầu/cuối ca.

### 19.2. Khả dụng

- Mục tiêu MVP production: 99,9% sau khi hệ thống ổn định.
- Health check cho API, database, queue và integration.
- Retry có giới hạn.
- Dead-letter queue cho job lỗi.
- Không retry vô hạn.

### 19.3. Khả năng mở rộng

Mốc thiết kế ban đầu:

- 10.000 nhân viên/tenant lớn.
- 100.000+ nhân viên toàn nền tảng ở giai đoạn scale.
- Hàng triệu attendance events mỗi tháng.

Các mốc cần được xác nhận lại bằng load test trước pilot lớn.

### 19.4. Accessibility và responsive

- Web dùng được bằng keyboard.
- Form có label/error rõ ràng.
- Màu không phải tín hiệu trạng thái duy nhất.
- Admin Web tối ưu desktop nhưng vẫn dùng được trên tablet.
- Employee Web responsive.

### 19.5. Quốc tế hóa

- MVP ưu tiên tiếng Việt.
- Chuẩn bị cấu trúc i18n ngay từ đầu.
- Lưu timestamp theo UTC, hiển thị theo timezone tenant/user.
- Tiền tệ và định dạng số không hard-code trong UI.

---

## 20. Information Architecture của Admin Web

### 20.1. Dashboard

- Tổng số nhân viên.
- Nhân sự mới/nghỉ việc.
- Đơn chờ duyệt.
- Bất thường chấm công.
- Hợp đồng/tài liệu sắp hết hạn.
- Tiến độ chốt công.
- Tiến độ payroll.
- Shortcut theo vai trò.

Dashboard phải ưu tiên ngoại lệ cần hành động, không chỉ là biểu đồ.

### 20.2. People

- Danh sách nhân viên.
- Bộ lọc và view lưu sẵn.
- Hồ sơ chi tiết theo tab.
- Import/export.
- Tác vụ hàng loạt.
- Org chart.

### 20.3. Time

- Địa điểm.
- Ca.
- Lịch.
- Attendance events.
- Daily/monthly timesheet.
- Exception inbox.
- Khóa kỳ.

### 20.4. Requests

- Tất cả đơn.
- Cần tôi duyệt.
- Sắp quá hạn.
- Đã xử lý.
- Workflow configuration.
- Bulk action có giới hạn theo loại đơn.

### 20.5. Payroll

- Payroll configuration.
- Chu kỳ lương.
- Import input/result.
- Validation errors.
- Approval.
- Publish payslips.
- Payroll questions.
- Advances.

### 20.6. Integrations

- Google Sheets.
- Import templates.
- API keys.
- Webhooks.
- Sync history.
- Conflict resolution.

---

## 21. Kế hoạch triển khai

### Giai đoạn 0 — Discovery và đặc tả (Tuần 1–2)

Kết quả:

- Product requirements document.
- Danh sách persona và vai trò.
- Ma trận quyền.
- Danh mục quy trình giấy cần thay thế.
- Rulebook công/phép/OT/payroll của doanh nghiệp pilot.
- Sitemap và wireframe Admin Web.
- ERD cấp cao.
- Danh sách integration.
- Chốt phạm vi MVP.

### Giai đoạn 1 — Foundation (Tuần 3–5)

Xây dựng:

- Monorepo.
- Dev/staging/production pipeline.
- Supabase/PostgreSQL schema ban đầu.
- Tenant context.
- Auth.
- RBAC + scope.
- RLS.
- Audit framework.
- File storage.
- Notification/outbox nền tảng.
- Design system web/mobile.

Milestone: đăng nhập được, tạo tenant, tạo user và chứng minh không truy cập chéo tenant.

### Giai đoạn 2 — Core HR và Admin Web (Tuần 6–9)

Xây dựng:

- Thiết lập tenant.
- Pháp nhân/chi nhánh/phòng ban/chức danh.
- Hồ sơ nhân viên.
- Lịch sử assignment/status.
- Import Excel/CSV.
- Google Sheets connection thủ công.
- Employee list/profile.
- Change request cơ bản.

Milestone: doanh nghiệp pilot import được nhân viên và vận hành hồ sơ trên web.

### Giai đoạn 3 — Time, Leave và Workflow (Tuần 10–14)

Xây dựng:

- Ca và lịch.
- Chấm công API/mobile.
- Daily/monthly timesheet.
- Exception detection.
- Giải trình.
- Leave policy và ledger.
- Đơn nghỉ.
- OT.
- Workflow engine.
- Manager approval.
- Khóa kỳ công.

Milestone: chạy được trọn một tuần chấm công và phê duyệt trên dữ liệu thật.

### Giai đoạn 4 — Payroll Operations, Documents và Communication (Tuần 15–17)

Xây dựng:

- Payroll configuration cơ bản.
- Import payroll input/result.
- Payroll cycle.
- Publish payslip.
- Salary advance.
- Employee documents.
- News và notification.
- Employee Web Portal.

Milestone: phát được phiếu lương thử nghiệm cho nhóm pilot.

### Giai đoạn 5 — Hardening và UAT (Tuần 18)

- E2E test.
- RLS/security test.
- Load test giờ chấm công.
- Kiểm tra import lớn.
- Backup/restore rehearsal.
- Fix accessibility và responsive.
- Hoàn thiện monitoring/runbook.

### Giai đoạn 6 — Pilot và Go-live (Tuần 19–20)

- Import dữ liệu thật.
- Đào tạo HR/manager.
- Soft launch theo nhóm.
- Chạy song song Sheet/quy trình cũ trong thời gian ngắn.
- Reconcile công/phép/payroll.
- Go-live.
- Theo dõi hằng ngày trong kỳ đầu.

---

## 22. Đội hình triển khai

Đội hình khuyến nghị:

| Vai trò | Số lượng | Trách nhiệm |
|---|---:|---|
| Product Owner/BA | 1 | Thu thập nghiệp vụ, ưu tiên backlog, UAT |
| Product Designer | 1 | UX mobile, Employee Web, Admin Web |
| Web Frontend | 1–2 | Admin và Employee Web |
| Mobile Engineer | 1 | React Native và native integration |
| Backend Engineer | 2 | API, database, workflow, integrations |
| QA Engineer | 1 | Test plan, automation, UAT |
| DevOps/SRE | 0,5 | CI/CD, monitoring, backup, security |
| HR/Payroll SME | 0,5 | Xác nhận rule và dữ liệu pilot |

Nếu chỉ có 2–3 người, cần giảm scope hoặc kéo dài kế hoạch lên khoảng 7–10 tháng.

---

## 23. Kiểm thử

### 23.1. Unit test

Ưu tiên:

- Leave accrual/ledger.
- Tính công.
- Phát hiện bất thường.
- Workflow transition.
- Payroll component rule.
- Idempotency.
- Sync mapping/validation.

### 23.2. Integration test

- API với PostgreSQL.
- RLS.
- Storage signed URL.
- Google Sheets connector.
- Queue/outbox.
- Push/email delivery.

### 23.3. E2E test

Các hành trình bắt buộc:

1. Kích hoạt → đăng ký thiết bị → chấm công.
2. Thiếu công → giải trình → manager duyệt → timesheet cập nhật.
3. Tạo đơn nghỉ → giữ phép → duyệt/từ chối → ledger cập nhật.
4. Đăng ký OT → duyệt → chuyển payroll input.
5. Import payroll → validate → duyệt → publish → nhân viên xem.
6. Tạo tạm ứng → nhiều cấp duyệt → đã chi → khấu trừ.
7. Import nhân viên từ Google Sheet → preview → xác nhận → audit.
8. Kiểm tra user tenant A không thể truy cập tenant B.

### 23.4. Load test

- Chấm công đồng thời đầu/ cuối ca.
- Dashboard HR.
- Monthly timesheet.
- Import 1.000–10.000 nhân viên.
- Publish phiếu lương hàng loạt.
- Gửi notification hàng loạt.

---

## 24. Data migration và onboarding tenant

### 24.1. Checklist onboarding

1. Tạo tenant.
2. Thiết lập pháp nhân và chi nhánh.
3. Import cơ cấu tổ chức.
4. Import nhân viên.
5. Import số dư phép.
6. Thiết lập ca và lịch.
7. Thiết lập workflow.
8. Thiết lập payroll mode.
9. Kết nối Google Sheets nếu cần.
10. Mời admin/manager.
11. Mời nhân viên.
12. Chạy dữ liệu thử.
13. Reconcile.
14. Go-live.

### 24.2. Chiến lược cutover

- Chọn ngày chốt dữ liệu cũ.
- Import snapshot.
- Chạy song song có thời hạn.
- So sánh công/phép/payroll.
- Xử lý sai lệch.
- Khóa nguồn cũ hoặc chuyển thành read-only khi tenant sẵn sàng.

Không nên duy trì hai nguồn cùng có quyền chỉnh sửa vô thời hạn.

---

## 25. Monitoring và vận hành

Theo dõi:

- API error rate và latency.
- Database connection, CPU, storage.
- Queue backlog.
- Job đồng bộ Sheet thất bại.
- Notification thất bại.
- Tỷ lệ chấm công bị từ chối.
- Tỷ lệ request lỗi.
- Mobile crash.
- Phiên bản mobile đang sử dụng.

Cảnh báo ưu tiên:

- Không thể chấm công diện rộng.
- Database unavailable.
- Queue ngừng xử lý.
- Cross-tenant access attempt.
- Payroll publish thất bại.
- Backup hoặc restore check thất bại.

Runbook cần có:

- Mất database.
- Google quota/error.
- Push notification lỗi.
- Job import bị kẹt.
- Rollback migration.
- Thu hồi token/secret.
- Khóa tenant bị xâm phạm.

---

## 26. Rủi ro và phương án giảm thiểu

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Rule HR/payroll khác nhau giữa công ty | Scope tăng mạnh | Configuration versioned, giới hạn MVP, pilot trước |
| GPS 3 m không ổn định | Chấm công sai | Bán kính cấu hình, accuracy threshold, QR/Wi-Fi/BLE fallback |
| Dùng Sheet song song quá lâu | Dữ liệu xung đột | Chỉ định source of truth, sync một chiều, conflict review |
| Rò rỉ chéo tenant | Rất nghiêm trọng | API tenant context, RLS, automated isolation tests |
| Import dữ liệu bẩn | Sai hồ sơ/lương | Staging, preview, validation, reconciliation |
| Payroll bị sửa sau công bố | Mất tin cậy | State machine, lock, correction, audit |
| Chấm công gửi trùng | Sai bảng công | Idempotency key và unique constraint |
| Self-host quá sớm | Tăng vận hành | Dùng managed Supabase cho MVP |
| Supabase vendor dependency | Khó chuyển đổi | Dùng PostgreSQL chuẩn, migration trong source control, business logic ở API |
| Mobile release chậm | Cản go-live | Employee Web fallback, feature flags, version policy |

---

## 27. Backlog ưu tiên

### P0 — Bắt buộc để pilot

- Multi-tenant và isolation.
- Auth/RBAC/audit.
- Organization và employee master.
- Import Excel/CSV.
- Google Sheets manual sync.
- Shift/schedule.
- Attendance/timesheet.
- Leave/OT/explanation.
- Workflow approval.
- Payroll result import và payslip publish.
- Salary advance.
- Notification cơ bản.
- HR Admin Web.
- Mobile employee/manager.
- Monitoring/backup.

### P1 — Sau pilot đầu tiên

- Scheduled Sheet sync.
- Employee Web hoàn chỉnh.
- Payroll input export.
- Custom request type.
- Advanced workflow conditions.
- Document expiration reminder.
- Optional read acknowledgment.
- SSO.
- Public API/webhook.
- QR/Wi-Fi attendance.

### P2 — Mở rộng thị trường

- Payroll calculation engine.
- Dedicated tenant deployment.
- Advanced reporting/BI.
- Onboarding/offboarding nâng cao.
- Recruitment.
- Performance.
- Training.
- Asset management.

---

## 28. Tiêu chí nghiệm thu MVP

### Tenant và bảo mật

- Tạo tenant mới không cần sửa code.
- Không truy cập được dữ liệu chéo tenant.
- Mọi bảng expose đều có policy phù hợp.
- Quyền được kiểm tra cả API và database.

### Nhân sự

- Import tối thiểu 1.000 nhân viên.
- Lỗi được trả về theo từng dòng.
- Chạy lại import không tạo bản ghi trùng.
- Lịch sử phòng ban/chức danh được giữ lại.

### Google Sheets

- Kết nối OAuth và chọn Sheet/tab.
- Mapping được lưu và tái sử dụng.
- Có preview/diff trước khi ghi.
- Có log, retry và file lỗi.
- Không ghi đè conflict mà không cảnh báo.

### Công–phép–đơn từ

- Chấm công không tạo event trùng.
- Bản ghi gốc không bị sửa.
- Giải trình tạo adjustment có audit.
- Số dư phép được giải thích bằng ledger.
- Workflow chạy đúng vai trò/phạm vi.
- Khóa kỳ công ngăn chỉnh sửa trái phép.

### Payroll

- Payroll configuration tách theo tenant.
- Import đầu vào hoặc kết quả theo mapping riêng.
- Kỳ lương có state machine và lock.
- Phiếu lương chỉ đúng nhân viên và người có quyền xem được.
- Có audit cho import, duyệt và công bố.

### Vận hành

- Có monitoring và cảnh báo.
- Backup thành công.
- Restore được kiểm chứng.
- Runbook sự cố đã được thử.
- Pilot chạy hết một kỳ công–lương mà không cần quay lại đơn giấy cho các quy trình trong scope.

---

## 29. Chỉ số thành công

### Adoption

- Tỷ lệ nhân viên kích hoạt tài khoản.
- Tỷ lệ chấm công qua Kavor.
- Tỷ lệ đơn được tạo trên Kavor.
- Tỷ lệ manager xử lý phê duyệt đúng hạn.

### Hiệu quả vận hành

- Thời gian HR chốt công.
- Số lỗi công/phép trước và sau Kavor.
- Thời gian xử lý một đơn.
- Số giờ tổng hợp payroll input.
- Số quy trình giấy được loại bỏ.

### Chất lượng hệ thống

- API availability.
- P95 latency.
- Mobile crash-free session.
- Tỷ lệ sync Sheet thành công.
- Tỷ lệ notification thành công.
- Số sự cố bảo mật hoặc truy cập sai phạm vi.

---

## 30. Các quyết định cần chốt trong Discovery

1. Doanh nghiệp pilot là ai và có bao nhiêu nhân viên?
2. Quy trình nào bắt buộc loại bỏ giấy trong đợt đầu?
3. Payroll pilot dùng import kết quả hay import đầu vào?
4. Dataset nào tiếp tục lấy từ Google Sheets?
5. Ai là source of truth cho employee master trong giai đoạn chuyển đổi?
6. Doanh nghiệp có bao nhiêu pháp nhân/chi nhánh?
7. Có ca đêm, ca xoay hoặc nhân viên hiện trường không?
8. Phương thức chấm công thực tế: GPS, QR, Wi-Fi hay máy chấm công?
9. Quy trình duyệt của từng loại đơn?
10. Có yêu cầu đặt dữ liệu tại Việt Nam/on-premise không?
11. SLA và thời gian lưu dữ liệu mong muốn?
12. Có cần Employee Web ngay trong pilot hay mobile là đủ?
13. Có cần SSO ngay từ đầu không?
14. Mức độ tùy chỉnh branding và domain?

---

## 31. Việc cần làm tiếp theo

Thứ tự đề xuất:

1. Chọn doanh nghiệp pilot.
2. Thu thập file nhân sự, công, phép và payroll mẫu đã ẩn dữ liệu nhạy cảm.
3. Viết rulebook nghiệp vụ của pilot.
4. Chốt ma trận nguồn dữ liệu Kavor/Google Sheets.
5. Thiết kế sitemap và wireframe Admin Web.
6. Chốt ERD và API contract.
7. Chia backlog theo sprint.
8. Xây foundation multi-tenant và security trước.
9. Phát triển Admin Web và mobile song song trên cùng API.
10. Chạy dry-run bằng dữ liệu mô phỏng trước khi nhận dữ liệu thật.

---

## 32. Tài liệu tham khảo kỹ thuật

- Supabase Database: <https://supabase.com/docs/guides/database/overview>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Regions: <https://supabase.com/docs/guides/platform/regions>
- Supabase Self-Hosting: <https://supabase.com/docs/guides/self-hosting>
- Google Sheets API Values: <https://developers.google.com/workspace/sheets/api/guides/values>
- Google Sheets API Limits: <https://developers.google.com/workspace/sheets/api/limits>

---

## 33. Kết luận

Kavor nên bắt đầu như một nền tảng HRM đa tenant có PostgreSQL làm nguồn dữ liệu vận hành chính, với Supabase Managed để rút ngắn thời gian xây dựng và giảm gánh nặng hạ tầng. Google Sheets được hỗ trợ như một cầu nối chuyển đổi, cho phép doanh nghiệp tiếp tục quy trình hiện tại trong thời gian đầu nhưng vẫn đưa dữ liệu vào database để Kavor có thể vận hành workflow, phân quyền, audit và báo cáo một cách đáng tin cậy.

MVP phải tập trung vào Core HR, công, phép, OT, giải trình, workflow, payroll operations, tạm ứng, tài liệu và truyền thông. Payroll được cấu hình theo từng tenant; chữ ký số không nằm trong scope. Sau khi pilot chạy thành công một chu kỳ công–lương, Kavor mới nên mở rộng sang payroll engine đầy đủ và các module HR khác.
