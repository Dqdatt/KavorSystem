-- Vòng đời tenant: tạm khóa chặn RLS của người dùng tenant, mở lại khôi phục; đóng là trạng thái cuối. Gói dịch vụ mặc định.
-- Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('test.t', (public.create_tenant_with_admin('LIFE-T', 'Công ty Vòng Đời', null, 'starter', 100, 'Lê Chủ', 'chu@life.test', null) ->> 'tenant_id'), true);
insert into auth.users (id, email) values ('a7100000-0000-4000-8000-000000000001', 'chu@life.test');
update public.employees set user_id = 'a7100000-0000-4000-8000-000000000001' where tenant_id = current_setting('test.t')::uuid;
update public.memberships set user_id = 'a7100000-0000-4000-8000-000000000001', status = 'active' where tenant_id = current_setting('test.t')::uuid;

select is((select string_agg(code || ':' || coalesce(employee_limit::text, '-'), ',' order by sort) from public.platform_plans), 'trial:50,starter:100,growth:500,enterprise:-',
  'Gói mặc định: Dùng thử 50, Starter 100, Growth 500, Enterprise theo hợp đồng');

create function pg_temp.as_admin(q text) returns int language plpgsql as $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  execute q into n;
  reset role;
  return n;
end; $$;

select is(pg_temp.as_admin($$select count(*)::int from public.employees$$), 1, 'Đang hoạt động: Tenant Admin đọc được hồ sơ');
select is(pg_temp.as_admin(format($$select public.is_active_member(%L)::int$$, current_setting('test.t'))), 1, 'Đang hoạt động: là thành viên');

update public.tenants set status = 'suspended', status_reason = 'Chưa thanh toán' where id = current_setting('test.t')::uuid;
select isnt((select status_changed_at from public.tenants where id = current_setting('test.t')::uuid), null, 'Ghi thời điểm đổi trạng thái');
select is(pg_temp.as_admin(format($$select public.is_active_member(%L)::int$$, current_setting('test.t'))), 0, 'Tạm khóa: không còn là thành viên hoạt động');
select is(pg_temp.as_admin($$select count(*)::int from public.employees$$), 0, 'Tạm khóa: RLS không trả hồ sơ');
select is(pg_temp.as_admin($$select count(*)::int from public.current_employee_ids()$$), 0, 'Tạm khóa: không còn hồ sơ của chính mình');
select is((select count(*)::int from public.permission_scopes('a7100000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'employee.read')), 0,
  'Tạm khóa: không còn quyền');

update public.tenants set status = 'active', status_reason = 'Đã thanh toán' where id = current_setting('test.t')::uuid;
select is(pg_temp.as_admin($$select count(*)::int from public.employees$$), 1, 'Mở lại: đọc lại được');

select throws_ok(format($$update public.tenants set status = 'closed' where id = %L$$, current_setting('test.t')), 'P0001', 'TENANT_CLOSE_REQUIRES_SUSPENDED', 'Chỉ đóng tenant đang tạm khóa');
update public.tenants set status = 'suspended' where id = current_setting('test.t')::uuid;
update public.tenants set status = 'closed', status_reason = 'Hết hợp đồng' where id = current_setting('test.t')::uuid;
select is((select status from public.tenants where id = current_setting('test.t')::uuid), 'closed', 'Đóng tenant đang tạm khóa');
select throws_ok(format($$update public.tenants set status = 'active' where id = %L$$, current_setting('test.t')), 'P0001', 'TENANT_CLOSED', 'Tenant đã đóng không mở lại');
select is(pg_temp.as_admin($$select count(*)::int from public.employees$$), 0, 'Đã đóng: RLS không trả hồ sơ');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select count(*) from public.platform_plans$$, '42501', null, 'Client không đọc bảng gói');
reset role;

select * from finish();
rollback;
