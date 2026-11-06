-- Nhập nhân viên kèm tạo phòng ban/chức danh mới (giai đoạn 1 nhập file bất kỳ) + bảng nhớ cách khớp cột: nguyên khối, client không đọc/gọi được.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select set_config('test.t', (public.create_tenant_with_admin('IMP-U', 'Công ty Nhập Đơn Vị', null, 'starter', 100, 'Lê Chủ', 'chu@impu.test', null) ->> 'tenant_id'), true);
select set_config('test.b', (select b.id::text from public.branches b where b.tenant_id = current_setting('test.t')::uuid limit 1), true);
select set_config('test.le', (select legal_entity_id::text from public.branches where id = current_setting('test.b')::uuid), true);
create function pg_temp.row(code text, dept text, pos text) returns jsonb language sql as $$
  select jsonb_build_object('code', code, 'full_name', 'Người ' || code, 'work_email', null, 'hire_date', '2020-08-20', 'employment_type', 'official',
    'legal_entity_id', current_setting('test.le'), 'branch_id', current_setting('test.b'), 'department_id', null, 'department_code', dept,
    'position_id', null, 'position_code', pos, 'manager_code', null, 'manager_id', null) $$;

select is(jsonb_array_length(public.import_employees_with_units(current_setting('test.t')::uuid,
  jsonb_build_array(jsonb_build_object('code', 'KV', 'name', 'Kho vận', 'branch_id', current_setting('test.b'), 'effective_from', '2020-08-20')),
  jsonb_build_array(jsonb_build_object('code', 'NVK', 'name', 'Nhân viên kho', 'effective_from', '2020-08-20')),
  jsonb_build_array(pg_temp.row('U01', 'KV', 'NVK'), pg_temp.row('U02', 'KV', 'NVK')))), 2, 'Tạo 2 hồ sơ kèm đơn vị mới');
select is((select count(*)::int from public.employee_assignments a join public.departments d on d.id = a.department_id join public.positions p on p.id = a.position_id
  where d.code = 'KV' and p.code = 'NVK' and d.tenant_id = current_setting('test.t')::uuid and a.effective_from = '2020-08-20'), 2, 'Phân công vào phòng ban/chức danh mới, từ ngày vào làm');
select is((select effective_from from public.departments where code = 'KV' and tenant_id = current_setting('test.t')::uuid), '2020-08-20'::date, 'Đơn vị mới hiệu lực từ ngày vào làm sớm nhất');
select is((select work_email from public.employees where employee_code = 'U01' and tenant_id = current_setting('test.t')::uuid), null, 'Không có email vẫn nhập được');

select throws_ok($$ select public.import_employees_with_units(current_setting('test.t')::uuid,
  jsonb_build_array(jsonb_build_object('code', 'X1', 'name', 'Lỗi', 'branch_id', current_setting('test.b'), 'effective_from', '2020-01-01')), '[]'::jsonb,
  jsonb_build_array(pg_temp.row('U03', 'X1', 'KHONGCO'))) $$, 'P0001', 'IMPORT_UNIT_MISSING', 'Thiếu chức danh → lỗi');
select is((select count(*)::int from public.departments where code = 'X1'), 0, 'Lỗi giữa chừng không để lại đơn vị');

set local role authenticated;
select throws_ok($$ select * from public.employee_import_mappings $$, '42501', null, 'Client không đọc bảng nhớ cách khớp');
reset role;

select * from finish();
rollback;
