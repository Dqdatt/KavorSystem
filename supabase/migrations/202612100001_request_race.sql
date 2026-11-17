-- Race tạo dữ liệu: hai request cùng lúc của một nhân viên đều qua kiểm tra ở API (đọc rồi mới ghi, không khóa) → đơn nghỉ trùng ngày
-- hoặc vượt số dư, giải trình vượt hạn mức kỳ, OT vượt giới hạn ngày/tháng/năm, chấm công vào (ra) 2 lần với clientEventId khác nhau.
-- Sửa: tạo đơn của một nhân viên chạy nối tiếp (khóa advisory tới hết giao dịch) rồi kiểm lại trong SQL; chấm công khóa theo
-- nhân viên + loại + ngày. Sau khóa, câu lệnh mới thấy dữ liệu lần trước đã commit (READ COMMITTED) nên trigger trùng ngày/giờ có hiệu lực.

create or replace function public.lock_employee_requests(p_employee uuid)
returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('kavor.requests:' || p_employee::text, 0));
$$;
revoke all on function public.lock_employee_requests(uuid) from public, anon, authenticated;
grant execute on function public.lock_employee_requests(uuid) to service_role;

-- Tạo đơn (mọi loại) khóa theo người gửi; giải trình kiểm lại hạn mức của kỳ (đơn đang chờ + đã duyệt, kể cả đơn này)
create or replace function public.create_request(
  p_tenant uuid, p_prefix text, p_type text, p_employee uuid, p_user uuid, p_workflow_version uuid,
  p_work_date date, p_period_start date, p_payload jsonb, p_snapshot jsonb, p_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  no text;
  t jsonb;
begin
  perform public.lock_employee_requests(p_employee);
  no := public.next_request_no(p_tenant, p_prefix);
  insert into public.requests (tenant_id, request_no, request_type, requester_employee_id, requester_user_id, workflow_version_id, work_date, period_start)
  values (p_tenant, no, p_type, p_employee, p_user, p_workflow_version, p_work_date, p_period_start) returning id into rid;
  if p_type = 'explanation' and p_snapshot #>> '{explanation,config,monthlyLimit}' is not null
      and (select count(*) from public.requests where tenant_id = p_tenant and requester_employee_id = p_employee
        and request_type = 'explanation' and period_start = p_period_start and status in ('pending','approved'))
      > (p_snapshot #>> '{explanation,config,monthlyLimit}')::numeric then
    raise exception 'EXPLANATION_QUOTA' using errcode = 'P0001';
  end if;
  insert into public.request_versions (tenant_id, request_id, version_no, payload, policy_snapshot, created_by) values (p_tenant, rid, 1, p_payload, p_snapshot, p_user);
  for t in select value from jsonb_array_elements(p_tasks) loop
    insert into public.approval_tasks (tenant_id, request_id, step_no, resolver, assignee_employee_id, status, due_at)
    values (p_tenant, rid, (t->>'stepNo')::int, t->>'resolver', nullif(t->>'assigneeEmployeeId', '')::uuid, t->>'status',
      case when t->>'status' = 'pending' then now() + make_interval(hours => coalesce((t->>'slaHours')::int, 24)) end);
  end loop;
  if not exists (select 1 from public.approval_tasks where request_id = rid and status = 'pending') then
    raise exception 'NO_ACTIVE_STEP' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', rid, 'no', no);
end;
$$;

-- Đơn nghỉ: sau khóa, số dư sổ phép phải đúng bằng số API đã dùng để quyết định (vượt số dư, thêm bước HR khi phép âm)
create or replace function public.create_leave_request(
  p_tenant uuid, p_employee uuid, p_user uuid, p_workflow_version uuid, p_period_start date, p_leave_type uuid,
  p_payload jsonb, p_snapshot jsonb, p_tasks jsonb, p_days jsonb, p_account uuid, p_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  rid uuid;
  first_day date;
begin
  select min((x->>'date')::date) into first_day from jsonb_array_elements(p_days) x;
  if first_day is null then raise exception 'NO_LEAVE_DAYS' using errcode = 'P0001'; end if;
  r := public.create_request(p_tenant, 'NP', 'leave', p_employee, p_user, p_workflow_version, first_day, p_period_start, p_payload, p_snapshot, p_tasks);
  rid := (r->>'id')::uuid;
  if p_account is not null and p_snapshot #>> '{balance,available}' is not null
      and (select coalesce(sum(amount), 0) from public.leave_transactions where account_id = p_account) <> (p_snapshot #>> '{balance,available}')::numeric then
    raise exception 'LEAVE_BALANCE_CHANGED' using errcode = 'P0001';
  end if;
  insert into public.leave_days (tenant_id, employee_id, request_id, leave_type_id, leave_date, half, portion)
  select p_tenant, p_employee, rid, p_leave_type, (x->>'date')::date, x->>'half', (x->>'portion')::numeric from jsonb_array_elements(p_days) x;
  if p_account is not null then
    insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, request_id, source_key, reason, created_by)
    values (p_tenant, p_account, 'hold', -p_total, first_day, rid, 'hold:' || rid, 'Giữ chỗ cho đơn ' || (r->>'no'), p_user);
  end if;
  return r;
end;
$$;

-- OT: sau khóa, kiểm lại giới hạn ngày/tháng/năm (phút, đơn đang chờ + đã duyệt) theo mức API ghi trong p_snapshot.limits
create or replace function public.create_overtime_request(
  p_tenant uuid, p_employee uuid, p_user uuid, p_workflow_version uuid, p_period_start date,
  p_payload jsonb, p_snapshot jsonb, p_tasks jsonb, p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  d date := (p_entry->>'date')::date;
  m int := (p_entry->>'minutes')::int;
  dm int; mm int; ym int;
begin
  r := public.create_request(p_tenant, 'OT', 'overtime', p_employee, p_user, p_workflow_version, d, p_period_start, p_payload, p_snapshot, p_tasks);
  if p_snapshot ? 'limits' then
    select coalesce(sum(o.minutes) filter (where o.work_date = d), 0),
      coalesce(sum(o.minutes) filter (where date_trunc('month', o.work_date) = date_trunc('month', d)), 0), coalesce(sum(o.minutes), 0)
    into dm, mm, ym
    from public.overtime_entries o join public.requests q on q.id = o.request_id
    where o.tenant_id = p_tenant and o.employee_id = p_employee and q.status in ('pending','approved')
      and o.work_date between date_trunc('year', d)::date and (date_trunc('year', d) + interval '1 year - 1 day')::date;
    if dm + m > (p_snapshot->'limits'->>'dayMinutes')::int or mm + m > (p_snapshot->'limits'->>'monthMinutes')::int
        or ym + m > (p_snapshot->'limits'->>'yearMinutes')::int then
      raise exception 'OVERTIME_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  insert into public.overtime_entries (tenant_id, employee_id, request_id, work_date, start_time, end_time, minutes, day_kind, rate_percent)
  values (p_tenant, p_employee, (r->>'id')::uuid, d, (p_entry->>'start')::time, (p_entry->>'end')::time, m, p_entry->>'dayKind', (p_entry->>'ratePercent')::int);
  return r;
end;
$$;

-- Chấm công: mỗi ngày (giờ công ty) một lượt vào và một lượt ra hợp lệ. Gửi lại cùng clientEventId để unique xử lý (API trả bản đã có).
create or replace function public.attendance_events_once_per_day()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tz text := coalesce((select timezone from public.tenants where id = new.tenant_id), 'Asia/Ho_Chi_Minh');
  d date := (new.occurred_at at time zone tz)::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('kavor.attendance:' || new.employee_id::text || ':' || new.kind || ':' || d::text, 0));
  if exists (select 1 from public.attendance_events e where e.tenant_id = new.tenant_id and e.employee_id = new.employee_id and e.kind = new.kind
      and e.status = 'accepted' and e.client_event_id <> new.client_event_id
      and e.occurred_at >= (d::timestamp at time zone tz) and e.occurred_at < ((d + 1)::timestamp at time zone tz)) then
    raise exception 'ATT_DUPLICATE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger attendance_events_once_per_day before insert on public.attendance_events
  for each row when (new.status = 'accepted' and coalesce(current_setting('kavor.purge_tenant', true), '') = '')
  execute function public.attendance_events_once_per_day();
