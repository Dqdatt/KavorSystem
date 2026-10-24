-- Thông báo: tạo bằng trigger khi bước duyệt tới lượt / đơn có kết quả / máy được duyệt, nhắc hạn duyệt không trùng,
-- chỉ đánh dấu đã đọc, RLS chỉ người nhận thấy. Không giả định DB trống (lọc theo đơn/thiết bị của test).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select set_config('test.wv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'explanation' order by v.version_no desc limit 1), true);
-- HR Admin mẫu (HD0007, hr_ops toàn công ty) cần có tài khoản thì mới là người duyệt bước HR
insert into auth.users (id, email) values ('a4000000-0000-4000-8000-000000000007', 'thao.notif@example.test');
update public.memberships set user_id = coalesce(user_id, 'a4000000-0000-4000-8000-000000000007'), status = 'active' where id = '80000000-0000-4000-8000-000000000007';

-- ---------- Đơn Hà → Huy (quản lý) → HR ----------
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date, period_start)
values ('f3000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'TEST-NT-1', 'explanation', '60000000-0000-4000-8000-000000000142',
  current_setting('test.wv')::uuid, date '2025-04-03', date '2025-03-26');
insert into public.request_versions (tenant_id, request_id, version_no, payload)
values ('10000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 1, '{"kind":"missing_out","clockOut":"17:00","reason":"Quên chấm ra"}');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status, due_at) values
  ('f4000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending', now() + interval '2 hours'),
  ('f4000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 2, 'hr', null, 'waiting', null);

select is((select recipient_employee_id::text || ' · ' || title from public.notifications where task_id = 'f4000000-0000-4000-8000-000000000001' and kind = 'approval.pending'),
  '60000000-0000-4000-8000-000000000003 · Đơn TEST-NT-1 cần bạn duyệt', 'Đơn mới → báo quản lý được giao');
select is((select body from public.notifications where task_id = 'f4000000-0000-4000-8000-000000000001' and kind = 'approval.pending'),
  'Trần Thu Hà · Giải trình công T5 03/04 · quên chấm ra', 'Nội dung có người gửi, ngày, loại giải trình');
select is((select count(*)::int from public.notifications where link_id = 'f3000000-0000-4000-8000-000000000001' and kind = 'approval.pending'), 1, 'Bước HR chưa tới lượt thì chưa báo HR');

select ok(public.notify_due_approvals() >= 1, 'Quét bước duyệt sắp hết hạn tạo thông báo mới');
select is((select title from public.notifications where task_id = 'f4000000-0000-4000-8000-000000000001' and kind = 'approval.due'), 'Đơn TEST-NT-1 sắp quá hạn duyệt', 'Còn dưới 4 giờ → nhắc sắp quá hạn');
select is(public.notify_due_approvals(), 0, 'Gọi lại không nhắc trùng');

select is(public.decide_approval('f4000000-0000-4000-8000-000000000001', null, true), 'next', 'Quản lý duyệt');
select ok(exists (select 1 from public.notifications where task_id = 'f4000000-0000-4000-8000-000000000002' and recipient_employee_id = '60000000-0000-4000-8000-000000000007'),
  'Bước HR tới lượt → báo người có quyền duyệt HR');
select ok(not exists (select 1 from public.notifications where task_id = 'f4000000-0000-4000-8000-000000000002' and recipient_employee_id = '60000000-0000-4000-8000-000000000142'),
  'Không báo người gửi là người duyệt đơn của chính mình');
select is(public.decide_approval('f4000000-0000-4000-8000-000000000002', null, true), 'approved', 'HR duyệt');
select is((select title from public.notifications where link_id = 'f3000000-0000-4000-8000-000000000001' and kind = 'request.approved' and recipient_employee_id = '60000000-0000-4000-8000-000000000142'),
  'Đơn TEST-NT-1 đã được duyệt', 'Đơn hoàn tất → báo người gửi');

-- ---------- Từ chối ----------
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
values ('f3000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'TEST-NT-2', 'explanation', '60000000-0000-4000-8000-000000000142', current_setting('test.wv')::uuid, date '2025-04-04');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status) values
  ('f4000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending');
select is(public.decide_approval('f4000000-0000-4000-8000-000000000003', null, false, 'Không có minh chứng'), 'rejected', 'Quản lý từ chối');
select is((select body from public.notifications where link_id = 'f3000000-0000-4000-8000-000000000002' and kind = 'request.rejected'),
  'Người duyệt: Không có minh chứng', 'Báo từ chối kèm lý do');

-- ---------- Thiết bị ----------
insert into public.employee_devices (id, tenant_id, employee_id, installation_id, platform, device_model, status)
values ('f5000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'test-notif-device-1', 'ios', 'iPhone thử', 'pending');
update public.employee_devices set status = 'rejected', decision_reason = 'Không phải máy công ty' where id = 'f5000000-0000-4000-8000-000000000001';
select is((select title || ' · ' || body from public.notifications where link_id = 'f5000000-0000-4000-8000-000000000001'),
  'Máy không được duyệt · Không phải máy công ty', 'Máy bị từ chối → báo nhân viên kèm lý do');

-- ---------- Bất biến + RLS ----------
select throws_ok($$ update public.notifications set title = 'x' where link_id = 'f3000000-0000-4000-8000-000000000002' $$, 'P0001', 'NOTIFICATION_IMMUTABLE', 'Không sửa nội dung thông báo');
insert into auth.users (id, email) values ('a4000000-0000-4000-8000-000000000142', 'ha.notif@example.test');
update public.employees set user_id = 'a4000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select array_agg(distinct recipient_employee_id)::text from public.notifications), '{60000000-0000-4000-8000-000000000142}', 'Nhân viên chỉ thấy thông báo của mình');
reset role;

select * from finish();
rollback;
