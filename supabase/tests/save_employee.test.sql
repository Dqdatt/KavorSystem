-- Tạo/sửa hồ sơ nhân viên một giao dịch (202612110001 save_employee) + phạm vi gồm nhân viên sắp vào làm (scoped_employees).
-- API kiểm quyền/phạm vi trước khi gọi; ở đây kiểm phần ghi: phân công sửa tại chỗ / đóng rồi mở, chặn phân công vừa bị đổi,
-- patch chỉ đổi khóa có mặt, nhật ký cùng giao dịch. Lần gọi qua API: tools/hr-smoke.sh. Không giả định DB trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select set_config('test.t', '10000000-0000-4000-8000-000000000001', true);
create temp table mkt as select '{"legal_entity_id":"20000000-0000-4000-8000-000000000001","branch_id":"30000000-0000-4000-8000-000000000001","department_id":"40000000-0000-4000-8000-000000000005","position_id":"50000000-0000-4000-8000-000000000006","manager_employee_id":null}'::jsonb as p;

-- ---------- Tạo: nhân viên vào làm năm 2099 ở phòng Marketing ----------
select set_config('test.f', public.save_employee(current_setting('test.t')::uuid, null, null,
  '{"employee_code":"TST-FUT","full_name":"Người Sắp Vào","work_email":"tst.fut@haidang.vn","phone":"0900000999","hire_date":"2099-01-05","employment_type":"probation"}',
  (select p || '{"from":"2099-01-05","currentFrom":null}' from mkt), '{"before":null,"after":{"employee_code":"TST-FUT"}}', 'save-test')::text, true);
select is((select status || ' ' || hire_date::text from public.employees where id = current_setting('test.f')::uuid), 'active 2099-01-05', 'Tạo hồ sơ (mặc định active)');
select is((select count(*)::int from public.employee_assignments where employee_id = current_setting('test.f')::uuid and effective_from = '2099-01-05' and effective_to is null), 1, 'Một phân công từ ngày vào làm');
select is((select count(*)::int from public.audit_logs where resource_id = current_setting('test.f')::uuid and action = 'employee.created' and correlation_id = 'save-test'), 1, 'Nhật ký tạo cùng giao dịch');

-- ---------- Phạm vi: quản lý Huy (phòng Marketing) thấy người sắp vào làm của phòng mình ----------
insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000003', 'huy.save.test@example.test') on conflict (id) do nothing;
update public.employees set user_id = 'a1000000-0000-4000-8000-000000000003' where id = '60000000-0000-4000-8000-000000000003';
update public.memberships set user_id = 'a1000000-0000-4000-8000-000000000003', status = 'active' where id = '80000000-0000-4000-8000-000000000003';
select ok(exists (select 1 from public.scoped_employees('a1000000-0000-4000-8000-000000000003', current_setting('test.t')::uuid, 'employee.read') where id = current_setting('test.f')::uuid),
  'Người sắp vào làm thuộc phạm vi phòng theo phân công sắp hiệu lực (trước đây ngoài phạm vi → 404 ngay sau khi tạo)');
select ok(exists (select 1 from public.scoped_employees('a1000000-0000-4000-8000-000000000003', current_setting('test.t')::uuid, 'employee.read') where employee_code = 'HD0142'),
  'Người đang làm vẫn theo phân công hiện hành');

-- ---------- Sửa: đổi phòng ban trước ngày vào làm = sửa tại chỗ, không thêm bản thứ hai ----------
select lives_ok(format('select public.save_employee(%L, null, %L, ''{"full_name":"Người Sắp Vào (sửa)","phone":null}'', %L, ''{"before":{},"after":{}}'', ''save-test'')',
  current_setting('test.t'), current_setting('test.f'), (select jsonb_set(p, '{department_id}', '"40000000-0000-4000-8000-000000000006"') || '{"from":"2099-01-05","currentFrom":"2099-01-05"}' from mkt)), 'Đổi phòng ban của người chưa vào làm');
select is((select count(*)::int || ' ' || max(department_id::text) from public.employee_assignments where employee_id = current_setting('test.f')::uuid), '1 40000000-0000-4000-8000-000000000006', 'Vẫn một phân công, đã sang phòng mới');
select is((select full_name || ' ' || coalesce(phone, '∅') || ' ' || employment_type from public.employees where id = current_setting('test.f')::uuid), 'Người Sắp Vào (sửa) ∅ probation', 'Patch chỉ đổi khóa có mặt (null = xóa), giữ trường khác');
select throws_ok(format('select public.save_employee(%L, null, %L, ''{}'', %L, ''{}'', ''save-test'')', current_setting('test.t'), current_setting('test.f'),
  (select p || '{"from":"2099-02-01","currentFrom":"2099-01-01"}' from mkt)), 'P0001', 'PLACEMENT_CHANGED', 'Phân công vừa bị người khác đổi → chặn');
select throws_ok(format('select public.save_employee(%L, null, %L, ''{}'', %L, ''{}'', ''save-test'')', current_setting('test.t'), current_setting('test.f'),
  (select p || '{"from":"2098-12-01","currentFrom":"2099-01-05"}' from mkt)), 'P0001', 'PLACEMENT_FROM_INVALID', 'Ngày hiệu lực trước phân công hiện tại → chặn');
select lives_ok(format('select public.save_employee(%L, null, %L, ''{}'', %L, ''{}'', ''save-test'')', current_setting('test.t'), current_setting('test.f'),
  (select p || '{"from":"2099-03-01","currentFrom":"2099-01-05"}' from mkt)), 'Đổi từ ngày sau: đóng bản cũ, mở bản mới');
select is((select string_agg(effective_from::text || '→' || coalesce(effective_to::text, '…'), ', ' order by effective_from) from public.employee_assignments where employee_id = current_setting('test.f')::uuid),
  '2099-01-05→2099-02-28, 2099-03-01→…', 'Bản cũ kết thúc ngày trước ngày hiệu lực mới');

select * from finish();
rollback;
