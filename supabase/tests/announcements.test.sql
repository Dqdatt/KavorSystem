-- Bản tin: dữ liệu riêng trong transaction, chạy được cả sau smoke (không giả định DB trống).
-- now() cố định trong transaction: bài xuất bản "ngay" có publish_at = now() nên đã hiển thị.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users (id, email) values
  ('a4100000-0000-4000-8000-000000000001','ann-admin@example.test'),
  ('a4100000-0000-4000-8000-000000000002','ann-child@example.test'),
  ('a4100000-0000-4000-8000-000000000003','ann-other-dept@example.test'),
  ('a4100000-0000-4000-8000-000000000004','ann-other-tenant@example.test'),
  ('a4100000-0000-4000-8000-000000000005','ann-hr-dept@example.test');
select set_config('test.at', (public.create_tenant_with_admin('ANNTEST','Công ty thử bản tin',null,'trial',20,'Admin bản tin','ann-admin-x@example.test',null)->>'tenant_id'), true);
select set_config('test.aother', (public.create_tenant_with_admin('ANNOTHER','Tenant khác bản tin',null,'trial',20,'Admin khác','ann-admin-y@example.test',null)->>'tenant_id'), true);

select is((select string_agg(r.code || ':' || p.code, ',' order by r.code) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
  where r.tenant_id is null and p.code like 'announcement.%'),
  'employee:announcement.read,hr_ops:announcement.publish,tenant_admin:announcement.publish', 'Nhân viên đọc; HR và Tenant Admin đăng; vai trò khác không có');

-- Tổ chức: phòng cha P (có phòng con C), phòng B ở chi nhánh khác
insert into public.legal_entities (id, tenant_id, code, name, effective_from) values ('a4200000-0000-4000-8000-000000000001', current_setting('test.at')::uuid, 'ANNLE', 'Pháp nhân', '2020-01-01');
insert into public.branches (id, tenant_id, legal_entity_id, code, name, effective_from) values
  ('a4300000-0000-4000-8000-000000000001', current_setting('test.at')::uuid, 'a4200000-0000-4000-8000-000000000001', 'ANNHCM', 'HCM', '2020-01-01'),
  ('a4300000-0000-4000-8000-000000000002', current_setting('test.at')::uuid, 'a4200000-0000-4000-8000-000000000001', 'ANNHN', 'Hà Nội', '2020-01-01');
insert into public.departments (id, tenant_id, branch_id, parent_id, code, name, effective_from) values
  ('a4400000-0000-4000-8000-000000000001', current_setting('test.at')::uuid, 'a4300000-0000-4000-8000-000000000001', null, 'ANNP', 'Khối văn phòng', '2020-01-01'),
  ('a4400000-0000-4000-8000-000000000002', current_setting('test.at')::uuid, 'a4300000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'ANNC', 'Phòng con', '2020-01-01'),
  ('a4400000-0000-4000-8000-000000000003', current_setting('test.at')::uuid, 'a4300000-0000-4000-8000-000000000002', null, 'ANNB', 'Kinh doanh HN', '2020-01-01');
insert into public.positions (id, tenant_id, code, name, effective_from) values ('a4500000-0000-4000-8000-000000000001', current_setting('test.at')::uuid, 'ANNNV', 'Nhân viên', '2020-01-01');
insert into public.employees (id, tenant_id, employee_code, user_id, full_name, hire_date, status, termination_date) values
  ('e4100000-0000-4000-8000-000000000002', current_setting('test.at')::uuid, 'C01', 'a4100000-0000-4000-8000-000000000002', 'Nhân viên phòng con', '2020-01-01', 'active', null),
  ('e4100000-0000-4000-8000-000000000003', current_setting('test.at')::uuid, 'B01', 'a4100000-0000-4000-8000-000000000003', 'Nhân viên Hà Nội', '2020-01-01', 'active', null),
  ('e4100000-0000-4000-8000-000000000004', current_setting('test.aother')::uuid, 'X01', 'a4100000-0000-4000-8000-000000000004', 'Nhân viên tenant khác', '2020-01-01', 'active', null),
  ('e4100000-0000-4000-8000-000000000005', current_setting('test.at')::uuid, 'P01', 'a4100000-0000-4000-8000-000000000005', 'HR phòng P', '2020-01-01', 'active', null),
  ('e4100000-0000-4000-8000-000000000006', current_setting('test.at')::uuid, 'Q01', null, 'Đã nghỉ việc', '2020-01-01', 'terminated', '2021-01-01');
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, effective_from) values
  (current_setting('test.at')::uuid, 'e4100000-0000-4000-8000-000000000002', 'a4200000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000002', 'a4500000-0000-4000-8000-000000000001', '2020-01-01'),
  (current_setting('test.at')::uuid, 'e4100000-0000-4000-8000-000000000003', 'a4200000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000003', 'a4500000-0000-4000-8000-000000000001', '2020-01-01'),
  (current_setting('test.at')::uuid, 'e4100000-0000-4000-8000-000000000005', 'a4200000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'a4500000-0000-4000-8000-000000000001', '2020-01-01'),
  (current_setting('test.at')::uuid, 'e4100000-0000-4000-8000-000000000006', 'a4200000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000002', 'a4500000-0000-4000-8000-000000000001', '2020-01-01');
insert into public.memberships (tenant_id, employee_id, user_id, status)
select tenant_id, id, user_id, 'active' from public.employees where id in
  ('e4100000-0000-4000-8000-000000000002','e4100000-0000-4000-8000-000000000003','e4100000-0000-4000-8000-000000000004','e4100000-0000-4000-8000-000000000005');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select m.tenant_id, m.id, r.id, 'self', '2020-01-01' from public.memberships m join public.roles r on r.code='employee' and r.tenant_id is null
where m.user_id in ('a4100000-0000-4000-8000-000000000002','a4100000-0000-4000-8000-000000000003','a4100000-0000-4000-8000-000000000004','a4100000-0000-4000-8000-000000000005');
-- HR chỉ có phạm vi phòng P: chưa được đăng (cần toàn công ty)
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
select m.tenant_id, m.id, r.id, 'department', 'a4400000-0000-4000-8000-000000000001', '2020-01-01' from public.memberships m join public.roles r on r.code='hr_ops' and r.tenant_id is null
where m.user_id = 'a4100000-0000-4000-8000-000000000005';
-- Tenant Admin của công ty thử (ADMIN01) gắn tài khoản a41…01
update public.employees set user_id='a4100000-0000-4000-8000-000000000001' where tenant_id=current_setting('test.at')::uuid and employee_code='ADMIN01';
update public.memberships set user_id='a4100000-0000-4000-8000-000000000001', status='active'
where tenant_id=current_setting('test.at')::uuid and employee_id=(select id from public.employees where tenant_id=current_setting('test.at')::uuid and employee_code='ADMIN01');

-- ---------- Quyền soạn bài ----------
select throws_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000002', null, '{"category":"notice","title":"x"}', '[]')$$,
  'P0001', 'ANNOUNCEMENT_FORBIDDEN', 'Nhân viên không soạn được bài');
select throws_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000005', null, '{"category":"notice","title":"x"}', '[]')$$,
  'P0001', 'ANNOUNCEMENT_FORBIDDEN', 'HR phạm vi phòng ban chưa được đăng');
select throws_ok($$select public.save_announcement(current_setting('test.aother')::uuid, 'a4100000-0000-4000-8000-000000000001', null, '{"category":"notice","title":"x"}', '[]')$$,
  'P0001', 'ANNOUNCEMENT_FORBIDDEN', 'Admin không soạn bài cho tenant khác');
select throws_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null, '{"category":"notice","title":"x","audience":"units"}', '[]')$$,
  'P0001', 'ANNOUNCEMENT_AUDIENCE_REQUIRED', 'Chọn người nhận theo đơn vị phải có ít nhất một đơn vị');
select throws_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null, '{"category":"notice","title":"x","audience":"units"}',
  '[{"type":"department","id":"40000000-0000-4000-8000-000000000002"}]')$$, 'P0001', 'ANNOUNCEMENT_UNIT_INVALID', 'Phòng ban của tenant khác bị chặn');
select throws_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null, '{"category":"memo","title":"x"}', '[]')$$,
  '23514', null, 'Danh mục lạ bị chặn');

select set_config('test.all', public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null,
  '{"category":"policy","title":"Toàn công ty","body":"Đoạn 1\n\n- Ý a\n- Ý b","important":true,"notify":true,"authorLabel":"Phòng Nhân sự"}', '[]')::text, true);
select set_config('test.unit', public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null,
  '{"category":"notice","title":"Riêng khối văn phòng","audience":"units","notify":true}', '[{"type":"department","id":"a4400000-0000-4000-8000-000000000001"}]')::text, true);
select is((select publish_at from public.announcements where id = current_setting('test.all')::uuid), null, 'Bài mới là nháp');
select is((select count(*)::int from public.announcement_audiences where announcement_id = current_setting('test.unit')::uuid), 1, 'Lưu một đơn vị nhận');

-- ---------- Người nhận ----------
select set_eq($$select public.announcement_recipients(current_setting('test.unit')::uuid)$$,
  $$values ('e4100000-0000-4000-8000-000000000002'::uuid), ('e4100000-0000-4000-8000-000000000005'::uuid)$$,
  'Phòng cha gồm cả phòng con; không gồm phòng khác, người đã nghỉ');
select ok('e4100000-0000-4000-8000-000000000003'::uuid in (select public.announcement_recipients(current_setting('test.all')::uuid)), 'Toàn công ty gồm cả chi nhánh khác');
select ok('e4100000-0000-4000-8000-000000000006'::uuid not in (select public.announcement_recipients(current_setting('test.all')::uuid)), 'Toàn công ty không gồm người đã nghỉ');
select ok('e4100000-0000-4000-8000-000000000004'::uuid not in (select public.announcement_recipients(current_setting('test.all')::uuid)), 'Không gồm nhân viên tenant khác');
select ok(not public.announcement_visible(current_setting('test.all')::uuid, 'e4100000-0000-4000-8000-000000000002'), 'Nháp chưa ai thấy');

-- Đổi người nhận sang chi nhánh HN (thay toàn bộ đơn vị cũ)
select lives_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', current_setting('test.unit')::uuid,
  '{"category":"notice","title":"Riêng chi nhánh HN","audience":"units","notify":true}', '[{"type":"branch","id":"a4300000-0000-4000-8000-000000000002"}]')$$, 'Sửa bài nháp');
select set_eq($$select public.announcement_recipients(current_setting('test.unit')::uuid)$$, $$values ('e4100000-0000-4000-8000-000000000003'::uuid)$$, 'Chọn chi nhánh thay đơn vị cũ');

-- ---------- Xuất bản + thông báo ----------
select throws_ok($$select public.publish_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000002', current_setting('test.all')::uuid, null)$$,
  'P0001', 'ANNOUNCEMENT_FORBIDDEN', 'Nhân viên không xuất bản được');
select is(public.publish_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', current_setting('test.all')::uuid, null), now(), 'Xuất bản ngay');
select ok(public.announcement_visible(current_setting('test.all')::uuid, 'e4100000-0000-4000-8000-000000000002'), 'Người nhận thấy bài đã xuất bản');
select is((select count(*)::int from public.notifications where link_type = 'announcement' and link_id = current_setting('test.all')::uuid), 4,
  'Thông báo cho mọi người nhận (admin + 3 nhân viên chưa nghỉ)');
select is((select title from public.notifications where link_id = current_setting('test.all')::uuid and recipient_employee_id = 'e4100000-0000-4000-8000-000000000002'),
  'Bản tin quan trọng: Toàn công ty', 'Tiêu đề thông báo theo bài quan trọng, không chép nội dung');
select is(public.notify_due_announcements(current_setting('test.all')::uuid), 0, 'Không gửi thông báo lần hai');
select throws_ok($$select public.publish_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', current_setting('test.all')::uuid, null)$$,
  'P0001', 'ANNOUNCEMENT_NOT_PUBLISHABLE', 'Bài đã xuất bản không xuất bản lại');
select throws_ok($$update public.announcements set publish_at = now() + interval '1 day' where id = current_setting('test.all')::uuid$$,
  'P0001', 'ANNOUNCEMENT_PUBLISHED', 'Không lùi giờ bài đã xuất bản');
select throws_ok($$delete from public.announcements where id = current_setting('test.all')::uuid$$, 'P0001', 'ANNOUNCEMENT_PUBLISHED', 'Không xóa bài đã xuất bản');
select lives_ok($$update public.announcements set title = 'Toàn công ty (sửa lỗi chính tả)' where id = current_setting('test.all')::uuid$$, 'Sửa nội dung bài đã xuất bản được');

-- Hẹn giờ: chưa ai thấy, chưa thông báo; tới giờ thì quét mới gửi
select ok(public.publish_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', current_setting('test.unit')::uuid, now() + interval '1 day') > now(), 'Hẹn giờ ngày mai');
select ok(not public.announcement_visible(current_setting('test.unit')::uuid, 'e4100000-0000-4000-8000-000000000003'), 'Bài hẹn giờ chưa hiện');
select is(public.notify_due_announcements(current_setting('test.unit')::uuid), 0, 'Chưa tới giờ chưa thông báo');
update public.announcements set publish_at = now() - interval '1 minute' where id = current_setting('test.unit')::uuid;
select is(public.notify_due_announcements(), 1, 'Quét định kỳ gửi bài đã tới giờ');
select is((select count(*)::int from public.notifications where link_id = current_setting('test.unit')::uuid), 1, 'Chỉ người nhận của bài được báo');

-- Bài hẹn chưa tới giờ xóa được
select set_config('test.sched', public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null, '{"category":"event","title":"Hẹn rồi xóa"}', '[]')::text, true);
select public.publish_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', current_setting('test.sched')::uuid, now() + interval '2 days');
select lives_ok($$delete from public.announcements where id = current_setting('test.sched')::uuid$$, 'Xóa bài hẹn giờ chưa tới giờ');

-- ---------- Đã đọc ----------
insert into public.announcement_reads (announcement_id, tenant_id, employee_id) values (current_setting('test.all')::uuid, current_setting('test.at')::uuid, 'e4100000-0000-4000-8000-000000000002');
select throws_ok($$update public.announcement_reads set read_at = now() where employee_id = 'e4100000-0000-4000-8000-000000000002'$$, 'P0001', 'ANNOUNCEMENT_READ_IMMUTABLE', 'Lượt đọc không sửa');
select throws_ok($$delete from public.announcement_reads where employee_id = 'e4100000-0000-4000-8000-000000000002'$$, 'P0001', 'ANNOUNCEMENT_READ_IMMUTABLE', 'Lượt đọc không xóa');

-- ---------- RLS ----------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a4100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.announcements where tenant_id = current_setting('test.at')::uuid), 1, 'Nhân viên phòng con chỉ thấy bài toàn công ty đã xuất bản');
select is((select count(*)::int from public.announcement_reads), 1, 'Nhân viên thấy lượt đọc của mình');
select is((select count(*)::int from public.announcement_audiences), 0, 'Nhân viên không đọc được danh sách đơn vị nhận');
select throws_ok($$select public.save_announcement(current_setting('test.at')::uuid, 'a4100000-0000-4000-8000-000000000001', null, '{"category":"notice","title":"x"}', '[]')$$,
  '42501', null, 'Client không gọi được hàm ghi');
select set_config('request.jwt.claims','{"sub":"a4100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.announcements where tenant_id = current_setting('test.at')::uuid), 2, 'Nhân viên HN thấy bài toàn công ty và bài riêng HN');
select set_config('request.jwt.claims','{"sub":"a4100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.announcements where tenant_id = current_setting('test.at')::uuid), 0, 'Tenant khác không thấy bài');
select set_config('request.jwt.claims','{"sub":"a4100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.announcements where tenant_id = current_setting('test.at')::uuid), 2, 'Người đăng thấy mọi bài của công ty');
reset role;

-- ---------- Gỡ bài ----------
update public.announcements set archived_at = now(), archived_by = 'a4100000-0000-4000-8000-000000000001' where id = current_setting('test.all')::uuid;
select ok(not public.announcement_visible(current_setting('test.all')::uuid, 'e4100000-0000-4000-8000-000000000002'), 'Bài đã gỡ không còn hiện');
select throws_ok($$update public.announcements set title = 'Sửa sau khi gỡ' where id = current_setting('test.all')::uuid$$, 'P0001', 'ANNOUNCEMENT_ARCHIVED', 'Bài đã gỡ không sửa được');

select * from finish();
rollback;
