-- Kavor Console: tạo tenant + Tenant Admin nguyên tử, cấp Tenant Admin idempotent, khôi phục chủ sở hữu hai người,
-- bảng nền tảng không lộ cho client. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email) values
  ('b0000000-0000-4000-8000-0000000000a1', 'op.a.test@kavor.test'),
  ('b0000000-0000-4000-8000-0000000000a2', 'op.b.test@kavor.test');
insert into public.platform_operators (user_id, email, full_name) values
  ('b0000000-0000-4000-8000-0000000000a1', 'op.a.test@kavor.test', 'Vận hành A'),
  ('b0000000-0000-4000-8000-0000000000a2', 'op.b.test@kavor.test', 'Vận hành B');

-- ---------- Tạo tenant ----------
select set_config('test.t', (public.create_tenant_with_admin('test-z', 'Công ty Thử Z', 'Công ty TNHH Thử Z', 'trial', 50, 'Lê Văn Chủ', 'chu@thuz.test', 'b0000000-0000-4000-8000-0000000000a1') ->> 'tenant_id'), true);
select is((select code || ' · ' || status || ' · ' || plan_code from public.tenants where id = current_setting('test.t')::uuid), 'TEST-Z · active · trial', 'Tạo tenant: mã viết hoa, đang hoạt động');
select is((select count(*)::int from public.departments where tenant_id = current_setting('test.t')::uuid), 2, 'Bộ mẫu có phòng ban để tạo nhân viên ngay');
select is((select count(*)::int from public.positions where tenant_id = current_setting('test.t')::uuid), 3, 'Bộ mẫu có chức danh');
select is((select name from public.legal_entities where tenant_id = current_setting('test.t')::uuid), 'Công ty TNHH Thử Z', 'Pháp nhân lấy tên pháp lý');
select is((select employee_code || ' · ' || full_name from public.employees where tenant_id = current_setting('test.t')::uuid), 'ADMIN01 · Lê Văn Chủ', 'Tenant Admin đầu tiên có hồ sơ ADMIN01');
select is((select m.status from public.memberships m join public.employees e on e.id = m.employee_id where e.tenant_id = current_setting('test.t')::uuid), 'invited', 'Membership chờ kích hoạt');
select is((select count(*)::int from public.role_assignments ra join public.roles r on r.id = ra.role_id where ra.tenant_id = current_setting('test.t')::uuid and r.code = 'tenant_admin'), 1, 'Gán role tenant_admin toàn công ty');
select is((select count(*)::int from public.employee_assignments where tenant_id = current_setting('test.t')::uuid), 1, 'Tenant Admin được xếp vào Ban Giám đốc');
select throws_ok($$ select public.create_tenant_with_admin('TEST-Z', 'Trùng', null, 'trial', 50, 'A B', 'x@thuz.test', null) $$, '23505', null, 'Trùng mã tenant bị chặn');

-- ---------- Cấp Tenant Admin ----------
select is(public.grant_tenant_admin(current_setting('test.t')::uuid, 'Lê Văn Chủ', 'CHU@thuz.test', null),
  (select id from public.employees where tenant_id = current_setting('test.t')::uuid and employee_code = 'ADMIN01'), 'Cấp lại cùng email (không phân biệt hoa thường) trả về người cũ');
select is((select count(*)::int from public.role_assignments where tenant_id = current_setting('test.t')::uuid), 1, 'Không gán trùng role');
select set_config('test.e2', public.grant_tenant_admin(current_setting('test.t')::uuid, 'Trần Thị Mới', 'moi@thuz.test', null)::text, true);
select is((select employee_code from public.employees where id = current_setting('test.e2')::uuid), 'ADMIN02', 'Người mới nhận mã ADMIN02 (nhiều nhân viên tạo tay không có mã ngoài)');
insert into public.employees (tenant_id, employee_code, full_name, hire_date, source_system, external_id)
values (current_setting('test.t')::uuid, 'IMP-1', 'Nhân viên import', current_date, 'sheets', 'X1');
select throws_ok($$ insert into public.employees (tenant_id, employee_code, full_name, hire_date, source_system, external_id)
  values (current_setting('test.t')::uuid, 'IMP-2', 'Trùng mã ngoài', current_date, 'sheets', 'X1') $$,
  '23505', null, 'Dữ liệu import vẫn chống trùng mã ngoài');

-- ---------- Khôi phục chủ sở hữu ----------
insert into public.owner_recovery_requests (id, tenant_id, kind, target_employee_id, verification, reason, requested_by)
select 'e0000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'mfa_reset', id, 'Gọi lại số tổng đài trên giấy ĐKKD, đối chiếu CCCD', 'Tenant Admin mất điện thoại', 'b0000000-0000-4000-8000-0000000000a1'
from public.employees where tenant_id = current_setting('test.t')::uuid and employee_code = 'ADMIN01';
select throws_ok($$ insert into public.owner_recovery_requests (tenant_id, kind, target_employee_id, verification, reason, requested_by)
  select tenant_id, kind, target_employee_id, verification, reason, requested_by from public.owner_recovery_requests where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23505', null, 'Chỉ một yêu cầu cùng loại đang chờ mỗi tenant');
select throws_ok($$ update public.owner_recovery_requests set status = 'approved', decided_by = requested_by, decided_at = now() where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'Người tạo không tự duyệt được');
select lives_ok($$ update public.owner_recovery_requests set status = 'approved', decided_by = 'b0000000-0000-4000-8000-0000000000a2', decided_at = now() where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'Người thứ hai duyệt được');
select throws_ok($$ update public.owner_recovery_requests set status = 'rejected' where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'RECOVERY_ALREADY_DECIDED', 'Đã quyết định thì không đổi được');
insert into public.owner_recovery_requests (id, tenant_id, kind, new_admin_name, new_admin_email, verification, reason, requested_by, requested_at, expires_at)
values ('e0000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid, 'grant_admin', 'Người Thay', 'thay@thuz.test', 'Công văn có dấu công ty, gọi lại xác nhận', 'Tenant Admin cũ đã nghỉ việc', 'b0000000-0000-4000-8000-0000000000a1', now() - interval '2 days', now() - interval '1 day');
select throws_ok($$ update public.owner_recovery_requests set status = 'approved', decided_by = 'b0000000-0000-4000-8000-0000000000a2', decided_at = now() where id = 'e0000000-0000-4000-8000-000000000002' $$,
  'P0001', 'RECOVERY_EXPIRED', 'Yêu cầu quá 24 giờ không duyệt được');
select throws_ok($$ delete from public.owner_recovery_requests where tenant_id = current_setting('test.t')::uuid $$, 'P0001', null, 'Yêu cầu khôi phục không xóa được');

-- ---------- Client không chạm được bảng/hàm nền tảng ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$ select * from public.platform_operators $$, '42501', null, 'Client không đọc được danh sách nhân viên Kavor');
select throws_ok($$ select public.create_tenant_with_admin('HACK', 'x', null, 'trial', 5, 'A B', 'a@b.test', null) $$, '42501', null, 'Client không tự tạo tenant được');

select * from finish();
rollback;
