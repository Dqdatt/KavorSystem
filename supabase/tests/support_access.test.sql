-- Support access: thời hạn do DB tính lúc duyệt, luồng trạng thái, nội dung bất biến, một yêu cầu chờ mỗi người, phiên hết hạn/tenant khóa
-- không còn hiệu lực, thành viên tenant đọc được, tenant khác không. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-0000000000a1', 'sup.a.test@kavor.test'),
  ('a8100000-0000-4000-8000-000000000001', 'chu@support.test');
insert into public.platform_operators (user_id, email, full_name, role) values ('b1000000-0000-4000-8000-0000000000a1', 'sup.a.test@kavor.test', 'Hỗ trợ A', 'platform_support');
select set_config('test.t', (public.create_tenant_with_admin('SUP-T', 'Công ty Hỗ Trợ', null, 'starter', 100, 'Lê Chủ', 'chu@support.test', null) ->> 'tenant_id'), true);
update public.employees set user_id = 'a8100000-0000-4000-8000-000000000001' where tenant_id = current_setting('test.t')::uuid;
update public.memberships set user_id = 'a8100000-0000-4000-8000-000000000001', status = 'active' where tenant_id = current_setting('test.t')::uuid;

select ok(exists (select 1 from public.permission_scopes('a8100000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'support_access.approve')),
  'Tenant Admin có quyền duyệt support access');

create function pg_temp.req(scopes text[] default array['settings'], mins int default 30) returns uuid language sql as $$
  insert into public.support_access_sessions (tenant_id, operator_user_id, ticket, reason, scopes, duration_minutes)
  values (current_setting('test.t')::uuid, 'b1000000-0000-4000-8000-0000000000a1', 'SUP-1', 'Kiểm tra cấu hình ca làm việc', scopes, mins) returning id $$;

select throws_ok($$select pg_temp.req(array['payroll'])$$, '23514', null, 'Phạm vi ngoài danh sách bị chặn');
select throws_ok($$select pg_temp.req(array['settings'], 120)$$, '23514', null, 'Thời hạn chỉ 30 hoặc 60 phút');
select set_config('test.s1', pg_temp.req(array['settings','directory'], 60)::text, true);
select throws_ok($$select pg_temp.req()$$, '23505', null, 'Một yêu cầu đang chờ mỗi người mỗi tenant');
select is(public.support_session_active(current_setting('test.s1')::uuid), false, 'Chưa duyệt: chưa có hiệu lực');
select throws_ok(format($$update public.support_access_sessions set expires_at = now() + interval '9 hours' where id = %L$$, current_setting('test.s1')), 'P0001', 'SUPPORT_REQUEST_IMMUTABLE',
  'Không tự đặt thời hạn khi chưa duyệt');

update public.support_access_sessions set status = 'approved', decided_by = 'a8100000-0000-4000-8000-000000000001',
  expires_at = now() + interval '30 days' where id = current_setting('test.s1')::uuid;
select is((select expires_at - starts_at from public.support_access_sessions where id = current_setting('test.s1')::uuid), interval '60 minutes',
  'Duyệt: thời hạn do DB tính đúng 60 phút, bỏ qua giá trị client gửi');
select is(public.support_session_active(current_setting('test.s1')::uuid), true, 'Đã duyệt: đang hiệu lực');
select throws_ok(format($$update public.support_access_sessions set scopes = array['audit'] where id = %L$$, current_setting('test.s1')), 'P0001', 'SUPPORT_REQUEST_IMMUTABLE', 'Không đổi phạm vi sau khi duyệt');
select throws_ok(format($$update public.support_access_sessions set status = 'pending' where id = %L$$, current_setting('test.s1')), 'P0001', 'SUPPORT_INVALID_TRANSITION', 'Không quay về chờ duyệt');

update public.tenants set status = 'suspended' where id = current_setting('test.t')::uuid;
select is(public.support_session_active(current_setting('test.s1')::uuid), false, 'Tenant tạm khóa: phiên mất hiệu lực');
update public.tenants set status = 'active' where id = current_setting('test.t')::uuid;

update public.support_access_sessions set status = 'revoked', ended_by = 'a8100000-0000-4000-8000-000000000001' where id = current_setting('test.s1')::uuid;
select is(public.support_session_active(current_setting('test.s1')::uuid), false, 'Thu hồi: mất hiệu lực ngay');
select isnt((select ended_at from public.support_access_sessions where id = current_setting('test.s1')::uuid), null, 'Ghi thời điểm thu hồi');
select throws_ok(format($$update public.support_access_sessions set status = 'approved' where id = %L$$, current_setting('test.s1')), 'P0001', 'SUPPORT_INVALID_TRANSITION', 'Đã thu hồi không duyệt lại');

-- Yêu cầu quá 24 giờ không duyệt được
select set_config('test.s2', pg_temp.req()::text, true);
alter table public.support_access_sessions disable trigger support_access_guard;
update public.support_access_sessions set request_expires_at = now() - interval '1 minute' where id = current_setting('test.s2')::uuid;
alter table public.support_access_sessions enable trigger support_access_guard;
select throws_ok(format($$update public.support_access_sessions set status = 'approved' where id = %L$$, current_setting('test.s2')), 'P0001', 'SUPPORT_REQUEST_EXPIRED', 'Yêu cầu quá 24 giờ không duyệt được');

-- RLS
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.support_access_sessions), 2, 'Thành viên tenant thấy yêu cầu hỗ trợ của công ty mình');
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.support_access_sessions), 0, 'Người ngoài tenant (kể cả nhân viên Kavor) không đọc trực tiếp');
select throws_ok($$select public.support_session_active(gen_random_uuid())$$, '42501', null, 'Client không gọi hàm kiểm tra phiên');
reset role;

select * from finish();
rollback;
