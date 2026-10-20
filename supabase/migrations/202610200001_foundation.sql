create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  legal_name text,
  tax_code text,
  status text not null default 'provisioning' check (status in ('provisioning','active','suspended','closed')),
  plan_code text not null default 'trial' check (plan_code in ('trial','starter','growth','enterprise')),
  primary_region text not null default 'ap-southeast-1',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  currency char(3) not null default 'VND',
  locale text not null default 'vi-VN',
  employee_limit integer not null default 50 check (employee_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  branding jsonb not null default '{}'::jsonb,
  attendance_settings jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  data_retention_settings jsonb not null default '{}'::jsonb,
  mobile_policy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  status text not null default 'active' check (status in ('active','disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','active','suspended','ended')),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  scope_type text not null default 'tenant' check (scope_type in ('self','direct_reports','management_tree','team','department','branch','legal_entity','tenant')),
  scope_id uuid,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  tax_code text,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  legal_entity_id uuid not null references public.legal_entities(id) on delete restrict,
  code text not null,
  name text not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  parent_id uuid references public.departments(id) on delete restrict,
  code text not null,
  name text not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  job_level text,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_code text not null,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  work_email citext,
  phone text,
  hire_date date not null,
  termination_date date,
  employment_type text not null default 'official' check (employment_type in ('probation','official','contractor','intern')),
  status text not null default 'active' check (status in ('preboarding','active','suspended','on_leave','leaving','terminated')),
  source_system text not null default 'kavor',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_code),
  unique nulls not distinct (tenant_id, source_system, external_id)
);

create table public.employee_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  legal_entity_id uuid not null references public.legal_entities(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  position_id uuid not null references public.positions(id) on delete restrict,
  manager_employee_id uuid references public.employees(id) on delete restrict,
  is_primary boolean not null default true,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user','support','system','job')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index memberships_user_idx on public.memberships(user_id, status);
create index employees_tenant_status_idx on public.employees(tenant_id, status);
create index employee_assignments_effective_idx on public.employee_assignments(tenant_id, employee_id, effective_from desc);
create index audit_logs_resource_idx on public.audit_logs(tenant_id, resource_type, resource_id, created_at desc);

create trigger tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at();
create trigger tenant_settings_updated_at before update on public.tenant_settings for each row execute function public.set_updated_at();
create trigger user_profiles_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();
create trigger legal_entities_updated_at before update on public.legal_entities for each row execute function public.set_updated_at();
create trigger branches_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger departments_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger positions_updated_at before update on public.positions for each row execute function public.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'active_tenant_id', '')::uuid;
$$;

create or replace function public.is_active_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

revoke all on function public.is_active_member(uuid) from public;
grant execute on function public.is_active_member(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.memberships enable row level security;
alter table public.roles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.legal_entities enable row level security;
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_assignments enable row level security;
alter table public.audit_logs enable row level security;

create policy tenant_member_read on public.tenants for select to authenticated
  using (public.is_active_member(id));
create policy tenant_settings_member_read on public.tenant_settings for select to authenticated
  using (public.is_active_member(tenant_id));
create policy membership_same_tenant_read on public.memberships for select to authenticated
  using (public.is_active_member(tenant_id));
create policy roles_same_tenant_read on public.roles for select to authenticated
  using (tenant_id is null or public.is_active_member(tenant_id));
create policy role_assignments_same_tenant_read on public.role_assignments for select to authenticated
  using (public.is_active_member(tenant_id));
create policy legal_entities_same_tenant_read on public.legal_entities for select to authenticated
  using (public.is_active_member(tenant_id));
create policy branches_same_tenant_read on public.branches for select to authenticated
  using (public.is_active_member(tenant_id));
create policy departments_same_tenant_read on public.departments for select to authenticated
  using (public.is_active_member(tenant_id));
create policy positions_same_tenant_read on public.positions for select to authenticated
  using (public.is_active_member(tenant_id));
create policy employees_same_tenant_read on public.employees for select to authenticated
  using (public.is_active_member(tenant_id));
create policy employee_assignments_same_tenant_read on public.employee_assignments for select to authenticated
  using (public.is_active_member(tenant_id));
create policy audit_same_tenant_read on public.audit_logs for select to authenticated
  using (tenant_id is not null and public.is_active_member(tenant_id));

comment on table public.tenants is 'Kavor tenant boundary; not a business registration record.';
comment on table public.audit_logs is 'Append-only audit events. No update/delete policies are granted.';
