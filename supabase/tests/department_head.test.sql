-- Trưởng đơn vị: lưu được người cùng công ty, chặn người công ty khác.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
select set_config('test.t', (public.create_tenant_with_admin('DH-T', 'Công ty Trưởng đơn vị', null, 'starter', 100, 'Lê Chủ', 'chu@dh.test', null) ->> 'tenant_id'), true);
select set_config('test.u', (public.create_tenant_with_admin('DH-U', 'Công ty Khác', null, 'starter', 100, 'Lê Khác', 'khac@dh.test', null) ->> 'tenant_id'), true);
select lives_ok(format($$ update public.departments set head_employee_id = (select id from public.employees where tenant_id = %L limit 1) where tenant_id = %L $$,
  current_setting('test.t'), current_setting('test.t')), 'Gán trưởng đơn vị cùng công ty');
select throws_ok(format($$ update public.departments set head_employee_id = (select id from public.employees where tenant_id = %L limit 1) where tenant_id = %L $$,
  current_setting('test.u'), current_setting('test.t')), 'P0001', 'DEPARTMENT_HEAD_TENANT', 'Chặn người công ty khác');
select * from finish();
rollback;
