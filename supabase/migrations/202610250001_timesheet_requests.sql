-- Công tháng + giải trình + luồng duyệt (PILOT_RULEBOOK §5–6, §9; DATABASE_SCHEMA §8, §10):
-- 1. Permission bảng công, đơn từ, duyệt HR, cấu hình luồng duyệt.
-- 2. Ca có ngày làm việc trong tuần (trước đây coi mọi ngày đều đi làm).
-- 3. Đơn từ dùng chung cho mọi loại (bắt đầu từ giải trình công): đơn + phiên bản nội dung bất biến (kèm ảnh chụp quy định
--    lúc gửi) + bước duyệt. Luồng duyệt theo loại đơn có phiên bản. Chuyển trạng thái đi qua hàm SQL (khóa đơn, đúng bước).
-- 4. Duyệt giải trình tạo bản điều chỉnh giờ công; sự kiện chấm công gốc không đổi.
-- 5. Khóa kỳ công: lưu ảnh chụp bảng công lúc khóa; mở lại phải có quyền và lý do.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('timesheet.lock','attendance','Khóa kỳ công'),
  ('timesheet.unlock','attendance','Mở lại kỳ công đã khóa'),
  ('request.self.create','requests','Tạo và hủy đơn của chính mình'),
  ('request.read','requests','Xem đơn từ trong phạm vi'),
  ('request.hr_review','requests','Duyệt bước HR của đơn trong phạm vi'),
  ('workflow.manage','requests','Cấu hình luồng duyệt')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'tenant_admin' then array['timesheet.lock','timesheet.unlock','request.read','workflow.manage']
  when 'hr_ops' then array['timesheet.lock','timesheet.unlock','request.read','request.hr_review','workflow.manage']
  when 'manager' then array['request.read']
  when 'auditor' then array['request.read']
  when 'employee' then array['request.self.create']
end)
where r.tenant_id is null and r.is_system and r.code in ('tenant_admin','hr_ops','manager','auditor','employee')
on conflict do nothing;

-- ---------- 2. Ngày làm việc của ca (ISO: 1 = Thứ Hai … 7 = Chủ Nhật) ----------
alter table public.shift_versions add column work_days smallint[] not null default '{1,2,3,4,5}'
  check (cardinality(work_days) between 1 and 7 and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]);

-- ---------- 3. Đơn từ và luồng duyệt ----------
-- Luồng duyệt theo loại đơn. steps: [{"resolver": "direct_manager" | "hr", "slaHours": 24}], kiểm tra ở API.
create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  request_type text not null check (request_type in ('explanation')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, request_type)
);
create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workflow_id uuid not null references public.workflow_definitions(id) on delete restrict,
  version_no integer not null,
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 5),
  effective_from date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_no),
  unique (workflow_id, effective_from)
);
create trigger workflow_versions_immutable before update or delete on public.workflow_versions for each row execute function public.immutable_row();

-- Số đơn theo tiền tố mỗi tenant (GT-0001…)
create table public.request_counters (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  prefix text not null,
  last_no integer not null default 0,
  primary key (tenant_id, prefix)
);
create or replace function public.next_request_no(p_tenant uuid, p_prefix text)
returns text
language sql
security definer
set search_path = public
as $$
  insert into public.request_counters (tenant_id, prefix, last_no) values (p_tenant, p_prefix, 1)
  on conflict (tenant_id, prefix) do update set last_no = request_counters.last_no + 1
  returning p_prefix || '-' || lpad(last_no::text, 4, '0');
$$;

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  request_no text not null,
  request_type text not null check (request_type in ('explanation')),
  requester_employee_id uuid not null references public.employees(id) on delete restrict,
  requester_user_id uuid references auth.users(id) on delete set null,
  workflow_version_id uuid not null references public.workflow_versions(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  -- Ngày công mà đơn tác động (giải trình) và kỳ công chứa ngày đó: để đếm lượt, chặn khi kỳ đã khóa
  work_date date,
  period_start date,
  current_version integer not null default 1,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, request_no),
  check ((status = 'pending') = (completed_at is null))
);
create index requests_requester_idx on public.requests(tenant_id, requester_employee_id, submitted_at desc);
create index requests_period_idx on public.requests(tenant_id, request_type, period_start);
-- Một ngày công chỉ có một giải trình đang chờ hoặc đã duyệt
create unique index requests_one_explanation_per_day on public.requests(requester_employee_id, work_date)
  where request_type = 'explanation' and status in ('pending','approved');

create table public.request_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  version_no integer not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  -- Quy định và luồng duyệt lúc gửi (PILOT_RULEBOOK §9: đơn giữ ảnh chụp rule tại thời điểm submit)
  policy_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id, version_no)
);
create trigger request_versions_immutable before update or delete on public.request_versions for each row execute function public.immutable_row();

-- Mỗi bước duyệt một dòng. Bước đang chờ: pending; bước sau: waiting. direct_manager → assignee_employee_id;
-- hr → ai có request.hr_review trong phạm vi người gửi (kiểm tra ở API).
create table public.approval_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  step_no integer not null check (step_no between 1 and 5),
  resolver text not null check (resolver in ('direct_manager','hr')),
  assignee_employee_id uuid references public.employees(id) on delete restrict,
  status text not null check (status in ('waiting','pending','approved','rejected','skipped','cancelled')),
  due_at timestamptz,
  acted_by uuid references auth.users(id) on delete set null,
  acted_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  unique (request_id, step_no),
  check (resolver <> 'direct_manager' or status = 'skipped' or assignee_employee_id is not null)
);
create index approval_tasks_assignee_idx on public.approval_tasks(tenant_id, assignee_employee_id, status);
create index approval_tasks_pending_idx on public.approval_tasks(tenant_id, resolver, status);

-- ---------- 4. Điều chỉnh giờ công ----------
create table public.attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date date not null,
  request_id uuid references public.requests(id) on delete restrict,
  -- Giờ địa phương ghi nhận thay; null = giữ giờ từ chấm công
  clock_in time,
  clock_out time,
  reason text not null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id),
  check (clock_in is not null or clock_out is not null),
  check (clock_in is null or clock_out is null or clock_out > clock_in)
);
create index attendance_adjustments_day_idx on public.attendance_adjustments(tenant_id, employee_id, work_date);
create trigger attendance_adjustments_immutable before update or delete on public.attendance_adjustments for each row execute function public.immutable_row();

-- ---------- 5. Khóa kỳ công ----------
create table public.timesheet_locks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz not null default now(),
  reason text,
  -- Bảng công của mọi nhân viên lúc khóa: payroll và báo cáo đọc bản này, không tính lại
  snapshot jsonb not null,
  calculation_version integer not null default 1,
  unlocked_by uuid references auth.users(id) on delete set null,
  unlocked_at timestamptz,
  unlock_reason text,
  check (period_end >= period_start),
  check ((unlocked_at is null) = (unlocked_by is null)),
  check (unlocked_at is null or length(trim(coalesce(unlock_reason, ''))) >= 5)
);
create unique index timesheet_locks_active on public.timesheet_locks(tenant_id, period_start) where unlocked_at is null;

-- Chỉ được ghi thời điểm mở khóa, phần còn lại bất biến
create or replace function public.timesheet_locks_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'timesheet_locks is append-only'; end if;
  if old.unlocked_at is not null then raise exception 'TIMESHEET_ALREADY_UNLOCKED' using errcode = 'P0001'; end if;
  if (new.tenant_id, new.period_start, new.period_end, new.locked_by, new.locked_at, new.reason, new.snapshot, new.calculation_version)
     is distinct from (old.tenant_id, old.period_start, old.period_end, old.locked_by, old.locked_at, old.reason, old.snapshot, old.calculation_version) then
    raise exception 'timesheet_locks: only unlock fields can change';
  end if;
  return new;
end;
$$;
create trigger timesheet_locks_guard before update or delete on public.timesheet_locks for each row execute function public.timesheet_locks_guard();

create or replace function public.period_locked(p_tenant uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.timesheet_locks where tenant_id = p_tenant and unlocked_at is null and p_date between period_start and period_end);
$$;

-- Không thêm điều chỉnh vào kỳ đã khóa (chốt chặn cuối, API cũng kiểm tra)
create or replace function public.attendance_adjustments_period_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.period_locked(new.tenant_id, new.work_date) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger attendance_adjustments_period_guard before insert on public.attendance_adjustments for each row execute function public.attendance_adjustments_period_guard();

-- ---------- Chuyển trạng thái đơn (nguyên tử) ----------
-- Quyền của người duyệt kiểm tra ở API trước khi gọi. Hàm khóa đơn, chỉ nhận đúng bước đang chờ, rồi kích hoạt bước sau
-- hoặc kết thúc đơn; giải trình được duyệt hết thì tạo điều chỉnh giờ công.
create or replace function public.decide_approval(p_task uuid, p_actor uuid, p_approve boolean, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.approval_tasks;
  r public.requests;
  nxt public.approval_tasks;
  v public.request_versions;
begin
  select * into t from public.approval_tasks where id = p_task;
  if t.id is null then raise exception 'TASK_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into r from public.requests where id = t.request_id for update;
  if r.status <> 'pending' or t.status <> 'pending' then raise exception 'TASK_NOT_PENDING' using errcode = 'P0001'; end if;
  if r.work_date is not null and public.period_locked(r.tenant_id, r.work_date) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;

  update public.approval_tasks set status = case when p_approve then 'approved' else 'rejected' end, acted_by = p_actor, acted_at = now(), comment = p_comment where id = t.id;
  if not p_approve then
    update public.approval_tasks set status = 'cancelled' where request_id = r.id and status = 'waiting';
    update public.requests set status = 'rejected', completed_at = now() where id = r.id;
    return 'rejected';
  end if;

  select * into nxt from public.approval_tasks where request_id = r.id and status = 'waiting' order by step_no limit 1;
  if nxt.id is not null then
    update public.approval_tasks set status = 'pending',
      due_at = now() + make_interval(hours => coalesce((select (s->>'slaHours')::int from public.workflow_versions w, jsonb_array_elements(w.steps) with ordinality e(s, n) where w.id = r.workflow_version_id and n = nxt.step_no), 24))
    where id = nxt.id;
    return 'next';
  end if;

  update public.requests set status = 'approved', completed_at = now() where id = r.id;
  if r.request_type = 'explanation' then
    select * into v from public.request_versions where request_id = r.id and version_no = r.current_version;
    insert into public.attendance_adjustments (tenant_id, employee_id, work_date, request_id, clock_in, clock_out, reason, approved_by)
    values (r.tenant_id, r.requester_employee_id, r.work_date, r.id, (v.payload->>'clockIn')::time, (v.payload->>'clockOut')::time,
      coalesce(v.payload->>'reason', 'Giải trình'), p_actor);
  end if;
  return 'approved';
end;
$$;

-- Tạo đơn + phiên bản 1 + các bước duyệt trong một transaction. p_tasks: [{"stepNo","resolver","assigneeEmployeeId","status","slaHours"}]
-- (API đã tính người duyệt, bước bỏ qua). Trả về id và số đơn.
create or replace function public.create_request(
  p_tenant uuid, p_prefix text, p_type text, p_employee uuid, p_user uuid, p_workflow_version uuid,
  p_work_date date, p_period_start date, p_payload jsonb, p_snapshot jsonb, p_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  no text;
  t jsonb;
begin
  no := public.next_request_no(p_tenant, p_prefix);
  insert into public.requests (tenant_id, request_no, request_type, requester_employee_id, requester_user_id, workflow_version_id, work_date, period_start)
  values (p_tenant, no, p_type, p_employee, p_user, p_workflow_version, p_work_date, p_period_start) returning id into rid;
  insert into public.request_versions (tenant_id, request_id, version_no, payload, policy_snapshot, created_by) values (p_tenant, rid, 1, p_payload, p_snapshot, p_user);
  for t in select value from jsonb_array_elements(p_tasks) loop
    insert into public.approval_tasks (tenant_id, request_id, step_no, resolver, assignee_employee_id, status, due_at)
    values (p_tenant, rid, (t->>'stepNo')::int, t->>'resolver', nullif(t->>'assigneeEmployeeId', '')::uuid, t->>'status',
      case when t->>'status' = 'pending' then now() + make_interval(hours => coalesce((t->>'slaHours')::int, 24)) end);
  end loop;
  if not exists (select 1 from public.approval_tasks where request_id = rid and status = 'pending') then
    raise exception 'NO_ACTIVE_STEP' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', rid, 'no', no);
end;
$$;

-- Người gửi hủy đơn đang chờ: hủy luôn các bước chưa xong
create or replace function public.cancel_request(p_request uuid, p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
begin
  select * into r from public.requests where id = p_request for update;
  if r.id is null or r.requester_employee_id <> p_employee then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001'; end if;
  update public.approval_tasks set status = 'cancelled' where request_id = r.id and status in ('pending','waiting');
  update public.requests set status = 'cancelled', completed_at = now() where id = r.id;
end;
$$;
revoke all on function public.create_request(uuid, text, text, uuid, uuid, uuid, date, date, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_request(uuid, text, text, uuid, uuid, uuid, date, date, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.cancel_request(uuid, uuid) to service_role;

-- Bộ mẫu: luồng duyệt giải trình Quản lý → HR (PILOT_RULEBOOK §9)
update public.tenant_policy_templates
set content = content || $json${"workflows": [
  {"requestType": "explanation", "name": "Giải trình công", "steps": [{"resolver": "direct_manager", "slaHours": 24}, {"resolver": "hr", "slaHours": 24}]}
]}$json$::jsonb, version = version + 1, updated_at = now()
where code = 'vn-default';

create or replace function public.provision_workflows(p_tenant uuid, p_template text default 'vn-default', p_actor uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb;
  w jsonb;
  d date;
  wid uuid;
  n integer := 0;
begin
  select content into t from public.tenant_policy_templates where code = p_template;
  select (now() at time zone timezone)::date into d from public.tenants where id = p_tenant;
  for w in select value from jsonb_array_elements(coalesce(t->'workflows', '[]'::jsonb)) loop
    if not exists (select 1 from public.workflow_definitions where tenant_id = p_tenant and request_type = w->>'requestType') then
      insert into public.workflow_definitions (tenant_id, request_type, name) values (p_tenant, w->>'requestType', w->>'name') returning id into wid;
      -- Hiệu lực từ đầu năm để đơn cho các ngày công cũ trong kỳ vẫn có luồng
      insert into public.workflow_versions (tenant_id, workflow_id, version_no, steps, effective_from, note, created_by)
      values (p_tenant, wid, 1, w->'steps', date_trunc('year', d)::date, 'Mẫu mặc định Kavor', p_actor);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- provision_tenant gọi thêm phần luồng duyệt (giữ nguyên các phần trước)
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
  emp := public.grant_tenant_admin(tid, p_admin_name, p_admin_email, p_actor);
  return jsonb_build_object('tenant_id', tid, 'admin_employee_id', emp, 'provisioned', prov -> 'created');
end;
$$;

revoke all on function public.next_request_no(uuid, text) from public, anon, authenticated;
revoke all on function public.decide_approval(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.provision_workflows(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.period_locked(uuid, date) from public, anon;
grant execute on function public.next_request_no(uuid, text) to service_role;
grant execute on function public.decide_approval(uuid, uuid, boolean, text) to service_role;
grant execute on function public.provision_workflows(uuid, text, uuid) to service_role;
grant execute on function public.period_locked(uuid, date) to service_role, authenticated;

-- Tenant có sẵn (dữ liệu mẫu, tenant tạo từ Console trước migration này)
select public.provision_workflows(id) from public.tenants;

-- ---------- RLS ----------
alter table public.workflow_definitions enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.request_counters enable row level security;
alter table public.requests enable row level security;
alter table public.request_versions enable row level security;
alter table public.approval_tasks enable row level security;
alter table public.attendance_adjustments enable row level security;
alter table public.timesheet_locks enable row level security;

create policy workflow_definitions_member_read on public.workflow_definitions for select to authenticated using (public.is_active_member(tenant_id));
create policy workflow_versions_member_read on public.workflow_versions for select to authenticated using (public.is_active_member(tenant_id));
-- Đơn: người gửi, người được giao bước duyệt, hoặc người có request.read với nhân viên trong phạm vi.
-- Hàm security definer để policy của requests và approval_tasks không tham chiếu chéo nhau (đệ quy RLS).
create or replace function public.can_read_request(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.requests r
    where r.id = p_request and (
      r.requester_employee_id in (select id from public.employees where user_id = auth.uid())
      or exists (select 1 from public.approval_tasks a join public.employees e on e.id = a.assignee_employee_id
                 where a.request_id = r.id and e.user_id = auth.uid())
      or public.employee_in_scope(auth.uid(), r.tenant_id, 'request.read', r.requester_employee_id)));
$$;
revoke all on function public.can_read_request(uuid) from public, anon;
grant execute on function public.can_read_request(uuid) to authenticated;

create policy requests_read on public.requests for select to authenticated using (public.can_read_request(id));
create policy request_versions_read on public.request_versions for select to authenticated using (public.can_read_request(request_id));
create policy approval_tasks_read on public.approval_tasks for select to authenticated using (public.can_read_request(request_id));
create policy attendance_adjustments_read on public.attendance_adjustments for select to authenticated
  using (employee_id in (select public.current_employee_ids()) or public.can_read_employee('attendance.read', tenant_id, employee_id));
create policy timesheet_locks_member_read on public.timesheet_locks for select to authenticated using (public.has_permission('attendance.read', tenant_id));

grant select on public.workflow_definitions, public.workflow_versions, public.requests, public.request_versions, public.approval_tasks,
  public.attendance_adjustments, public.timesheet_locks to authenticated;
grant select, insert, update, delete on public.workflow_definitions, public.workflow_versions, public.request_counters, public.requests,
  public.request_versions, public.approval_tasks, public.attendance_adjustments, public.timesheet_locks to service_role;

-- Realtime: web HR nhận tín hiệu khi có đơn mới/được duyệt (RLS ở trên quyết định ai nhận) rồi gọi lại API
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.requests, public.approval_tasks;
  end if;
end;
$$;
