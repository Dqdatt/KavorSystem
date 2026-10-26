-- Nhập nhân viên hàng loạt: ghi nguyên khối, quản lý trong cùng file, mã đã có thì bỏ qua, lỗi giữa chừng thì không ghi gì, client không gọi được.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select set_config('test.t', (public.create_tenant_with_admin('IMP-T', 'Công ty Nhập', null, 'starter', 100, 'Lê Chủ', 'chu@imp.test', null) ->> 'tenant_id'), true);
select set_config('test.org', (select jsonb_build_object('legal_entity_id', b.legal_entity_id, 'branch_id', b.id, 'department_id', d.id, 'position_id', (select id from public.positions where tenant_id = b.tenant_id limit 1))::text
  from public.departments d join public.branches b on b.id = d.branch_id where d.tenant_id = current_setting('test.t')::uuid limit 1), true);
create function pg_temp.row(code text, manager text default null, extra jsonb default '{}') returns jsonb language sql as $$
  select current_setting('test.org')::jsonb || jsonb_build_object('code', code, 'full_name', 'Người ' || code, 'work_email', lower(code) || '@imp.test', 'hire_date', '2026-01-05',
    'employment_type', 'official', 'manager_code', manager) || extra $$;

select is(jsonb_array_length(public.import_employees(current_setting('test.t')::uuid, jsonb_build_array(pg_temp.row('NV02', 'NV01'), pg_temp.row('NV01')))), 2,
  'Tạo 2 hồ sơ (quản lý đứng sau trong file vẫn gắn được)');
select is((select m.employee_code from public.employee_assignments a join public.employees e on e.id = a.employee_id join public.employees m on m.id = a.manager_employee_id where e.employee_code = 'NV02' and e.tenant_id = current_setting('test.t')::uuid),
  'NV01', 'Quản lý trực tiếp lấy từ cùng file');
select is((select effective_from::text || ' · ' || source_system from public.employee_assignments a join public.employees e on e.id = a.employee_id where e.employee_code = 'NV01' and e.tenant_id = current_setting('test.t')::uuid),
  '2026-01-05 · import', 'Phân công hiệu lực từ ngày vào làm, đánh dấu nguồn nhập');
select is(jsonb_array_length(public.import_employees(current_setting('test.t')::uuid, jsonb_build_array(pg_temp.row('NV01'), pg_temp.row('NV03')))), 1, 'Nhập lại: mã đã có bỏ qua, chỉ tạo mới NV03');
select is((select count(*)::int from public.employee_assignments a join public.employees e on e.id = a.employee_id where e.employee_code = 'NV01' and e.tenant_id = current_setting('test.t')::uuid), 1, 'Không tạo phân công trùng cho người đã có');
select throws_ok(format($$select public.import_employees(%L, jsonb_build_array(pg_temp.row('NV04'), pg_temp.row('NV05', 'KHONGCO')))$$, current_setting('test.t')), 'P0001', 'IMPORT_MANAGER_MISSING',
  'Quản lý không tồn tại → lỗi');
select is((select count(*)::int from public.employees where tenant_id = current_setting('test.t')::uuid and employee_code in ('NV04', 'NV05')), 0, 'Lỗi giữa chừng thì không ghi dòng nào');
set local role authenticated;
select throws_ok(format($$select public.import_employees(%L, '[]')$$, current_setting('test.t')), '42501', null, 'Client không gọi được hàm nhập');
reset role;

select * from finish();
rollback;
