-- Xóa hẳn một doanh nghiệp (Kavor Console, chỉ Quản trị Console): mọi dòng có tenant_id, kể cả nhật ký, chấm công, lương.
-- Không hoàn tác được. Chỉ xóa doanh nghiệp đang tạm khóa hoặc đã đóng (không xóa nhầm khách đang dùng).
-- File trên Storage và tài khoản đăng nhập (auth.users) do API xóa sau khi hàm này chạy xong (hàm trả danh sách tài khoản).

-- 1. Trigger bảo vệ (bất biến, chỉ thêm, không gỡ quản trị viên cuối…) bỏ qua khi đang xóa doanh nghiệp.
--    Cờ `kavor.purge_tenant` chỉ đặt bằng set_config(..., true) trong purge_tenant (cục bộ transaction); client không đặt được.
--    Trigger mới tạo sau migration này cũng phải có điều kiện này — test platform_purge kiểm tra.
do $$
declare
  r record;
  def text;
  guard constant text := 'coalesce(current_setting(''kavor.purge_tenant'', true), '''') = ''''';
begin
  for r in
    select t.oid, t.tgname, c.relname, pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  loop
    if r.def like '%kavor.purge_tenant%' then continue; end if;
    def := case when r.def ~ ' WHEN \('
      then replace(replace(r.def, ' WHEN (', ' WHEN (' || guard || ' AND ('), ' EXECUTE FUNCTION ', ') EXECUTE FUNCTION ')
      else replace(r.def, ' EXECUTE FUNCTION ', ' WHEN (' || guard || ') EXECUTE FUNCTION ') end;
    execute format('drop trigger %I on public.%I', r.tgname, r.relname);
    execute def;
  end loop;
end $$;

-- 2. Xóa dữ liệu của một doanh nghiệp. Trả về tài khoản đăng nhập chỉ thuộc doanh nghiệp này (API xóa trong Auth) và số dòng đã xóa.
create function public.purge_tenant(p_tenant uuid) returns jsonb
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
