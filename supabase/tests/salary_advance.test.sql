-- Tạm ứng lương: vai trò Kế toán, lương cơ bản bất biến + chỉ người có quyền xem, đơn tạm ứng mỗi tháng một lần, bước Kế toán
-- nhận thông báo, đã chi chỉ khi đơn đã duyệt (một lần) và báo nhân viên. Không giả định DB trống (dùng năm 2025 + id riêng).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select is((select string_agg(p.code, ',' order by p.code) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code = 'payroll' and r.tenant_id is null and p.code like any (array['salary_advance%','compensation%'])), 'compensation.manage,compensation.read,salary_advance.process', 'Vai trò Kế toán có quyền tạm ứng + lương');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code in ('hr_ops','tenant_admin','manager') and r.tenant_id is null and p.code like 'compensation%'), 0, 'HR/Tenant Admin/Quản lý mặc định không xem lương');

insert into public.employee_compensations (id, tenant_id, employee_id, base_salary, effective_from)
values ('a9100000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 18000000, '2025-01-01');
select throws_ok($$ update public.employee_compensations set base_salary = 1 where id = 'a9100000-0000-4000-8000-000000000005' $$, 'P0001', 'COMPENSATION_IMMUTABLE', 'Lương đã nhập không sửa (đổi = bản mới)');

-- Kế toán HD0215 có tài khoản để nhận bước duyệt
insert into auth.users (id, email) values ('a9200000-0000-4000-8000-000000000215', 'nhung.adv@example.test');
update public.memberships set user_id = coalesce(user_id, 'a9200000-0000-4000-8000-000000000215'), status = 'active' where id = '80000000-0000-4000-8000-000000000215';

select set_config('test.wv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'salary_advance' order by v.version_no limit 1), true);
select is((select string_agg(s->>'resolver', '→' order by n) from public.workflow_versions w, jsonb_array_elements(w.steps) with ordinality e(s, n) where w.id = current_setting('test.wv')::uuid),
  'direct_manager→hr→payroll', 'Luồng mẫu Quản lý → HR → Kế toán');

select set_config('test.r1', (public.create_advance_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', '{"amount":2000000,"month":"2025-03","reason":"Chi phí y tế"}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24},{"stepNo":2,"resolver":"hr","status":"skipped"},{"stepNo":3,"resolver":"payroll","status":"waiting","slaHours":24}]',
  2000000, '2025-03-01')->>'id'), true);
select matches((select request_no from public.requests where id = current_setting('test.r1')::uuid), '^TU-\d{4}$', 'Số đơn TU-xxxx');
select is((select body from public.notifications where link_id = current_setting('test.r1')::uuid and kind = 'approval.pending'),
  'Võ Thảo Linh · Tạm ứng lương 2.000.000 ₫ · trừ lương 03/2025', 'Báo quản lý kèm số tiền, tháng khấu trừ');
select throws_ok($$ select public.create_advance_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', '{"amount":1000000,"month":"2025-03"}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]', 1000000, '2025-03-01') $$,
  'P0001', 'ADVANCE_MONTH_USED', 'Mỗi tháng một đơn tạm ứng');
select throws_ok($$ update public.salary_advances set paid_at = now(), paid_by = 'a9200000-0000-4000-8000-000000000215' where request_id = current_setting('test.r1')::uuid $$,
  'P0001', 'ADVANCE_NOT_APPROVED', 'Chưa duyệt thì chưa chi');

select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r1')::uuid and step_no = 1), null, true), 'next', 'Quản lý duyệt → sang Kế toán (HR bỏ qua)');
select ok(exists (select 1 from public.notifications where link_id = current_setting('test.r1')::uuid and kind = 'approval.pending' and recipient_employee_id = '60000000-0000-4000-8000-000000000215'),
  'Bước Kế toán báo người có quyền xử lý tạm ứng');
select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r1')::uuid and step_no = 3), null, true), 'approved', 'Kế toán duyệt → hoàn tất');
update public.salary_advances set paid_at = now(), paid_by = 'a9200000-0000-4000-8000-000000000215', payout_note = 'CK 25/10' where request_id = current_setting('test.r1')::uuid;
select is((select title || ' | ' || body from public.notifications where link_id = current_setting('test.r1')::uuid and kind = 'advance.paid'),
  'Tạm ứng ' || (select request_no from public.requests where id = current_setting('test.r1')::uuid) || ' đã chi | 2.000.000 ₫ · trừ vào lương 03/2025 · CK 25/10', 'Đã chi → báo nhân viên');
select throws_ok($$ update public.salary_advances set paid_at = now() where request_id = current_setting('test.r1')::uuid $$, 'P0001', 'ADVANCE_IMMUTABLE', 'Chỉ ghi nhận đã chi một lần');

select * from finish();
rollback;
