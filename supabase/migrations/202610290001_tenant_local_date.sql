-- "Hôm nay" theo múi giờ của công ty, không theo UTC của máy chủ DB.
-- Lỗi cũ (từ 202610230001): các hàm phân quyền/phạm vi mặc định dùng current_date (UTC), trong khi vai trò, phân công, ngày lễ được
-- ghi theo ngày giờ công ty (Asia/Ho_Chi_Minh = UTC+7). Từ 0:00 đến 7:00 giờ VN, vai trò/phân công tạo trong ngày chưa có hiệu lực
-- (Tenant Admin mới không hiện, quản lý chưa thấy nhân viên mới, …). Sửa: mọi so sánh ngày hiệu lực dùng tenant_today(tenant).
-- Chữ ký hàm giữ nguyên (p_date vẫn có giá trị mặc định nhưng là null → tính theo tenant) để không phải xóa policy đang dùng hàm.

create or replace function public.tenant_today(p_tenant uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce((select timezone from public.tenants where id = p_tenant), 'Asia/Ho_Chi_Minh'))::date;
$$;
revoke all on function public.tenant_today(uuid) from public, anon;
grant execute on function public.tenant_today(uuid) to authenticated, service_role;

create or replace function public.permission_scopes(p_user uuid, p_tenant uuid, p_perm text, p_date date default null)
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
    and ra.effective_from <= coalesce(p_date, public.tenant_today(p_tenant))
    and (ra.effective_to is null or ra.effective_to >= coalesce(p_date, public.tenant_today(p_tenant)));
$$;

-- Nhân viên trong phạm vi một permission, tính theo phân công (employee_assignments) đang hiệu lực vào ngày p_date (mặc định: hôm nay của tenant)
create or replace function public.scoped_employees(p_user uuid, p_tenant uuid, p_perm text, p_date date default null)
returns setof public.employees
language sql
stable
security definer
set search_path = public
as $$
  with d as (select coalesce(p_date, public.tenant_today(p_tenant)) as day),
  s as (select * from public.permission_scopes(p_user, p_tenant, p_perm, (select day from d))),
  me as (select id from public.employees where user_id = p_user and tenant_id = p_tenant)
  select e.* from public.employees e
  left join lateral (
    select a.legal_entity_id, a.branch_id, a.department_id, a.manager_employee_id
    from public.employee_assignments a
    where a.employee_id = e.id and a.is_primary and a.effective_from <= (select day from d) and (a.effective_to is null or a.effective_to >= (select day from d))
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

create or replace function public.permission_grants(p_user uuid, p_tenant uuid, p_date date default null)
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
    and ra.effective_from <= coalesce(p_date, public.tenant_today(p_tenant))
    and (ra.effective_to is null or ra.effective_to >= coalesce(p_date, public.tenant_today(p_tenant)));
$$;

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
    and ra.effective_from <= public.tenant_today(p_tenant) and (ra.effective_to is null or ra.effective_to >= public.tenant_today(p_tenant));
$$;

create or replace function public.guard_last_tenant_admin()
returns trigger
language plpgsql
as $$
declare
  was_admin boolean;
  d date := public.tenant_today(old.tenant_id);
begin
  if tg_table_name = 'memberships' then
    if old.status = 'active' and new.status <> 'active' then
      select exists (select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id
        where ra.membership_id = old.id and r.code = 'tenant_admin' and r.tenant_id is null
          and ra.effective_from <= d and (ra.effective_to is null or ra.effective_to >= d)) into was_admin;
      if was_admin and public.active_tenant_admin_count(old.tenant_id, old.id) = 0 then
        raise exception 'LAST_TENANT_ADMIN' using errcode = 'P0001', hint = 'Tenant phải còn ít nhất một Tenant Admin hoạt động';
      end if;
    end if;
    return new;
  end if;
  -- role_assignments: xóa hoặc cho hết hiệu lực
  if exists (select 1 from public.roles r where r.id = old.role_id and r.code = 'tenant_admin' and r.tenant_id is null)
     and exists (select 1 from public.memberships m where m.id = old.membership_id and m.status = 'active')
     and (tg_op = 'DELETE' or (new.effective_to is not null and new.effective_to < d))
     and public.active_tenant_admin_count(old.tenant_id, null, old.id) = 0 then
    raise exception 'LAST_TENANT_ADMIN' using errcode = 'P0001', hint = 'Tenant phải còn ít nhất một Tenant Admin hoạt động';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Ngày lễ đã qua không sửa/xóa — "đã qua" theo ngày của công ty sở hữu lịch (lịch quốc gia: giờ Việt Nam)
create or replace function public.holidays_guard_past()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then raise exception 'holidays is immutable'; end if;
  if old.holiday_date < public.tenant_today((select c.tenant_id from public.holiday_calendars c where c.id = old.calendar_id)) then
    raise exception 'HOLIDAY_IN_PAST' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
