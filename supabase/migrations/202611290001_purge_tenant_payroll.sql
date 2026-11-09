-- Sửa xóa vĩnh viễn doanh nghiệp: doanh nghiệp đã nhập/tính kỳ lương bị PURGE_STUCK (kỳ lương và lần nhập khóa ngoại vòng).
-- Phát hiện khi chạy pgTAP platform_purge sau smoke lương (08/11/2026). Giữ nguyên phần còn lại của hàm (202611110001_purge_tenant.sql).
create or replace function public.purge_tenant(p_tenant uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st text;
  users uuid[];
  tbl text;
  n bigint;
  total bigint := 0;
  remaining int;
  pass int := 0;
  counts jsonb := '{}'::jsonb;
begin
  select status into st from public.tenants where id = p_tenant for update;
  if st is null then raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002'; end if;
  if st not in ('suspended', 'closed') then raise exception 'TENANT_ACTIVE' using errcode = 'P0001'; end if;
  perform set_config('kavor.purge_tenant', p_tenant::text, true);

  -- Tài khoản chỉ có ở doanh nghiệp này (không phải nhân viên Kavor, không có hồ sơ/thành viên ở doanh nghiệp khác)
  select coalesce(array_agg(distinct u), '{}') into users from (
    select user_id u from public.employees where tenant_id = p_tenant and user_id is not null
    union select user_id from public.memberships where tenant_id = p_tenant and user_id is not null
  ) x
  where not exists (select 1 from public.employees e where e.user_id = x.u and e.tenant_id <> p_tenant)
    and not exists (select 1 from public.memberships m where m.user_id = x.u and m.tenant_id <> p_tenant)
    and not exists (select 1 from public.platform_operators o where o.user_id = x.u);

  -- Bảng không có tenant_id nhưng trỏ vào dữ liệu doanh nghiệp
  delete from public.payslip_views v using public.payroll_results r where v.result_id = r.id and r.tenant_id = p_tenant;
  delete from public.holidays h using public.holiday_calendars c where h.calendar_id = c.id and c.tenant_id = p_tenant;
  -- Phòng ban cha/con dùng khóa ngoại RESTRICT trên chính bảng: gỡ quan hệ cha trước để xóa được cả bảng một lần
  update public.departments set parent_id = null where tenant_id = p_tenant and parent_id is not null;
  -- Kỳ lương ↔ lần nhập trỏ vòng (payroll_cycles.latest_batch_id → payroll_import_batches.cycle_id): gỡ trước, nếu không doanh nghiệp đã nhập/tính lương không xóa được
  update public.payroll_cycles set latest_batch_id = null where tenant_id = p_tenant and latest_batch_id is not null;

  -- Mọi bảng có tenant_id: lặp tới khi hết (bảng cha bị khóa ngoại RESTRICT chặn thì để lượt sau, khi bảng con đã xóa)
  loop
    pass := pass + 1;
    remaining := 0;
    for tbl in
      select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
      where c.table_schema = 'public' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE' and c.table_name <> 'tenants'
      order by c.table_name
    loop
      begin
        execute format('delete from public.%I where tenant_id = $1', tbl) using p_tenant;
        get diagnostics n = row_count;
        if n > 0 then counts := jsonb_set(counts, array[tbl], to_jsonb(coalesce((counts ->> tbl)::bigint, 0) + n)); total := total + n; end if;
      exception when foreign_key_violation then
        remaining := remaining + 1;
      end;
    end loop;
    exit when remaining = 0;
    if pass >= 30 then raise exception 'PURGE_STUCK: còn % bảng chưa xóa được', remaining using errcode = 'P0001'; end if;
  end loop;

  delete from public.user_profiles where id = any(users);
  delete from public.tenants where id = p_tenant;
  return jsonb_build_object('users', to_jsonb(users), 'rows', total, 'tables', counts);
end;
$$;
revoke all on function public.purge_tenant(uuid) from public, anon, authenticated;
grant execute on function public.purge_tenant(uuid) to service_role;
