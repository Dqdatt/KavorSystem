-- Kiểm tra cách ly dữ liệu giữa các tenant và quyền của anon/authenticated.
-- Chạy: supabase test db  (mỗi test chạy trong transaction và tự rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Dữ liệu thử: tenant A (seed Hải Đăng) và tenant B, mỗi bên một người dùng
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'user.a@example.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'user.b@example.test');
insert into public.tenants (id, code, display_name, status) values
  ('10000000-0000-4000-8000-0000000000bb', 'TEST-B', 'Công ty B', 'active');
insert into public.memberships (tenant_id, user_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'active'),
  ('10000000-0000-4000-8000-0000000000bb', 'b0000000-0000-4000-8000-00000000000b', 'active');
insert into public.employees (tenant_id, employee_code, full_name, hire_date) values
  ('10000000-0000-4000-8000-0000000000bb', 'B0001', 'Nhân viên B', '2026-01-01');
insert into public.user_profiles (id, display_name) values
  ('a0000000-0000-4000-8000-00000000000a', 'Người A'),
  ('b0000000-0000-4000-8000-00000000000b', 'Người B');

-- anon không đọc được gì
set local role anon;
select throws_ok('select count(*) from public.employees', '42501', null, 'anon không có quyền đọc employees');
select throws_ok('select count(*) from public.tenants', '42501', null, 'anon không có quyền đọc tenants');
select throws_ok('select count(*) from public.user_profiles', '42501', null, 'anon không có quyền đọc user_profiles');
reset role;

-- Người dùng A chỉ thấy tenant A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.tenants), 1, 'A chỉ thấy 1 tenant');
select is((select code from public.tenants), 'HDG-001', 'A thấy đúng tenant của mình');
select is((select count(*)::int from public.employees), 6, 'A thấy 6 nhân viên của tenant A');
select is((select count(*)::int from public.employees where employee_code = 'B0001'), 0, 'A không thấy nhân viên tenant B');
select is((select count(*)::int from public.user_profiles), 1, 'A chỉ thấy hồ sơ của chính mình');
select ok((select count(*) from public.permissions) > 0, 'A đọc được danh mục quyền hệ thống');
select throws_ok($$insert into public.employees (tenant_id, employee_code, full_name, hire_date) values ('10000000-0000-4000-8000-000000000001','X1','X','2026-01-01')$$, '42501', null, 'Client không ghi trực tiếp được employees');
select lives_ok($$update public.user_profiles set display_name = 'A mới' where id = 'a0000000-0000-4000-8000-00000000000a'$$, 'A sửa được tên hiển thị của mình');
update public.user_profiles set display_name = 'hack' where id = 'b0000000-0000-4000-8000-00000000000b';
reset role;
select is((select display_name from public.user_profiles where id = 'b0000000-0000-4000-8000-00000000000b'), 'Người B', 'A không sửa được hồ sơ của B');
set local role authenticated;

-- Người dùng B chỉ thấy tenant B
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.employees), 1, 'B chỉ thấy 1 nhân viên của tenant B');
select is((select count(*)::int from public.audit_logs), 0, 'B không thấy audit của tenant A');
reset role;

-- API (service_role) đọc/ghi được nhưng không TRUNCATE
set local role service_role;
select is((select count(*)::int from public.employees), 7, 'service_role đọc được mọi nhân viên');
select throws_ok('truncate public.audit_logs', '42501', null, 'service_role không TRUNCATE được');
reset role;

-- Audit chỉ được thêm, kể cả với quyền postgres
select throws_ok($$update public.audit_logs set reason = 'x'$$, 'P0001', 'audit_logs is append-only', 'Không sửa được audit');
select throws_ok($$delete from public.audit_logs$$, 'P0001', 'audit_logs is append-only', 'Không xóa được audit');

select * from finish();
rollback;
