-- Payroll final_result_import: chỉ nhập kết quả, không tính lương/thuế trong Kavor.
-- SQL giữ nguyên tử, khóa kỳ và tách người nhập/người duyệt. Client chỉ SELECT qua RLS;
-- API (service_role) gọi hàm với actor đã xác thực, không DML trực tiếp kỳ/kết quả.
-- Đã chốt 25/10: chỉ mở lại approved → prepared; published/paid/closed chưa được mở lại.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('payroll.self.read','payroll','Xem phiếu lương đã công bố của chính mình'),
  ('payroll.read','payroll','Xem dữ liệu lương trong phạm vi'),
  ('payroll.config.manage','payroll','Quản lý thành phần lương của công ty'),
  ('payroll.import','payroll','Mở kỳ, nhập kết quả và gửi kiểm tra'),
  ('payroll.approve','payroll','Duyệt kỳ lương, khác người nhập lần cuối'),
  ('payroll.publish','payroll','Công bố, xác nhận đã trả và đóng kỳ lương'),
  ('payroll.cycle.reopen','payroll','Mở lại kỳ đã duyệt, cần cấp riêng và có lý do')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'payroll' then array['payroll.read','payroll.config.manage','payroll.import','payroll.approve','payroll.publish']
  when 'employee' then array['payroll.self.read']
end)
where r.tenant_id is null and r.is_system and r.code in ('payroll','employee')
on conflict do nothing;

-- ---------- 2. Bảng ----------
create table public.pay_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{0,49}$'),
  name text not null check (length(trim(name)) between 1 and 200),
  kind text not null check (kind in ('earning','deduction','net')),
  display_order smallint not null default 0,
  unique (tenant_id, code),
  unique (tenant_id, id),
  check ((code = 'NET') = (kind = 'net')),
  check (code <> 'ADVANCE' or kind = 'deduction')
);

create table public.payroll_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text not null default 'open' check (status in ('open','prepared','under_review','approved','published','paid','closed')),
  -- Lần thử nhập mới nhất, kể cả file có lỗi: không được duyệt lại kết quả cũ sau một file lỗi.
  latest_batch_id uuid,
  imported_by uuid references auth.users(id) on delete restrict,
  imported_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, month),
  unique (tenant_id, id),
  check (period_end >= period_start),
  check ((imported_by is null) = (imported_at is null)),
  check ((approved_by is null) = (approved_at is null)),
  check ((published_by is null) = (published_at is null)),
  check (approved_by is null or approved_by <> imported_by),
  check (status not in ('approved','published','paid','closed') or approved_by is not null),
  check (status not in ('published','paid','closed') or published_by is not null),
  check (status not in ('paid','closed') or paid_at is not null),
  check (status <> 'closed' or closed_at is not null)
);

create table public.payroll_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cycle_id uuid not null,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  total_rows integer not null check (total_rows >= 0),
  error_rows integer not null check (error_rows between 0 and total_rows),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, cycle_id, id),
  foreign key (tenant_id, cycle_id) references public.payroll_cycles(tenant_id, id) on delete restrict
);
alter table public.payroll_cycles add constraint payroll_cycles_latest_batch_fk
  foreign key (tenant_id, id, latest_batch_id) references public.payroll_import_batches(tenant_id, cycle_id, id) on delete restrict;
create index payroll_import_batches_cycle_idx on public.payroll_import_batches(cycle_id, created_at desc);

create table public.payroll_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cycle_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  batch_id uuid not null,
  gross bigint not null check (gross >= 0),
  deduction bigint not null check (deduction >= 0),
  net bigint not null,
  work_days numeric check (work_days >= 0 and work_days <= 31),
  note text check (length(note) <= 1000),
  unique (cycle_id, employee_id),
  unique (tenant_id, id),
  foreign key (tenant_id, cycle_id) references public.payroll_cycles(tenant_id, id) on delete restrict,
  foreign key (tenant_id, cycle_id, batch_id) references public.payroll_import_batches(tenant_id, cycle_id, id) on delete restrict,
  check (net = gross - deduction)
);
create index payroll_results_employee_idx on public.payroll_results(tenant_id, employee_id, cycle_id);

create table public.payroll_result_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  result_id uuid not null,
  component_id uuid not null,
  amount bigint not null,
  label text check (length(trim(label)) between 1 and 200),
  -- Chụp lúc nhập: phiếu không đổi theo danh mục về sau.
  component_code text not null,
  component_name text not null,
  component_kind text not null check (component_kind in ('earning','deduction','net')),
  display_order smallint not null,
  unique (result_id, component_id),
  foreign key (tenant_id, result_id) references public.payroll_results(tenant_id, id) on delete restrict,
  foreign key (tenant_id, component_id) references public.pay_components(tenant_id, id) on delete restrict,
  check (component_kind = 'net' or amount >= 0)
);

create table public.payroll_cycle_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cycle_id uuid not null,
  action text not null check (action in ('created','import_recorded','replaced','submit','approve','publish','paid','close','reopen','advance_mismatch')),
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  batch_id uuid,
  employee_id uuid references public.employees(id) on delete restrict,
  reason text check (length(reason) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, cycle_id) references public.payroll_cycles(tenant_id, id) on delete restrict,
  foreign key (tenant_id, cycle_id, batch_id) references public.payroll_import_batches(tenant_id, cycle_id, id) on delete restrict,
  check (action <> 'reopen' or length(trim(coalesce(reason, ''))) >= 5)
);
create index payroll_cycle_events_cycle_idx on public.payroll_cycle_events(cycle_id, created_at);
create unique index payroll_cycle_events_batch_applied on public.payroll_cycle_events(batch_id) where action = 'replaced';
create trigger payroll_cycle_events_immutable before update or delete on public.payroll_cycle_events
  for each row execute function public.immutable_row();
create trigger payroll_import_batches_immutable before update or delete on public.payroll_import_batches
  for each row execute function public.immutable_row();

create table public.payslip_views (
  result_id uuid primary key references public.payroll_results(id) on delete restrict,
  viewed_at timestamptz not null default now()
);
create trigger payslip_views_immutable before update or delete on public.payslip_views
  for each row execute function public.immutable_row();

alter table public.salary_advances add column deducted_cycle_id uuid;
alter table public.salary_advances add constraint salary_advances_deducted_cycle_fk
  foreign key (tenant_id, deducted_cycle_id) references public.payroll_cycles(tenant_id, id) on delete restrict;
create index salary_advances_deducted_cycle_idx on public.salary_advances(deducted_cycle_id) where deducted_cycle_id is not null;

-- ---------- 3. Phạm vi kỳ: phải có quyền với TOÀN BỘ nhân viên, kỳ trống cần phạm vi tenant ----------
create or replace function public.payroll_cycle_in_scope(p_user uuid, p_cycle uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and exists (
    select 1 from public.payroll_cycles c where c.id = p_cycle
      and exists (select 1 from public.permission_scopes(p_user, c.tenant_id, p_perm))
      and (exists (select 1 from public.permission_scopes(p_user, c.tenant_id, p_perm) s where s.scope_type = 'tenant')
        or (exists (select 1 from public.payroll_results r where r.cycle_id = c.id)
          and not exists (select 1 from public.payroll_results r where r.cycle_id = c.id
            and not public.employee_in_scope(p_user, c.tenant_id, p_perm, r.employee_id))))
  );
$$;

create or replace function public.can_read_payroll_result(p_result uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.payroll_results r join public.payroll_cycles c on c.id = r.cycle_id
    where r.id = p_result and (
      public.employee_in_scope(auth.uid(), r.tenant_id, 'payroll.read', r.employee_id)
      or (c.status in ('published','paid','closed') and exists (
        select 1 from public.employees e where e.id = r.employee_id and e.user_id = auth.uid()
          and public.employee_in_scope(auth.uid(), r.tenant_id, 'payroll.self.read', e.id))))
  );
$$;

create or replace function public.can_read_payroll_cycle(p_cycle uuid, p_full boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (public.payroll_cycle_in_scope(auth.uid(), p_cycle, 'payroll.read')
    or (not p_full and exists (select 1 from public.payroll_results r where r.cycle_id = p_cycle
      and public.can_read_payroll_result(r.id))));
$$;

-- ---------- 4. Mẫu thành phần cho tenant cũ và tenant mới ----------
update public.tenant_policy_templates
set content = content || $json${"payComponents":[
  {"code":"BASE","name":"Lương cơ bản","kind":"earning","sort":1},
  {"code":"ALLOWANCE","name":"Phụ cấp","kind":"earning","sort":2},
  {"code":"OT_PAY","name":"Tiền làm thêm","kind":"earning","sort":3},
  {"code":"BONUS","name":"Thưởng","kind":"earning","sort":4},
  {"code":"UNPAID_LEAVE","name":"Khấu trừ nghỉ không lương","kind":"deduction","sort":5},
  {"code":"INSURANCE","name":"Bảo hiểm","kind":"deduction","sort":6},
  {"code":"PIT","name":"Thuế TNCN","kind":"deduction","sort":7},
  {"code":"ADVANCE","name":"Trừ tạm ứng","kind":"deduction","sort":8},
  {"code":"NET","name":"Thực lĩnh","kind":"net","sort":9}
]}$json$::jsonb, version = version + 1, updated_at = now()
where code = 'vn-default';

create or replace function public.provision_pay_components(p_tenant uuid, p_template text default 'vn-default')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'TENANT_NOT_FOUND'; end if;
  if not exists (select 1 from public.tenant_policy_templates where code = p_template) then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  insert into public.pay_components (tenant_id, code, name, kind, display_order)
  select p_tenant, x->>'code', x->>'name', x->>'kind', (x->>'sort')::smallint
  from public.tenant_policy_templates t, jsonb_array_elements(coalesce(t.content->'payComponents','[]'::jsonb)) x
  where t.code = p_template
  on conflict (tenant_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Giữ nguyên luồng cấp tenant của module nghỉ phép, chỉ bổ sung provision_pay_components.
create or replace function public.create_tenant_with_admin(
  p_code text, p_name text, p_legal_name text, p_plan text, p_employee_limit integer, p_admin_name text, p_admin_email citext, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  emp uuid;
  prov jsonb;
begin
  insert into public.tenants (code, display_name, legal_name, status, plan_code, employee_limit)
  values (upper(trim(p_code)), trim(p_name), nullif(trim(coalesce(p_legal_name, '')), ''), 'active', p_plan, p_employee_limit)
  returning id into tid;
  prov := public.provision_tenant(tid, 'vn-default', p_actor);
  perform public.provision_workflows(tid, 'vn-default', p_actor);
  perform public.provision_leave_types(tid, 'vn-default');
  perform public.provision_pay_components(tid, 'vn-default');
  emp := public.grant_tenant_admin(tid, p_admin_name, p_admin_email, p_actor);
  return jsonb_build_object('tenant_id', tid, 'admin_employee_id', emp, 'provisioned', prov -> 'created');
end;
$$;
select public.provision_pay_components(id) from public.tenants;

-- ---------- Quyền đọc; các hàm thao tác được thêm ở phần tiếp theo ----------
alter table public.pay_components enable row level security;
alter table public.payroll_cycles enable row level security;
alter table public.payroll_import_batches enable row level security;
alter table public.payroll_results enable row level security;
alter table public.payroll_result_items enable row level security;
alter table public.payroll_cycle_events enable row level security;
alter table public.payslip_views enable row level security;

create policy pay_components_read on public.pay_components for select to authenticated
  using (public.has_permission('payroll.read', tenant_id) or public.has_permission('payroll.config.manage', tenant_id));
create policy payroll_results_read on public.payroll_results for select to authenticated
  using (public.can_read_payroll_result(id));
create policy payroll_result_items_read on public.payroll_result_items for select to authenticated
  using (public.can_read_payroll_result(result_id));
create policy payroll_cycles_read on public.payroll_cycles for select to authenticated
  using (public.can_read_payroll_cycle(id));
create policy payroll_import_batches_read on public.payroll_import_batches for select to authenticated
  using (public.can_read_payroll_cycle(cycle_id, true));
create policy payroll_cycle_events_read on public.payroll_cycle_events for select to authenticated
  using (public.can_read_payroll_cycle(cycle_id, true));
create policy payslip_views_read on public.payslip_views for select to authenticated
  using (public.can_read_payroll_result(result_id));

-- Thu hồi cả default privilege của service_role: chỉ hàm SQL mới ghi bảng payroll.
revoke all on public.pay_components, public.payroll_cycles, public.payroll_import_batches, public.payroll_results,
  public.payroll_result_items, public.payroll_cycle_events, public.payslip_views from public, anon, authenticated, service_role;
grant select on public.pay_components, public.payroll_cycles, public.payroll_import_batches, public.payroll_results,
  public.payroll_result_items, public.payroll_cycle_events, public.payslip_views to authenticated, service_role;
revoke all on function public.payroll_cycle_in_scope(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.payroll_cycle_in_scope(uuid, uuid, text) to service_role;
-- Bản nhận p_user tùy ý chỉ dành cho API; RLS dùng bản bọc auth.uid() ở dưới.
revoke all on function public.can_read_payroll_result(uuid) from public, anon;
grant execute on function public.can_read_payroll_result(uuid) to authenticated, service_role;
revoke all on function public.can_read_payroll_cycle(uuid, boolean) from public, anon;
grant execute on function public.can_read_payroll_cycle(uuid, boolean) to authenticated, service_role;
revoke all on function public.provision_pay_components(uuid, text) from public, anon, authenticated;
grant execute on function public.provision_pay_components(uuid, text) to service_role;

-- ---------- 5. Chốt chặn ghi dữ liệu ----------
-- Marker được đặt/khôi phục bên trong hàm SECURITY DEFINER. Không dựa riêng vào GUC:
-- service_role KHÔNG có quyền DML các bảng này, kể cả khi tự đặt marker.
create or replace function public.payroll_cycles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'PAYROLL_CYCLE_IMMUTABLE'; end if;
  if current_user <> 'postgres' or coalesce(current_setting('kavor.payroll_write', true), '') <>
    (case when tg_op = 'INSERT' then 'create' else old.id::text end) then
    raise exception 'PAYROLL_SQL_ONLY';
  end if;
  if tg_op = 'UPDATE' and (new.id, new.tenant_id, new.month, new.period_start, new.period_end, new.pay_date, new.created_by, new.created_at)
    is distinct from (old.id, old.tenant_id, old.month, old.period_start, old.period_end, old.pay_date, old.created_by, old.created_at) then
    raise exception 'PAYROLL_CYCLE_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger payroll_cycles_guard before insert or update or delete on public.payroll_cycles
  for each row execute function public.payroll_cycles_guard();

create or replace function public.payroll_results_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cy uuid;
  st text;
  c public.pay_components;
begin
  if tg_table_name = 'payroll_results' then
    cy := case when tg_op = 'DELETE' then old.cycle_id else new.cycle_id end;
  else
    select cycle_id into cy from public.payroll_results
    where id = case when tg_op = 'DELETE' then old.result_id else new.result_id end;
  end if;
  -- Cùng khóa với replace/transition, tránh ghi item đồng thời lúc approve.
  select status into st from public.payroll_cycles where id = cy for update;
  if st in ('approved','published','paid','closed') then raise exception 'PAYROLL_RESULTS_LOCKED'; end if;
  if tg_op = 'UPDATE' then raise exception 'PAYROLL_REPLACE_REQUIRED'; end if;
  if current_user <> 'postgres' or coalesce(current_setting('kavor.payroll_write', true), '') <> cy::text then
    raise exception 'PAYROLL_SQL_ONLY';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'payroll_results' then
    if not exists (select 1 from public.employees where id = new.employee_id and tenant_id = new.tenant_id) then
      raise exception 'PAYROLL_EMPLOYEE_MISMATCH';
    end if;
  else
    select * into c from public.pay_components where id = new.component_id and tenant_id = new.tenant_id;
    if not found then raise exception 'PAYROLL_COMPONENT_MISMATCH'; end if;
    new.component_code := c.code;
    new.component_name := c.name;
    new.component_kind := c.kind;
    new.display_order := c.display_order;
  end if;
  return new;
end;
$$;
create trigger payroll_results_guard before insert or update or delete on public.payroll_results
  for each row execute function public.payroll_results_guard();
create trigger payroll_result_items_guard before insert or update or delete on public.payroll_result_items
  for each row execute function public.payroll_results_guard();

-- Danh mục sửa tên/thứ tự được; mã/loại là định danh, không thay đổi ý nghĩa ADVANCE/NET.
create or replace function public.pay_components_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.tenant_id, new.code, new.kind) is distinct from (old.id, old.tenant_id, old.code, old.kind) then
    raise exception 'PAY_COMPONENT_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger pay_components_guard before update on public.pay_components
  for each row execute function public.pay_components_guard();

create or replace function public.set_pay_component(
  p_tenant uuid, p_user uuid, p_code text, p_name text, p_kind text, p_order smallint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if not exists (select 1 from public.permission_scopes(p_user, p_tenant, 'payroll.config.manage') where scope_type = 'tenant') then
    raise exception 'PAYROLL_FORBIDDEN';
  end if;
  insert into public.pay_components (tenant_id, code, name, kind, display_order)
  values (p_tenant, p_code, p_name, p_kind, p_order)
  on conflict (tenant_id, code) do update set name = excluded.name, kind = excluded.kind, display_order = excluded.display_order
  returning id into cid;
  return cid;
end;
$$;

-- ---------- 6. Mở kỳ / ghi lần nhập / thay kết quả ----------
create or replace function public.create_payroll_cycle(p_tenant uuid, p_user uuid, p_month text, p_pay_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  d date;
  sd integer;
  start_on date;
  end_on date;
  prev text := coalesce(current_setting('kavor.payroll_write', true), '');
begin
  if not exists (select 1 from public.permission_scopes(p_user, p_tenant, 'payroll.import') where scope_type = 'tenant') then
    raise exception 'PAYROLL_FORBIDDEN';
  end if;
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'PAYROLL_MONTH_INVALID'; end if;
  d := (p_month || '-01')::date;
  select coalesce((attendance_settings->>'periodStartDay')::integer, 1) into sd from public.tenant_settings where tenant_id = p_tenant;
  sd := coalesce(sd, 1);
  if sd not between 1 and 28 then raise exception 'PAYROLL_PERIOD_INVALID'; end if;
  if sd = 1 then
    start_on := d; end_on := (d + interval '1 month')::date - 1;
  else
    start_on := (d - interval '1 month')::date + sd - 1; end_on := d + sd - 2;
  end if;
  perform set_config('kavor.payroll_write', 'create', true);
  insert into public.payroll_cycles (tenant_id, month, period_start, period_end, pay_date, created_by)
  values (p_tenant, p_month, start_on, end_on, p_pay_date, p_user) returning id into cid;
  insert into public.payroll_cycle_events (tenant_id, cycle_id, action, to_status, actor_user_id)
  values (p_tenant, cid, 'created', 'open', p_user);
  perform set_config('kavor.payroll_write', prev, true);
  return cid;
end;
$$;

-- CSV parsing/đối chiếu OT/công ở API sau. DB lưu cả lần nhập có lỗi; không sửa batch cũ.
create or replace function public.record_payroll_import(
  p_cycle uuid, p_user uuid, p_file_name text, p_total_rows integer, p_error_rows integer, p_warnings jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payroll_cycles;
  bid uuid;
  prev text := coalesce(current_setting('kavor.payroll_write', true), '');
begin
  select * into c from public.payroll_cycles where id = p_cycle for update;
  if not found then raise exception 'PAYROLL_CYCLE_NOT_FOUND'; end if;
  if not public.payroll_cycle_in_scope(p_user, p_cycle, 'payroll.import') then raise exception 'PAYROLL_FORBIDDEN'; end if;
  if c.status not in ('open','prepared','under_review') then raise exception 'PAYROLL_RESULTS_LOCKED'; end if;
  insert into public.payroll_import_batches (tenant_id, cycle_id, file_name, total_rows, error_rows, warnings, created_by)
  values (c.tenant_id, c.id, p_file_name, p_total_rows, p_error_rows, p_warnings, p_user) returning id into bid;
  perform set_config('kavor.payroll_write', c.id::text, true);
  update public.payroll_cycles set latest_batch_id = bid,
    status = case when c.status = 'under_review' then 'prepared' else c.status end where id = c.id;
  insert into public.payroll_cycle_events (tenant_id, cycle_id, batch_id, action, from_status, to_status, actor_user_id)
  values (c.tenant_id, c.id, bid, 'import_recorded', c.status, case when c.status = 'under_review' then 'prepared' else c.status end, p_user);
  perform set_config('kavor.payroll_write', prev, true);
  return bid;
end;
$$;

-- rows = [{employeeId,gross,deduction,net,workDays?,note?,items:[{componentId,amount,label?}]}]
-- Dữ liệu chuẩn hóa VND nguyên từ API; lỗi ở bất kỳ dòng nào rollback cả delete/insert/status/event.
create or replace function public.replace_payroll_results(p_cycle uuid, p_batch uuid, p_rows jsonb, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payroll_cycles;
  b public.payroll_import_batches;
  row_data jsonb;
  item jsonb;
  emp uuid;
  rid uuid;
  n integer := 0;
  prev text := coalesce(current_setting('kavor.payroll_write', true), '');
begin
  select * into c from public.payroll_cycles where id = p_cycle for update;
  if not found then raise exception 'PAYROLL_CYCLE_NOT_FOUND'; end if;
  if not public.payroll_cycle_in_scope(p_user, p_cycle, 'payroll.import') then raise exception 'PAYROLL_FORBIDDEN'; end if;
  if c.status not in ('open','prepared','under_review') then raise exception 'PAYROLL_RESULTS_LOCKED'; end if;
  select * into b from public.payroll_import_batches where id = p_batch and cycle_id = c.id and tenant_id = c.tenant_id;
  if not found or c.latest_batch_id is distinct from p_batch or b.created_by is distinct from p_user then raise exception 'PAYROLL_BATCH_MISMATCH'; end if;
  if b.error_rows <> 0 then raise exception 'PAYROLL_IMPORT_HAS_ERRORS'; end if;
  if exists (select 1 from public.payroll_cycle_events where batch_id = b.id and action = 'replaced') then raise exception 'PAYROLL_BATCH_ALREADY_APPLIED'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'PAYROLL_ROWS_INVALID'; end if;
  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) <> b.total_rows then raise exception 'PAYROLL_ROWS_INVALID'; end if;
  perform set_config('kavor.payroll_write', c.id::text, true);
  delete from public.payroll_result_items where result_id in (select id from public.payroll_results where cycle_id = c.id);
  delete from public.payroll_results where cycle_id = c.id;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(row_data) <> 'object'
      or coalesce(row_data->>'gross', '') !~ '^[0-9]+$' or coalesce(row_data->>'deduction', '') !~ '^[0-9]+$'
      or coalesce(row_data->>'net', '') !~ '^-?[0-9]+$'
      or jsonb_typeof(row_data->'items') is distinct from 'array' then raise exception 'PAYROLL_ROW_INVALID'; end if;
    emp := (row_data->>'employeeId')::uuid;
    if not exists (select 1 from public.employees where id = emp and tenant_id = c.tenant_id) then raise exception 'PAYROLL_EMPLOYEE_MISMATCH'; end if;
    if not public.employee_in_scope(p_user, c.tenant_id, 'payroll.import', emp) then raise exception 'PAYROLL_FORBIDDEN'; end if;
    insert into public.payroll_results (tenant_id, cycle_id, employee_id, batch_id, gross, deduction, net, work_days, note)
    values (c.tenant_id, c.id, emp, b.id, (row_data->>'gross')::bigint, (row_data->>'deduction')::bigint,
      (row_data->>'net')::bigint, (row_data->>'workDays')::numeric, row_data->>'note') returning id into rid;
    for item in select value from jsonb_array_elements(row_data->'items') loop
      if jsonb_typeof(item) <> 'object' or coalesce(item->>'amount', '') !~ '^-?[0-9]+$' then raise exception 'PAYROLL_ITEM_INVALID'; end if;
      -- Snapshot do trigger lấy từ danh mục đúng tenant, không tin nhãn/mã/loại do caller tự chụp.
      insert into public.payroll_result_items (tenant_id, result_id, component_id, amount, label)
      values (c.tenant_id, rid, (item->>'componentId')::uuid, (item->>'amount')::bigint, item->>'label');
    end loop;
    if not exists (
      select 1 from public.payroll_results r join public.payroll_result_items i on i.result_id = r.id
      where r.id = rid group by r.id
      having count(*) filter (where i.component_kind = 'net') = 1
        and coalesce(sum(i.amount) filter (where i.component_kind = 'earning'), 0) = r.gross
        and coalesce(sum(i.amount) filter (where i.component_kind = 'deduction'), 0) = r.deduction
        and max(i.amount) filter (where i.component_kind = 'net') = r.net
    ) then raise exception 'PAYROLL_TOTAL_MISMATCH'; end if;
    n := n + 1;
  end loop;
  update public.payroll_cycles set status = 'prepared', imported_by = p_user, imported_at = now(), approved_by = null, approved_at = null where id = c.id;
  insert into public.payroll_cycle_events (tenant_id, cycle_id, batch_id, action, from_status, to_status, actor_user_id)
  values (c.tenant_id, c.id, b.id, 'replaced', c.status, 'prepared', p_user);
  perform set_config('kavor.payroll_write', prev, true);
  return n;
end;
$$;

revoke all on function public.set_pay_component(uuid, uuid, text, text, text, smallint) from public, anon, authenticated;
revoke all on function public.create_payroll_cycle(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public.record_payroll_import(uuid, uuid, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.replace_payroll_results(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.set_pay_component(uuid, uuid, text, text, text, smallint) to service_role;
grant execute on function public.create_payroll_cycle(uuid, uuid, text, date) to service_role;
grant execute on function public.record_payroll_import(uuid, uuid, text, integer, integer, jsonb) to service_role;
grant execute on function public.replace_payroll_results(uuid, uuid, jsonb, uuid) to service_role;

-- ---------- 7. Chuyển trạng thái (chỉ qua hàm, cùng khóa dòng với nhập lại) ----------
create or replace function public.transition_payroll_cycle(p_cycle uuid, p_user uuid, p_action text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payroll_cycles;
  target text;
  perm text;
  prev text := coalesce(current_setting('kavor.payroll_write', true), '');
begin
  select * into c from public.payroll_cycles where id = p_cycle for update;
  if not found then raise exception 'PAYROLL_CYCLE_NOT_FOUND'; end if;
  perm := case p_action when 'submit' then 'payroll.import' when 'approve' then 'payroll.approve'
    when 'publish' then 'payroll.publish' when 'paid' then 'payroll.publish' when 'close' then 'payroll.publish'
    when 'reopen' then 'payroll.cycle.reopen' end;
  if perm is null then raise exception 'PAYROLL_ACTION_INVALID'; end if;
  if not public.payroll_cycle_in_scope(p_user, p_cycle, perm) then raise exception 'PAYROLL_FORBIDDEN'; end if;
  target := case
    when p_action = 'submit' and c.status = 'prepared' then 'under_review'
    when p_action = 'approve' and c.status = 'under_review' then 'approved'
    when p_action = 'publish' and c.status = 'approved' then 'published'
    when p_action = 'paid' and c.status = 'published' then 'paid'
    when p_action = 'close' and c.status = 'paid' then 'closed'
    when p_action = 'reopen' and c.status = 'approved' then 'prepared' end;
  if target is null then raise exception 'PAYROLL_TRANSITION_INVALID'; end if;
  if p_action in ('submit','approve') then
    if not exists (select 1 from public.payroll_import_batches b where b.id = c.latest_batch_id and b.error_rows = 0
        and b.total_rows > 0 and b.total_rows = (select count(*) from public.payroll_results r where r.cycle_id = c.id))
      or exists (select 1 from public.payroll_results r where r.cycle_id = c.id and r.batch_id <> c.latest_batch_id)
      or not exists (select 1 from public.payroll_cycle_events e where e.batch_id = c.latest_batch_id and e.action = 'replaced') then
      raise exception 'PAYROLL_IMPORT_NOT_READY';
    end if;
  end if;
  if p_action = 'approve' and p_user = c.imported_by then raise exception 'PAYROLL_SELF_APPROVAL'; end if;
  if p_action = 'reopen' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'PAYROLL_REOPEN_REASON_REQUIRED'; end if;
  perform set_config('kavor.payroll_write', c.id::text, true);
  update public.payroll_cycles set status = target,
    approved_by = case when p_action = 'reopen' then null when p_action = 'approve' then p_user else approved_by end,
    approved_at = case when p_action = 'reopen' then null when p_action = 'approve' then now() else approved_at end,
    published_by = case when p_action = 'publish' then p_user else published_by end,
    published_at = case when p_action = 'publish' then now() else published_at end,
    paid_at = case when p_action = 'paid' then now() else paid_at end,
    closed_at = case when p_action = 'close' then now() else closed_at end
  where id = c.id;
  -- Chỉ metadata, không sao chép kết quả/số tiền vào audit mà HR có thể đọc.
  insert into public.payroll_cycle_events (tenant_id, cycle_id, action, from_status, to_status, actor_user_id, reason)
  values (c.tenant_id, c.id, p_action, c.status, target, p_user, nullif(trim(p_reason), ''));
  perform set_config('kavor.payroll_write', prev, true);
  return target;
end;
$$;

-- Giữ nguyên đường chi tạm ứng cũ. Nhánh mới chỉ cho SQL công bố ghi deducted_cycle_id một lần.
create or replace function public.salary_advances_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'ADVANCE_IMMUTABLE' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    if new.deducted_cycle_id is not null then raise exception 'ADVANCE_IMMUTABLE'; end if;
    if exists (
      select 1 from public.salary_advances s join public.requests r on r.id = s.request_id
      where s.employee_id = new.employee_id and s.deduct_month = new.deduct_month and s.request_id <> new.request_id and r.status in ('pending','approved')
    ) then raise exception 'ADVANCE_MONTH_USED' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.deducted_cycle_id is distinct from old.deducted_cycle_id then
    if current_user <> 'postgres' or old.deducted_cycle_id is not null or old.paid_at is null
      or coalesce(current_setting('kavor.payroll_write', true), '') is distinct from new.deducted_cycle_id::text
      or (to_jsonb(new) - 'deducted_cycle_id') <> (to_jsonb(old) - 'deducted_cycle_id')
      or not exists (select 1 from public.payroll_cycles c where c.id = new.deducted_cycle_id and c.tenant_id = new.tenant_id
        and c.status = 'published' and c.month = to_char(new.deduct_month, 'YYYY-MM')) then raise exception 'ADVANCE_IMMUTABLE'; end if;
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

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval.pending','approval.due','request.approved','request.rejected','device.approved','device.rejected','advance.paid','payslip.published'));
alter table public.notifications drop constraint notifications_link_type_check;
alter table public.notifications add constraint notifications_link_type_check check (link_type in ('request','device','payslip'));

-- Công bố và các hiệu ứng trong cùng transaction. ADVANCE lệch chỉ cảnh báo; không đánh dấu sai là đã trừ.
create or replace function public.notify_payroll_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  emp uuid;
  imported_advance bigint;
  paid_advance numeric;
  already_deducted boolean;
begin
  if new.status <> 'published' or old.status = 'published' then return null; end if;
  -- Khóa các tạm ứng đã chi trước khi đọc tổng và đánh dấu, thứ tự cố định để tránh deadlock.
  perform 1 from public.salary_advances s where s.tenant_id = new.tenant_id
    and s.deduct_month = (new.month || '-01')::date and s.paid_at is not null order by s.id for update;
  for emp in
    select employee_id from public.payroll_results where cycle_id = new.id
    union
    select employee_id from public.salary_advances where tenant_id = new.tenant_id and deduct_month = (new.month || '-01')::date and paid_at is not null
  loop
    select coalesce(sum(i.amount), 0)::bigint into imported_advance from public.payroll_results pr
      join public.payroll_result_items i on i.result_id = pr.id
      where pr.cycle_id = new.id and pr.employee_id = emp and i.component_code = 'ADVANCE';
    select coalesce(sum(s.amount), 0), coalesce(bool_or(s.deducted_cycle_id is not null), false)
      into paid_advance, already_deducted from public.salary_advances s
      where s.tenant_id = new.tenant_id and s.employee_id = emp and s.deduct_month = (new.month || '-01')::date and s.paid_at is not null;
    if imported_advance = paid_advance and paid_advance > 0 and not already_deducted then
      update public.salary_advances set deducted_cycle_id = new.id
      where tenant_id = new.tenant_id and employee_id = emp and deduct_month = (new.month || '-01')::date and paid_at is not null and deducted_cycle_id is null;
    elsif imported_advance <> paid_advance or already_deducted then
      insert into public.payroll_cycle_events (tenant_id, cycle_id, action, from_status, to_status, actor_user_id, employee_id, reason)
      values (new.tenant_id, new.id, 'advance_mismatch', old.status, new.status, new.published_by, emp,
        'Tạm ứng chưa đối chiếu khớp; chưa ghi nhận khấu trừ.');
    end if;
  end loop;
  for r in select id, employee_id from public.payroll_results where cycle_id = new.id loop
    perform public.notify(new.tenant_id, r.employee_id, 'payslip.published',
      'Phiếu lương ' || to_char((new.month || '-01')::date, 'MM/YYYY') || ' đã công bố',
      'Bạn có thể mở phiếu lương để xem chi tiết.', 'payslip', r.id, new.month, null, 'payslip:' || r.id);
  end loop;
  return null;
end;
$$;
create trigger payroll_cycles_notify_published after update of status on public.payroll_cycles
  for each row execute function public.notify_payroll_published();

-- Ghi lần mở đầu tiên bằng bảng riêng, không sửa payroll_results đã duyệt.
create or replace function public.mark_payslip_viewed(p_result uuid, p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  viewed timestamptz;
begin
  if not exists (
    select 1 from public.payroll_results r join public.payroll_cycles c on c.id = r.cycle_id
      join public.employees e on e.id = r.employee_id
    where r.id = p_result and e.user_id = p_user and c.status in ('published','paid','closed')
      and public.employee_in_scope(p_user, r.tenant_id, 'payroll.self.read', e.id)
  ) then raise exception 'PAYSLIP_NOT_FOUND'; end if;
  insert into public.payslip_views (result_id) values (p_result) on conflict do nothing;
  select viewed_at into viewed from public.payslip_views where result_id = p_result;
  return viewed;
end;
$$;

revoke all on function public.transition_payroll_cycle(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_payslip_viewed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_payroll_published() from public, anon, authenticated;
grant execute on function public.transition_payroll_cycle(uuid, uuid, text, text) to service_role;
grant execute on function public.mark_payslip_viewed(uuid, uuid) to service_role;
