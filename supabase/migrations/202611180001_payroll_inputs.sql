-- Dữ liệu lương đầu vào do HCNS quản lý (giai đoạn A) + bảng lương đầu vào theo kỳ (giai đoạn B).
-- Quy trình thực tế: HCNS lập bảng gồm công, thông tin người lao động, mức lương, người phụ thuộc, tình trạng lao động → Kế toán
-- tính lương chi tiết (BHXH, thuế, công đoàn, thực nhận) bên ngoài rồi nhập kết quả ở Kỳ lương (module payroll đã có).
-- 1. HCNS (Nhân sự vận hành, Quản trị viên công ty) được xem/sửa lương đầu vào (compensation.read/manage) trong phạm vi vai trò.
--    Quản lý trực tiếp vẫn không thấy lương. Duyệt/công bố kỳ lương vẫn chỉ Kế toán (payroll.*).
-- 2. Phiên bản lương (employee_compensations) thêm lương đóng bảo hiểm, phụ cấp cố định, tình trạng lao động theo ngày hiệu lực
--    (thử việc → chính thức giữa kỳ thì bảng đầu vào tách hai đoạn).
-- 3. Mã số thuế cá nhân + đoàn viên công đoàn; người phụ thuộc (giảm trừ gia cảnh) theo tháng bắt đầu/kết thúc.
-- 4. payroll_input_sheets: ảnh chụp bảng đầu vào HCNS chốt cho một tháng (bất biến; chốt lại = bản mới).

-- ---------- 1. Quyền ----------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in ('compensation.read','compensation.manage')
where r.tenant_id is null and r.is_system and r.code in ('hr_ops','tenant_admin')
on conflict do nothing;

-- ---------- 2. Phiên bản lương ----------
alter table public.employee_compensations
  add column insurance_salary bigint check (insurance_salary is null or (insurance_salary > 0 and insurance_salary <= 10000000000)),
  add column allowance bigint not null default 0 check (allowance >= 0 and allowance <= 10000000000),
  add column employment_type text check (employment_type is null or employment_type in ('probation','official','contractor','intern'));
comment on column public.employee_compensations.insurance_salary is 'Lương đóng BHXH; null = bằng lương cơ bản';
comment on column public.employee_compensations.allowance is 'Tổng phụ cấp cố định/tháng (₫)';
comment on column public.employee_compensations.employment_type is 'Tình trạng lao động từ ngày hiệu lực; null = theo hồ sơ (employees.employment_type)';

-- ---------- 3. Thuế/công đoàn + người phụ thuộc ----------
create table public.employee_tax_profiles (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  tax_code text check (tax_code ~ '^[0-9]{10}([0-9]{2}|-[0-9]{3})?$'),
  union_member boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.employee_dependents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 1 and 100),
  relation text not null check (length(trim(relation)) between 1 and 50),
  birth_date date,
  tax_code text check (tax_code ~ '^[0-9]{10}([0-9]{2}|-[0-9]{3})?$'),
  -- Tháng bắt đầu/kết thúc tính giảm trừ (YYYY-MM); to_month null = đang tính
  from_month text not null check (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  to_month text check (to_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_month is null or to_month >= from_month)
);
create index employee_dependents_employee_idx on public.employee_dependents (employee_id);

-- ---------- 4. Bảng lương đầu vào đã chốt ----------
create table public.payroll_input_sheets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  period_start date not null,
  period_end date not null,
  -- Ảnh chụp các dòng (có số tiền lương) — chỉ API đọc, client không có quyền SELECT
  rows jsonb not null,
  employee_count int not null check (employee_count >= 0),
  note text check (length(note) <= 500),
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz not null default now()
);
create index payroll_input_sheets_month_idx on public.payroll_input_sheets (tenant_id, month, finalized_at desc);

create or replace function public.payroll_input_sheets_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'PAYROLL_INPUT_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger payroll_input_sheets_guard before update or delete on public.payroll_input_sheets
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '')
  execute function public.payroll_input_sheets_guard();

-- ---------- 5. RLS ----------
alter table public.employee_tax_profiles enable row level security;
alter table public.employee_dependents enable row level security;
alter table public.payroll_input_sheets enable row level security;
create policy employee_tax_profiles_read on public.employee_tax_profiles for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('compensation.read', tenant_id, employee_id));
create policy employee_dependents_read on public.employee_dependents for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('compensation.read', tenant_id, employee_id));
grant select on public.employee_tax_profiles, public.employee_dependents to authenticated;
-- payroll_input_sheets: không có policy cho client (dữ liệu tổng hợp nhiều người, đọc qua API có kiểm phạm vi)
