-- Đề nghị sửa hồ sơ nhân viên (docs/plans/profile-change.md). Người dùng chốt 26/10: nhân viên đề nghị sửa điện thoại, email cá nhân,
-- địa chỉ, liên hệ khẩn cấp và số tài khoản ngân hàng (thông tin hồ sơ); HR duyệt; Kế toán chỉ đọc lại thông tin đã duyệt.
-- Duyệt xong mới áp vào hồ sơ (trigger trong cùng transaction duyệt). Số tài khoản lưu riêng, nội dung đơn chỉ có 4 số cuối;
-- số đầy đủ chỉ chính nhân viên và người có employee.sensitive.read trong phạm vi xem được.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('employee.sensitive.read','employee','Xem số tài khoản ngân hàng đầy đủ của nhân viên trong phạm vi')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'employee.sensitive.read'
where r.tenant_id is null and r.is_system and r.code in ('hr_ops','tenant_admin','payroll')
on conflict do nothing;

-- ---------- 2. Hồ sơ cá nhân + tài khoản ngân hàng (điện thoại vẫn ở employees.phone) ----------
create table public.employee_profiles (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  personal_email citext check (length(personal_email) <= 200),
  address text check (length(address) <= 300),
  emergency_name text check (length(emergency_name) <= 100),
  emergency_phone text check (length(emergency_phone) <= 20),
  emergency_relation text check (length(emergency_relation) <= 50),
  source_request_id uuid references public.requests(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create table public.employee_bank_accounts (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  bank_name text not null check (length(trim(bank_name)) between 1 and 100),
  account_no text not null check (account_no ~ '^[0-9]{6,20}$'),
  holder text not null check (length(trim(holder)) between 1 and 100),
  source_request_id uuid references public.requests(id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- ---------- 3. Loại đơn ----------
alter table public.requests drop constraint requests_request_type_check;
alter table public.requests add constraint requests_request_type_check check (request_type in ('explanation','leave','overtime','salary_advance','profile_change'));
alter table public.workflow_definitions drop constraint workflow_definitions_request_type_check;
alter table public.workflow_definitions add constraint workflow_definitions_request_type_check check (request_type in ('explanation','leave','overtime','salary_advance','profile_change'));
-- Mỗi nhân viên một đề nghị sửa hồ sơ đang chờ
create unique index requests_one_pending_profile_change on public.requests (requester_employee_id)
  where request_type = 'profile_change' and status = 'pending';

-- Số tài khoản mới của đơn (bất biến), tách khỏi nội dung đơn để người xem đơn không thấy số đầy đủ
create table public.profile_change_bank (
  request_id uuid primary key references public.requests(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  bank_name text not null check (length(trim(bank_name)) between 1 and 100),
  account_no text not null check (account_no ~ '^[0-9]{6,20}$'),
  holder text not null check (length(trim(holder)) between 1 and 100)
);
create trigger profile_change_bank_immutable before update or delete on public.profile_change_bank for each row execute function public.immutable_row();

-- Tạo đơn nguyên tử: đơn + bước duyệt (create_request) + số tài khoản mới (nếu đổi).
-- p_payload: {"fields":[...], "before":{...}, "after":{...}, "reason"}; p_bank: {"bankName","accountNo","holder"} hoặc null
create or replace function public.create_profile_change_request(
  p_tenant uuid, p_employee uuid, p_user uuid, p_workflow_version uuid, p_payload jsonb, p_snapshot jsonb, p_tasks jsonb, p_bank jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public.create_request(p_tenant, 'HS', 'profile_change', p_employee, p_user, p_workflow_version, null, null, p_payload, p_snapshot, p_tasks);
  if p_bank is not null then
    insert into public.profile_change_bank (request_id, tenant_id, bank_name, account_no, holder)
    values ((r->>'id')::uuid, p_tenant, trim(p_bank->>'bankName'), p_bank->>'accountNo', trim(p_bank->>'holder'));
  end if;
  return r;
end;
$$;

-- Duyệt xong: áp các trường đã đổi vào hồ sơ (chỉ trường có trong "after")
create or replace function public.apply_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb;
  b public.profile_change_bank;
begin
  if new.request_type <> 'profile_change' or new.status <> 'approved' or old.status = 'approved' then return null; end if;
  select v.payload->'after' into a from public.request_versions v where v.request_id = new.id and v.version_no = new.current_version;
  if a ? 'phone' then
    update public.employees set phone = nullif(a->>'phone', ''), updated_at = now() where id = new.requester_employee_id;
  end if;
  if a ?| array['personalEmail','address','emergency'] then
    insert into public.employee_profiles (employee_id, tenant_id, personal_email, address, emergency_name, emergency_phone, emergency_relation, source_request_id, updated_at)
    values (new.requester_employee_id, new.tenant_id, nullif(a->>'personalEmail', ''), nullif(a->>'address', ''),
      nullif(a->'emergency'->>'name', ''), nullif(a->'emergency'->>'phone', ''), nullif(a->'emergency'->>'relation', ''), new.id, now())
    on conflict (employee_id) do update set
      personal_email = case when a ? 'personalEmail' then excluded.personal_email else employee_profiles.personal_email end,
      address = case when a ? 'address' then excluded.address else employee_profiles.address end,
      emergency_name = case when a ? 'emergency' then excluded.emergency_name else employee_profiles.emergency_name end,
      emergency_phone = case when a ? 'emergency' then excluded.emergency_phone else employee_profiles.emergency_phone end,
      emergency_relation = case when a ? 'emergency' then excluded.emergency_relation else employee_profiles.emergency_relation end,
      source_request_id = new.id, updated_at = now();
  end if;
  if a ? 'bank' then
    select * into b from public.profile_change_bank where request_id = new.id;
    if b.request_id is null then raise exception 'PROFILE_BANK_MISSING' using errcode = 'P0001'; end if;
    insert into public.employee_bank_accounts (employee_id, tenant_id, bank_name, account_no, holder, source_request_id, updated_at)
    values (new.requester_employee_id, new.tenant_id, b.bank_name, b.account_no, b.holder, new.id, now())
    on conflict (employee_id) do update set bank_name = excluded.bank_name, account_no = excluded.account_no, holder = excluded.holder,
      source_request_id = new.id, updated_at = now();
  end if;
  return null;
end;
$$;
create trigger requests_profile_apply after update of status on public.requests for each row execute function public.apply_profile_change();

-- ---------- 4. Bộ mẫu: luồng duyệt sửa hồ sơ chỉ HR ----------
update public.tenant_policy_templates
set content = jsonb_set(content, '{workflows}', coalesce(content->'workflows', '[]'::jsonb) || $json$[
  {"requestType": "profile_change", "name": "Sửa hồ sơ", "steps": [{"resolver": "hr", "slaHours": 48}]}
]$json$::jsonb),
  version = version + 1, updated_at = now()
where code = 'vn-default';

select public.provision_workflows(id) from public.tenants;

-- ---------- 5. Nhãn đơn trong thông báo: "Sửa điện thoại, tài khoản ngân hàng" ----------
create or replace function public.request_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type when 'explanation' then 'Giải trình công' when 'leave' then 'Nghỉ phép' when 'overtime' then 'Làm thêm giờ'
    when 'salary_advance' then 'Tạm ứng lương' when 'profile_change' then 'Sửa hồ sơ' else 'Đơn' end;
$$;

create or replace function public.request_label(p_request uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
  when r.request_type = 'leave' then concat_ws(' · ',
      v.payload->>'leaveTypeName',
      to_char((v.payload->>'from')::date, 'DD/MM') || case when v.payload->>'to' <> v.payload->>'from' then '–' || to_char((v.payload->>'to')::date, 'DD/MM') else '' end
        || case v.payload->>'half' when 'am' then ' (sáng)' when 'pm' then ' (chiều)' else '' end,
      replace(replace(to_char((v.payload->>'days')::numeric, 'FM990.0'), '.0', ''), '.', ',') || ' ngày')
  when r.request_type = 'overtime' then concat_ws(' · ',
      (array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from r.work_date)::int] || ' ' || to_char(r.work_date, 'DD/MM'),
      (v.payload->>'start') || '–' || (v.payload->>'end'),
      replace(replace(to_char((v.payload->>'hours')::numeric, 'FM990.0'), '.0', ''), '.', ',') || ' giờ')
  when r.request_type = 'salary_advance' then
      replace(to_char((v.payload->>'amount')::bigint, 'FM999G999G999G999'), ',', '.') || ' ₫ · trừ lương ' || to_char((v.payload->>'month' || '-01')::date, 'MM/YYYY')
  when r.request_type = 'profile_change' then
      'Sửa ' || (select string_agg(case f when 'phone' then 'điện thoại' when 'personalEmail' then 'email cá nhân' when 'address' then 'địa chỉ'
        when 'emergency' then 'liên hệ khẩn cấp' when 'bank' then 'tài khoản ngân hàng' else f end, ', ' order by n)
        from jsonb_array_elements_text(v.payload->'fields') with ordinality x(f, n))
  else concat_ws(' · ',
    case when r.work_date is not null then (array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from r.work_date)::int] || ' ' || to_char(r.work_date, 'DD/MM') end,
    case v.payload->>'kind' when 'missing_in' then 'quên chấm vào' when 'missing_out' then 'quên chấm ra' when 'late' then 'đến muộn có lý do'
      when 'early' then 'về sớm có lý do' when 'trip' then 'đi công tác' when 'device' then 'lỗi thiết bị/GPS' when 'other' then 'khác' end) end
  from public.requests r
  left join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;

-- ---------- 6. Quyền + RLS: client chỉ đọc; ghi qua API/trigger ----------
revoke all on function public.create_profile_change_request(uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_profile_change_request(uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.apply_profile_change() from public, anon, authenticated;

alter table public.employee_profiles enable row level security;
alter table public.employee_bank_accounts enable row level security;
alter table public.profile_change_bank enable row level security;
create policy employee_profiles_read on public.employee_profiles for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('employee.read', tenant_id, employee_id));
create policy employee_bank_accounts_read on public.employee_bank_accounts for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('employee.sensitive.read', tenant_id, employee_id));
create policy profile_change_bank_read on public.profile_change_bank for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and (r.requester_employee_id in (select public.current_employee_ids())
    or public.can_read_employee('employee.sensitive.read', r.tenant_id, r.requester_employee_id))));
grant select on public.employee_profiles, public.employee_bank_accounts, public.profile_change_bank to authenticated;
