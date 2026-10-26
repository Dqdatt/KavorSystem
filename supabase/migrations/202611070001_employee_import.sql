-- Nhập nhân viên hàng loạt từ CSV (docs/plans/employee-import.md). API kiểm tra toàn file trước; hàm này ghi nguyên khối trong một
-- transaction: tạo hồ sơ + phân công đầu tiên (từ ngày vào làm), quản lý có thể là người có sẵn hoặc người trong cùng file.
-- Mã đã có thì bỏ qua (nhập lại cùng file không tạo trùng). Chỉ service role gọi được.

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
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'IMPORT_INVALID' using errcode = 'P0001'; end if;
  -- 1. Hồ sơ
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.employees (tenant_id, employee_code, full_name, work_email, phone, hire_date, employment_type, status, source_system)
    values (p_tenant, r->>'code', r->>'full_name', nullif(r->>'work_email', ''), nullif(r->>'phone', ''), (r->>'hire_date')::date, r->>'employment_type', 'active', 'import')
    on conflict (tenant_id, employee_code) do nothing
    returning id into new_id;
    if new_id is not null then
      ids := ids || jsonb_build_object(r->>'code', new_id);
      created := created || jsonb_build_object('code', r->>'code', 'id', new_id);
    end if;
  end loop;
  -- 2. Phân công (sau khi đủ hồ sơ để gắn quản lý trong cùng file)
  for r in select * from jsonb_array_elements(p_rows) loop
    if ids ? (r->>'code') then
      mgr := coalesce(nullif(r->>'manager_id', '')::uuid, (ids->>(r->>'manager_code'))::uuid);
      if nullif(r->>'manager_code', '') is not null and mgr is null then
        raise exception 'IMPORT_MANAGER_MISSING' using errcode = 'P0001';
      end if;
      insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from)
      values (p_tenant, (ids->>(r->>'code'))::uuid, (r->>'legal_entity_id')::uuid, (r->>'branch_id')::uuid, (r->>'department_id')::uuid, (r->>'position_id')::uuid, mgr, (r->>'hire_date')::date);
    end if;
  end loop;
  return created;
end;
$$;
revoke all on function public.import_employees(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_employees(uuid, jsonb) to service_role;
