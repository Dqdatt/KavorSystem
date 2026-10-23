-- Web HR/Admin cho module chấm công (ADR 0001):
-- 1. Quyền: role hệ thống + permission; phạm vi tính bằng một bộ hàm SQL dùng chung cho API (service role) và RLS.
-- 2. Tài khoản: membership gắn hồ sơ nhân viên, có thể tồn tại trước khi kích hoạt (để gán role cho HR được mời);
--    chặn khóa/kết thúc Tenant Admin cuối cùng.
-- 3. Ca và địa điểm có phiên bản bất biến; áp dụng theo tầng (công ty → pháp nhân → chi nhánh → phòng ban → cá nhân)
--    qua policy_assignments, tra theo ngày chứ không sao chép vào nhân viên.
-- 4. Thiết bị: HR duyệt/từ chối/thu hồi. 5. RLS cho HR + Realtime.

-- ---------- 1. Role và permission hệ thống ----------
insert into public.permissions (code, module, description) values
  ('tenant.read','tenant','Xem tenant hiện tại'),
  ('employee.self.read','people','Xem hồ sơ của chính mình'),
  ('attendance.self.clock','attendance','Chấm công của chính mình'),
  ('payroll.self.read','payroll','Xem phiếu lương của chính mình'),
  ('employee.read','people','Xem hồ sơ trong phạm vi'),
  ('employee.create','people','Tạo và import nhân viên'),
  ('employee.update','people','Cập nhật hồ sơ nhân viên'),
  ('organization.read','organization','Xem cơ cấu tổ chức'),
  ('membership.invite','identity','Gửi lời mời kích hoạt tài khoản'),
  ('membership.disable','identity','Khóa/mở khóa tài khoản đăng nhập'),
  ('role.read','identity','Xem vai trò và phân quyền'),
  ('attendance.read','attendance','Xem chấm công trong phạm vi'),
  ('attendance.device.manage','attendance','Duyệt, từ chối, thu hồi thiết bị chấm công'),
  ('schedule.read','attendance','Xem ca, địa điểm và cách áp dụng'),
  ('schedule.manage','attendance','Quản lý ca, địa điểm chấm công và áp dụng theo tầng'),
  ('audit.read','audit','Xem audit log trong phạm vi')
on conflict (code) do nothing;

insert into public.roles (tenant_id, code, name, is_system) values
  (null, 'tenant_admin', 'Tenant Admin', true),
  (null, 'hr_ops', 'HR Operations', true),
  (null, 'manager', 'Quản lý', true),
  (null, 'auditor', 'Kiểm soát', true),
  (null, 'employee', 'Nhân viên', true)
on conflict (tenant_id, code) do nothing;

-- Tenant Admin quản trị tài khoản/cấu hình; không mặc định có quyền lương (payroll.* không nằm ở đây)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'tenant_admin' then array['tenant.read','employee.read','employee.create','employee.update','organization.read','membership.invite','membership.disable','role.read','attendance.read','attendance.device.manage','schedule.read','schedule.manage','audit.read']
  when 'hr_ops' then array['tenant.read','employee.read','employee.create','employee.update','organization.read','membership.invite','membership.disable','attendance.read','attendance.device.manage','schedule.read','schedule.manage','audit.read']
  when 'manager' then array['tenant.read','employee.read','organization.read','attendance.read','schedule.read']
  when 'auditor' then array['tenant.read','employee.read','organization.read','role.read','attendance.read','schedule.read','audit.read']
  when 'employee' then array['tenant.read','employee.self.read','attendance.self.clock','payroll.self.read']
end)
where r.tenant_id is null and r.is_system
on conflict do nothing;

-- ---------- 2. Membership gắn hồ sơ nhân viên ----------
alter table public.memberships alter column user_id drop not null;
alter table public.memberships add column employee_id uuid references public.employees(id) on delete restrict;
alter table public.memberships add constraint memberships_employee_unique unique (tenant_id, employee_id);
alter table public.memberships add constraint memberships_user_or_employee check (user_id is not null or employee_id is not null);
-- Liên kết các membership đã có (nhân viên đã kích hoạt trước migration này)
update public.memberships m set employee_id = e.id
from public.employees e where e.user_id = m.user_id and e.tenant_id = m.tenant_id and m.employee_id is null;

alter table public.employees add column invited_at timestamptz;
alter table public.employees add column invite_count integer not null default 0;

-- Phạm vi role ở cấp vai trò hệ thống phải thuộc đúng tenant
create index role_assignments_membership_idx on public.role_assignments(membership_id);
create index employee_assignments_scope_idx on public.employee_assignments(tenant_id, department_id, branch_id);

-- Chặn khóa/kết thúc/gỡ Tenant Admin cuối cùng (ADR 0001 §1 "chống mất quyền")
create or replace function public.active_tenant_admin_count(p_tenant uuid, p_except_membership uuid default null, p_except_assignment uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct m.id)::int
  from public.memberships m
  join public.role_assignments ra on ra.membership_id = m.id
  join public.roles r on r.id = ra.role_id and r.code = 'tenant_admin' and r.tenant_id is null
  where m.tenant_id = p_tenant and m.status = 'active'
    and (p_except_membership is null or m.id <> p_except_membership)
    and (p_except_assignment is null or ra.id <> p_except_assignment)
    and ra.effective_from <= current_date and (ra.effective_to is null or ra.effective_to >= current_date);
$$;
revoke all on function public.active_tenant_admin_count(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.guard_last_tenant_admin()
returns trigger
language plpgsql
as $$
declare
  was_admin boolean;
begin
  if tg_table_name = 'memberships' then
    if old.status = 'active' and new.status <> 'active' then
      select exists (select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id
        where ra.membership_id = old.id and r.code = 'tenant_admin' and r.tenant_id is null
          and ra.effective_from <= current_date and (ra.effective_to is null or ra.effective_to >= current_date)) into was_admin;
      if was_admin and public.active_tenant_admin_count(old.tenant_id, old.id) = 0 then
        raise exception 'LAST_TENANT_ADMIN' using errcode = 'P0001', hint = 'Tenant phải còn ít nhất một Tenant Admin hoạt động';
      end if;
    end if;
    return new;
  end if;
  -- role_assignments: xóa hoặc cho hết hiệu lực
  if exists (select 1 from public.roles r where r.id = old.role_id and r.code = 'tenant_admin' and r.tenant_id is null)
     and exists (select 1 from public.memberships m where m.id = old.membership_id and m.status = 'active')
     and (tg_op = 'DELETE' or (new.effective_to is not null and new.effective_to < current_date))
     and public.active_tenant_admin_count(old.tenant_id, null, old.id) = 0 then
    raise exception 'LAST_TENANT_ADMIN' using errcode = 'P0001', hint = 'Tenant phải còn ít nhất một Tenant Admin hoạt động';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger memberships_last_admin before update of status on public.memberships
  for each row execute function public.guard_last_tenant_admin();
create trigger role_assignments_last_admin before update or delete on public.role_assignments
  for each row execute function public.guard_last_tenant_admin();

-- ---------- Phạm vi quyền (dùng chung API + RLS) ----------
-- Các phạm vi (scope_type, scope_id) mà người dùng có permission trong tenant tại một ngày
create or replace function public.permission_scopes(p_user uuid, p_tenant uuid, p_perm text, p_date date default current_date)
returns table (scope_type text, scope_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ra.scope_type, ra.scope_id
  from public.memberships m
  join public.role_assignments ra on ra.membership_id = m.id and ra.tenant_id = m.tenant_id
  join public.roles r on r.id = ra.role_id and (r.tenant_id is null or r.tenant_id = m.tenant_id)
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id and p.code = p_perm
  where m.user_id = p_user and m.tenant_id = p_tenant and m.status = 'active'
    and ra.effective_from <= p_date and (ra.effective_to is null or ra.effective_to >= p_date);
$$;

-- Nhân viên trong phạm vi một permission, tính theo phân công (employee_assignments) đang hiệu lực
create or replace function public.scoped_employees(p_user uuid, p_tenant uuid, p_perm text, p_date date default current_date)
returns setof public.employees
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from public.permission_scopes(p_user, p_tenant, p_perm, p_date)),
  me as (select id from public.employees where user_id = p_user and tenant_id = p_tenant)
  select e.* from public.employees e
  left join lateral (
    select a.legal_entity_id, a.branch_id, a.department_id, a.manager_employee_id
    from public.employee_assignments a
    where a.employee_id = e.id and a.is_primary and a.effective_from <= p_date and (a.effective_to is null or a.effective_to >= p_date)
    order by a.effective_from desc limit 1
  ) a on true
  where e.tenant_id = p_tenant and exists (
    select 1 from s where
      s.scope_type = 'tenant'
      or (s.scope_type = 'legal_entity' and a.legal_entity_id = s.scope_id)
      or (s.scope_type = 'branch' and a.branch_id = s.scope_id)
      or (s.scope_type = 'department' and a.department_id = s.scope_id)
      or (s.scope_type = 'self' and e.id in (select id from me))
      or (s.scope_type = 'direct_reports' and a.manager_employee_id in (select id from me))
  );
$$;

create or replace function public.employee_in_scope(p_user uuid, p_tenant uuid, p_perm text, p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.scoped_employees(p_user, p_tenant, p_perm) e where e.id = p_employee);
$$;

-- Hai hàm trên nhận p_user tùy ý nên chỉ API (service role) được gọi. RLS dùng bản bọc theo auth.uid().
revoke all on function public.permission_scopes(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public.scoped_employees(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public.employee_in_scope(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.permission_scopes(uuid, uuid, text, date) to service_role;
grant execute on function public.scoped_employees(uuid, uuid, text, date) to service_role;
grant execute on function public.employee_in_scope(uuid, uuid, text, uuid) to service_role;

create or replace function public.can_read_employee(p_perm text, p_tenant uuid, p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.employee_in_scope(auth.uid(), p_tenant, p_perm, p_employee);
$$;
create or replace function public.has_permission(p_perm text, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (select 1 from public.permission_scopes(auth.uid(), p_tenant, p_perm));
$$;
revoke all on function public.can_read_employee(text, uuid, uuid) from public, anon;
revoke all on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.can_read_employee(text, uuid, uuid) to authenticated;
grant execute on function public.has_permission(text, uuid) to authenticated;

-- ---------- 3. Ca, địa điểm có phiên bản và áp dụng theo tầng ----------
create table public.shift_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- Phiên bản bất biến; phiên bản áp dụng cho ngày D là phiên bản có effective_from lớn nhất ≤ D
create table public.shift_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  shift_id uuid not null references public.shift_definitions(id) on delete restrict,
  version_no integer not null,
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  late_grace_minutes integer not null default 0 check (late_grace_minutes between 0 and 120),
  early_grace_minutes integer not null default 0 check (early_grace_minutes between 0 and 120),
  effective_from date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shift_id, version_no),
  unique (shift_id, effective_from),
  -- Ca qua đêm chưa hỗ trợ ở bước này
  check (end_time > start_time),
  check ((break_start is null) = (break_end is null)),
  check (break_start is null or (break_start >= start_time and break_end <= end_time and break_end > break_start))
);

create table public.work_location_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  location_id uuid not null references public.work_locations(id) on delete restrict,
  version_no integer not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null check (radius_m between 3 and 5000),
  max_accuracy_m integer not null check (max_accuracy_m between 5 and 1000),
  effective_from date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (location_id, version_no),
  unique (location_id, effective_from)
);
-- Phiên bản 1 từ cấu hình hiện có của mỗi địa điểm
insert into public.work_location_versions (tenant_id, location_id, version_no, latitude, longitude, radius_m, max_accuracy_m, effective_from)
select tenant_id, id, 1, latitude, longitude, radius_m, max_accuracy_m, '2026-01-01' from public.work_locations;
-- Tọa độ/bán kính chỉ đọc từ bảng phiên bản; cột cũ giữ để không vỡ dữ liệu đã có, không dùng nữa
comment on column public.work_locations.latitude is 'Không dùng: xem work_location_versions';
alter table public.work_locations alter column latitude drop not null, alter column longitude drop not null;

-- Áp dụng chính sách theo tầng (DATABASE_SCHEMA §20). kind 'shift' → target là shift_definitions,
-- 'work_location' → target là work_locations. Ưu tiên: employee > department > branch > legal_entity > tenant.
create table public.policy_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  kind text not null check (kind in ('shift','work_location')),
  target_id uuid not null,
  scope_type text not null check (scope_type in ('tenant','legal_entity','branch','department','employee')),
  scope_id uuid,
  effective_from date not null,
  effective_to date,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_by uuid references auth.users(id) on delete set null,
  -- effective_to = effective_from - 1: đã hủy trước khi có hiệu lực
  check (effective_to is null or effective_to >= effective_from - 1),
  check ((scope_type = 'tenant') = (scope_id is null)),
  check (scope_type <> 'employee' or length(trim(coalesce(reason, ''))) >= 5)
);
create index policy_assignments_lookup_idx on public.policy_assignments(tenant_id, kind, scope_type, scope_id, effective_from);

-- Phiên bản là bất biến; assignment chỉ được đặt/rút ngắn ngày kết thúc
create or replace function public.immutable_row()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is immutable', tg_table_name;
end;
$$;
create trigger shift_versions_immutable before update or delete on public.shift_versions for each row execute function public.immutable_row();
create trigger work_location_versions_immutable before update or delete on public.work_location_versions for each row execute function public.immutable_row();

create or replace function public.policy_assignments_end_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then raise exception 'policy_assignments is append-only'; end if;
  if (new.tenant_id, new.kind, new.target_id, new.scope_type, new.scope_id, new.effective_from, new.reason, new.created_by, new.created_at)
     is distinct from (old.tenant_id, old.kind, old.target_id, old.scope_type, old.scope_id, old.effective_from, old.reason, old.created_by, old.created_at) then
    raise exception 'policy_assignments: only effective_to can change';
  end if;
  return new;
end;
$$;
create trigger policy_assignments_end_only before update or delete on public.policy_assignments for each row execute function public.policy_assignments_end_only();
create trigger shift_definitions_updated_at before update on public.shift_definitions for each row execute function public.set_updated_at();

-- ---------- 4. Thiết bị: HR duyệt/từ chối/thu hồi ----------
alter table public.employee_devices drop constraint employee_devices_status_check;
alter table public.employee_devices add constraint employee_devices_status_check check (status in ('active','pending','revoked','rejected'));
alter table public.employee_devices add column decided_by uuid references auth.users(id) on delete set null;
alter table public.employee_devices add column decided_at timestamptz;
alter table public.employee_devices add column decision_reason text;

-- Duyệt máy mới: thu hồi máy đang hoạt động rồi kích hoạt máy được duyệt, trong cùng một transaction
-- (mỗi nhân viên chỉ một máy hoạt động). Trả về id máy bị thay thế (nếu có).
create or replace function public.approve_device(p_device uuid, p_actor uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.employee_devices;
  replaced uuid;
begin
  select * into d from public.employee_devices where id = p_device for update;
  if not found or d.status <> 'pending' then
    raise exception 'DEVICE_NOT_PENDING' using errcode = 'P0001';
  end if;
  update public.employee_devices set status = 'revoked', revoked_at = now(), decided_by = p_actor, decided_at = now(),
    decision_reason = 'Thay bằng thiết bị mới được duyệt'
  where employee_id = d.employee_id and status = 'active' returning id into replaced;
  update public.employee_devices set status = 'active', decided_by = p_actor, decided_at = now(), decision_reason = p_reason
  where id = p_device;
  return replaced;
end;
$$;
revoke all on function public.approve_device(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_device(uuid, uuid, text) to service_role;

-- Toàn bộ quyền (permission + phạm vi + role) của một người dùng trong tenant; API dùng để dựng menu và kiểm tra
create or replace function public.permission_grants(p_user uuid, p_tenant uuid, p_date date default current_date)
returns table (permission text, role_code text, role_name text, scope_type text, scope_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.code, r.code, r.name, ra.scope_type, ra.scope_id
  from public.memberships m
  join public.role_assignments ra on ra.membership_id = m.id and ra.tenant_id = m.tenant_id
  join public.roles r on r.id = ra.role_id and (r.tenant_id is null or r.tenant_id = m.tenant_id)
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where m.user_id = p_user and m.tenant_id = p_tenant and m.status = 'active'
    and ra.effective_from <= p_date and (ra.effective_to is null or ra.effective_to >= p_date);
$$;
revoke all on function public.permission_grants(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.permission_grants(uuid, uuid, date) to service_role;
grant execute on function public.active_tenant_admin_count(uuid, uuid, uuid) to service_role;

-- ---------- 5. RLS ----------
alter table public.shift_definitions enable row level security;
alter table public.shift_versions enable row level security;
alter table public.work_location_versions enable row level security;
alter table public.policy_assignments enable row level security;

-- Hồ sơ nhân viên: chính mình hoặc trong phạm vi employee.read (trước đây mọi thành viên đọc được toàn bộ)
drop policy employees_same_tenant_read on public.employees;
create policy employees_self_or_scope_read on public.employees for select to authenticated
  using (user_id = auth.uid() or public.can_read_employee('employee.read', tenant_id, id));
drop policy employee_assignments_same_tenant_read on public.employee_assignments;
create policy employee_assignments_self_or_scope_read on public.employee_assignments for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('employee.read', tenant_id, employee_id));

-- Audit chứa dữ liệu trước/sau của hồ sơ: chỉ người có audit.read
drop policy audit_same_tenant_read on public.audit_logs;
create policy audit_permission_read on public.audit_logs for select to authenticated
  using (tenant_id is not null and public.has_permission('audit.read', tenant_id));

create policy attendance_events_scope_read on public.attendance_events for select to authenticated
  using (public.can_read_employee('attendance.read', tenant_id, employee_id));
create policy employee_devices_scope_read on public.employee_devices for select to authenticated
  using (public.can_read_employee('attendance.read', tenant_id, employee_id));

create policy shift_definitions_member_read on public.shift_definitions for select to authenticated using (public.is_active_member(tenant_id));
create policy shift_versions_member_read on public.shift_versions for select to authenticated using (public.is_active_member(tenant_id));
create policy work_location_versions_member_read on public.work_location_versions for select to authenticated using (public.is_active_member(tenant_id));
create policy policy_assignments_schedule_read on public.policy_assignments for select to authenticated
  using (public.has_permission('schedule.read', tenant_id));

grant select on public.shift_definitions, public.shift_versions, public.work_location_versions, public.policy_assignments to authenticated;
grant select, insert, update, delete on public.shift_definitions, public.shift_versions, public.work_location_versions, public.policy_assignments to service_role;

-- Realtime: web HR nhận tín hiệu thay đổi (RLS ở trên quyết định ai nhận) rồi gọi lại API
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.attendance_events, public.employee_devices, public.employees;
  end if;
end;
$$;
