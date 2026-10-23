-- Quyền HR theo permission + phạm vi, cách ly tenant, chống mất Tenant Admin, phiên bản bất biến.
-- Dùng dữ liệu seed (Thảo: tenant_admin + hr_ops toàn công ty; Huy: manager phòng Marketing; Bình: admin tenant B).
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Người dùng thử, gắn vào membership đã mời sẵn trong seed
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000007', 'thao.mai.rls@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'huy.le.rls@example.test'),
  ('a1000000-0000-4000-8000-000000000142', 'ha.rls@example.test'),
  ('a1000000-0000-4000-8000-000000000b01', 'binh.rls@example.test');
update public.employees set user_id = 'a1000000-0000-4000-8000-000000000007' where id = '60000000-0000-4000-8000-000000000007';
update public.employees set user_id = 'a1000000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
update public.employees set user_id = 'a1000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
update public.employees set user_id = 'a1000000-0000-4000-8000-000000000b01' where id = '60000000-0000-4000-8000-000000000b01';
update public.memberships set user_id = 'a1000000-0000-4000-8000-000000000007', status = 'active' where id = '80000000-0000-4000-8000-000000000007';
update public.memberships set user_id = 'a1000000-0000-4000-8000-000000000003', status = 'active' where id = '80000000-0000-4000-8000-000000000003';
update public.memberships set user_id = 'a1000000-0000-4000-8000-000000000b01', status = 'active' where id = '80000000-0000-4000-8000-000000000b01';
insert into public.memberships (tenant_id, user_id, employee_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000142', 'active')
on conflict (tenant_id, employee_id) do update set user_id = excluded.user_id, status = 'active';

-- Thiết bị và chấm công: Hà (Marketing) và An (Ban Điều hành)
update public.employee_devices set status = 'revoked' where employee_id in ('60000000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000001');
insert into public.employee_devices (id, tenant_id, employee_id, installation_id, platform) values
  ('d1000000-0000-4000-8000-000000000142', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'rls-test-ha-01', 'ios'),
  ('d1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'rls-test-an-01', 'android');
insert into public.attendance_events (tenant_id, employee_id, device_id, kind, client_event_id, occurred_at, status) values
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'd1000000-0000-4000-8000-000000000142', 'in', 'rls-evt-ha-1', now(), 'accepted'),
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'in', 'rls-evt-an-1', now(), 'rejected');
insert into public.audit_logs (tenant_id, actor_type, action, resource_type, correlation_id) values
  ('10000000-0000-4000-8000-000000000001', 'system', 'rls.test', 'tenant', 'rls-test');
select set_config('test.a_employees', (select count(*)::text from public.employees where tenant_id = '10000000-0000-4000-8000-000000000001'), true);

set local role authenticated;

-- HR (Thảo): toàn tenant A, không thấy tenant B
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is((select count(*)::int from public.employees), current_setting('test.a_employees')::int, 'HR thấy mọi nhân viên tenant A');
select is((select count(*)::int from public.employees where tenant_id <> '10000000-0000-4000-8000-000000000001'), 0, 'HR không thấy nhân viên tenant B');
select is((select count(*)::int from public.attendance_events where client_event_id like 'rls-evt-%'), 2, 'HR thấy chấm công cả hai phòng ban');
select is((select count(*)::int from public.employee_devices where installation_id like 'rls-test-%'), 2, 'HR thấy thiết bị trong phạm vi');
select ok((select count(*) from public.audit_logs where correlation_id = 'rls-test') = 1, 'HR có audit.read nên đọc được audit');
select ok((select count(*) from public.policy_assignments) >= 3, 'HR đọc được cách áp dụng ca/địa điểm');
select ok(public.has_permission('schedule.manage', '10000000-0000-4000-8000-000000000001'), 'HR có quyền quản lý ca');
select throws_ok($$select * from public.scoped_employees('a1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'employee.read')$$, '42501', null, 'Client không gọi được hàm phạm vi với người dùng tùy ý');

-- Quản lý (Huy): chỉ phòng Marketing
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.employees), 2, 'Quản lý chỉ thấy 2 nhân viên phòng Marketing');
select is((select count(*)::int from public.attendance_events where client_event_id = 'rls-evt-ha-1'), 1, 'Quản lý thấy chấm công của Hà (Marketing)');
select is((select count(*)::int from public.attendance_events where client_event_id = 'rls-evt-an-1'), 0, 'Quản lý không thấy chấm công ngoài phòng');
select is((select count(*)::int from public.audit_logs), 0, 'Quản lý không có audit.read');
select ok(not public.has_permission('schedule.manage', '10000000-0000-4000-8000-000000000001'), 'Quản lý không quản lý được ca');
select ok((select count(*) from public.policy_assignments) >= 3, 'Quản lý có schedule.read nên xem được cách áp dụng ca');

-- Nhân viên (Hà): chỉ dữ liệu của mình
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select count(*)::int from public.employees), 1, 'Nhân viên chỉ thấy hồ sơ của mình');
select is((select count(*)::int from public.attendance_events where client_event_id like 'rls-evt-%'), 1, 'Nhân viên chỉ thấy chấm công của mình');
select is((select count(*)::int from public.audit_logs), 0, 'Nhân viên không đọc được audit');
select is((select count(*)::int from public.policy_assignments), 0, 'Nhân viên không có schedule.read');

-- Admin tenant B: không thấy gì của tenant A
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
select is((select count(*)::int from public.employees where tenant_id = '10000000-0000-4000-8000-000000000001'), 0, 'Admin tenant B không thấy nhân viên tenant A');
select is((select count(*)::int from public.attendance_events), 0, 'Admin tenant B không thấy chấm công tenant A');
select is((select count(*)::int from public.employee_devices), 0, 'Admin tenant B không thấy thiết bị tenant A');
reset role;

-- Chống mất quyền: Thảo là Tenant Admin duy nhất
select throws_ok($$update public.memberships set status = 'suspended' where id = '80000000-0000-4000-8000-000000000007'$$, 'P0001', 'LAST_TENANT_ADMIN', 'Không khóa được Tenant Admin cuối cùng');
select throws_ok($$delete from public.role_assignments where membership_id = '80000000-0000-4000-8000-000000000007' and role_id = (select id from public.roles where code = 'tenant_admin' and tenant_id is null)$$, 'P0001', 'LAST_TENANT_ADMIN', 'Không gỡ được role Tenant Admin cuối cùng');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type)
select '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000003', id, 'tenant' from public.roles where code = 'tenant_admin' and tenant_id is null;
select lives_ok($$update public.memberships set status = 'suspended' where id = '80000000-0000-4000-8000-000000000007'$$, 'Có Tenant Admin thứ hai thì khóa được');

-- Phiên bản bất biến, áp dụng chỉ được kết thúc
select throws_ok($$update public.shift_versions set start_time = '09:00'$$, 'P0001', 'shift_versions is immutable', 'Không sửa được phiên bản ca');
select throws_ok($$update public.policy_assignments set target_id = gen_random_uuid()$$, 'P0001', 'policy_assignments: only effective_to can change', 'Chỉ đổi được ngày kết thúc của áp dụng');
select throws_ok($$insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, scope_id, effective_from) values ('10000000-0000-4000-8000-000000000001','shift','90000000-0000-4000-8000-000000000001','employee','60000000-0000-4000-8000-000000000142','2026-11-01')$$, '23514', null, 'Ngoại lệ cá nhân bắt buộc có lý do');

select * from finish();
rollback;
