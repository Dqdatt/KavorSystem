-- Kiểm tra các hàm dựng chữ thông báo (teaser bản tin, tóm tắt đơn không lộ tiền, danh từ loại đơn).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.announcements (id, tenant_id, category, title, body, author_label, audience)
values
  ('f7000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'notice', 'Bài dài',
   E'Công ty nghỉ Tết\n\n' || repeat('a', 120), 'Phòng Nhân sự', 'tenant'),
  ('f7000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'notice', 'Bài rỗng',
   E'   \n\t  \n---\n****', 'Ban Giám đốc', 'tenant'),
  ('f7000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'notice', 'Một từ dài',
   repeat('a', 120), 'Phòng Nhân sự', 'tenant'),
  ('f7000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'notice', 'Vừa đủ',
   repeat('a', 85) || ' bbbb', 'Phòng Nhân sự', 'tenant');

select is(public.announcement_teaser('f7000000-0000-4000-8000-000000000001'), 'Công ty nghỉ Tết…',
  'Teaser không tiền tố người đăng, cắt ở ranh giới từ (≤ 90 ký tự), bỏ dấu câu trước …');
select is(public.announcement_teaser('f7000000-0000-4000-8000-000000000006'), repeat('a', 90) || '…', 'Một từ dài hơn 90 ký tự thì cắt cứng');
select is(public.announcement_teaser('f7000000-0000-4000-8000-000000000007'), repeat('a', 85) || ' bbbb', 'Đúng 90 ký tự thì giữ nguyên');

select is(public.announcement_teaser('f7000000-0000-4000-8000-000000000002'),
  'Ban Giám đốc đăng thông báo mới',
  'Teaser bài rỗng (chỉ khoảng trắng/ký hiệu) ra câu đăng thông báo mới');

select is(public.announcement_plain_text(E'## Lịch nghỉ\n**Nghỉ** từ *28/1* đến ++5/2++\n\n---\n- Ý một\n  1. Ý hai\n> Ghi chú'),
  'Lịch nghỉ. Nghỉ từ 28/1 đến 5/2. Ý một. Ý hai. Ghi chú', 'Bỏ ký hiệu tiêu đề/danh sách/thụt lề/định dạng, mỗi mục thành một câu');
select is(public.announcement_plain_text(E'Công ty sẽ tổ chức\nteam building \\*vui\\* và 2 * 3 **đậm'),
  'Công ty sẽ tổ chức team building *vui* và 2 * 3 **đậm', 'Dòng cùng đoạn nối bằng dấu cách; ký hiệu có \ hoặc lẻ giữ nguyên');
select is(public.announcement_plain_text(E'Xin chào,\r\n\r\nNội dung'), 'Xin chào, Nội dung', 'Đã có dấu câu thì không thêm dấu chấm');

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

select set_config('test.wv_exp', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'explanation' order by v.version_no limit 1), true);
insert into public.requests (id, tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date)
values ('f7000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'TEST-NT-LONG', 'explanation',
  '60000000-0000-4000-8000-000000000142', current_setting('test.wv_exp')::uuid, date '2025-04-04');
insert into public.approval_tasks (id, tenant_id, request_id, step_no, resolver, assignee_employee_id, status)
values ('f7000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000004', 1, 'direct_manager', '60000000-0000-4000-8000-000000000003', 'pending');
select is(public.decide_approval('f7000000-0000-4000-8000-000000000005', null, false, repeat('x', 600)), 'rejected', 'Từ chối đơn với lý do dài');
select is((select length(body) = 500 and body like 'Người duyệt: %'
    from public.notifications where link_id = 'f7000000-0000-4000-8000-000000000004' and kind = 'request.rejected'),
  true, 'Lý do từ chối dài được notify giới hạn ở 500 ký tự');

-- Quy tắc: chữ thông báo không dùng dấu "·" (mọi thông báo sinh ra trong test này)
select ok(not exists (select 1 from public.notifications where created_at = now() and position('·' in title || ' ' || coalesce(body, '')) > 0),
  'Thông báo mới không dùng dấu ·');

select * from finish();
rollback;
