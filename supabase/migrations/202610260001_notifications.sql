-- Thông báo trong app (mobile + web HR): đơn cần duyệt, bước duyệt sắp/đã quá hạn, đơn được duyệt/từ chối, máy được duyệt/từ chối.
-- Tạo bằng trigger ngay trong transaction của thao tác gốc nên không sót đường nào (API, hàm SQL); hạn duyệt do API gọi
-- notify_due_approvals() định kỳ. Người nhận là hồ sơ nhân viên (HR/quản lý trên web cũng là nhân viên của tenant).
-- Chỉ thêm và đánh dấu đã đọc; mỗi sự kiện một dòng cho mỗi người nhận (dedupe_key) nên gọi lại không tạo trùng.
-- Push khi app tắt (APNs/FCM) chưa làm: cần tài khoản trả phí — xem PROGRESS.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  recipient_employee_id uuid not null references public.employees(id) on delete restrict,
  kind text not null check (kind in ('approval.pending', 'approval.due', 'request.approved', 'request.rejected', 'device.approved', 'device.rejected')),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 500),
  link_type text check (link_type in ('request', 'device')),
  link_id uuid,
  link_no text,
  -- Bước duyệt liên quan: thông báo "cần bạn duyệt" hết tác dụng khi bước không còn chờ
  task_id uuid references public.approval_tasks(id) on delete restrict,
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_employee_id, dedupe_key)
);
create index notifications_recipient_idx on public.notifications (recipient_employee_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_employee_id) where read_at is null;

-- Chỉ được đánh dấu đã đọc (một lần), không sửa nội dung, không xóa
create or replace function public.notifications_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'NOTIFICATION_IMMUTABLE' using errcode = 'P0001'; end if;
  if (to_jsonb(new) - 'read_at') <> (to_jsonb(old) - 'read_at') or (old.read_at is not null and new.read_at is distinct from old.read_at) then
    raise exception 'NOTIFICATION_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update or delete on public.notifications for each row execute function public.notifications_guard();

create or replace function public.notify(
  p_tenant uuid, p_recipient uuid, p_kind text, p_title text, p_body text,
  p_link_type text, p_link_id uuid, p_link_no text, p_task uuid, p_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (tenant_id, recipient_employee_id, kind, title, body, link_type, link_id, link_no, task_id, dedupe_key)
  values (p_tenant, p_recipient, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500), p_link_type, p_link_id, p_link_no, p_task, p_key)
  on conflict (recipient_employee_id, dedupe_key) do nothing;
  return found;
end;
$$;

-- "T6 23/10 · quên chấm ra" — nội dung ngắn của đơn để đưa vào thông báo
create or replace function public.request_label(p_request uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(' · ',
    case when r.work_date is not null then (array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from r.work_date)::int] || ' ' || to_char(r.work_date, 'DD/MM') end,
    case v.payload->>'kind' when 'missing_in' then 'quên chấm vào' when 'missing_out' then 'quên chấm ra' when 'late' then 'đến muộn có lý do'
      when 'early' then 'về sớm có lý do' when 'trip' then 'đi công tác' when 'device' then 'lỗi thiết bị/GPS' when 'other' then 'khác' end)
  from public.requests r
  left join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;

-- Người duyệt bước HR: tài khoản đang hoạt động có request.hr_review với người gửi (không gồm người gửi)
create or replace function public.hr_reviewers(p_tenant uuid, p_employee uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct e.id
  from public.memberships m
  join public.employees e on e.id = m.employee_id and e.tenant_id = m.tenant_id
  where m.tenant_id = p_tenant and m.status = 'active' and m.user_id is not null and e.id <> p_employee
    and public.employee_in_scope(m.user_id, p_tenant, 'request.hr_review', p_employee);
$$;

-- Người được giao một bước duyệt (quản lý trực tiếp, hoặc mọi người duyệt HR trong phạm vi)
create or replace function public.task_assignees(p_task uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.assignee_employee_id from public.approval_tasks a
  where a.id = p_task and a.resolver = 'direct_manager' and a.assignee_employee_id is not null
  union
  select h from public.approval_tasks a join public.requests r on r.id = a.request_id, lateral public.hr_reviewers(r.tenant_id, r.requester_employee_id) h
  where a.id = p_task and a.resolver = 'hr';
$$;

-- Bước duyệt tới lượt (đơn mới, hoặc bước trước vừa duyệt) → báo người duyệt
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
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending') then return null; end if;
  select * into r from public.requests where id = new.request_id;
  select full_name into who from public.employees where id = r.requester_employee_id;
  for rec in select public.task_assignees(new.id) loop
    perform public.notify(r.tenant_id, rec, 'approval.pending', 'Đơn ' || r.request_no || ' cần bạn duyệt',
      who || ' · Giải trình công ' || coalesce(public.request_label(r.id), ''), 'request', r.id, r.request_no, new.id, 'pending:' || new.id);
  end loop;
  return null;
end;
$$;
create trigger approval_tasks_notify after insert or update of status on public.approval_tasks
  for each row execute function public.notify_task_pending();

-- Đơn có kết quả → báo người gửi (kèm người duyệt cuối, lý do khi từ chối)
create or replace function public.notify_request_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  note text;
begin
  if new.status not in ('approved', 'rejected') or old.status = new.status then return null; end if;
  select coalesce(e.full_name, 'Người duyệt'), t.comment into actor, note
  from public.approval_tasks t left join public.employees e on e.user_id = t.acted_by and e.tenant_id = t.tenant_id
  where t.request_id = new.id and t.status in ('approved', 'rejected') order by t.step_no desc limit 1;
  if new.status = 'approved' then
    perform public.notify(new.tenant_id, new.requester_employee_id, 'request.approved', 'Đơn ' || new.request_no || ' đã được duyệt',
      'Giải trình công ' || coalesce(public.request_label(new.id), '') || ' · ' || coalesce(actor, 'Người duyệt') || ' duyệt, bảng công đã cập nhật',
      'request', new.id, new.request_no, null, 'done:' || new.id);
  else
    perform public.notify(new.tenant_id, new.requester_employee_id, 'request.rejected', 'Đơn ' || new.request_no || ' bị từ chối',
      coalesce(actor, 'Người duyệt') || ': ' || coalesce(note, '—'), 'request', new.id, new.request_no, null, 'done:' || new.id);
  end if;
  return null;
end;
$$;
create trigger requests_notify after update of status on public.requests
  for each row execute function public.notify_request_done();

-- HR duyệt/từ chối máy mới → báo nhân viên
create or replace function public.notify_device_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'pending' or new.status not in ('active', 'rejected') then return null; end if;
  if new.status = 'active' then
    perform public.notify(new.tenant_id, new.employee_id, 'device.approved', 'Máy đã được duyệt',
      coalesce(new.device_model, 'Điện thoại') || ' dùng được để chấm công từ bây giờ.', 'device', new.id, null, null, 'device:' || new.id || ':active');
  else
    perform public.notify(new.tenant_id, new.employee_id, 'device.rejected', 'Máy không được duyệt',
      coalesce(nullif(new.decision_reason, ''), 'Liên hệ phòng Nhân sự để biết thêm.'), 'device', new.id, null, null, 'device:' || new.id || ':rejected');
  end if;
  return null;
end;
$$;
create trigger employee_devices_notify after update of status on public.employee_devices
  for each row execute function public.notify_device_decided();

-- Bước duyệt sắp hết hạn (trong p_within) hoặc đã quá hạn → nhắc người duyệt, mỗi bước tối đa 2 lần (sắp hạn, quá hạn).
-- API gọi định kỳ; trả về số thông báo mới.
create or replace function public.notify_due_approvals(p_within interval default interval '4 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  rec uuid;
  n integer := 0;
  over boolean;
begin
  for t in
    select a.id, a.due_at, r.id as request_id, r.request_no, r.tenant_id, e.full_name, tn.timezone
    from public.approval_tasks a
    join public.requests r on r.id = a.request_id
    join public.employees e on e.id = r.requester_employee_id
    join public.tenants tn on tn.id = r.tenant_id
    where a.status = 'pending' and r.status = 'pending' and a.due_at is not null and a.due_at <= now() + p_within
  loop
    over := t.due_at <= now();
    for rec in select public.task_assignees(t.id) loop
      if public.notify(t.tenant_id, rec, 'approval.due',
        'Đơn ' || t.request_no || case when over then ' đã quá hạn duyệt' else ' sắp quá hạn duyệt' end,
        'Hạn ' || to_char(t.due_at at time zone t.timezone, 'HH24:MI DD/MM') || ' · ' || t.full_name,
        'request', t.request_id, t.request_no, t.id, 'due:' || t.id || case when over then ':over' else ':soon' end) then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;

revoke all on function public.notify(uuid, uuid, text, text, text, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.request_label(uuid) from public, anon, authenticated;
revoke all on function public.hr_reviewers(uuid, uuid) from public, anon, authenticated;
revoke all on function public.task_assignees(uuid) from public, anon, authenticated;
revoke all on function public.notify_due_approvals(interval) from public, anon, authenticated;
grant execute on function public.notify(uuid, uuid, text, text, text, text, uuid, text, uuid, text) to service_role;
grant execute on function public.request_label(uuid) to service_role;
grant execute on function public.hr_reviewers(uuid, uuid) to service_role;
grant execute on function public.task_assignees(uuid) to service_role;
grant execute on function public.notify_due_approvals(interval) to service_role;

alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications for select to authenticated
  using (recipient_employee_id in (select public.current_employee_ids()));
grant select on public.notifications to authenticated;
grant select, insert, update on public.notifications to service_role;

-- Realtime: web HR nhận tín hiệu có thông báo mới (RLS chỉ gửi cho người nhận) rồi gọi lại API
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
