-- Tạm nghỉ (thai sản, không lương, ốm dài ngày, khác). Lưu từng khoảng để bảng công kỳ cũ vẫn tính đúng sau khi đi làm lại.
-- end_date là ngày tạm nghỉ cuối (vẫn tạm nghỉ ngày đó); null = chưa rõ ngày đi làm lại.
-- Ngày tạm nghỉ: không tính công (vẫn nằm trong công chuẩn nên lương theo công tự giảm), không cần chấm công, không bị nhắc.
-- Phép năm: API tính theo lý do (NĐ 145/2020 Điều 65–66), xem apps/api/src/timesheet/pause.ts.
-- employees.status: on_leave khi hôm nay nằm trong một khoảng tạm nghỉ; apply_due_pauses() (vòng quét 10 phút) đổi qua lại active ↔ on_leave theo ngày.

create table public.employee_pauses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  start_date date not null,
  end_date date,
  reason text not null check (reason in ('maternity', 'unpaid', 'sick_long', 'other')),
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index employee_pauses_employee_idx on public.employee_pauses (employee_id, start_date);

alter table public.employee_pauses enable row level security;
create policy employee_pauses_read on public.employee_pauses for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('employee.read', tenant_id, employee_id));
grant select on public.employee_pauses to authenticated;
grant select, insert, update, delete on public.employee_pauses to service_role;

-- Có khoảng tạm nghỉ khác (trừ p_except) giao với [p_from, p_to] (p_to null = không hạn)
create or replace function public.pause_overlaps(p_employee uuid, p_from date, p_to date, p_except uuid default null)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.employee_pauses x where x.employee_id = p_employee and x.id is distinct from p_except
    and x.start_date <= coalesce(p_to, 'infinity'::date) and coalesce(x.end_date, 'infinity'::date) >= p_from);
$$;

-- API kiểm quyền và phạm vi trước khi gọi. Trả {id, status, cancelled: [mã đơn]}.
create or replace function public.pause_employee(p_tenant uuid, p_employee uuid, p_from date, p_to date, p_reason text, p_note text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  today date := public.tenant_today(p_tenant);
  r record;
  cancelled text[] := '{}';
  pid uuid;
  next_status text;
begin
  select * into e from public.employees where id = p_employee and tenant_id = p_tenant for update;
  if e.id is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0001'; end if;
  -- Sắp nghỉ/đã nghỉ/đình chỉ/đang tạm nghỉ: không chồng thêm trạng thái
  if e.status <> 'active' then raise exception 'PAUSE_STATUS_INVALID' using errcode = 'P0001'; end if;
  if p_reason is null or p_reason not in ('maternity', 'unpaid', 'sick_long', 'other') then raise exception 'PAUSE_REASON_INVALID' using errcode = 'P0001'; end if;
  if p_from is null or (p_to is not null and p_to < p_from) then raise exception 'PAUSE_RANGE_INVALID' using errcode = 'P0001'; end if;
  if p_from < e.hire_date then raise exception 'PAUSE_BEFORE_HIRE' using errcode = 'P0001'; end if;
  if p_from > today + 366 or p_to > today + 3 * 366 then raise exception 'PAUSE_TOO_FAR' using errcode = 'P0001'; end if;
  if public.period_locked(p_tenant, p_from) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;
  if public.pause_overlaps(p_employee, p_from, p_to) then raise exception 'PAUSE_OVERLAP' using errcode = 'P0001'; end if;
  -- Đơn nghỉ đã duyệt đã trừ phép: để HR xử lý trước, không tự hủy (người lao động mất ngày phép đã trừ)
  if exists (select 1 from public.leave_days ld join public.requests q on q.id = ld.request_id
      where ld.employee_id = p_employee and q.status = 'approved' and ld.leave_date between p_from and coalesce(p_to, 'infinity'::date)) then
    raise exception 'PAUSE_LEAVE_APPROVED' using errcode = 'P0001';
  end if;

  -- Đơn nghỉ đang chờ có ngày trong khoảng tạm nghỉ: hủy (ngày đó đã không tính công)
  for r in select q.id, q.request_no from public.requests q
    where q.tenant_id = p_tenant and q.requester_employee_id = p_employee and q.status = 'pending' and q.request_type = 'leave'
      and exists (select 1 from public.leave_days ld where ld.request_id = q.id and ld.leave_date between p_from and coalesce(p_to, 'infinity'::date))
    order by q.submitted_at for update
  loop
    update public.approval_tasks set status = 'cancelled' where request_id = r.id and status in ('pending', 'waiting');
    -- Trigger leave_request_settle tự trả lại ngày phép đang giữ
    update public.requests set status = 'cancelled', completed_at = now() where id = r.id;
    cancelled := cancelled || r.request_no;
  end loop;

  insert into public.employee_pauses (tenant_id, employee_id, start_date, end_date, reason, note, created_by)
  values (p_tenant, p_employee, p_from, p_to, p_reason, nullif(btrim(coalesce(p_note, '')), ''), p_user)
  returning id into pid;
  next_status := case when p_from <= today and (p_to is null or p_to >= today) then 'on_leave' else 'active' end;
  if next_status <> e.status then update public.employees set status = next_status where id = p_employee; end if;
  return jsonb_build_object('id', pid, 'status', next_status, 'cancelled', to_jsonb(cancelled));
end;
$$;

-- Đặt ngày đi làm lại cho khoảng tạm nghỉ đang diễn ra hoặc sắp tới (gần nhất). Đi làm lại từ ngày bắt đầu trở về trước = hủy khoảng đó.
-- Trả {status, removed}.
create or replace function public.end_employee_pause(p_tenant uuid, p_employee uuid, p_return date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  p public.employee_pauses;
  today date := public.tenant_today(p_tenant);
  new_end date := p_return - 1;
  next_status text;
begin
  select * into e from public.employees where id = p_employee and tenant_id = p_tenant for update;
  if e.id is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into p from public.employee_pauses where employee_id = p_employee and tenant_id = p_tenant and (end_date is null or end_date >= today)
    order by start_date limit 1 for update;
  if p.id is null then raise exception 'PAUSE_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_return is null then raise exception 'PAUSE_RANGE_INVALID' using errcode = 'P0001'; end if;
  if p_return > today + 3 * 366 then raise exception 'PAUSE_TOO_FAR' using errcode = 'P0001'; end if;
  if e.termination_date is not null and new_end > e.termination_date then raise exception 'PAUSE_AFTER_TERMINATION' using errcode = 'P0001'; end if;
  -- Đổi ngày cuối làm thay đổi công từ ngày sau ngày cuối cũ/mới (lấy ngày sớm hơn); hủy thì từ ngày bắt đầu
  if public.period_locked(p_tenant, case when new_end < p.start_date then p.start_date else least(coalesce(p.end_date, new_end), new_end) + 1 end) then
    raise exception 'PERIOD_LOCKED' using errcode = 'P0001';
  end if;

  if new_end < p.start_date then
    delete from public.employee_pauses where id = p.id;
  else
    if public.pause_overlaps(p_employee, p.start_date, new_end, p.id) then raise exception 'PAUSE_OVERLAP' using errcode = 'P0001'; end if;
    update public.employee_pauses set end_date = new_end where id = p.id;
  end if;
  next_status := e.status;
  if e.status in ('active', 'on_leave') then
    next_status := case when exists (select 1 from public.employee_pauses x where x.employee_id = p_employee and x.start_date <= today and coalesce(x.end_date, 'infinity'::date) >= today)
      then 'on_leave' else 'active' end;
    if next_status <> e.status then update public.employees set status = next_status where id = p_employee; end if;
  end if;
  return jsonb_build_object('status', next_status, 'removed', new_end < p.start_date);
end;
$$;

-- Quét định kỳ (API, 10 phút): active ↔ on_leave theo khoảng tạm nghỉ của hôm nay. Không đụng sắp nghỉ/đã nghỉ/đình chỉ.
create or replace function public.apply_due_pauses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  n integer := 0;
begin
  for e in select x.id, x.tenant_id, x.status, exists (select 1 from public.employee_pauses p where p.employee_id = x.id
        and p.start_date <= public.tenant_today(x.tenant_id) and coalesce(p.end_date, 'infinity'::date) >= public.tenant_today(x.tenant_id)) as paused
    from public.employees x where x.status in ('active', 'on_leave')
      and (x.status = 'on_leave' or exists (select 1 from public.employee_pauses p where p.employee_id = x.id))
  loop
    if e.paused = (e.status = 'on_leave') then continue; end if;
    update public.employees set status = case when e.paused then 'on_leave' else 'active' end where id = e.id and status = e.status;
    insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_data, after_data, reason, correlation_id)
    values (e.tenant_id, 'system', case when e.paused then 'employee.paused' else 'employee.resumed' end, 'employee', e.id,
      jsonb_build_object('status', e.status), jsonb_build_object('status', case when e.paused then 'on_leave' else 'active' end),
      case when e.paused then 'Tới ngày bắt đầu tạm nghỉ' else 'Qua ngày tạm nghỉ cuối' end, 'apply_due_pauses');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Ghi ngày làm việc cuối (cho nghỉ việc, nhập file): cắt khoảng tạm nghỉ về ngày cuối, bỏ khoảng bắt đầu sau ngày cuối
create or replace function public.employee_pauses_clip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.employee_pauses where employee_id = new.id and start_date > new.termination_date;
  update public.employee_pauses set end_date = new.termination_date
  where employee_id = new.id and coalesce(end_date, 'infinity'::date) > new.termination_date;
  return new;
end;
$$;
create trigger employee_pauses_clip after insert or update of termination_date on public.employees
  for each row when (new.termination_date is not null and coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.employee_pauses_clip();

revoke all on function public.pause_overlaps(uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.pause_employee(uuid, uuid, date, date, text, text, uuid) from public, anon, authenticated;
revoke all on function public.end_employee_pause(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.apply_due_pauses() from public, anon, authenticated;
revoke all on function public.employee_pauses_clip() from public, anon, authenticated;
grant execute on function public.pause_overlaps(uuid, date, date, uuid) to service_role;
grant execute on function public.pause_employee(uuid, uuid, date, date, text, text, uuid) to service_role;
grant execute on function public.end_employee_pause(uuid, uuid, date) to service_role;
grant execute on function public.apply_due_pauses() to service_role;
