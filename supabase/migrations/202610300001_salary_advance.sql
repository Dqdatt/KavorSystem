-- Tạm ứng lương (PILOT_RULEBOOK §9; PERMISSION_MATRIX "Payroll"; DATABASE_SCHEMA §11 salary_advances):
-- 1. Vai trò Kế toán (payroll) + permission xử lý tạm ứng, xem/nhập lương cơ bản. HR/Tenant Admin mặc định KHÔNG xem lương
--    (PERMISSION_MATRIX: dữ liệu lương là quyền nhạy cảm cấp riêng).
-- 2. Lương cơ bản theo phiên bản ngày hiệu lực (employee_compensations) — để tính hạn mức tạm ứng; payroll đầy đủ làm sau.
-- 3. Đơn tạm ứng dùng khung đơn từ + luồng duyệt; bước mới "Kế toán" (resolver payroll); bước có thể chỉ áp dụng khi số tiền
--    vượt ngưỡng ("amountOver"). Mẫu: Quản lý → HR (trên 5 triệu) → Kế toán.
-- 4. salary_advances: số tiền, tháng khấu trừ, đã chi (ai, khi nào, ghi chú). Mỗi tháng tối đa một đơn đang chờ/đã duyệt.
-- 5. Kế toán xác nhận đã chi → thông báo cho nhân viên. Khấu trừ vào lương do module payroll làm sau.
-- Tài khoản ngân hàng nhận tiền chưa lưu trong Kavor (dữ liệu nhạy cảm, cần mã hóa) — kế toán chuyển theo hồ sơ hiện có.

-- ---------- 1. Vai trò + permission ----------
insert into public.roles (tenant_id, code, name, is_system) values (null, 'payroll', 'Kế toán', true)
on conflict (tenant_id, code) do nothing;
insert into public.permissions (code, module, description) values
  ('salary_advance.process','payroll','Duyệt bước kế toán và xác nhận đã chi tạm ứng'),
  ('compensation.read','payroll','Xem lương cơ bản trong phạm vi'),
  ('compensation.manage','payroll','Nhập/đổi lương cơ bản')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'payroll' then array['salary_advance.process','compensation.read','compensation.manage','request.read','employee.read']
end)
where r.tenant_id is null and r.is_system and r.code = 'payroll'
on conflict do nothing;

-- ---------- 2. Lương cơ bản ----------
create table public.employee_compensations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  -- VND/tháng
  base_salary bigint not null check (base_salary > 0 and base_salary <= 10000000000),
  effective_from date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from)
);
create index employee_compensations_employee_idx on public.employee_compensations (employee_id, effective_from desc);
-- Đổi lương = bản ghi mới từ ngày hiệu lực; không sửa/xóa bản đã có
create or replace function public.employee_compensations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'COMPENSATION_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger employee_compensations_guard before update or delete on public.employee_compensations
  for each row execute function public.employee_compensations_guard();

-- ---------- 3. Bước Kế toán + đơn tạm ứng ----------
alter table public.approval_tasks drop constraint approval_tasks_resolver_check;
alter table public.approval_tasks add constraint approval_tasks_resolver_check check (resolver in ('direct_manager','hr','payroll'));
alter table public.requests drop constraint requests_request_type_check;
alter table public.requests add constraint requests_request_type_check check (request_type in ('explanation','leave','overtime','salary_advance'));
alter table public.workflow_definitions drop constraint workflow_definitions_request_type_check;
alter table public.workflow_definitions add constraint workflow_definitions_request_type_check check (request_type in ('explanation','leave','overtime','salary_advance'));

-- Người duyệt theo permission trong phạm vi người gửi (bước HR: request.hr_review; bước Kế toán: salary_advance.process)
create or replace function public.step_reviewers(p_tenant uuid, p_employee uuid, p_perm text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct e.id
  from public.memberships m
  join public.employees e on e.id = m.employee_id and e.tenant_id = m.tenant_id
  where m.tenant_id = p_tenant and m.status = 'active' and m.user_id is not null and e.id <> p_employee
    and public.employee_in_scope(m.user_id, p_tenant, p_perm, p_employee);
$$;

create or replace function public.task_assignees(p_task uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.assignee_employee_id from public.approval_tasks a
  where a.id = p_task and a.resolver = 'direct_manager' and a.assignee_employee_id is not null
  union
  select h from public.approval_tasks a join public.requests r on r.id = a.request_id,
    lateral public.step_reviewers(r.tenant_id, r.requester_employee_id, case a.resolver when 'hr' then 'request.hr_review' else 'salary_advance.process' end) h
  where a.id = p_task and a.resolver in ('hr', 'payroll');
$$;

create table public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  request_id uuid not null unique references public.requests(id) on delete restrict,
  amount bigint not null check (amount > 0),
  -- Tháng khấu trừ (ngày 1 của tháng)
  deduct_month date not null check (extract(day from deduct_month) = 1),
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  payout_note text,
  created_at timestamptz not null default now(),
  check ((paid_at is null) = (paid_by is null))
);
create index salary_advances_employee_idx on public.salary_advances (employee_id, deduct_month);

-- Mỗi tháng một đơn đang chờ/đã duyệt; chỉ được ghi nhận "đã chi" (một lần, khi đơn đã duyệt), không sửa gì khác
create or replace function public.salary_advances_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'ADVANCE_IMMUTABLE' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.salary_advances s join public.requests r on r.id = s.request_id
      where s.employee_id = new.employee_id and s.deduct_month = new.deduct_month and s.request_id <> new.request_id and r.status in ('pending','approved')
    ) then raise exception 'ADVANCE_MONTH_USED' using errcode = 'P0001'; end if;
    return new;
  end if;
  if (to_jsonb(new) - 'paid_at' - 'paid_by' - 'payout_note') <> (to_jsonb(old) - 'paid_at' - 'paid_by' - 'payout_note') or old.paid_at is not null then
    raise exception 'ADVANCE_IMMUTABLE' using errcode = 'P0001';
  end if;
  if new.paid_at is not null and not exists (select 1 from public.requests r where r.id = new.request_id and r.status = 'approved') then
    raise exception 'ADVANCE_NOT_APPROVED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger salary_advances_guard before insert or update or delete on public.salary_advances
  for each row execute function public.salary_advances_guard();

create or replace function public.create_advance_request(
  p_tenant uuid, p_employee uuid, p_user uuid, p_workflow_version uuid, p_period_start date,
  p_payload jsonb, p_snapshot jsonb, p_tasks jsonb, p_amount bigint, p_deduct_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public.create_request(p_tenant, 'TU', 'salary_advance', p_employee, p_user, p_workflow_version, null, p_period_start, p_payload, p_snapshot, p_tasks);
  insert into public.salary_advances (tenant_id, employee_id, request_id, amount, deduct_month) values (p_tenant, p_employee, (r->>'id')::uuid, p_amount, p_deduct_month);
  return r;
end;
$$;

-- ---------- 5. Thông báo đã chi ----------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval.pending','approval.due','request.approved','request.rejected','device.approved','device.rejected','advance.paid'));

create or replace function public.notify_advance_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
begin
  if old.paid_at is not null or new.paid_at is null then return null; end if;
  select * into r from public.requests where id = new.request_id;
  perform public.notify(new.tenant_id, new.employee_id, 'advance.paid', 'Tạm ứng ' || r.request_no || ' đã chi',
    replace(to_char(new.amount, 'FM999G999G999G999'), ',', '.') || ' ₫ · trừ vào lương ' || to_char(new.deduct_month, 'MM/YYYY')
      || coalesce(' · ' || nullif(new.payout_note, ''), ''),
    'request', r.id, r.request_no, null, 'paid:' || new.id);
  return null;
end;
$$;
create trigger salary_advances_notify_paid after update of paid_at on public.salary_advances
  for each row execute function public.notify_advance_paid();

-- Nội dung đơn tạm ứng trong thông báo: "2.000.000 ₫ · trừ lương 10/2026"
create or replace function public.request_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type when 'explanation' then 'Giải trình công' when 'leave' then 'Nghỉ phép' when 'overtime' then 'Làm thêm giờ'
    when 'salary_advance' then 'Tạm ứng lương' else 'Đơn' end;
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
  else concat_ws(' · ',
    case when r.work_date is not null then (array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from r.work_date)::int] || ' ' || to_char(r.work_date, 'DD/MM') end,
    case v.payload->>'kind' when 'missing_in' then 'quên chấm vào' when 'missing_out' then 'quên chấm ra' when 'late' then 'đến muộn có lý do'
      when 'early' then 'về sớm có lý do' when 'trip' then 'đi công tác' when 'device' then 'lỗi thiết bị/GPS' when 'other' then 'khác' end) end
  from public.requests r
  left join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;

-- ---------- Bộ mẫu: quy định tạm ứng thêm hạn nhận đơn + tối thiểu; luồng duyệt tạm ứng ----------
update public.tenant_policy_templates
set content = jsonb_set(content, '{policies}', (
    select jsonb_agg(case when p->>'kind' = 'salary_advance' then jsonb_set(p, '{config}', p->'config' || '{"deadlineDay": 20, "minAmount": 500000}') else p end)
    from jsonb_array_elements(content->'policies') p))
  || jsonb_build_object('workflows', coalesce(content->'workflows', '[]'::jsonb) || $json$[
  {"requestType": "salary_advance", "name": "Tạm ứng lương", "steps": [{"resolver": "direct_manager", "slaHours": 24}, {"resolver": "hr", "slaHours": 24, "amountOver": 5000000}, {"resolver": "payroll", "slaHours": 24}]}
]$json$::jsonb),
  version = version + 1, updated_at = now()
where code = 'vn-default';

select public.provision_workflows(id) from public.tenants;

-- ---------- Quyền + RLS ----------
revoke all on function public.step_reviewers(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_advance_request(uuid, uuid, uuid, uuid, date, jsonb, jsonb, jsonb, bigint, date) from public, anon, authenticated;
grant execute on function public.step_reviewers(uuid, uuid, text) to service_role;
grant execute on function public.create_advance_request(uuid, uuid, uuid, uuid, date, jsonb, jsonb, jsonb, bigint, date) to service_role;

alter table public.employee_compensations enable row level security;
alter table public.salary_advances enable row level security;
-- Lương: chính mình hoặc người có compensation.read với nhân viên đó
create policy employee_compensations_read on public.employee_compensations for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('compensation.read', tenant_id, employee_id));
create policy salary_advances_read on public.salary_advances for select to authenticated using (public.can_read_request(request_id));
grant select on public.employee_compensations, public.salary_advances to authenticated;
grant select, insert on public.employee_compensations to service_role;
grant select, insert, update on public.salary_advances to service_role;
