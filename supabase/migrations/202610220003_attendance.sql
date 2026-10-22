-- Chấm công trên mobile: địa điểm làm việc (geofence), thiết bị đã đăng ký, bản ghi chấm công gốc.
-- Bản ghi gốc là bất biến; giải trình/điều chỉnh (sprint sau) tạo bản ghi riêng, không sửa bản ghi này.

create table public.work_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  code text not null,
  name text not null,
  address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 100 check (radius_m between 3 and 5000),
  max_accuracy_m integer not null default 100 check (max_accuracy_m between 5 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.employee_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  installation_id text not null check (length(installation_id) between 8 and 128),
  platform text not null check (platform in ('ios','android')),
  device_model text,
  os_version text,
  app_version text,
  -- active: được chấm công; pending: chờ HR duyệt đổi máy; revoked: đã thu hồi
  status text not null default 'active' check (status in ('active','pending','revoked')),
  registered_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  unique (tenant_id, employee_id, installation_id)
);
-- Mỗi nhân viên chỉ có một thiết bị đang hoạt động
create unique index employee_devices_one_active on public.employee_devices(employee_id) where status = 'active';

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  device_id uuid references public.employee_devices(id) on delete restrict,
  kind text not null check (kind in ('in','out')),
  -- Khóa chống trùng do client sinh: gửi lại (mạng chập chờn, hàng đợi offline) không tạo bản ghi mới
  client_event_id text not null check (length(client_event_id) between 8 and 128),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  recorded_offline boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  location_id uuid references public.work_locations(id) on delete restrict,
  distance_m double precision,
  status text not null check (status in ('accepted','rejected')),
  reject_reason text check (reject_reason in ('out_of_range','low_accuracy','device_not_registered','invalid_sequence','clock_skew')),
  created_at timestamptz not null default now(),
  unique (employee_id, client_event_id)
);
create index attendance_events_employee_time_idx on public.attendance_events(tenant_id, employee_id, occurred_at desc);

create trigger work_locations_updated_at before update on public.work_locations for each row execute function public.set_updated_at();

create or replace function public.attendance_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'attendance_events is immutable';
end;
$$;
create trigger attendance_events_no_update before update or delete on public.attendance_events
  for each row execute function public.attendance_events_immutable();

-- RLS: nhân viên đọc dữ liệu của chính mình; địa điểm làm việc đọc theo tenant. Ghi chỉ qua API.
alter table public.work_locations enable row level security;
alter table public.employee_devices enable row level security;
alter table public.attendance_events enable row level security;

create or replace function public.current_employee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid();
$$;
revoke all on function public.current_employee_ids() from public;
grant execute on function public.current_employee_ids() to authenticated;

create policy work_locations_member_read on public.work_locations for select to authenticated
  using (public.is_active_member(tenant_id));
create policy employee_devices_self_read on public.employee_devices for select to authenticated
  using (employee_id in (select public.current_employee_ids()));
create policy attendance_events_self_read on public.attendance_events for select to authenticated
  using (employee_id in (select public.current_employee_ids()));

grant select on public.work_locations, public.employee_devices, public.attendance_events to authenticated;
grant select, insert, update, delete on public.work_locations, public.employee_devices, public.attendance_events to service_role;
