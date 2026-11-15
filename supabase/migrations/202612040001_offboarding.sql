-- Cho nghỉ việc. termination_date là ngày làm việc cuối và vẫn tính ngày đó, giống cách chấm công/lương/phép đang dùng.
-- Ngày cuối đã qua: hồ sơ chuyển terminated và khóa tài khoản ngay.
-- Ngày cuối chưa tới: hồ sơ chuyển leaving (Sắp nghỉ); apply_due_terminations() (API gọi định kỳ) chuyển terminated khi qua ngày cuối.
-- Lý do khóa membership: RLS (is_active_member) chỉ kiểm membership, nên terminated mà membership còn active thì token còn hạn vẫn đọc được dữ liệu.
-- Hủy đơn tạm ứng đang chờ và đơn nghỉ phép đang chờ bắt đầu sau ngày cuối. Đơn nghỉ/giải trình/tăng ca trong thời gian còn làm vẫn để người duyệt xử lý
-- (hủy thì người nghỉ mất công của những ngày đó).

alter table public.employees
  add column termination_reason text check (termination_reason in ('resigned', 'contract_ended', 'dismissed', 'other')),
  add column termination_handover boolean,
  add column termination_note text check (char_length(termination_note) <= 500);

-- API kiểm quyền và phạm vi trước khi gọi. Trả {status, cancelled: [mã đơn]}.
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
        and ra.effective_from <= current_date and (ra.effective_to is null or ra.effective_to >= current_date)
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

-- Quét định kỳ (API, 10 phút). Xử lý hai trường hợp:
--   1. Sắp nghỉ đã qua ngày cuối → chuyển terminated.
--   2. Đã nghỉ mà tài khoản chưa khóa (dữ liệu cũ đổi trạng thái trực tiếp, nhập file) → khóa tài khoản.
-- Mỗi hồ sơ chạy trong khối riêng: một người lỗi (vd. quản trị viên cuối) thì bỏ qua người đó, lần quét sau thử lại, không chặn người khác.
create or replace function public.apply_due_terminations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  n integer := 0;
begin
  for e in select x.id, x.tenant_id, x.user_id, x.status from public.employees x
    where (x.status = 'leaving' and x.termination_date < public.tenant_today(x.tenant_id))
       or (x.status = 'terminated' and exists (select 1 from public.memberships m where m.tenant_id = x.tenant_id and (m.employee_id = x.id or m.user_id = x.user_id) and m.status in ('active', 'invited')))
  loop
    begin
      if e.status = 'leaving' then
        update public.employees set status = 'terminated' where id = e.id and status = 'leaving';
      end if;
      update public.memberships set status = 'suspended' where tenant_id = e.tenant_id and (employee_id = e.id or user_id = e.user_id) and status in ('active', 'invited');
      insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_data, after_data, reason, correlation_id)
      values (e.tenant_id, 'system', case when e.status = 'leaving' then 'employee.terminated' else 'account.locked' end, 'employee', e.id,
        jsonb_build_object('status', e.status), jsonb_build_object('status', 'terminated', 'membership_status', 'suspended'),
        case when e.status = 'leaving' then 'Qua ngày làm việc cuối' else 'Hồ sơ đã nghỉ việc nhưng tài khoản chưa khóa' end, 'apply_due_terminations');
      n := n + 1;
    exception when others then
      raise warning 'apply_due_terminations %: %', e.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.offboard_employee(uuid, uuid, date, text, boolean, text) from public, anon, authenticated;
revoke all on function public.apply_due_terminations() from public, anon, authenticated;
grant execute on function public.offboard_employee(uuid, uuid, date, text, boolean, text) to service_role;
grant execute on function public.apply_due_terminations() to service_role;
