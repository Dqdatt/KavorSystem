-- Bản tin nội bộ (docs/plans/announcements.md): HR soạn bài, chọn người nhận (toàn công ty / chi nhánh / phòng ban kèm phòng con),
-- lưu nháp, xuất bản ngay hoặc hẹn giờ, gỡ bài; mở bài = đã đọc. Nội dung chữ thuần (đoạn + gạch đầu dòng), không HTML.
-- Một file đính kèm/bài nằm ở Storage riêng tư (API đọc/ghi). Thông báo trong app do HR chọn từng bài, tạo bằng
-- notify_due_announcements() — gọi khi xuất bản và theo chu kỳ quét của API cho bài hẹn giờ.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('announcement.read','announcement','Xem bản tin gửi tới mình'),
  ('announcement.publish','announcement','Soạn, xuất bản, gỡ bản tin và xem thống kê đã đọc')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'employee' then array['announcement.read']
  when 'hr_ops' then array['announcement.publish']
  when 'tenant_admin' then array['announcement.publish']
end)
where r.tenant_id is null and r.is_system and r.code in ('employee','hr_ops','tenant_admin')
on conflict do nothing;

-- ---------- 2. Bảng ----------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  category text not null check (category in ('notice','policy','event')),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 20000),
  -- Tên hiển thị người/bộ phận đăng ("Phòng Nhân sự", "Ban Văn hóa"…) như prototype mobile
  author_label text not null default 'Phòng Nhân sự' check (length(trim(author_label)) between 1 and 80),
  important boolean not null default false,
  pinned boolean not null default false,
  notify boolean not null default false,
  audience text not null default 'tenant' check (audience in ('tenant','units')),
  attachment_path text,
  attachment_name text check (length(attachment_name) between 1 and 200),
  attachment_type text check (attachment_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  attachment_size integer check (attachment_size between 1 and 5242880),
  -- null = nháp; > now() = hẹn giờ; ≤ now() = đã xuất bản
  publish_at timestamptz,
  published_by uuid references auth.users(id) on delete restrict,
  notified_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete restrict,
  -- null chỉ cho dữ liệu mẫu (seed)
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check ((attachment_path is null) = (attachment_name is null) and (attachment_path is null) = (attachment_type is null) and (attachment_path is null) = (attachment_size is null)),
  check (archived_at is null or publish_at is not null)
);
create index announcements_tenant_idx on public.announcements (tenant_id, publish_at desc);
create index announcements_notify_due_idx on public.announcements (publish_at) where notify and notified_at is null and archived_at is null;

create table public.announcement_audiences (
  announcement_id uuid not null,
  tenant_id uuid not null,
  scope_type text not null check (scope_type in ('branch','department')),
  scope_id uuid not null,
  primary key (announcement_id, scope_type, scope_id),
  foreign key (tenant_id, announcement_id) references public.announcements(tenant_id, id) on delete cascade
);

create table public.announcement_reads (
  announcement_id uuid not null,
  tenant_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  read_at timestamptz not null default now(),
  primary key (announcement_id, employee_id),
  foreign key (tenant_id, announcement_id) references public.announcements(tenant_id, id) on delete restrict
);

-- Bài đã xuất bản không xóa (chỉ gỡ), đã gỡ không sửa; lượt đọc bất biến
create or replace function public.announcements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.publish_at is not null and old.publish_at <= now() then raise exception 'ANNOUNCEMENT_PUBLISHED' using errcode = 'P0001'; end if;
    return old;
  end if;
  if new.tenant_id <> old.tenant_id or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'ANNOUNCEMENT_IMMUTABLE' using errcode = 'P0001';
  end if;
  if old.archived_at is not null then raise exception 'ANNOUNCEMENT_ARCHIVED' using errcode = 'P0001'; end if;
  if old.publish_at is not null and old.publish_at <= now() and new.publish_at is distinct from old.publish_at then
    raise exception 'ANNOUNCEMENT_PUBLISHED' using errcode = 'P0001';
  end if;
  if old.notified_at is not null and new.notified_at is distinct from old.notified_at then raise exception 'ANNOUNCEMENT_IMMUTABLE' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger announcements_guard before update or delete on public.announcements for each row execute function public.announcements_guard();

create or replace function public.announcement_reads_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'ANNOUNCEMENT_READ_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger announcement_reads_guard before update or delete on public.announcement_reads for each row execute function public.announcement_reads_guard();

-- ---------- 3. Người nhận ----------
-- Nhân viên chưa nghỉ việc có phân công chính đang hiệu lực (ngày của công ty) thuộc chi nhánh đã chọn, hoặc phòng ban đã chọn
-- và các phòng con. Tính tại thời điểm gọi: người mới vào phòng sau khi đăng vẫn thấy bài.
create or replace function public.announcement_recipients(p_announcement uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive a as (
    select id, tenant_id, audience, public.tenant_today(tenant_id) as day from public.announcements where id = p_announcement
  ), deps as (
    select t.scope_id as id from public.announcement_audiences t join a on a.id = t.announcement_id where t.scope_type = 'department'
    union
    select d.id from public.departments d join deps on d.parent_id = deps.id
  )
  select e.id
  from a
  join public.employees e on e.tenant_id = a.tenant_id
  left join lateral (
    select x.branch_id, x.department_id from public.employee_assignments x
    where x.employee_id = e.id and x.is_primary and x.effective_from <= a.day and (x.effective_to is null or x.effective_to >= a.day)
    order by x.effective_from desc limit 1
  ) asg on true
  where e.status <> 'terminated' and (e.termination_date is null or e.termination_date >= a.day)
    and (a.audience = 'tenant'
      or asg.department_id in (select id from deps)
      or asg.branch_id in (select t.scope_id from public.announcement_audiences t where t.announcement_id = a.id and t.scope_type = 'branch'));
$$;

-- Nhân viên đọc được bài: đã xuất bản, chưa gỡ, mình thuộc người nhận
create or replace function public.announcement_visible(p_announcement uuid, p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.announcements a
    where a.id = p_announcement and a.publish_at <= now() and a.archived_at is null
      and p_employee in (select public.announcement_recipients(a.id))
  );
$$;

-- Bản bọc theo auth.uid() cho RLS
create or replace function public.can_read_announcement(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (select 1 from public.current_employee_ids() me where public.announcement_visible(p_announcement, me));
$$;

-- ---------- 4. Ghi (API gọi bằng service role với người dùng đã xác thực) ----------
-- Người đăng cần announcement.publish phạm vi toàn công ty (phạm vi phòng ban để sau)
create or replace function public.require_announcement_publisher(p_tenant uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.permission_scopes(p_user, p_tenant, 'announcement.publish', public.tenant_today(p_tenant)) s where s.scope_type = 'tenant') then
    raise exception 'ANNOUNCEMENT_FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

-- Thêm/sửa bài và người nhận trong một transaction. p_units = [{"type":"branch|department","id":"…"}]
create or replace function public.save_announcement(p_tenant uuid, p_user uuid, p_id uuid, p_data jsonb, p_units jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  aid uuid := p_id;
  aud text := coalesce(p_data->>'audience', 'tenant');
  u jsonb;
begin
  perform public.require_announcement_publisher(p_tenant, p_user);
  if aud = 'units' and jsonb_array_length(coalesce(p_units, '[]'::jsonb)) = 0 then raise exception 'ANNOUNCEMENT_AUDIENCE_REQUIRED' using errcode = 'P0001'; end if;
  if aid is null then
    insert into public.announcements (tenant_id, category, title, body, author_label, important, pinned, notify, audience, created_by, updated_by)
    values (p_tenant, p_data->>'category', p_data->>'title', coalesce(p_data->>'body', ''), coalesce(p_data->>'authorLabel', 'Phòng Nhân sự'),
      coalesce((p_data->>'important')::boolean, false), coalesce((p_data->>'pinned')::boolean, false), coalesce((p_data->>'notify')::boolean, false),
      aud, p_user, p_user)
    returning id into aid;
  else
    update public.announcements set category = p_data->>'category', title = p_data->>'title', body = coalesce(p_data->>'body', ''),
      author_label = coalesce(p_data->>'authorLabel', author_label), important = coalesce((p_data->>'important')::boolean, false),
      pinned = coalesce((p_data->>'pinned')::boolean, false), notify = coalesce((p_data->>'notify')::boolean, false),
      audience = aud, updated_by = p_user, updated_at = now()
    where id = aid and tenant_id = p_tenant;
    if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode = 'P0001'; end if;
    delete from public.announcement_audiences where announcement_id = aid;
  end if;
  if aud = 'units' then
    for u in select * from jsonb_array_elements(p_units) loop
      if not (u->>'type' = 'branch' and exists (select 1 from public.branches where id = (u->>'id')::uuid and tenant_id = p_tenant))
        and not (u->>'type' = 'department' and exists (select 1 from public.departments where id = (u->>'id')::uuid and tenant_id = p_tenant)) then
        raise exception 'ANNOUNCEMENT_UNIT_INVALID' using errcode = 'P0001';
      end if;
      insert into public.announcement_audiences (announcement_id, tenant_id, scope_type, scope_id)
      values (aid, p_tenant, u->>'type', (u->>'id')::uuid) on conflict do nothing;
    end loop;
  end if;
  return aid;
end;
$$;

-- Thông báo bài đến giờ (HR chọn "gửi thông báo"); mỗi bài một lần, mỗi người một dòng (dedupe_key). Không chép nội dung bài.
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
    select id, tenant_id, title, category, important from public.announcements
    where notify and notified_at is null and archived_at is null and publish_at <= now() and (p_announcement is null or id = p_announcement)
    order by publish_at for update skip locked
  loop
    perform public.notify(a.tenant_id, r, 'announcement.published',
      case when a.important then 'Bản tin quan trọng: ' else 'Bản tin mới: ' end || a.title,
      case a.category when 'notice' then 'Thông báo' when 'policy' then 'Chính sách' else 'Sự kiện' end || ' · Mở để xem chi tiết.',
      'announcement', a.id, null, null, 'announcement:' || a.id)
    from public.announcement_recipients(a.id) r;
    update public.announcements set notified_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Xuất bản ngay (p_at null) hoặc hẹn giờ; đổi giờ được khi bài còn đang hẹn
create or replace function public.publish_announcement(p_tenant uuid, p_user uuid, p_id uuid, p_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := greatest(coalesce(p_at, now()), now());
begin
  perform public.require_announcement_publisher(p_tenant, p_user);
  update public.announcements set publish_at = v_at, published_by = p_user, updated_by = p_user, updated_at = now()
  where id = p_id and tenant_id = p_tenant and archived_at is null and (publish_at is null or publish_at > now());
  if not found then raise exception 'ANNOUNCEMENT_NOT_PUBLISHABLE' using errcode = 'P0001'; end if;
  perform public.notify_due_announcements(p_id);
  return v_at;
end;
$$;

revoke all on function public.require_announcement_publisher(uuid, uuid) from public, anon, authenticated;
grant execute on function public.require_announcement_publisher(uuid, uuid) to service_role;
revoke all on function public.announcement_recipients(uuid) from public, anon, authenticated;
revoke all on function public.announcement_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_announcement(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.notify_due_announcements(uuid) from public, anon, authenticated;
revoke all on function public.publish_announcement(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.can_read_announcement(uuid) from public, anon;
grant execute on function public.announcement_recipients(uuid) to service_role;
grant execute on function public.announcement_visible(uuid, uuid) to service_role;
grant execute on function public.save_announcement(uuid, uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.notify_due_announcements(uuid) to service_role;
grant execute on function public.publish_announcement(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.can_read_announcement(uuid) to authenticated;

-- ---------- 5. Thông báo ----------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval.pending','approval.due','request.approved','request.rejected','device.approved','device.rejected','advance.paid','payslip.published','announcement.published'));
alter table public.notifications drop constraint notifications_link_type_check;
alter table public.notifications add constraint notifications_link_type_check check (link_type in ('request','device','payslip','announcement'));

-- ---------- 6. RLS: client chỉ đọc; ghi qua API ----------
alter table public.announcements enable row level security;
alter table public.announcement_audiences enable row level security;
alter table public.announcement_reads enable row level security;
create policy announcements_read on public.announcements for select to authenticated
  using (public.has_permission('announcement.publish', tenant_id) or public.can_read_announcement(id));
create policy announcement_audiences_read on public.announcement_audiences for select to authenticated
  using (public.has_permission('announcement.publish', tenant_id));
create policy announcement_reads_read on public.announcement_reads for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.has_permission('announcement.publish', tenant_id));
grant select on public.announcements, public.announcement_audiences, public.announcement_reads to authenticated;
