-- offboard_employee kiểm "quản trị viên cuối cùng" bằng current_date (ngày UTC) trong khi vai trò ghi effective_from theo ngày công ty:
-- 00:00–07:00 giờ VN, vai trò Tenant Admin cấp hôm nay bị coi là chưa hiệu lực → cho nghỉ được quản trị viên cuối cùng.
-- Định nghĩa lại hàm, chỉ đổi current_date → today (tenant_today); create or replace giữ nguyên quyền execute.

create or replace function public.offboard_employee(p_tenant uuid, p_employee uuid, p_last_day date, p_reason text, p_handover boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  today date := public.tenant_today(p_tenant);
  next_status text;
  r record;
  cancelled text[] := '{}';
begin
  select * into e from public.employees where id = p_employee and tenant_id = p_tenant for update;
  if e.id is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0001'; end if;
  if e.status = 'terminated' then raise exception 'EMPLOYEE_ALREADY_TERMINATED' using errcode = 'P0001'; end if;
  if p_last_day is null or p_last_day < e.hire_date then raise exception 'OFFBOARD_BEFORE_HIRE' using errcode = 'P0001'; end if;
  if p_last_day > today + 366 then raise exception 'OFFBOARD_TOO_FAR' using errcode = 'P0001'; end if;
  if p_reason is null or p_reason not in ('resigned', 'contract_ended', 'dismissed', 'other') then raise exception 'OFFBOARD_REASON_INVALID' using errcode = 'P0001'; end if;
  -- Đổi ngày cuối làm thay đổi các ngày công từ ngày sau ngày cuối (cũ hoặc mới, lấy ngày sớm hơn). Kỳ công chứa ngày đó đã khóa thì không đổi được.
  if public.period_locked(p_tenant, least(p_last_day, coalesce(e.termination_date, p_last_day)) + 1) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;

  -- Membership gắn theo employee_id (mời trước khi kích hoạt) hoặc user_id.
  -- Quản trị viên cuối cùng thì chặn ngay cả khi ngày cuối chưa tới, vì tới ngày đó công ty không còn ai quản trị.
  if exists (select 1 from public.memberships m join public.role_assignments ra on ra.membership_id = m.id join public.roles ro on ro.id = ra.role_id
      where m.tenant_id = p_tenant and (m.employee_id = p_employee or m.user_id = e.user_id) and m.status = 'active'
        and ro.code = 'tenant_admin' and ro.tenant_id is null
        and ra.effective_from <= today and (ra.effective_to is null or ra.effective_to >= today)
        and public.active_tenant_admin_count(p_tenant, m.id) = 0) then
    raise exception 'LAST_TENANT_ADMIN' using errcode = 'P0001';
  end if;

  for r in select q.id, q.request_no from public.requests q
    where q.tenant_id = p_tenant and q.requester_employee_id = p_employee and q.status = 'pending'
      and (q.request_type = 'salary_advance' or (q.request_type = 'leave' and q.work_date > p_last_day))
    order by q.submitted_at for update
  loop
    update public.approval_tasks set status = 'cancelled' where request_id = r.id and status in ('pending', 'waiting');
    -- Trigger leave_request_settle tự trả lại ngày phép đang giữ
    update public.requests set status = 'cancelled', completed_at = now() where id = r.id;
    cancelled := cancelled || r.request_no;
  end loop;

  next_status := case when p_last_day < today then 'terminated' else 'leaving' end;
  update public.employees set status = next_status, termination_date = p_last_day, termination_reason = p_reason,
    termination_handover = coalesce(p_handover, false), termination_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_employee;
  if next_status = 'terminated' then
    update public.memberships set status = 'suspended' where tenant_id = p_tenant and (employee_id = p_employee or user_id = e.user_id) and status in ('active', 'invited');
  end if;
  return jsonb_build_object('status', next_status, 'cancelled', to_jsonb(cancelled));
end;
$$;
