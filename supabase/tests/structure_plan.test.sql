-- Sắp xếp tự động: đặt cấp chức danh + đổi quản lý giữ lịch sử phân công, nguyên khối, client không gọi được.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('test.t', (public.create_tenant_with_admin('STR-T', 'Công ty Cấu trúc', null, 'starter', 100, 'Lê Chủ', 'chu@str.test', null) ->> 'tenant_id'), true);
select set_config('test.org', (select jsonb_build_object('legal_entity_id', b.legal_entity_id, 'branch_id', b.id, 'department_id', d.id, 'position_id', (select id from public.positions where tenant_id = b.tenant_id limit 1))::text
  from public.departments d join public.branches b on b.id = d.branch_id where d.tenant_id = current_setting('test.t')::uuid limit 1), true);
select public.import_employees(current_setting('test.t')::uuid, jsonb_build_array(
  current_setting('test.org')::jsonb || '{"code":"S01","full_name":"Sếp","hire_date":"2026-01-05","employment_type":"official"}'::jsonb,
  current_setting('test.org')::jsonb || '{"code":"S02","full_name":"Nhân viên","hire_date":"2026-01-05","employment_type":"official"}'::jsonb));
select set_config('test.boss', (select id::text from public.employees where employee_code = 'S01' and tenant_id = current_setting('test.t')::uuid), true);
select set_config('test.emp', (select id::text from public.employees where employee_code = 'S02' and tenant_id = current_setting('test.t')::uuid), true);
select set_config('test.pos', (current_setting('test.org')::jsonb ->> 'position_id'), true);

select is(public.apply_structure_plan(current_setting('test.t')::uuid, '2026-11-07',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.pos'), 'tier', 2)),
  jsonb_build_array(jsonb_build_object('employee_id', current_setting('test.emp'), 'manager_id', current_setting('test.boss')))),
  '{"tiers": 1, "managers": 1}'::jsonb, 'Đặt 1 cấp, đổi 1 quản lý');
select is((select management_tier::int from public.positions where id = current_setting('test.pos')::uuid), 2, 'Cấp chức danh đã đặt');
select is((select effective_to from public.employee_assignments where employee_id = current_setting('test.emp')::uuid and effective_from = '2026-01-05'), '2026-11-06'::date, 'Phân công cũ đóng hôm qua');
select is((select manager_employee_id::text from public.employee_assignments where employee_id = current_setting('test.emp')::uuid and effective_from = '2026-11-07'), current_setting('test.boss'), 'Phân công mới từ hôm nay có quản lý');
select throws_ok(format($$ select public.apply_structure_plan(%L::uuid, '2026-11-07', '[]', jsonb_build_array(jsonb_build_object('employee_id', %L, 'manager_id', gen_random_uuid()))) $$,
  current_setting('test.t'), current_setting('test.emp')), 'P0001', 'STRUCTURE_MANAGER_INVALID', 'Quản lý không thuộc công ty → lỗi');
set local role authenticated;
select throws_ok($$ select public.apply_structure_plan(gen_random_uuid(), current_date, '[]', '[]') $$, '42501', null, 'Client không gọi được');
reset role;

select * from finish();
rollback;
