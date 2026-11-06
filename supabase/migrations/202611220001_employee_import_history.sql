-- Nhập nhân viên giai đoạn 1b: (1) nhập cả người đã nghỉ việc để tra cứu (hồ sơ terminated + ngày nghỉ, phân công đóng tại ngày nghỉ, không tính
-- vào giới hạn gói); (2) đơn vị chỉ có người đã nghỉ được tạo ở trạng thái đã ngừng; (3) chức danh mới có cấp quản lý suy từ tên (hệ cấp bậc
-- chuẩn), chức danh có sẵn chưa đặt cấp được đặt theo lựa chọn ở màn xem trước (không ghi đè cấp đã có).

create or replace function public.import_employees(p_tenant uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  created jsonb := '[]'::jsonb;
  ids jsonb := '{}'::jsonb;
  new_id uuid;
  mgr uuid;
  left_on date;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'IMPORT_INVALID' using errcode = 'P0001'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.employees (tenant_id, employee_code, full_name, work_email, phone, hire_date, termination_date, employment_type, status, source_system)
    values (p_tenant, r->>'code', r->>'full_name', nullif(r->>'work_email', ''), nullif(r->>'phone', ''), (r->>'hire_date')::date,
      nullif(r->>'termination_date', '')::date, r->>'employment_type', coalesce(nullif(r->>'status', ''), 'active'), 'import')
    on conflict (tenant_id, employee_code) do nothing
    returning id into new_id;
    if new_id is not null then
      ids := ids || jsonb_build_object(r->>'code', new_id);
      created := created || jsonb_build_object('code', r->>'code', 'id', new_id);
    end if;
  end loop;
  for r in select * from jsonb_array_elements(p_rows) loop
    if ids ? (r->>'code') then
      mgr := coalesce(nullif(r->>'manager_id', '')::uuid, (ids->>(r->>'manager_code'))::uuid);
      if nullif(r->>'manager_code', '') is not null and mgr is null then
        raise exception 'IMPORT_MANAGER_MISSING' using errcode = 'P0001';
      end if;
      left_on := nullif(r->>'assignment_to', '')::date;
      insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from, effective_to)
      values (p_tenant, (ids->>(r->>'code'))::uuid, (r->>'legal_entity_id')::uuid, (r->>'branch_id')::uuid, (r->>'department_id')::uuid, (r->>'position_id')::uuid, mgr,
        (r->>'hire_date')::date, case when left_on is null then null else greatest(left_on, (r->>'hire_date')::date) end);
    end if;
  end loop;
  return created;
end;
$$;
revoke all on function public.import_employees(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_employees(uuid, jsonb) to service_role;

drop function if exists public.import_employees_with_units(uuid, jsonb, jsonb, jsonb);
create function public.import_employees_with_units(p_tenant uuid, p_departments jsonb, p_positions jsonb, p_rows jsonb, p_position_tiers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u jsonb;
  ids jsonb := '{}'::jsonb;
  pids jsonb := '{}'::jsonb;
  new_id uuid;
  rows jsonb := '[]'::jsonb;
  r jsonb;
begin
  if jsonb_typeof(p_departments) <> 'array' or jsonb_typeof(p_positions) <> 'array' or jsonb_typeof(p_rows) <> 'array' or jsonb_typeof(p_position_tiers) <> 'array' then
    raise exception 'IMPORT_INVALID' using errcode = 'P0001';
  end if;
  for u in select * from jsonb_array_elements(p_departments) loop
    if not exists (select 1 from public.branches b where b.id = (u->>'branch_id')::uuid and b.tenant_id = p_tenant) then
      raise exception 'IMPORT_BRANCH_INVALID' using errcode = 'P0001';
    end if;
    insert into public.departments (tenant_id, branch_id, code, name, effective_from, effective_to)
    values (p_tenant, (u->>'branch_id')::uuid, u->>'code', u->>'name', (u->>'effective_from')::date, nullif(u->>'effective_to', '')::date)
    returning id into new_id;
    ids := ids || jsonb_build_object(u->>'code', new_id);
  end loop;
  for u in select * from jsonb_array_elements(p_positions) loop
    insert into public.positions (tenant_id, code, name, effective_from, effective_to, management_tier)
    values (p_tenant, u->>'code', u->>'name', (u->>'effective_from')::date, nullif(u->>'effective_to', '')::date, nullif(u->>'tier', '')::smallint)
    returning id into new_id;
    pids := pids || jsonb_build_object(u->>'code', new_id);
  end loop;
  -- Chỉ đặt cấp cho chức danh chưa có cấp (không ghi đè cấp HR đã đặt)
  for u in select * from jsonb_array_elements(p_position_tiers) loop
    update public.positions set management_tier = (u->>'tier')::smallint
    where id = (u->>'id')::uuid and tenant_id = p_tenant and management_tier is null;
  end loop;
  for r in select * from jsonb_array_elements(p_rows) loop
    if nullif(r->>'department_id', '') is null then r := r || jsonb_build_object('department_id', ids->>(r->>'department_code')); end if;
    if nullif(r->>'position_id', '') is null then r := r || jsonb_build_object('position_id', pids->>(r->>'position_code')); end if;
    if nullif(r->>'department_id', '') is null or nullif(r->>'position_id', '') is null then
      raise exception 'IMPORT_UNIT_MISSING' using errcode = 'P0001';
    end if;
    rows := rows || r;
  end loop;
  return public.import_employees(p_tenant, rows);
end;
$$;
revoke all on function public.import_employees_with_units(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_employees_with_units(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
