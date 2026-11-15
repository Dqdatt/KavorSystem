-- Nút "Nhắc" của HR: nhắc chấm công hôm nay, nhắc bổ sung giấy tờ, nhắc đọc bản tin.
-- API kiểm quyền + phạm vi và chọn người cần nhắc (chấm công, giấy tờ); người chưa đọc bản tin do hàm tự tính.
-- Chỉ nhắc nhân viên còn làm và đã có tài khoản app. Mỗi người tối đa một lần nhắc mỗi ngày (theo giờ công ty) cho mỗi loại / mỗi bài.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval.pending','approval.due','request.approved','request.rejected','device.approved','device.rejected','advance.paid','payslip.published','announcement.published',
    'reminder.attendance','reminder.documents','reminder.announcement'));

-- p_items: [{"id": employee_id, "detail": "Ca Hành chính 08:00–17:00" | "CCCD, Sổ BHXH"}] cho chấm công/giấy tờ; bỏ qua với bản tin (p_ref = bài).
-- Trả về số thông báo mới (người đã được nhắc hôm nay, chưa có app, đã nghỉ việc không tính).
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
    select count(*) filter (where public.notify(p_tenant, e.id, p_kind, 'Nhắc đọc bản tin: ' || a.title, 'Bạn chưa đọc bài này · Mở để xem chi tiết.',
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
revoke all on function public.notify_reminders(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.notify_reminders(uuid, text, jsonb, uuid) to service_role;
