-- Nhập nhân viên từ file bất kỳ (docs/plans/employee-import.md, giai đoạn 1).
-- 1. Cách khớp cột/giá trị HR đã xác nhận được nhớ theo công ty: lần sau cùng mẫu file thì tự nhận hết. Chỉ lưu tên cột đã chuẩn hóa
--    và tên phòng ban/chức danh → mã, không lưu dữ liệu nhân viên. Client không đọc trực tiếp (API service role).
-- 2. import_employees_with_units: tạo phòng ban/chức danh mới (nếu file có) rồi nhập hồ sơ trong cùng một transaction.

create table public.employee_import_mappings (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  columns jsonb not null default '{}'::jsonb check (jsonb_typeof(columns) = 'object'),
  department_values jsonb not null default '{}'::jsonb check (jsonb_typeof(department_values) = 'object'),
  position_values jsonb not null default '{}'::jsonb check (jsonb_typeof(position_values) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.employee_import_mappings enable row level security;
revoke all on public.employee_import_mappings from anon, authenticated;

-- Đơn vị mới hiệu lực từ ngày vào làm sớm nhất của người thuộc đơn vị đó (hồ sơ cũ có phân công từ trước hôm nay)
create or replace function public.import_employees_with_units(p_tenant uuid, p_departments jsonb, p_positions jsonb, p_rows jsonb)
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
  if jsonb_typeof(p_departments) <> 'array' or jsonb_typeof(p_positions) <> 'array' or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'IMPORT_INVALID' using errcode = 'P0001';
  end if;
  for u in select * from jsonb_array_elements(p_departments) loop
    if not exists (select 1 from public.branches b where b.id = (u->>'branch_id')::uuid and b.tenant_id = p_tenant) then
      raise exception 'IMPORT_BRANCH_INVALID' using errcode = 'P0001';
    end if;
    insert into public.departments (tenant_id, branch_id, code, name, effective_from)
    values (p_tenant, (u->>'branch_id')::uuid, u->>'code', u->>'name', (u->>'effective_from')::date)
    returning id into new_id;
    ids := ids || jsonb_build_object(u->>'code', new_id);
  end loop;
  for u in select * from jsonb_array_elements(p_positions) loop
    insert into public.positions (tenant_id, code, name, effective_from)
    values (p_tenant, u->>'code', u->>'name', (u->>'effective_from')::date)
    returning id into new_id;
    pids := pids || jsonb_build_object(u->>'code', new_id);
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
revoke all on function public.import_employees_with_units(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_employees_with_units(uuid, jsonb, jsonb, jsonb) to service_role;
