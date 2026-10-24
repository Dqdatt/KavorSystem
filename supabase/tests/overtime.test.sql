-- Làm thêm giờ: bộ mẫu (quy định, luồng duyệt), đơn OT tạo nguyên tử, chặn trùng giờ, kỳ đã khóa, bất biến, thông báo, RLS.
-- Không giả định DB trống (dùng năm 2025 + id riêng).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is((select v.config from public.policy_versions v join public.policy_definitions d on d.id = v.policy_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.kind = 'overtime' order by v.version_no limit 1)
  - 'submitAfterDays', '{"weekdayRate":150,"weekendRate":200,"holidayRate":300,"dailyLimitHours":4,"monthlyLimitHours":40,"yearlyLimitHours":200}'::jsonb, 'Quy định OT mẫu theo luật');
select set_config('test.wv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'overtime' order by v.version_no limit 1), true);
select is((select jsonb_array_length(steps) from public.workflow_versions where id = current_setting('test.wv')::uuid), 2, 'Luồng OT mặc định Quản lý → HR');

select set_config('test.r1', (public.create_overtime_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', '{"date":"2025-03-08","start":"08:00","end":"11:30","hours":3.5,"dayKind":"weekend","ratePercent":200,"reason":"Chạy sự kiện"}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24},{"stepNo":2,"resolver":"hr","status":"waiting"}]',
  '{"date":"2025-03-08","start":"08:00","end":"11:30","minutes":210,"dayKind":"weekend","ratePercent":200}')->>'id'), true);
select matches((select request_no from public.requests where id = current_setting('test.r1')::uuid), '^OT-\d{4}$', 'Số đơn OT-xxxx');
select is((select minutes || ' · ' || day_kind || ' · ' || rate_percent from public.overtime_entries where request_id = current_setting('test.r1')::uuid), '210 · weekend · 200', 'Lưu khoảng giờ, loại ngày, hệ số');
select is((select body from public.notifications where link_id = current_setting('test.r1')::uuid and kind = 'approval.pending'),
  'Võ Thảo Linh · Làm thêm giờ T7 08/03 · 08:00–11:30 · 3,5 giờ', 'Báo quản lý kèm ngày, giờ, số giờ');
select throws_ok($$ select public.create_overtime_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', '{"date":"2025-03-08","start":"11:00","end":"12:00","hours":1}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '{"date":"2025-03-08","start":"11:00","end":"12:00","minutes":60,"dayKind":"weekend","ratePercent":200}') $$, 'P0001', 'OVERTIME_OVERLAP', 'Không trùng giờ với đơn OT khác');
select lives_ok($$ select public.create_overtime_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-02-26', '{"date":"2025-03-08","start":"11:30","end":"12:30","hours":1}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '{"date":"2025-03-08","start":"11:30","end":"12:30","minutes":60,"dayKind":"weekend","ratePercent":200}') $$, 'Khoảng giờ liền kề không tính là trùng');
select throws_ok($$ insert into public.overtime_entries (tenant_id, employee_id, request_id, work_date, start_time, end_time, minutes, day_kind, rate_percent)
  values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', current_setting('test.r1')::uuid, '2025-03-09', '08:00', '08:45', 45, 'weekend', 200) $$,
  '23514', null, 'Số phút theo bước 30 phút');
select throws_ok($$ update public.overtime_entries set minutes = 240 where request_id = current_setting('test.r1')::uuid $$, 'P0001', 'OVERTIME_IMMUTABLE', 'Không sửa giờ OT đã đăng ký');

insert into public.timesheet_locks (tenant_id, period_start, period_end, snapshot) values ('10000000-0000-4000-8000-000000000001', '2025-06-26', '2025-07-25', '{}');
select throws_ok($$ select public.create_overtime_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', null, current_setting('test.wv')::uuid,
  '2025-06-26', '{"date":"2025-07-05","start":"08:00","end":"10:00","hours":2}', '{}',
  '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
  '{"date":"2025-07-05","start":"08:00","end":"10:00","minutes":120,"dayKind":"weekend","ratePercent":200}') $$, 'P0001', 'PERIOD_LOCKED', 'Không đăng ký OT vào kỳ công đã khóa');

insert into auth.users (id, email) values ('a8000000-0000-4000-8000-000000000142', 'ha.ot@example.test');
update public.employees set user_id = 'a8000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select count(*)::int from public.overtime_entries where employee_id = '60000000-0000-4000-8000-000000000005'), 0, 'Nhân viên khác không đọc được OT của người khác');
reset role;

select * from finish();
rollback;
