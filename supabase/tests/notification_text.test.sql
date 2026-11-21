-- Kiểm tra các hàm dựng chữ thông báo (teaser bản tin, tóm tắt đơn không lộ tiền, danh từ loại đơn).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

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

select is(public.request_type_noun('leave'), 'nghỉ phép', 'Danh từ loại đơn nghỉ phép');

select * from finish();
rollback;
