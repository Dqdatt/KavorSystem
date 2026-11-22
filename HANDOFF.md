# HANDOFF — 22/11/2026 (phiên 27: đơn kẹt vì quản lý trực tiếp đã nghỉ việc)

**Mục tiêu:** admin Nguyễn Thị Yến Nhi (TS-3010, `TSNV001`) không duyệt được đơn, badge "Đơn & phê duyệt" không hiện số.

## Nguyên nhân (đã đọc DB online, chỉ SELECT)
- TS-3010 có 2 hồ sơ "Nguyễn Thị Yến Nhi": `TSNV001` (admin, có tài khoản) và `2439` (nhập file 06/11, 07/11 bị sửa trạng thái
  sang Đã nghỉ, trước khi có "Cho nghỉ việc"). NV `2482`, `TSNV002`, `2441` vẫn có QL trực tiếp = `2439`
  → bước 1 của GT-0004, NP-0002, OT-0003 giao cho người đã nghỉ, không ai duyệt được. Badge đã có sẵn (`shell.tsx:104`), 0 vì cùng lý do.
- Lỗ hổng: nghỉ việc/đổi QL không chuyển đơn đang chờ; cấp dưới vẫn giữ QL đã nghỉ.

## Đã làm (CHƯA commit, CHƯA lên cloud)
- `supabase/migrations/202612180001_manager_release.sql`:
  `reroute_manager_tasks` (bước QL trực tiếp đi theo QL hiện tại; không còn QL → bỏ bước, sang bước kế, không còn bước → thêm bước HR; ghi audit
  `request.approver_changed`); constraint trigger DEFERRED trên `employee_assignments` (chạy lúc commit vì save_employee đóng dòng cũ rồi mới chèn);
  trigger `employees_release_reports` khi status → terminated: cấp dưới để trống QL từ hôm nay (giữ lịch sử); `notify_task_pending` báo cả khi đổi
  người duyệt bước đang chờ; khối DO dọn dữ liệu cũ (online chỉ đụng TS-3010: hồ sơ 2439, 3 NV, 3 đơn → sang bước HR).
- `apps/api/src/admin/employees.service.ts` `assertManagerValid`: chặn chọn người đã nghỉ làm QL.
- `apps/admin-web/app/(app)/employees/profile.tsx`: dòng nhắc trong hộp "Cho nghỉ việc" nói rõ cấp dưới để trống QL, đơn sang HR.
- `supabase/tests/manager_release.test.sql` 10 test đạt. verify-all đầy đủ: typecheck/unit/37 smoke/build/lint đạt; pgTAP lỗi
  `platform_purge` vì 3 trigger thiếu điều kiện `kavor.purge_tenant` → đã thêm, chạy lại pgTAP 735/735 đạt.
- Mọi trigger mới (kể cả tạo lại trigger cũ) phải có `when (coalesce(current_setting('kavor.purge_tenant', true), '') = '')`.

## Đang dở
- Chờ người dùng đồng ý: commit → áp migration lên cloud (`supabase db query --linked -f`, gói begin/insert schema_migrations/commit) → push deploy.
- Sau khi áp: người dùng tự vào hồ sơ 2482, TSNV002, 2441 chọn QL trực tiếp = Yến Nhi `TSNV001` (đơn mới mới đi tới chị; 3 đơn cũ đã ở bước HR).

## Quyết định đã chốt (đừng hỏi lại)
- QL nghỉ việc → cấp dưới ĐỂ TRỐNG QL trực tiếp, đơn chờ sang bước kế/HR (người dùng chọn 22/11, không lên cấp trên).
- Phiên này không dùng `giao` (người dùng: "chớ chia việc ra bằng giao" 22/11).
- "from Kavor" do iOS tự thêm cho push của web app, không bỏ được.
- Chữ thông báo: không dấu "·", viết thành câu, không câu đệm, không số tiền trên màn hình khóa.
- PWA dùng thật trước app native; push nhánh `claude/ecstatic-pascal-dblg7v` = deploy (Render + Vercel), chỉ push khi người dùng bảo.
- Online `TS-3010` là dữ liệu thật: chỉ xem. Migration chỉ đổi DB: phiên chính tự áp bằng `supabase db query --linked -f`
  (gói `begin; <migration>; insert into supabase_migrations.schema_migrations …; commit;`) khi người dùng đồng ý.
  `tools/cloud-supabase.sh` chỉ cần khi đổi cấu hình Auth — luôn đưa lệnh đầy đủ kèm biến môi trường.

## Nợ Ponytail
- `shortcut:` trong migration 202612180001: phân công hiệu lực từ ngày tương lai không tự chuyển đơn khi tới ngày.

## Việc tiếp theo
1. [opus xhigh] Hoàn tất mục "Đang dở".
2. [sonnet] Danh sách chọn người (QL trực tiếp…) nên hiện mã NV khi trùng tên — 2 hồ sơ "Yến Nhi" gây nhầm.
3. [haiku] Người dùng: thử vuốt dải ngày/bánh xe giờ trên iPhone thật; ĐỔI mật khẩu ứng dụng Gmail (lỡ dán vào chat 22/11)
   → Vercel `SMTP_URL` + chạy lại `cloud-supabase.sh`.
- Lưu ý verify-all: lỗi giả bước MFA / "Auth/REST chưa sẵn sàng" khi máy tải nặng → chạy riêng smoke đó;
  pgTAP `reminders` lỗi nếu chạy sau smoke mà chưa reset DB.

## File cần đọc đầu tiên
- `supabase/migrations/202612180001_manager_release.sql`, `supabase/tests/manager_release.test.sql`, `docs/TASKS.md`
