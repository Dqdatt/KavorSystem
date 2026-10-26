-- Cơ cấu tổ chức + gán vai trò trên web HR (docs/plans/org-roles.md).
-- Quyền: organization.manage cho HR Ops + Tenant Admin (PERMISSION_MATRIX §4), role.assign chỉ Tenant Admin. Ghi qua API (service role).
-- Ràng buộc DB: đơn vị cha/chi nhánh/pháp nhân cùng tenant, phòng ban không tạo vòng, ngày kết thúc không trước ngày hiệu lực,
-- không gán trùng cùng vai trò + phạm vi đang mở.

insert into public.permissions (code, module, description) values
  ('role.assign','identity','Gán / thu hồi vai trò của người dùng trong công ty'),
  -- Có trong seed.sql nhưng seed chạy sau migration (và không chạy ở môi trường thật): tạo ở đây để gán được cho vai trò
  ('organization.manage','organization','Quản lý cơ cấu tổ chức')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'role.assign'
where r.tenant_id is null and r.is_system and r.code = 'tenant_admin'
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'organization.manage'
where r.tenant_id is null and r.is_system and r.code in ('hr_ops','tenant_admin')
on conflict do nothing;

alter table public.legal_entities add constraint legal_entities_dates check (effective_to is null or effective_to >= effective_from);
alter table public.branches add constraint branches_dates check (effective_to is null or effective_to >= effective_from);
alter table public.departments add constraint departments_dates check (effective_to is null or effective_to >= effective_from);
alter table public.positions add constraint positions_dates check (effective_to is null or effective_to >= effective_from);

create or replace function public.org_unit_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cur uuid;
  depth int := 0;
begin
  if tg_table_name = 'branches' then
    if not exists (select 1 from public.legal_entities where id = new.legal_entity_id and tenant_id = new.tenant_id) then
      raise exception 'ORG_PARENT_INVALID' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'departments' then
    if new.branch_id is not null and not exists (select 1 from public.branches where id = new.branch_id and tenant_id = new.tenant_id) then
      raise exception 'ORG_PARENT_INVALID' using errcode = 'P0001';
    end if;
    if new.parent_id is not null then
      if not exists (select 1 from public.departments where id = new.parent_id and tenant_id = new.tenant_id and branch_id is not distinct from new.branch_id) then
        raise exception 'ORG_PARENT_INVALID' using errcode = 'P0001';
      end if;
      cur := new.parent_id;
      while cur is not null loop
        if cur = new.id then raise exception 'ORG_CYCLE' using errcode = 'P0001'; end if;
        depth := depth + 1;
        if depth > 50 then raise exception 'ORG_CYCLE' using errcode = 'P0001'; end if;
        select parent_id into cur from public.departments where id = cur;
      end loop;
    end if;
  end if;
  return new;
end;
$$;
create trigger branches_org_guard before insert or update of legal_entity_id, tenant_id on public.branches
  for each row execute function public.org_unit_guard();
create trigger departments_org_guard before insert or update of branch_id, parent_id, tenant_id on public.departments
  for each row execute function public.org_unit_guard();

-- Không gán trùng cùng người + vai trò + phạm vi khi bản gán cũ chưa có ngày kết thúc
create unique index role_assignments_open_unique on public.role_assignments
  (membership_id, role_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) where effective_to is null;
