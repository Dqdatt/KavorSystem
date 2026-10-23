-- Chấm công: bất biến, chống trùng, chỉ đọc dữ liệu của chính mình.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'ha@example.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'linh@example.test');
update public.employees set user_id = 'a0000000-0000-4000-8000-00000000000a' where employee_code = 'HD0142';
update public.employees set user_id = 'c0000000-0000-4000-8000-00000000000c' where employee_code = 'HDG0005';
insert into public.memberships (tenant_id, user_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'active'),
  ('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c', 'active');
-- Không phụ thuộc dữ liệu đã có trên DB local (thiết bị đăng ký khi thử app)
update public.employee_devices set status = 'revoked' where employee_id = '60000000-0000-4000-8000-000000000142';
insert into public.employee_devices (id, tenant_id, employee_id, installation_id, platform) values
  ('d0000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'install-ha-0001', 'ios');
insert into public.attendance_events (tenant_id, employee_id, device_id, kind, client_event_id, occurred_at, status) values
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'd0000000-0000-4000-8000-00000000000d', 'in', 'evt-ha-000001', now(), 'accepted');

select throws_ok($$insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, status) values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000142','in','evt-ha-000001',now(),'accepted')$$, '23505', null, 'Cùng client_event_id không tạo bản ghi thứ hai');
select throws_ok($$update public.attendance_events set kind = 'out'$$, 'P0001', 'attendance_events is immutable', 'Không sửa được bản ghi chấm công');
select throws_ok($$delete from public.attendance_events$$, 'P0001', 'attendance_events is immutable', 'Không xóa được bản ghi chấm công');
select throws_ok($$insert into public.employee_devices (tenant_id, employee_id, installation_id, platform) values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000142','install-ha-0002','ios')$$, '23505', null, 'Mỗi nhân viên chỉ một thiết bị đang hoạt động');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.attendance_events where client_event_id = 'evt-ha-000001'), 1, 'Hà thấy bản ghi của mình');
select is((select count(*)::int from public.attendance_events where employee_id <> '60000000-0000-4000-8000-000000000142'), 0, 'Hà chỉ thấy bản ghi của chính mình');
select ok((select count(*) from public.work_locations) > 0 and (select count(*) from public.work_locations where tenant_id <> '10000000-0000-4000-8000-000000000001') = 0, 'Hà thấy địa điểm làm việc của công ty mình');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.attendance_events), 0, 'Linh không thấy chấm công của Hà');
select is((select count(*)::int from public.employee_devices), 0, 'Linh không thấy thiết bị của Hà');
reset role;

select * from finish();
rollback;
