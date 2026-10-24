-- Làm thêm giờ (PILOT_RULEBOOK §8, US-043; BLLĐ 2019 Điều 98, 107; Nghị định 145/2020 Điều 60–62):
-- 1. Permission xem OT trong phạm vi (web HR).
-- 2. Quy định OT dùng khung quy định có tầng/phiên bản (kind 'overtime'): hệ số theo loại ngày (sàn luật 150/200/300%, kiểm ở API),
--    giới hạn giờ/ngày làm việc, /tháng, /năm, hạn đăng ký sau khi làm.
-- 3. Đơn OT dùng khung đơn từ + luồng duyệt (mặc định Quản lý → HR). Mỗi đơn một khoảng giờ trong một ngày (overtime_entries)
--    để chặn trùng, cộng dồn giới hạn và đưa vào bảng công; OT đã duyệt là đầu vào payroll (module payroll đọc sau).
-- Hệ số và giới hạn trong mẫu theo luật hiện hành; OT ban đêm (+30%/+20%) chưa tính — để module payroll.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('overtime.read','attendance','Xem làm thêm giờ trong phạm vi')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'overtime.read'
where r.tenant_id is null and r.is_system and r.code in ('tenant_admin','hr_ops','manager','auditor')
on conflict do nothing;

-- ---------- 2. Quy định OT ----------
alter table public.policy_definitions drop constraint policy_definitions_kind_check;
alter table public.policy_definitions add constraint policy_definitions_kind_check check (kind in ('explanation','salary_advance','reminder','leave','overtime'));
alter table public.policy_assignments drop constraint policy_assignments_kind_check;
alter table public.policy_assignments add constraint policy_assignments_kind_check
  check (kind in ('shift','work_location','explanation','salary_advance','reminder','leave','overtime'));

-- ---------- 3. Đơn OT ----------
alter table public.requests drop constraint requests_request_type_check;
alter table public.requests add constraint requests_request_type_check check (request_type in ('explanation','leave','overtime'));
alter table public.workflow_definitions drop constraint workflow_definitions_request_type_check;
alter table public.workflow_definitions add constraint workflow_definitions_request_type_check check (request_type in ('explanation','leave','overtime'));

create table public.overtime_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  request_id uuid not null unique references public.requests(id) on delete restrict,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  minutes integer not null check (minutes > 0 and minutes % 30 = 0),
  -- Loại ngày lúc đăng ký: quyết định hệ số
  day_kind text not null check (day_kind in ('workday','weekend','holiday')),
  rate_percent integer not null check (rate_percent >= 100),
  check (end_time > start_time),
  check (minutes = (extract(epoch from (end_time - start_time)) / 60)::int)
);
create index overtime_entries_employee_idx on public.overtime_entries (employee_id, work_date);

-- Không trùng giờ với đơn OT khác đang chờ/đã duyệt; ngày thuộc kỳ công đã khóa không thêm được; không sửa/xóa
create or replace function public.overtime_entries_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then raise exception 'OVERTIME_IMMUTABLE' using errcode = 'P0001'; end if;
  if public.period_locked(new.tenant_id, new.work_date) then raise exception 'PERIOD_LOCKED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.overtime_entries o join public.requests r on r.id = o.request_id
    where o.employee_id = new.employee_id and o.work_date = new.work_date and o.request_id <> new.request_id
      and r.status in ('pending','approved') and o.start_time < new.end_time and new.start_time < o.end_time
  ) then raise exception 'OVERTIME_OVERLAP' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger overtime_entries_guard before insert or update or delete on public.overtime_entries
  for each row execute function public.overtime_entries_guard();

-- Tạo đơn OT nguyên tử: đơn + bước duyệt (create_request) + khoảng giờ. p_entry: {"date","start","end","minutes","dayKind","ratePercent"}
create or replace function public.create_overtime_request(
  p_tenant uuid, p_employee uuid, p_user uuid, p_workflow_version uuid, p_period_start date,
  p_payload jsonb, p_snapshot jsonb, p_tasks jsonb, p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public.create_request(p_tenant, 'OT', 'overtime', p_employee, p_user, p_workflow_version, (p_entry->>'date')::date, p_period_start, p_payload, p_snapshot, p_tasks);
  insert into public.overtime_entries (tenant_id, employee_id, request_id, work_date, start_time, end_time, minutes, day_kind, rate_percent)
  values (p_tenant, p_employee, (r->>'id')::uuid, (p_entry->>'date')::date, (p_entry->>'start')::time, (p_entry->>'end')::time,
    (p_entry->>'minutes')::int, p_entry->>'dayKind', (p_entry->>'ratePercent')::int);
  return r;
end;
$$;

-- ---------- Bộ mẫu: quy định OT + luồng duyệt ----------
update public.tenant_policy_templates
set content = jsonb_set(content, '{policies}', coalesce(content->'policies', '[]'::jsonb) || $json$[
  {"kind": "overtime", "code": "OT-CHUAN", "name": "Làm thêm giờ chuẩn", "config": {"weekdayRate": 150, "weekendRate": 200, "holidayRate": 300,
    "dailyLimitHours": 4, "monthlyLimitHours": 40, "yearlyLimitHours": 200, "submitAfterDays": 1}}
]$json$::jsonb)
  || jsonb_build_object('workflows', coalesce(content->'workflows', '[]'::jsonb) || $json$[
  {"requestType": "overtime", "name": "Làm thêm giờ", "steps": [{"resolver": "direct_manager", "slaHours": 24}, {"resolver": "hr", "slaHours": 24}]}
]$json$::jsonb),
  version = version + 1, updated_at = now()
where code = 'vn-default';

select public.provision_tenant(id), public.provision_workflows(id) from public.tenants;

-- ---------- Thông báo: nội dung đơn OT ----------
create or replace function public.request_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type when 'explanation' then 'Giải trình công' when 'leave' then 'Nghỉ phép' when 'overtime' then 'Làm thêm giờ' else 'Đơn' end;
$$;

-- "T6 23/10 · quên chấm ra" / "Phép năm · 27/10–28/10 · 2 ngày" / "T7 25/10 · 18:00–21:00 · 3 giờ"
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
  else concat_ws(' · ',
    case when r.work_date is not null then (array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from r.work_date)::int] || ' ' || to_char(r.work_date, 'DD/MM') end,
    case v.payload->>'kind' when 'missing_in' then 'quên chấm vào' when 'missing_out' then 'quên chấm ra' when 'late' then 'đến muộn có lý do'
      when 'early' then 'về sớm có lý do' when 'trip' then 'đi công tác' when 'device' then 'lỗi thiết bị/GPS' when 'other' then 'khác' end) end
  from public.requests r
  left join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;

-- ---------- Quyền + RLS ----------
revoke all on function public.create_overtime_request(uuid, uuid, uuid, uuid, date, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_overtime_request(uuid, uuid, uuid, uuid, date, jsonb, jsonb, jsonb, jsonb) to service_role;

alter table public.overtime_entries enable row level security;
create policy overtime_entries_read on public.overtime_entries for select to authenticated using (public.can_read_request(request_id));
grant select on public.overtime_entries to authenticated;
grant select, insert on public.overtime_entries to service_role;
