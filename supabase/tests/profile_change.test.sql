-- Đề nghị sửa hồ sơ: dữ liệu riêng trong transaction, chạy được cả sau smoke (không giả định DB trống).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('a6100000-0000-4000-8000-000000000001','pc-admin@example.test'),
  ('a6100000-0000-4000-8000-000000000002','pc-emp@example.test'),
  ('a6100000-0000-4000-8000-000000000003','pc-mgr@example.test'),
  ('a6100000-0000-4000-8000-000000000004','pc-pay@example.test'),
  ('a6100000-0000-4000-8000-000000000005','pc-other@example.test');
select set_config('test.pt', (public.create_tenant_with_admin('PCTEST','Công ty thử hồ sơ',null,'trial',20,'Admin hồ sơ','pc-admin-x@example.test',null)->>'tenant_id'), true);
select set_config('test.po', (public.create_tenant_with_admin('PCOTHER','Tenant khác hồ sơ',null,'trial',20,'Admin khác','pc-admin-y@example.test',null)->>'tenant_id'), true);

select is((select string_agg(r.code, ',' order by r.code) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
  where r.tenant_id is null and p.code = 'employee.sensitive.read'), 'hr_ops,payroll,tenant_admin', 'Số tài khoản đầy đủ: HR, Tenant Admin, Kế toán');
select ok((select w.steps::jsonb = '[{"slaHours": 48, "resolver": "hr"}]'::jsonb from public.workflow_versions w join public.workflow_definitions d on d.id = w.workflow_id
  where d.tenant_id = current_setting('test.pt')::uuid and d.request_type = 'profile_change'), 'Tenant mới có luồng sửa hồ sơ chỉ HR duyệt');

insert into public.legal_entities (id, tenant_id, code, name, effective_from) values ('a6200000-0000-4000-8000-000000000001', current_setting('test.pt')::uuid, 'PCLE', 'Pháp nhân', '2020-01-01');
insert into public.branches (id, tenant_id, legal_entity_id, code, name, effective_from) values ('a6300000-0000-4000-8000-000000000001', current_setting('test.pt')::uuid, 'a6200000-0000-4000-8000-000000000001', 'PCHCM', 'HCM', '2020-01-01');
insert into public.departments (id, tenant_id, branch_id, code, name, effective_from) values ('a6400000-0000-4000-8000-000000000001', current_setting('test.pt')::uuid, 'a6300000-0000-4000-8000-000000000001', 'PCA', 'Phòng A', '2020-01-01');
insert into public.positions (id, tenant_id, code, name, effective_from) values ('a6500000-0000-4000-8000-000000000001', current_setting('test.pt')::uuid, 'PCNV', 'Nhân viên', '2020-01-01');
insert into public.employees (id, tenant_id, employee_code, user_id, full_name, hire_date, phone) values
  ('e6100000-0000-4000-8000-000000000002', current_setting('test.pt')::uuid, 'E01', 'a6100000-0000-4000-8000-000000000002', 'Nhân viên', '2020-01-01', '0900000001'),
  ('e6100000-0000-4000-8000-000000000003', current_setting('test.pt')::uuid, 'M01', 'a6100000-0000-4000-8000-000000000003', 'Quản lý', '2020-01-01', null),
  ('e6100000-0000-4000-8000-000000000004', current_setting('test.pt')::uuid, 'K01', 'a6100000-0000-4000-8000-000000000004', 'Kế toán', '2020-01-01', null),
  ('e6100000-0000-4000-8000-000000000005', current_setting('test.po')::uuid, 'X01', 'a6100000-0000-4000-8000-000000000005', 'Tenant khác', '2020-01-01', null);
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from)
select current_setting('test.pt')::uuid, e, 'a6200000-0000-4000-8000-000000000001', 'a6300000-0000-4000-8000-000000000001', 'a6400000-0000-4000-8000-000000000001', 'a6500000-0000-4000-8000-000000000001', m, '2020-01-01'
from (values ('e6100000-0000-4000-8000-000000000002'::uuid, 'e6100000-0000-4000-8000-000000000003'::uuid), ('e6100000-0000-4000-8000-000000000003', null), ('e6100000-0000-4000-8000-000000000004', null)) x(e, m);
insert into public.memberships (tenant_id, employee_id, user_id, status)
select tenant_id, id, user_id, 'active' from public.employees where id::text like 'e6100000-%';
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
select m.tenant_id, m.id, r.id, x.scope, x.scope_id, '2020-01-01' from public.memberships m
join (values ('a6100000-0000-4000-8000-000000000002'::uuid, 'employee', 'self', null::uuid), ('a6100000-0000-4000-8000-000000000003', 'manager', 'department', 'a6400000-0000-4000-8000-000000000001'),
  ('a6100000-0000-4000-8000-000000000004', 'payroll', 'tenant', null), ('a6100000-0000-4000-8000-000000000005', 'employee', 'self', null)) x(u, role, scope, scope_id) on x.u = m.user_id
join public.roles r on r.code = x.role and r.tenant_id is null;
update public.employees set user_id='a6100000-0000-4000-8000-000000000001' where tenant_id=current_setting('test.pt')::uuid and employee_code='ADMIN01';
update public.memberships set user_id='a6100000-0000-4000-8000-000000000001', status='active'
where tenant_id=current_setting('test.pt')::uuid and employee_id=(select id from public.employees where tenant_id=current_setting('test.pt')::uuid and employee_code='ADMIN01');

create function pg_temp.wf() returns uuid language sql stable as $$
  select w.id from public.workflow_versions w join public.workflow_definitions d on d.id = w.workflow_id
  where d.tenant_id = current_setting('test.pt')::uuid and d.request_type = 'profile_change' order by w.version_no limit 1
$$;
create function pg_temp.req(p_after jsonb, p_bank jsonb default null) returns uuid language sql as $$
  select (public.create_profile_change_request(current_setting('test.pt')::uuid, 'e6100000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000002', pg_temp.wf(),
    jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_after) k), 'before', '{}'::jsonb, 'after', p_after, 'reason', 'Cập nhật'),
    '{}'::jsonb, '[{"stepNo":1,"resolver":"hr","status":"pending","slaHours":48}]'::jsonb, p_bank)->>'id')::uuid
$$;
create function pg_temp.approve(p_req uuid, p_ok boolean default true) returns text language sql as $$
  select public.decide_approval((select id from public.approval_tasks where request_id = p_req and status = 'pending'), 'a6100000-0000-4000-8000-000000000001', p_ok, null)
$$;

-- ---------- Tạo đơn ----------
select set_config('test.r1', pg_temp.req('{"phone":"0911222333","personalEmail":"ha@gmail.com","address":"Quận 3","emergency":{"name":"Bình","phone":"0909","relation":"Bố"},"bank":{"bankName":"Techcombank","holder":"TRAN THU HA","last4":"6789"}}',
  '{"bankName":"Techcombank","accountNo":"190123456789","holder":"TRAN THU HA"}')::text, true);
select is((select request_no from public.requests where id = current_setting('test.r1')::uuid) ~ '^HS-[0-9]{4}$', true, 'Số đơn tiền tố HS');
select is((select count(*)::int from public.request_versions where request_id = current_setting('test.r1')::uuid and payload::text like '%190123456789%'), 0, 'Nội dung đơn không chứa số tài khoản đầy đủ');
select is((select account_no from public.profile_change_bank where request_id = current_setting('test.r1')::uuid), '190123456789', 'Số tài khoản mới lưu riêng');
select is(public.request_label(current_setting('test.r1')::uuid) like 'Sửa %tài khoản ngân hàng%', true, 'Nhãn thông báo liệt kê trường đổi');
select throws_ok($$select pg_temp.req('{"address":"x"}')$$, '23505', null, 'Chỉ một đề nghị đang chờ mỗi nhân viên');
select is((select phone from public.employees where id = 'e6100000-0000-4000-8000-000000000002'), '0900000001', 'Chưa duyệt: điện thoại cũ vẫn hiệu lực');
select is((select count(*)::int from public.employee_bank_accounts where employee_id = 'e6100000-0000-4000-8000-000000000002'), 0, 'Chưa duyệt: chưa có tài khoản');
select throws_ok($$update public.profile_change_bank set account_no = '000000' where request_id = current_setting('test.r1')::uuid$$, 'P0001', null, 'Số tài khoản trong đơn không sửa được');

-- ---------- Duyệt: áp vào hồ sơ ----------
select is(pg_temp.approve(current_setting('test.r1')::uuid), 'approved', 'HR duyệt');
select is((select phone from public.employees where id = 'e6100000-0000-4000-8000-000000000002'), '0911222333', 'Áp điện thoại');
select is((select personal_email::text || '|' || address || '|' || emergency_name || '|' || emergency_relation from public.employee_profiles where employee_id = 'e6100000-0000-4000-8000-000000000002'),
  'ha@gmail.com|Quận 3|Bình|Bố', 'Áp email cá nhân, địa chỉ, liên hệ khẩn cấp');
select is((select bank_name || '|' || account_no || '|' || holder from public.employee_bank_accounts where employee_id = 'e6100000-0000-4000-8000-000000000002'),
  'Techcombank|190123456789|TRAN THU HA', 'Áp tài khoản ngân hàng');

select set_config('test.r2', pg_temp.req('{"address":"Quận 1"}')::text, true);
select is(pg_temp.approve(current_setting('test.r2')::uuid), 'approved', 'Duyệt đơn chỉ đổi địa chỉ');
select is((select personal_email::text || '|' || address from public.employee_profiles where employee_id = 'e6100000-0000-4000-8000-000000000002'), 'ha@gmail.com|Quận 1',
  'Chỉ trường có trong đơn bị đổi');
select is((select account_no from public.employee_bank_accounts where employee_id = 'e6100000-0000-4000-8000-000000000002'), '190123456789', 'Tài khoản giữ nguyên');

select set_config('test.r3', pg_temp.req('{"address":null,"phone":"0988"}')::text, true);
select is(pg_temp.approve(current_setting('test.r3')::uuid, false), 'rejected', 'HR từ chối');
select is((select address from public.employee_profiles where employee_id = 'e6100000-0000-4000-8000-000000000002'), 'Quận 1', 'Đơn bị từ chối không áp');
select set_config('test.r4', pg_temp.req('{"address":null}')::text, true);
select is(pg_temp.approve(current_setting('test.r4')::uuid), 'approved', 'Duyệt đơn xóa địa chỉ');
select is((select address from public.employee_profiles where employee_id = 'e6100000-0000-4000-8000-000000000002'), null, 'Xóa trường khi đơn để trống');

-- ---------- RLS ----------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a6100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select account_no from public.employee_bank_accounts), '190123456789', 'Nhân viên xem tài khoản của mình');
select is((select count(*)::int from public.profile_change_bank), 1, 'Nhân viên xem số tài khoản trong đơn của mình');
select set_config('request.jwt.claims','{"sub":"a6100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_bank_accounts), 0, 'Quản lý không xem số tài khoản của nhân viên');
select is((select count(*)::int from public.profile_change_bank), 0, 'Quản lý không xem số tài khoản trong đơn');
select set_config('request.jwt.claims','{"sub":"a6100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select account_no from public.employee_bank_accounts), '190123456789', 'Kế toán đọc tài khoản đã duyệt');
select set_config('request.jwt.claims','{"sub":"a6100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_bank_accounts) + (select count(*)::int from public.employee_profiles), 0, 'Tenant khác không thấy');
select throws_ok($$select public.create_profile_change_request(current_setting('test.pt')::uuid, 'e6100000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000002', pg_temp.wf(), '{}', '{}', '[]', null)$$,
  '42501', null, 'Client không gọi được hàm tạo đơn');
reset role;

select * from finish();
rollback;
