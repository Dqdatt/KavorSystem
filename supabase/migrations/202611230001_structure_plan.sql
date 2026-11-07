-- "Sắp xếp tự động" ở Cơ cấu tổ chức: đặt cấp quản lý cho nhiều chức danh + đổi quản lý trực tiếp cho nhiều nhân viên trong một transaction.
-- Đổi quản lý giữ lịch sử như sửa hồ sơ: phân công bắt đầu đúng hôm nay thì sửa tại chỗ, còn lại đóng phân công cũ hôm qua và mở bản mới từ hôm nay.
-- API tính đề xuất và kiểm quyền; hàm chỉ ghi. Chỉ service role gọi được.

create or replace function public.apply_structure_plan(p_tenant uuid, p_today date, p_tiers jsonb, p_managers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u jsonb;
  cur public.employee_assignments%rowtype;
  tiers int := 0;
  moved int := 0;
  mgr uuid;
begin
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_typeof(p_managers) <> 'array' then raise exception 'STRUCTURE_INVALID' using errcode = 'P0001'; end if;
  for u in select * from jsonb_array_elements(p_tiers) loop
    update public.positions set management_tier = (u->>'tier')::smallint, updated_at = now()
    where id = (u->>'id')::uuid and tenant_id = p_tenant and management_tier is distinct from (u->>'tier')::smallint;
    if found then tiers := tiers + 1; end if;
  end loop;
  for u in select * from jsonb_array_elements(p_managers) loop
    mgr := (u->>'manager_id')::uuid;
    if not exists (select 1 from public.employees where id = mgr and tenant_id = p_tenant and status <> 'terminated') then
      raise exception 'STRUCTURE_MANAGER_INVALID' using errcode = 'P0001';
    end if;
    select * into cur from public.employee_assignments
    where tenant_id = p_tenant and employee_id = (u->>'employee_id')::uuid and is_primary
      and effective_from <= p_today and (effective_to is null or effective_to >= p_today)
    order by effective_from desc limit 1;
    if not found or cur.manager_employee_id is not distinct from mgr then continue; end if;
    if cur.effective_from = p_today then
      update public.employee_assignments set manager_employee_id = mgr where id = cur.id;
    else
      update public.employee_assignments set effective_to = p_today - 1 where id = cur.id;
      insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, is_primary, effective_from, effective_to)
      values (cur.tenant_id, cur.employee_id, cur.legal_entity_id, cur.branch_id, cur.department_id, cur.position_id, mgr, true, p_today, cur.effective_to);
    end if;
    moved := moved + 1;
  end loop;
  return jsonb_build_object('tiers', tiers, 'managers', moved);
end;
$$;
revoke all on function public.apply_structure_plan(uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_structure_plan(uuid, date, jsonb, jsonb) to service_role;
