-- Nghỉ phép: bộ mẫu (loại nghỉ, quy định, luồng duyệt), sổ phép dạng ledger bất biến, đơn nghỉ giữ chỗ → duyệt trừ phép /
-- từ chối/hủy trả lại, chặn trùng ngày, kỳ đã khóa, thông báo, RLS. Không giả định DB trống (dùng năm 2025 + id riêng).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------- Bộ mẫu ----------
select is((select string_agg(code, ',' order by sort) from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001'),
  'AL,UL,SL,WED,BRV', 'Tenant có đủ loại nghỉ mẫu');
select is((select deducts_balance from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'AL'), true, 'Chỉ phép năm trừ sổ phép');
select is((select (v.config->>'annualDays')::int from public.policy_versions v join public.policy_definitions d on d.id = v.policy_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.kind = 'leave' order by v.version_no limit 1), 12, 'Quy định phép năm mẫu 12 ngày');
select is((select v.steps->1->>'daysOver' from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), '2', 'Bước HR chỉ khi nghỉ trên 2 ngày');

select set_config('test.wv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), true);
select set_config('test.al', (select id::text from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'AL'), true);

-- ---------- Sổ phép ----------
insert into public.leave_accounts (id, tenant_id, employee_id, leave_type_id, year)
values ('a6000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', current_setting('test.al')::uuid, 2025);
insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, source_key)
values ('10000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000005', 'grant', 12, '2025-01-01', 'grant:2025');
select throws_ok($$ insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, source_key)
  values ('10000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000005', 'grant', 12, '2025-01-01', 'grant:2025') $$, '23505', null, 'Cùng khóa nguồn không ghi trùng');
select throws_ok($$ insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, source_key)
  values ('10000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000005', 'adjust', 1, '2025-02-01', 'adjust:x') $$, '23514', null, 'Điều chỉnh tay phải có lý do');
select throws_ok($$ insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, source_key)
  values ('10000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000005', 'carry', 3, '2025-01-01', 'carry:2025') $$, '23514', null, 'Phép tồn phải có hạn dùng');
select throws_ok($$ update public.leave_transactions set amount = 20 where source_key = 'grant:2025' and account_id = 'a6000000-0000-4000-8000-000000000005' $$,
  'P0001', 'LEAVE_LEDGER_IMMUTABLE', 'Sổ phép không sửa được');

-- ---------- Đơn nghỉ 2 ngày: giữ chỗ → duyệt ----------
select set_config('test.r1', (public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', current_setting('test.al')::uuid, '{"leaveType":"AL","leaveTypeName":"Phép năm","from":"2025-03-10","to":"2025-03-11","half":"full","days":2,"reason":"Việc gia đình"}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24},{"stepNo":2,"resolver":"hr","status":"skipped"}]',
  '[{"date":"2025-03-10","half":"full","portion":1},{"date":"2025-03-11","half":"full","portion":1}]', 'a6000000-0000-4000-8000-000000000005', 2)->>'id'), true);
select is((select sum(amount)::numeric from public.leave_transactions where account_id = 'a6000000-0000-4000-8000-000000000005'), 10.00, 'Gửi đơn giữ chỗ 2 ngày');
select matches((select request_no from public.requests where id = current_setting('test.r1')::uuid), '^NP-\d{4}$', 'Số đơn nghỉ NP-xxxx');
select is((select body from public.notifications where link_id = current_setting('test.r1')::uuid and kind = 'approval.pending'),
  'Võ Thảo Linh · Phép năm · 10/03–11/03 · 2 ngày', 'Báo quản lý kèm loại nghỉ, ngày, số ngày');
select throws_ok($$ select public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', current_setting('test.al')::uuid, '{"from":"2025-03-11","to":"2025-03-11","half":"am","days":0.5}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '[{"date":"2025-03-11","half":"am","portion":0.5}]', null, 0.5) $$, 'P0001', 'LEAVE_OVERLAP', 'Không nghỉ trùng buổi đã xin');
select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r1')::uuid and step_no = 1), null, true), 'approved', 'Quản lý duyệt (≤ 2 ngày không cần HR)');
select is((select string_agg(kind || ':' || amount::text, ',' order by kind) from public.leave_transactions where request_id = current_setting('test.r1')::uuid),
  'consume:-2.00,hold:-2.00,release:2.00', 'Duyệt → trả giữ chỗ + trừ phép');
select is((select sum(amount)::numeric from public.leave_transactions where account_id = 'a6000000-0000-4000-8000-000000000005'), 10.00, 'Số dư = tổng sổ phép');

-- ---------- Từ chối, hủy ----------
select set_config('test.r2', (public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', current_setting('test.al')::uuid, '{"leaveType":"AL","from":"2025-03-12","to":"2025-03-12","half":"pm","days":0.5,"reason":"Khám bệnh"}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '[{"date":"2025-03-12","half":"pm","portion":0.5}]', 'a6000000-0000-4000-8000-000000000005', 0.5)->>'id'), true);
select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r2')::uuid), null, false, 'Trùng lịch họp quý'), 'rejected', 'Quản lý từ chối');
select is((select sum(amount)::numeric from public.leave_transactions where account_id = 'a6000000-0000-4000-8000-000000000005'), 10.00, 'Từ chối → trả lại giữ chỗ');
select lives_ok($$ select public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', current_setting('test.al')::uuid, '{"from":"2025-03-12","to":"2025-03-12","half":"pm","days":0.5}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '[{"date":"2025-03-12","half":"pm","portion":0.5}]', null, 0.5) $$, 'Đơn bị từ chối không chặn xin lại buổi đó');

-- ---------- Kỳ đã khóa ----------
insert into public.timesheet_locks (tenant_id, period_start, period_end, snapshot) values ('10000000-0000-4000-8000-000000000001', '2025-04-26', '2025-05-25', '{}');
select throws_ok($$ select public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-04-26', current_setting('test.al')::uuid, '{"from":"2025-05-05","to":"2025-05-05","half":"full","days":1}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '[{"date":"2025-05-05","half":"full","portion":1}]', null, 1) $$, 'P0001', 'PERIOD_LOCKED', 'Không xin nghỉ vào kỳ công đã khóa');

-- ---------- RLS ----------
insert into auth.users (id, email) values ('a7000000-0000-4000-8000-000000000005', 'linh.leave@example.test'), ('a7000000-0000-4000-8000-000000000142', 'ha.leave@example.test');
update public.employees set user_id = 'a7000000-0000-4000-8000-000000000005' where id = '60000000-0000-4000-8000-000000000005';
update public.employees set user_id = 'a7000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.leave_transactions where account_id = 'a6000000-0000-4000-8000-000000000005') > 0, true, 'Nhân viên đọc được sổ phép của mình');
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select count(*)::int from public.leave_transactions where account_id = 'a6000000-0000-4000-8000-000000000005'), 0, 'Nhân viên khác không đọc được');
reset role;

select * from finish();
rollback;
