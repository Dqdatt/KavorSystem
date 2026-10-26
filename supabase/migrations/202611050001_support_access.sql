-- Support access có thời hạn (docs/plans/console-ops.md phần B; PRODUCT_SPEC §6.11, US-072, ADR 0001 §1).
-- Nhân viên Kavor yêu cầu (tenant, ticket/lý do, phạm vi, 30/60 phút) → Tenant Admin duyệt → phiên chỉ đọc tự hết hạn.
-- Thời hạn do DB tính lúc duyệt (không tin client); chuyển trạng thái chỉ theo đúng luồng; nội dung yêu cầu bất biến.
-- Ghi qua API (service role); thành viên tenant đọc được (minh bạch, banner web qua Realtime).

insert into public.permissions (code, module, description) values
  ('support_access.approve','tenant','Duyệt / từ chối / thu hồi quyền hỗ trợ có thời hạn của nhân viên Kavor')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'support_access.approve'
where r.tenant_id is null and r.is_system and r.code = 'tenant_admin'
on conflict do nothing;

create table public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  operator_user_id uuid not null references public.platform_operators(user_id) on delete restrict,
  ticket text not null check (length(trim(ticket)) between 2 and 50),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  scopes text[] not null check (cardinality(scopes) between 1 and 3 and scopes <@ array['settings','directory','audit']::text[]),
  duration_minutes smallint not null check (duration_minutes in (30, 60)),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','revoked','ended')),
  requested_at timestamptz not null default now(),
  request_expires_at timestamptz not null default now() + interval '24 hours',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  starts_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id),
  check (status not in ('approved','revoked','ended') or (starts_at is not null and expires_at is not null))
);
create index support_access_tenant_idx on public.support_access_sessions(tenant_id, requested_at desc);
create unique index support_access_one_pending on public.support_access_sessions(tenant_id, operator_user_id) where status = 'pending';

create or replace function public.support_access_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tenant_id <> old.tenant_id or new.operator_user_id <> old.operator_user_id or new.ticket <> old.ticket or new.reason <> old.reason
     or new.scopes <> old.scopes or new.duration_minutes <> old.duration_minutes or new.requested_at <> old.requested_at
     or new.request_expires_at <> old.request_expires_at then
    raise exception 'SUPPORT_REQUEST_IMMUTABLE' using errcode = 'P0001';
  end if;
  if new.status = old.status then
    -- Chỉ trạng thái quyết định mới được ghi; không sửa thời hạn/ghi chú sau khi đã có
    if new.starts_at is distinct from old.starts_at or new.expires_at is distinct from old.expires_at or new.decided_at is distinct from old.decided_at then
      raise exception 'SUPPORT_REQUEST_IMMUTABLE' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.status = 'pending' and new.status in ('approved','rejected','cancelled') then
    if new.status = 'approved' then
      if now() > old.request_expires_at then raise exception 'SUPPORT_REQUEST_EXPIRED' using errcode = 'P0001'; end if;
      new.starts_at := now();
      new.expires_at := now() + make_interval(mins => old.duration_minutes);
    end if;
    new.decided_at := now();
  elsif old.status = 'approved' and new.status in ('revoked','ended') then
    new.ended_at := least(now(), old.expires_at);
    new.starts_at := old.starts_at; new.expires_at := old.expires_at;
  else
    raise exception 'SUPPORT_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger support_access_guard before update on public.support_access_sessions
  for each row execute function public.support_access_guard();

-- Phiên đang hiệu lực: đã duyệt, trong thời hạn, chưa thu hồi/kết thúc và tenant còn hoạt động
create or replace function public.support_session_active(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_access_sessions s
    join public.tenants t on t.id = s.tenant_id and t.status = 'active'
    where s.id = p_session and s.status = 'approved' and now() >= s.starts_at and now() < s.expires_at
  );
$$;
revoke all on function public.support_session_active(uuid) from public, anon, authenticated;
grant execute on function public.support_session_active(uuid) to service_role;

alter table public.support_access_sessions enable row level security;
create policy support_access_member_read on public.support_access_sessions for select to authenticated
  using (public.is_active_member(tenant_id));
grant select on public.support_access_sessions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.support_access_sessions;
  end if;
end;
$$;
