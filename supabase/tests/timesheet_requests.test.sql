-- Đơn từ + luồng duyệt + khóa kỳ công: số đơn tăng dần, chuyển bước nguyên tử, duyệt xong tạo điều chỉnh,
-- kỳ đã khóa thì không duyệt/điều chỉnh, một giải trình mỗi ngày, RLS theo người gửi/người duyệt/phạm vi. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select set_config('test.wv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'explanation' order by v.version_no limit 1), true);
select ok(current_setting('test.wv') <> '', 'Tenant mẫu có sẵn luồng duyệt giải trình');
select is((select jsonb_array_length(steps) from public.workflow_versions where id = current_setting('test.wv')::uuid), 2, 'Mặc định: Quản lý → HR');

-- ---------- Số đơn ----------
insert into public.tenants (id, code, display_name) values ('10000000-0000-4000-8000-0000000000c9', 'TEST-REQ', 'Thử đơn');
select is(public.next_request_no('10000000-0000-4000-8000-0000000000c9', 'GT'), 'GT-0001', 'Số đơn đầu tiên');
select is(public.next_request_no('10000000-0000-4000-8000-0000000000c9', 'GT'), 'GT-0002', 'Số đơn tăng dần theo tenant');

-- ---------- Đơn giải trình Hà → Huy (quản lý) → HR ----------
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date, period_start)
values ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'TEST-GT-1', 'explanation', '60000000-0000-4000-8000-000000000142',
  current_setting('test.wv')::uuid, date '2025-03-04', date '2025-02-26');
insert into public.request_versions (tenant_id, request_id, version_no, payload)
values ('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 1, '{"kind":"missing_out","clockOut":"17:00","reason":"Quên chấm ra sau họp"}');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status) values
  ('f1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending'),
  ('f1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 2, 'hr', null, 'waiting');

select throws_ok($$ insert into public.requests (tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
  values ('10000000-0000-4000-8000-000000000001', 'TEST-GT-DUP', 'explanation', '60000000-0000-4000-8000-000000000142', current_setting('test.wv')::uuid, date '2025-03-04') $$,
  '23505', null, 'Một ngày công chỉ một giải trình đang chờ/đã duyệt');
select throws_ok($$ update public.request_versions set payload = '{}' where request_id = 'f0000000-0000-4000-8000-000000000001' $$, 'P0001', null, 'Nội dung đơn đã gửi không sửa được');
select throws_ok($$ select public.decide_approval('f1000000-0000-4000-8000-000000000002', null, true) $$, 'P0001', 'TASK_NOT_PENDING', 'Không duyệt nhảy bước');
select is(public.decide_approval('f1000000-0000-4000-8000-000000000001', null, true, 'Đúng, có họp'), 'next', 'Quản lý duyệt → sang bước HR');
select is((select status || ' · ' || (due_at is not null)::text from public.approval_tasks where id = 'f1000000-0000-4000-8000-000000000002'), 'pending · true', 'Bước HR đang chờ, có hạn SLA');
select throws_ok($$ select public.decide_approval('f1000000-0000-4000-8000-000000000001', null, true) $$, 'P0001', 'TASK_NOT_PENDING', 'Bước đã duyệt không duyệt lại');
select is(public.decide_approval('f1000000-0000-4000-8000-000000000002', null, true), 'approved', 'HR duyệt → đơn hoàn tất');
select is((select clock_out::text || ' · ' || (clock_in is null)::text from public.attendance_adjustments where request_id = 'f0000000-0000-4000-8000-000000000001'),
  '17:00:00 · true', 'Tạo điều chỉnh giờ ra, giữ giờ vào từ chấm công');
select throws_ok($$ delete from public.attendance_adjustments where request_id = 'f0000000-0000-4000-8000-000000000001' $$, 'P0001', null, 'Điều chỉnh không xóa được');

-- ---------- Từ chối ----------
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
values ('f0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'TEST-GT-2', 'explanation', '60000000-0000-4000-8000-000000000142', current_setting('test.wv')::uuid, date '2025-03-05');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status) values
  ('f1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending'),
  ('f1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 2, 'hr', null, 'waiting');
select is(public.decide_approval('f1000000-0000-4000-8000-000000000003', null, false, 'Không có minh chứng'), 'rejected', 'Quản lý từ chối → đơn kết thúc');
select is((select status from public.approval_tasks where id = 'f1000000-0000-4000-8000-000000000004'), 'cancelled', 'Bước sau bị hủy');

-- ---------- Khóa kỳ ----------
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
values ('f0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'TEST-GT-3', 'explanation', '60000000-0000-4000-8000-000000000142', current_setting('test.wv')::uuid, date '2025-03-06');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status) values
  ('f1000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending');
insert into public.timesheet_locks (id, tenant_id, period_start, period_end, snapshot) values ('f2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2025-02-26', '2025-03-25', '{}');
select throws_ok($$ select public.decide_approval('f1000000-0000-4000-8000-000000000005', null, true) $$, 'P0001', 'PERIOD_LOCKED', 'Kỳ đã khóa thì không duyệt được');
select throws_ok($$ insert into public.attendance_adjustments (tenant_id, employee_id, work_date, clock_in, reason) values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', '2025-03-10', '08:00', 'x') $$,
  'P0001', 'PERIOD_LOCKED', 'Kỳ đã khóa thì không thêm điều chỉnh');
select throws_ok($$ insert into public.timesheet_locks (tenant_id, period_start, period_end, snapshot) values ('10000000-0000-4000-8000-000000000001', '2025-02-26', '2025-03-25', '{}') $$,
  '23505', null, 'Một kỳ chỉ một khóa đang hiệu lực');
select throws_ok($$ update public.timesheet_locks set unlocked_at = now(), unlocked_by = null where id = 'f2000000-0000-4000-8000-000000000001' $$, '23514', null, 'Mở khóa phải có người và lý do');
select throws_ok($$ update public.timesheet_locks set snapshot = '{"x":1}' where id = 'f2000000-0000-4000-8000-000000000001' $$, 'P0001', null, 'Ảnh chụp bảng công lúc khóa không sửa được');

-- ---------- Ca: ngày làm việc ----------
select throws_ok($$ insert into public.shift_versions (tenant_id, shift_id, version_no, start_time, end_time, effective_from, work_days)
  select tenant_id, shift_id, 99, '08:00', '17:00', '2030-01-01', '{8}' from public.shift_versions limit 1 $$, '23514', null, 'Ngày làm việc phải là 1–7');

-- ---------- RLS ----------
insert into auth.users (id, email) values
  ('a3000000-0000-4000-8000-000000000142', 'ha.req@example.test'),
  ('a3000000-0000-4000-8000-000000000003', 'huy.req@example.test'),
  ('a3000000-0000-4000-8000-000000000001', 'an.req@example.test');
update public.employees set user_id = 'a3000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
update public.employees set user_id = 'a3000000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
update public.employees set user_id = 'a3000000-0000-4000-8000-000000000001' where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select count(*)::int from public.requests where request_no like 'TEST-GT-%'), 3, 'Người gửi thấy đơn của mình');
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.approval_tasks where request_id = 'f0000000-0000-4000-8000-000000000001'), 2, 'Quản lý được giao thấy các bước của đơn');
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.requests where request_no like 'TEST-GT-%'), 0, 'Nhân viên khác không thấy đơn');

select * from finish();
rollback;
