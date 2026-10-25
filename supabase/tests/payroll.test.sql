-- Payroll DB: dữ liệu riêng trong transaction, chạy được cả sau smoke (không giả định DB trống).
begin;
create extension if not exists pgtap with schema extensions;
select plan(109);

insert into auth.users (id, email) values
  ('a3100000-0000-4000-8000-000000000001','pay-import@example.test'),
  ('a3100000-0000-4000-8000-000000000002','pay-approve@example.test'),
  ('a3100000-0000-4000-8000-000000000003','pay-self@example.test'),
  ('a3100000-0000-4000-8000-000000000004','pay-outside@example.test'),
  ('a3100000-0000-4000-8000-000000000005','pay-hr@example.test');
select set_config('test.pt', (public.create_tenant_with_admin('PAYTEST','Công ty thử payroll',null,'trial',20,
  'HR thử payroll','pay-admin@example.test',null)->>'tenant_id'), true);
select set_config('test.pother', (public.create_tenant_with_admin('PAYOTHER','Tenant khác payroll',null,'trial',20,
  'HR tenant khác','pay-admin-other@example.test',null)->>'tenant_id'), true);
select is((select count(*)::int from public.pay_components where tenant_id = current_setting('test.pt')::uuid), 9, 'Tenant mới có chín thành phần mẫu');
select is(public.provision_pay_components(current_setting('test.pt')::uuid), 0, 'Cấp mẫu lặp không nhân đôi');
select is((select count(*)::int from public.pay_components where tenant_id = '10000000-0000-4000-8000-000000000001'), 9, 'Seed tenant cũ có chín thành phần');
select is((select count(*)::int from public.role_assignments a join public.memberships m on m.id=a.membership_id join public.roles r on r.id=a.role_id
  where m.employee_id in ('60000000-0000-4000-8000-000000000215','60000000-0000-4000-8000-000000000216') and r.code='payroll'), 2, 'Seed có hai Kế toán');
select is((select string_agg(p.code, ',' order by p.code) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
  where r.code='payroll' and r.tenant_id is null and p.code like 'payroll.%'),
  'payroll.approve,payroll.config.manage,payroll.import,payroll.publish,payroll.read', 'Kế toán có đúng năm quyền, không tự có quyền mở lại');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
  where r.code in ('tenant_admin','hr_ops','manager') and r.tenant_id is null and p.code in ('payroll.read','payroll.import','payroll.approve','payroll.publish')), 0, 'HR/Admin/Quản lý không được gán quyền lương người khác');

insert into public.employees (id, tenant_id, employee_code, user_id, full_name, hire_date) values
  ('e3100000-0000-4000-8000-000000000001',current_setting('test.pt')::uuid,'PAY01','a3100000-0000-4000-8000-000000000001','Kế toán nhập','2020-01-01'),
  ('e3100000-0000-4000-8000-000000000002',current_setting('test.pt')::uuid,'PAY02','a3100000-0000-4000-8000-000000000002','Kế toán duyệt','2020-01-01'),
  ('e3100000-0000-4000-8000-000000000003',current_setting('test.pt')::uuid,'NV01','a3100000-0000-4000-8000-000000000003','Nhân viên nhận phiếu','2020-01-01'),
  ('e3100000-0000-4000-8000-000000000004',current_setting('test.pother')::uuid,'NV02','a3100000-0000-4000-8000-000000000004','Nhân viên tenant khác','2020-01-01');
insert into public.memberships (tenant_id, employee_id, user_id, status)
select tenant_id, id, user_id, 'active' from public.employees where id in
  ('e3100000-0000-4000-8000-000000000001','e3100000-0000-4000-8000-000000000002','e3100000-0000-4000-8000-000000000003','e3100000-0000-4000-8000-000000000004');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select m.tenant_id, m.id, r.id, 'tenant', '2020-01-01' from public.memberships m join public.roles r on r.code='payroll' and r.tenant_id is null
where m.user_id in ('a3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select m.tenant_id, m.id, r.id, 'self', '2020-01-01' from public.memberships m join public.roles r on r.code='employee' and r.tenant_id is null
where m.user_id in ('a3100000-0000-4000-8000-000000000003','a3100000-0000-4000-8000-000000000004');
update public.employees set user_id='a3100000-0000-4000-8000-000000000005' where tenant_id=current_setting('test.pt')::uuid and employee_code='ADMIN01';
update public.memberships set user_id='a3100000-0000-4000-8000-000000000005', status='active'
where tenant_id=current_setting('test.pt')::uuid and employee_id=(select id from public.employees where tenant_id=current_setting('test.pt')::uuid and employee_code='ADMIN01');
update public.tenant_settings set attendance_settings=attendance_settings || '{"periodStartDay":26}' where tenant_id=current_setting('test.pt')::uuid;

create function pg_temp.pay_rows(p_emp uuid default 'e3100000-0000-4000-8000-000000000003', p_advance bigint default 2000000)
returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('employeeId', p_emp, 'gross',10000000,'deduction',p_advance,'net',10000000-p_advance,'workDays',20,
    'items',jsonb_build_array(
      jsonb_build_object('componentId',(select id from public.pay_components where tenant_id=current_setting('test.pt')::uuid and code='BASE'),'amount',10000000),
      jsonb_build_object('componentId',(select id from public.pay_components where tenant_id=current_setting('test.pt')::uuid and code='ADVANCE'),'amount',p_advance),
      jsonb_build_object('componentId',(select id from public.pay_components where tenant_id=current_setting('test.pt')::uuid and code='NET'),'amount',10000000-p_advance))))
$$;

select throws_ok($$select public.create_payroll_cycle(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000005','2025-03','2025-04-05')$$,
  'P0001','PAYROLL_FORBIDDEN','Tenant Admin không tự mở được kỳ lương');
select throws_ok($$select public.create_payroll_cycle(current_setting('test.pother')::uuid,'a3100000-0000-4000-8000-000000000001','2025-03','2025-04-05')$$,
  'P0001','PAYROLL_FORBIDDEN','Kế toán không thao tác tenant khác');
select throws_ok($$select public.create_payroll_cycle(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000001','2025-13','2025-04-05')$$,
  'P0001','PAYROLL_MONTH_INVALID','Tháng sai bị chặn');
select set_config('test.pc',public.create_payroll_cycle(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000001','2025-03','2025-04-05')::text,true);
select is((select period_start||'/'||period_end||'/'||status from public.payroll_cycles where id=current_setting('test.pc')::uuid),
  '2025-02-26/2025-03-25/open','Kỳ theo tháng kết thúc và kỳ công tenant');
select throws_ok($$select public.create_payroll_cycle(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000001','2025-03','2025-04-05')$$,
  '23505',null,'Không trùng kỳ trong tenant');
select throws_ok($$update public.payroll_cycles set status='prepared' where id=current_setting('test.pc')::uuid$$,
  'P0001','PAYROLL_SQL_ONLY','Không chuyển trạng thái bằng UPDATE trực tiếp');

select set_config('test.pb',public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','luong.csv',1,0)::text,true);
select is(public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb')::uuid,pg_temp.pay_rows(),'a3100000-0000-4000-8000-000000000001'),1,'Nhập đúng tạo kết quả và item');
select is((select status from public.payroll_cycles where id=current_setting('test.pc')::uuid),'prepared','Nhập thành công chuyển prepared');
select set_config('test.pr',(select id::text from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),true);
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb')::uuid,pg_temp.pay_rows(),'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYROLL_BATCH_ALREADY_APPLIED','Không áp lại batch thành công');
select throws_ok($$update public.payroll_import_batches set warnings='[]' where id=current_setting('test.pb')::uuid$$,
  'P0001','payroll_import_batches is immutable','Batch nhập giữ lịch sử bất biến');
select throws_ok($$delete from public.payroll_cycle_events where cycle_id=current_setting('test.pc')::uuid$$,
  'P0001','payroll_cycle_events is immutable','Sự kiện không xóa được');

-- Dòng đầu hợp lệ, dòng thứ hai sai tenant: đã delete/insert dòng đầu rồi vẫn rollback toàn bộ.
select set_config('test.pb2',public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','loi.csv',2,0)::text,true);
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb2')::uuid,
  pg_temp.pay_rows()||pg_temp.pay_rows('e3100000-0000-4000-8000-000000000004'),'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYROLL_EMPLOYEE_MISMATCH','Sai tenant dòng hai làm rollback cả lần thay');
select is((select id::text from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),current_setting('test.pr'),'Rollback giữ nguyên id kết quả cũ');
select is((select count(*)::int from public.payroll_result_items where result_id=current_setting('test.pr')::uuid),3,'Rollback giữ đủ item cũ');
select is((select count(*)::int from public.payroll_cycle_events where batch_id=current_setting('test.pb2')::uuid and action='replaced'),0,'Rollback không để lại sự kiện áp thành công');
select set_config('test.pb3',public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','sai-net.csv',1,0)::text,true);
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb3')::uuid,
  jsonb_set(pg_temp.pay_rows(),'{0,items,2,amount}','1'),'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYROLL_TOTAL_MISMATCH','Tổng item NET phải khớp tổng kết quả');
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb3')::uuid,
  jsonb_set(pg_temp.pay_rows(),'{0,items,0,amount}','1.5'),'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYROLL_ITEM_INVALID','VND lẻ không bị ép kiểu làm tròn âm thầm');
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb3')::uuid,
  jsonb_set(pg_temp.pay_rows(),'{0,items,0,componentId}',to_jsonb((select id::text from public.pay_components where tenant_id=current_setting('test.pother')::uuid and code='BASE'))),
  'a3100000-0000-4000-8000-000000000001')$$,'P0001','PAYROLL_COMPONENT_MISMATCH','Không dùng thành phần của tenant khác');
select set_config('test.pb4',public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','file-loi.csv',1,1)::text,true);
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb4')::uuid,pg_temp.pay_rows(),'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYROLL_IMPORT_HAS_ERRORS','Batch có lỗi không thay kết quả');

create function pg_temp.pay_step(p_action text, p_user uuid default 'a3100000-0000-4000-8000-000000000001', p_reason text default null)
returns text language sql as $$
  select public.transition_payroll_cycle(current_setting('test.pc')::uuid,p_user,p_action,p_reason)
$$;
select throws_ok($$select pg_temp.pay_step('submit')$$,'P0001','PAYROLL_IMPORT_NOT_READY','Lần nhập lỗi chặn gửi duyệt, không dùng lại kết quả cũ');
select throws_ok($$select pg_temp.pay_step('publish')$$,'P0001','PAYROLL_TRANSITION_INVALID','Không nhảy từ prepared thẳng tới published');
select throws_ok($$select pg_temp.pay_step('hack')$$,'P0001','PAYROLL_ACTION_INVALID','Không nhận hành động tùy ý');
select set_config('test.pb5',public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','hop-le.csv',1,0)::text,true);
select is(public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb5')::uuid,pg_temp.pay_rows(),'a3100000-0000-4000-8000-000000000001'),1,'Nhập lại hợp lệ thay toàn bộ kết quả');
select is(pg_temp.pay_step('submit'),'under_review','prepared → under_review');
select throws_ok($$select pg_temp.pay_step('approve')$$,'P0001','PAYROLL_SELF_APPROVAL','Người nhập không tự duyệt');
select set_config('test.pb6',public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000002','nhap-lai.csv',2,0)::text,true);
select is((select status from public.payroll_cycles where id=current_setting('test.pc')::uuid),'prepared','Nhập lại lúc under_review hủy lượt xét cũ');
select throws_ok($$select pg_temp.pay_step('approve')$$,'P0001','PAYROLL_TRANSITION_INVALID','Không duyệt lượt xét đã bị hủy');
select throws_ok($$select pg_temp.pay_step('submit')$$,'P0001','PAYROLL_IMPORT_NOT_READY','Batch chưa áp không được gửi duyệt');
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb6')::uuid,pg_temp.pay_rows(),'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYROLL_BATCH_MISMATCH','Không nhận vơ batch của người nhập khác');
select is(public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb6')::uuid,
  pg_temp.pay_rows()||pg_temp.pay_rows('e3100000-0000-4000-8000-000000000002'),'a3100000-0000-4000-8000-000000000002'),2,'Hai nhân viên trong cùng một lần thay nguyên tử');
select is((select imported_by::text from public.payroll_cycles where id=current_setting('test.pc')::uuid),'a3100000-0000-4000-8000-000000000002','Theo dõi đúng người nhập thành công lần cuối');
select set_config('test.pr',(select id::text from public.payroll_results where cycle_id=current_setting('test.pc')::uuid and employee_id='e3100000-0000-4000-8000-000000000003'),true);
select lives_ok($$select public.set_pay_component(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000001','BASE','Tên mới của lương cơ bản','earning',1::smallint)$$,
  'Kế toán có quyền cấu hình đổi tên danh mục');
select is((select component_name from public.payroll_result_items where result_id=current_setting('test.pr')::uuid and component_code='BASE'),'Lương cơ bản','Item giữ nguyên snapshot tên lúc nhập');
select throws_ok($$select public.set_pay_component(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000005','BASE','Lương','earning',1::smallint)$$,
  'P0001','PAYROLL_FORBIDDEN','HR không cấu hình lương');
select throws_ok($$select public.set_pay_component(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000001','BASE','Lương','deduction',1::smallint)$$,
  'P0001','PAY_COMPONENT_IDENTITY_IMMUTABLE','Không đổi ý nghĩa thành phần đã có');

-- Phạm vi hẹp không đọc batch có nhân viên ngoài phạm vi và không duyệt cả kỳ.
update public.role_assignments set scope_type='self' where membership_id in
  (select id from public.memberships where user_id='a3100000-0000-4000-8000-000000000002') and role_id=(select id from public.roles where code='payroll' and tenant_id is null);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),1,'payroll.read phạm vi self chỉ thấy một kết quả');
select is((select count(*)::int from public.payroll_import_batches where cycle_id=current_setting('test.pc')::uuid),0,'Phạm vi hẹp không đọc batch/cảnh báo của cả kỳ');
select is((select count(*)::int from public.payroll_cycle_events where cycle_id=current_setting('test.pc')::uuid),0,'Phạm vi hẹp không đọc sự kiện cả kỳ');
select throws_ok($$select public.payroll_cycle_in_scope('a3100000-0000-4000-8000-000000000001',current_setting('test.pc')::uuid,'payroll.read')$$,
  '42501',null,'Client không giả user để gọi hàm phạm vi');
reset role;
select throws_ok($$select pg_temp.pay_step('submit','a3100000-0000-4000-8000-000000000002')$$,
  'P0001','PAYROLL_FORBIDDEN','Phạm vi hẹp không chuyển trạng thái toàn kỳ');
update public.role_assignments set scope_type='tenant' where membership_id in
  (select id from public.memberships where user_id='a3100000-0000-4000-8000-000000000002') and role_id=(select id from public.roles where code='payroll' and tenant_id is null);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),0,'Nhân viên chưa thấy phiếu prepared');
select is((select count(*)::int from public.payroll_result_items where result_id=current_setting('test.pr')::uuid),0,'Chưa công bố thì không đọc được item');
select is((select count(*)::int from public.payroll_cycles where id=current_setting('test.pc')::uuid),0,'Không lộ kỳ chưa công bố cho nhân viên');
select throws_ok($$select public.transition_payroll_cycle(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','approve')$$,
  '42501',null,'Client không gọi được hàm ghi với actor tùy ý');
reset role;
select throws_ok($$select public.mark_payslip_viewed(current_setting('test.pr')::uuid,'a3100000-0000-4000-8000-000000000003')$$,
  'P0001','PAYSLIP_NOT_FOUND','Không ghi đã xem trước công bố');

select is(pg_temp.pay_step('submit'),'under_review','Kết quả mới được gửi kiểm tra lại');
select throws_ok($$select pg_temp.pay_step('approve','a3100000-0000-4000-8000-000000000002')$$,
  'P0001','PAYROLL_SELF_APPROVAL','Người nhập mới vẫn bị chặn tự duyệt');
select is(pg_temp.pay_step('approve'),'approved','Người khác người nhập duyệt được');
select throws_ok($$select public.record_payroll_import(current_setting('test.pc')::uuid,'a3100000-0000-4000-8000-000000000001','sua.csv',1,0)$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Sau approved không ghi thêm batch');
select throws_ok($$select public.replace_payroll_results(current_setting('test.pc')::uuid,current_setting('test.pb6')::uuid,pg_temp.pay_rows(),'a3100000-0000-4000-8000-000000000002')$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Sau approved không thay kết quả');
select throws_ok($$update public.payroll_results set net=0 where id=current_setting('test.pr')::uuid$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Trigger chặn sửa kết quả đã duyệt');
select throws_ok($$delete from public.payroll_results where id=current_setting('test.pr')::uuid$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Trigger chặn xóa kết quả đã duyệt');
select throws_ok($$insert into public.payroll_results select gen_random_uuid(),tenant_id,cycle_id,employee_id,batch_id,gross,deduction,net,work_days,note from public.payroll_results where id=current_setting('test.pr')::uuid$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Trigger chặn thêm kết quả vào kỳ đã duyệt');
select throws_ok($$update public.payroll_result_items set amount=0 where result_id=current_setting('test.pr')::uuid$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Trigger chặn sửa item đã duyệt');
select throws_ok($$delete from public.payroll_result_items where result_id=current_setting('test.pr')::uuid$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Trigger chặn xóa item đã duyệt');
select throws_ok($$insert into public.payroll_result_items (tenant_id,result_id,component_id,amount)
  select tenant_id,result_id,component_id,amount from public.payroll_result_items where result_id=current_setting('test.pr')::uuid limit 1$$,
  'P0001','PAYROLL_RESULTS_LOCKED','Trigger chặn thêm item vào phiếu đã duyệt');
select throws_ok($$select pg_temp.pay_step('reopen',null,'Sửa sai kết quả')$$,'P0001','PAYROLL_FORBIDDEN','Actor null không vượt kiểm quyền');
select throws_ok($$select pg_temp.pay_step('reopen',p_reason=>'Sửa sai kết quả')$$,'P0001','PAYROLL_FORBIDDEN','Kế toán không tự có quyền mở lại');
insert into public.roles (tenant_id,code,name) values (current_setting('test.pt')::uuid,'pay_reopen_test','Quyền mở lại riêng');
insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.tenant_id=current_setting('test.pt')::uuid and r.code='pay_reopen_test' and p.code='payroll.cycle.reopen';
insert into public.role_assignments (tenant_id,membership_id,role_id,scope_type,effective_from)
select m.tenant_id,m.id,r.id,'tenant','2020-01-01' from public.memberships m join public.roles r on r.tenant_id=m.tenant_id and r.code='pay_reopen_test'
where m.user_id='a3100000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.pay_step('reopen',p_reason=>' ')$$,'P0001','PAYROLL_REOPEN_REASON_REQUIRED','Mở lại bắt buộc lý do');
select is(pg_temp.pay_step('reopen',p_reason=>'Đối chiếu lại file gốc'),'prepared','Quyền riêng mở lại approved → prepared');
select ok((select approved_by is null and approved_at is null from public.payroll_cycles where id=current_setting('test.pc')::uuid),'Mở lại xóa dấu duyệt hiện hành');
select is((select reason from public.payroll_cycle_events where cycle_id=current_setting('test.pc')::uuid and action='reopen'),'Đối chiếu lại file gốc','Sự kiện lưu lý do mở lại');
select is(pg_temp.pay_step('submit'),'under_review','Mở lại vẫn phải gửi duyệt');
select is(pg_temp.pay_step('approve'),'approved','Mở lại vẫn phải được người khác người nhập duyệt');

-- Tạm ứng: khớp, lệch, và nhân viên vắng trong file. Dùng luồng thật của SQL đơn từ.
create function pg_temp.pay_advance(p_emp uuid, p_amount bigint)
returns uuid language plpgsql as $$
declare
  rid uuid;
begin
  rid := (public.create_advance_request(current_setting('test.pt')::uuid,p_emp,null,
    (select v.id from public.workflow_versions v join public.workflow_definitions w on w.id=v.workflow_id
      where w.tenant_id=current_setting('test.pt')::uuid and w.request_type='salary_advance' order by v.version_no limit 1),
    '2025-02-26',jsonb_build_object('amount',p_amount,'month','2025-03'),'{}',
    '[{"stepNo":1,"resolver":"payroll","status":"pending"}]',p_amount,'2025-03-01')->>'id')::uuid;
  perform public.decide_approval((select id from public.approval_tasks where request_id=rid),null,true);
  update public.salary_advances set paid_at=now(),paid_by='a3100000-0000-4000-8000-000000000001' where request_id=rid;
  return rid;
end;
$$;
select set_config('test.pa',pg_temp.pay_advance('e3100000-0000-4000-8000-000000000003',2000000)::text,true);
select set_config('test.pa2',pg_temp.pay_advance('e3100000-0000-4000-8000-000000000002',1000000)::text,true);
select set_config('test.pa3',pg_temp.pay_advance('e3100000-0000-4000-8000-000000000001',1000000)::text,true);
select ok((select deducted_cycle_id is null from public.salary_advances where request_id=current_setting('test.pa')::uuid),'Duyệt payroll chưa tự ghi đã khấu trừ');
select is(pg_temp.pay_step('publish'),'published','approved → published');
select is((select deducted_cycle_id from public.salary_advances where request_id=current_setting('test.pa')::uuid),current_setting('test.pc')::uuid,'ADVANCE khớp số đã chi được ghi đã khấu trừ');
select ok((select deducted_cycle_id is null from public.salary_advances where request_id=current_setting('test.pa2')::uuid),'ADVANCE lệch không ghi khấu trừ sai');
select ok((select deducted_cycle_id is null from public.salary_advances where request_id=current_setting('test.pa3')::uuid),'Thiếu nhân viên trong file không ghi đã khấu trừ');
select is((select count(*)::int from public.payroll_cycle_events where cycle_id=current_setting('test.pc')::uuid and action='advance_mismatch'),2,'Ghi cảnh báo đối chiếu cho cả lệch và thiếu dòng');
select throws_ok($$update public.salary_advances set deducted_cycle_id=null where request_id=current_setting('test.pa')::uuid$$,
  'P0001','ADVANCE_IMMUTABLE','Không gỡ dấu đã khấu trừ');
select throws_ok($$update public.salary_advances set payout_note='đổi sau khấu trừ' where request_id=current_setting('test.pa')::uuid$$,
  'P0001','ADVANCE_IMMUTABLE','Không đổi nội dung tạm ứng sau khấu trừ');
select is((select count(*)::int from public.notifications where kind='payslip.published' and tenant_id=current_setting('test.pt')::uuid),2,'Mỗi kết quả có một thông báo công bố');
select is((select title from public.notifications where kind='payslip.published' and link_id=current_setting('test.pr')::uuid),
  'Phiếu lương 03/2025 đã công bố','Tiêu đề công bố đúng tháng');
select ok(not exists (select 1 from public.notifications where kind='payslip.published' and tenant_id=current_setting('test.pt')::uuid
  and (body ~ '[0-9]' or body like '%₫%' or link_type <> 'payslip')),'Thông báo không có số tiền, dùng link payslip');
select throws_ok($$select pg_temp.pay_step('publish')$$,'P0001','PAYROLL_TRANSITION_INVALID','Không công bố hai lần');
select is((select count(*)::int from public.notifications where kind='payslip.published' and tenant_id=current_setting('test.pt')::uuid),2,'Gọi công bố lại không nhân đôi thông báo');
select throws_ok($$select pg_temp.pay_step('reopen',p_reason=>'Mở lại phiếu công bố')$$,'P0001','PAYROLL_TRANSITION_INVALID','Chưa cho mở lại published');
select throws_ok($$select pg_temp.pay_step('close')$$,'P0001','PAYROLL_TRANSITION_INVALID','Không đóng kỳ chưa xác nhận đã trả');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),1,'Công bố: nhân viên chỉ thấy phiếu của mình');
select is((select count(*)::int from public.payroll_result_items where tenant_id=current_setting('test.pt')::uuid),3,'Công bố: nhân viên chỉ thấy item của mình');
select is((select count(*)::int from public.payroll_cycles where id=current_setting('test.pc')::uuid),1,'Công bố: đọc được metadata kỳ của mình');
select is((select count(*)::int from public.payroll_import_batches where cycle_id=current_setting('test.pc')::uuid),0,'Nhân viên không đọc batch lương');
select is((select count(*)::int from public.payroll_cycle_events where cycle_id=current_setting('test.pc')::uuid),0,'Nhân viên không đọc sự kiện của cả kỳ');
select set_config('request.jwt.claims','{"sub":"a3100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*)::int from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),0,'HR/Admin không xem lương người khác sau công bố');
select set_config('request.jwt.claims','{"sub":"a3100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),0,'Cách ly kết quả giữa tenant');
select is((select count(*)::int from public.payroll_result_items where tenant_id=current_setting('test.pt')::uuid),0,'Cách ly item giữa tenant');
select is((select count(*)::int from public.payroll_cycles where id=current_setting('test.pc')::uuid),0,'Cách ly metadata kỳ giữa tenant');
reset role;
select throws_ok($$select public.mark_payslip_viewed(current_setting('test.pr')::uuid,'a3100000-0000-4000-8000-000000000001')$$,
  'P0001','PAYSLIP_NOT_FOUND','Kế toán xem thay không đánh dấu nhân viên đã xem');
select set_config('test.pview',public.mark_payslip_viewed(current_setting('test.pr')::uuid,'a3100000-0000-4000-8000-000000000003')::text,true);
select is(public.mark_payslip_viewed(current_setting('test.pr')::uuid,'a3100000-0000-4000-8000-000000000003')::text,current_setting('test.pview'),'Lần xem đầu giữ nguyên khi mở lại');
select is((select count(*)::int from public.payslip_views where result_id=current_setting('test.pr')::uuid),1,'Ghi lần xem không nhân đôi');
select is(pg_temp.pay_step('paid'),'paid','published → paid');
select throws_ok($$select pg_temp.pay_step('reopen',p_reason=>'Mở lại kỳ đã trả')$$,'P0001','PAYROLL_TRANSITION_INVALID','Chưa cho mở lại paid');
select is(pg_temp.pay_step('close'),'closed','paid → closed');
select throws_ok($$select pg_temp.pay_step('reopen',p_reason=>'Mở lại kỳ đã đóng')$$,'P0001','PAYROLL_TRANSITION_INVALID','Chưa cho mở lại closed');
select throws_ok($$delete from public.payroll_result_items where result_id=current_setting('test.pr')::uuid$$,'P0001','PAYROLL_RESULTS_LOCKED','Kỳ closed vẫn khóa item');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.payroll_results where cycle_id=current_setting('test.pc')::uuid),1,'Đã trả/đóng vẫn đọc được phiếu đã công bố');
reset role;

-- service_role cũng chỉ gọi SQL, không vượt chốt trạng thái bằng DML/marker.
set local role service_role;
select set_config('kavor.payroll_write',current_setting('test.pc'),true);
select throws_ok($$update public.payroll_cycles set status='prepared' where id=current_setting('test.pc')::uuid$$,'42501',null,'service_role không UPDATE trực tiếp kỳ kể cả có marker');
select throws_ok($$delete from public.payroll_result_items where result_id=current_setting('test.pr')::uuid$$,'42501',null,'service_role không xóa item trực tiếp');
select throws_ok($$truncate public.payroll_results$$,'42501',null,'Không có quyền TRUNCATE vượt trigger');
select throws_ok($$update public.salary_advances set deducted_cycle_id=current_setting('test.pc')::uuid where request_id=current_setting('test.pa2')::uuid$$,
  'P0001','ADVANCE_IMMUTABLE','service_role không tự đánh dấu khấu trừ lệch bằng marker');
select lives_ok($$select public.create_payroll_cycle(current_setting('test.pt')::uuid,'a3100000-0000-4000-8000-000000000001','2025-04','2025-05-05')$$,'service_role gọi hàm mở kỳ hợp lệ được');
reset role;
select is((select count(*)::int from public.payroll_import_batches where cycle_id=current_setting('test.pc')::uuid),6,'Giữ đủ lịch sử sáu lần nhập gồm cả lỗi');

select * from finish();
rollback;
