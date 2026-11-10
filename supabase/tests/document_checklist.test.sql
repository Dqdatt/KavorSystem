-- Danh mục giấy tờ + trạng thái nộp: tên không trùng (trừ mục đã ngừng), ràng buộc trạng thái (nộp cần hình thức + ngày; không áp dụng cần lý do),
-- loại lao động hợp lệ, RLS (nhân viên thấy của mình, quản lý không có document.read không thấy, không thấy danh mục công ty khác).
-- Dùng seed: Hà HD0142 (nhân viên), Huy HDG0003 (quản lý của Hà), tenant Hải Đăng 1000…0001, tenant Mẫu B 1000…0002. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.document_checklist_items (id, tenant_id, name, required, employment_types, purpose) values
  ('a2010000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'CL CCCD', true, null, 'Xác minh nhân thân, khai BHXH'),
  ('a2010000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'CL Bằng cấp', false, array['official'], null),
  ('a2010000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'CL mục công ty B', true, null, null);

select throws_ok($$ insert into public.document_checklist_items (tenant_id, name) values ('10000000-0000-4000-8000-000000000001', ' cl cccd') $$,
  '23505', null, 'Tên mục không trùng trong công ty (không phân biệt hoa thường)');
select throws_ok($$ insert into public.document_checklist_items (tenant_id, name, employment_types) values ('10000000-0000-4000-8000-000000000001', 'CL x', array['ceo']) $$,
  '23514', null, 'Loại lao động phải hợp lệ');
update public.document_checklist_items set archived_at = now() where id = 'a2010000-0000-4000-8000-000000000002';
select lives_ok($$ insert into public.document_checklist_items (tenant_id, name) values ('10000000-0000-4000-8000-000000000001', 'CL Bằng cấp') $$,
  'Mục đã ngừng thì tạo lại được tên đó');

select lives_ok($$ insert into public.employee_checklist_status (tenant_id, employee_id, item_id, status, form, submitted_on)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'a2010000-0000-4000-8000-000000000001', 'submitted', 'copy', '2026-11-01') $$,
  'Tích đã nộp bản sao');
select throws_ok($$ insert into public.employee_checklist_status (tenant_id, employee_id, item_id, status)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'a2010000-0000-4000-8000-000000000001', 'submitted') $$,
  '23514', null, 'Đã nộp phải có hình thức và ngày nộp');
select throws_ok($$ insert into public.employee_checklist_status (tenant_id, employee_id, item_id, status, note)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'a2010000-0000-4000-8000-000000000001', 'waived', ' ') $$,
  '23514', null, 'Không áp dụng phải có lý do');
select throws_ok($$ insert into public.employee_checklist_status (tenant_id, employee_id, item_id, status, form, submitted_on)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'a2010000-0000-4000-8000-000000000001', 'submitted', 'original_kept', '2026-11-01') $$,
  '23514', null, 'Không có trạng thái giữ bản chính (BLLĐ Điều 17)');

-- RLS
insert into auth.users (id, email) values
  ('a2010000-0000-4000-8000-000000000142', 'ha.checklist@example.test'),
  ('a2010000-0000-4000-8000-000000000003', 'huy.checklist@example.test');
update public.employees set user_id = 'a2010000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
update public.employees set user_id = 'a2010000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
insert into public.memberships (tenant_id, user_id, employee_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a2010000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000142', 'active'),
  ('10000000-0000-4000-8000-000000000001', 'a2010000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'active')
on conflict (tenant_id, employee_id) do update set user_id = excluded.user_id, status = 'active';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2010000-0000-4000-8000-000000000142","role":"authenticated","app_metadata":{"active_tenant_id":"10000000-0000-4000-8000-000000000001"}}', true);
select is((select count(*)::int from public.employee_checklist_status where employee_id = '60000000-0000-4000-8000-000000000142' and item_id = 'a2010000-0000-4000-8000-000000000001'), 1, 'Nhân viên thấy giấy tờ đã nộp của mình');
select is((select count(*)::int from public.document_checklist_items where id = 'a2010000-0000-4000-8000-000000000001'), 1, 'Nhân viên thấy danh mục công ty mình');
select is((select count(*)::int from public.document_checklist_items where id = 'a2010000-0000-4000-8000-000000000003'), 0, 'Không thấy danh mục công ty khác');
select set_config('request.jwt.claims', '{"sub":"a2010000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"active_tenant_id":"10000000-0000-4000-8000-000000000001"}}', true);
select is((select count(*)::int from public.employee_checklist_status where employee_id = '60000000-0000-4000-8000-000000000142' and item_id = 'a2010000-0000-4000-8000-000000000001'), 0, 'Quản lý (không có quyền tài liệu) không thấy giấy tờ của nhân viên');
reset role;

select * from finish();
rollback;
