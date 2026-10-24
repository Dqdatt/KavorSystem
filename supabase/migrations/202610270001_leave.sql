-- Nghỉ phép (PILOT_RULEBOOK §7, §9; DATABASE_SCHEMA §9; ADR 0001):
-- 1. Permission xem/điều chỉnh phép.
-- 2. Quy định phép năm dùng khung quy định có tầng/phiên bản sẵn có (kind 'leave'): định mức (sàn 12 ngày theo BLLĐ, kiểm ở API),
--    tích lũy theo tháng, thâm niên, chuyển năm + hạn dùng, cho phép âm, thử việc.
-- 3. Loại nghỉ theo tenant (phép năm, không lương, ốm BHXH, kết hôn, tang chế…) — mẫu Kavor, công ty chỉnh sau.
-- 4. Sổ phép dạng ledger: số dư = tổng giao dịch, không có cột "balance". Giao dịch bất biến, chống ghi trùng bằng source_key.
-- 5. Đơn nghỉ dùng khung đơn từ + luồng duyệt (bước HR có thể chỉ áp dụng khi số ngày vượt ngưỡng: "daysOver").
--    Gửi đơn giữ chỗ phép (hold); duyệt → trả giữ chỗ + trừ phép (release + consume); từ chối/hủy → trả giữ chỗ.
-- 6. Ngày nghỉ của từng đơn (leave_days) để chặn trùng và đưa vào bảng công.
-- Số ngày luật định trong mẫu (kết hôn 3, tang 3 — BLLĐ 2019 Điều 115) cần chuyên gia xác nhận trước pilot.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('leave.read','leave','Xem số dư và sổ phép trong phạm vi'),
  ('leave.manage','leave','Điều chỉnh sổ phép, nhập phép tồn')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'tenant_admin' then array['leave.read','leave.manage']
  when 'hr_ops' then array['leave.read','leave.manage']
  when 'manager' then array['leave.read']
  when 'auditor' then array['leave.read']
end)
where r.tenant_id is null and r.is_system and r.code in ('tenant_admin','hr_ops','manager','auditor')
on conflict do nothing;

-- ---------- 2. Quy định phép năm (khung quy định chung) ----------
alter table public.policy_definitions drop constraint policy_definitions_kind_check;
alter table public.policy_definitions add constraint policy_definitions_kind_check check (kind in ('explanation','salary_advance','reminder','leave'));
alter table public.policy_assignments drop constraint policy_assignments_kind_check;
alter table public.policy_assignments add constraint policy_assignments_kind_check
  check (kind in ('shift','work_location','explanation','salary_advance','reminder','leave'));

-- ---------- 3. Loại nghỉ ----------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{1,20}$'),
  name text not null check (length(name) between 1 and 80),
  -- Có hưởng lương (tính công) hay không
  paid boolean not null default true,
  -- Trừ vào phép năm
  deducts_balance boolean not null default false,
  -- Số ngày tối đa mỗi đơn (theo luật/chính sách), null = không giới hạn
  max_days numeric(4,1) check (max_days is null or max_days > 0),
  -- Từ số ngày này cần minh chứng (chưa có đính kèm: nhắc nhân viên nộp cho HR)
  attachment_from_days numeric(4,1) check (attachment_from_days is null or attachment_from_days > 0),
  description text,
  active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ---------- 4. Sổ phép ----------
create table public.leave_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  year smallint not null check (year between 2000 and 2100),
  created_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);

create table public.leave_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  account_id uuid not null references public.leave_accounts(id) on delete restrict,
  kind text not null check (kind in ('grant','accrual','carry','hold','release','consume','adjust','expire')),
  amount numeric(6,2) not null check (amount <> 0),
  effective_on date not null,
  -- Phép tồn năm trước hết hạn dùng ngày này
  expires_on date,
  request_id uuid references public.requests(id) on delete restrict,
  -- Khóa chống ghi trùng trong một sổ: "accrual:2026-10", "hold:<request>", "adjust:<uuid>"…
  source_key text not null check (length(source_key) between 1 and 120),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, source_key),
  check (case kind when 'grant' then amount > 0 when 'accrual' then amount > 0 when 'carry' then amount > 0 when 'release' then amount > 0
    when 'hold' then amount < 0 when 'consume' then amount < 0 when 'expire' then amount < 0 else true end),
  check (kind <> 'adjust' or length(trim(coalesce(reason, ''))) >= 5),
  check ((kind = 'carry') = (expires_on is not null))
);
create index leave_transactions_account_idx on public.leave_transactions (account_id, effective_on);
create index leave_transactions_request_idx on public.leave_transactions (request_id) where request_id is not null;

create or replace function public.leave_transactions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'LEAVE_LEDGER_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger leave_transactions_guard before update or delete on public.leave_transactions
  for each row execute function public.leave_transactions_guard();

-- ---------- 5. Đơn nghỉ ----------
alter table public.requests drop constraint requests_request_type_check;
alter table public.requests add constraint requests_request_type_check check (request_type in ('explanation','leave'));
alter table public.workflow_definitions drop constraint workflow_definitions_request_type_check;
alter table public.workflow_definitions add constraint workflow_definitions_request_type_check check (request_type in ('explanation','leave'));

-- ---------- 6. Ngày nghỉ của đơn ----------
create table public.leave_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_date date not null,
  half text not null default 'full' check (half in ('full','am','pm')),
  portion numeric(2,1) not null check ((half = 'full' and portion = 1) or (half <> 'full' and portion = 0.5)),
  unique (request_id, leave_date)
);
create index leave_days_employee_idx on public.leave_days (employee_id, leave_date);

-- Một buổi chỉ thuộc một đơn nghỉ đang chờ/đã duyệt; ngày thuộc kỳ công đã khóa không thêm được
create or replace function public.leave_days_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then raise exception 'LEAVE_DAYS_IMMUTABLE' using errcode = 'P0001'; end if;
  if public.period_locked(new.tenant_id, new.leave_date) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.leave_days d join public.requests r on r.id = d.request_id
    where d.employee_id = new.employee_id and d.leave_date = new.leave_date and d.request_id <> new.request_id
      and r.status in ('pending','approved') and (d.half = 'full' or new.half = 'full' or d.half = new.half)
  ) then raise exception 'LEAVE_OVERLAP' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger leave_days_guard before insert or update or delete on public.leave_days
  for each row execute function public.leave_days_guard();

-- Tạo đơn nghỉ nguyên tử: đơn + bước duyệt (create_request) + ngày nghỉ + giữ chỗ phép (nếu loại nghỉ trừ phép năm).
-- p_days: [{"date","half","portion"}]; p_account: sổ phép năm của năm chứa ngày nghỉ (null nếu không trừ phép).
create or replace function public.create_leave_request(
  p_tenant uuid, p_employee uuid, p_user uuid, p_workflow_version uuid, p_period_start date, p_leave_type uuid,
  p_payload jsonb, p_snapshot jsonb, p_tasks jsonb, p_days jsonb, p_account uuid, p_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  rid uuid;
  first_day date;
begin
  select min((x->>'date')::date) into first_day from jsonb_array_elements(p_days) x;
  if first_day is null then raise exception 'NO_LEAVE_DAYS' using errcode = 'P0001'; end if;
  r := public.create_request(p_tenant, 'NP', 'leave', p_employee, p_user, p_workflow_version, first_day, p_period_start, p_payload, p_snapshot, p_tasks);
  rid := (r->>'id')::uuid;
  insert into public.leave_days (tenant_id, employee_id, request_id, leave_type_id, leave_date, half, portion)
  select p_tenant, p_employee, rid, p_leave_type, (x->>'date')::date, x->>'half', (x->>'portion')::numeric from jsonb_array_elements(p_days) x;
  if p_account is not null then
    insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, request_id, source_key, reason, created_by)
    values (p_tenant, p_account, 'hold', -p_total, first_day, rid, 'hold:' || rid, 'Giữ chỗ cho đơn ' || (r->>'no'), p_user);
  end if;
  return r;
end;
$$;

-- Đơn nghỉ có kết quả: trả giữ chỗ; được duyệt thì trừ phép
create or replace function public.leave_request_settle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.leave_transactions;
begin
  if new.request_type <> 'leave' or old.status <> 'pending' or new.status = 'pending' then return null; end if;
  select * into h from public.leave_transactions where request_id = new.id and kind = 'hold';
  if h.id is null then return null; end if;
  insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, request_id, source_key, reason)
  values (h.tenant_id, h.account_id, 'release', -h.amount, h.effective_on, new.id, 'release:' || new.id,
    case new.status when 'approved' then 'Đơn ' || new.request_no || ' được duyệt' when 'rejected' then 'Đơn ' || new.request_no || ' bị từ chối' else 'Đơn ' || new.request_no || ' đã hủy' end);
  if new.status = 'approved' then
    insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, request_id, source_key, reason)
    values (h.tenant_id, h.account_id, 'consume', h.amount, h.effective_on, new.id, 'consume:' || new.id, 'Nghỉ theo đơn ' || new.request_no);
  end if;
  return null;
end;
$$;
create trigger requests_leave_settle after update of status on public.requests
  for each row execute function public.leave_request_settle();

-- ---------- Bộ mẫu: quy định phép năm, loại nghỉ, luồng duyệt đơn nghỉ ----------
update public.tenant_policy_templates
set content = jsonb_set(content, '{policies}', coalesce(content->'policies', '[]'::jsonb) || $json$[
  {"kind": "leave", "code": "PN-CHUAN", "name": "Phép năm chuẩn", "config": {"annualDays": 12, "accrualMonthly": true, "seniorityYears": 5, "seniorityBonusDays": 1,
    "carryOverMaxDays": 3, "carryOverExpiryMonth": 3, "allowNegativeDays": 1, "probationAccrues": false}}
]$json$::jsonb)
  || jsonb_build_object('workflows', coalesce(content->'workflows', '[]'::jsonb) || $json$[
  {"requestType": "leave", "name": "Nghỉ phép", "steps": [{"resolver": "direct_manager", "slaHours": 24}, {"resolver": "hr", "slaHours": 24, "daysOver": 2}]}
]$json$::jsonb)
  || $json${"leaveTypes": [
  {"code": "AL", "name": "Phép năm", "paid": true, "deductsBalance": true, "sort": 1},
  {"code": "UL", "name": "Không lương", "paid": false, "sort": 2},
  {"code": "SL", "name": "Ốm đau (BHXH)", "paid": false, "attachmentFromDays": 2, "sort": 3, "description": "Không trừ phép năm; BHXH chi trả theo chế độ ốm đau."},
  {"code": "WED", "name": "Kết hôn", "paid": true, "maxDays": 3, "sort": 4, "description": "Bản thân kết hôn: nghỉ 3 ngày hưởng nguyên lương (BLLĐ Điều 115)."},
  {"code": "BRV", "name": "Tang chế", "paid": true, "maxDays": 3, "sort": 5, "description": "Cha mẹ, vợ/chồng, con mất: nghỉ 3 ngày hưởng nguyên lương (BLLĐ Điều 115)."}
]}$json$::jsonb,
  version = version + 1, updated_at = now()
where code = 'vn-default';

create or replace function public.provision_leave_types(p_tenant uuid, p_template text default 'vn-default')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.leave_types (tenant_id, code, name, paid, deducts_balance, max_days, attachment_from_days, description, sort)
  select p_tenant, x->>'code', x->>'name', coalesce((x->>'paid')::boolean, true), coalesce((x->>'deductsBalance')::boolean, false),
    (x->>'maxDays')::numeric, (x->>'attachmentFromDays')::numeric, x->>'description', coalesce((x->>'sort')::smallint, 0)
  from public.tenant_policy_templates t, jsonb_array_elements(coalesce(t.content->'leaveTypes', '[]'::jsonb)) x
  where t.code = p_template
  on conflict (tenant_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Tạo tenant (Console): thêm loại nghỉ (giữ nguyên các phần trước)
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
  emp := public.grant_tenant_admin(tid, p_admin_name, p_admin_email, p_actor);
  return jsonb_build_object('tenant_id', tid, 'admin_employee_id', emp, 'provisioned', prov -> 'created');
end;
$$;

-- Tenant đã có: bổ sung phần còn thiếu (các hàm đều bỏ qua phần đã có)
select public.provision_tenant(id), public.provision_workflows(id), public.provision_leave_types(id) from public.tenants;

-- ---------- Thông báo: nội dung theo loại đơn ----------
create or replace function public.request_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type when 'explanation' then 'Giải trình công' when 'leave' then 'Nghỉ phép' else 'Đơn' end;
$$;

-- "T6 23/10 · quên chấm ra" (giải trình) / "Phép năm · 27/10–28/10 · 2 ngày" (nghỉ phép)
create or replace function public.request_label(p_request uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when r.request_type = 'leave' then concat_ws(' · ',
      v.payload->>'leaveTypeName',
      to_char((v.payload->>'from')::date, 'DD/MM') || case when v.payload->>'to' <> v.payload->>'from' then '–' || to_char((v.payload->>'to')::date, 'DD/MM') else '' end
        || case v.payload->>'half' when 'am' then ' (sáng)' when 'pm' then ' (chiều)' else '' end,
      replace(replace(to_char((v.payload->>'days')::numeric, 'FM990.0'), '.0', ''), '.', ',') || ' ngày')
  else concat_ws(' · ',
    case when r.work_date is not null then (array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from r.work_date)::int] || ' ' || to_char(r.work_date, 'DD/MM') end,
    case v.payload->>'kind' when 'missing_in' then 'quên chấm vào' when 'missing_out' then 'quên chấm ra' when 'late' then 'đến muộn có lý do'
      when 'early' then 'về sớm có lý do' when 'trip' then 'đi công tác' when 'device' then 'lỗi thiết bị/GPS' when 'other' then 'khác' end) end
  from public.requests r
  left join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;

create or replace function public.notify_task_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  who text;
  rec uuid;
begin
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending') then return null; end if;
  select * into r from public.requests where id = new.request_id;
  select full_name into who from public.employees where id = r.requester_employee_id;
  for rec in select public.task_assignees(new.id) loop
    perform public.notify(r.tenant_id, rec, 'approval.pending', 'Đơn ' || r.request_no || ' cần bạn duyệt',
      who || ' · ' || case when r.request_type = 'leave' then '' else public.request_type_label(r.request_type) || ' ' end || coalesce(public.request_label(r.id), ''),
      'request', r.id, r.request_no, new.id, 'pending:' || new.id);
  end loop;
  return null;
end;
$$;

create or replace function public.notify_request_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  note text;
  what text;
begin
  if new.status not in ('approved', 'rejected') or old.status = new.status then return null; end if;
  select coalesce(e.full_name, 'Người duyệt'), t.comment into actor, note
  from public.approval_tasks t left join public.employees e on e.user_id = t.acted_by and e.tenant_id = t.tenant_id
  where t.request_id = new.id and t.status in ('approved', 'rejected') order by t.step_no desc limit 1;
  what := case when new.request_type = 'leave' then '' else public.request_type_label(new.request_type) || ' ' end || coalesce(public.request_label(new.id), '');
  if new.status = 'approved' then
    perform public.notify(new.tenant_id, new.requester_employee_id, 'request.approved', 'Đơn ' || new.request_no || ' đã được duyệt',
      what || ' · ' || coalesce(actor, 'Người duyệt') || ' duyệt' || case
        when new.request_type = 'explanation' then ', bảng công đã cập nhật'
        -- Trigger trừ phép (requests_leave_settle) chạy trước trigger này (theo thứ tự tên) nên giao dịch "đã nghỉ" đã có
        when exists (select 1 from public.leave_transactions where request_id = new.id and kind = 'consume') then ', đã trừ vào sổ phép'
        else '' end,
      'request', new.id, new.request_no, null, 'done:' || new.id);
  else
    perform public.notify(new.tenant_id, new.requester_employee_id, 'request.rejected', 'Đơn ' || new.request_no || ' bị từ chối',
      coalesce(actor, 'Người duyệt') || ': ' || coalesce(note, '—'), 'request', new.id, new.request_no, null, 'done:' || new.id);
  end if;
  return null;
end;
$$;

-- ---------- Quyền + RLS ----------
revoke all on function public.create_leave_request(uuid, uuid, uuid, uuid, date, uuid, jsonb, jsonb, jsonb, jsonb, uuid, numeric) from public, anon, authenticated;
revoke all on function public.provision_leave_types(uuid, text) from public, anon, authenticated;
grant execute on function public.create_leave_request(uuid, uuid, uuid, uuid, date, uuid, jsonb, jsonb, jsonb, jsonb, uuid, numeric) to service_role;
grant execute on function public.provision_leave_types(uuid, text) to service_role;

alter table public.leave_types enable row level security;
alter table public.leave_accounts enable row level security;
alter table public.leave_transactions enable row level security;
alter table public.leave_days enable row level security;

create policy leave_types_member_read on public.leave_types for select to authenticated using (public.is_active_member(tenant_id));
create policy leave_accounts_read on public.leave_accounts for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('leave.read', tenant_id, employee_id));
create policy leave_transactions_read on public.leave_transactions for select to authenticated
  using (exists (select 1 from public.leave_accounts a where a.id = account_id
    and (a.employee_id in (select public.current_employee_ids()) or public.can_read_employee('leave.read', a.tenant_id, a.employee_id))));
create policy leave_days_read on public.leave_days for select to authenticated using (public.can_read_request(request_id));

grant select on public.leave_types, public.leave_accounts, public.leave_transactions, public.leave_days to authenticated;
grant select, insert, update on public.leave_types to service_role;
grant select, insert on public.leave_accounts, public.leave_transactions, public.leave_days to service_role;
