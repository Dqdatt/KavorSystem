# PROGRESS
_Cập nhật: 2026-10-29 — bởi Claude (Desktop)_

## Mục tiêu đang làm
**Phiên cloud → Desktop: đọc `docs/CLOUD_HANDOFF.md` trước** (commit nào đã push, chưa test gì trên máy thật, quyết định chờ review).
Payroll (web `/payroll`), **Bản tin** (`docs/plans/announcements.md`), **Tài liệu nhân sự** (`docs/plans/documents.md`) và **Đề nghị sửa hồ sơ**
(`docs/plans/profile-change.md`) và **Console: gói dịch vụ + tạm khóa/đóng tenant + support access** (`docs/plans/console-ops.md`) đã xong trên nhánh
`claude/ecstatic-pascal-dblg7v` (phiên cloud: web thử bằng trình duyệt tự động; mobile chỉ typecheck + test hành vi trong Node, **chưa build/chụp trên
simulator hay iPhone** vì phiên cloud không có Mac). Người dùng giao "cứ làm tiếp, review sau" (26/10): các quyết định mặc định của module Tài liệu
ghi trong `docs/plans/documents.md` chờ review. Mọi agent làm theo `docs/AGENT_PLAYBOOK.md`; kiểm tra toàn bộ bằng `bash tools/verify-all.sh`.

## Đã xong
- Mã PIN thật trên app (29/10, Claude Desktop; phản hồi mobile mục 3 — trước đây nhập 6 số bất kỳ cũng mở được lương): `apps/mobile/src/pin.ts` lưu muối +
  SHA-256 trong Keychain theo mã nhân viên; lần đầu phải tạo PIN (2 lần, chặn PIN yếu), sai 5 lần xóa PIN + đăng xuất, quên PIN = đăng xuất, đổi PIN ở Bảo
  mật và thiết bị. Mục 4: Face ID trong sheet PIN gọi thẳng hộp thoại hệ thống. Test Node `tools/pin-mobile-test.mjs` (7 ca). Người dùng đã thử PIN trên
  iPhone 11 thật: ổn.
- Làm đẹp web HR + Console theo phản hồi 26/10 (29/10, Claude Desktop; chi tiết + bằng chứng ở đầu `docs/plans/web-ui-polish.md`): CSS chung
  `packages/web-ui/src/kavor.css`, theme sáng/tối + nút đổi theme, Montserrat, `Select` tự vẽ thay 49 `<select>`, bảng không cuộn ngang ở
  1440/1280px, màu cứng → biến, bỏ h2 lặp ở 17 page-head + 5 phụ đề modal thừa, Việt hóa thuật ngữ hai web + thông báo API (migration đổi tên
  hiển thị vai trò `tenant_admin`/`hr_ops`), bản đồ Leaflet chọn vị trí chấm công (ghim kéo thả, vòng bán kính, tìm địa chỉ). Đã chụp 29 trạng
  thái trước/sau (sáng + tối) và thử bản đồ trên trình duyệt thật của Mac.
- Gửi lời mời kích hoạt hàng loạt (26/10, Claude, phiên cloud): `POST /admin/employees/invite` (tối đa 300 người, gửi lần lượt, người đã kích hoạt/đã nghỉ/
  thiếu email/ngoài phạm vi/vừa mời trong 1 phút bị bỏ qua kèm lý do; audit từng người + 1 dòng tổng). Web Nhân viên: nút "Gửi lời mời (N)" cho người
  chưa mời lần nào trong danh sách đang lọc. Smoke import thêm 4 bước; đã thử trên trình duyệt tự động.
- Nhập nhân viên hàng loạt từ CSV (26/10, Claude, phiên cloud; quyết định mặc định chờ review — `docs/plans/employee-import.md`):
  - DB `202611070001_employee_import.sql`: `import_employees()` ghi nguyên khối (hồ sơ + phân công từ ngày vào làm, quản lý trong cùng file), mã đã
    có bỏ qua; chỉ service role. pgTAP 8 (tổng 459).
  - API `POST /admin/employees/import` (`dryRun` mặc định = xem trước): kiểm tra từng dòng (bắt buộc, định dạng, trùng trong file, email đã dùng,
    phòng ban/chức danh còn hoạt động, phạm vi `employee.create`, quản lý, giới hạn gói), chỉ ghi khi cả file không lỗi; audit 1 dòng nhập + từng hồ
    sơ. Nhận cả cột `manager_employee_code` của `sample-data/employees.csv`. Unit test đọc CSV 3, smoke `tools/import-smoke.sh`.
  - Web: Nhân viên → **Nhập từ file** (tải file mẫu, xem trước từng dòng, lọc dòng lỗi, nhập). File thử `sample-data/employees_import_sample.csv`.
    Đã thử bằng trình duyệt tự động.
- Cơ cấu tổ chức + Vai trò & phân quyền trên web HR (26/10, Claude, phiên cloud; quyết định mặc định chờ review — `docs/plans/org-roles.md`):
  - DB `202611060001_org_roles.sql`: quyền `role.assign` (Tenant Admin), `organization.manage` (HR Ops + Tenant Admin — trước đây chỉ có trong seed
    nên chưa ai có); trigger đơn vị cha cùng tenant + phòng ban không tạo vòng; ngày kết thúc ≥ ngày hiệu lực; không gán trùng vai trò + phạm vi đang mở.
    pgTAP 15 (tổng 451).
  - API `/admin/organization` (cây + chỉ số), thêm/sửa/ngừng đơn vị (ngừng bị chặn khi còn phân công nhân viên, đơn vị con, vai trò, quy định;
    đơn vị tạo nhầm chưa từng hiệu lực thì xóa), `/admin/roles` (5 vai trò mẫu, quyền, người được gán), gán/thu hồi vai trò theo phạm vi hợp lệ của
    từng vai trò (có tác dụng ngay; không gỡ Tenant Admin cuối cùng; người chưa kích hoạt được gán trước). Danh sách chọn ở form nhân viên bỏ đơn vị đã
    ngừng. Smoke `tools/org-smoke.sh` (41 bước).
  - Web: trang **Cơ cấu tổ chức** (bám page-organization: chỉ số + sơ đồ khối; "Danh sách" = cây có thao tác + chức danh) và **Vai trò & phân quyền**
    (bám page-roles + drawer chi tiết, form gán, thu hồi). Nav thêm "Cơ cấu tổ chức" (Nhân sự) và "Hệ thống → Vai trò & phân quyền". Checklist
    thiết lập trỏ bước tổ chức sang `/organization`. Đã thử bằng trình duyệt tự động.
- Support access có thời hạn (26/10, Claude; quyết định mặc định chờ review — `docs/plans/console-ops.md` phần B):
  - DB `202611050001_support_access.sql`: `support_access_sessions` (ticket, lý do, phạm vi settings/directory/audit, 30/60 phút; nội dung bất biến;
    thời hạn do DB tính lúc duyệt; chỉ chuyển pending→approved/rejected/cancelled, approved→revoked/ended; yêu cầu chờ hết hạn sau 24 giờ; một yêu cầu
    chờ mỗi người mỗi tenant); `support_session_active()` (tenant tạm khóa thì mất hiệu lực); quyền `support_access.approve` cho Tenant Admin; thành viên
    tenant đọc được (Realtime). pgTAP 18 (tổng 436).
  - API Console `/console/support` (danh sách, yêu cầu, `/:id/close` hủy/kết thúc, `/:id/view/:scope` xem chỉ đọc + audit `support.viewed` mỗi lần);
    web HR `/admin/support/banner`, `/admin/support`, `/admin/support/:id/approve|reject|revoke`. Phạm vi không có điện thoại/email/lương/tài khoản
    ngân hàng; nhật ký không có dữ liệu trước/sau. Smoke `tools/support-smoke.sh` (36 bước).
  - Console web: trang **Support access** (bám page-access + modal requestAccess; phạm vi là dữ liệu Kavor có, thêm mã ticket) và **chế độ hỗ trợ**
    `/support/[id]` (banner đỏ đếm ngược, tab theo phạm vi, ẩn dữ liệu khi hết giờ). Web HR: banner xanh dương trên mọi trang khi Kavor đang hỗ trợ (mọi
    người dùng) hoặc có yêu cầu chờ (Tenant Admin); Cài đặt → tab **Hỗ trợ Kavor** duyệt/từ chối/thu hồi. Đã thử bằng trình duyệt tự động cả hai phía.
- Kavor Console — gói dịch vụ, giới hạn nhân sự, tạm khóa/mở lại/đóng tenant (26/10, Claude; quyết định mặc định chờ review — `docs/plans/console-ops.md` phần A):
  - DB `202611040001_tenant_lifecycle.sql`: `platform_plans` (Dùng thử 50, Starter 100, Growth 500, Enterprise theo hợp đồng); `tenants.status_reason`,
    `status_changed_at`; trigger: chỉ đóng tenant đang tạm khóa, đã đóng không mở lại; RLS (`is_active_member`, `current_employee_ids`,
    `permission_scopes`, hồ sơ của chính mình) bỏ qua tenant tạm khóa/đã đóng. pgTAP 14 (tổng 418).
  - API: `/console/plans`, `/console/tenants/:id/plan`, `/console/tenants/:id/status` (chỉ Platform Operator, bắt buộc lý do, đóng phải gõ lại mã,
    audit tenant thấy); chặn mọi người dùng của tenant tạm khóa/đóng (đăng nhập, kích hoạt, làm mới phiên, mọi request — `AUTH_TENANT_SUSPENDED`);
    giới hạn nhân sự khi HR thêm hồ sơ hoặc đưa hồ sơ đã nghỉ về đang làm (`EMPLOYEE_LIMIT_REACHED`); không cho khôi phục chủ sở hữu/gửi lời mời trên
    tenant đã đóng/không hoạt động. Smoke `tools/console-ops-smoke.sh` (39 bước).
  - Console web: drawer tenant có mục "Gói dịch vụ và trạng thái" (Đổi gói, Tạm khóa, Mở lại, Đóng tenant), banner đỏ lý do khi tạm khóa/đóng; trang
    **Gói dịch vụ** (thẻ gói theo page-subscriptions + bảng "Tenant gần giới hạn" của page-usage); Tổng quan đếm tenant gần giới hạn/tạm khóa; cột nhân sự tô
    màu khi ≥ 90%. Web HR: Cài đặt → Thông tin tenant hiện gói + số nhân sự đang dùng. App: màn lỗi "Công ty tạm ngừng sử dụng Kavor" (khung E16).
    Đã thử bằng trình duyệt tự động (đổi gói, tạm khóa, mở lại, trang Gói dịch vụ, tổng quan, Cài đặt web HR); app chỉ test Node (18 ca).
- Đề nghị sửa hồ sơ (26/10, Claude; theo quyết định người dùng — `docs/plans/profile-change.md`): nhân viên đề nghị sửa điện thoại, email cá nhân,
  địa chỉ, liên hệ khẩn cấp, tài khoản ngân hàng (thuộc hồ sơ nhân viên); HR duyệt (một bước, 48 giờ); Kế toán chỉ đọc tài khoản HR đã duyệt.
  - DB `202611030001_profile_change.sql`: loại đơn `profile_change` (mã HS), mỗi nhân viên một đề nghị đang chờ; `employee_profiles`,
    `employee_bank_accounts`, `profile_change_bank` (số tài khoản đầy đủ tách khỏi nội dung đơn — đơn/audit chỉ có 4 số cuối); trigger áp vào hồ sơ khi
    đơn được duyệt (hủy/từ chối không đổi gì); quyền mới `employee.sensitive.read` (HR Operations, Tenant Admin, Kế toán). pgTAP 28 (tổng 404).
  - API `POST /me/requests/profile` (chuẩn hóa, chỉ gửi trường thay đổi, lưu giá trị cũ để so sánh); `/me/profile` thêm thông tin cá nhân + đề nghị đang
    chờ; hồ sơ nhân viên web và tab Lương cơ bản thêm thông tin/tài khoản; số đầy đủ chỉ cho chính nhân viên và người có `employee.sensitive.read`
    trong phạm vi (quản lý xem đơn chỉ thấy 4 số cuối). Smoke `tools/profile-smoke.sh`.
  - Web: modal Đơn & phê duyệt hiện từng trường "cũ → mới"; drawer hồ sơ nhân viên mục "Thông tin cá nhân"; Lương cơ bản thêm cột tài khoản ngân hàng.
    Đã thử trên trình duyệt tự động: nhân viên gửi → HR mở HS-0001, duyệt → hồ sơ web + app cập nhật.
  - Mobile (bản dùng API): "Đề nghị sửa" mở form điền sẵn hồ sơ hiện tại (lỗi hiện trong form), Hồ sơ hiện thẻ "Đề nghị sửa thông tin đang chờ HR" →
    chi tiết đơn, dòng địa chỉ/liên hệ khẩn cấp/ngân hàng (4 số cuối); đơn HS trong Đơn từ/Cần duyệt. Chỉ typecheck + test hành vi Node (17 ca),
    **chưa build/chụp trên simulator/iPhone** (form REMOTE là thiết kế bổ sung — prototype chỉ có điện thoại + địa chỉ).
- Hồ sơ trên app đọc từ API (26/10, Claude): `GET /me/profile` (chỉ đọc: chức danh, phòng ban, chi nhánh, quản lý, ngày vào làm, loại hợp đồng,
  điện thoại, email công ty, hợp đồng HR chia sẻ gần nhất). Màn Hồ sơ bản dùng API hiện dữ liệu thật (thâm niên tính từ ngày vào làm, điện thoại che
  giữa); bỏ thẻ mẫu "Đổi tài khoản ngân hàng đang chờ HR" và các dòng chưa có trong Kavor (địa chỉ, liên hệ khẩn cấp, ngân hàng). Nút "Đề nghị sửa
  thông tin" ở bản dùng API chỉ báo "sẽ có ở bản sau, liên hệ HR" (không giả vờ đã gửi). Smoke tài liệu thêm 2 bước hồ sơ (42); test mobile 15.
- Tài liệu nhân sự (26/10, Claude; quyết định mặc định chờ người dùng review — xem `docs/plans/documents.md`):
  - DB `202611020001_documents.sql`: tài liệu gắn nhân viên (6 danh mục, số văn bản, hiệu lực/hết hạn, quyền xem "HR + Nhân viên"/"Chỉ HR"),
    phiên bản bất biến kèm SHA-256 + `scan_status` (chưa có dịch vụ quét → `not_scanned`), gỡ có lý do thay cho xóa; quyền
    `document.self.read` (Nhân viên) / `document.read|upload|manage` (HR Operations, Tenant Admin) theo phạm vi, hàm SQL kiểm lại phạm vi. pgTAP 32 test.
  - API `/admin/documents*` (bảng + 4 chỉ số, tạo kèm file, phiên bản mới, sửa, gỡ, tải từng phiên bản) và `/me/documents*` (danh sách, liên kết ký
    5 phút). Mọi lần tải ghi audit `document.downloaded` (HR/nhân viên). Lưu file riêng tư + liên kết ký gom vào `apps/api/src/files/` dùng chung với
    Bản tin (chữ ký gắn loại tài nguyên). Bucket `employee-documents`.
  - Web `/documents` (menu Vận hành theo prototype: Đơn & phê duyệt, Lương & tạm ứng, Tài liệu, Bản tin): bám `page-documents` (4 chỉ số, bảng
    Tài liệu/Nhân viên/Danh mục/Version/Hết hạn/Quyền, "Tải tài liệu"); "Thiếu hồ sơ" = nhân viên đang làm chưa có hợp đồng còn hiệu lực;
    "Tạo từ mẫu" chưa làm (không hiện nút). Thiết kế bổ sung: lọc trạng thái, chi tiết + lịch sử phiên bản, tải phiên bản mới, sửa, gỡ.
  - Mobile: Hồ sơ → "Hợp đồng và quyết định" (bản dùng API; prototype chỉ có toast P05–P06 → thiết kế bổ sung), qua cổng PIN/Face ID như phiếu
    lương, bấm mở file bằng trình xem của máy. Bản mẫu/QA giữ toast.
  - Kiểm tra: smoke tài liệu 40 bước (fixture vai trò riêng chỉ có quyền tài liệu để không ảnh hưởng test RLS khác); test mobile 14
    (`tools/content-mobile-test.mjs`: bản tin 5 + tài liệu 3); E2E Playwright web (tải hợp đồng → nhân viên thấy qua API → phiên bản 2 → đổi Chỉ HR
    → nhân viên không còn thấy → gỡ). Verify-all đầy đủ: xem Nhật ký.
- Bản tin nội bộ (26/10, Claude; người dùng chốt: đính kèm file tùy bài, chỉ tính "đã mở", HR chọn gửi thông báo từng bài):
  - DB `202611010001_announcements.sql`: bài (danh mục, quan trọng, ghim, người/bộ phận đăng, một file PDF/ảnh ≤ 5 MB), người nhận toàn công ty
    hoặc chi nhánh/phòng ban (gồm phòng con, tính lúc đọc), nháp/hẹn giờ/xuất bản/gỡ (đã xuất bản không xóa, đã gỡ không sửa), lượt đọc bất biến,
    quyền `announcement.read` (Nhân viên) / `announcement.publish` (HR Operations, Tenant Admin; cần phạm vi toàn công ty, SQL kiểm lại).
    Thông báo `announcement.published` do `notify_due_announcements()` tạo (gọi khi xuất bản + chu kỳ quét 10 phút cho bài hẹn giờ), không chép nội dung.
    Seed 11 bài theo nội dung prototype mobile (1 riêng phòng Nhân sự, 1 hẹn giờ, 1 nháp). pgTAP 43 test.
  - API `/admin/announcements*` (soạn, sửa, xuất bản/hẹn, hủy hẹn, gỡ, xóa nháp, file, thống kê đã đọc + danh sách người nhận) và `/me/announcements*`
    (danh sách, mở = đã đọc, liên kết tải file ký 5 phút để mở bằng trình duyệt hệ thống). Bucket riêng tư `announcement-files`. JSON API 4 → 8 MB.
  - Web `/announcements` (menu Vận hành theo prototype: Đơn & phê duyệt, Lương & tạm ứng, Bản tin): bám `page-announcements` (Bài đang xuất bản,
    Lịch xuất bản, Tạo bài viết); thiết kế bổ sung: bảng tất cả bài + lọc trạng thái, soạn/sửa (chọn đơn vị, nội dung chữ thuần "- " = gạch đầu dòng,
    file, quan trọng/ghim/gửi thông báo), xuất bản ngay/hẹn giờ theo giờ công ty, chi tiết + người chưa đọc, gỡ/xóa. Chuông web mở được bài.
    Sửa CSS dùng chung `.check-row` cho radio (chụp lại form Thêm nhân viên, Tạo mẫu ca: không lệch).
  - Mobile nhánh `REMOTE`: tab Bản tin, chi tiết, thẻ "Bản tin mới" Trang chủ (bài 2 ngày gần nhất), thông báo mở đúng bài, mở file qua `Linking`
    (không thêm native module). Nhánh mẫu/QA giữ nguyên prototype. "Lưu tin"/"Chia sẻ" vẫn là toast như prototype.
  - Kiểm tra: smoke bản tin 51 bước; test mobile 11 (thêm `tools/news-mobile-test.mjs` 5 ca); E2E Playwright web (soạn bài Marketing có PDF →
    xuất bản → nhân viên mở qua API → thống kê 1/2 → hẹn giờ → xóa nháp → gỡ). `bash tools/verify-all.sh` đầy đủ: TẤT CẢ ĐẠT — pgTAP 344,
    12 smoke (announcements 51, payroll 105, …), build, lint DB.
  - File CSV mẫu để thử nhập kỳ lương: `sample-data/payroll_import_2026-10.csv` (đã nhập thử qua API: 9 dòng, 0 lỗi).
- Web payroll (26/10, Claude, nhánh `claude/ecstatic-pascal-dblg7v`): mục menu Tài chính đổi thành **Lương & tạm ứng** `/payroll`
  (hiện khi có một trong `payroll.read` / `salary_advance.process` / `compensation.read`), tab theo quyền:
  - **Kỳ lương** (`payroll/cycles.tsx`, bám `page-payroll` + modal `payrollImport` của prototype HR): chọn kỳ, Mở kỳ lương (tháng +
    ngày trả, mặc định tháng sau kỳ mới nhất, ngày 05 tháng kế), banner + "Tải file mẫu" (chỉ header theo danh mục thành phần),
    4 chỉ số, "Danh sách lỗi cần xử lý" (lỗi chặn + cảnh báo đối chiếu, nhóm theo mã, "Tải file lỗi" CSV), "Quy trình kỳ lương"
    6 bước theo trạng thái + nhật ký, bảng kết quả (bấm xem phiếu Thu nhập/Khấu trừ/Thực lĩnh), lịch sử nhập file.
    Nút chuyển trạng thái lấy từ `actions` của API (người nhập lần cuối không thấy nút Duyệt, hiện "Chờ Kế toán khác duyệt");
    Mở lại (approved → prepared) dùng `ReasonModal`. Thiết kế bổ sung: chọn/mở kỳ, bảng kết quả, lịch sử nhập, nhật ký, bước 5–6.
  - **Tạm ứng** và **Lương cơ bản**: chuyển nguyên từ trang cũ sang `payroll/advances.tsx`; `/advances` chuyển hướng sang
    `/payroll?tab=advances|salary`.
  - Sửa API `detail`: lỗi `EMPLOYEE_UNKNOWN` của mã không thuộc công ty (gõ sai, mã tenant khác) bị bộ lọc phạm vi ẩn khỏi danh sách
    lỗi (toast báo 3 lỗi, trang chỉ hiện 2). Nay chỉ ẩn mã của nhân viên công ty nằm ngoài phạm vi người xem; smoke payroll thêm 1 bước.
  - Kiểm tra: E2E Playwright trên Supabase local + API + `pnpm dev:admin` (phiên cloud): Kế toán 1 mở kỳ → nhập file lỗi (3 lỗi
    hiện đủ) → nhập file đúng 9 dòng → gửi kiểm tra (không có nút Duyệt) → Kế toán 2 duyệt → công bố → xem phiếu → đã trả → đóng;
    `/advances` chuyển hướng đúng; màn 390 px không tràn. `bash tools/verify-all.sh` đầy đủ: TẤT CẢ ĐẠT — typecheck, unit,
    pgTAP 301, smoke advance 31 · attendance 19 · auth 15 · console 44 · hr 64 · leave 39 · notifications 21 · overtime 28 ·
    payroll 105 · settings 74 · timesheet 48, build, lint DB. Admin-web vẫn chưa có test tự động (placeholder).
- Sửa smoke đầu kỳ công (26/10, Codex; người dùng duyệt đúng 3 script leave/notifications/timesheet):
  - Leave chọn ngày làm việc đã qua gần nhất từ API; khi kỳ mới chưa có ngày đã qua thì đọc kỳ trước,
    đối chiếu bảng công đúng tháng chứa ngày nghỉ. Năm lấy từ `today` của tenant thay ngày máy Mac.
  - Notifications/timesheet tự tạo fixture chấm công 45 ngày gần đây trong DB local vừa reset, dùng `tenant_today`
    và timezone tenant, bỏ cuối tuần/lễ. Chỉ fixture reset bảng sự kiện rồi nạp mẫu; gửi/duyệt/đọc/khóa/mở vẫn qua API thật.
    Không đổi API, UI, migration, seed hay quy định. Kỳ của ngày giải trình được chọn rõ ở từng request đọc lại;
    hai ngày gần nhau có thể thuộc hai kỳ, quota và số đơn được đối chiếu đúng kỳ thay giả định cùng kỳ hiện tại.
  - `bash -n tools/leave-smoke.sh tools/notifications-smoke.sh tools/timesheet-smoke.sh` đạt.
    Mỗi script chạy trên DB vừa reset đều exit 0: leave 39, notifications 21, timesheet 48.
  - `bash tools/verify-all.sh` đầy đủ: TẤT CẢ ĐẠT, exit 0 (ngày đầu kỳ 26/10): typecheck mọi package;
    unit contracts 6 + API 34 + mobile 6; pgTAP 301; advance 31, attendance 19, auth 15,
    console 44, HR 64, leave 39, notifications 21, OT 28, payroll 104, settings 74, timesheet 48;
    build 6/6, lint không lỗi, chỉ cảnh báo cũ `p_actor` chưa dùng.
  - Sau kiểm tra đã khôi phục snapshot dữ liệu/Auth gốc trong transaction COMMIT exit 0; UUID người dùng,
    số thiết bị/kỳ/lượt xem/Auth users/sessions khớp bản trước kiểm tra. API và Auth health 200, LAN .3.
    Đã mở lại Kavor trên iPhone Dqdatt qua devicectl thành công và xác nhận tiến trình còn chạy.
    Bản Face ID đã cài không thay đổi trong lượt sửa test; chờ người dùng xác nhận riêng animation máy thật. Không commit.
- Sửa nhẹ vòng chờ Face ID từ PIN (26/10, Codex, theo ảnh iPhone người dùng gửi):
  - Đổi đúng kiểu dáng vòng `FaceRing`: kích thước cố định 110×110, radius 55 thay khung vuông bo góc quay.
    Biểu tượng Face ID đứng yên; không sửa luồng xác thực/PIN hay component UI dùng chung.
  - `pnpm --filter @kavor/mobile typecheck` đạt; 6/6 test hành vi payroll đạt.
    Thêm QA state `faceid-scanning`, chụp/ghép prototype/native; xem 8 frame từ video simulator thấy vòng tròn ổn định ở các góc quay.
    Manifest ghi thay đổi có chủ đích so với prototype; ảnh/video không thay xác nhận máy thật.
  - Release QA=0/API .3: BUILD SUCCEEDED, codesign đạt, cài devicectl qua localNetwork success.
    Người dùng đã xác nhận thao tác payroll còn lại ổn ở bản trước; cần thử lại riêng vòng chờ trên bản mới.
  - `bash tools/verify-all.sh` exit 1: typecheck, unit, pgTAP 301, 8 smoke khác (payroll 104), build, lint đạt;
    leave/notifications/timesheet lỗi do hôm nay 26/10 bắt đầu kỳ công, script giả định kỳ hiện tại có ngày đã qua/dữ liệu chấm công mẫu.
    Ở lượt này đã xin duyệt đúng 3 script; sau đó người dùng duyệt và cả 3 được sửa/kiểm tra đạt ở mục trên.
    Lỗi leave và notifications: IndexError khi lấy phần tử đầu của mảng ngày rỗng;
    timesheet: kiểm số ngày chấm công/thiếu của seed thất bại vì kỳ mới chưa có dữ liệu.
  - Đã giữ snapshot DB/auth mới nhất trước verify, tạm đóng app khi reset; khôi phục bằng supabase_admin trong transaction COMMIT exit 0.
    User UUID, thiết bị, kỳ, lượt xem và số Auth user/session khớp trước kiểm tra. Không commit; lỗi kiểm tra tổng của lượt này đã được xử lý và chạy lại đạt ở mục trên.
- Phiếu lương mobile thật + sửa bấm thông báo (25–26/10, Codex; người dùng duyệt mở rộng phạm vi mobile):
  - `payslip.published`/link `payslip` mở đúng tháng, đi qua cổng PIN/Face ID sẵn có rồi mới gọi API;
    không tìm trong danh sách đơn duyệt nên không còn trả toast “đơn đã xử lý”. Danh sách/chi tiết dùng
    `/me/payslips` và `/me/payslips/:month`, nhãn/item/ngày công từ API, ẩn/hiện tiền giữ nguyên.
  - Không trộn ngân hàng/phiếu mẫu vào nhánh API; có loading, retry, trống, lỗi/404. Đăng xuất xóa cache lương trong RAM,
    bỏ phản hồi cũ đang tải. API chỉ có tháng đã công bố nên không bịa kỳ sắp tới; PDF “sẽ có ở bản sau”, Hỏi HR vẫn cục bộ theo plan.
  - `pnpm --filter @kavor/mobile typecheck` đạt; `pnpm --filter @kavor/mobile test` 6/6 ca thật:
    thông báo → mở khóa → API đúng tháng, item/ngày công/ẩn tiền, danh sách trống, 404 bỏ dữ liệu cũ,
    link sai tháng không gọi HTTP, đăng xuất khi request đang chạy. Typecheck api/admin-web/console-web cũng đạt.
  - `bash tools/verify-all.sh` đầy đủ: TẤT CẢ ĐẠT, exit 0; typecheck mọi package, unit contracts 6 + API 34 + mobile 6,
    pgTAP 301; advance 31, attendance 19, auth 15, console 44, HR 64, leave 39, notifications 20,
    OT 28, payroll 104, settings 74, timesheet 47; build đạt, lint chỉ cảnh báo cũ `p_actor` chưa dùng.
  - Đã chụp/ghép/xem hai state `payroll-api-list`/`payroll-api-detail`; dùng fixture prototype qua contract, không chụp lương thật.
    Prototype đặt khung 414×896 tương ứng iPhone 11 rồi chuẩn hóa 390×844. Manifest ghi rõ còn lệch component cũ:
    padding/font và hàng NET thấp hơn khoảng 12 px; không khẳng định khớp pixel, không sửa component dùng chung.
  - Đã snapshot DB/auth trước verify, tạm dừng app trên iPhone; sau verify khôi phục nguyên dữ liệu bằng transaction.
    Lần đầu rollback vì postgres local thiếu quyền auth.schema_migrations; khôi phục bằng supabase_admin COMMIT exit 0.
    UUID HD0142, số thiết bị, kỳ lương và lượt xem khớp snapshot. HD0142 đã kích hoạt; không cần kích hoạt lại.
  - Release build QA=0, xóa Metro cache, API `http://192.168.1.3:4000/api/v1` (IP LAN mới 26/10), BUILD SUCCEEDED,
    codesign đạt; bundle có route/API mới, không còn .22. Cài/launch devicectl success qua localNetwork, process còn chạy.
    Chờ người dùng xác nhận bấm thông báo/PIN/Face ID và số liệu trên máy thật; không commit.
- Cài Release lên iPhone 11 Dqdatt qua **Wi-Fi** (25/10, Codex):
  - Xác nhận devicectl `transportType: localNetwork`, tunnel connected. Build bằng xcodebuild Release,
    API `http://192.168.1.22:4000/api/v1`, `EXPO_PUBLIC_KAVOR_QA=0`, xóa Metro cache trước build; không prebuild/native regenerate.
    `BUILD SUCCEEDED`, mã 0; codesign verify đạt; bundle chứa API .22, không còn .83.
  - `xcrun devicectl device install app ...` đạt (JSON outcome success); launch đạt, kiểm sau launch Kavor vẫn chạy trên máy thật.
    Đây là bằng chứng cài/khởi động, chưa phải người dùng xác nhận thao tác nghiệp vụ/animation/Face ID trên iPhone.
  - Chuẩn bị dữ liệu qua API thật: kích hoạt hai Kế toán, mở kỳ 2026-10, nhập CSV mẫu không lỗi, người thứ hai duyệt và công bố.
    HD0142 chưa kích hoạt; thông báo sẵn: "Phiếu lương 10/2026 đã công bố", body không có tiền, icon receipt.
    Người dùng tự kích hoạt HD0142 trên iPhone, lấy OTP đúng email ở Mailpit và tự đặt mật khẩu; không lưu thông tin đăng nhập.
  - Kịch bản người dùng thử: cùng Wi-Fi + API Mac đang chạy → kích hoạt → chuông thông báo (icon/body) → Bảo mật và thiết bị,
    bật Face ID, mở lại app/vào Tạm ứng. Màn Phiếu lương và hành động bấm thông báo payroll chưa nối API, vẫn mẫu; không dùng
    kết quả màn mẫu để xác nhận CSV nhập. Không sửa mã app trong bước cài, không commit; verify đầy đủ trước đó vẫn đạt.
- Payroll — **contracts + API + smoke** (25/10, Codex; endpoint/lỗi/cảnh báo/đối chiếu được duyệt trước khi code; không commit):
  - Contracts cho kỳ lương, thành phần/item snapshot, batch, lỗi/cảnh báo theo dòng/cột, bước chuyển trạng thái và phiếu cá nhân.
    API `/admin/payroll/cycles` (danh sách/mở kỳ/chi tiết/nhập CSV/submit/approve/publish/paid/close/reopen),
    `/me/payslips` và `/me/payslips/:month` (ghi lần xem đầu). Nối service vào app.module/admin.controller/timesheet.controller
    theo khuôn AdvanceService; mọi request kiểm permission + phạm vi, ngoài phạm vi 404, web bắt buộc MFA.
  - CSV UTF-8/BOM, CRLF, quote/ghi chú nhiều dòng, VND nguyên có/không dấu chấm; earning/deduction không âm, NET được âm.
    Chặn lỗi header/mã NV/trùng dòng/số/NET/ngày công/ghi chú; batch giữ chẩn đoán `severity` trong JSON `warnings` hiện có,
    API tách `errors`/`warnings`. File lỗi không thay kết quả cũ và chặn gửi lại; file hợp lệ thay toàn bộ qua SQL nguyên tử.
  - Cảnh báo không chặn: ADVANCE so tổng đã chi cùng tháng khấu trừ; OT_PAY so OT đã duyệt trong kỳ công; work_days so credited;
    thiếu NV làm việc trong kỳ; kỳ công chưa khóa. Dùng kỳ đã chụp khi mở payroll, kể cả HR đổi periodStartDay sau đó;
    kỳ công đã khóa đọc snapshot. Công bố đối chiếu tạm ứng lại trong SQL; khớp mới đánh dấu, lệch/thiếu dòng vẫn công bố và giữ null.
    Audit đọc/ghi chỉ metadata, không chép tiền/CSV/note; lỗi SQL được làm sạch để không lộ failing row có tiền qua log/API.
  - Người dùng duyệt sửa tối thiểu auth: kích hoạt gán role hệ thống employee scope self, ngày hiệu lực từ tenant_today;
    giữ role đã gán trước, không tự cấp lại khi đăng nhập/đọc phiếu sau khi bị thu hồi. Chỉ áp lúc kích hoạt mới, không backfill
    tài khoản đã active từ trước. UI chỉ thêm đúng một dòng icon payslip.published ở web (pay) và mobile (receipt), theo duyệt.
  - `bash tools/db-reset.sh && bash tools/payroll-smoke.sh`: **104 bước đạt**, mã 0, không traceback; kịch bản qua API thật,
    quy định nhận tạm ứng tới cuối tháng, ngày từ API tenant. Kiểm lỗi, hai chiều OT, ngày công, tạm ứng chưa chi/đã chi/lệch/thiếu,
    khóa kết quả/tách người duyệt/mở lại/phiếu cá nhân/thông báo không có tiền/thu hồi quyền/snapshot sau khi đổi kỳ công.
  - `bash tools/verify-all.sh` đầy đủ: **TẤT CẢ ĐẠT**, mã 0; typecheck 6/6, unit thật contracts 6 + API 34,
    pgTAP 301, 11 smoke (advance 31, attendance 19, auth 15, console 44, HR 64, leave 39, notifications 20, OT 28,
    payroll 104, settings 74, timesheet 47), build 6/6, lint không lỗi (chỉ cảnh báo cũ p_actor chưa dùng ở grant_tenant_admin).
    Không sửa migration/seed. UI payroll, export/PDF và thử thiết bị thật chưa làm; test UI hiện vẫn là placeholder.
- Payroll — **chỉ phần DB** (25/10, Codex; phạm vi và bốn quyết định đã được người dùng duyệt trước khi code):
  - Migration mới `202610310001_payroll.sql`: permission + gán vai trò Kế toán (không cấp mặc định reopen), `pay_components`,
    `payroll_cycles`, `payroll_import_batches`, `payroll_results`, `payroll_result_items`, `payroll_cycle_events`, `payslip_views`.
    Thành phần mẫu qua `tenant_policy_templates` + `provision_pay_components()` cho tenant đang có và luồng tạo tenant mới.
  - Mở kỳ theo tháng kết thúc, chụp kỳ công tenant; ghi batch bất biến; thay toàn bộ kết quả/item trong hàm SQL nguyên tử.
    File lỗi/chưa áp thành công chặn submit, nhập lại lúc under_review trả về prepared. SQL kiểm tổng earning/deduction/NET,
    VND nguyên, tenant/phạm vi, đúng người nhập batch; người duyệt khác người nhập thành công lần cuối.
  - Chuyển trạng thái bằng hàm SQL khóa dòng kỳ. Service role chỉ SELECT/gọi hàm, không DML/TRUNCATE bảng payroll.
    Trigger khóa thêm/sửa/xóa kết quả và item từ approved. Mở lại chỉ approved → prepared, quyền riêng + lý do;
    published/paid/closed chưa được mở lại. Sự kiện bất biến giữ actor/lý do, không chép số tiền lương vào audit.
  - RLS: nhân viên có self.read chỉ thấy phiếu của mình khi published/paid/closed; payroll.read theo phạm vi;
    batch/sự kiện cả kỳ chỉ đọc khi có phạm vi toàn bộ nhân viên. Item chụp mã/tên/loại/thứ tự nên đổi danh mục không đổi phiếu cũ.
    Công bố tạo `payslip.published` không có số tiền; đánh dấu `salary_advances.deducted_cycle_id` khi ADVANCE khớp đầy đủ số đã chi;
    lệch/thiếu dòng giữ null và ghi cảnh báo không có tiền. Ghi lần xem đầu ở bảng riêng, không sửa kết quả đã khóa.
  - Seed thêm Kế toán thứ hai HD0216 (hư cấu, invited). Giữ nguyên dữ liệu và luồng tạm ứng cũ; không sửa migration cũ, API,
    contracts, tools, web hay mobile. `docs/plans/payroll.md` ghi các quyết định đã duyệt và giao diện hàm SQL cho bước API sau.
  - Kiểm tra: `bash tools/db-reset.sh` mã 0, Supabase sẵn sàng; `supabase test db`: `Files=12, Tests=301`, `Result: PASS`
    (109 test payroll mới, 192 test cũ). Đã thử hai kết nối psql: duyệt trước chặn nhập lại bằng `PAYROLL_RESULTS_LOCKED`;
    nhập lại trước hủy lượt xét cũ, duyệt trả `PAYROLL_TRANSITION_INVALID`; cả hai xác nhận kết nối sau chờ khóa dòng.
  - `bash tools/verify-all.sh` đầy đủ: **TẤT CẢ ĐẠT**, mã 0; typecheck 6/6, unit thật contracts 6 + API 28,
    pgTAP 301, 10 smoke (advance 31, attendance 19, auth 15, console 44, HR 64, leave 39, notifications 20, OT 28,
    settings 74, timesheet 47), build 6/6, lint không có lỗi (chỉ cảnh báo cũ `grant_tenant_admin`: `p_actor` chưa dùng).
    Tại phiên DB chưa có API/smoke/UI payroll; phần API/smoke đã làm ở mục trên. Chưa kiểm payroll trên thiết bị thật.
- Bàn giao cho agent khác (25/10): `docs/AGENT_PLAYBOOK.md` (nguyên tắc, cách port prototype → native có đối chiếu ảnh, khuôn module 11 bước,
  quy tắc nhiều agent: một agent một lúc, ghi "Đang làm", không force-push, không sửa migration đã push), mục bắt buộc ở đầu `AGENTS.md`,
  `tools/verify-all.sh` (typecheck + unit test + pgTAP + mọi smoke trên DB mới + build + lint, một lệnh), kế hoạch `docs/plans/payroll.md`.
  Khi viết lệnh kiểm tra phát hiện test contracts hỏng từ commit tạm ứng (quy định tạm ứng thêm 2 trường) → đã sửa test.
- Tạm ứng lương (25/10), theo PILOT_RULEBOOK §9, PERMISSION_MATRIX (Payroll) và DATABASE_SCHEMA §11:
  - DB `202610300001_salary_advance.sql`: vai trò hệ thống **Kế toán** (`payroll`) với `salary_advance.process`, `compensation.read`, `compensation.manage` (+ `request.read`, `employee.read`); HR/Tenant Admin/Quản lý mặc định **không** xem lương. Lương cơ bản `employee_compensations` (phiên bản theo ngày hiệu lực, không sửa/xóa, RLS: chính mình hoặc có `compensation.read`). Bước duyệt mới **Kế toán** (resolver `payroll`, người duyệt = có `salary_advance.process` với người gửi — `step_reviewers` dùng chung cho HR/Kế toán), bước có điều kiện `amountOver`. Đơn `request_type 'salary_advance'` (TU-0001) tạo nguyên tử bằng `create_advance_request`; `salary_advances` (số tiền, tháng khấu trừ, đã chi ai/khi nào/ghi chú; mỗi tháng một đơn đang chờ/đã duyệt; chỉ ghi nhận đã chi một lần khi đơn đã duyệt) + thông báo `advance.paid`. Quy định tạm ứng thêm `deadlineDay` (31 = cuối tháng) và `minAmount`. Mẫu: 30% lương cơ bản, tối thiểu 500.000, nhận đơn đến hết ngày 20, luồng Quản lý → HR (trên 5 triệu) → Kế toán. pgTAP `salary_advance.test.sql` 13 test (tổng 192).
  - API `apps/api/src/advance`: `/me/advance` (hạn mức = lương cơ bản × %, làm tròn xuống 10.000; điều kiện: chưa áp dụng, tắt, thử việc, đang báo trước nghỉ việc, chưa có lương cơ bản; hạn nhận đơn; đơn tháng này; lịch sử; người duyệt dự kiến), `/me/requests/advance` (tối thiểu, bước 10.000, hạn mức, hạn nhận đơn, mỗi tháng một lần; không chụp lương vào đơn để người duyệt không thấy lương), `/admin/advances?month=` + `/admin/advances/:id/paid` (Kế toán; không tự chi đơn của mình), `/admin/compensations` (+ đổi lương; nhật ký không ghi số tiền). Luồng duyệt: phạm vi theo quyền từng bước (HR/Kế toán).
  - Web: trang **Tạm ứng lương** (mục Tài chính, quyền `salary_advance.process`; thiết kế bổ sung — prototype HR chưa có): 4 chỉ số, đơn theo tháng khấu trừ, duyệt bước Kế toán, "Xác nhận đã chi" kèm ghi chú chuyển khoản; tab **Lương cơ bản** (nhập/đổi lương theo ngày hiệu lực). Modal đơn tạm ứng, Cấu hình workflow có bước Kế toán + "chỉ khi trên X ₫". Đã thử trên trình duyệt bằng tài khoản Kế toán.
  - Mobile (bản dùng API): màn Tạm ứng (hạn mức thật, cách tính theo lương của chính mình, hạn nhận đơn, đơn tháng này, lịch sử), Đề nghị tạm ứng (gợi ý số tiền theo hạn mức, kiểm tra trước khi gửi, xác nhận bằng PIN), chi tiết (luồng duyệt + đã chi + khấu trừ, hủy khi đang chờ); Trang chủ/menu tạo đơn hiện hạn mức thật; thông báo "đã chi".
  - Seed: Kế toán Đỗ Hồng Nhung (HD0215 · nhung.do@haidang.vn, vai trò Kế toán toàn công ty); lương cơ bản mẫu (HD0142 15 triệu như prototype).
  - Đầu-cuối trên iPhone 11 thật "Dqdatt" (API `http://192.168.1.83:4000/api/v1`): HD0142 thấy hạn mức 4.500.000 (15 triệu × 30%) → gửi TU-0001 2.000.000 ₫ xác nhận PIN → Quản lý duyệt, HR bỏ qua, Kế toán HD0215 duyệt → Kế toán xác nhận đã chi → app hiện thông báo "đã được duyệt" + "đã chi", đơn "Đã chi", hết nút tạo đơn tháng này, dòng thời gian tới Khấu trừ. Trước đó app báo không kết nối máy chủ vì IP Mac đổi (.22 → .83), build lại là được.
  - Smoke `tools/advance-smoke.sh` 31 bước; cả 10 smoke đạt; pgTAP 192; unit test API 28; build 6/6.
- Sửa lệch múi giờ (25/10): migration `202610290001_tenant_local_date.sql` thêm `tenant_today(tenant)` (ngày theo múi giờ công ty); `permission_scopes`, `scoped_employees`, `permission_grants` mặc định tính theo ngày của tenant (chữ ký giữ nguyên, `p_date` mặc định null), `active_tenant_admin_count`, trigger chặn gỡ Tenant Admin cuối cùng, trigger chặn sửa ngày lễ đã qua cũng vậy; Console API đếm/hiện Tenant Admin theo ngày của từng tenant (trước đây dùng ngày UTC). pgTAP `tenant_local_date.test.sql` 7 test chọn múi giờ test sao cho ngày tenant luôn khác ngày UTC (tổng 179). Đã chạy lại toàn bộ 9 smoke lúc 6:42–6:52 sáng giờ VN (khung giờ trước đây lỗi): đều đạt.
- Làm thêm giờ — OT (25/10), theo PILOT_RULEBOOK §8, US-043, BLLĐ 2019 Điều 98, 107 và NĐ 145/2020:
  - DB `202610280001_overtime.sql`: permission `overtime.read`; quy định OT là kind `overtime` trong khung quy định có tầng/phiên bản (hệ số ngày thường/nghỉ tuần/lễ, sàn luật 150/200/300% chặn ở API; tối đa 4 giờ/ngày làm việc, 40 giờ/tháng, 200 giờ/năm; đăng ký bù tối đa 1 ngày sau khi làm); đơn `request_type 'overtime'` (số OT-0001) tạo nguyên tử bằng `create_overtime_request`; `overtime_entries` (một khoảng giờ/đơn, bội số 30 phút, loại ngày + hệ số chụp lúc gửi) chặn trùng giờ với đơn khác và kỳ công đã khóa, không sửa được; luồng duyệt mặc định Quản lý → HR; thông báo hiện ngày/giờ/số giờ. pgTAP `overtime.test.sql` 11 test (tổng 172).
  - API `apps/api/src/overtime`: `/me/overtime` (quy định, lịch 1 ngày trước → 30 ngày sau với loại ngày + ca chính + giờ đã đăng ký, mức dùng tháng/năm, người duyệt), `/me/requests/overtime` (không trùng ca chính, ngày nghỉ tối đa 12 giờ, giới hạn ngày/tháng/năm tính cả đơn đang chờ; hệ số và giới hạn theo quy định hiệu lực **vào ngày làm thêm**, chưa có phiên bản thì dùng bản hiện hành), `/admin/overtime?month=` (tổng hợp theo tháng dương lịch trong phạm vi: giờ đã duyệt theo loại ngày, đang chờ, so với giới hạn tháng, cả năm; danh sách đơn). Bảng công: ngày có OT đã duyệt hiện số phút + hệ số, tổng kỳ `overtimeMinutes`.
  - Web HR: Chấm công → tab **Làm thêm giờ** (thiết kế bổ sung — prototype HR chưa có trang OT), modal đơn OT, Cấu hình workflow có luồng Làm thêm giờ, drawer bảng công hiện thẻ "OT x giờ · hệ số". Đã thử trên trình duyệt.
  - Mobile (bản dùng API): màn Làm thêm giờ (ngày từ lịch thật, giờ mặc định sau ca chính, hệ số theo loại ngày, đã đăng ký x/40 giờ tháng này, chặn trùng ca/đơn/vượt giới hạn trước khi gửi), đơn OT trong Đơn từ/Cần duyệt/chi tiết, bảng công + sheet ngày hiện giờ OT, menu tạo đơn hiện mức dùng tháng.
  - Đầu-cuối trên iPhone 11 thật "Dqdatt": HD0142 gửi OT-0001 (T2 26/10 17:00–19:00, ngày thường 150%) và OT-0002 (T7 31/10 08:00–10:00, ngày nghỉ 200%) → quản lý + HR duyệt → app hiện thông báo, đơn đã duyệt, "Đã đăng ký tháng 10: 4/40 giờ"; web HR tab Làm thêm giờ 4 giờ (2 ngày thường + 2 ngày nghỉ).
  - Smoke `tools/overtime-smoke.sh` 28 bước; unit test API 28; pgTAP 172 (test giờ đọc phiên bản mẫu v1 nên đạt cả trên DB đã chạy smoke); build 6/6. 9 smoke đều đạt sau khi sửa lệch múi giờ (xem mục trên).
  - Sửa kèm: khóa kỳ công được phép ngay trong ngày cuối kỳ (`end > today` → `end >= today`); modal khóa kỳ trên web tính "đã kết thúc" theo ngày UTC của trình duyệt → theo ngày giờ công ty.
- Nghỉ phép (24/10), theo PILOT_RULEBOOK §7, §9 và ADR 0001:
  - DB `202610270001_leave.sql`: permission `leave.read`/`leave.manage`; quy định phép năm là kind `leave` trong khung quy định có tầng/phiên bản (định mức ≥ 12 ngày, tích lũy theo tháng hoặc cấp đầu năm, +1 ngày mỗi 5 năm thâm niên, chuyển tối đa N ngày sang năm sau dùng tới hết tháng quy định, cho nghỉ trước tối đa N ngày, thử việc có tích lũy hay không); loại nghỉ theo tenant `leave_types` (mẫu: Phép năm trừ sổ, Không lương, Ốm đau BHXH cần minh chứng từ 2 ngày, Kết hôn 3 ngày, Tang chế 3 ngày — số ngày luật định cần chuyên gia xác nhận); sổ phép dạng ledger `leave_accounts` + `leave_transactions` (cấp, tích lũy, phép tồn, giữ chỗ, trả giữ chỗ, đã nghỉ, điều chỉnh, hết hạn; bất biến, chống ghi trùng bằng `source_key`; số dư = tổng giao dịch); đơn nghỉ `request_type 'leave'` tạo nguyên tử bằng `create_leave_request` (đơn + bước duyệt + `leave_days` + giữ chỗ), trigger trả giữ chỗ/trừ phép khi duyệt/từ chối/hủy; `leave_days` chặn trùng buổi và kỳ công đã khóa; luồng duyệt đơn nghỉ mặc định Quản lý → HR khi nghỉ trên 2 ngày (bước có `daysOver`); thông báo hiện loại nghỉ/ngày/số ngày. pgTAP `leave.test.sql` 21 test (tổng 161).
  - API `apps/api/src/leave`: sổ phép bổ sung giao dịch cấp/tích lũy/thâm niên/phép tồn/hết hạn khi đọc (idempotent; thâm niên tính tại 01/01); mobile `/me/leave` (sổ phép, loại nghỉ, lịch làm việc từ đầu kỳ công tới 60 ngày sau, người duyệt, ngưỡng HR), `/me/requests/leave` (đếm ngày làm việc theo ca + lịch lễ, nửa ngày, tối đa theo loại, không vượt năm, không đủ phép, trùng ngày, kỳ đã khóa; dùng phép âm thì thêm HR); web `/admin/leave` (bảng số dư theo phạm vi), `/admin/leave/:id` (biến động + đơn), `/admin/leave/:id/adjust` (điều chỉnh ±0,5 ngày hoặc nhập phép tồn kèm hạn dùng, có lý do, ghi nhật ký vào hồ sơ nhân viên). Luồng duyệt cấu hình được theo loại đơn. Checklist thiết lập: phép năm + luồng duyệt không còn "Sắp có".
  - Bảng công: ngày nghỉ phép đã duyệt hiện "nghỉ phép" (có lương = 1 công), nửa ngày còn nửa phải chấm; sửa lỗi công chuẩn đếm cả cuối tuần ở tương lai (kỳ 26/09–25/10 hiện 21 thay vì 20); thêm `workday`, `leave`, `leaveDays`.
  - Web HR: trang **Nghỉ phép** (bám page-leave: 4 chỉ số; bảng số dư theo nhân viên, drawer sổ phép + điều chỉnh, danh sách loại nghỉ là thiết kế bổ sung), modal đơn nghỉ trong Đơn & phê duyệt, Cấu hình workflow chọn loại đơn + "chỉ khi nghỉ trên N ngày", bảng công drawer hiện ngày nghỉ. Đã thử trên trình duyệt.
  - Mobile (bản dùng API): màn Nghỉ phép (số dư thật, đã tích lũy x/12, phép tồn, đơn của tôi), Tạo đơn nghỉ (loại nghỉ từ công ty, dải ngày theo lịch làm việc thật — ngày nghỉ/đã xin bị khóa, nửa ngày, còn lại sau đơn, người duyệt + "→ Phòng Nhân sự" khi cần, nhắc nộp minh chứng), đơn nghỉ trong Đơn từ/Cần duyệt/chi tiết, bảng công hiện ngày nghỉ; Trang chủ/Hồ sơ/menu tạo đơn lấy số phép thật.
  - Đầu-cuối trên iPhone 11 thật "Dqdatt": HD0142 thấy 8 ngày còn lại (10/12 tích lũy − 2 đầu kỳ) → gửi NP-0001 (1 ngày, chỉ quản lý) và NP-0002 (T5–T2, 3 ngày làm việc, quản lý → HR) → duyệt → app hiện còn 4 ngày, đã sử dụng 4, thông báo "đã được duyệt", ngày đã xin bị khóa trên form. Sửa sau khi thử: thông báo duyệt chỉ ghi "đã trừ vào sổ phép" khi đơn thực sự trừ phép. Ngày nghỉ trong Bảng công chưa xem được trên máy vì thuộc kỳ sau.
  - Smoke `tools/leave-smoke.sh` 39 bước; 7 smoke cũ vẫn đạt (console, settings sửa kỳ vọng bộ mẫu có 4 quy định); unit test API 27; pgTAP 161; build 6/6.
- Thông báo trong app (24/10, phạm vi gọn — không cần dịch vụ trả phí):
  - DB `202610260001_notifications.sql`: bảng `notifications` (người nhận là hồ sơ nhân viên, chỉ thêm + đánh dấu đã đọc một lần, chống trùng theo `dedupe_key`); tạo bằng trigger ngay trong transaction gốc: bước duyệt tới lượt → báo quản lý được giao hoặc mọi người có `request.hr_review` với người gửi (`hr_reviewers`, không gồm người gửi); đơn được duyệt/từ chối → báo người gửi (kèm người duyệt cuối, lý do từ chối); máy mới được duyệt/từ chối → báo nhân viên. `notify_due_approvals()` nhắc bước duyệt còn dưới 4 giờ hoặc đã quá hạn, mỗi bước tối đa 2 lần — API gọi lúc khởi động và mỗi 10 phút. RLS chỉ người nhận đọc; Realtime cho web. pgTAP `notifications.test.sql` 16 test (tổng 140).
  - API: `/me/notifications` + `/me/notifications/read`, `/admin/notifications` + `/admin/notifications/read` (đánh dấu một/nhiều/tất cả; `actionable` = thông báo "cần duyệt" mà bước còn chờ).
  - Mobile (bản dùng API): màn Thông báo thật (chấm xanh = chưa đọc lúc mở, mở màn là đánh dấu đã đọc, bấm → màn duyệt/chi tiết đơn/Bảo mật và thiết bị), chuông chỉ có chấm khi còn chưa đọc, Hồ sơ → Thông báo mở màn này; tải khi mở app/quay lại app/về trang chủ và mỗi 30 giây khi app đang mở (để chuông hiện chấm). Nhắc hạn giải trình bằng thông báo cục bộ (`expo-notifications`, `src/notify.ts`): 09:00 ngày trước hạn và ngày hạn, tính lại mỗi lần tải bảng công, bấm vào mở form giải trình ngày đó; hỏi quyền thông báo lần đầu có lịch nhắc; đăng xuất thì xóa lịch nhắc.
  - Web HR: chuông trên thanh trên (bám `icon-btn` + `ping` của prototype) với bảng thả xuống (thiết kế bổ sung), cập nhật trực tiếp; bấm mở đơn (`/requests?open=<id>`).
  - Smoke `tools/notifications-smoke.sh` 20 bước; 6 smoke cũ vẫn đạt. Đã thử trên trình duyệt: nhân viên không có quản lý gửi giải trình → chuông web HR hiện "Đơn GT-0001 cần bạn duyệt" ngay (Realtime) → bấm mở modal duyệt.
  - Đầu-cuối trên iPhone 11 thật "Dqdatt": HD0142 gửi giải trình 23/10 (GT-0002) → quản lý nhận "cần bạn duyệt" và duyệt → HR bấm chuông web, duyệt trong modal → HD0142 nhận "đã được duyệt". Sửa sau khi thử: lúc đầu chuông app không hiện chấm vì chỉ tải thông báo khi mở/quay lại app → thêm hỏi lại 30 giây/lần khi app đang mở; thử lại với thông báo thử: chuông hiện chấm đỏ, mở màn Thông báo thì hết chấm.
- Công tháng + giải trình + luồng duyệt (24/10), theo `PILOT_RULEBOOK` và ADR 0001:
  - DB `202610250001_timesheet_requests.sql`: permission `timesheet.lock`/`timesheet.unlock`/`request.self.create`/`request.read`/`request.hr_review`/`workflow.manage`; ca có ngày làm việc trong tuần (`shift_versions.work_days`, mặc định T2–T6); luồng duyệt có phiên bản (`workflow_definitions`/`workflow_versions`, mặc định Quản lý trực tiếp → Phòng Nhân sự, SLA 24 giờ mỗi bước, có trong bộ mẫu tenant mới); đơn `requests` + `request_versions` (bất biến, lưu quy định lúc gửi) + `approval_tasks`; số đơn theo tenant (`GT-0001`); duyệt/từ chối/hủy là hàm SQL nguyên tử (`decide_approval`, `create_request`, `cancel_request`); giải trình được duyệt tạo `attendance_adjustments` (bất biến, bản ghi chấm công gốc giữ nguyên); khóa kỳ `timesheet_locks` có snapshot, mở lại phải có quyền + lý do, kỳ đã khóa chặn điều chỉnh/duyệt. RLS đọc đơn qua `can_read_request()` (tránh policy đệ quy). pgTAP `timesheet_requests.test.sql` 24 test (tổng 124). Seed: kỳ công Hải Đăng bắt đầu ngày 26, chấm công mẫu cho kỳ hiện tại (HD0142 có ngày thiếu giờ ra/đi muộn còn hạn giải trình).
  - API `apps/api/src/timesheet`: tính công theo ngày (`compute.ts`, unit test: kỳ 26→25, ân hạn muộn, thiếu giờ, vắng, ngày nghỉ/lễ, điều chỉnh ghi đè, hạn giải trình theo ngày làm việc); mobile `/me/timesheet?month=`, `/me/requests` (+ gửi giải trình, hủy), `/me/approvals` (+ duyệt/từ chối); web `/admin/timesheets` (+ chi tiết nhân viên, khóa/mở kỳ, xuất CSV), `/admin/requests`, `/admin/approvals/:task/:action`, `/admin/workflows`. Kiểm tra: lượt giải trình/kỳ và hạn N ngày làm việc lấy từ quy định `explanation` theo tầng; ngày không có bất thường, chưa tới ngày, trùng ngày, kỳ đã khóa bị chặn; không ai tự duyệt đơn của mình; HR không duyệt thay bước Quản lý; từ chối phải có lý do; bị từ chối không tốn lượt và được giải trình lại. Cài đặt công ty thêm "Kỳ công bắt đầu ngày" (1–28).
  - Web HR: Chấm công → tab **Bảng công** (chỉ số, bảng theo nhân viên, drawer từng ngày, khóa/mở kỳ, xuất CSV); **Đơn & phê duyệt** bám page-requests của prototype (hàng đợi theo SLA, modal xem & duyệt) + "Cấu hình workflow" (thiết kế bổ sung); Ca & địa điểm chọn ngày làm việc trong tuần. Realtime cho `requests`/`approval_tasks`. Đã thử trên trình duyệt: HR duyệt GT-0001, drawer hiện "điều chỉnh".
  - Mobile (bản dùng API; bản QA/mẫu giữ nguyên prototype): Bảng công theo kỳ thật (chuyển kỳ, lọc đi muộn/thiếu công, ngày nghỉ gộp dải, sheet ngày có giờ gốc + giờ sau điều chỉnh), form giải trình (ngày còn hạn, lý do theo bất thường, giờ đề nghị, người duyệt theo luồng), Đơn từ/Cần duyệt/chi tiết đơn với luồng duyệt thật, hủy đơn, duyệt/từ chối; Trang chủ/Hồ sơ/menu tạo đơn lấy lượt, hạn và ngày công thật. Đính kèm minh chứng hiện "sẽ có ở bản sau".
  - Smoke `tools/timesheet-smoke.sh` 47 bước; 5 smoke cũ vẫn đạt; unit test API 25.
  - Đầu-cuối trên iPhone 11 thật "Dqdatt" (Release, API `http://192.168.1.22:4000/api/v1`): kích hoạt HD0142 → Bảng công kỳ 26/09–25/10 (16/21 công) → gửi giải trình 23/10 quên chấm ra, đề nghị 17:00 → GT-0001 → quản lý HDG0003 duyệt, HR HD0007 duyệt (qua API) → app hiện 17/21, dòng 23/10 "Đã điều chỉnh theo GT-0001", chi tiết đơn có đủ hai bước duyệt.
- Kavor Console tối thiểu (23/10), theo ADR 0001 §1:
  - DB `202610240002_platform_console.sql`: `platform_operators` (nhân viên Kavor, tách khỏi nhân viên tenant); `owner_recovery_requests` (đặt lại MFA / cấp Tenant Admin mới: bắt buộc ghi cách xác minh + lý do, người duyệt ≠ người tạo — chặn ở DB, hết hạn 24 giờ, mỗi tenant một yêu cầu cùng loại đang chờ, không sửa/xóa sau khi quyết định); `create_tenant_with_admin()` tạo tenant + bộ mẫu + Tenant Admin đầu tiên trong một transaction; `grant_tenant_admin()` idempotent (tìm theo email, chưa có thì tạo hồ sơ ADMINnn); bộ mẫu thêm cơ cấu tổ chức tối thiểu (pháp nhân, Trụ sở chính, Ban Giám đốc + Hành chính – Nhân sự, 3 chức danh) vì web HR chưa có trang Tổ chức; audit `actor_type 'platform'` (tenant cũng thấy). pgTAP `platform_console.test.sql` 21 test (tổng 100).
  - API `/console/*`: đăng nhập riêng (tài khoản tenant đúng mật khẩu vẫn báo sai chung chung), refresh, MFA TOTP bắt buộc (dùng chung `MfaAdmin` với web HR); tổng quan, danh sách/chi tiết tenant (số nhân sự, tài khoản, Tenant Admin + đã bật MFA chưa — không đọc hồ sơ/chấm công), tạo tenant + gửi thư mời Tenant Admin (thư riêng chỉ web HR `ADMIN_WEB_URL`), gửi lại lời mời, yêu cầu/duyệt/từ chối/hủy khôi phục, audit nền tảng. Nhân viên Kavor tạo bằng `tools/create-operator.sh` (không có màn hình).
  - Web `apps/console-web` (cổng 3001, thay trang demo `DashboardShell`): khung + CSS gốc của Kavor Console Prototype.html như web HR, cookie httpOnly riêng `kc_*`; Tổng quan, Doanh nghiệp (bảng + modal "Tạo tenant mới" + drawer chi tiết bám prototype), Khôi phục chủ sở hữu, Audit log (thiết kế bổ sung/bám page-audit). Các mục khác của prototype (Gói dịch vụ, Usage, Sync jobs, Sự cố, Releases, Feature flags, Support access, Cài đặt nền tảng) chưa làm, ẩn khỏi menu. Đã thử trên trình duyệt: đăng nhập → QR → mã TOTP → tổng quan → tạo tenant MQL-028 → drawer hiện ADMIN01 chờ kích hoạt → audit.
  - Sửa 2 lỗi có từ trước, phát hiện khi làm Console: (1) `unique nulls not distinct (tenant_id, source_system, external_id)` khiến mỗi công ty chỉ tạo được **một** nhân viên trên web (nhân viên thứ hai báo nhầm "mã đã tồn tại") — giờ chỉ chống trùng khi có mã ngoài; (2) kích hoạt tài khoản tìm nhân viên theo mã trên toàn hệ thống nên hỏng khi hai công ty trùng mã (ADMIN01, NV001) — giờ tìm theo email rồi đối chiếu mã.
  - Smoke `tools/console-smoke.sh` 44 bước (tạo 2 nhân viên Kavor, tạo 2 tenant, Tenant Admin kích hoạt + bật MFA + tạo 2 nhân viên, đặt lại MFA hai người, cấp admin mới bị từ chối rồi duyệt, hủy, audit); 4 smoke cũ vẫn đạt; build 18/18.
- Cài đặt công ty + nền quy định có tầng/phiên bản + MFA web (23/10), theo ADR 0001 §2–5 và `DATABASE_SCHEMA.md` §20:
  - DB `202610240001_company_settings_rules.sql`: permission `tenant.settings.manage`/`policy.read`/`policy.manage`/`privacy.read`; `tenant_settings.support_contact`/`platform_policy`; quy định nghiệp vụ dùng chung `policy_definitions` + `policy_versions` (bất biến) áp dụng qua `policy_assignments` (thêm kind `explanation`/`salary_advance`/`reminder`, trigger kiểm tra target đúng loại + đúng tenant); lịch lễ `holiday_calendars`/`holidays` (lịch quốc gia 2026 theo BLLĐ Điều 112, `verified_at` null = chưa chuyên gia xác nhận; chặn xóa/sửa ngày đã qua); `privacy_terms` (bất biến) + `privacy_consents` (chỉ thêm, ghi phiên bản/thiết bị/IP); `tenant_policy_templates` + hàm `provision_tenant()` idempotent sinh bộ mẫu (ca HC, 3 quy định, điều khoản v1) — Console sẽ gọi khi tạo tenant; seed gọi cho 2 tenant mẫu. pgTAP `company_settings.test.sql` 25 test (tổng 79, đạt cả trên DB sạch lẫn DB đã chạy smoke — sửa luôn `hr_rls` trùng email với smoke), lint sạch.
  - API: `/admin/settings` (thông tin tenant, liên hệ HR, chính sách nền tảng), logo/ảnh bìa lên Storage bucket riêng tư `tenant-branding/<tenant_id>/` (nhận dạng PNG/JPEG/WebP theo nội dung, ≤ 2 MB; client lấy ảnh qua API), `/admin/settings/checklist` (tính từ dữ liệu thật), `/admin/holidays`, `/admin/privacy` + công bố phiên bản, `/admin/rules` (tạo/phiên bản/ngừng; áp dụng dùng chung `/admin/policy-assignments`); mobile `/me/company`, `/me/company/branding/:kind`, `/me/policies?date=` (tra theo tầng — `PolicyIndex.resolveRules`), `/me/privacy-consents`; kích hoạt có `privacyAccepted` ghi đồng ý điều khoản hiện hành. Body JSON tối đa 4 MB.
  - MFA TOTP (Supabase Auth) bắt buộc mọi tài khoản web HR/Admin: API chặn `MFA_REQUIRED` khi phiên chưa aal2 (trừ `/admin/mfa*`), liên kết bằng QR + khóa thủ công, giới hạn nhập sai, quản trị viên khác đặt lại được (có lý do, audit, không tự đặt lại cho mình).
  - Web: bước "Xác thực hai lớp" sau mật khẩu; trang **Cài đặt doanh nghiệp** — tab Doanh nghiệp bám prototype (Thông tin tenant + Chính sách nền tảng) + thương hiệu, liên hệ HR; tab Thiết lập ban đầu, Quy định, Ngày lễ, Dữ liệu cá nhân (thiết kế bổ sung); banner checklist ở Tổng quan; nút đặt lại MFA trong hồ sơ nhân viên. Đã thử trên trình duyệt: đăng nhập → QR → mã TOTP → trang cài đặt, tải logo/ảnh bìa hiển thị đúng.
  - Mobile: ảnh bìa hồ sơ lấy từ công ty (chưa có thì ảnh mặc định Kavor), "Liên hệ HR" lấy từ công ty (bỏ "028 3822 0142 · hr@haidang.vn" khỏi code, chỉ còn ở dữ liệu mẫu), màn **Dữ liệu cá nhân** hỏi đồng ý lại khi công ty công bố điều khoản mới (thiết kế bổ sung, chưa có trạng thái QA vì prototype không có), kích hoạt gửi đồng ý.
  - Đầu-cuối trên iPhone 11 thật "Dqdatt" (Release, API `http://192.168.1.25:4000/api/v1`): kích hoạt HD0142 có tích đồng ý → server ghi đồng ý v1 kèm thiết bị → HR tải ảnh bìa, đổi liên hệ HR, công bố điều khoản v2 → mở lại app hiện màn "Công ty đã cập nhật điều khoản" → đồng ý (server ghi v2) → Hồ sơ hiện ảnh bìa mới → HR khóa tài khoản → mở lại app hiện E16 với mã thật → "Liên hệ HR" hiện liên hệ mới → sửa giao diện rồi thử lại với điều khoản v3 và khóa lần hai.
  - Sửa sau khi thử máy thật: trước đây bản dùng API không bao giờ hiện E16 (tài khoản bị khóa chỉ ra toast lỗi) nên không xem được liên hệ HR — giờ đăng nhập/tải dữ liệu bị khóa thì hiện E16 với mã nhân viên thật; liên hệ HR gần nhất lưu trong Keychain (`kavor.support`, giữ cả sau đăng xuất) vì tài khoản bị khóa không gọi được `/me/company`; màn điều khoản bỏ nút quay lại (`TopBar back={false}`) và thêm lề cho khung nội dung (chữ bị cắt mép trái); thông báo liên hệ HR tách 3 dòng (trước bị ngắt giữa cụm từ).
  - Smoke: `tools/settings-smoke.sh` 74 bước; `hr-smoke.sh` thêm MFA; hàm dùng chung `tools/smoke-lib.sh`; `tools/db-reset.sh` (reset + khởi động lại Kong + chờ Auth/REST). Unit test API 20 (thêm nhận dạng ảnh), contracts 6 (thêm kiểm tra cấu hình quy định).
- Khép module chấm công web HR/Admin ↔ mobile với dữ liệu thật (23/10):
  - DB `202610230001_hr_attendance_admin.sql`: role/permission hệ thống theo `PERMISSION_MATRIX.md` (tenant_admin, hr_ops, manager, auditor, employee); hàm phạm vi `scoped_employees`/`employee_in_scope` dùng chung API + RLS; membership gắn hồ sơ và có trước khi kích hoạt (gán role cho HR được mời); trigger chặn khóa/gỡ Tenant Admin cuối cùng; ca + địa điểm có phiên bản bất biến; `policy_assignments` áp dụng theo tầng; thiết bị duyệt/từ chối/thu hồi (`approve_device` nguyên tử); siết RLS `employees` và `audit_logs` (trước đây mọi nhân viên đọc được toàn bộ hồ sơ và audit của công ty); Realtime cho `attendance_events`/`employee_devices`/`employees`. pgTAP 54/54, `supabase db lint` sạch.
  - API `/admin/*` (`apps/api/src/admin`): kiểm tra permission + phạm vi ở mọi request, ngoài phạm vi/khác tenant trả 404, audit trước/sau mọi thao tác ghi; nhân viên (danh sách/chi tiết/tạo/sửa có ngày hiệu lực, mời qua SMTP, khóa/mở khóa), thiết bị, ca/địa điểm/phiên bản/áp dụng, bảng hôm nay, bản ghi bị từ chối, tổng quan. Tra tầng `apps/api/src/attendance/policy.ts` (unit test). Bỏ `/dev/work-location`. `tools/hr-smoke.sh` 63/63; `attendance-smoke.sh`, `auth-smoke.sh` vẫn đạt; unit test API 18/18.
  - Web `apps/admin-web`: đăng nhập + kích hoạt cho admin được mời, cookie httpOnly (`proxy.ts` tự làm mới phiên, `/api/kavor/*` chỉ mở nhánh admin, chống CSRF bằng Origin), CSS gốc của prototype chạy toàn trang, menu theo quyền; Tổng quan, Nhân viên (drawer, thêm/sửa, mời, khóa), Chấm công (Hôm nay/Bị từ chối/Thiết bị), Ca & địa điểm (Mẫu ca/Địa điểm/Áp dụng). Realtime báo thay đổi → gọi lại API, polling 30 s khi mất Realtime. Ảnh so prototype: `docs/ui-comparison/web/` (10 trạng thái, có ghi chú phần khác chủ đích và "thiết kế bổ sung").
  - Mobile: ca + địa điểm lấy từ API (bỏ 08:00–17:00 cứng, kể cả muộn/sớm, sheet ra ca sớm, OT, widget), bỏ nút dev; E19 tự hỏi lại 8 s/lần và tự vào trang chủ khi được duyệt; máy bị thu hồi/từ chối về màn đăng ký kèm lý do. Chỉ máy đầu tiên tự hoạt động.
  - Đầu-cuối trên iPhone 11 thật "Dqdatt" (Release, API `http://172.17.91.14:4000/api/v1`): kích hoạt HD0142 → đăng ký máy → vào ca bị từ chối ngoài vùng (web hiện ngay) → HR thêm phiên bản địa điểm tại vị trí đó → HR thu hồi máy → đăng ký lại → E19 → HR duyệt trên web → app tự chuyển → vào ca hợp lệ → bảng "Hôm nay" cập nhật trực tiếp. Trên simulator đã thử tạo nhân viên trên web → kích hoạt HD0300 → đăng ký máy.
- Quyết định kiến trúc (22/10): ADR 0001 (Kavor cấp Tenant Admin → admin cài đặt công ty → nhân viên tra rule theo tầng/phiên bản; Kavor duy trì luật nhà nước; mẫu mặc định cho tenant mới; chống mất quyền admin; đồng ý dữ liệu cá nhân). Rà soát toàn bộ phần mobile cần HR quản lý: `docs/HR_COVERAGE_AUDIT.md` (12 mục prototype HR thiếu). `DATABASE_SCHEMA.md` §20 bổ sung bảng chính sách có tầng, luật nhà nước, lịch lễ, đồng ý dữ liệu cá nhân.
- Chấm công thật (22/10): migration `202610220003_attendance.sql` (work_locations, employee_devices, attendance_events bất biến + chống trùng, RLS) đã push lên project thật; pgTAP 9 test. API `/me/devices`, `/me/attendance/today`, `/me/attendance/events` (Idempotency-Key), `/dev/work-location` — `apps/api/src/attendance`, `tools/attendance-smoke.sh` 19/19. Mobile `src/attendance.ts`: GPS thật (`expo-location`, xin quyền khi chấm công), mã cài đặt trong Keychain, hàng đợi offline tự gửi lại khi mở app; biên nhận/ngoài vùng/E19/E20/E21 dùng dữ liệu thật. Đã thử trên simulator: đăng ký máy → vào ca trong vùng → ra ca ngoài vùng bị từ chối → mất mạng lưu hàng đợi → mở lại tự gửi (kiểm tra DB đúng giờ máy).
- Auth thật (22/10): migration `202610220002_service_role_grants.sql` (service_role không có quyền DML mặc định) — đã push cả hai migration lên project thật; OTP email tiếng Việt (`supabase/templates/otp.html`); giới hạn thử sai; chính sách mật khẩu dùng chung trong `@kavor/contracts`; ô OTP nhận gõ nhanh/tự điền mã; sửa lỗi mất phiên sau bước đăng ký thiết bị.
- Nền tảng (22/10): Supabase local chạy ở cổng 553xx (máy có project local khác chiếm 543xx); phát hiện và sửa: 3 bảng chưa bật RLS, client không có quyền SELECT nên policy cũ vô tác dụng, anon có TRUNCATE; audit_logs chỉ thêm. API kiểm tra cấu hình khi khởi động (`apps/api/src/config.ts`, 4 test). CI thêm job `database` (db reset + test db + lint).
- Mobile: màn Hồ sơ → Bảo mật và thiết bị (bật/tắt Face ID đăng nhập & mở khóa lương).
- Bước 1 (22/10): Face ID thật + phiên Keychain (`src/auth.ts`); bắt lỗi nội bộ (`src/crash.tsx`); lớp dữ liệu `src/api/` (KavorApi + mock); Android build chạy trên emulator `Kavor_Pixel_6`, chụp đủ 70 trạng thái (`docs/ui-comparison/android/`) và sửa các lỗi riêng Android (chữ bị cắt, blur, font nhúng native).
- Viết lại toàn bộ app mobile, port 1:1 từ prototype: dữ liệu mẫu, icon SVG gốc, minh họa ILLUS, state/router/actions, sheet, toast, netbar, quick menu, widget/springboard, lỗi E01–E31 — `apps/mobile/src/` (`apps/mobile/App.tsx` chỉ re-export `src/App`)
- Deep link `kavor://payslips|advance` giờ đi qua `go()` nên vẫn phải nhập PIN (trước đây bỏ qua PIN)
- Bộ so sánh 70 trạng thái, 70/70 có ảnh native, có manifest và README — `docs/ui-comparison/`
- Công cụ chụp/ghép tự động — `tools/ui-compare/` (states.mjs, capture-prototype.mjs, capture-native.py, pair.py, manifest.py)
- Đã build Release và cài lên iPhone 11 thật "Dqdatt" (UDID 00008030-001450C63C04202E), app mở được
- Splash screen: splash gốc nền #065F46 + logo trắng (`expo-splash-screen`, ảnh `apps/mobile/assets/splash-logo.png`), sau đó lớp phủ JS `apps/mobile/src/splash.tsx` hiện gradient, chữ KAVOR rồi mờ vào app (~1,3 s, tôn trọng Reduce Motion; tắt khi chạy QA). Đã cài Release lên iPhone thật.
- Icon app mới: nền gradient emerald (#12976F → #065F46), logo trắng — nguồn `apps/mobile/assets/icon.svg`; Android dùng `adaptive-icon.png` trên nền #065F46
- Kiểm tra ngày 22/10: `pnpm turbo run typecheck test build --force` pass 18/18 task (test thật chỉ có contracts 2 + api 2)

## Đang dở (QUAN TRỌNG NHẤT)
- **Web UI (29/10): xong 5 bước của `docs/plans/web-ui-polish.md`**; chờ người dùng xem trên Mac và chọn nhà cung cấp bản đồ cho production.
  DB local đã reset bởi verify-all 29/10 (dữ liệu mẫu, chưa ai kích hoạt).
- **Phản hồi UI mobile (26/10):** xong mục 1–8 ngày 29/10 (chờ người dùng xác nhận 1, 2, 7, 8 trên iPhone); còn mục 9 (widget — kế hoạch riêng) trong `docs/plans/mobile-ui-feedback.md`.
  DB local đang có HD0142 kích hoạt trên iPhone (bản cài 29/10, API `http://192.168.1.2:4000/api/v1`) — reset DB thì phải kích hoạt lại.
- **26/10: phiên cloud tạm dừng.** Toàn bộ việc làm trên cloud (nhánh `claude/ecstatic-pascal-dblg7v`, đến commit `41bf4f4`), checklist thử tay,
  đánh giá MVP và thứ tự việc tiếp theo nằm trong `docs/CLOUD_HANDOFF.md` — đọc file đó trước.
- Web payroll `/payroll` và module Bản tin nằm trên nhánh `claude/ecstatic-pascal-dblg7v` (phiên cloud), **chưa vào main**; người dùng cần thử trên
  Mac (`pnpm dev:admin`, Kế toán HD0215 nhập + HD0216 duyệt) rồi quyết định merge. DB của phiên cloud là container riêng — DB local
  trên Mac không bị đụng tới. Vòng chờ Face ID trên iPhone vẫn chờ người dùng thử lại.
- Payroll DB/contracts/API/smoke đã đạt verify đầy đủ; người dùng đã yêu cầu commit và push các thay đổi hoàn tất lên main ngày 26/10.
  Mobile phiếu cá nhân đã nối API, người dùng xác nhận các thao tác khác ổn; đã cài bản sửa vòng chờ Face ID. Chưa có export/PDF. Mở lại published/paid/closed
  cần thiết kế phiên bản phiếu công bố ở phiên sau.
- DB local có kỳ lương mẫu 2026-10 đã công bố cho HD0142 để thử thông báo, hai tài khoản Kế toán đã kích hoạt qua API;
  HD0142 đã kích hoạt trên iPhone, dữ liệu/auth được giữ sau verify. Không reset DB nếu người dùng đang thử. Tạm ứng sau ngày 20 cần
  quy định riêng hạn 31 — xem smoke tạm ứng. API LAN Mac và bản Release vừa cài đều trỏ `http://192.168.1.3:4000/api/v1`.
  Chưa thử từ chối/hủy đơn và duyệt trên app bằng tài khoản quản lý trên máy thật (smoke đã kiểm). Thử duyệt trên app:
  kích hoạt quản lý HDG0003 (huy.le@example.test) ở máy khác/simulator. Thử Console:
  `OPERATOR_PASSWORD='…' bash tools/create-operator.sh <email> "<Họ tên>"` (tạo 2 người để thử duyệt khôi phục),
  `pnpm dev:console` → http://localhost:3001, lần đầu liên kết ứng dụng xác thực.
- Cài bản mới lên iPhone: build `xcodebuild -workspace ios/Kavor.xcworkspace -scheme Kavor -configuration Release -destination 'generic/platform=iOS' -derivedDataPath ios/build-device -allowProvisioningUpdates build` (trong `apps/mobile`, có `EXPO_PUBLIC_API_URL`, xóa `$TMPDIR/metro-cache` trước) rồi `xcrun devicectl device install app --device 36F8CE4A-8C04-5232-AB9D-0041A426F6A0 ios/build-device/Build/Products/Release-iphoneos/Kavor.app`. Nếu devicectl báo "unavailable": mở khóa iPhone, bấm Tin cậy, cắm cáp dữ liệu.
- Reset DB local: dùng `bash tools/db-reset.sh` (sau `supabase db reset` Kong giữ IP cũ của Auth → 502).
- Bản trên iPhone hiện trỏ tới API `http://192.168.1.3:4000/api/v1` (cài bản sửa payroll qua Wi-Fi 26/10; thay bản .22). App báo "không kết nối máy chủ" thì kiểm tra `ipconfig getifaddr en0` trước — IP đổi thì phải build lại: Mac phải chạy `pnpm dev:backend`, cùng Wi-Fi. IP Mac đổi thì phải build lại app.
- Chưa có môi trường staging: migration 23/10 **chưa push** lên project Supabase thật; project thật chưa có dữ liệu nhân viên, SMTP riêng và Realtime chưa kiểm tra ở đó.
- Người dùng cần tự đổi publishable key trên Supabase Dashboard (Settings → API Keys: tạo publishable key mới, xóa key `default` cũ).

## Quyết định đã chốt
- Chưa mua dịch vụ trả phí nào (hosting, domain, Resend, Supabase Pro, Apple Developer) cho tới khi hệ thống hoàn thiện; tiếp tục dev và test trên máy local + iPhone qua cáp. Staging làm sau — vì người dùng đang trong giai đoạn dev (người dùng quyết định 24/10).
- Kavor Console (23/10, Claude quyết định kỹ thuật theo ADR 0001): nhân viên Kavor là bảng riêng, đăng nhập riêng, luôn bắt buộc MFA; chỉ thấy số liệu vận hành và danh sách Tenant Admin, không đọc dữ liệu HR. Console không tự thêm/bớt admin ngoài luồng khôi phục; khôi phục cần ghi cách xác minh, người thứ hai duyệt, hết hạn 24 giờ, công ty thấy trong audit. Nhân viên Kavor đầu tiên tạo bằng dòng lệnh.
- MFA bắt buộc với **mọi** tài khoản dùng web HR/Admin (không chỉ Tenant Admin), tenant không tắt được — vì HR/quản lý/kiểm soát đều xem dữ liệu cá nhân của nhiều người (Claude quyết định kỹ thuật, 23/10).
- Logo/ảnh bìa: một bucket riêng tư, thư mục theo tenant, chỉ API đọc/ghi; app và web lấy ảnh qua API (iPhone trong LAN không tới được địa chỉ Supabase local, và không lộ đường dẫn tenant khác) (23/10).
- Checklist thiết lập tính từ dữ liệu thật, không cho đánh dấu tay; bước chưa có module (nghỉ phép, workflow) hiện "Sắp có" (23/10).
- Chỉ máy đầu tiên của nhân viên tự hoạt động; máy sau hoặc máy từng bị thu hồi/từ chối phải chờ HR duyệt — nếu không, thu hồi máy vô tác dụng (Claude quyết định kỹ thuật, 23/10).
- Phiên bản ca/địa điểm và áp dụng theo tầng chỉ hiệu lực từ hôm nay trở đi; không sửa hồi tố công đã chấm (23/10).
- Realtime web dùng RLS nên access token (≈1 giờ) được cấp cho JS trình duyệt qua `/api/realtime`; refresh token vẫn httpOnly. Chấp nhận rủi ro XSS lộ token tối đa 1 giờ; sự kiện Realtime chỉ là tín hiệu, dữ liệu luôn lấy lại qua API (23/10).
- Mobile hỗ trợ cả iOS và Android, không phụ thuộc Expo Go; dùng native build cho máy thật — vì người dùng muốn cài trực tiếp và Expo Go từng không tương thích.
- UI mobile phải bám sát prototype HTML, gồm liquid glass, animation, safe area và navbar tự ẩn/hiện khi cuộn — vì đây là tiêu chí chốt UI trước backend.
- Supabase/PostgreSQL là database chính; Google Sheets là nguồn import vào database chứ không phải database vận hành — vì doanh nghiệp có thể chưa sẵn sàng chuyển dữ liệu ngay.
- Payroll cấu hình theo từng công ty; không phát triển chữ ký số — theo yêu cầu sản phẩm đã chốt.
- Kavor là nền tảng SaaS quản trị nhân sự cho doanh nghiệp, không phải dịch vụ đăng ký kinh doanh — để tránh hiểu sai phạm vi sản phẩm.

## Đã thử nhưng bỏ
- Expo Go cho quy trình chạy mobile chính — bỏ vì lệch phiên bản SDK và không phù hợp kiểm thử native/Face ID trên thiết bị.
- Dùng icon Face ID tự vẽ/vector — bỏ vì không giống biểu tượng Apple; iOS chuyển sang `expo-symbols`.
- Áp safe area bằng dải nền trắng độc lập ở đầu/cuối màn hình — bỏ vì tạo khoảng trắng thừa; safe area phải hòa vào background/surface của từng màn.
- Giữ ảnh chụp toàn trang và ảnh simulator raw — bỏ vì trùng dữ liệu, làm commit phình to; chỉ giữ bản 390×844 dùng để so sánh.

## Vấn đề/bug còn tồn tại
- Luật nhà nước dạng số (`statutory_rule_sets`: bảo hiểm, thuế, phép năm tối thiểu, giới hạn OT) chưa làm — làm cùng module phép/payroll. Lịch lễ quốc gia mới có 2026; 2027 chờ Chính phủ công bố lịch Tết. Nội dung điều khoản mẫu và ngày lễ cần chuyên gia xác nhận.
- Server chưa chặn API chấm công khi nhân viên chưa đồng ý điều khoản (app tự chặn bằng màn đồng ý).
- Đặt lại MFA (web HR hoặc Console) không đăng xuất phiên aal2 đang mở của người đó (hết hạn sau ≤ 1 giờ).
- Nhập nhân viên: chưa cập nhật hồ sơ cũ bằng file, chưa đọc .xlsx/kết nối Google Sheets. Gửi lời mời hàng loạt chạy tuần tự trong request
  (300 người ≈ vài chục giây với SMTP chậm) — cần hàng đợi nền khi có SMTP thật.
- Phân quyền: phạm vi "phòng ban" chỉ gồm đúng phòng đó, **không gồm phòng ban con** (`scoped_employees` so khớp `department_id`) — cần quyết
  định có tính cả cây không. Chưa có vai trò tùy chỉnh, người duyệt thứ hai khi gán vai trò nhạy cảm, import cơ cấu, phiên bản tên đơn vị (đổi tên sửa
  tại chỗ + audit).
- Support access: chưa báo Tenant Admin qua thông báo app/email khi có yêu cầu (chỉ banner web), chưa có phạm vi nhạy cảm cần duyệt hai lớp, chưa
  tích hợp hệ thống ticket; banner web cần kênh Realtime đã đăng ký (vài giây sau khi mở trang) mới tự cập nhật theo thao tác của người khác.
- Console chưa có: giá/tính năng theo gói, tạo/sửa gói, xuất/xóa dữ liệu tenant đã đóng, Usage chi tiết (API, storage), màn quản lý nhân viên Kavor; thao tác đóng tenant chỉ cần một người (chưa hai người duyệt); nhân viên Kavor mất điện thoại phải nhờ người có service role xóa factor. CSS hai web đã dùng chung `@kavor/web-ui`; `kit.tsx` (Modal, Field, Drawer…) của console-web vẫn là bản sao của admin-web.
- Cấp Tenant Admin cho người có tài khoản đang bị khóa thì role được gán nhưng vẫn không đăng nhập được cho tới khi mở khóa.
- Bản đồ chọn vị trí: DNS nhà mạng VNPT chặn openstreetmap.org (tile + Nominatim), CARTO cần API key → dev dùng tile.openstreetmap.de + Photon
  (máy chủ cộng đồng, không hợp cho production; nhãn kèm phiên âm kiểu Đức). Cần chọn nhà cung cấp có key (VietMap/Goong/Map4D) trước pilot.
- Ca qua đêm, tầng "loại hợp đồng", lịch xếp ca theo ngày chưa có. Trình duyệt nhúng trong app Claude không cấp quyền vị trí; nút "Dùng vị trí hiện tại của trình duyệt" cần Chrome/Safari thật.
- Giải trình chưa có đính kèm minh chứng (cần Storage + quét file); Bảng công chưa tính nghỉ phép/OT/ca qua đêm; thiếu cả ngày chỉ giải trình theo giờ ca. Snapshot khóa kỳ chưa có trang xem lịch sử khóa/mở.
- Thông báo trên mobile không đến tức thì (iPhone trong LAN không nối Realtime của Supabase local; chưa có push) — app hỏi lại mỗi 30 giây khi đang mở, và khi mở/quay lại app; app tắt thì không biết cho tới lần mở sau. E19 vẫn hỏi lại 8 giây/lần. Ngưỡng "sắp quá hạn" 4 giờ và chu kỳ quét 10 phút là hằng số của hệ thống, chưa cấu hình theo tenant. Thông báo phiếu lương đã mở phiếu thật qua PIN/Face ID; chờ xác nhận trên iPhone bản 26/10. Chưa có nhắc chấm công/thông báo bản tin/dọn thông báo cũ.
- Nghỉ phép chưa có: đính kèm minh chứng, ủy quyền người duyệt khi vắng, nghỉ nửa ngày xét muộn/sớm theo nửa ca, đơn vượt năm (phải tách), sửa loại nghỉ trên web (đang dùng mẫu), tầng "loại hợp đồng"; thâm niên tính tại 01/01 (đủ năm giữa năm thì năm sau mới cộng); phép tồn tự chuyển chỉ khi sổ năm trước có trong Kavor (năm đầu nhập tay).
- Phạm vi/tầng dùng phân công tổ chức hiện tại; danh sách nhân viên/chấm công lọc trong bộ nhớ API — đủ cho vài nghìn nhân viên, cần phân trang ở SQL khi lớn hơn. RLS `employees` gọi hàm phạm vi theo từng dòng (chậm nếu client đọc trực tiếp nhiều dòng; hiện client không đọc trực tiếp).
- Khi máy Mac quá tải (build Xcode), GoTrue chậm → web báo "Máy chủ xác thực đang bận" (không còn tự đăng xuất).
- Ảnh native lấy từ simulator; chưa có ảnh/video từ iPhone 11 thật.
- Đề nghị sửa hồ sơ: số tài khoản lưu dạng thường trong DB (bảo vệ bằng RLS + quyền `employee.sensitive.read`, không mã hóa cột — cần quyết định
  quản lý khóa khi lên production); chưa có ảnh/xác nhận chủ tài khoản, HR chưa sửa trực tiếp thông tin cá nhân trên web (chỉ qua đề nghị), chưa
  sửa luồng duyệt nhiều bước cho loại này trên web (cấu hình được như loại khác nhưng mặc định chỉ HR).
- Tài liệu: chưa có "Tạo từ mẫu", quét virus, nhắc hạn tự động (`document.expiring`), danh mục do công ty định nghĩa, quyền xem giới hạn cho Kế toán/Kiểm soát,
  nhân viên tự tải hồ sơ; mobile chưa thử trên thiết bị. Web chưa có mục tài liệu trong hồ sơ nhân viên (chỉ ở trang Tài liệu).
- Bản tin: mobile chưa build/chụp trên simulator/iPhone (cần Mac: build Release mới, thử tab Bản tin, mở file PDF, bấm thông báo). Chưa có quét virus file
  đính kèm (chỉ nhận PDF/PNG/JPEG/WebP theo byte đầu), chọn người nhận theo vai trò, người đăng phạm vi phòng ban, nhiều file/bài, "Lưu tin" theo người dùng.
  Thống kê người nhận gọi hàm SQL theo từng bài (≤ 200 bài/trang) — đủ cho pilot, cần gộp khi công ty lớn.
- Tạm ứng: DB/API payroll đã nối đối chiếu và đánh dấu khấu trừ khi công bố; web `/payroll` và phiếu cá nhân trên app đã có. Tài khoản ngân hàng lấy từ hồ sơ HR đã duyệt (tab Lương cơ bản); chưa chặn khi kỳ lương đã chốt, nhiều lần/tháng. Quy định mẫu nhận đơn đến ngày 20 nên sau ngày 20 nhân viên không gửi được đơn tháng đó (đúng prototype); thử trên máy sau ngày 20 thì tạo quy định riêng hạn 31.
- OT chưa có: OT ban đêm (+30%/+20%), OT qua nửa đêm (phải tách hai đơn), đối chiếu giờ OT với chấm công thực tế, ngoại lệ 300 giờ/năm theo ngành (chỉnh trong quy định). API payroll đã đọc `overtime_entries` đã duyệt để cảnh báo OT_PAY hai chiều, không tính tiền OT.
- Android chưa thử luồng chấm công thật (GPS/hàng đợi) trên emulator.
- Test tự động của admin-web, console-web, web-ui vẫn là placeholder; mobile có 17 ca hành vi (payroll 6, bản tin 5, tài liệu 3, hồ sơ 3), chưa có bộ kiểm UI/native đầy đủ.
- Trên bản dev, gõ phím "r" khi không focus ô nhập sẽ làm Metro reload (chỉ ảnh hưởng dev).

## Bước tiếp theo
1. Review quyết định mặc định trong `docs/plans/console-ops.md` (gói, khóa/đóng tenant, support access: phạm vi, 30/60 phút, Tenant Admin duyệt).
   Người dùng thử trên Mac (nhánh `claude/ecstatic-pascal-dblg7v`): web `/payroll` (file mẫu `sample-data/payroll_import_2026-10.csv`) và
   `/announcements`, `/documents`, Đơn & phê duyệt (đơn HS); build Release iPhone mới để thử tab Bản tin, Hồ sơ → Hợp đồng và quyết định, mở file,
   bấm thông báo, Hồ sơ → Đề nghị sửa (gửi, thẻ đang chờ, HR duyệt rồi xem lại); thử lại vòng chờ Face ID. Review quyết định mặc định trong
   `docs/plans/documents.md`. Ổn thì merge vào main. Export/PDF phiếu lương và mở lại kỳ đã công bố để sau.
2. Ảnh đại diện, quên PIN trên app (A11), đính kèm minh chứng giải trình/nghỉ phép.
3. Phần còn lại của Kavor Console theo prototype: Usage chi tiết, Sync jobs, Sự cố, Releases (phiên bản app tối thiểu iOS/Android), Feature flags, Cài đặt nền tảng.
- Push từ máy chủ khi app tắt (APNs/FCM) cần tài khoản Apple Developer trả phí → làm khi mua (xem "Quyết định đã chốt"); lúc đó thay luôn việc E19 hỏi lại 8 giây/lần.
- Staging: **hoãn tới khi hệ thống hoàn thiện** (quyết định 24/10). Phương án đã phân tích sẵn: Render Singapore cho API + 2 web (~$21/tháng, địa chỉ onrender.com, chưa cần domain), Gmail SMTP như CarRental cho OTP và thư mời, project Supabase `KavorSystem` (Singapore) làm staging, chỉ dùng dữ liệu mẫu; cần đổi các giá trị localhost trong `supabase/config.toml` sang biến môi trường trước khi `config push`.
- Ngoài luồng chính: test component cho admin-web; Sentry; số liệu luật cần HR/Payroll SME xác nhận trước pilot; pháp lý chuyển dữ liệu ra nước ngoài (Nghị định 13/2023, dữ liệu ở Singapore) trước khi có dữ liệu thật.

## Câu hỏi đang chờ người dùng trả lời
- Nhà cung cấp bản đồ cho production (29/10): mạng VNPT không vào được openstreetmap.org. Lựa chọn: dịch vụ bản đồ Việt Nam có API key (VietMap,
  Goong, Map4D — hiển thị đúng quy định chủ quyền) hoặc tile OSM trả phí (MapTiler, Stadia). Dev đang dùng tile.openstreetmap.de + Photon.
- Review quyết định mặc định của Console (`docs/plans/console-ops.md`): mức gói (50/100/500/hợp đồng), đóng tenant chỉ cần một người, support access
  3 phạm vi chỉ đọc, 30/60 phút, chỉ Tenant Admin duyệt, mọi người dùng web HR thấy banner.
- Review các quyết định mặc định của module Tài liệu (`docs/plans/documents.md`): 6 danh mục cố định, quyền HR Operations/Tenant Admin, mobile qua
  PIN/Face ID, tối đa 5 MB, "Thiếu hồ sơ" = chưa có hợp đồng còn hiệu lực.

## Nhật ký
- 2026-10-29 — Claude (Desktop): phản hồi mobile mục 1 (splash nền sáng), 2 (bánh xe chọn giờ + giờ chấm công ở form OT), 5 (vân tay/Touch ID theo hệ
  điều hành), 6, 7 (dải ngày nghỉ), 8 (hướng dẫn sử dụng). Mobile typecheck, test 25 ca, ảnh simulator + Android emulator; cài iPhone chờ thử.
- 2026-10-29 — Claude (Desktop): mã PIN thật + Face ID gọi thẳng hộp thoại hệ thống. Mobile typecheck, test mobile 25 ca (PIN 7). Người dùng thử PIN trên iPhone:
  ổn; Face ID gọi thẳng hộp thoại hệ thống: người dùng xác nhận đúng ý. verify-all --quick (không reset để giữ tài khoản trên iPhone); bản đầy đủ chạy lần trước TẤT CẢ ĐẠT.
- 2026-10-29 — Claude (Desktop): tìm ra lỗi smoke trên Mac: macOS dùng bash 3.2, bung ngoặc nhọn của JSON có `\"` bên trong `"$( … )"` → lệnh gọi API
  bị tách làm nhiều lần với body hỏng, và `check` nhận chuỗi rỗng ở cả hai vế nên có bước **đạt giả** (vd. "Đính kèm PDF"). Sửa 27 dòng ở 6 smoke
  (gán `_sN=$( … )` trước rồi `check "$_sN"`), kiểm bằng harness bash 3.2 (mọi `check` đủ 3 tham số). Verify-all đầy đủ TẤT CẢ ĐẠT (pgTAP 460,
  18 smoke — announcements 51, documents 42, import 18 —, build, lint).
- 2026-10-29 — Claude (Desktop): làm đẹp web 5 bước (`d1db291`…). Verify-all đầy đủ trên Mac lần đầu: typecheck, unit, pgTAP 460, build, lint đạt;
  15/18 smoke đạt (sau đó đã sửa, xem dòng trên); **3 smoke lỗi**: import (script dùng `mktemp --suffix` của GNU — đã sửa, chạy lại đạt), announcements ("HR tải lại file đính
  kèm" NOT_FOUND) và documents ("Nhân viên mở liên kết nhận bản mới nhất") — lỗi có sẵn: API của commit `ad691cf` (trước khi sửa) lỗi y hệt.
- 2026-10-26 — Claude (cloud): gửi lời mời hàng loạt. Verify-all đầy đủ TẤT CẢ ĐẠT (pgTAP 460, 18 smoke — import 18, build, lint).
- 2026-10-26 — Claude (cloud): Nhập nhân viên hàng loạt từ CSV. Verify-all đầy đủ TẤT CẢ ĐẠT (pgTAP 460, 18 smoke — import 14, build, lint). Sửa test `hr_rls` đếm cứng 2 người Marketing (lỗi khi DB có thêm người do smoke/E2E).
- 2026-10-26 — Claude (cloud): Cơ cấu tổ chức + Vai trò & phân quyền. Verify-all đầy đủ TẤT CẢ ĐẠT (pgTAP 451, 17 smoke — org 41, build, lint).
- 2026-10-26 — Claude: Console phần B (support access có thời hạn). Verify-all đầy đủ TẤT CẢ ĐẠT (pgTAP 436, 16 smoke — support 36, build, lint).
- 2026-10-26 — Claude: Console phần A (gói dịch vụ + giới hạn nhân sự, tạm khóa/mở lại/đóng tenant). Verify-all đầy đủ TẤT CẢ ĐẠT (pgTAP 418, 15 smoke — console-ops 39, build, lint); mobile test 18 ca.
- 2026-10-26 — Claude: đề nghị sửa hồ sơ theo câu trả lời của người dùng (các trường đề xuất + tài khoản ngân hàng thuộc hồ sơ; HR duyệt, Kế toán
  kế thừa). Verify-all đầy đủ: typecheck, unit, pgTAP 404,
  14 smoke (profile 32), build, lint đạt; riêng smoke timesheet lỗi ở bước kích hoạt đầu tiên ngay sau reset (Auth chưa sẵn sàng?), chạy lại riêng 2 lần
  đều đạt 48 bước. Mobile test 17 ca. Web thử bằng trình duyệt tự động; mobile chưa build/chụp.
- 2026-10-26 — Claude: hồ sơ trên app đọc từ API (`/me/profile`), ghi câu hỏi chốt cho đề nghị sửa hồ sơ. Verify-all đầy đủ TẤT CẢ ĐẠT
  (pgTAP 376, 13 smoke — documents 42, build, lint). Dừng chờ người dùng review + trả lời câu hỏi trước module đề nghị sửa hồ sơ.
- 2026-10-26 — Claude (phiên cloud) làm module Tài liệu nhân sự trọn vòng (DB, pgTAP 32, API, smoke 40, web, mobile REMOTE + 3 test hành vi).
  Verify-all đầy đủ TẤT CẢ ĐẠT: pgTAP 376, 13 smoke (documents 40, announcements 51, payroll 105, …), build, lint. Mobile chưa thử trên thiết bị.
- 2026-10-26 — Claude (phiên cloud) làm module Bản tin trọn vòng (DB, pgTAP 43, API, smoke 51, web, mobile REMOTE + 5 test hành vi) và file CSV mẫu
  payroll. Verify-all đầy đủ TẤT CẢ ĐẠT. Mobile chưa thử trên thiết bị. Commit + push nhánh `claude/ecstatic-pascal-dblg7v`.
- 2026-10-26 — Claude (phiên cloud) làm web payroll `/payroll` + sửa API hiện lỗi mã nhân viên không thuộc công ty. Dựng Docker/Supabase/API/web
  trong container, E2E Playwright hai Kế toán đạt, verify-all đầy đủ TẤT CẢ ĐẠT (payroll 105). Commit + push nhánh `claude/ecstatic-pascal-dblg7v`.
- 2026-10-26 — Người dùng yêu cầu commit và push lên main trước khi làm tiếp. Gom phần payroll contracts/API/smoke, phiếu mobile/thông báo, vòng chờ Face ID và ba smoke đầu kỳ đã hoàn tất; verify-all đầy đủ đã đạt; verify-all --quick trước commit đạt typecheck/unit/301 pgTAP, exit 0. Không đưa cấu hình local, thông tin đăng nhập hay snapshot DB/Auth vào Git.
- 2026-10-26 — Sau khi được duyệt, sửa đúng 3 smoke leave/notifications/timesheet về chọn kỳ/ngày và fixture. Chạy riêng 39/21/48 bước đạt; verify-all đầy đủ TẤT CẢ ĐẠT (payroll 104, pgTAP 301). Khôi phục DB/Auth người dùng, API .3 khỏe, mở lại iPhone thành công. Không commit.
- 2026-10-26 — Người dùng xác nhận payroll khác ổn, gửi ảnh vòng Face ID xoay méo. Đổi vòng chờ thành tròn, kiểm video simulator, build/cài Wi-Fi đạt. Verify-all phát hiện 3 smoke cũ lỗi đầu kỳ; chờ duyệt sửa test. DB/auth đã khôi phục, không commit.
- 2026-10-26 — Sửa mobile mở thông báo payroll → PIN/Face ID → phiếu thật; mobile 6 test đạt, verify-all đầy đủ đạt
  (payroll 104, pgTAP 301). Khôi phục DB/auth người dùng sau verify, cài/launch Release API .3 qua Wi-Fi đạt; chờ xác nhận thao tác.
- 2026-10-25 — Build Release API .22, QA tắt, cài và launch trên iPhone Dqdatt qua localNetwork/Wi-Fi thành công;
  xác nhận tiến trình còn chạy. Tạo kỳ lương mẫu đã công bố + thông báo cho HD0142 qua API, để HD0142 chưa kích hoạt cho
  người dùng tự thử. Chưa xác nhận thao tác/Face ID hay payroll UI trên máy thật; không sửa mã app, không commit.
- 2026-10-25 — Codex làm Payroll contracts/API/smoke sau khi người dùng duyệt phạm vi. Bổ sung đúng hai dòng icon theo duyệt;
  phát hiện kích hoạt chưa gán employee/self, người dùng duyệt sửa API kích hoạt. Payroll smoke 104 bước đạt, unit API 34,
  pgTAP 301 và verify-all đầy đủ TẤT CẢ ĐẠT (11 smoke, build, lint). DB local đã về seed; API LAN .22; không commit.
- 2026-10-25 — Codex tiếp quản, Git ban đầu sạch, quick đạt 192 pgTAP; người dùng duyệt phạm vi DB trước khi code.
  Thêm migration payroll mới, 109 pgTAP, Kế toán mẫu thứ hai và cập nhật kế hoạch. Reset + pgTAP 301 PASS;
  thử tranh chấp nhập lại/duyệt bằng hai kết nối DB; verify-all đầy đủ TẤT CẢ ĐẠT. DB local về seed.
- 2026-10-25 — Bàn giao sang Codex: playbook cách làm việc, `tools/verify-all.sh`, kế hoạch payroll; sửa test contracts hỏng.
- 2026-10-25 — Tạm ứng lương: vai trò Kế toán, lương cơ bản có phiên bản, đơn tạm ứng mỗi tháng một lần theo hạn mức, Quản lý → HR (trên 5 triệu) → Kế toán, xác nhận đã chi + thông báo; web trang Tạm ứng lương + Lương cơ bản; mobile đọc từ API.
- 2026-10-25 — Sửa lệch múi giờ: hàm phân quyền/phạm vi SQL và Console dùng ngày theo múi giờ công ty thay vì UTC (trước đây 0:00–7:00 vai trò/phân công mới chưa có hiệu lực).
- 2026-10-25 — Làm thêm giờ: quy định OT có tầng theo luật, đơn OT bội số 30 phút ngoài ca chính, giới hạn ngày/tháng/năm, Quản lý → HR, bảng công có giờ OT; web HR tab Làm thêm giờ; mobile đọc từ API.
- 2026-10-24 — Nghỉ phép: quy định phép năm có tầng, loại nghỉ, sổ phép ledger, đơn nghỉ giữ chỗ → duyệt trừ phép, luồng duyệt theo số ngày, bảng công hiện ngày nghỉ; web HR trang Nghỉ phép; mobile đọc từ API.
- 2026-10-24 — Thông báo trong app: trigger SQL tạo thông báo (cần duyệt, kết quả đơn, máy được duyệt), nhắc hạn duyệt định kỳ, màn Thông báo mobile + nhắc hạn giải trình cục bộ, chuông web HR.
- 2026-10-24 — Công tháng + giải trình + luồng duyệt: kỳ công theo công ty, tính công từ chấm công, giải trình theo lượt/hạn, Quản lý → HR duyệt tạo điều chỉnh, khóa/mở kỳ, xuất CSV; web HR Bảng công + Đơn & phê duyệt; mobile đọc từ API; thử đầu-cuối trên iPhone (gửi → Quản lý → HR duyệt → bảng công cập nhật).
- 2026-10-24 — Phân tích phương án staging (Render/Fly/Vercel, Supabase, email, domain; so với cách CarRental deploy); người dùng quyết định hoãn staging, chưa mua dịch vụ trả phí.
- 2026-10-23 — Kavor Console tối thiểu: tạo tenant + mời Tenant Admin, khôi phục chủ sở hữu hai người, audit nền tảng; sửa lỗi chỉ tạo được một nhân viên/công ty và lỗi kích hoạt khi trùng mã giữa công ty.
- 2026-10-23 — Thử đầu-cuối cài đặt công ty trên iPhone thật (ảnh bìa, liên hệ HR, đồng ý điều khoản v1→v3, khóa/mở khóa); sửa E16 khi bị khóa, lưu liên hệ HR, giao diện màn điều khoản và thông báo liên hệ.
- 2026-10-23 — Cài đặt công ty + quy định có tầng/phiên bản (thương hiệu Storage, liên hệ HR, lịch lễ, bộ mẫu tenant mới, checklist, điều khoản dữ liệu cá nhân) + MFA TOTP cho web HR/Admin; mobile đọc ảnh bìa/liên hệ/điều khoản từ API.
- 2026-10-23 — Khép module chấm công: quyền/phạm vi + RLS HR, API `/admin/*`, web HR/Admin (đăng nhập, nhân viên, thiết bị, ca & địa điểm theo tầng, realtime), mobile lấy ca/địa điểm từ API, E19 tự chuyển; thử đầu-cuối trên iPhone thật; cài Release lên iPhone.
- 2026-10-22 — Chốt ADR 0001 (admin công ty + rules có tầng), rà soát phần HR cần quản lý, bổ sung schema §20.
- 2026-10-22 — Chấm công thật: thiết bị, GPS, geofence, hàng đợi offline; push migration attendance lên project thật; cài bản dev lên iPhone.
- 2026-10-22 — Auth thật: kích hoạt/OTP/đăng nhập/quên mật khẩu qua API + Supabase Auth; push migration lên project thật; cài bản dùng API lên iPhone.
- 2026-10-22 — Màn Bảo mật và thiết bị; siết RLS + test cách ly tenant; config validation API; CI database job.
- 2026-10-22 — Bước 1 xong: Face ID thật, Keychain, crash handler, lớp api, Android emulator 70/70 trạng thái; cài Release lên iPhone.
- 2026-10-22 — Thêm splash screen, build Release lên iPhone 11 thật, commit + push.
- 2026-10-22 — Đổi icon app (nền emerald, logo trắng); commit c60232d, tag mobile-v0.1.0, push.
- 2026-10-22 — Viết lại app mobile theo prototype, 70/70 trạng thái khớp, cài Release lên iPhone 11 thật.
- 2026-10-22 — Chụp đủ 63 màn prototype, 33 màn native và bàn giao chính xác phần ghép/đánh giá UI còn dở.
