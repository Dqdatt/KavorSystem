-- Tài liệu nhân sự: dữ liệu riêng trong transaction, chạy được cả sau smoke (không giả định DB trống).
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, email) values
  ('a5100000-0000-4000-8000-000000000001','doc-admin@example.test'),
  ('a5100000-0000-4000-8000-000000000002','doc-emp@example.test'),
  ('a5100000-0000-4000-8000-000000000003','doc-emp2@example.test'),
  ('a5100000-0000-4000-8000-000000000004','doc-other@example.test'),
  ('a5100000-0000-4000-8000-000000000005','doc-hr-dept@example.test');
select set_config('test.dt', (public.create_tenant_with_admin('DOCTEST','Công ty thử tài liệu',null,'trial',20,'Admin tài liệu','doc-admin-x@example.test',null)->>'tenant_id'), true);
select set_config('test.dother', (public.create_tenant_with_admin('DOCOTHER','Tenant khác tài liệu',null,'trial',20,'Admin khác','doc-admin-y@example.test',null)->>'tenant_id'), true);

select is((select string_agg(r.code || ':' || p.code, ',' order by r.code, p.code) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
  where r.tenant_id is null and p.code like 'document.%'),
  'employee:document.self.read,hr_ops:document.manage,hr_ops:document.read,hr_ops:document.upload,tenant_admin:document.manage,tenant_admin:document.read,tenant_admin:document.upload',
  'Nhân viên xem của mình; HR/Admin xem, tải lên, quản lý; vai trò khác không có');

insert into public.legal_entities (id, tenant_id, code, name, effective_from) values ('a5200000-0000-4000-8000-000000000001', current_setting('test.dt')::uuid, 'DOCLE', 'Pháp nhân', '2020-01-01');
insert into public.branches (id, tenant_id, legal_entity_id, code, name, effective_from) values ('a5300000-0000-4000-8000-000000000001', current_setting('test.dt')::uuid, 'a5200000-0000-4000-8000-000000000001', 'DOCHCM', 'HCM', '2020-01-01');
insert into public.departments (id, tenant_id, branch_id, code, name, effective_from) values
  ('a5400000-0000-4000-8000-000000000001', current_setting('test.dt')::uuid, 'a5300000-0000-4000-8000-000000000001', 'DOCA', 'Phòng A', '2020-01-01'),
  ('a5400000-0000-4000-8000-000000000002', current_setting('test.dt')::uuid, 'a5300000-0000-4000-8000-000000000001', 'DOCB', 'Phòng B', '2020-01-01');
insert into public.positions (id, tenant_id, code, name, effective_from) values ('a5500000-0000-4000-8000-000000000001', current_setting('test.dt')::uuid, 'DOCNV', 'Nhân viên', '2020-01-01');
insert into public.employees (id, tenant_id, employee_code, user_id, full_name, hire_date) values
  ('e5100000-0000-4000-8000-000000000002', current_setting('test.dt')::uuid, 'A01', 'a5100000-0000-4000-8000-000000000002', 'Nhân viên phòng A', '2020-01-01'),
  ('e5100000-0000-4000-8000-000000000003', current_setting('test.dt')::uuid, 'B01', 'a5100000-0000-4000-8000-000000000003', 'Nhân viên phòng B', '2020-01-01'),
  ('e5100000-0000-4000-8000-000000000004', current_setting('test.dother')::uuid, 'X01', 'a5100000-0000-4000-8000-000000000004', 'Nhân viên tenant khác', '2020-01-01'),
  ('e5100000-0000-4000-8000-000000000005', current_setting('test.dt')::uuid, 'A02', 'a5100000-0000-4000-8000-000000000005', 'HR phòng A', '2020-01-01');
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, effective_from)
select current_setting('test.dt')::uuid, e, 'a5200000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000001', d, 'a5500000-0000-4000-8000-000000000001', '2020-01-01'
from (values ('e5100000-0000-4000-8000-000000000002'::uuid, 'a5400000-0000-4000-8000-000000000001'::uuid), ('e5100000-0000-4000-8000-000000000003', 'a5400000-0000-4000-8000-000000000002'),
  ('e5100000-0000-4000-8000-000000000005', 'a5400000-0000-4000-8000-000000000001')) x(e, d);
insert into public.memberships (tenant_id, employee_id, user_id, status)
select tenant_id, id, user_id, 'active' from public.employees where id in
  ('e5100000-0000-4000-8000-000000000002','e5100000-0000-4000-8000-000000000003','e5100000-0000-4000-8000-000000000004','e5100000-0000-4000-8000-000000000005');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select m.tenant_id, m.id, r.id, 'self', '2020-01-01' from public.memberships m join public.roles r on r.code='employee' and r.tenant_id is null
where m.user_id in ('a5100000-0000-4000-8000-000000000002','a5100000-0000-4000-8000-000000000003','a5100000-0000-4000-8000-000000000004','a5100000-0000-4000-8000-000000000005');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
select m.tenant_id, m.id, r.id, 'department', 'a5400000-0000-4000-8000-000000000001', '2020-01-01' from public.memberships m join public.roles r on r.code='hr_ops' and r.tenant_id is null
where m.user_id = 'a5100000-0000-4000-8000-000000000005';
update public.employees set user_id='a5100000-0000-4000-8000-000000000001' where tenant_id=current_setting('test.dt')::uuid and employee_code='ADMIN01';
update public.memberships set user_id='a5100000-0000-4000-8000-000000000001', status='active'
where tenant_id=current_setting('test.dt')::uuid and employee_id=(select id from public.employees where tenant_id=current_setting('test.dt')::uuid and employee_code='ADMIN01');

create function pg_temp.ver(p_path text, p_size integer default 1000, p_mime text default 'application/pdf', p_sha text default repeat('a', 64))
returns jsonb language sql immutable as $$
  select jsonb_build_object('storagePath', p_path, 'fileName', 'HDLD.pdf', 'mimeType', p_mime, 'sizeBytes', p_size, 'sha256', p_sha, 'note', 'Bản ký')
$$;

-- ---------- Quyền tạo ----------
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000002', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"contract","title":"HĐLĐ"}', pg_temp.ver('t/x1.pdf'))$$, 'P0001', 'DOCUMENT_FORBIDDEN', 'Nhân viên không tự tải tài liệu');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000005', 'e5100000-0000-4000-8000-000000000003',
  '{"category":"contract","title":"HĐLĐ"}', pg_temp.ver('t/x2.pdf'))$$, 'P0001', 'DOCUMENT_FORBIDDEN', 'HR phòng A không tải cho nhân viên phòng B');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000004',
  '{"category":"contract","title":"HĐLĐ"}', pg_temp.ver('t/x3.pdf'))$$, 'P0001', 'DOCUMENT_FORBIDDEN', 'Admin không tải cho nhân viên tenant khác');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"contract","title":"HĐLĐ"}', pg_temp.ver('t/x4.exe', 1000, 'application/x-msdownload'))$$, '23514', null, 'Loại file lạ bị chặn');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"contract","title":"HĐLĐ"}', pg_temp.ver('t/x5.pdf', 6000000))$$, '23514', null, 'File quá 5 MB bị chặn');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"contract","title":"HĐLĐ"}', pg_temp.ver('t/x6.pdf', 1000, 'application/pdf', 'xyz'))$$, '23514', null, 'SHA-256 sai định dạng bị chặn');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"contract","title":"HĐLĐ","issuedOn":"2026-05-01","expiresOn":"2026-01-01"}', pg_temp.ver('t/x7.pdf'))$$, '23514', null, 'Hết hạn trước ngày hiệu lực bị chặn');

select set_config('test.d1', public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000005', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"contract","title":"Hợp đồng lao động","docNo":"HĐ-01","issuedOn":"2026-01-01","expiresOn":"2027-12-31"}', pg_temp.ver('t/d1v1.pdf'))::text, true);
select set_config('test.d2', public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000002',
  '{"category":"personal","title":"CCCD","visibility":"hr_only"}', pg_temp.ver('t/d2v1.pdf'))::text, true);
select set_config('test.d3', public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000003',
  '{"category":"decision","title":"Quyết định bổ nhiệm"}', pg_temp.ver('t/d3v1.pdf'))::text, true);
select is((select version_count || '/' || (current_version_id = v.id)::text from public.employee_documents d join public.document_versions v on v.document_id = d.id where d.id = current_setting('test.d1')::uuid),
  '1/true', 'Tạo tài liệu kèm phiên bản 1 là phiên bản hiện hành');

-- ---------- Phiên bản ----------
select is(public.add_document_version(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000005', current_setting('test.d1')::uuid, pg_temp.ver('t/d1v2.pdf')), 2, 'Thêm phiên bản 2');
select is((select v.version_no from public.employee_documents d join public.document_versions v on v.id = d.current_version_id where d.id = current_setting('test.d1')::uuid), 2, 'Phiên bản hiện hành là bản mới');
select is((select count(*)::int from public.document_versions where document_id = current_setting('test.d1')::uuid), 2, 'Giữ lịch sử phiên bản cũ');
select throws_ok($$select public.add_document_version(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000005', current_setting('test.d3')::uuid, pg_temp.ver('t/d3v2.pdf'))$$,
  'P0001', 'DOCUMENT_FORBIDDEN', 'HR phòng A không thêm phiên bản cho tài liệu phòng B');
select throws_ok($$select public.add_document_version(current_setting('test.dother')::uuid, 'a5100000-0000-4000-8000-000000000001', current_setting('test.d1')::uuid, pg_temp.ver('t/d1v9.pdf'))$$,
  'P0001', 'DOCUMENT_FORBIDDEN', 'Sai tenant không thấy tài liệu');
select throws_ok($$select public.add_document_version(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', current_setting('test.d1')::uuid, pg_temp.ver('t/d1v1.pdf'))$$,
  '23505', null, 'Không dùng lại đường dẫn file cũ');
select throws_ok($$update public.document_versions set file_name = 'x.pdf' where document_id = current_setting('test.d1')::uuid$$, 'P0001', 'DOCUMENT_VERSION_IMMUTABLE', 'Phiên bản không sửa');
select throws_ok($$delete from public.document_versions where document_id = current_setting('test.d1')::uuid$$, 'P0001', 'DOCUMENT_VERSION_IMMUTABLE', 'Phiên bản không xóa');
select throws_ok($$delete from public.employee_documents where id = current_setting('test.d1')::uuid$$, 'P0001', 'DOCUMENT_IMMUTABLE', 'Tài liệu không xóa');
select throws_ok($$update public.employee_documents set employee_id = 'e5100000-0000-4000-8000-000000000003' where id = current_setting('test.d1')::uuid$$, 'P0001', 'DOCUMENT_IMMUTABLE', 'Không chuyển tài liệu sang người khác');
select lives_ok($$update public.employee_documents set title = 'Hợp đồng lao động (sửa)', expires_on = null where id = current_setting('test.d1')::uuid$$, 'Sửa thông tin được');
select throws_ok($$update public.employee_documents set archived_at = now() where id = current_setting('test.d2')::uuid$$, '23514', null, 'Gỡ phải có lý do');

-- ---------- RLS ----------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select string_agg(title, ',') from public.employee_documents), 'Hợp đồng lao động (sửa)', 'Nhân viên chỉ thấy tài liệu "HR + Nhân viên" của mình');
select is((select count(*)::int from public.document_versions), 2, 'Nhân viên thấy các phiên bản tài liệu của mình');
select throws_ok($$select public.create_employee_document(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000002', '{"category":"other","title":"x"}', '{}')$$,
  '42501', null, 'Client không gọi được hàm ghi');
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select string_agg(title, ',') from public.employee_documents), 'Quyết định bổ nhiệm', 'Nhân viên phòng B chỉ thấy của mình');
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_documents), 2, 'HR phòng A thấy cả tài liệu "Chỉ HR" của phòng mình, không thấy phòng B');
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_documents where tenant_id = current_setting('test.dt')::uuid), 0, 'Tenant khác không thấy');
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_documents), 3, 'Admin toàn công ty thấy mọi tài liệu');
reset role;

-- ---------- Gỡ ----------
update public.employee_documents set archived_at = now(), archived_by = 'a5100000-0000-4000-8000-000000000001', archive_reason = 'Hợp đồng đã thay thế' where id = current_setting('test.d1')::uuid;
select throws_ok($$select public.add_document_version(current_setting('test.dt')::uuid, 'a5100000-0000-4000-8000-000000000001', current_setting('test.d1')::uuid, pg_temp.ver('t/d1v3.pdf'))$$,
  'P0001', 'DOCUMENT_ARCHIVED', 'Tài liệu đã gỡ không thêm phiên bản');
select throws_ok($$update public.employee_documents set title = 'x' where id = current_setting('test.d1')::uuid$$, 'P0001', 'DOCUMENT_ARCHIVED', 'Tài liệu đã gỡ không sửa');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_documents), 0, 'Tài liệu đã gỡ không còn với nhân viên');
select set_config('request.jwt.claims','{"sub":"a5100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*)::int from public.employee_documents where archived_at is not null), 1, 'HR vẫn thấy tài liệu đã gỡ để tra cứu');
reset role;

select * from finish();
rollback;
