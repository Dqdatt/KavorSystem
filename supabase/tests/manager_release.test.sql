-- Bước "Quản lý trực tiếp" đi theo quản lý hiện tại: quản lý nghỉ việc → cấp dưới để trống quản lý, đơn chờ bỏ bước đó sang bước kế
-- (không còn bước → thêm bước Phòng Nhân sự); HR đổi quản lý → đơn chờ chuyển sang quản lý mới và báo người mới.
-- Seed: Hà (…142) do HDG0003 (…003) quản lý; Linh (…005) do …001 quản lý. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select set_config('test.today', public.tenant_today('10000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.wvl', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), true);
select set_config('test.al', (select id::text from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'AL'), true);

create function pg_temp.leave(emp text, mgr text, plus int, hr boolean) returns text language sql as $$
  select (public.create_leave_request('10000000-0000-4000-8000-000000000001', emp::uuid, null, current_setting('test.wvl')::uuid,
    current_setting('test.today')::date, current_setting('test.al')::uuid, '{"leaveType":"AL","days":1}', '{}',
    jsonb_build_array(jsonb_build_object('stepNo', 1, 'resolver', 'direct_manager', 'assigneeEmployeeId', mgr, 'status', 'pending', 'slaHours', 24))
      || case when hr then '[{"stepNo":2,"resolver":"hr","status":"waiting","slaHours":24}]'::jsonb else '[]'::jsonb end,
    jsonb_build_array(jsonb_build_object('date', current_setting('test.today')::date + plus, 'half', 'full', 'portion', 1)), null, 1)->>'id');
$$;
create function pg_temp.steps(req text) returns text language sql as $$
  select string_agg(t.resolver || ':' || t.status || coalesce(':' || right(t.assignee_employee_id::text, 3), ''), ' ' order by t.step_no)
  from public.approval_tasks t where t.request_id = req::uuid;
$$;

select set_config('test.a', pg_temp.leave('60000000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000003', 20, true), true);
select set_config('test.b', pg_temp.leave('60000000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000003', 22, false), true);
select set_config('test.c', pg_temp.leave('60000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000001', 24, true), true);

-- ---------- Quản lý nghỉ việc ----------
select public.offboard_employee('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', current_setting('test.today')::date - 1, 'resigned', false, null);
select is((select manager_employee_id::text from public.employee_assignments where employee_id = '60000000-0000-4000-8000-000000000142' and is_primary
  and effective_from <= current_setting('test.today')::date and (effective_to is null or effective_to >= current_setting('test.today')::date)),
  null, 'Cấp dưới của người nghỉ để trống quản lý trực tiếp từ hôm nay');
select is((select count(*)::int from public.employee_assignments where employee_id = '60000000-0000-4000-8000-000000000142'
  and manager_employee_id = '60000000-0000-4000-8000-000000000003' and effective_to = current_setting('test.today')::date - 1), 1, 'Giữ lịch sử: dòng cũ có quản lý kết thúc hôm qua');
select is(pg_temp.steps(current_setting('test.a')), 'direct_manager:skipped:003 hr:pending', 'Đơn chờ người nghỉ duyệt → bỏ bước, sang Phòng Nhân sự');
select ok((select due_at is not null from public.approval_tasks where request_id = current_setting('test.a')::uuid and step_no = 2), 'Bước Phòng Nhân sự có hạn duyệt');
select is(pg_temp.steps(current_setting('test.b')), 'direct_manager:skipped:003 hr:pending', 'Đơn chỉ có bước quản lý → thêm bước Phòng Nhân sự');
select is((select count(*)::int from public.audit_logs where resource_id = current_setting('test.a')::uuid and action = 'request.approver_changed'), 1, 'Ghi nhật ký đổi người duyệt');

-- ---------- HR đổi quản lý (đóng dòng cũ rồi chèn dòng mới như save_employee; trigger chạy lúc commit) ----------
update public.employee_assignments set effective_to = current_setting('test.today')::date - 1
where employee_id = '60000000-0000-4000-8000-000000000005' and is_primary and effective_to is null;
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from)
select tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, '60000000-0000-4000-8000-000000000007', current_setting('test.today')::date
from public.employee_assignments where employee_id = '60000000-0000-4000-8000-000000000005' and effective_to = current_setting('test.today')::date - 1;
set constraints public.employee_assignments_reroute immediate;
select is(pg_temp.steps(current_setting('test.c')), 'direct_manager:pending:007 hr:waiting', 'Đổi quản lý → đơn chờ chuyển sang quản lý mới');
select is((select count(*)::int from public.notifications n join public.approval_tasks t on n.dedupe_key = 'pending:' || t.id
  where t.request_id = current_setting('test.c')::uuid and t.step_no = 1 and n.recipient_employee_id = '60000000-0000-4000-8000-000000000007'), 1, 'Báo quản lý mới có đơn cần duyệt');
select public.reroute_manager_tasks('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.audit_logs where resource_id = current_setting('test.c')::uuid and action = 'request.approver_changed'), 1, 'Chạy lại không đổi gì thêm');

-- ---------- Đổi trạng thái kiểu cũ (không qua "Cho nghỉ việc") cũng xử lý ----------
update public.employees set status = 'terminated' where id = '60000000-0000-4000-8000-000000000007';
select is(pg_temp.steps(current_setting('test.c')), 'direct_manager:skipped:007 hr:pending', 'Quản lý mới nghỉ → đơn sang Phòng Nhân sự');

select * from finish();
rollback;
