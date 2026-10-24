-- "Hôm nay" theo múi giờ công ty: vai trò/phân công hiệu lực từ hôm nay của tenant phải có tác dụng ngay, kể cả khi ngày UTC khác.
-- Chọn múi giờ test sao cho ngày của tenant luôn khác ngày UTC lúc chạy (UTC+14 khi đã qua 10:00 UTC, ngược lại UTC−12),
-- nên code cũ dùng current_date (UTC) chắc chắn trượt ít nhất một test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.tenants (id, code, display_name, timezone)
values ('10000000-0000-4000-8000-0000000000d1', 'TEST-TZ', 'Thử múi giờ',
  case when extract(hour from now() at time zone 'UTC') >= 10 then 'Etc/GMT-14' else 'Etc/GMT+12' end);
select isnt(public.tenant_today('10000000-0000-4000-8000-0000000000d1'), (now() at time zone 'UTC')::date, 'Ngày của tenant test khác ngày UTC');
select is(public.tenant_today('10000000-0000-4000-8000-0000000000d1'),
  (now() at time zone (select timezone from public.tenants where id = '10000000-0000-4000-8000-0000000000d1'))::date, 'tenant_today theo múi giờ tenant');

insert into auth.users (id, email) values ('a9000000-0000-4000-8000-0000000000d1', 'admin.tz@example.test');
insert into public.employees (id, tenant_id, employee_code, full_name, hire_date)
values ('60000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'TZ01', 'Quản trị múi giờ', public.tenant_today('10000000-0000-4000-8000-0000000000d1'));
update public.employees set user_id = 'a9000000-0000-4000-8000-0000000000d1' where id = '60000000-0000-4000-8000-0000000000d1';
insert into public.memberships (id, tenant_id, user_id, employee_id, status)
values ('80000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'a9000000-0000-4000-8000-0000000000d1', '60000000-0000-4000-8000-0000000000d1', 'active');
-- Tenant Admin từ hôm nay (theo tenant) + một vai trò HR chỉ hiệu lực từ ngày mai (theo tenant)
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select '10000000-0000-4000-8000-0000000000d1', '80000000-0000-4000-8000-0000000000d1', r.id, 'tenant', public.tenant_today('10000000-0000-4000-8000-0000000000d1')
from public.roles r where r.code = 'tenant_admin' and r.tenant_id is null;
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select '10000000-0000-4000-8000-0000000000d1', '80000000-0000-4000-8000-0000000000d1', r.id, 'tenant', public.tenant_today('10000000-0000-4000-8000-0000000000d1') + 1
from public.roles r where r.code = 'hr_ops' and r.tenant_id is null;

select is(public.active_tenant_admin_count('10000000-0000-4000-8000-0000000000d1'), 1, 'Tenant Admin tạo hôm nay có hiệu lực ngay');
select is((select count(*)::int from public.permission_grants('a9000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1') where role_code = 'tenant_admin') > 0, true,
  'Quyền của vai trò hiệu lực hôm nay có ngay');
select is((select count(*)::int from public.permission_grants('a9000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1') where role_code = 'hr_ops'), 0,
  'Vai trò hiệu lực từ ngày mai (theo tenant) chưa có tác dụng');
select is((select count(*)::int from public.permission_scopes('a9000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'request.hr_review')), 0,
  'Quyền chỉ có ở vai trò ngày mai thì hôm nay chưa có');
select ok(exists (select 1 from public.scoped_employees('a9000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'employee.read') where id = '60000000-0000-4000-8000-0000000000d1'),
  'Phạm vi nhân viên tính theo hôm nay của tenant');

select * from finish();
rollback;
