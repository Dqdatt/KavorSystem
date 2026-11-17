-- Race tạo dữ liệu (202612100001): kiểm lại trong SQL sau khi khóa theo nhân viên — giải trình vượt hạn mức kỳ, đơn nghỉ khi số dư
-- đã đổi so với lúc API tính, OT vượt giới hạn, chấm công vào/ra 2 lần một ngày. Lần gọi song song thật: tools/leave-smoke.sh,
-- tools/attendance-smoke.sh. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('test.t', '10000000-0000-4000-8000-000000000001', true);
select set_config('test.e', '60000000-0000-4000-8000-000000000142', true);
create temp table wv as select d.request_type, (select v.id from public.workflow_versions v where v.workflow_id = d.id order by v.version_no desc limit 1) as id
  from public.workflow_definitions d where d.tenant_id = current_setting('test.t')::uuid;
create temp table tasks as select '[{"stepNo":1,"resolver":"hr","status":"pending","slaHours":24}]'::jsonb as j;

select lives_ok(format('select public.lock_employee_requests(%L)', current_setting('test.e')), 'Khóa tạo đơn theo nhân viên (giữ tới hết giao dịch)');

-- ---------- Giải trình: hạn mức của kỳ tính cả đơn đang tạo ----------
select ok((public.create_request(current_setting('test.t')::uuid, 'GT', 'explanation', current_setting('test.e')::uuid, null, (select id from wv where request_type = 'explanation'),
  date '2024-02-01', date '2024-01-26', '{}', '{"explanation":{"config":{"monthlyLimit":1}}}', (select j from tasks)))->>'no' is not null, 'Giải trình thứ nhất trong hạn mức 1');
select throws_ok(format('select public.create_request(%L, ''GT'', ''explanation'', %L, null, %L, date ''2024-02-02'', date ''2024-01-26'', ''{}'', ''{"explanation":{"config":{"monthlyLimit":1}}}'', %L)',
  current_setting('test.t'), current_setting('test.e'), (select id from wv where request_type = 'explanation'), (select j from tasks)), 'P0001', 'EXPLANATION_QUOTA', 'Giải trình thứ hai vượt hạn mức → chặn');
select ok((public.create_request(current_setting('test.t')::uuid, 'GT', 'explanation', current_setting('test.e')::uuid, null, (select id from wv where request_type = 'explanation'),
  date '2024-02-02', date '2024-01-26', '{}', '{"explanation":{"config":{"monthlyLimit":2}}}', (select j from tasks)))->>'no' is not null, 'Hạn mức 2 thì được');
select ok((public.create_request(current_setting('test.t')::uuid, 'GT', 'explanation', current_setting('test.e')::uuid, null, (select id from wv where request_type = 'explanation'),
  date '2024-03-01', date '2024-02-26', '{}', '{"explanation":{"config":{"monthlyLimit":1}}}', (select j from tasks)))->>'no' is not null, 'Kỳ khác tính riêng');

-- ---------- Đơn nghỉ: số dư đổi giữa lúc API đọc và lúc ghi ----------
select set_config('test.acc', 'a5000000-0000-4000-8000-000000000142', true);
select set_config('test.al', (select id::text from public.leave_types where tenant_id = current_setting('test.t')::uuid and code = 'AL'), true);
select set_config('test.avail', (select coalesce(sum(amount), 0)::text from public.leave_transactions where account_id = current_setting('test.acc')::uuid), true);
select throws_ok(format('select public.create_leave_request(%L, %L, null, %L, date ''2027-05-26'', %L, ''{}'', %L, %L, ''[{"date":"2027-06-15","half":"full","portion":1}]'', %L, 1)',
  current_setting('test.t'), current_setting('test.e'), (select id from wv where request_type = 'leave'), current_setting('test.al'),
  jsonb_build_object('balance', jsonb_build_object('available', current_setting('test.avail')::numeric + 1)), (select j from tasks), current_setting('test.acc')),
  'P0001', 'LEAVE_BALANCE_CHANGED', 'Số dư khác số API đã dùng → chặn (đơn khác vừa giữ chỗ)');
select ok((public.create_leave_request(current_setting('test.t')::uuid, current_setting('test.e')::uuid, null, (select id from wv where request_type = 'leave'), date '2027-05-26',
  current_setting('test.al')::uuid, '{}', jsonb_build_object('balance', jsonb_build_object('available', current_setting('test.avail')::numeric)), (select j from tasks),
  '[{"date":"2027-06-15","half":"full","portion":1}]', current_setting('test.acc')::uuid, 1))->>'no' is not null, 'Số dư khớp → tạo đơn, giữ chỗ');
select is((select coalesce(sum(amount), 0) from public.leave_transactions where account_id = current_setting('test.acc')::uuid), current_setting('test.avail')::numeric - 1, 'Đã giữ chỗ 1 ngày');

-- ---------- OT: giới hạn theo phút trong p_snapshot.limits ----------
select throws_ok(format('select public.create_overtime_request(%L, %L, null, %L, date ''2024-04-26'', ''{}'', ''{"limits":{"dayMinutes":60,"monthMinutes":2400,"yearMinutes":12000}}'', %L, ''{"date":"2024-05-06","start":"18:00","end":"19:30","minutes":90,"dayKind":"workday","ratePercent":150}'')',
  current_setting('test.t'), current_setting('test.e'), (select id from wv where request_type = 'overtime'), (select j from tasks)), 'P0001', 'OVERTIME_LIMIT', 'OT vượt giới hạn ngày → chặn');
select ok((public.create_overtime_request(current_setting('test.t')::uuid, current_setting('test.e')::uuid, null, (select id from wv where request_type = 'overtime'), date '2024-04-26', '{}',
  '{"limits":{"dayMinutes":120,"monthMinutes":2400,"yearMinutes":12000}}', (select j from tasks), '{"date":"2024-05-06","start":"18:00","end":"19:30","minutes":90,"dayKind":"workday","ratePercent":150}'))->>'no' is not null,
  'Trong giới hạn → tạo đơn');
select throws_ok(format('select public.create_overtime_request(%L, %L, null, %L, date ''2024-04-26'', ''{}'', ''{"limits":{"dayMinutes":240,"monthMinutes":120,"yearMinutes":12000}}'', %L, ''{"date":"2024-05-07","start":"18:00","end":"19:00","minutes":60,"dayKind":"workday","ratePercent":150}'')',
  current_setting('test.t'), current_setting('test.e'), (select id from wv where request_type = 'overtime'), (select j from tasks)), 'P0001', 'OVERTIME_LIMIT', 'Cộng giờ đơn đang chờ cùng tháng vượt giới hạn tháng → chặn');

-- ---------- Chấm công: một lượt vào, một lượt ra hợp lệ mỗi ngày (giờ công ty) ----------
insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, status)
values (current_setting('test.t')::uuid, '60000000-0000-4000-8000-000000000004', 'in', 'race-test-in-1', '2024-05-06 07:55+07', 'accepted');
select throws_ok($$ insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, status)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'in', 'race-test-in-2', '2024-05-06 08:01+07', 'accepted') $$,
  'P0001', 'ATT_DUPLICATE', 'Vào ca lần 2 cùng ngày (khóa chống trùng khác) → chặn');
select throws_ok($$ insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, status)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'in', 'race-test-in-1', '2024-05-06 08:01+07', 'accepted') $$,
  '23505', null, 'Gửi lại cùng khóa chống trùng → để unique xử lý (API trả bản đã có)');
select lives_ok($$ insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, status, reject_reason) values
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'in', 'race-test-in-3', '2024-05-06 08:02+07', 'rejected', 'out_of_range'),
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'out', 'race-test-out-1', '2024-05-06 17:05+07', 'accepted', null),
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'in', 'race-test-in-4', '2024-05-07 00:10+07', 'accepted', null) $$,
  'Lượt bị từ chối, lượt ra, và vào ca ngày hôm sau (00:10 giờ công ty) vẫn ghi được');

select * from finish();
rollback;
