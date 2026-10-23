-- Kavor Console tối thiểu (ADR 0001 §1): nhân viên Kavor tạo tenant + mời Tenant Admin đầu tiên; khôi phục quyền chủ sở hữu
-- (Tenant Admin mất điện thoại/nghỉ việc) chỉ qua Console, có xác minh, hai người Kavor khác nhau và audit.
-- Mọi thao tác đi qua API (service role); client không đọc được các bảng nền tảng.

-- ---------- 1. Nhân viên Kavor ----------
create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null,
  role text not null default 'platform_operator' check (role in ('platform_operator','platform_support')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

-- Hành động của nhân viên Kavor ghi audit_logs với actor_type 'platform' (tenant_id = tenant bị tác động, null nếu cấp nền tảng)
alter table public.audit_logs drop constraint audit_logs_actor_type_check;
alter table public.audit_logs add constraint audit_logs_actor_type_check check (actor_type in ('user','support','system','job','platform'));

-- ---------- 2. Khôi phục quyền chủ sở hữu ----------
-- mfa_reset: xóa ứng dụng xác thực của một Tenant Admin (mất điện thoại) · grant_admin: cấp Tenant Admin cho một người
-- (người cũ nghỉ việc, công ty không còn admin). Người duyệt phải khác người tạo; yêu cầu hết hạn sau 24 giờ.
create table public.owner_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  kind text not null check (kind in ('mfa_reset','grant_admin')),
  target_employee_id uuid references public.employees(id) on delete restrict,
  new_admin_name text,
  new_admin_email citext,
  verification text not null check (length(trim(verification)) >= 10),
  reason text not null check (length(trim(reason)) >= 10),
  requested_by uuid not null references public.platform_operators(user_id) on delete restrict,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references public.platform_operators(user_id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  result jsonb,
  check (kind <> 'mfa_reset' or target_employee_id is not null),
  check (kind <> 'grant_admin' or (target_employee_id is not null or (length(trim(coalesce(new_admin_name, ''))) >= 2 and new_admin_email is not null))),
  -- Hai người: người duyệt/từ chối không được là người tạo (tự hủy thì được)
  check (status in ('pending','cancelled') or (decided_by is not null and decided_by <> requested_by)),
  check ((status = 'pending') = (decided_at is null))
);
create index owner_recovery_tenant_idx on public.owner_recovery_requests(tenant_id, requested_at desc);
-- Mỗi tenant chỉ một yêu cầu đang chờ cùng loại, tránh hai người duyệt hai yêu cầu chồng nhau
create unique index owner_recovery_one_pending on public.owner_recovery_requests(tenant_id, kind) where status = 'pending';

create or replace function public.owner_recovery_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'owner_recovery_requests is append-only'; end if;
  if old.status <> 'pending' then raise exception 'RECOVERY_ALREADY_DECIDED' using errcode = 'P0001'; end if;
  if new.status = 'approved' and old.expires_at < now() then raise exception 'RECOVERY_EXPIRED' using errcode = 'P0001'; end if;
  if (new.tenant_id, new.kind, new.target_employee_id, new.new_admin_name, new.new_admin_email, new.verification, new.reason, new.requested_by, new.requested_at, new.expires_at)
     is distinct from (old.tenant_id, old.kind, old.target_employee_id, old.new_admin_name, old.new_admin_email, old.verification, old.reason, old.requested_by, old.requested_at, old.expires_at) then
    raise exception 'owner_recovery_requests: only the decision can change';
  end if;
  return new;
end;
$$;
create trigger owner_recovery_guard before update or delete on public.owner_recovery_requests for each row execute function public.owner_recovery_guard();

-- ---------- Sửa: mỗi tenant chỉ tạo được một nhân viên trên web ----------
-- `unique nulls not distinct (tenant_id, source_system, external_id)` coi mọi external_id rỗng là trùng nhau, nên nhân viên
-- thứ hai tạo trên web (source_system 'kavor', không có external_id) bị chặn. Chỉ cần chống trùng khi có mã ngoài (import).
alter table public.employees drop constraint employees_tenant_id_source_system_external_id_key;
create unique index employees_external_id_unique on public.employees(tenant_id, source_system, external_id) where external_id is not null;

-- ---------- 3. Cơ cấu tổ chức tối thiểu trong bộ mẫu ----------
-- Web HR chưa có trang Tổ chức mà tạo nhân viên cần phòng ban + chức danh: tenant mới có sẵn một bộ, công ty đổi tên sau
update public.tenant_policy_templates
set content = content || $json${"organization": {
  "branch": {"code": "TSC", "name": "Trụ sở chính"},
  "departments": [{"code": "BGD", "name": "Ban Giám đốc"}, {"code": "HCNS", "name": "Hành chính – Nhân sự"}],
  "positions": [{"code": "QTV", "name": "Quản trị viên"}, {"code": "QL", "name": "Quản lý"}, {"code": "NV", "name": "Nhân viên"}]
}}$json$::jsonb, version = version + 1, updated_at = now()
where code = 'vn-default';

create or replace function public.provision_tenant(p_tenant uuid, p_template text default 'vn-default', p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb;
  tn public.tenants;
  d date;
  created jsonb := '[]'::jsonb;
  sid uuid;
  pid uuid;
  le uuid;
  br uuid;
  p jsonb;
begin
  select content into t from public.tenant_policy_templates where code = p_template;
  if t is null then raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into tn from public.tenants where id = p_tenant;
  if tn.id is null then raise exception 'TENANT_NOT_FOUND' using errcode = 'P0001'; end if;
  d := (now() at time zone tn.timezone)::date;

  insert into public.tenant_settings (tenant_id, platform_policy) values (p_tenant, coalesce(t->'platformPolicy', '{}'::jsonb))
  on conflict (tenant_id) do nothing;
  if found then created := created || '"tenant_settings"'::jsonb; end if;

  if t ? 'organization' and not exists (select 1 from public.legal_entities where tenant_id = p_tenant) then
    insert into public.legal_entities (tenant_id, code, name, tax_code, effective_from)
    values (p_tenant, 'PN01', coalesce(tn.legal_name, tn.display_name), tn.tax_code, d) returning id into le;
    insert into public.branches (tenant_id, legal_entity_id, code, name, timezone, effective_from)
    values (p_tenant, le, t#>>'{organization,branch,code}', t#>>'{organization,branch,name}', tn.timezone, d) returning id into br;
    insert into public.departments (tenant_id, branch_id, code, name, effective_from)
    select p_tenant, br, x->>'code', x->>'name', d from jsonb_array_elements(t#>'{organization,departments}') x;
    insert into public.positions (tenant_id, code, name, effective_from)
    select p_tenant, x->>'code', x->>'name', d from jsonb_array_elements(t#>'{organization,positions}') x;
    created := created || '"organization"'::jsonb;
  end if;

  if not exists (select 1 from public.shift_definitions where tenant_id = p_tenant) then
    insert into public.shift_definitions (tenant_id, code, name) values (p_tenant, t#>>'{shift,code}', t#>>'{shift,name}') returning id into sid;
    insert into public.shift_versions (tenant_id, shift_id, version_no, start_time, end_time, break_start, break_end, effective_from, note, created_by)
    values (p_tenant, sid, 1, (t#>>'{shift,start}')::time, (t#>>'{shift,end}')::time, (t#>>'{shift,breakStart}')::time, (t#>>'{shift,breakEnd}')::time, d, 'Mẫu mặc định Kavor', p_actor);
    insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from, created_by) values (p_tenant, 'shift', sid, 'tenant', d, p_actor);
    created := created || '"shift"'::jsonb;
  end if;

  for p in select value from jsonb_array_elements(t->'policies') loop
    if not exists (select 1 from public.policy_definitions where tenant_id = p_tenant and kind = p->>'kind') then
      insert into public.policy_definitions (tenant_id, kind, code, name) values (p_tenant, p->>'kind', p->>'code', p->>'name') returning id into pid;
      insert into public.policy_versions (tenant_id, policy_id, version_no, config, effective_from, note, created_by)
      values (p_tenant, pid, 1, p->'config', d, 'Mẫu mặc định Kavor', p_actor);
      insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from, created_by) values (p_tenant, p->>'kind', pid, 'tenant', d, p_actor);
      created := created || to_jsonb(p->>'kind');
    end if;
  end loop;

  if not exists (select 1 from public.privacy_terms where tenant_id = p_tenant) then
    insert into public.privacy_terms (tenant_id, version_no, title, content, published_by) values (p_tenant, 1, t#>>'{privacy,title}', t#>>'{privacy,content}', p_actor);
    created := created || '"privacy_terms"'::jsonb;
  end if;
  return jsonb_build_object('template', p_template, 'created', created);
end;
$$;

-- ---------- 4. Cấp Tenant Admin (tạo tenant, khôi phục) ----------
-- Tìm nhân viên theo email trong tenant, chưa có thì tạo hồ sơ (mã ADMINnn) ở phòng Ban Giám đốc; membership chờ kích hoạt
-- + role tenant_admin toàn công ty. Idempotent. Trả về id nhân viên.
create or replace function public.grant_tenant_admin(p_tenant uuid, p_name text, p_email citext, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  emp uuid;
  mem uuid;
  new_code text;
  d date;
  dep uuid;
  pos uuid;
begin
  select (now() at time zone timezone)::date into d from public.tenants where id = p_tenant;
  if d is null then raise exception 'TENANT_NOT_FOUND' using errcode = 'P0001'; end if;
  select id into emp from public.employees where tenant_id = p_tenant and work_email = p_email and status <> 'terminated';
  if emp is null then
    if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'ADMIN_NAME_REQUIRED' using errcode = 'P0001'; end if;
    select 'ADMIN' || lpad((coalesce(max(nullif(regexp_replace(employee_code, '^ADMIN', ''), '')::int), 0) + 1)::text, 2, '0') into new_code
    from public.employees where tenant_id = p_tenant and employee_code ~ '^ADMIN[0-9]+$';
    insert into public.employees (tenant_id, employee_code, full_name, work_email, hire_date, employment_type, status)
    values (p_tenant, new_code, trim(p_name), p_email, d, 'official', 'active') returning id into emp;
    select id into dep from public.departments where tenant_id = p_tenant order by (code = 'BGD') desc, created_at limit 1;
    select id into pos from public.positions where tenant_id = p_tenant order by (code = 'QTV') desc, created_at limit 1;
    if dep is not null and pos is not null then
      insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, effective_from)
      select p_tenant, emp, b.legal_entity_id, b.id, dep, pos, d
      from public.departments de join public.branches b on b.id = de.branch_id where de.id = dep;
    end if;
  end if;
  select id into mem from public.memberships where tenant_id = p_tenant and employee_id = emp;
  if mem is null then
    insert into public.memberships (tenant_id, employee_id, user_id, status)
    select p_tenant, emp, e.user_id, case when e.user_id is null then 'invited' else 'active' end from public.employees e where e.id = emp
    returning id into mem;
  end if;
  if not exists (
    select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id
    where ra.membership_id = mem and r.code = 'tenant_admin' and r.tenant_id is null and ra.scope_type = 'tenant'
      and ra.effective_from <= d and (ra.effective_to is null or ra.effective_to >= d)
  ) then
    insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
    select p_tenant, mem, r.id, 'tenant', d from public.roles r where r.code = 'tenant_admin' and r.tenant_id is null;
  end if;
  return emp;
end;
$$;

-- Tạo tenant + bộ mẫu + Tenant Admin đầu tiên trong một transaction
create or replace function public.create_tenant_with_admin(
  p_code text, p_name text, p_legal_name text, p_plan text, p_employee_limit integer, p_admin_name text, p_admin_email citext, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  emp uuid;
  prov jsonb;
begin
  insert into public.tenants (code, display_name, legal_name, status, plan_code, employee_limit)
  values (upper(trim(p_code)), trim(p_name), nullif(trim(coalesce(p_legal_name, '')), ''), 'active', p_plan, p_employee_limit)
  returning id into tid;
  prov := public.provision_tenant(tid, 'vn-default', p_actor);
  emp := public.grant_tenant_admin(tid, p_admin_name, p_admin_email, p_actor);
  return jsonb_build_object('tenant_id', tid, 'admin_employee_id', emp, 'provisioned', prov -> 'created');
end;
$$;

revoke all on function public.grant_tenant_admin(uuid, text, citext, uuid) from public, anon, authenticated;
revoke all on function public.create_tenant_with_admin(text, text, text, text, integer, text, citext, uuid) from public, anon, authenticated;
grant execute on function public.grant_tenant_admin(uuid, text, citext, uuid) to service_role;
grant execute on function public.create_tenant_with_admin(text, text, text, text, integer, text, citext, uuid) to service_role;

-- ---------- RLS: bảng nền tảng chỉ service role ----------
alter table public.platform_operators enable row level security;
alter table public.owner_recovery_requests enable row level security;
grant select, insert, update, delete on public.platform_operators, public.owner_recovery_requests to service_role;
