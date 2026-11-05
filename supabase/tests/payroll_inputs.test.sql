-- Lương đầu vào HCNS: HR/Quản trị viên được xem/sửa lương (Quản lý không), cột mới của phiên bản lương, người phụ thuộc,
-- MST/công đoàn, RLS (nhân viên thấy của mình, quản lý không thấy), bảng đầu vào đã chốt bất biến và client không đọc được.
-- Dùng dữ liệu seed (Thảo HD0007: tenant_admin + hr_ops; Huy HDG0003: quản lý của Hà HD0142). Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select string_agg(distinct r.code, ',' order by r.code) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.tenant_id is null and p.code = 'compensation.manage'), 'hr_ops,payroll,tenant_admin', 'HCNS, Quản trị viên, Kế toán quản lý lương đầu vào');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code = 'manager' and r.tenant_id is null and p.code like 'compensation%'), 0, 'Quản lý mặc định không xem lương');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code = 'hr_ops' and r.tenant_id is null and p.code like 'payroll.%'), 0, 'HCNS không duyệt/công bố kỳ lương');

insert into auth.users (id, email) values
  ('a1800000-0000-4000-8000-000000000007', 'thao.pi@example.test'),
  ('a1800000-0000-4000-8000-000000000003', 'huy.pi@example.test'),
  ('a1800000-0000-4000-8000-000000000142', 'ha.pi@example.test');
update public.employees set user_id = 'a1800000-0000-4000-8000-000000000007' where id = '60000000-0000-4000-8000-000000000007';
update public.employees set user_id = 'a1800000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
update public.employees set user_id = 'a1800000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
update public.memberships set user_id = 'a1800000-0000-4000-8000-000000000007', status = 'active' where id = '80000000-0000-4000-8000-000000000007';
update public.memberships set user_id = 'a1800000-0000-4000-8000-000000000003', status = 'active' where id = '80000000-0000-4000-8000-000000000003';
insert into public.memberships (tenant_id, user_id, employee_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a1800000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000142', 'active')
on conflict (tenant_id, employee_id) do update set user_id = excluded.user_id, status = 'active';

-- Phiên bản lương có lương đóng BH, phụ cấp, tình trạng lao động
insert into public.employee_compensations (tenant_id, employee_id, base_salary, insurance_salary, allowance, employment_type, effective_from)
values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 16000000, 9000000, 1500000, 'official', '2025-01-01');
select throws_ok($$ insert into public.employee_compensations (tenant_id, employee_id, base_salary, allowance, effective_from)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 16000000, -1, '2025-02-01') $$, '23514', null, 'Phụ cấp không âm');
select throws_ok($$ insert into public.employee_compensations (tenant_id, employee_id, base_salary, employment_type, effective_from)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 16000000, 'part', '2025-02-01') $$, '23514', null, 'Tình trạng lao động trong danh mục');

insert into public.employee_tax_profiles (employee_id, tenant_id, tax_code, union_member)
values ('60000000-0000-4000-8000-000000000142', '10000000-0000-4000-8000-000000000001', '8012345678', true)
on conflict (employee_id) do update set tax_code = excluded.tax_code, union_member = excluded.union_member;
select throws_ok($$ update public.employee_tax_profiles set tax_code = '12AB' where employee_id = '60000000-0000-4000-8000-000000000142' $$, '23514', null, 'MST 10 hoặc 13 số');
insert into public.employee_dependents (id, tenant_id, employee_id, full_name, relation, from_month)
values ('a1810000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'Nguyễn Minh Khang', 'Con', '2025-01');
select throws_ok($$ update public.employee_dependents set to_month = '2024-12' where id = 'a1810000-0000-4000-8000-000000000001' $$, '23514', null, 'Tháng kết thúc không trước tháng bắt đầu');

insert into public.payroll_input_sheets (id, tenant_id, month, period_start, period_end, rows, employee_count)
values ('a1820000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2025-01', '2024-12-26', '2025-01-25', '[]', 0);
select throws_ok($$ update public.payroll_input_sheets set note = 'x' where id = 'a1820000-0000-4000-8000-000000000001' $$, 'P0001', 'PAYROLL_INPUT_IMMUTABLE', 'Bảng đã chốt không sửa');
select throws_ok($$ delete from public.payroll_input_sheets where id = 'a1820000-0000-4000-8000-000000000001' $$, 'P0001', 'PAYROLL_INPUT_IMMUTABLE', 'Bảng đã chốt không xóa');

-- ---------- RLS ----------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1800000-0000-4000-8000-000000000142","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_dependents where id = 'a1810000-0000-4000-8000-000000000001') + (select count(*)::int from public.employee_tax_profiles)
  + (select count(*)::int from public.employee_dependents where employee_id <> '60000000-0000-4000-8000-000000000142'), 2, 'Nhân viên thấy người phụ thuộc + MST của mình, không thấy của người khác');
select set_config('request.jwt.claims','{"sub":"a1800000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_dependents where employee_id = '60000000-0000-4000-8000-000000000142')
  + (select count(*)::int from public.employee_compensations where employee_id = '60000000-0000-4000-8000-000000000142'), 0, 'Quản lý trực tiếp không thấy lương/người phụ thuộc');
select set_config('request.jwt.claims','{"sub":"a1800000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select ok((select count(*)::int from public.employee_compensations where employee_id = '60000000-0000-4000-8000-000000000142') >= 1, 'HCNS thấy lương của nhân viên');
select is((select count(*)::int from public.employee_dependents where id = 'a1810000-0000-4000-8000-000000000001'), 1, 'HCNS thấy người phụ thuộc');
select throws_ok($$ select count(*) from public.payroll_input_sheets $$, '42501', null, 'Client không đọc trực tiếp bảng đầu vào đã chốt');
reset role;

select * from finish();
rollback;
