-- Kiểm tra các hàm dựng chữ thông báo (teaser bản tin, tóm tắt đơn không lộ tiền, không dùng dấu "·", danh từ loại đơn).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.announcements (id, tenant_id, category, title, body, author_label, audience)
values
  ('f7000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'notice', 'Bài dài',
   E'Công ty nghỉ Tết\n\n' || repeat('a', 120), 'Phòng Nhân sự', 'tenant'),
  ('f7000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'notice', 'Bài rỗng',
   E'   \n\t  ', 'Ban Giám đốc', 'tenant');

select is(public.announcement_teaser('f7000000-0000-4000-8000-000000000001'),
  'Phòng Nhân sự: Công ty nghỉ Tết ' || repeat('a', 103) || '…',
  'Teaser gộp khoảng trắng, cắt 120 ký tự và thêm dấu …');

select is(public.announcement_teaser('f7000000-0000-4000-8000-000000000002'),
  'Ban Giám đốc đăng thông báo mới',
  'Teaser bài rỗng ra câu đăng thông báo mới');

select set_config('test.wv_adv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'salary_advance' order by v.version_no limit 1), true);
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id)
values ('f7000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'TEST-NT-ADV', 'salary_advance',
  '60000000-0000-4000-8000-000000000142', current_setting('test.wv_adv')::uuid);
insert into public.request_versions (tenant_id, request_id, version_no, payload)
values ('10000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000003', 1, '{"amount":2000000,"month":"2026-11"}');

select ok(public.notify_request_brief('f7000000-0000-4000-8000-000000000003') = 'Trừ vào lương 11/2026'
  and position('₫' in public.notify_request_brief('f7000000-0000-4000-8000-000000000003')) = 0,
  'Tóm tắt đơn tạm ứng không chứa số tiền');

-- Kiểm tra brief các loại đơn trong seed không chứa dấu "·"
select set_config('test.wv_leave', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), true);
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id)
values ('f7000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'TEST-NT-LV', 'leave',
  '60000000-0000-4000-8000-000000000142', current_setting('test.wv_leave')::uuid);
insert into public.request_versions (tenant_id, request_id, version_no, payload)
values ('10000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000006', 1, '{"leaveTypeName":"Phép năm","from":"2026-11-20","to":"2026-11-20","half":"am","days":0.5}');

select is(public.notify_request_brief('f7000000-0000-4000-8000-000000000006'),
  'Phép năm 20/11 buổi sáng (0,5 ngày)',
  'Tóm tắt đơn nghỉ nửa ngày đúng mẫu, không có dấu ·');

select set_config('test.wv_ot', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'overtime' order by v.version_no limit 1), true);
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
values ('f7000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'TEST-NT-OT', 'overtime',
  '60000000-0000-4000-8000-000000000142', current_setting('test.wv_ot')::uuid, date '2026-11-22');
insert into public.request_versions (tenant_id, request_id, version_no, payload)
values ('10000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000007', 1, '{"start":"08:00","end":"12:00","hours":4}');

select is(public.notify_request_brief('f7000000-0000-4000-8000-000000000007'),
  'CN 22/11 từ 08:00 đến 12:00 (4 giờ)',
  'Tóm tắt đơn làm thêm giờ đúng mẫu, không có dấu ·');

select ok(position('·' in public.announcement_teaser('f7000000-0000-4000-8000-000000000001')) = 0
  and position('·' in public.notify_request_brief('f7000000-0000-4000-8000-000000000003')) = 0
  and position('·' in public.notify_request_brief('f7000000-0000-4000-8000-000000000006')) = 0
  and position('·' in public.notify_request_brief('f7000000-0000-4000-8000-000000000007')) = 0,
  'Chữ thông báo mới không chứa dấu ·');

select is(public.request_type_noun('leave'), 'nghỉ phép', 'Danh từ loại đơn nghỉ phép');

select set_config('test.wv_exp', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'explanation' order by v.version_no limit 1), true);
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
values ('f7000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'TEST-NT-LONG', 'explanation',
  '60000000-0000-4000-8000-000000000142', current_setting('test.wv_exp')::uuid, date '2025-04-04');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status)
values ('f7000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000004', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending');
select is(public.decide_approval('f7000000-0000-4000-8000-000000000005', null, false, repeat('x', 600)), 'rejected', 'Từ chối đơn với lý do dài');
select is((select length(body) = 500 and body like 'Người duyệt: %' and position('·' in body) = 0
    from public.notifications where link_id = 'f7000000-0000-4000-8000-000000000004' and kind = 'request.rejected'),
  true, 'Lý do từ chối dài được notify giới hạn ở 500 ký tự và không chứa dấu ·');

select * from finish();
rollback;
