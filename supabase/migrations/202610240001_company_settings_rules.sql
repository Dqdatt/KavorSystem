-- Cài đặt công ty và nền quy định có tầng/phiên bản (ADR 0001 §2–5, DATABASE_SCHEMA §20):
-- 1. Permission: cấu hình tenant, quy định, dữ liệu cá nhân.
-- 2. tenant_settings: liên hệ HR và chính sách nền tảng (thương hiệu dùng cột branding có sẵn; ảnh nằm ở Storage,
--    bucket `tenant-branding`, thư mục theo tenant — API tạo bucket và là nơi duy nhất đọc/ghi).
-- 3. Quy định nghiệp vụ dùng chung (giải trình, tạm ứng, nhắc nhở): định nghĩa + phiên bản bất biến, áp dụng
--    theo tầng bằng chính policy_assignments của ca/địa điểm; DB kiểm tra target đúng loại và đúng tenant.
-- 4. Lịch nghỉ lễ: lịch quốc gia do Kavor duy trì (tenant_id null) + lịch riêng của công ty.
-- 5. Điều khoản dữ liệu cá nhân có phiên bản + lượt đồng ý chỉ thêm (Nghị định 13/2023/NĐ-CP).
-- 6. Bộ mẫu mặc định theo luật Việt Nam + hàm provision_tenant (Kavor Console gọi khi tạo tenant).
-- Luật nhà nước dạng số (tỷ lệ bảo hiểm, thuế, phép năm tối thiểu, giới hạn OT) làm cùng module phép/payroll.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('tenant.settings.manage','tenant','Quản lý cấu hình tenant: thông tin, thương hiệu, liên hệ, điều khoản dữ liệu cá nhân'),
  ('policy.read','policy','Xem quy định nghiệp vụ và lịch nghỉ lễ'),
  ('policy.manage','policy','Quản lý quy định nghiệp vụ và lịch nghỉ riêng của công ty'),
  ('privacy.read','privacy','Xem điều khoản và tình trạng đồng ý dữ liệu cá nhân')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'tenant_admin' then array['tenant.settings.manage','policy.read','policy.manage','privacy.read']
  when 'hr_ops' then array['policy.read','policy.manage','privacy.read']
  when 'manager' then array['policy.read']
  when 'auditor' then array['policy.read','privacy.read']
end)
where r.tenant_id is null and r.is_system and r.code in ('tenant_admin','hr_ops','manager','auditor')
on conflict do nothing;

-- ---------- 2. tenant_settings ----------
-- support_contact: {phone, email, hours, note} · platform_policy: {newsReadReceipt, ...}
alter table public.tenant_settings
  add column support_contact jsonb not null default '{}'::jsonb check (jsonb_typeof(support_contact) = 'object'),
  add column platform_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_policy) = 'object');

-- ---------- 3. Quy định nghiệp vụ có tầng/phiên bản ----------
create table public.policy_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  kind text not null check (kind in ('explanation','salary_advance','reminder')),
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- config theo kind, kiểm tra ở API (@kavor/contracts POLICY_KINDS). Bất biến: sửa = phiên bản mới.
create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  policy_id uuid not null references public.policy_definitions(id) on delete restrict,
  version_no integer not null,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  effective_from date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (policy_id, version_no),
  unique (policy_id, effective_from)
);
create index policy_versions_policy_idx on public.policy_versions(policy_id, effective_from desc);
create trigger policy_versions_immutable before update or delete on public.policy_versions for each row execute function public.immutable_row();
create trigger policy_definitions_updated_at before update on public.policy_definitions for each row execute function public.set_updated_at();

alter table public.policy_assignments drop constraint policy_assignments_kind_check;
alter table public.policy_assignments add constraint policy_assignments_kind_check
  check (kind in ('shift','work_location','explanation','salary_advance','reminder'));

-- target_id không có khóa ngoại (trỏ tới 3 bảng): kiểm tra đúng loại, đúng tenant khi tạo
create or replace function public.policy_assignment_target_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not (case new.kind
    when 'shift' then exists (select 1 from public.shift_definitions where id = new.target_id and tenant_id = new.tenant_id)
    when 'work_location' then exists (select 1 from public.work_locations where id = new.target_id and tenant_id = new.tenant_id)
    else exists (select 1 from public.policy_definitions where id = new.target_id and tenant_id = new.tenant_id and kind = new.kind)
  end) then
    raise exception 'POLICY_TARGET_MISMATCH' using errcode = 'P0001', hint = 'target_id phải thuộc đúng loại chính sách và cùng tenant';
  end if;
  return new;
end;
$$;
create trigger policy_assignments_target before insert on public.policy_assignments
  for each row execute function public.policy_assignment_target_check();

-- ---------- 4. Lịch nghỉ lễ ----------
-- tenant_id null: lịch quốc gia do Kavor duy trì, mọi tenant dùng chung; có tenant_id: ngày nghỉ riêng của công ty
create table public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  name text not null,
  source_document text,
  -- Chưa có người xác nhận (HR/Payroll SME, luật sư) thì chưa dùng cho payroll thật
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, year)
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.holiday_calendars(id) on delete restrict,
  holiday_date date not null,
  name text not null check (length(trim(name)) between 2 and 120),
  kind text not null check (kind in ('public','company','compensatory')),
  paid boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (calendar_id, holiday_date)
);
create index holidays_date_idx on public.holidays(holiday_date);

-- Ngày đã qua ảnh hưởng công/lương đã tính: không sửa/xóa (API cũng chặn, đây là chốt chặn cuối)
create or replace function public.holidays_guard_past()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then raise exception 'holidays is immutable'; end if;
  if old.holiday_date < current_date then raise exception 'HOLIDAY_IN_PAST' using errcode = 'P0001'; end if;
  return old;
end;
$$;
create trigger holidays_guard before update or delete on public.holidays for each row execute function public.holidays_guard_past();

-- Lịch quốc gia 2026 theo Bộ luật Lao động 2019 Điều 112 (11 ngày). Ngày liền kề Quốc khánh và lịch Tết do Chính phủ
-- công bố hằng năm — dữ liệu phát triển, CHƯA được chuyên gia xác nhận (verified_at null).
insert into public.holiday_calendars (id, tenant_id, year, name, source_document) values
  ('c0000000-0000-4000-8000-000000002026', null, 2026, 'Ngày lễ, Tết quốc gia 2026', 'Bộ luật Lao động 2019, Điều 112');
insert into public.holidays (calendar_id, holiday_date, name, kind) values
  ('c0000000-0000-4000-8000-000000002026','2026-01-01','Tết Dương lịch','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-02-16','Tết Nguyên đán (cuối năm Ất Tỵ)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-02-17','Tết Nguyên đán (mùng 1)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-02-18','Tết Nguyên đán (mùng 2)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-02-19','Tết Nguyên đán (mùng 3)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-02-20','Tết Nguyên đán (mùng 4)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-04-26','Giỗ Tổ Hùng Vương (10/3 âm lịch)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-04-27','Nghỉ bù Giỗ Tổ Hùng Vương (rơi vào Chủ nhật)','compensatory'),
  ('c0000000-0000-4000-8000-000000002026','2026-04-30','Ngày Chiến thắng','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-05-01','Ngày Quốc tế Lao động','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-09-01','Quốc khánh (ngày liền kề)','public'),
  ('c0000000-0000-4000-8000-000000002026','2026-09-02','Quốc khánh','public');

-- ---------- 5. Điều khoản dữ liệu cá nhân ----------
create table public.privacy_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  version_no integer not null,
  title text not null check (length(trim(title)) between 5 and 160),
  content text not null check (length(content) between 50 and 50000),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, version_no)
);
create trigger privacy_terms_immutable before update or delete on public.privacy_terms for each row execute function public.immutable_row();

-- Mỗi lần đồng ý là bằng chứng: chỉ thêm, ghi phiên bản điều khoản, thiết bị, IP
create table public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  terms_id uuid not null references public.privacy_terms(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  installation_id text,
  ip text,
  user_agent text,
  unique (employee_id, terms_id)
);
create index privacy_consents_terms_idx on public.privacy_consents(tenant_id, terms_id);
create trigger privacy_consents_append_only before update or delete on public.privacy_consents for each row execute function public.immutable_row();

-- ---------- 6. Bộ mẫu mặc định cho tenant mới ----------
create table public.tenant_policy_templates (
  code text primary key,
  name text not null,
  version integer not null default 1,
  content jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.tenant_policy_templates (code, name, content) values ('vn-default', 'Mẫu mặc định theo luật Việt Nam', $json${
  "shift": {"code": "HC", "name": "Ca hành chính", "start": "08:00", "end": "17:00", "breakStart": "12:00", "breakEnd": "13:00"},
  "policies": [
    {"kind": "explanation", "code": "GT-CHUAN", "name": "Giải trình công chuẩn", "config": {"monthlyLimit": 3, "deadlineDays": 3}},
    {"kind": "salary_advance", "code": "TU-CHUAN", "name": "Tạm ứng lương chuẩn", "config": {"enabled": true, "maxPercent": 30, "excludeProbation": true, "excludeNoticePeriod": true}},
    {"kind": "reminder", "code": "NN-CHUAN", "name": "Nhắc nhở cơ bản", "config": {"clockInBeforeMinutes": 10, "clockOutAfterMinutes": 5, "explanationDeadline": true}}
  ],
  "platformPolicy": {"newsReadReceipt": true},
  "privacy": {
    "title": "Điều khoản xử lý dữ liệu cá nhân",
    "content": "Công ty (bên kiểm soát dữ liệu) xử lý dữ liệu cá nhân của bạn trên nền tảng Kavor cho mục đích quản lý nhân sự, theo Nghị định 13/2023/NĐ-CP.\n\n1. Dữ liệu được xử lý: họ tên, mã nhân viên, email và số điện thoại công việc, thông tin hợp đồng và tổ chức; thời điểm và vị trí GPS khi bạn chấm công (chỉ lấy khi bạn bấm chấm công); thông tin thiết bị đăng ký chấm công.\n\n2. Mục đích: chấm công, tính công và lương, phê duyệt đơn từ, liên lạc công việc, bảo mật tài khoản.\n\n3. Người được xem: phòng Nhân sự, quản lý trực tiếp và người được công ty phân quyền, theo đúng phạm vi công việc. Kavor chỉ xử lý dữ liệu theo chỉ dẫn của công ty.\n\n4. Lưu trữ: trong thời gian bạn làm việc và thời hạn pháp luật yêu cầu sau đó.\n\n5. Quyền của bạn: được biết, xem, yêu cầu chỉnh sửa, rút lại đồng ý (có thể ảnh hưởng tới việc dùng các chức năng như chấm công), khiếu nại. Liên hệ phòng Nhân sự để thực hiện.\n\nĐây là nội dung mẫu của Kavor; công ty cần chuyên gia pháp lý rà soát trước khi áp dụng."
  }
}$json$::jsonb);

-- Sinh bộ mẫu cho một tenant. Idempotent: chỉ tạo phần tenant chưa có (Kavor Console gọi khi tạo tenant; gọi lại
-- an toàn). Hiệu lực từ hôm nay theo múi giờ của tenant. Trả về danh sách phần đã tạo.
create or replace function public.provision_tenant(p_tenant uuid, p_template text default 'vn-default', p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb;
  d date;
  created jsonb := '[]'::jsonb;
  sid uuid;
  pid uuid;
  p jsonb;
begin
  select content into t from public.tenant_policy_templates where code = p_template;
  if t is null then raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001'; end if;
  select (now() at time zone timezone)::date into d from public.tenants where id = p_tenant;
  if d is null then raise exception 'TENANT_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.tenant_settings (tenant_id, platform_policy) values (p_tenant, coalesce(t->'platformPolicy', '{}'::jsonb))
  on conflict (tenant_id) do nothing;
  if found then created := created || '"tenant_settings"'::jsonb; end if;

  if not exists (select 1 from public.shift_definitions where tenant_id = p_tenant) then
    insert into public.shift_definitions (tenant_id, code, name) values (p_tenant, t#>>'{shift,code}', t#>>'{shift,name}') returning id into sid;
    insert into public.shift_versions (tenant_id, shift_id, version_no, start_time, end_time, break_start, break_end, effective_from, note, created_by)
    values (p_tenant, sid, 1, (t#>>'{shift,start}')::time, (t#>>'{shift,end}')::time, (t#>>'{shift,breakStart}')::time, (t#>>'{shift,breakEnd}')::time, d, 'Mẫu mặc định Kavor', p_actor);
    insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from, created_by) values (p_tenant, 'shift', sid, 'tenant', d, p_actor);
    created := created || '"shift"'::jsonb;
  end if;

  for p in select value from jsonb_array_elements(t->'policies') loop
    if not exists (select 1 from public.policy_definitions where tenant_id = p_tenant and kind = p->>'kind') then
      insert into public.policy_definitions (tenant_id, kind, code, name) values (p_tenant, p->>'kind', p->>'code', p->>'name') returning id into pid;
      insert into public.policy_versions (tenant_id, policy_id, version_no, config, effective_from, note, created_by)
      values (p_tenant, pid, 1, p->'config', d, 'Mẫu mặc định Kavor', p_actor);
      insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from, created_by) values (p_tenant, p->>'kind', pid, 'tenant', d, p_actor);
      created := created || to_jsonb(p->>'kind');
    end if;
  end loop;

  if not exists (select 1 from public.privacy_terms where tenant_id = p_tenant) then
    insert into public.privacy_terms (tenant_id, version_no, title, content, published_by) values (p_tenant, 1, t#>>'{privacy,title}', t#>>'{privacy,content}', p_actor);
    created := created || '"privacy_terms"'::jsonb;
  end if;
  return jsonb_build_object('template', p_template, 'created', created);
end;
$$;
revoke all on function public.provision_tenant(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.provision_tenant(uuid, text, uuid) to service_role;

-- ---------- RLS ----------
alter table public.policy_definitions enable row level security;
alter table public.policy_versions enable row level security;
alter table public.holiday_calendars enable row level security;
alter table public.holidays enable row level security;
alter table public.privacy_terms enable row level security;
alter table public.privacy_consents enable row level security;
-- Bảng mẫu của nền tảng: chỉ service role (không có policy cho client)
alter table public.tenant_policy_templates enable row level security;

-- Quy định áp dụng cho chính nhân viên: mọi thành viên đọc được định nghĩa/phiên bản (không chứa dữ liệu cá nhân);
-- việc áp cho ai (policy_assignments) vẫn chỉ người có schedule.read xem
create policy policy_definitions_member_read on public.policy_definitions for select to authenticated using (public.is_active_member(tenant_id));
create policy policy_versions_member_read on public.policy_versions for select to authenticated using (public.is_active_member(tenant_id));
create policy holiday_calendars_read on public.holiday_calendars for select to authenticated
  using (tenant_id is null or public.is_active_member(tenant_id));
create policy holidays_read on public.holidays for select to authenticated
  using (exists (select 1 from public.holiday_calendars c where c.id = calendar_id and (c.tenant_id is null or public.is_active_member(c.tenant_id))));
create policy privacy_terms_member_read on public.privacy_terms for select to authenticated using (public.is_active_member(tenant_id));
-- Lượt đồng ý: của chính mình, hoặc người có privacy.read với nhân viên trong phạm vi
create policy privacy_consents_self_or_scope_read on public.privacy_consents for select to authenticated
  using (employee_id in (select public.current_employee_ids())
    or (public.has_permission('privacy.read', tenant_id) and public.can_read_employee('employee.read', tenant_id, employee_id)));

grant select on public.policy_definitions, public.policy_versions, public.holiday_calendars, public.holidays,
  public.privacy_terms, public.privacy_consents to authenticated;
grant select, insert, update, delete on public.policy_definitions, public.policy_versions, public.holiday_calendars, public.holidays,
  public.privacy_terms, public.privacy_consents, public.tenant_policy_templates to service_role;
