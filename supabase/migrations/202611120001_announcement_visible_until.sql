-- Bản tin có thời hạn hiển thị: HR chọn "Hiển thị đến"; quá giờ đó bài tự ẩn trên app (không cần gỡ tay) và không gửi thông báo nữa.
-- Giờ bắt đầu hiển thị vẫn là giờ xuất bản/hẹn giờ (publish_at). null = hiển thị tới khi HR gỡ. Sửa được cả khi bài đã xuất bản (gia hạn/rút ngắn).
alter table public.announcements add column visible_until timestamptz;
alter table public.announcements add constraint announcements_visible_window check (visible_until is null or publish_at is null or visible_until > publish_at);

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
    insert into public.announcements (tenant_id, category, title, body, author_label, important, pinned, notify, audience, visible_until, created_by, updated_by)
    values (p_tenant, p_data->>'category', p_data->>'title', coalesce(p_data->>'body', ''), coalesce(p_data->>'authorLabel', 'Phòng Nhân sự'),
      coalesce((p_data->>'important')::boolean, false), coalesce((p_data->>'pinned')::boolean, false), coalesce((p_data->>'notify')::boolean, false),
      aud, nullif(p_data->>'visibleUntil', '')::timestamptz, p_user, p_user)
    returning id into aid;
  else
    update public.announcements set category = p_data->>'category', title = p_data->>'title', body = coalesce(p_data->>'body', ''),
      author_label = coalesce(p_data->>'authorLabel', author_label), important = coalesce((p_data->>'important')::boolean, false),
      pinned = coalesce((p_data->>'pinned')::boolean, false), notify = coalesce((p_data->>'notify')::boolean, false),
      audience = aud, visible_until = nullif(p_data->>'visibleUntil', '')::timestamptz, updated_by = p_user, updated_at = now()
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
      and (a.visible_until is null or a.visible_until > now())
      and p_employee in (select public.announcement_recipients(a.id))
  );
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
    select id, tenant_id, title, category, important from public.announcements
    where notify and notified_at is null and archived_at is null and publish_at <= now()
      and (visible_until is null or visible_until > now()) and (p_announcement is null or id = p_announcement)
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
