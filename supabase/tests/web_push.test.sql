-- Web Push (202612130001): chỉ service role đụng được, đăng ký chuyển chủ theo trình duyệt và giữ tối đa 5, thông báo mới vào hàng đợi
-- khi người nhận có đăng ký, push_claim lấy một lần rồi xóa, bỏ thông báo đã đọc/cũ. Không giả định DB trống (lọc theo endpoint của test).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'select'), 'authenticated không đọc được push_subscriptions');
select ok(not has_table_privilege('anon', 'public.push_outbox', 'select'), 'anon không đọc được push_outbox');
select ok(not has_function_privilege('authenticated', 'public.push_claim(integer)', 'execute'), 'authenticated không gọi được push_claim');
select ok(not has_function_privilege('authenticated', 'public.push_subscribe(uuid, uuid, text, text, text)', 'execute'), 'authenticated không gọi được push_subscribe');

-- Hà (HD0142) đăng ký một trình duyệt
select lives_ok($$ select public.push_subscribe('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142',
  'https://web.push.apple.com/test-wp-1', repeat('B', 87), repeat('a', 22)) $$, 'Đăng ký trình duyệt cho nhân viên đúng công ty');
select throws_ok($$ select public.push_subscribe('10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000142',
  'https://web.push.apple.com/test-wp-x', repeat('B', 87), repeat('a', 22)) $$, 'P0002', 'EMPLOYEE_NOT_FOUND', 'Nhân viên không thuộc công ty → từ chối');
select throws_ok($$ select public.push_subscribe('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142',
  'http://127.0.0.1/test-wp', repeat('B', 87), repeat('a', 22)) $$, '23514', null, 'Endpoint không phải https → từ chối');

-- Thông báo cho Hà → vào hàng đợi; cho người chưa đăng ký (Huy, HD0003) → không
select public.notify('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'request.approved', 'Đơn TEST-WP-1 đã được duyệt', 'Nội dung thử',
  'request', null, 'TEST-WP-1', null, 'test-wp:1');
select public.notify('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'request.approved', 'Đơn TEST-WP-2 đã được duyệt', 'Nội dung thử',
  'request', null, 'TEST-WP-2', null, 'test-wp:2');
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id where n.dedupe_key = 'test-wp:1'), 1,
  'Người nhận có đăng ký → thông báo vào hàng đợi push');
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id where n.dedupe_key = 'test-wp:2'), 0,
  'Người nhận chưa đăng ký → không vào hàng đợi');

-- Đã đọc trước khi gửi, hoặc cũ hơn 12 giờ → không gửi
select public.notify('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'request.rejected', 'Đơn TEST-WP-3 bị từ chối', 'Đã đọc',
  'request', null, 'TEST-WP-3', null, 'test-wp:3');
update public.notifications set read_at = now() where dedupe_key = 'test-wp:3';
insert into public.notifications (tenant_id, recipient_employee_id, kind, title, body, dedupe_key, created_at)
values ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'request.approved', 'Đơn cũ', '', 'test-wp:4', now() - interval '13 hours');

create temp table claimed as select * from public.push_claim(500);
select is((select string_agg(c.title, ' | ' order by c.title) from claimed c where c.endpoint = 'https://web.push.apple.com/test-wp-1'),
  'Đơn TEST-WP-1 đã được duyệt', 'push_claim trả đúng thông báo chưa đọc, còn mới, kèm endpoint của người nhận');
select is((select c.p256dh || ':' || c.auth || ':' || c.link_no from claimed c where c.endpoint = 'https://web.push.apple.com/test-wp-1'),
  repeat('B', 87) || ':' || repeat('a', 22) || ':TEST-WP-1', 'Kèm khóa mã hóa của trình duyệt và liên kết');
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id where n.dedupe_key like 'test-wp:%'), 0,
  'Đã lấy thì xóa khỏi hàng đợi (kể cả dòng bị bỏ qua)');
select is((select count(*)::int from public.push_claim(500) c where c.endpoint = 'https://web.push.apple.com/test-wp-1'), 0, 'Lấy lần hai không gửi lại');

-- Cùng trình duyệt, Huy đăng nhập → subscription chuyển sang Huy
select public.push_subscribe('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003',
  'https://web.push.apple.com/test-wp-1', repeat('C', 87), repeat('b', 22));
select is((select employee_id::text || ':' || left(p256dh, 1) from public.push_subscriptions where endpoint = 'https://web.push.apple.com/test-wp-1'),
  '60000000-0000-4000-8000-000000000003:C', 'Người khác đăng nhập cùng trình duyệt → subscription chuyển sang người đó');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://web.push.apple.com/test-wp-1'), 1, 'Mỗi endpoint chỉ một dòng');

-- Đăng ký 7 trình duyệt → giữ 5 cái mới nhất
select public.push_subscribe('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142',
  'https://fcm.googleapis.com/fcm/send/test-wp-many-' || i, repeat('B', 87), repeat('a', 22)) from generate_series(1, 7) i;
select is((select count(*)::int from public.push_subscriptions where employee_id = '60000000-0000-4000-8000-000000000142'), 5,
  'Mỗi nhân viên giữ tối đa 5 trình duyệt');

select * from finish();
rollback;
