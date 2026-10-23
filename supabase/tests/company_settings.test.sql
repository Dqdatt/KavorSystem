-- Cài đặt công ty và quy định có tầng: bộ mẫu cho tenant mới, phiên bản bất biến, target đúng loại/tenant,
-- lịch lễ quốc gia + riêng, điều khoản/đồng ý dữ liệu cá nhân, RLS và cách ly tenant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------- Bộ mẫu mặc định ----------
insert into public.tenants (id, code, display_name, status) values ('10000000-0000-4000-8000-0000000000c1', 'TEST-C', 'Công ty Thử C', 'provisioning');
select is(
  (select jsonb_array_length(public.provision_tenant('10000000-0000-4000-8000-0000000000c1') -> 'created')),
  7, 'Tenant mới nhận đủ bộ mẫu: cài đặt, tổ chức, ca, 3 quy định, điều khoản');
select is(
  (select jsonb_array_length(public.provision_tenant('10000000-0000-4000-8000-0000000000c1') -> 'created')),
  0, 'Gọi lại provision_tenant không tạo trùng');
select is((select count(*)::int from public.policy_assignments where tenant_id = '10000000-0000-4000-8000-0000000000c1' and scope_type = 'tenant'),
  4, 'Ca + 3 quy định áp dụng ở tầng công ty');
select is((select (v.config ->> 'monthlyLimit')::int from public.policy_versions v join public.policy_definitions d on d.id = v.policy_id
  where d.tenant_id = '10000000-0000-4000-8000-0000000000c1' and d.kind = 'explanation'), 3, 'Mẫu giải trình: 3 lượt/tháng');
select throws_ok($$ select public.provision_tenant('10000000-0000-4000-8000-0000000000c1', 'khong-co') $$, 'P0001', 'TEMPLATE_NOT_FOUND', 'Mẫu không tồn tại bị từ chối');

-- ---------- Phiên bản bất biến, target đúng loại ----------
select throws_ok($$ update public.policy_versions set config = '{"monthlyLimit":9}' where tenant_id = '10000000-0000-4000-8000-0000000000c1' $$,
  'P0001', null, 'Không sửa được phiên bản quy định');
select throws_ok($$ insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from)
  select '10000000-0000-4000-8000-0000000000c1', 'explanation', id, 'tenant', current_date from public.shift_definitions where tenant_id = '10000000-0000-4000-8000-0000000000c1' $$,
  'P0001', 'POLICY_TARGET_MISMATCH', 'Áp dụng quy định giải trình trỏ vào ca bị chặn');
select throws_ok($$ insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from)
  select '10000000-0000-4000-8000-000000000001', 'explanation', id, 'tenant', current_date from public.policy_definitions where tenant_id = '10000000-0000-4000-8000-0000000000c1' and kind = 'explanation' $$,
  'P0001', 'POLICY_TARGET_MISMATCH', 'Áp dụng quy định của tenant khác bị chặn');
select lives_ok($$ insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, effective_from)
  select '10000000-0000-4000-8000-0000000000c1', 'reminder', id, 'tenant', current_date + 1 from public.policy_definitions where tenant_id = '10000000-0000-4000-8000-0000000000c1' and kind = 'reminder' $$,
  'Áp dụng đúng loại, đúng tenant');

-- ---------- Lịch lễ ----------
insert into public.holiday_calendars (id, tenant_id, year, name) values ('c1000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c1', 2026, 'Lịch riêng C');
insert into public.holidays (calendar_id, holiday_date, name, kind) values
  ('c1000000-0000-4000-8000-0000000000c1', current_date - 1, 'Ngày đã qua', 'company'),
  ('c1000000-0000-4000-8000-0000000000c1', current_date + 30, 'Ngày sắp tới', 'company');
select throws_ok($$ delete from public.holidays where calendar_id = 'c1000000-0000-4000-8000-0000000000c1' and holiday_date < current_date $$,
  'P0001', 'HOLIDAY_IN_PAST', 'Không xóa được ngày nghỉ đã qua');
select lives_ok($$ delete from public.holidays where calendar_id = 'c1000000-0000-4000-8000-0000000000c1' and holiday_date > current_date $$, 'Xóa được ngày nghỉ sắp tới');
select ok((select count(*) from public.holidays h join public.holiday_calendars c on c.id = h.calendar_id where c.tenant_id is null and c.year = 2026) >= 11,
  'Lịch quốc gia 2026 có đủ 11 ngày nghỉ theo luật');

-- ---------- Đồng ý dữ liệu cá nhân ----------
insert into auth.users (id, email) values
  ('a2000000-0000-4000-8000-000000000007', 'thao.settings@example.test'),
  ('a2000000-0000-4000-8000-000000000142', 'ha.settings@example.test'),
  ('a2000000-0000-4000-8000-000000000003', 'huy.settings@example.test'),
  ('a2000000-0000-4000-8000-000000000b01', 'binh.settings@example.test');
update public.employees set user_id = 'a2000000-0000-4000-8000-000000000007' where id = '60000000-0000-4000-8000-000000000007';
update public.employees set user_id = 'a2000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
update public.employees set user_id = 'a2000000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
update public.employees set user_id = 'a2000000-0000-4000-8000-000000000b01' where id = '60000000-0000-4000-8000-000000000b01';
update public.memberships set user_id = 'a2000000-0000-4000-8000-000000000007', status = 'active' where id = '80000000-0000-4000-8000-000000000007';
update public.memberships set user_id = 'a2000000-0000-4000-8000-000000000003', status = 'active' where id = '80000000-0000-4000-8000-000000000003';
update public.memberships set user_id = 'a2000000-0000-4000-8000-000000000b01', status = 'active' where id = '80000000-0000-4000-8000-000000000b01';
insert into public.memberships (tenant_id, user_id, employee_id, status) values
  ('10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000142', '60000000-0000-4000-8000-000000000142', 'active')
on conflict (tenant_id, employee_id) do update set user_id = excluded.user_id, status = 'active';

insert into public.privacy_consents (tenant_id, employee_id, user_id, terms_id, installation_id)
select '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', 'a2000000-0000-4000-8000-000000000142', id, 'test-install'
from public.privacy_terms where tenant_id = '10000000-0000-4000-8000-000000000001' and version_no = 1
on conflict (employee_id, terms_id) do nothing;
-- DB có thể đã có dữ liệu thử (smoke script): so với số đếm thật thay vì giả định DB trống
select set_config('test.ha_consents', (select count(*)::text from public.privacy_consents where employee_id = '60000000-0000-4000-8000-000000000142'), true);
select set_config('test.a_consents', (select count(*)::text from public.privacy_consents where tenant_id = '10000000-0000-4000-8000-000000000001'), true);
select set_config('test.a_terms', (select count(*)::text from public.privacy_terms where tenant_id = '10000000-0000-4000-8000-000000000001'), true);
select throws_ok($$ delete from public.privacy_consents where employee_id = '60000000-0000-4000-8000-000000000142' $$, 'P0001', null, 'Lượt đồng ý chỉ thêm, không xóa');
select throws_ok($$ update public.privacy_terms set content = repeat('x', 60) where tenant_id = '10000000-0000-4000-8000-000000000001' $$, 'P0001', null, 'Điều khoản đã công bố không sửa được');
select throws_ok($$ insert into public.privacy_consents (tenant_id, employee_id, terms_id)
  select '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000142', id from public.privacy_terms where tenant_id = '10000000-0000-4000-8000-000000000001' and version_no = 1 $$,
  '23505', null, 'Một nhân viên đồng ý một phiên bản đúng một lần');

-- ---------- RLS ----------
set local role authenticated;

-- Nhân viên Hà: thấy lượt đồng ý của mình, điều khoản và lịch lễ của công ty mình
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select count(*)::int from public.privacy_consents), current_setting('test.ha_consents')::int, 'Nhân viên chỉ thấy lượt đồng ý của chính mình');
select is((select count(*)::int from public.privacy_terms), current_setting('test.a_terms')::int, 'Nhân viên đọc được điều khoản của công ty mình (không thấy tenant khác)');
select ok((select count(*) from public.holidays) >= 12, 'Nhân viên thấy lịch quốc gia + ngày nghỉ riêng công ty');
select is((select count(*)::int from public.policy_assignments), 0, 'Nhân viên không xem được bảng áp dụng quy định (cần schedule.read)');
select throws_ok($$ select * from public.tenant_policy_templates $$, '42501', null, 'Client không đọc được bộ mẫu nền tảng');
select throws_ok($$ select public.provision_tenant('10000000-0000-4000-8000-000000000001') $$, '42501', null, 'Client không gọi được provision_tenant');

-- Quản lý Huy (không có privacy.read): không xem lượt đồng ý của nhân viên
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.privacy_consents), 0, 'Quản lý không có privacy.read không thấy lượt đồng ý');

-- HR Admin Thảo: thấy lượt đồng ý trong phạm vi
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is((select count(*)::int from public.privacy_consents), current_setting('test.a_consents')::int, 'HR có privacy.read thấy mọi lượt đồng ý trong phạm vi');

-- Admin tenant B: không thấy dữ liệu tenant A
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
select is((select count(*)::int from public.privacy_terms where tenant_id = '10000000-0000-4000-8000-000000000001'), 0, 'Tenant B không đọc điều khoản tenant A');
select is((select count(*)::int from public.holidays h join public.holiday_calendars c on c.id = h.calendar_id where c.tenant_id = '10000000-0000-4000-8000-000000000001'), 0,
  'Tenant B không thấy ngày nghỉ riêng của tenant A');

select * from finish();
rollback;
