-- Xóa vĩnh viễn doanh nghiệp đã có kỳ lương + lần nhập (khóa ngoại vòng kỳ ↔ lần nhập) — lỗi PURGE_STUCK sửa ở 202611290001.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
select set_config('test.t', (public.create_tenant_with_admin('PRG-P', 'Công ty Xóa Lương', null, 'starter', 100, 'Lê Chủ', 'chu@prgp.test', null) ->> 'tenant_id'), true);
select set_config('test.u', (select user_id::text from public.platform_operators limit 1), true);
insert into auth.users (id, email) select gen_random_uuid(), 'nhap@prgp.test' where current_setting('test.u') = '';
select set_config('test.u', coalesce(nullif(current_setting('test.u'), ''), (select id::text from auth.users where email = 'nhap@prgp.test')), true);
select set_config('kavor.payroll_write', 'create', true);
insert into public.payroll_cycles (tenant_id, month, period_start, period_end, pay_date, created_by) values (current_setting('test.t')::uuid, '2026-10', '2026-10-01', '2026-10-31', '2026-11-05', current_setting('test.u')::uuid);
insert into public.payroll_import_batches (tenant_id, cycle_id, file_name, total_rows, error_rows, created_by)
  select tenant_id, id, 'x.csv', 0, 0, current_setting('test.u')::uuid from public.payroll_cycles where tenant_id = current_setting('test.t')::uuid;
select set_config('kavor.payroll_write', (select id::text from public.payroll_cycles where tenant_id = current_setting('test.t')::uuid), true);
update public.payroll_cycles c set latest_batch_id = b.id from public.payroll_import_batches b where b.cycle_id = c.id and c.tenant_id = current_setting('test.t')::uuid;
select set_config('kavor.payroll_write', '', true);
update public.tenants set status = 'suspended' where id = current_setting('test.t')::uuid;
select lives_ok(format('select public.purge_tenant(%L::uuid)', current_setting('test.t')), 'Xóa được doanh nghiệp có kỳ lương đã nhập');
select is((select count(*)::int from public.payroll_cycles where tenant_id = current_setting('test.t')::uuid), 0, 'Không còn kỳ lương');
select * from finish();
rollback;
