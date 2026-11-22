-- Đơn chờ "Quản lý trực tiếp" luôn đi theo quản lý HIỆN TẠI của người gửi.
-- Trước đây bước này giữ người được giao lúc gửi đơn: quản lý nghỉ việc (không còn tài khoản) hoặc HR đổi quản lý thì đơn kẹt, không ai duyệt được.
-- Quy tắc (người dùng chọn 22/11/2026): quản lý chuyển "Đã nghỉ" → nhân viên dưới quyền để trống quản lý trực tiếp;
-- bước quản lý trực tiếp của đơn đang chờ thành "Bỏ qua", đơn sang bước kế (không còn bước nào → Phòng Nhân sự, như khi gửi đơn lúc không có quản lý).

-- 1. Bước đang chờ đổi người duyệt cũng báo người mới (trước chỉ báo khi bước chuyển sang pending)
create or replace function public.notify_task_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  who text;
  rec uuid;
begin
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending' and old.assignee_employee_id is not distinct from new.assignee_employee_id) then return null; end if;
  select * into r from public.requests where id = new.request_id;
  select full_name into who from public.employees where id = r.requester_employee_id;
  for rec in select public.task_assignees(new.id) loop
    perform public.notify(r.tenant_id, rec, 'approval.pending',
      who || case r.request_type
        when 'leave' then ' xin nghỉ phép'
        when 'overtime' then ' xin làm thêm giờ'
        when 'explanation' then ' gửi giải trình công'
        when 'salary_advance' then ' xin tạm ứng lương'
        when 'profile_change' then ' xin sửa hồ sơ'
        else ' gửi đơn' end,
      concat_ws('. ', nullif(public.notify_request_brief(r.id), ''), 'Chờ bạn duyệt đơn ' || r.request_no) || '.',
      'request', r.id, r.request_no, new.id, 'pending:' || new.id);
  end loop;
  return null;
end;
$$;
drop trigger approval_tasks_notify on public.approval_tasks;
create trigger approval_tasks_notify after insert or update of status, assignee_employee_id on public.approval_tasks
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.notify_task_pending();

-- 2. Đưa bước quản lý trực tiếp của các đơn đang chờ của một nhân viên về quản lý hiện tại (hôm nay, còn làm việc)
create or replace function public.reroute_manager_tasks(p_tenant uuid, p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.tenant_today(p_tenant);
  mgr uuid;
  tid uuid;
  t public.approval_tasks;
  r public.requests;
  nxt public.approval_tasks;
begin
  select a.manager_employee_id into mgr from public.employee_assignments a
  where a.tenant_id = p_tenant and a.employee_id = p_employee and a.is_primary
    and a.effective_from <= today and (a.effective_to is null or a.effective_to >= today)
  order by a.effective_from desc limit 1;
  if mgr = p_employee or not exists (select 1 from public.employees where id = mgr and tenant_id = p_tenant and status <> 'terminated') then mgr := null; end if;

  for tid in select at.id from public.approval_tasks at join public.requests rq on rq.id = at.request_id
    where rq.tenant_id = p_tenant and rq.requester_employee_id = p_employee and rq.status = 'pending'
      and at.resolver = 'direct_manager' and at.status in ('pending', 'waiting') and at.assignee_employee_id is distinct from mgr
  loop
    -- Khóa đơn trước (cùng thứ tự decide_approval) rồi đọc lại bước: có thể vừa được duyệt
    select * into r from public.requests where id = (select request_id from public.approval_tasks where id = tid) for update;
    select * into t from public.approval_tasks where id = tid for update;
    if r.status <> 'pending' or t.status not in ('pending', 'waiting') or t.assignee_employee_id is not distinct from mgr then continue; end if;

    if mgr is not null then
      update public.approval_tasks set assignee_employee_id = mgr where id = t.id;
    else
      update public.approval_tasks set status = 'skipped' where id = t.id;
      if t.status = 'pending' then
        select * into nxt from public.approval_tasks where request_id = r.id and status = 'waiting' order by step_no limit 1;
        if nxt.id is not null then
          update public.approval_tasks set status = 'pending',
            due_at = now() + make_interval(hours => coalesce((select (s->>'slaHours')::int from public.workflow_versions w, jsonb_array_elements(w.steps) with ordinality e(s, n) where w.id = r.workflow_version_id and n = nxt.step_no), 24))
          where id = nxt.id;
        else
          insert into public.approval_tasks (tenant_id, request_id, step_no, resolver, status, due_at)
          values (r.tenant_id, r.id, (select max(step_no) + 1 from public.approval_tasks where request_id = r.id), 'hr', 'pending', now() + interval '24 hours');
        end if;
      end if;
    end if;
    insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_data, after_data, reason, correlation_id)
    values (r.tenant_id, 'system', 'request.approver_changed', 'request', r.id,
      jsonb_build_object('step_no', t.step_no, 'status', t.status, 'assignee_employee_id', t.assignee_employee_id),
      jsonb_build_object('step_no', t.step_no, 'status', case when mgr is null then 'skipped' else t.status end, 'assignee_employee_id', mgr),
      case when mgr is null then 'Người gửi không còn quản lý trực tiếp' else 'Đổi quản lý trực tiếp' end, 'reroute_manager_tasks');
  end loop;
end;
$$;

-- Mọi đường đổi phân công (sửa hồ sơ, áp sơ đồ tổ chức, nhập file) đều qua đây.
-- Chạy lúc commit: save_employee đóng dòng cũ rồi mới chèn dòng mới, chạy ngay giữa hai lệnh sẽ tưởng không có quản lý.
-- shortcut: phân công hiệu lực từ ngày tương lai không chuyển đơn khi tới ngày, cần job quét hằng ngày nếu HR hay đổi quản lý trước ngày hiệu lực.
create or replace function public.employee_assignments_reroute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reroute_manager_tasks(new.tenant_id, new.employee_id);
  return null;
end;
$$;
create constraint trigger employee_assignments_reroute after insert or update of manager_employee_id, effective_from, effective_to on public.employee_assignments
  deferrable initially deferred for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.employee_assignments_reroute();

-- 3. Người nghỉ việc không còn làm quản lý trực tiếp của ai: để trống từ hôm nay (giữ lịch sử trước đó),
-- đơn đang chờ người này duyệt chuyển theo quản lý hiện tại của người gửi
create or replace function public.release_reports(p_tenant uuid, p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.tenant_today(p_tenant);
  cur public.employee_assignments;
  req uuid;
begin
  for cur in select * from public.employee_assignments
    where tenant_id = p_tenant and manager_employee_id = p_employee and (effective_to is null or effective_to >= today) for update
  loop
    if cur.effective_from >= today then
      update public.employee_assignments set manager_employee_id = null where id = cur.id;
    else
      update public.employee_assignments set effective_to = today - 1 where id = cur.id;
      insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, is_primary, effective_from, effective_to)
      values (cur.tenant_id, cur.employee_id, cur.legal_entity_id, cur.branch_id, cur.department_id, cur.position_id, null, cur.is_primary, today, cur.effective_to);
    end if;
  end loop;
  for req in select distinct rq.requester_employee_id from public.approval_tasks at join public.requests rq on rq.id = at.request_id
    where at.tenant_id = p_tenant and at.assignee_employee_id = p_employee and at.status in ('pending', 'waiting') and rq.status = 'pending'
  loop
    perform public.reroute_manager_tasks(p_tenant, req);
  end loop;
end;
$$;

-- Bắt mọi đường chuyển "Đã nghỉ": cho nghỉ ngay, quét qua ngày cuối, sửa trạng thái kiểu cũ
create or replace function public.employees_release_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.release_reports(new.tenant_id, new.id);
  return null;
end;
$$;
create trigger employees_release_reports after update of status on public.employees
  for each row when (new.status = 'terminated' and old.status is distinct from 'terminated' and coalesce(current_setting('kavor.purge_tenant', true), '') = '')
  execute function public.employees_release_reports();

revoke all on function public.reroute_manager_tasks(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_reports(uuid, uuid) from public, anon, authenticated;
revoke all on function public.employee_assignments_reroute() from public, anon, authenticated;
revoke all on function public.employees_release_reports() from public, anon, authenticated;
grant execute on function public.reroute_manager_tasks(uuid, uuid) to service_role;
grant execute on function public.release_reports(uuid, uuid) to service_role;

-- 4. Dọn dữ liệu cũ: người đã nghỉ (kể cả sửa trạng thái trước khi có "Cho nghỉ việc") còn người báo cáo hoặc còn đơn chờ duyệt
do $$
declare e record;
begin
  for e in select m.tenant_id, m.id from public.employees m
    where m.status = 'terminated' and (
      exists (select 1 from public.employee_assignments a where a.manager_employee_id = m.id and (a.effective_to is null or a.effective_to >= public.tenant_today(m.tenant_id)))
      or exists (select 1 from public.approval_tasks t join public.requests r on r.id = t.request_id
        where t.assignee_employee_id = m.id and t.status in ('pending', 'waiting') and r.status = 'pending'))
  loop
    perform public.release_reports(e.tenant_id, e.id);
  end loop;
end;
$$;
