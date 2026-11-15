-- Nút "Nhắc" (notify_reminders): chỉ người có app và còn làm, một lần mỗi ngày mỗi loại, bản tin chỉ nhắc người chưa đọc.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Hà (HD0142) và Thảo (HD0007) có tài khoản; một nhân viên khác chưa có app
insert into auth.users (id, email) values ('a5000000-0000-4000-8000-000000000142', 'ha.remind@example.test'), ('a5000000-0000-4000-8000-000000000007', 'thao.remind@example.test');
update public.employees set user_id = 'a5000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142' and user_id is null;
update public.employees set user_id = 'a5000000-0000-4000-8000-000000000007' where id = '60000000-0000-4000-8000-000000000007' and user_id is null;
select set_config('test.noapp', (select id::text from public.employees where tenant_id = '10000000-0000-4000-8000-000000000001'
  and user_id is null and status <> 'terminated' limit 1), true);

select is(public.notify_reminders('10000000-0000-4000-8000-000000000001', 'reminder.attendance',
  jsonb_build_array(jsonb_build_object('id', '60000000-0000-4000-8000-000000000142', 'detail', 'Ca Hành chính 08:00–17:00'),
    jsonb_build_object('id', current_setting('test.noapp')), jsonb_build_object('id', gen_random_uuid()))), 1,
  'Nhắc chấm công: chỉ người có app trong công ty');
select is((select title || ' | ' || body from public.notifications where recipient_employee_id = '60000000-0000-4000-8000-000000000142' and kind = 'reminder.attendance'),
  'Bạn chưa chấm công hôm nay | Ca Hành chính 08:00–17:00 · Mở app để chấm công.', 'Nội dung nhắc chấm công có ca');
select is(public.notify_reminders('10000000-0000-4000-8000-000000000001', 'reminder.attendance', '[{"id":"60000000-0000-4000-8000-000000000142"}]'), 0,
  'Nhắc lại trong ngày không tạo trùng');
select is(public.notify_reminders('10000000-0000-4000-8000-000000000001', 'reminder.documents', '[{"id":"60000000-0000-4000-8000-000000000142","detail":"CCCD, Sổ BHXH"}]'), 1,
  'Nhắc giấy tờ là loại riêng, không bị chặn bởi nhắc chấm công');
select is((select body from public.notifications where recipient_employee_id = '60000000-0000-4000-8000-000000000142' and kind = 'reminder.documents'),
  'Còn thiếu: CCCD, Sổ BHXH. Nộp bổ sung cho phòng Nhân sự.', 'Nội dung nhắc giấy tờ kèm giấy tờ còn thiếu');
select is(public.notify_reminders('10000000-0000-4000-8000-000000000002', 'reminder.documents', '[{"id":"60000000-0000-4000-8000-000000000007"}]'), 0,
  'Không nhắc được nhân viên của công ty khác');
select throws_ok($$ select public.notify_reminders('10000000-0000-4000-8000-000000000001', 'approval.due', '[]') $$, 'P0001', 'REMINDER_KIND_INVALID', 'Chỉ nhận loại nhắc');

-- ---------- Bản tin ----------
insert into public.announcements (id, tenant_id, category, title, publish_at, audience)
values ('f6000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'notice', 'Lịch nghỉ Tết', now() - interval '1 hour', 'tenant'),
  ('f6000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'notice', 'Bài nháp', null, 'tenant');
insert into public.announcement_reads (announcement_id, tenant_id, employee_id)
values ('f6000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000007');
select ok(public.notify_reminders('10000000-0000-4000-8000-000000000001', 'reminder.announcement', null, 'f6000000-0000-4000-8000-000000000001') >= 1, 'Nhắc người chưa đọc bài');
select is((select title || ' | ' || link_type from public.notifications where recipient_employee_id = '60000000-0000-4000-8000-000000000142' and kind = 'reminder.announcement'),
  'Nhắc đọc bản tin: Lịch nghỉ Tết | announcement', 'Hà chưa đọc → được nhắc, mở được bài');
select ok(not exists (select 1 from public.notifications where recipient_employee_id = '60000000-0000-4000-8000-000000000007' and kind = 'reminder.announcement'),
  'Người đã đọc không bị nhắc');
select throws_ok($$ select public.notify_reminders('10000000-0000-4000-8000-000000000001', 'reminder.announcement', null, 'f6000000-0000-4000-8000-000000000002') $$,
  'P0001', 'ANNOUNCEMENT_NOT_REMINDABLE', 'Bài chưa xuất bản thì không nhắc');

select * from finish();
rollback;
