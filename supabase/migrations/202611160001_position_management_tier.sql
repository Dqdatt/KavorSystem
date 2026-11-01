-- Cấp quản lý của chức danh (1 Nhân viên, 2 Trưởng nhóm, 3 Quản lý, 4 Ban Giám đốc) — tách khỏi job_level (ngạch tự do của công ty, ví dụ L2, L4).
-- Dùng để lọc/kiểm "Quản lý trực tiếp": người quản lý phải có cấp cao hơn (Ban Giám đốc được quản lý Ban Giám đốc); để trống = chưa phân cấp,
-- không chặn. Kiểm ở API (lưu hồ sơ, nhập file); dữ liệu cũ không tự sửa — checklist liệt kê chỗ sai để HR sửa.
alter table public.positions add column management_tier smallint check (management_tier between 1 and 4);

-- Mẫu cho công ty mới: Nhân viên 1, Quản lý 3, thêm Ban Giám đốc 4; "Quản trị viên" để trống (quản trị viên có thể là Head of HR/Finance)
update public.tenant_policy_templates
set content = jsonb_set(content, '{organization,positions}', '[
  {"code": "BGD", "name": "Ban Giám đốc", "tier": 4},
  {"code": "QTV", "name": "Quản trị viên"},
  {"code": "QL", "name": "Quản lý", "tier": 3},
  {"code": "NV", "name": "Nhân viên", "tier": 1}
]'::jsonb)
where code = 'vn-default' and content ? 'organization';

create or replace function public.provision_tenant(p_tenant uuid, p_template text DEFAULT 'vn-default'::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t jsonb;
  tn public.tenants;
  d date;
  created jsonb := '[]'::jsonb;
  sid uuid;
  pid uuid;
  le uuid;
  br uuid;
  p jsonb;
begin
  select content into t from public.tenant_policy_templates where code = p_template;
  if t is null then raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into tn from public.tenants where id = p_tenant;
  if tn.id is null then raise exception 'TENANT_NOT_FOUND' using errcode = 'P0001'; end if;
  d := (now() at time zone tn.timezone)::date;

  insert into public.tenant_settings (tenant_id, platform_policy) values (p_tenant, coalesce(t->'platformPolicy', '{}'::jsonb))
  on conflict (tenant_id) do nothing;
  if found then created := created || '"tenant_settings"'::jsonb; end if;

  if t ? 'organization' and not exists (select 1 from public.legal_entities where tenant_id = p_tenant) then
    insert into public.legal_entities (tenant_id, code, name, tax_code, effective_from)
    values (p_tenant, 'PN01', coalesce(tn.legal_name, tn.display_name), tn.tax_code, d) returning id into le;
    insert into public.branches (tenant_id, legal_entity_id, code, name, timezone, effective_from)
    values (p_tenant, le, t#>>'{organization,branch,code}', t#>>'{organization,branch,name}', tn.timezone, d) returning id into br;
    insert into public.departments (tenant_id, branch_id, code, name, effective_from)
    select p_tenant, br, x->>'code', x->>'name', d from jsonb_array_elements(t#>'{organization,departments}') x;
    insert into public.positions (tenant_id, code, name, management_tier, effective_from)
    select p_tenant, x->>'code', x->>'name', (x->>'tier')::smallint, d from jsonb_array_elements(t#>'{organization,positions}') x;
    created := created || '"organization"'::jsonb;
  end if;

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
$function$;
