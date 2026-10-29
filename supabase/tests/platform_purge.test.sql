-- Xóa hẳn doanh nghiệp (purge_tenant): chỉ khi tạm khóa/đã đóng; xóa sạch mọi bảng có tenant_id (thử trên dữ liệu mẫu Hải Đăng — chấm công,
-- đơn, phép, lương…); doanh nghiệp khác không mất gì; trigger bảo vệ vẫn chặn khi không xóa doanh nghiệp. Chạy trong transaction, rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select set_config('test.t', (select id::text from public.tenants where code = 'HDG-001'), true);
select set_config('test.other', (select id::text from public.tenants where code = 'MAUB-001'), true);

create function pg_temp.tenant_rows(p uuid) returns bigint language plpgsql as $$
declare tbl text; n bigint; total bigint := 0;
begin
  for tbl in select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I where tenant_id = $1', tbl) using p into n;
    total := total + n;
  end loop;
  return total;
end $$;
select set_config('test.other_rows', pg_temp.tenant_rows(current_setting('test.other')::uuid)::text, true);

select is((select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and pg_get_triggerdef(t.oid) not like '%kavor.purge_tenant%'), 0,
  'Mọi trigger của schema public bỏ qua khi đang xóa doanh nghiệp (trigger mới phải thêm điều kiện kavor.purge_tenant)');
select ok(pg_temp.tenant_rows(current_setting('test.t')::uuid) > 100, 'Dữ liệu mẫu Hải Đăng có nhiều dòng để thử');
select throws_ok(format('select public.purge_tenant(%L)', current_setting('test.t')), 'P0001', 'TENANT_ACTIVE', 'Doanh nghiệp đang hoạt động không xóa được');
select throws_ok($$ delete from public.audit_logs where tenant_id = current_setting('test.t')::uuid $$, null, null, 'Ngoài purge: nhật ký vẫn không xóa được');

update public.tenants set status = 'suspended', status_reason = 'Thử xóa' where id = current_setting('test.t')::uuid;
select set_config('test.r', public.purge_tenant(current_setting('test.t')::uuid)::text, true);
select is(pg_temp.tenant_rows(current_setting('test.t')::uuid), 0::bigint, 'Không còn dòng nào có tenant_id của doanh nghiệp đã xóa');
select is((select count(*)::int from public.tenants where id = current_setting('test.t')::uuid), 0, 'Dòng doanh nghiệp đã xóa');
select ok((current_setting('test.r')::jsonb ->> 'rows')::bigint > 100 and jsonb_array_length(current_setting('test.r')::jsonb -> 'users') >= 0, 'Trả về số dòng đã xóa và tài khoản cần xóa trong Auth');
select is(pg_temp.tenant_rows(current_setting('test.other')::uuid)::text, current_setting('test.other_rows'), 'Doanh nghiệp khác giữ nguyên');

set local role authenticated;
select throws_ok(format('select public.purge_tenant(%L)', current_setting('test.other')), '42501', null, 'Client không gọi được purge_tenant');

select * from finish();
rollback;
