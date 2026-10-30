-- Bản tin có thời hạn hiển thị (visible_until): quá hạn thì nhân viên không còn thấy, không gửi thông báo; hạn phải sau giờ xuất bản.
-- Không giả định DB trống: dùng nhân viên đang làm bất kỳ của Hải Đăng.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('test.t', '10000000-0000-4000-8000-000000000001', true);
select set_config('test.e', (select id::text from public.employees where tenant_id = current_setting('test.t')::uuid and status <> 'terminated' and user_id is null order by employee_code limit 1), true);

insert into public.announcements (id, tenant_id, category, title, publish_at, visible_until, notify) values
  ('a9000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'notice', 'Còn hạn', now() - interval '1 hour', now() + interval '1 day', false),
  ('a9000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid, 'notice', 'Hết hạn', now() - interval '2 day', now() - interval '1 hour', true),
  ('a9000000-0000-4000-8000-000000000003', current_setting('test.t')::uuid, 'notice', 'Không hạn', now() - interval '1 hour', null, false);

select ok(public.announcement_visible('a9000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid), 'Còn trong thời hạn: nhân viên thấy bài');
select ok(not public.announcement_visible('a9000000-0000-4000-8000-000000000002', current_setting('test.e')::uuid), 'Quá "Hiển thị đến": bài tự ẩn');
select ok(public.announcement_visible('a9000000-0000-4000-8000-000000000003', current_setting('test.e')::uuid), 'Không đặt hạn: hiển thị tới khi gỡ');
select is(public.notify_due_announcements('a9000000-0000-4000-8000-000000000002'), 0, 'Bài đã hết hạn không gửi thông báo');
select throws_ok($$ update public.announcements set visible_until = publish_at - interval '1 minute' where id = 'a9000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'Hạn hiển thị phải sau giờ xuất bản');
select lives_ok($$ update public.announcements set visible_until = now() + interval '7 day' where id = 'a9000000-0000-4000-8000-000000000001' $$,
  'Bài đã xuất bản vẫn gia hạn được');

select * from finish();
rollback;
