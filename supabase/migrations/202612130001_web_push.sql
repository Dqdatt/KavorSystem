-- Web Push cho app nhân viên dạng PWA (iPhone iOS 16.4+ khi đã thêm vào Màn hình chính, Android/máy tính Chrome/Firefox).
-- Mỗi trình duyệt một subscription (endpoint do Apple/Google/Mozilla cấp), gắn với nhân viên đang đăng nhập trên trình duyệt đó.
-- Thông báo trong app (bảng notifications, tạo bằng trigger) được đưa vào hàng đợi push_outbox nếu người nhận có subscription;
-- API rút hàng đợi (push_claim) và gửi. App native chưa có push (cần APNs/FCM trả phí).
-- Chỉ API (service role) đọc/ghi; không GRANT cho anon/authenticated (xem 202612080001_browser_token_rls.sql).

create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_employee_idx on public.push_subscriptions (employee_id, updated_at desc);

create table public.push_outbox (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index push_outbox_created_idx on public.push_outbox (created_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_subscriptions, public.push_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.push_outbox to service_role;

-- Thông báo mới → hàng đợi push (chỉ khi người nhận có ít nhất một trình duyệt đăng ký)
create or replace function public.push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.push_subscriptions s where s.employee_id = new.recipient_employee_id and s.tenant_id = new.tenant_id) then
    insert into public.push_outbox (notification_id) values (new.id) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger notifications_push after insert on public.notifications
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.push_enqueue();

-- Đăng ký (hoặc chuyển) trình duyệt cho nhân viên đang đăng nhập. Endpoint là của trình duyệt: người khác đăng nhập trên cùng
-- trình duyệt thì subscription chuyển sang người đó. Mỗi nhân viên giữ tối đa 5 trình duyệt mới nhất (chặn đăng ký hàng loạt).
create or replace function public.push_subscribe(p_tenant uuid, p_employee uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.employees where id = p_employee and tenant_id = p_tenant) then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.push_subscriptions (endpoint, tenant_id, employee_id, p256dh, auth)
  values (p_endpoint, p_tenant, p_employee, p_p256dh, p_auth)
  on conflict (endpoint) do update set tenant_id = excluded.tenant_id, employee_id = excluded.employee_id,
    p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  -- Giữ trình duyệt vừa đăng ký + 4 trình duyệt khác mới nhất
  delete from public.push_subscriptions where employee_id = p_employee and endpoint <> p_endpoint and endpoint not in (
    select endpoint from public.push_subscriptions where employee_id = p_employee and endpoint <> p_endpoint order by updated_at desc, endpoint limit 4);
end;
$$;

-- Lấy (và xóa khỏi hàng đợi) tối đa p_limit thông báo cần gửi, mỗi dòng một cặp thông báo × trình duyệt.
-- Gửi tối đa một lần: API lỗi giữa chừng thì mất push, thông báo vẫn còn trong app.
-- Bỏ thông báo đã đọc hoặc cũ hơn 12 giờ (API ngủ lâu trên gói miễn phí → không dội push cũ khi thức dậy).
create or replace function public.push_claim(p_limit integer default 100)
returns table (notification_id uuid, endpoint text, p256dh text, auth text, kind text, title text, body text,
               link_type text, link_id uuid, link_no text)
language sql
security definer
set search_path = public
as $$
  with c as (
    delete from public.push_outbox o
    where o.notification_id in (select q.notification_id from public.push_outbox q order by q.created_at limit greatest(1, least(p_limit, 500)) for update skip locked)
    returning o.notification_id
  )
  select n.id, s.endpoint, s.p256dh, s.auth, n.kind, n.title, n.body, n.link_type, n.link_id, n.link_no
  from c
  join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.employee_id = n.recipient_employee_id and s.tenant_id = n.tenant_id
  where n.read_at is null and n.created_at > now() - interval '12 hours';
$$;

revoke all on function public.push_enqueue() from public, anon, authenticated;
revoke all on function public.push_subscribe(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
grant execute on function public.push_subscribe(uuid, uuid, text, text, text) to service_role;
grant execute on function public.push_claim(integer) to service_role;
