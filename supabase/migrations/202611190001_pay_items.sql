-- Danh mục khoản thu nhập (phụ cấp/thưởng) do từng doanh nghiệp tự khai + số tiền từng khoản trong phiên bản lương.
-- Cách HR thực tế gọi: "lương cứng" (thỏa thuận lúc phỏng vấn) = lương cơ bản (đóng BH) + các khoản phụ cấp/thưởng; tạm ứng tính theo % lương cứng.
-- 1. pay_items: tên khoản, cách trả (chia theo công / cố định / có điều kiện), có tính đóng BH, cách tính thuế (chịu thuế / miễn / miễn đến
--    mức doanh nghiệp tự nhập), mức mặc định doanh nghiệp tự nhập (gợi ý khi nhập lương). Ngừng dùng = archived_at, không xóa.
--    Sửa được (có nhật ký); các kỳ đã chốt giữ tên/số tiền trong ảnh chụp.
-- 2. employee_compensation_items: số tiền từng khoản của một phiên bản lương (bất biến cùng phiên bản).
--    employee_compensations.allowance giữ vai trò tổng phụ cấp (= tổng các khoản) để tính lương cứng/tạm ứng nhanh.
-- 3. add_employee_compensation: ghi phiên bản + các khoản trong một giao dịch (chỉ service_role).
-- 4. Chuyển dữ liệu: phiên bản cũ có phụ cấp một con số → khoản "Phụ cấp khác" của doanh nghiệp đó.

create table public.pay_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  kind text not null default 'allowance' check (kind in ('allowance','bonus')),
  -- by_workdays: mức × công thực tế / công chuẩn · fixed: đủ tháng là trả đủ · conditional: có điều kiện (ví dụ chuyên cần)
  pay_mode text not null default 'by_workdays' check (pay_mode in ('by_workdays','fixed','conditional')),
  insurable boolean not null default false,
  -- taxable: chịu thuế toàn bộ · exempt: không chịu thuế · partial: miễn đến tax_free_cap/tháng (doanh nghiệp tự nhập theo quy định)
  tax_mode text not null default 'taxable' check (tax_mode in ('taxable','exempt','partial')),
  tax_free_cap bigint check (tax_free_cap is null or (tax_free_cap > 0 and tax_free_cap <= 10000000000)),
  default_amount bigint check (default_amount is null or (default_amount > 0 and default_amount <= 10000000000)),
  sort_order int not null default 0,
  note text check (note is null or length(note) <= 200),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tax_mode = 'partial' or tax_free_cap is null)
);
create unique index pay_items_name_uq on public.pay_items (tenant_id, lower(trim(name))) where archived_at is null;
create index pay_items_tenant_idx on public.pay_items (tenant_id, sort_order);

create table public.employee_compensation_items (
  compensation_id uuid not null references public.employee_compensations(id) on delete restrict,
  item_id uuid not null references public.pay_items(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  primary key (compensation_id, item_id)
);
create index employee_compensation_items_employee_idx on public.employee_compensation_items (employee_id);

create or replace function public.employee_compensation_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'COMPENSATION_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger employee_compensation_items_guard before update or delete on public.employee_compensation_items
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '')
  execute function public.employee_compensation_items_guard();

-- Khoản phải cùng doanh nghiệp, cùng nhân viên với phiên bản lương
create or replace function public.employee_compensation_items_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.employee_compensations c where c.id = new.compensation_id and c.tenant_id = new.tenant_id and c.employee_id = new.employee_id)
     or not exists (select 1 from public.pay_items i where i.id = new.item_id and i.tenant_id = new.tenant_id) then
    raise exception 'PAY_ITEM_MISMATCH' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger employee_compensation_items_check before insert on public.employee_compensation_items
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '')
  execute function public.employee_compensation_items_check();

-- Ghi phiên bản lương + khoản trong một giao dịch. p_items: [{"itemId": uuid, "amount": số}]. Trả id phiên bản.
create or replace function public.add_employee_compensation(
  p_tenant uuid, p_employee uuid, p_base bigint, p_insurance bigint, p_type text, p_from date, p_note text, p_by uuid, p_items jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_total bigint;
  v_bad int;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'PAY_ITEMS_INVALID' using errcode = 'P0001'; end if;
  select count(*) into v_bad from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
    left join public.pay_items i on i.id = (x->>'itemId')::uuid and i.tenant_id = p_tenant and i.archived_at is null
    where i.id is null;
  if v_bad > 0 then raise exception 'PAY_ITEM_NOT_FOUND' using errcode = 'P0001'; end if;
  select coalesce(sum((x->>'amount')::bigint), 0) into v_total from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
  insert into public.employee_compensations (tenant_id, employee_id, base_salary, insurance_salary, allowance, employment_type, effective_from, note, created_by)
  values (p_tenant, p_employee, p_base, p_insurance, v_total, p_type, p_from, p_note, p_by)
  returning id into v_id;
  insert into public.employee_compensation_items (compensation_id, item_id, tenant_id, employee_id, amount)
  select v_id, (x->>'itemId')::uuid, p_tenant, p_employee, (x->>'amount')::bigint from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
  return v_id;
end;
$$;
revoke all on function public.add_employee_compensation(uuid, uuid, bigint, bigint, text, date, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.add_employee_compensation(uuid, uuid, bigint, bigint, text, date, text, uuid, jsonb) to service_role;

-- Chuyển phụ cấp một con số cũ → khoản "Phụ cấp khác"
insert into public.pay_items (tenant_id, name, kind, pay_mode, sort_order, note)
select distinct c.tenant_id, 'Phụ cấp khác', 'allowance', 'by_workdays', 100, 'Tạo tự động từ phụ cấp nhập trước khi có danh mục'
from public.employee_compensations c where c.allowance > 0;
insert into public.employee_compensation_items (compensation_id, item_id, tenant_id, employee_id, amount)
select c.id, i.id, c.tenant_id, c.employee_id, c.allowance
from public.employee_compensations c join public.pay_items i on i.tenant_id = c.tenant_id and i.name = 'Phụ cấp khác'
where c.allowance > 0;

-- RLS: nhân viên thấy khoản của mình; người có compensation.read thấy theo phạm vi. Danh mục: thành viên đang hoạt động của doanh nghiệp.
alter table public.pay_items enable row level security;
alter table public.employee_compensation_items enable row level security;
create policy pay_items_read on public.pay_items for select to authenticated using (public.is_active_member(tenant_id));
create policy employee_compensation_items_read on public.employee_compensation_items for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('compensation.read', tenant_id, employee_id));
grant select on public.pay_items, public.employee_compensation_items to authenticated;
grant select, insert, update on public.pay_items to service_role;
grant select, insert on public.employee_compensation_items to service_role;
