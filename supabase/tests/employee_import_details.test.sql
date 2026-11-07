-- Nhập hồ sơ chi tiết: chỉ điền chỗ trống, không ghi đè; lương chỉ tạo phiên bản đầu tiên; client không gọi được.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
select set_config('test.t', (public.create_tenant_with_admin('DET-T', 'Công ty Hồ sơ', null, 'starter', 100, 'Lê Chủ', 'chu@det.test', null) ->> 'tenant_id'), true);
select set_config('test.code', (select employee_code from public.employees where tenant_id = current_setting('test.t')::uuid limit 1), true);
select set_config('test.emp', (select id::text from public.employees where tenant_id = current_setting('test.t')::uuid limit 1), true);
insert into public.employee_profiles (employee_id, tenant_id, address) values (current_setting('test.emp')::uuid, current_setting('test.t')::uuid, 'Địa chỉ đã duyệt');

select is(public.import_employee_details(current_setting('test.t')::uuid, null, jsonb_build_array(jsonb_build_object('code', current_setting('test.code'), 'details',
  '{"birth_date":"1999-07-02","gender":"female","id_number":"079199000123","address":"Địa chỉ trong file","bank":{"account_no":"0123456789","bank_name":"VCB","holder":"A"},"comp":{"base":15000000,"insurance":8000000}}'::jsonb))), 1, 'Bổ sung 1 người');
select is((select address || '|' || birth_date || '|' || id_number from public.employee_profiles where employee_id = current_setting('test.emp')::uuid), 'Địa chỉ đã duyệt|1999-07-02|079199000123', 'Không ghi đè địa chỉ đã có, điền chỗ trống');
select is((select base_salary from public.employee_compensations where employee_id = current_setting('test.emp')::uuid), 15000000::bigint, 'Tạo phiên bản lương đầu tiên');
select public.import_employee_details(current_setting('test.t')::uuid, null, jsonb_build_array(jsonb_build_object('code', current_setting('test.code'), 'details', '{"comp":{"base":99000000}}'::jsonb)));
select is((select count(*)::int from public.employee_compensations where employee_id = current_setting('test.emp')::uuid), 1, 'Đã có lương thì không tạo thêm');
set local role authenticated;
select throws_ok($$ select public.import_employee_details(gen_random_uuid(), null, '[]') $$, '42501', null, 'Client không gọi được');
reset role;
select * from finish();
rollback;
