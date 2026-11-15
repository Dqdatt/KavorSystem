-- Tạm nghỉ (pause_employee, end_employee_pause, apply_due_pauses, cắt khi ghi ngày cuối): kiểm đầu vào, đổi trạng thái theo ngày,
-- hủy đơn nghỉ chờ trong khoảng tạm nghỉ, chặn khi có đơn đã duyệt / trùng khoảng / kỳ công đã khóa. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select set_config('test.today', public.tenant_today('10000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.e', '60000000-0000-4000-8000-000000000003', true);
update public.employees set status = 'active', hire_date = '2024-01-01', termination_date = null where id = current_setting('test.e')::uuid;
select set_config('test.wvl', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), true);
select set_config('test.al', (select id::text from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'AL'), true);
create function pg_temp.leave(d date) returns uuid language sql as $$
  select (public.create_leave_request('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, null, current_setting('test.wvl')::uuid,
    d, current_setting('test.al')::uuid, '{"leaveType":"AL","days":1}', '{}',
    '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24}]',
    jsonb_build_array(jsonb_build_object('date', d, 'half', 'full', 'portion', 1)), null, 1)->>'id')::uuid;
$$;
-- Đơn nghỉ chờ: trước khoảng tạm nghỉ (giữ) và trong khoảng (hủy)
select set_config('test.lbefore', pg_temp.leave(current_setting('test.today')::date - 5)::text, true);
select set_config('test.lin', pg_temp.leave(current_setting('test.today')::date + 3)::text, true);

-- ---------- Kiểm đầu vào ----------
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_date, null, 'vacation', null, null) $$,
  'P0001', 'PAUSE_REASON_INVALID', 'Lý do ngoài danh sách');
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, '2023-06-01', null, 'unpaid', null, null) $$,
  'P0001', 'PAUSE_BEFORE_HIRE', 'Bắt đầu trước ngày vào làm');
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_date, current_date - 1, 'unpaid', null, null) $$,
  'P0001', 'PAUSE_RANGE_INVALID', 'Đến ngày trước từ ngày');
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000002', current_setting('test.e')::uuid, current_date, null, 'unpaid', null, null) $$,
  'P0001', 'EMPLOYEE_NOT_FOUND', 'Không tạm nghỉ nhân viên công ty khác');
insert into public.timesheet_locks (tenant_id, period_start, period_end, snapshot) values ('10000000-0000-4000-8000-000000000001', '2025-02-26', '2025-03-25', '{}');
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, '2025-03-01', '2025-03-10', 'unpaid', null, null) $$,
  'P0001', 'PERIOD_LOCKED', 'Ngày bắt đầu thuộc kỳ công đã khóa');

-- ---------- Bắt đầu từ hôm kia, chưa rõ ngày về ----------
select is(public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_setting('test.today')::date - 2, null, 'maternity', '  Sinh con  ', null)->'cancelled',
  to_jsonb(array[(select request_no from public.requests where id = current_setting('test.lin')::uuid)]), 'Trả về mã đơn nghỉ chờ bị hủy');
select is((select status from public.employees where id = current_setting('test.e')::uuid), 'on_leave', 'Đang trong khoảng → Tạm nghỉ');
select is((select concat_ws('|', reason, note, end_date is null) from public.employee_pauses where employee_id = current_setting('test.e')::uuid), 'maternity|Sinh con|t', 'Lưu lý do, ghi chú đã cắt khoảng trắng');
select is((select status from public.requests where id = current_setting('test.lin')::uuid), 'cancelled', 'Đơn nghỉ chờ trong khoảng tạm nghỉ bị hủy');
select is((select status from public.requests where id = current_setting('test.lbefore')::uuid), 'pending', 'Đơn nghỉ trước khoảng tạm nghỉ vẫn chờ duyệt');
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_date + 30, null, 'unpaid', null, null) $$,
  'P0001', 'PAUSE_STATUS_INVALID', 'Đang tạm nghỉ thì không tạo thêm');

-- ---------- Đi làm lại hôm nay ----------
select is(public.end_employee_pause('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_setting('test.today')::date)->>'status', 'active', 'Đi làm lại hôm nay → Đang làm việc');
select is((select end_date from public.employee_pauses where employee_id = current_setting('test.e')::uuid), current_setting('test.today')::date - 1, 'Ngày tạm nghỉ cuối là hôm qua');
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_date - 1, current_date + 1, 'unpaid', null, null) $$,
  'P0001', 'PAUSE_OVERLAP', 'Không trùng khoảng tạm nghỉ đã có');
select throws_ok($$ select public.end_employee_pause('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_date) $$,
  'P0001', 'PAUSE_NOT_FOUND', 'Không còn khoảng tạm nghỉ nào để kết thúc');

-- ---------- Khoảng sắp tới: quét đổi trạng thái theo ngày ----------
select is(public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_setting('test.today')::date + 10, current_setting('test.today')::date + 20, 'unpaid', null, null)->>'status',
  'active', 'Khoảng chưa tới → vẫn Đang làm việc');
update public.employee_pauses set start_date = current_setting('test.today')::date - 0 where employee_id = current_setting('test.e')::uuid and start_date > current_setting('test.today')::date;
select ok(public.apply_due_pauses() >= 1, 'Quét chuyển người tới ngày tạm nghỉ');
select is((select status || '|' || (select count(*) from public.audit_logs a where a.resource_id = e.id and a.action = 'employee.paused' and a.actor_type = 'system') from public.employees e
  where e.id = current_setting('test.e')::uuid), 'on_leave|1', 'Sau quét: Tạm nghỉ, có audit hệ thống');
update public.employee_pauses set end_date = current_setting('test.today')::date - 1, start_date = current_setting('test.today')::date - 1 where employee_id = current_setting('test.e')::uuid and start_date = current_setting('test.today')::date;
select ok(public.apply_due_pauses() >= 1, 'Quét người qua ngày tạm nghỉ cuối');
select is((select status from public.employees where id = current_setting('test.e')::uuid), 'active', 'Qua ngày tạm nghỉ cuối → quét về Đang làm việc');

-- ---------- Hủy khoảng chưa bắt đầu; chặn khi có đơn đã duyệt ----------
select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_setting('test.today')::date + 40, null, 'other', null, null);
select is(public.end_employee_pause('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_setting('test.today')::date + 40)->>'removed', 'true', 'Đi làm lại từ ngày bắt đầu → hủy khoảng');
select set_config('test.lok', pg_temp.leave(current_setting('test.today')::date + 50)::text, true);
update public.requests set status = 'approved', completed_at = now() where id = current_setting('test.lok')::uuid;
select throws_ok($$ select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_date + 45, current_date + 60, 'unpaid', null, null) $$,
  'P0001', 'PAUSE_LEAVE_APPROVED', 'Có đơn nghỉ đã duyệt trong khoảng → chặn');

-- ---------- Ghi ngày làm việc cuối cắt khoảng tạm nghỉ ----------
select public.pause_employee('10000000-0000-4000-8000-000000000001', current_setting('test.e')::uuid, current_setting('test.today')::date + 70, null, 'unpaid', null, null);
update public.employees set termination_date = current_setting('test.today')::date + 80 where id = current_setting('test.e')::uuid;
select is((select end_date from public.employee_pauses where employee_id = current_setting('test.e')::uuid and start_date = current_setting('test.today')::date + 70),
  current_setting('test.today')::date + 80, 'Khoảng không hạn bị cắt về ngày làm việc cuối');

select * from finish();
rollback;
