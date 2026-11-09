-- Tham số luật lương: có 2 phiên bản 2026, người dùng đọc được, phiên bản đã hiệu lực bất biến, phiên bản tương lai sửa được.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
select ok((select count(*) from public.payroll_law_versions where effective_from in ('2026-01-01','2026-07-01')) = 2, 'Có phiên bản 01/01 và 01/07/2026');
select throws_ok($$ update public.payroll_law_versions set note = 'x' where effective_from = '2026-01-01' $$, 'P0001', 'PAYROLL_LAW_IMMUTABLE', 'Phiên bản đã hiệu lực không sửa được');
insert into public.payroll_law_versions (effective_from, params) values (current_date + 30, '{}');
select lives_ok($$ update public.payroll_law_versions set note = 'sửa' where effective_from = current_date + 30 $$, 'Phiên bản tương lai sửa được');
set local role authenticated;
select ok((select count(*) from public.payroll_law_versions) >= 2, 'Người dùng đăng nhập đọc được');
reset role;
select * from finish();
rollback;
