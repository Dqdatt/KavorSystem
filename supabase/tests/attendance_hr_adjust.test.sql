-- HR điều chỉnh công (hr_adjust_attendance): quyền mặc định, kiểm đầu vào, chặn tự sửa / ngày tương lai / ngoài hợp đồng /
-- kỳ đã khóa / giải trình đang chờ; ghi điều chỉnh không gắn đơn + nhật ký + thông báo trong cùng giao dịch. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select set_config('test.t', '10000000-0000-4000-8000-000000000001', true);
select set_config('test.today', public.tenant_today(current_setting('test.t')::uuid)::text, true);
select set_config('test.e', '60000000-0000-4000-8000-000000000003', true);
insert into auth.users (id, email) values ('a8200000-0000-4000-8000-000000000001', 'hr.adjust@example.test'), ('a8200000-0000-4000-8000-000000000002', 'huy.adjust@example.test');
update public.employees set status = 'active', hire_date = '2024-01-01', termination_date = null, user_id = 'a8200000-0000-4000-8000-000000000002'
where id = current_setting('test.e')::uuid;
create function pg_temp.adj(d date, i time, o time, why text, u uuid default 'a8200000-0000-4000-8000-000000000001', t uuid default current_setting('test.t')::uuid)
returns uuid language sql as $$
  select public.hr_adjust_attendance(t, current_setting('test.e')::uuid, d, i, o, why, u, '{"clockIn":"20:30","clockOut":"19:51"}', 'test-corr');
$$;

-- ---------- Quyền mặc định ----------
select is((select array_agg(r.code order by r.code) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where p.code = 'attendance.adjust' and r.tenant_id is null and r.is_system), array['hr_ops','tenant_admin'], 'attendance.adjust: chỉ HCNS và Quản trị viên công ty');
select ok(not has_function_privilege('authenticated', 'public.hr_adjust_attendance(uuid, uuid, date, time, time, text, uuid, jsonb, text)', 'execute'), 'Người dùng đăng nhập không gọi trực tiếp');

-- ---------- Kiểm đầu vào ----------
select throws_ok($$ select pg_temp.adj(current_date - 1, '08:00', '17:00', 'Sửa giờ thử', t => '10000000-0000-4000-8000-000000000002') $$,
  'P0001', 'EMPLOYEE_NOT_FOUND', 'Không sửa nhân viên công ty khác');
select throws_ok($$ select pg_temp.adj(current_date - 1, '08:00', '17:00', 'Sửa giờ thử', u => null) $$, 'P0001', 'ADJUST_ACTOR_REQUIRED', 'Phải có người sửa');
select throws_ok($$ select pg_temp.adj(current_date - 1, '08:00', '17:00', 'Sửa giờ thử', u => 'a8200000-0000-4000-8000-000000000002') $$,
  'P0001', 'ADJUST_SELF', 'Không tự sửa công của mình');
select throws_ok($$ select pg_temp.adj(current_date - 1, '17:00', '17:00', 'Sửa giờ thử') $$, 'P0001', 'ADJUST_TIME_INVALID', 'Giờ ra phải sau giờ vào');
select throws_ok($$ select pg_temp.adj(current_date - 1, '08:00', null, 'Sửa giờ thử') $$, 'P0001', 'ADJUST_TIME_INVALID', 'Phải có cả giờ vào và giờ ra');
select throws_ok($$ select pg_temp.adj(current_date - 1, '08:00', '17:00', '  abc  ') $$, 'P0001', 'ADJUST_REASON_INVALID', 'Lý do ít nhất 5 ký tự');
select throws_ok($$ select pg_temp.adj(current_setting('test.today')::date + 1, '08:00', '17:00', 'Sửa giờ thử') $$, 'P0001', 'ADJUST_DATE_FUTURE', 'Không sửa ngày tương lai');
select throws_ok($$ select pg_temp.adj('2023-12-29', '08:00', '17:00', 'Sửa giờ thử') $$, 'P0001', 'ADJUST_NOT_EMPLOYED', 'Không sửa ngày trước khi vào làm');
insert into public.timesheet_locks (tenant_id, period_start, period_end, snapshot) values (current_setting('test.t')::uuid, '2025-02-26', '2025-03-25', '{}');
select throws_ok($$ select pg_temp.adj('2025-03-03', '08:00', '17:00', 'Sửa giờ thử') $$, 'P0001', 'PERIOD_LOCKED', 'Kỳ công đã khóa');

-- ---------- Giải trình đang chờ của ngày ----------
insert into public.requests (tenant_id, request_no, request_type, requester_employee_id, workflow_version_id, work_date, period_start)
select current_setting('test.t')::uuid, 'TEST-ADJ-GT', 'explanation', current_setting('test.e')::uuid, v.id, current_setting('test.today')::date - 2, current_setting('test.today')::date - 2
from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
where d.tenant_id = current_setting('test.t')::uuid and d.request_type = 'explanation' order by v.version_no limit 1;
select throws_ok($$ select pg_temp.adj(current_setting('test.today')::date - 2, '08:00', '17:00', 'Sửa giờ thử') $$, 'P0001', 'ADJUST_REQUEST_PENDING', 'Có giải trình chờ duyệt → xử lý đơn trước');

-- ---------- Ghi điều chỉnh + nhật ký + thông báo ----------
select set_config('test.a', pg_temp.adj(current_setting('test.today')::date - 3, '08:23', '19:51', '  Thiết bị lỗi, duyệt nhầm giờ  ')::text, true);
select is((select concat_ws('|', request_id is null, approved_by, clock_in, clock_out, reason) from public.attendance_adjustments where id = current_setting('test.a')::uuid),
  't|a8200000-0000-4000-8000-000000000001|08:23:00|19:51:00|Thiết bị lỗi, duyệt nhầm giờ', 'Điều chỉnh không gắn đơn, lưu người sửa, lý do đã cắt khoảng trắng');
select is((select concat_ws('|', actor_user_id, before_data->>'clockIn', after_data->>'clock_in', after_data->>'clock_out', reason, correlation_id) from public.audit_logs
  where action = 'attendance.adjusted' and resource_type = 'employee' and resource_id = current_setting('test.e')::uuid and after_data->>'adjustment_id' = current_setting('test.a')),
  'a8200000-0000-4000-8000-000000000001|20:30|08:23|19:51|Thiết bị lỗi, duyệt nhầm giờ|test-corr', 'Nhật ký có trước/sau và lý do');
select is((select concat_ws('|', kind, body) from public.notifications where recipient_employee_id = current_setting('test.e')::uuid and dedupe_key = 'attendance.adjusted:' || current_setting('test.a')),
  'attendance.adjusted|Giờ vào 08:23, giờ ra 19:51. Lý do: Thiết bị lỗi, duyệt nhầm giờ', 'Nhân viên nhận thông báo');
select ok(pg_temp.adj(current_setting('test.today')::date, '08:00', '12:00', 'Sửa giờ hôm nay') is not null, 'Sửa được hôm nay');
-- Người đã nghỉ việc: sửa được tới ngày làm việc cuối
update public.employees set termination_date = current_setting('test.today')::date - 5 where id = current_setting('test.e')::uuid;
select throws_ok($$ select pg_temp.adj(current_setting('test.today')::date - 4, '08:00', '17:00', 'Sửa giờ thử') $$, 'P0001', 'ADJUST_NOT_EMPLOYED', 'Không sửa ngày sau ngày làm việc cuối');
select ok(pg_temp.adj(current_setting('test.today')::date - 5, '08:00', '17:00', 'Sửa ngày làm việc cuối') is not null, 'Sửa được ngày làm việc cuối');

select * from finish();
rollback;
