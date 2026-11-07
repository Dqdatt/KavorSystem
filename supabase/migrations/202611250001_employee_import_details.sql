-- Nhập nhân viên giai đoạn 2: hồ sơ cá nhân, giấy tờ, ngân hàng, thuế, lương từ file. Chỉ ĐIỀN CHỖ ĐANG TRỐNG (không ghi đè dữ liệu
-- đã có/đã duyệt qua đề nghị sửa hồ sơ); lương chỉ tạo phiên bản đầu tiên khi nhân viên chưa có. API lọc quyền (employee.sensitive.read cho
-- giấy tờ/ngân hàng/thuế, compensation.manage cho lương) trước khi gọi. Không ghi giá trị vào audit.

alter table public.employee_profiles
  add column birth_date date check (birth_date is null or birth_date between '1900-01-01' and '2100-01-01'),
  add column gender text check (gender is null or gender in ('male','female','other')),
  add column id_number text check (id_number is null or id_number ~ '^[0-9]{9}([0-9]{3})?$'),
  add column id_issued_on date,
  add column id_issued_by text check (length(id_issued_by) <= 200),
  add column permanent_address text check (length(permanent_address) <= 300),
  add column social_insurance_no text check (social_insurance_no is null or social_insurance_no ~ '^[0-9]{10}$');
comment on column public.employee_profiles.address is 'Địa chỉ hiện tại (tạm trú/liên hệ)';

create or replace function public.import_employee_details(p_tenant uuid, p_by uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb; d jsonb; emp public.employees%rowtype; n int := 0; touched boolean;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'IMPORT_INVALID' using errcode = 'P0001'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into emp from public.employees where tenant_id = p_tenant and employee_code = it->>'code';
    if not found then continue; end if;
    d := it->'details'; touched := false;
    if d ?| array['birth_date','gender','id_number','id_issued_on','id_issued_by','permanent_address','address','social_insurance_no'] then
      insert into public.employee_profiles (employee_id, tenant_id, birth_date, gender, id_number, id_issued_on, id_issued_by, permanent_address, address, social_insurance_no)
      values (emp.id, p_tenant, (d->>'birth_date')::date, d->>'gender', d->>'id_number', (d->>'id_issued_on')::date, d->>'id_issued_by', d->>'permanent_address', d->>'address', d->>'social_insurance_no')
      on conflict (employee_id) do update set
        birth_date = coalesce(employee_profiles.birth_date, excluded.birth_date), gender = coalesce(employee_profiles.gender, excluded.gender),
        id_number = coalesce(employee_profiles.id_number, excluded.id_number), id_issued_on = coalesce(employee_profiles.id_issued_on, excluded.id_issued_on),
        id_issued_by = coalesce(employee_profiles.id_issued_by, excluded.id_issued_by), permanent_address = coalesce(employee_profiles.permanent_address, excluded.permanent_address),
        address = coalesce(employee_profiles.address, excluded.address), social_insurance_no = coalesce(employee_profiles.social_insurance_no, excluded.social_insurance_no),
        updated_at = now();
      touched := true;
    end if;
    if d ? 'tax_code' then
      insert into public.employee_tax_profiles (employee_id, tenant_id, tax_code, updated_by) values (emp.id, p_tenant, d->>'tax_code', p_by)
      on conflict (employee_id) do update set tax_code = coalesce(employee_tax_profiles.tax_code, excluded.tax_code), updated_at = now();
      touched := true;
    end if;
    if d ? 'bank' then
      insert into public.employee_bank_accounts (employee_id, tenant_id, bank_name, account_no, holder)
      values (emp.id, p_tenant, d->'bank'->>'bank_name', d->'bank'->>'account_no', d->'bank'->>'holder')
      on conflict (employee_id) do nothing;
      touched := true;
    end if;
    if d ? 'comp' and not exists (select 1 from public.employee_compensations where employee_id = emp.id) then
      perform public.add_employee_compensation(p_tenant, emp.id, (d->'comp'->>'base')::bigint, nullif(d->'comp'->>'insurance', '')::bigint,
        null, emp.hire_date, 'Nhập từ file', p_by, '[]'::jsonb);
      touched := true;
    end if;
    if touched then n := n + 1; end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.import_employee_details(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_employee_details(uuid, uuid, jsonb) to service_role;

-- Nhập nguyên khối: đơn vị + hồ sơ + chi tiết trong một transaction
drop function if exists public.import_employees_with_units(uuid, jsonb, jsonb, jsonb, jsonb);
create function public.import_employees_with_units(p_tenant uuid, p_departments jsonb, p_positions jsonb, p_rows jsonb,
  p_position_tiers jsonb default '[]'::jsonb, p_details jsonb default '[]'::jsonb, p_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u jsonb; ids jsonb := '{}'::jsonb; pids jsonb := '{}'::jsonb; new_id uuid; rows jsonb := '[]'::jsonb; r jsonb; created jsonb;
begin
  if jsonb_typeof(p_departments) <> 'array' or jsonb_typeof(p_positions) <> 'array' or jsonb_typeof(p_rows) <> 'array'
     or jsonb_typeof(p_position_tiers) <> 'array' or jsonb_typeof(p_details) <> 'array' then
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
  created := case when jsonb_array_length(rows) > 0 then public.import_employees(p_tenant, rows) else '[]'::jsonb end;
  perform public.import_employee_details(p_tenant, p_by, p_details);
  return created;
end;
$$;
revoke all on function public.import_employees_with_units(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.import_employees_with_units(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) to service_role;
