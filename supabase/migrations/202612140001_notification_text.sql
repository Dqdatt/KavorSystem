-- Viết lại chữ thông báo (đơn từ + bản tin) cho dễ đọc trên màn hình khóa iPhone (Web Push) và không lộ số tiền tạm ứng.
-- Chỉ đổi chữ (title/body); giữ nguyên logic, điều kiện, kind, link và khóa chống trùng.

create or replace function public.request_type_noun(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'leave' then 'nghỉ phép'
    when 'overtime' then 'làm thêm giờ'
    when 'explanation' then 'giải trình công'
    when 'salary_advance' then 'tạm ứng lương'
    when 'profile_change' then 'sửa hồ sơ'
    else null
  end;
$$;

-- Như request_label nhưng không đưa số tiền tạm ứng lên màn hình khóa
create or replace function public.notify_request_brief(p_request uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.request_type = 'salary_advance' then
      'Trừ vào lương ' || to_char((v.payload->>'month' || '-01')::date, 'MM/YYYY')
    else public.request_label(p_request)
  end
  from public.requests r
  left join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;

create or replace function public.announcement_teaser(p_announcement uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when clean = '' then a.author_label || ' đăng ' ||
      case a.category when 'notice' then 'thông báo' when 'policy' then 'chính sách' else 'sự kiện' end || ' mới'
    when length(clean) > 120 then a.author_label || ': ' || rtrim(left(clean, 120)) || '…'
    else a.author_label || ': ' || clean
  end
  from (
    select author_label, category, btrim(regexp_replace(coalesce(body, ''), '\s+', ' ', 'g')) as clean
    from public.announcements
    where id = p_announcement
  ) a;
$$;

revoke all on function public.request_type_noun(text) from public, anon, authenticated;
revoke all on function public.notify_request_brief(uuid) from public, anon, authenticated;
revoke all on function public.announcement_teaser(uuid) from public, anon, authenticated;
grant execute on function public.request_type_noun(text) to service_role;
grant execute on function public.notify_request_brief(uuid) to service_role;
grant execute on function public.announcement_teaser(uuid) to service_role;

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
    perform public.notify(r.tenant_id, rec, 'approval.pending',
      who || case r.request_type
        when 'leave' then ' xin nghỉ phép'
        when 'overtime' then ' xin làm thêm giờ'
        when 'explanation' then ' gửi giải trình công'
        when 'salary_advance' then ' xin tạm ứng lương'
        when 'profile_change' then ' xin sửa hồ sơ'
        else ' gửi đơn' end,
      concat_ws(' · ', nullif(public.notify_request_brief(r.id), ''), 'Chờ bạn duyệt', r.request_no),
      'request', r.id, r.request_no, new.id, 'pending:' || new.id);
  end loop;
  return null;
end;
$$;

create or replace function public.notify_request_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  note text;
  brief text;
  noun text;
begin
  if new.status not in ('approved', 'rejected') or old.status = new.status then return null; end if;
  select coalesce(e.full_name, 'Người duyệt'), t.comment into actor, note
  from public.approval_tasks t left join public.employees e on e.user_id = t.acted_by and e.tenant_id = t.tenant_id
  where t.request_id = new.id and t.status in ('approved', 'rejected') order by t.step_no desc limit 1;
  brief := nullif(public.notify_request_brief(new.id), '');
  noun := public.request_type_noun(new.request_type);
  if new.status = 'approved' then
    perform public.notify(new.tenant_id, new.requester_employee_id, 'request.approved',
      'Đơn ' || coalesce(noun, new.request_no) || ' đã được duyệt',
      concat_ws(' · ', brief, coalesce(actor, 'Người duyệt') || ' duyệt' || case
        when new.request_type = 'explanation' then ', bảng công đã cập nhật'
        -- Trigger trừ phép (requests_leave_settle) chạy trước trigger này (theo thứ tự tên) nên giao dịch "đã nghỉ" đã có
        when exists (select 1 from public.leave_transactions where request_id = new.id and kind = 'consume') then ', đã trừ vào sổ phép'
        else '' end, new.request_no),
      'request', new.id, new.request_no, null, 'done:' || new.id);
  else
    perform public.notify(new.tenant_id, new.requester_employee_id, 'request.rejected',
      'Đơn ' || coalesce(noun, new.request_no) || ' bị từ chối',
      concat_ws(' · ',
        coalesce(actor, 'Người duyệt') || case when nullif(btrim(coalesce(note, '')), '') is null then ' từ chối, không ghi lý do' else ': ' || note end,
        brief, new.request_no),
      'request', new.id, new.request_no, null, 'done:' || new.id);
  end if;
  return null;
end;
$$;

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
    select a.id, a.due_at, r.id as request_id, r.request_no, r.request_type, r.tenant_id, e.full_name, tn.timezone
    from public.approval_tasks a
    join public.requests r on r.id = a.request_id
    join public.employees e on e.id = r.requester_employee_id
    join public.tenants tn on tn.id = r.tenant_id
    where a.status = 'pending' and r.status = 'pending' and a.due_at is not null and a.due_at <= now() + p_within
  loop
    over := t.due_at <= now();
    for rec in select public.task_assignees(t.id) loop
      if public.notify(t.tenant_id, rec, 'approval.due',
        'Đơn ' || coalesce(public.request_type_noun(t.request_type), t.request_no) || ' của ' || t.full_name
          || case when over then ' đã quá hạn duyệt' else ' sắp quá hạn duyệt' end,
        'Hạn ' || to_char(t.due_at at time zone t.timezone, 'HH24:MI DD/MM') || ' · ' || t.request_no,
        'request', t.request_id, t.request_no, t.id, 'due:' || t.id || case when over then ':over' else ':soon' end) then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;

create or replace function public.notify_due_announcements(p_announcement uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  n integer := 0;
begin
  for a in
    select id, tenant_id, title, category, important, body, author_label from public.announcements
    where notify and notified_at is null and archived_at is null and publish_at <= now()
      and (visible_until is null or visible_until > now()) and (p_announcement is null or id = p_announcement)
    order by publish_at for update skip locked
  loop
    perform public.notify(a.tenant_id, r, 'announcement.published',
      case when a.important then 'Quan trọng · ' else '' end || a.title,
      public.announcement_teaser(a.id),
      'announcement', a.id, null, null, 'announcement:' || a.id)
    from public.announcement_recipients(a.id) r;
    update public.announcements set notified_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.notify_reminders(p_tenant uuid, p_kind text, p_items jsonb, p_ref uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  day date := public.tenant_today(p_tenant);
  a record;
  n integer := 0;
begin
  if p_kind = 'reminder.announcement' then
    select id, title into a from public.announcements
    where id = p_ref and tenant_id = p_tenant and archived_at is null and publish_at <= now() and (visible_until is null or visible_until > now());
    if not found then raise exception 'ANNOUNCEMENT_NOT_REMINDABLE' using errcode = 'P0001'; end if;
    select count(*) filter (where public.notify(p_tenant, e.id, p_kind, 'Nhắc đọc: ' || a.title, public.announcement_teaser(a.id),
      'announcement', a.id, null, null, 'remind:announcement:' || a.id || ':' || day))::int into n
    from public.announcement_recipients(a.id) r
    join public.employees e on e.id = r and e.tenant_id = p_tenant and e.user_id is not null and e.status <> 'terminated'
    where not exists (select 1 from public.announcement_reads x where x.announcement_id = a.id and x.employee_id = e.id);
    return n;
  end if;
  if p_kind not in ('reminder.attendance', 'reminder.documents') then raise exception 'REMINDER_KIND_INVALID' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then raise exception 'REMINDER_ITEMS_INVALID' using errcode = 'P0001'; end if;
  select count(*) filter (where public.notify(p_tenant, e.id, p_kind,
    case p_kind when 'reminder.attendance' then 'Bạn chưa chấm công hôm nay' else 'Hồ sơ còn thiếu giấy tờ' end,
    case p_kind when 'reminder.attendance' then concat_ws(' · ', nullif(i.detail, ''), 'Mở app để chấm công.')
      else coalesce('Còn thiếu: ' || nullif(i.detail, '') || '. ', '') || 'Nộp bổ sung cho phòng Nhân sự.' end,
    null, null, null, null, 'remind:' || split_part(p_kind, '.', 2) || ':' || day))::int into n
  from (select distinct on (x->>'id') (x->>'id')::uuid as id, left(x->>'detail', 300) as detail from jsonb_array_elements(p_items) x) i
  join public.employees e on e.id = i.id and e.tenant_id = p_tenant and e.user_id is not null and e.status <> 'terminated';
  return n;
end;
$$;
