-- Danh mục khoản thu nhập theo doanh nghiệp + khoản trong phiên bản lương: ghi nguyên khối, tổng phụ cấp = tổng khoản, bất biến,
-- khoản phải cùng doanh nghiệp, tên không trùng (trừ khoản đã ngừng), RLS (nhân viên thấy của mình, quản lý không thấy của người khác).
-- Dùng seed: Hà HD0142 (nhân viên), Huy HDG0003 (quản lý của Hà), tenant Hải Đăng 1000…0001, tenant Mẫu B 1000…0002. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.pay_items (id, tenant_id, name, pay_mode, insurable, tax_mode, tax_free_cap, default_amount) values
  ('a1900000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'PI ăn trưa', 'by_workdays', false, 'partial', 730000, 730000),
  ('a1900000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'PI trách nhiệm', 'fixed', true, 'taxable', null, null),
  ('a1900000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'PI khoản công ty B', 'fixed', false, 'taxable', null, null);

select throws_ok($$ insert into public.pay_items (tenant_id, name) values ('10000000-0000-4000-8000-000000000001', ' pi ĂN TRƯA') $$,
  '23505', null, 'Tên khoản không trùng trong doanh nghiệp (không phân biệt hoa thường)');
select throws_ok($$ insert into public.pay_items (tenant_id, name, tax_mode, tax_free_cap) values ('10000000-0000-4000-8000-000000000001', 'PI x', 'taxable', 100000) $$,
  '23514', null, 'Mức miễn thuế chỉ dùng khi miễn một phần');
update public.pay_items set archived_at = now() where id = 'a1900000-0000-4000-8000-000000000002';
select lives_ok($$ insert into public.pay_items (id, tenant_id, name) values ('a1900000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'PI trách nhiệm') $$,
  'Khoản đã ngừng thì tạo lại được tên đó');

-- Ghi nguyên khối, allowance = tổng khoản
select ok(public.add_employee_compensation('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 5000000, null, 'official', '2024-03-01', null, null,
  '[{"itemId":"a1900000-0000-4000-8000-000000000001","amount":730000},{"itemId":"a1900000-0000-4000-8000-000000000004","amount":9270000}]'::jsonb) is not null, 'Ghi phiên bản lương kèm khoản');
select is((select allowance from public.employee_compensations where employee_id = '60000000-0000-4000-8000-000000000142' and effective_from = '2024-03-01'), 10000000::bigint,
  'Tổng phụ cấp = tổng các khoản (lương cứng 15tr)');
select is((select count(*)::int from public.employee_compensation_items i join public.employee_compensations c on c.id = i.compensation_id
  where c.employee_id = '60000000-0000-4000-8000-000000000142' and c.effective_from = '2024-03-01'), 2, 'Hai khoản được lưu');
select throws_ok($$ select public.add_employee_compensation('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 5000000, null, null, '2024-04-01', null, null,
  '[{"itemId":"a1900000-0000-4000-8000-000000000003","amount":100000}]'::jsonb) $$, 'P0001', 'PAY_ITEM_NOT_FOUND', 'Không dùng khoản của doanh nghiệp khác');
select throws_ok($$ select public.add_employee_compensation('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 5000000, null, null, '2024-04-01', null, null,
  '[{"itemId":"a1900000-0000-4000-8000-000000000002","amount":100000}]'::jsonb) $$, 'P0001', 'PAY_ITEM_NOT_FOUND', 'Không dùng khoản đã ngừng');
select is((select count(*)::int from public.employee_compensations where employee_id = '60000000-0000-4000-8000-000000000142' and effective_from = '2024-04-01'), 0,
  'Lỗi khoản thì không ghi phiên bản (nguyên khối)');
select throws_ok($$ update public.employee_compensation_items set amount = 1 where item_id = 'a1900000-0000-4000-8000-000000000001' $$, 'P0001', 'COMPENSATION_IMMUTABLE', 'Khoản trong phiên bản bất biến');

-- RLS
insert into auth.users (id, email) values
  ('a1900000-0000-4000-8000-000000000142', 'ha.items@example.test'),
  ('a1900000-0000-4000-8000-000000000003', 'huy.items@example.test');
update public.employees set user_id = 'a1900000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
update public.employees set user_id = 'a1900000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
insert into public.memberships (tenant_id, user_id, employee_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a1900000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000142', 'active'),
  ('10000000-0000-4000-8000-000000000001', 'a1900000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'active')
on conflict (tenant_id, employee_id) do update set user_id = excluded.user_id, status = 'active';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1900000-0000-4000-8000-000000000142","role":"authenticated","app_metadata":{"active_tenant_id":"10000000-0000-4000-8000-000000000001"}}', true);
select is((select count(*)::int from public.employee_compensation_items where item_id = 'a1900000-0000-4000-8000-000000000001'), 1, 'Nhân viên thấy khoản lương của mình');
select is((select count(*)::int from public.pay_items where id = 'a1900000-0000-4000-8000-000000000003'), 0, 'Không thấy danh mục doanh nghiệp khác');
select set_config('request.jwt.claims', '{"sub":"a1900000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"active_tenant_id":"10000000-0000-4000-8000-000000000001"}}', true);
select is((select count(*)::int from public.employee_compensation_items where employee_id = '60000000-0000-4000-8000-000000000142'), 0, 'Quản lý không thấy khoản lương của nhân viên');
reset role;

select * from finish();
rollback;
