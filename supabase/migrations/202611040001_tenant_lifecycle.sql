-- Vòng đời tenant + gói dịch vụ (docs/plans/console-ops.md phần A).
-- Tenant tạm khóa/đóng: RLS không trả gì cho người dùng của tenant; API chặn mọi request (AUTH_TENANT_SUSPENDED).
-- Đóng tenant là trạng thái cuối, không mở lại. Gói do Kavor duy trì; giới hạn nhân sự kiểm ở API khi thêm/khôi phục hồ sơ.

-- ---------- 1. Gói dịch vụ ----------
create table public.platform_plans (
  code text primary key check (code in ('trial','starter','growth','enterprise')),
  name text not null,
  -- null = theo hợp đồng (Console nhập giới hạn khi gán gói)
  employee_limit integer check (employee_limit is null or employee_limit > 0),
  summary text not null,
  sort smallint not null
);
alter table public.platform_plans enable row level security;
-- Chỉ API (service role) đọc; không cấp cho client
insert into public.platform_plans (code, name, employee_limit, summary, sort) values
  ('trial', 'Dùng thử', 50, 'Đầy đủ tính năng trong thời gian dùng thử', 1),
  ('starter', 'Starter', 100, 'Core HR, công, phép, đơn từ', 2),
  ('growth', 'Growth', 500, 'Thêm payroll, tạm ứng, tài liệu, bản tin', 3),
  ('enterprise', 'Enterprise', null, 'Giới hạn và hỗ trợ theo hợp đồng', 4);

alter table public.tenants
  add column status_reason text check (status_reason is null or length(status_reason) <= 500),
  add column status_changed_at timestamptz;

-- ---------- 2. Đóng là trạng thái cuối; chỉ đóng tenant đang tạm khóa ----------
create or replace function public.tenants_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'closed' then raise exception 'TENANT_CLOSED' using errcode = 'P0001'; end if;
    if new.status = 'closed' and old.status <> 'suspended' then raise exception 'TENANT_CLOSE_REQUIRES_SUSPENDED' using errcode = 'P0001'; end if;
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;
create trigger tenants_status_guard before update of status on public.tenants
  for each row execute function public.tenants_status_guard();

-- ---------- 3. RLS: bỏ qua tenant tạm khóa/đã đóng ('provisioning' vẫn như cũ) ----------
create or replace function public.is_active_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.tenants t on t.id = m.tenant_id and t.status not in ('suspended', 'closed')
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.current_employee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id from public.employees e
  join public.tenants t on t.id = e.tenant_id and t.status not in ('suspended', 'closed')
  where e.user_id = auth.uid();
$$;

create or replace function public.permission_scopes(p_user uuid, p_tenant uuid, p_perm text, p_date date default null)
returns table (scope_type text, scope_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ra.scope_type, ra.scope_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status not in ('suspended', 'closed')
  join public.role_assignments ra on ra.membership_id = m.id and ra.tenant_id = m.tenant_id
  join public.roles r on r.id = ra.role_id and (r.tenant_id is null or r.tenant_id = m.tenant_id)
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id and p.code = p_perm
  where m.user_id = p_user and m.tenant_id = p_tenant and m.status = 'active'
    and ra.effective_from <= coalesce(p_date, public.tenant_today(p_tenant))
    and (ra.effective_to is null or ra.effective_to >= coalesce(p_date, public.tenant_today(p_tenant)));
$$;

-- Hồ sơ của chính mình cũng chỉ đọc được khi tenant còn hoạt động và tài khoản chưa bị khóa
drop policy employees_self_or_scope_read on public.employees;
create policy employees_self_or_scope_read on public.employees for select to authenticated
  using ((user_id = auth.uid() and public.is_active_member(tenant_id)) or public.can_read_employee('employee.read', tenant_id, id));
