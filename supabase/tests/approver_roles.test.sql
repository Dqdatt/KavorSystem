-- Người duyệt bước "Phòng Nhân sự": Nhân sự vận hành hoặc Quản trị viên công ty (công ty tạo từ Console chỉ có quản trị viên).
-- Quản lý không duyệt bước HR; bước Kế toán vẫn chỉ vai trò Kế toán. Không giả định DB trống (nhân viên/tài khoản riêng).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('test.t', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users (id, email) values ('ab000000-0000-4000-8000-000000000001', 'admin.only@example.test');
insert into public.employees (id, tenant_id, employee_code, full_name, hire_date, user_id) values
  ('eb000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'TADM01', 'Quản trị viên kiêm Head of HR', '2024-01-01', 'ab000000-0000-4000-8000-000000000001');
insert into public.memberships (tenant_id, employee_id, user_id, status) values
  (current_setting('test.t')::uuid, 'eb000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'active');
-- Chỉ vai trò Quản trị viên (như công ty vừa tạo từ Console)
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select m.tenant_id, m.id, r.id, 'tenant', '2024-01-01' from public.memberships m join public.roles r on r.tenant_id is null and r.code = 'tenant_admin'
where m.user_id = 'ab000000-0000-4000-8000-000000000001';

select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code = 'tenant_admin' and r.tenant_id is null and p.code = 'request.hr_review'), 'Vai trò Quản trị viên có quyền duyệt bước HR');
select is(public.employee_in_scope('ab000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'request.hr_review', '60000000-0000-4000-8000-000000000142'), true,
  'Tài khoản chỉ có vai trò Quản trị viên duyệt được bước HR của mọi nhân viên');
select ok('eb000000-0000-4000-8000-000000000001' in (select public.hr_reviewers(current_setting('test.t')::uuid, '60000000-0000-4000-8000-000000000142')),
  'Quản trị viên nhận thông báo đơn chờ bước HR');
select ok('eb000000-0000-4000-8000-000000000001' not in (select public.hr_reviewers(current_setting('test.t')::uuid, 'eb000000-0000-4000-8000-000000000001')),
  'Không là người duyệt bước HR cho đơn của chính mình');
select is(public.employee_in_scope('ab000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'salary_advance.process', '60000000-0000-4000-8000-000000000142'), false,
  'Quản trị viên không tự có quyền duyệt bước Kế toán');
select ok(not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code = 'manager' and r.tenant_id is null and p.code = 'request.hr_review'), 'Vai trò Quản lý không duyệt bước HR');

select * from finish();
rollback;
