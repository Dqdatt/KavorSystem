-- Duyệt bấm 2 lần bỏ qua bước sau: bản cũ đọc bước duyệt TRƯỚC khi khóa đơn, nên lần gọi thứ hai (chờ khóa) vẫn giữ bản "pending" cũ,
-- duyệt tiếp và — vì bước 2 đã thành pending, không còn "waiting" — kết thúc đơn thành approved (tạm ứng > 5 triệu bỏ qua HR/Kế toán).
-- Sửa: khóa đơn trước, rồi mới đọc (và khóa) bước duyệt; mọi chỗ đổi bước duyệt đều khóa đơn trước nên không tạo deadlock.
create or replace function public.decide_approval(p_task uuid, p_actor uuid, p_approve boolean, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.approval_tasks;
  r public.requests;
  nxt public.approval_tasks;
  v public.request_versions;
begin
  select * into r from public.requests where id = (select request_id from public.approval_tasks where id = p_task) for update;
  if r.id is null then raise exception 'TASK_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into t from public.approval_tasks where id = p_task for update;
  if r.status <> 'pending' or t.status <> 'pending' then raise exception 'TASK_NOT_PENDING' using errcode = 'P0001'; end if;
  if r.work_date is not null and public.period_locked(r.tenant_id, r.work_date) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;

  update public.approval_tasks set status = case when p_approve then 'approved' else 'rejected' end, acted_by = p_actor, acted_at = now(), comment = p_comment where id = t.id;
  if not p_approve then
    update public.approval_tasks set status = 'cancelled' where request_id = r.id and status = 'waiting';
    update public.requests set status = 'rejected', completed_at = now() where id = r.id;
    return 'rejected';
  end if;

  select * into nxt from public.approval_tasks where request_id = r.id and status = 'waiting' order by step_no limit 1;
  if nxt.id is not null then
    update public.approval_tasks set status = 'pending',
      due_at = now() + make_interval(hours => coalesce((select (s->>'slaHours')::int from public.workflow_versions w, jsonb_array_elements(w.steps) with ordinality e(s, n) where w.id = r.workflow_version_id and n = nxt.step_no), 24))
    where id = nxt.id;
    return 'next';
  end if;

  update public.requests set status = 'approved', completed_at = now() where id = r.id;
  if r.request_type = 'explanation' then
    select * into v from public.request_versions where request_id = r.id and version_no = r.current_version;
    insert into public.attendance_adjustments (tenant_id, employee_id, work_date, request_id, clock_in, clock_out, reason, approved_by)
    values (r.tenant_id, r.requester_employee_id, r.work_date, r.id, (v.payload->>'clockIn')::time, (v.payload->>'clockOut')::time,
      coalesce(v.payload->>'reason', 'Giải trình'), p_actor);
  end if;
  return 'approved';
end;
$$;
