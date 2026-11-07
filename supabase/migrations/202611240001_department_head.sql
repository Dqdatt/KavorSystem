-- Trưởng đơn vị của phòng ban: người phụ trách phòng (có thể thuộc phòng khác, vd. Ban Giám đốc kiêm nhiệm). Quy tắc quản lý mặc định
-- (Sắp xếp tự động, nhập file) dùng khi trong phòng không có ai cấp cao hơn. API kiểm người cùng công ty và đang làm; ghi qua API (service role).
alter table public.departments add column head_employee_id uuid references public.employees(id) on delete restrict;
create index departments_head_idx on public.departments (head_employee_id) where head_employee_id is not null;

-- Trưởng đơn vị phải cùng công ty với phòng ban
create or replace function public.department_head_same_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.head_employee_id is not null and not exists (select 1 from public.employees e where e.id = new.head_employee_id and e.tenant_id = new.tenant_id) then
    raise exception 'DEPARTMENT_HEAD_TENANT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger departments_head_same_tenant before insert or update of head_employee_id on public.departments
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.department_head_same_tenant();
