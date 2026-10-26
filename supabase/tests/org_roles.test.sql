-- Cơ cấu tổ chức + gán vai trò: quyền mới đúng vai trò, đơn vị cha cùng tenant, không vòng, ngày hợp lệ, không gán trùng, quyền thay đổi
-- có tác dụng ngay ở permission_scopes. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select is((select string_agg(r.code, ',' order by r.code) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where p.code = 'organization.manage' and r.tenant_id is null), 'hr_ops,tenant_admin', 'Quản lý cơ cấu: HR Ops + Tenant Admin');
select is((select string_agg(r.code, ',' order by r.code) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where p.code = 'role.assign' and r.tenant_id is null), 'tenant_admin', 'Gán vai trò: chỉ Tenant Admin');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where p.code = 'organization.manage' and r.code in ('payroll','manager','auditor') and r.tenant_id is null), 0, 'Payroll/Manager/Auditor không sửa cơ cấu');

select set_config('test.a', (public.create_tenant_with_admin('ORG-A', 'Công ty Tổ chức A', null, 'starter', 100, 'Lê Chủ', 'chu@orga.test', null) ->> 'tenant_id'), true);
select set_config('test.b', (public.create_tenant_with_admin('ORG-B', 'Công ty Tổ chức B', null, 'starter', 100, 'Trần Chủ', 'chu@orgb.test', null) ->> 'tenant_id'), true);
select set_config('test.le_b', (select id::text from public.legal_entities where tenant_id = current_setting('test.b')::uuid limit 1), true);
select set_config('test.br_a', (select id::text from public.branches where tenant_id = current_setting('test.a')::uuid limit 1), true);
select set_config('test.br_b', (select id::text from public.branches where tenant_id = current_setting('test.b')::uuid limit 1), true);

select throws_ok(format($$insert into public.branches (tenant_id, legal_entity_id, code, name, effective_from) values (%L, %L, 'X1', 'Chi nhánh lạ', current_date)$$,
  current_setting('test.a'), current_setting('test.le_b')), 'P0001', 'ORG_PARENT_INVALID', 'Chi nhánh không gắn pháp nhân tenant khác');
select throws_ok(format($$insert into public.departments (tenant_id, branch_id, code, name, effective_from) values (%L, %L, 'X2', 'Phòng lạ', current_date)$$,
  current_setting('test.a'), current_setting('test.br_b')), 'P0001', 'ORG_PARENT_INVALID', 'Phòng ban không gắn chi nhánh tenant khác');

insert into public.departments (id, tenant_id, branch_id, code, name, effective_from) values
  ('d9000000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, current_setting('test.br_a')::uuid, 'KD', 'Khối Kinh doanh', current_date);
insert into public.departments (id, tenant_id, branch_id, parent_id, code, name, effective_from) values
  ('d9000000-0000-4000-8000-000000000002', current_setting('test.a')::uuid, current_setting('test.br_a')::uuid, 'd9000000-0000-4000-8000-000000000001', 'KD1', 'Phòng Kinh doanh 1', current_date);
select is((select parent_id from public.departments where id = 'd9000000-0000-4000-8000-000000000002'), 'd9000000-0000-4000-8000-000000000001'::uuid, 'Phòng ban con thuộc khối');
select throws_ok($$update public.departments set parent_id = 'd9000000-0000-4000-8000-000000000002' where id = 'd9000000-0000-4000-8000-000000000001'$$, 'P0001', 'ORG_CYCLE', 'Không tạo vòng cha–con');
select throws_ok($$update public.departments set parent_id = 'd9000000-0000-4000-8000-000000000001' where id = 'd9000000-0000-4000-8000-000000000001'$$, 'P0001', 'ORG_CYCLE', 'Không tự làm cha của mình');
select throws_ok($$update public.departments set effective_to = effective_from - 1 where id = 'd9000000-0000-4000-8000-000000000002'$$, '23514', null, 'Ngày kết thúc không trước ngày hiệu lực');
select throws_ok(format($$insert into public.departments (tenant_id, branch_id, code, name, effective_from) values (%L, %L, 'KD', 'Trùng mã', current_date)$$,
  current_setting('test.a'), current_setting('test.br_a')), '23505', null, 'Mã phòng ban duy nhất trong tenant');

-- Gán vai trò
insert into auth.users (id, email) values ('a9100000-0000-4000-8000-000000000001', 'hr@orga.test');
insert into public.employees (id, tenant_id, employee_code, full_name, work_email, hire_date, user_id)
values ('e9100000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, 'HR01', 'Ngô HR', 'hr@orga.test', current_date, 'a9100000-0000-4000-8000-000000000001');
insert into public.memberships (id, tenant_id, user_id, employee_id, status)
values ('f9100000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, 'a9100000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001', 'active');
select is((select count(*)::int from public.permission_scopes('a9100000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, 'employee.update')), 0, 'Chưa gán: chưa có quyền');
insert into public.role_assignments (id, tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
select 'c9100000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, 'f9100000-0000-4000-8000-000000000001', r.id, 'department', 'd9000000-0000-4000-8000-000000000001', public.tenant_today(current_setting('test.a')::uuid)
from public.roles r where r.code = 'hr_ops' and r.tenant_id is null;
select is((select scope_id from public.permission_scopes('a9100000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, 'employee.update')), 'd9000000-0000-4000-8000-000000000001'::uuid,
  'Gán HR Ops theo phòng ban: có quyền ngay trong phạm vi');
select throws_ok(format($$insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
  select %L, 'f9100000-0000-4000-8000-000000000001', r.id, 'department', 'd9000000-0000-4000-8000-000000000001', current_date + 3 from public.roles r where r.code = 'hr_ops' and r.tenant_id is null$$, current_setting('test.a')),
  '23505', null, 'Không gán trùng vai trò + phạm vi đang mở');
update public.role_assignments set effective_to = public.tenant_today(current_setting('test.a')::uuid) - 1, effective_from = public.tenant_today(current_setting('test.a')::uuid) - 1
  where id = 'c9100000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.permission_scopes('a9100000-0000-4000-8000-000000000001', current_setting('test.a')::uuid, 'employee.update')), 0, 'Thu hồi (kết thúc hôm qua): mất quyền ngay');
select lives_ok(format($$insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
  select %L, 'f9100000-0000-4000-8000-000000000001', r.id, 'department', 'd9000000-0000-4000-8000-000000000001', current_date + 3 from public.roles r where r.code = 'hr_ops' and r.tenant_id is null$$, current_setting('test.a')),
  'Đã kết thúc thì gán lại được');

select * from finish();
rollback;
