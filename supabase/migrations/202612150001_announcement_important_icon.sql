-- Bản tin quan trọng: tiêu đề thông báo mở đầu bằng icon "❗" thay chữ "Quan trọng:" (người dùng 22/11/2026). Chỉ đổi chữ;
-- phần còn lại chép nguyên notify_due_announcements từ 202612140001_notification_text.sql.

create or replace function public.notify_due_announcements(p_announcement uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  teaser text;
  n integer := 0;
begin
  for a in
    select id, tenant_id, title, category, important, body, author_label from public.announcements
    where notify and notified_at is null and archived_at is null and publish_at <= now()
      and (visible_until is null or visible_until > now()) and (p_announcement is null or id = p_announcement)
    order by publish_at for update skip locked
  loop
    teaser := public.announcement_teaser(a.id);
    perform public.notify(a.tenant_id, r, 'announcement.published',
      case when a.important then '❗ ' else '' end || a.title,
      teaser,
      'announcement', a.id, null, null, 'announcement:' || a.id)
    from public.announcement_recipients(a.id) r;
    update public.announcements set notified_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
