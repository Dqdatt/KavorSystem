-- Tham số luật lương: có 2 phiên bản 2026 (đã sửa 10/11: đoàn phí, ngưỡng 10%, miễn thuế ăn giữa ca), người dùng đọc được, phiên bản đã hiệu lực bất biến, phiên bản tương lai sửa được.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
select ok((select count(*) from public.payroll_law_versions where effective_from in ('2026-01-01','2026-07-01')) = 2, 'Có phiên bản 01/01 và 01/07/2026');
select throws_ok($$ update public.payroll_law_versions set note = 'x' where effective_from = '2026-01-01' $$, 'P0001', 'PAYROLL_LAW_IMMUTABLE', 'Phiên bản đã hiệu lực không sửa được');
insert into public.payroll_law_versions (effective_from, params) values (current_date + 30, '{}');
select lives_ok($$ update public.payroll_law_versions set note = 'sửa' where effective_from = current_date + 30 $$, 'Phiên bản tương lai sửa được');
select is((select (params->'union'->>'employee')::numeric from public.payroll_law_versions where effective_from = '2026-01-01'), 0.005, 'Đoàn phí 0,5% (QĐ 61/QĐ-TLĐ)');
select is((select array[(params->'casual'->>'threshold')::bigint, (params->'taxFree'->>'meal')::bigint] from public.payroll_law_versions where effective_from = '2026-07-01'),
  array[5000000, 1200000]::bigint[], 'Từ 01/07/2026: khấu trừ 10% từ 5 triệu, miễn thuế ăn giữa ca 1,2 triệu (NĐ 253/2026)');
select is((select array[(params->'casual'->>'threshold')::bigint, (params->'taxFree'->>'meal')::bigint] from public.payroll_law_versions where effective_from = '2026-01-01'),
  array[2000000, 730000]::bigint[], 'Trước 01/07/2026: 2 triệu, 730.000');
select ok((select pg_get_constraintdef(oid) like '%meal%' from pg_constraint where conname = 'pay_items_tax_mode_check'), 'Khoản phụ cấp nhận cách tính thuế ăn giữa ca');
set local role authenticated;
select ok((select count(*) from public.payroll_law_versions) >= 2, 'Người dùng đăng nhập đọc được');
reset role;
select * from finish();
rollback;
