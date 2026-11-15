-- Cho nghỉ việc (offboard_employee, apply_due_terminations): ngày cuối đã qua thì khóa ngay, chưa tới thì "Sắp nghỉ" rồi quét;
-- hủy đơn tạm ứng chờ duyệt + đơn nghỉ bắt đầu sau ngày cuối; mất quyền RLS; chặn quản trị viên cuối, kỳ công đã khóa. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select set_config('test.today', public.tenant_today('10000000-0000-4000-8000-000000000001')::text, true);
-- Linh (HDG0005) và Anh (HDG0004) có tài khoản đang hoạt động
insert into auth.users (id, email) values ('a8100000-0000-4000-8000-000000000005', 'linh.off@example.test'), ('a8100000-0000-4000-8000-000000000004', 'anh.off@example.test');
update public.employees set user_id = 'a8100000-0000-4000-8000-000000000005' where id = '60000000-0000-4000-8000-000000000005';
update public.employees set user_id = 'a8100000-0000-4000-8000-000000000004' where id = '60000000-0000-4000-8000-000000000004';
insert into public.memberships (tenant_id, user_id, employee_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'active'),
  ('10000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', 'active');

-- Đơn của Linh: tạm ứng chờ duyệt, nghỉ phép năm 2025 (trong thời gian còn làm), nghỉ phép 5 ngày tới (sau ngày cuối)
select set_config('test.wva', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'salary_advance' order by v.version_no limit 1), true);
select set_config('test.wvl', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), true);
select set_config('test.al', (select id::text from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'AL'), true);
select set_config('test.adv', (public.create_advance_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wva')::uuid,
  '2025-02-26', '{"amount":1000000,"month":"2025-03","reason":"Việc riêng"}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24},{"stepNo":2,"resolver":"hr","status":"skipped"},{"stepNo":3,"resolver":"payroll","status":"waiting","slaHours":24}]',
  1000000, '2025-03-01')->>'id'), true);
select set_config('test.lpast', (public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wvl')::uuid,
  '2025-02-26', current_setting('test.al')::uuid, '{"leaveType":"AL","days":1}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '[{"date":"2025-03-12","half":"full","portion":1}]', null, 1)->>'id'), true);
select set_config('test.lnext', (public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wvl')::uuid,
  current_setting('test.today')::date, current_setting('test.al')::uuid, '{"leaveType":"AL","days":1}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  jsonb_build_array(jsonb_build_object('date', current_setting('test.today')::date + 5, 'half', 'full', 'portion', 1)), null, 1)->>'id'), true);

-- ---------- Kiểm đầu vào ----------
select throws_ok($$ select public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', '2020-01-01', 'resigned', false, null) $$,
  'P0001', 'OFFBOARD_BEFORE_HIRE', 'Ngày cuối trước ngày vào làm');
select throws_ok($$ select public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', current_date, 'fired', false, null) $$,
  'P0001', 'OFFBOARD_REASON_INVALID', 'Lý do ngoài danh sách');
select throws_ok($$ select public.offboard_employee('10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000005', current_date, 'resigned', false, null) $$,
  'P0001', 'EMPLOYEE_NOT_FOUND', 'Không cho nghỉ việc nhân viên công ty khác');
insert into public.timesheet_locks (tenant_id, period_start, period_end, snapshot) values ('10000000-0000-4000-8000-000000000001', '2025-02-26', '2025-03-25', '{}');
select throws_ok($$ select public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', '2025-03-01', 'resigned', false, null) $$,
  'P0001', 'PERIOD_LOCKED', 'Ngày sau ngày cuối thuộc kỳ công đã khóa');

-- ---------- Ngày cuối đã qua: nghỉ ngay ----------
select is(public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', current_setting('test.today')::date - 1, 'resigned', true, '  Đã nhận quyết định  ')->>'status',
  'terminated', 'Ngày cuối là hôm qua → đã nghỉ việc');
select is((select concat_ws('|', status, termination_date = current_setting('test.today')::date - 1, termination_reason, termination_handover, termination_note)
  from public.employees where id = '60000000-0000-4000-8000-000000000005'), 'terminated|t|resigned|t|Đã nhận quyết định', 'Ghi ngày cuối, lý do, bàn giao, ghi chú');
select is((select status from public.memberships where user_id = 'a8100000-0000-4000-8000-000000000005'), 'suspended', 'Tài khoản bị khóa ngay');
select is((select status from public.requests where id = current_setting('test.adv')::uuid), 'cancelled', 'Đơn tạm ứng chờ duyệt bị hủy');
select is((select count(*)::int from public.approval_tasks where request_id = current_setting('test.adv')::uuid and status in ('pending', 'waiting')), 0, 'Bước duyệt của đơn tạm ứng bị hủy');
select is((select status from public.requests where id = current_setting('test.lnext')::uuid), 'cancelled', 'Đơn nghỉ sau ngày cuối bị hủy');
select is((select status from public.requests where id = current_setting('test.lpast')::uuid), 'pending', 'Đơn nghỉ trong thời gian còn làm vẫn chờ duyệt');
select throws_ok($$ select public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', current_date, 'resigned', false, null) $$,
  'P0001', 'EMPLOYEE_ALREADY_TERMINATED', 'Đã nghỉ thì không cho nghỉ lần nữa');

create function pg_temp.as_user(u text, q text) returns int language plpgsql as $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute q into n;
  reset role;
  return n;
end; $$;
select is(pg_temp.as_user('a8100000-0000-4000-8000-000000000005', $$select count(*)::int from public.employees$$), 0, 'Người đã nghỉ không đọc được hồ sơ (RLS)');

-- ---------- Ngày cuối chưa tới: Sắp nghỉ, quét khi qua ngày ----------
select is(public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', current_setting('test.today')::date + 10, 'contract_ended', false, null)->>'status',
  'leaving', 'Ngày cuối còn tới → Sắp nghỉ');
select is((select status from public.memberships where user_id = 'a8100000-0000-4000-8000-000000000004'), 'active', 'Sắp nghỉ vẫn dùng app tới ngày cuối');
update public.employees set termination_date = current_setting('test.today')::date - 1 where id = '60000000-0000-4000-8000-000000000004';
select ok(public.apply_due_terminations() >= 1, 'Quét chuyển người đã qua ngày cuối');
select is((select e.status || '|' || m.status || '|' || (select count(*) from public.audit_logs a where a.resource_id = e.id and a.action = 'employee.terminated' and a.actor_type = 'system')
  from public.employees e join public.memberships m on m.employee_id = e.id where e.id = '60000000-0000-4000-8000-000000000004'), 'terminated|suspended|1', 'Sau quét: đã nghỉ, tài khoản khóa, có audit hệ thống');

-- ---------- Quản trị viên cuối cùng ----------
select set_config('test.t', (public.create_tenant_with_admin('OFF-T', 'Công ty Nghỉ Việc', null, 'starter', 100, 'Lê Chủ', 'chu@off.test', null) ->> 'tenant_id'), true);
insert into auth.users (id, email) values ('a8100000-0000-4000-8000-0000000000a1', 'chu@off.test');
update public.employees set user_id = 'a8100000-0000-4000-8000-0000000000a1', hire_date = '2025-01-01' where tenant_id = current_setting('test.t')::uuid;
update public.memberships set user_id = 'a8100000-0000-4000-8000-0000000000a1', status = 'active' where tenant_id = current_setting('test.t')::uuid;
select throws_ok(format($$ select public.offboard_employee(%L, (select id from public.employees where tenant_id = %L), %L::date + 30, 'resigned', false, null) $$,
  current_setting('test.t'), current_setting('test.t'), current_setting('test.today')), 'P0001', 'LAST_TENANT_ADMIN', 'Không cho nghỉ quản trị viên cuối cùng, kể cả ngày cuối còn tới');

select * from finish();
rollback;
