-- Token Supabase trong trình duyệt (cấp cho Realtime web HR) chỉ đọc 7 bảng Realtime và chỉ khi đã qua MFA (aal2).
-- Phiên aal1 (mới qua mật khẩu) không đọc được gì; mọi bảng khác (lương, CCCD, nhật ký…) chỉ đọc qua API (service role).
-- Các file test khác tự cấp lại SELECT trong giao dịch để kiểm policy; file này kiểm quyền thật của production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is(
  (select array_agg(table_name::name order by table_name::name)::text[] from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'),
  array['approval_tasks', 'attendance_events', 'employee_devices', 'employees', 'notifications', 'requests', 'support_access_sessions'],
  'authenticated chỉ có SELECT trên đúng 7 bảng Realtime');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'), 0,
  'anon không có quyền trên bảng nào');
select is((select count(*)::int from pg_policies where schemaname = 'public' and policyname like '%\_mfa' and permissive = 'RESTRICTIVE'
  and qual like '%aal2%'), 7, 'Mỗi bảng Realtime có policy hạn chế đòi aal2');

-- Thảo (seed: tenant_admin + hr_ops toàn công ty)
insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000007', 'thao.mai.token@example.test');
update public.employees set user_id = 'a1000000-0000-4000-8000-000000000007' where id = '60000000-0000-4000-8000-000000000007';
update public.memberships set user_id = 'a1000000-0000-4000-8000-000000000007', status = 'active' where id = '80000000-0000-4000-8000-000000000007';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.employees), 0, 'aal1: HR không đọc được nhân viên nào');
select is((select count(*)::int from public.requests), 0, 'aal1: HR không đọc được đơn nào');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is((select count(*)::int from public.employees), 0, 'Thiếu claim aal: không đọc được');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal2"}', true);
select ok((select count(*) from public.employees) > 1, 'aal2: HR đọc nhân viên trong phạm vi (cho Realtime)');
select throws_ok($$ select count(*) from public.employee_profiles $$, '42501', null, 'aal2 cũng không đọc thẳng CCCD/BHXH');
select throws_ok($$ select count(*) from public.payroll_results $$, '42501', null, 'aal2 cũng không đọc thẳng kết quả lương');
select throws_ok($$ select count(*) from public.request_versions $$, '42501', null, 'aal2 cũng không đọc thẳng nội dung đơn');
select throws_ok($$ select count(*) from public.audit_logs $$, '42501', null, 'aal2 cũng không đọc thẳng nhật ký');

select * from finish();
rollback;
