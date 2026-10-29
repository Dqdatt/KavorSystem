-- Quản trị viên Kavor Console: vai trò platform_admin, lời mời nhân viên Kavor (một lời mời chờ mỗi email, bất biến), luôn còn
-- ít nhất một quản trị viên đang hoạt động. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('b2000000-0000-4000-8000-0000000000a1', 'adm.a.test@kavor.test'),
  ('b2000000-0000-4000-8000-0000000000a2', 'adm.b.test@kavor.test');
select lives_ok($$ insert into public.platform_operators (user_id, email, full_name, role) values
  ('b2000000-0000-4000-8000-0000000000a1', 'adm.a.test@kavor.test', 'Quản trị A', 'platform_admin') $$, 'Vai trò platform_admin hợp lệ');
select throws_ok($$ insert into public.platform_operators (user_id, email, full_name, role) values
  ('b2000000-0000-4000-8000-0000000000a2', 'adm.b.test@kavor.test', 'B', 'root') $$, '23514', null, 'Vai trò lạ bị chặn');

-- ---------- Lời mời ----------
insert into public.platform_operator_invites (id, email, full_name, role, invited_by) values
  ('b2000000-0000-4000-8000-0000000000c1', 'moi.test@kavor.test', 'Người Mới', 'platform_operator', 'b2000000-0000-4000-8000-0000000000a1');
select is((select (expires_at - created_at)::text from public.platform_operator_invites where id = 'b2000000-0000-4000-8000-0000000000c1'), '7 days', 'Lời mời hết hạn sau 7 ngày');
select throws_ok($$ insert into public.platform_operator_invites (email, full_name, role, invited_by) values
  ('MOI.test@kavor.test', 'Người Mới 2', 'platform_support', 'b2000000-0000-4000-8000-0000000000a1') $$, '23505', null, 'Một email chỉ có một lời mời đang chờ (không phân biệt hoa thường)');
select throws_ok($$ update public.platform_operator_invites set role = 'platform_admin' where id = 'b2000000-0000-4000-8000-0000000000c1' $$,
  '23514', null, 'Không sửa vai trò của lời mời đã gửi');
update public.platform_operator_invites set status = 'revoked' where id = 'b2000000-0000-4000-8000-0000000000c1';
select isnt((select decided_at from public.platform_operator_invites where id = 'b2000000-0000-4000-8000-0000000000c1'), null, 'Thu hồi ghi thời điểm');
select throws_ok($$ update public.platform_operator_invites set status = 'pending' where id = 'b2000000-0000-4000-8000-0000000000c1' $$,
  '23514', null, 'Lời mời đã thu hồi không mở lại được');
select lives_ok($$ insert into public.platform_operator_invites (email, full_name, role, invited_by) values
  ('moi.test@kavor.test', 'Người Mới', 'platform_support', 'b2000000-0000-4000-8000-0000000000a1') $$, 'Thu hồi xong mời lại được');

-- ---------- Luôn còn quản trị viên ----------
-- Khóa mọi quản trị viên khác (nếu DB đang có) để A là người cuối cùng
update public.platform_operators set status = 'disabled' where role = 'platform_admin' and status = 'active' and user_id <> 'b2000000-0000-4000-8000-0000000000a1';
select throws_ok($$ update public.platform_operators set status = 'disabled' where user_id = 'b2000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'Không khóa được quản trị viên cuối cùng');
select throws_ok($$ update public.platform_operators set role = 'platform_operator' where user_id = 'b2000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'Không hạ vai trò quản trị viên cuối cùng');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$ select * from public.platform_operator_invites $$, '42501', null, 'Client không đọc được lời mời nhân viên Kavor');

select * from finish();
rollback;
