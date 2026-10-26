insert into public.tenants (
  id, code, display_name, legal_name, status, plan_code, primary_region,
  timezone, currency, locale, employee_limit
) values (
  '10000000-0000-4000-8000-000000000001', 'HDG-001', 'Hải Đăng Group',
  'Công ty Cổ phần Hải Đăng Mẫu', 'active', 'growth', 'ap-southeast-1',
  'Asia/Ho_Chi_Minh', 'VND', 'vi-VN', 300
) on conflict (id) do nothing;

insert into public.tenant_settings (
  tenant_id, branding, attendance_settings, notification_settings, mobile_policy
) values (
  '10000000-0000-4000-8000-000000000001',
  '{}',
  '{"method":"gps","defaultGeofenceRadiusM":200,"maxAcceptedAccuracyM":100}',
  '{"inApp":true,"push":true,"email":false}',
  '{"minimumIosVersion":"0.1.0","minimumAndroidVersion":"0.1.0"}'
) on conflict (tenant_id) do nothing;

insert into public.permissions (code, module, description) values
  ('tenant.read','tenant','Xem tenant hiện tại'),
  ('tenant.settings.manage','tenant','Quản lý cấu hình tenant'),
  ('employee.self.read','people','Xem hồ sơ của chính mình'),
  ('employee.read','people','Xem hồ sơ trong phạm vi'),
  ('employee.create','people','Tạo và import nhân viên'),
  ('employee.update','people','Cập nhật hồ sơ nhân viên'),
  ('organization.read','organization','Xem cơ cấu tổ chức'),
  ('organization.manage','organization','Quản lý cơ cấu tổ chức'),
  ('attendance.self.clock','attendance','Chấm công của chính mình'),
  ('attendance.read','attendance','Xem chấm công trong phạm vi'),
  ('payroll.self.read','payroll','Xem phiếu lương của chính mình'),
  ('payroll.read','payroll','Xem dữ liệu payroll được cấp quyền'),
  ('audit.read','audit','Xem audit log trong phạm vi')
on conflict (code) do nothing;

insert into public.legal_entities (id, tenant_id, code, name, effective_from)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','HDG','Hải Đăng Group Mẫu','2026-01-01')
on conflict (tenant_id, code) do nothing;

insert into public.branches (id, tenant_id, legal_entity_id, code, name, effective_from) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','HCM','TP. Hồ Chí Minh','2026-01-01'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','HN','Hà Nội','2026-01-01'),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','DN','Đà Nẵng','2026-01-01')
on conflict (tenant_id, code) do nothing;

insert into public.departments (id, tenant_id, branch_id, code, name, effective_from) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','EXEC','Ban Điều hành','2026-01-01'),
  ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','HR','Nhân sự','2026-01-01'),
  ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','FIN','Tài chính - Kế toán','2026-01-01'),
  ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','OPS','Vận hành','2026-01-01'),
  ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','MKT','Marketing','2026-01-01'),
  ('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','HN-SALES','Kinh doanh Hà Nội','2026-01-01')
on conflict (tenant_id, code) do nothing;

insert into public.positions (id, tenant_id, code, name, job_level, effective_from) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','CEO','Tổng Giám đốc','L6','2026-01-01'),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','HRM','Trưởng phòng Nhân sự','L4','2026-01-01'),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','HRO','Chuyên viên Nhân sự','L2','2026-01-01'),
  ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','ACCT','Kế toán viên','L2','2026-01-01'),
  ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','OM','Trưởng nhóm Vận hành','L3','2026-01-01'),
  ('50000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','MKTM','Trưởng phòng Marketing','L4','2026-01-01'),
  ('50000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','DSN','Senior Designer','L3','2026-01-01'),
  ('50000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','AE','Account Executive','L2','2026-01-01')
on conflict (tenant_id, code) do nothing;

insert into public.employees (
  id, tenant_id, employee_code, full_name, work_email, phone, hire_date,
  employment_type, status, source_system, external_id
) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','HDG0001','Nguyễn Minh An','an.nguyen@example.test','0900000001','2022-01-10','official','active','sample','HDG0001'),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','HDG0002','Trần Thu Hà','ha.tran@example.test','0900000002','2023-03-15','official','active','sample','HDG0002'),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','HDG0003','Lê Quang Huy','huy.le@example.test','0900000003','2024-02-19','official','active','sample','HDG0003'),
  ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','HDG0004','Phạm Ngọc Anh','anh.pham@example.test','0900000004','2023-08-01','official','active','sample','HDG0004'),
  ('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','HDG0005','Võ Thảo Linh','linh.vo@example.test','0900000005','2022-11-07','official','active','sample','HDG0005'),
  -- Nhân viên dùng trong app mobile (prototype): kích hoạt bằng HD0142 + thao.ha@haidang.vn
  ('60000000-0000-4000-8000-000000000142','10000000-0000-4000-8000-000000000001','HD0142','Trần Thu Hà','thao.ha@haidang.vn','0912345468','2021-03-03','official','active','sample','HD0142'),
  -- HR Administrator của web HR/Admin (prototype): kích hoạt bằng HD0007 + thao.mai@haidang.vn
  ('60000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','HD0007','Mai Phương Thảo','thao.mai@haidang.vn','0912000007','2020-05-04','official','active','sample','HD0007'),
  -- Kế toán (prototype: duyệt và chi tạm ứng): kích hoạt bằng HD0215 + nhung.do@haidang.vn
  ('60000000-0000-4000-8000-000000000215','10000000-0000-4000-8000-000000000001','HD0215','Đỗ Hồng Nhung','nhung.do@haidang.vn','0912000215','2021-09-06','official','active','sample','HD0215'),
  -- Kế toán thứ hai để thử người nhập ≠ người duyệt payroll (dữ liệu hư cấu, chưa kích hoạt).
  ('60000000-0000-4000-8000-000000000216','10000000-0000-4000-8000-000000000001','HD0216','Nguyễn Minh Châu','chau.nguyen@example.test','0912000216','2022-02-07','official','active','sample','HD0216')
on conflict (tenant_id, employee_code) do nothing;

insert into public.audit_logs (
  tenant_id, actor_type, action, resource_type, resource_id, after_data, reason, correlation_id
) values (
  '10000000-0000-4000-8000-000000000001', 'system', 'seed.created', 'tenant',
  '10000000-0000-4000-8000-000000000001', '{"source":"sample-data"}',
  'Development seed only', 'seed-20261020'
);


-- Phân công tổ chức hiện hành (dùng để tính phạm vi quyền và tầng áp dụng ca/địa điểm)
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from) values
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,'2022-01-10'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000007','2023-03-15'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000001','2024-02-19'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000008',null,'2023-08-01'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000001','2022-11-07'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000142','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000003','2021-03-03'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','2020-05-04'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000215','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001','2021-09-06'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000216','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001','2022-02-07');

-- Tài khoản quản trị được mời trước khi kích hoạt: membership chưa có user, role gán sẵn.
-- Mai Phương Thảo: Tenant Admin + HR Operations toàn công ty. Lê Quang Huy: quản lý phòng Marketing.
-- Đỗ Hồng Nhung và Nguyễn Minh Châu: hai Kế toán toàn công ty.
insert into public.memberships (id, tenant_id, employee_id, status) values
  ('80000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000007','invited'),
  ('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','invited'),
  ('80000000-0000-4000-8000-000000000215','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000215','invited'),
  ('80000000-0000-4000-8000-000000000216','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000216','invited');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, scope_id, effective_from)
select '10000000-0000-4000-8000-000000000001', m, r.id, st, sid, '2026-01-01'
from (values
  ('80000000-0000-4000-8000-000000000007'::uuid, 'tenant_admin', 'tenant', null::uuid),
  ('80000000-0000-4000-8000-000000000007'::uuid, 'hr_ops', 'tenant', null::uuid),
  ('80000000-0000-4000-8000-000000000003'::uuid, 'manager', 'department', '40000000-0000-4000-8000-000000000005'::uuid),
  ('80000000-0000-4000-8000-000000000215'::uuid, 'payroll', 'tenant', null::uuid),
  ('80000000-0000-4000-8000-000000000216'::uuid, 'payroll', 'tenant', null::uuid)
) v(m, code, st, sid)
join public.roles r on r.code = v.code and r.tenant_id is null;

-- Chấm công: chỉ giữ giới hạn offline ở cấu hình tenant; ca/địa điểm cấu hình theo tầng bên dưới
update public.tenant_settings
set attendance_settings = attendance_settings || '{"maxOfflineHours":24}'
where tenant_id = '10000000-0000-4000-8000-000000000001';

-- Địa điểm mẫu (prototype: Văn phòng Quận 1, 12 Nguyễn Huệ). Bán kính 50 m vì GPS điện thoại hiếm khi chính xác dưới 10 m.
insert into public.work_locations (id, tenant_id, branch_id, code, name, address) values
  ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','HCM-Q1','Văn phòng Quận 1','12 Nguyễn Huệ, Quận 1, TP.HCM'),
  ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','HN-HK','Văn phòng Hoàn Kiếm','25 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội');
insert into public.work_location_versions (tenant_id, location_id, version_no, latitude, longitude, radius_m, max_accuracy_m, effective_from) values
  ('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',1,10.774390,106.703940,50,60,'2026-01-01'),
  ('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',1,21.024500,105.852400,80,60,'2026-01-01');

-- Ca hành chính 08:00–17:00, nghỉ trưa 12:00–13:00 (mẫu mặc định; công ty tự sửa bằng phiên bản mới)
insert into public.shift_definitions (id, tenant_id, code, name) values
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','HC','Ca hành chính');
insert into public.shift_versions (tenant_id, shift_id, version_no, start_time, end_time, break_start, break_end, effective_from) values
  ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'08:00','17:00','12:00','13:00','2026-01-01');

-- Áp dụng theo tầng: ca HC cho toàn công ty; mỗi chi nhánh chấm công tại văn phòng của mình
insert into public.policy_assignments (tenant_id, kind, target_id, scope_type, scope_id, effective_from) values
  ('10000000-0000-4000-8000-000000000001','shift','90000000-0000-4000-8000-000000000001','tenant',null,'2026-01-01'),
  ('10000000-0000-4000-8000-000000000001','work_location','70000000-0000-4000-8000-000000000001','branch','30000000-0000-4000-8000-000000000001','2026-01-01'),
  ('10000000-0000-4000-8000-000000000001','work_location','70000000-0000-4000-8000-000000000002','branch','30000000-0000-4000-8000-000000000002','2026-01-01');

-- Tenant thứ hai để kiểm thử cách ly dữ liệu giữa công ty (không dùng trong app)
insert into public.tenants (id, code, display_name, status, plan_code) values
  ('10000000-0000-4000-8000-000000000002','MAUB-001','Công ty Mẫu B','active','starter');
insert into public.tenant_settings (tenant_id) values ('10000000-0000-4000-8000-000000000002');
insert into public.legal_entities (id, tenant_id, code, name, effective_from) values
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','MAUB','Công ty Mẫu B','2026-01-01');
insert into public.branches (id, tenant_id, legal_entity_id, code, name, effective_from) values
  ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','HCM','TP. Hồ Chí Minh','2026-01-01');
insert into public.departments (id, tenant_id, branch_id, code, name, effective_from) values
  ('40000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000012','ADM','Hành chính','2026-01-01');
insert into public.positions (id, tenant_id, code, name, effective_from) values
  ('50000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','ADM','Quản trị','2026-01-01');
insert into public.employees (id, tenant_id, employee_code, full_name, work_email, hire_date, source_system, external_id) values
  ('60000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000002','BX0001','Đỗ Văn Bình','admin@maub.test','2025-01-01','sample','BX0001'),
  ('60000000-0000-4000-8000-000000000b02','10000000-0000-4000-8000-000000000002','BX0002','Ngô Thị Bích','bich@maub.test','2025-02-01','sample','BX0002');
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, effective_from)
select '10000000-0000-4000-8000-000000000002', id, '20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000000012','50000000-0000-4000-8000-000000000012','2025-01-01'
from public.employees where tenant_id = '10000000-0000-4000-8000-000000000002';
insert into public.memberships (id, tenant_id, employee_id, status) values
  ('80000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000b01','invited');
insert into public.role_assignments (tenant_id, membership_id, role_id, scope_type, effective_from)
select '10000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000b01', id, 'tenant', '2025-01-01' from public.roles where code = 'tenant_admin' and tenant_id is null;

-- Cài đặt công ty (dữ liệu mẫu): liên hệ HR hiển thị trên mobile, một ngày nghỉ riêng của công ty
update public.tenant_settings
set support_contact = '{"phone":"028 3822 0142","email":"hr@haidang.vn","hours":"8:00–17:00, thứ Hai – thứ Sáu"}'
where tenant_id = '10000000-0000-4000-8000-000000000001';
insert into public.holiday_calendars (id, tenant_id, year, name) values
  ('c1000000-0000-4000-8000-000000002026','10000000-0000-4000-8000-000000000001',2026,'Ngày nghỉ riêng Hải Đăng Group 2026');
insert into public.holidays (calendar_id, holiday_date, name, kind) values
  ('c1000000-0000-4000-8000-000000002026','2026-12-31','Tất niên công ty','company');

-- Bộ mẫu mặc định (quy định giải trình/tạm ứng/nhắc nhở, điều khoản dữ liệu cá nhân v1; ca HC đã có ở trên)
select public.provision_tenant(id) from public.tenants order by code;
select public.provision_workflows(id) from public.tenants order by code;
select public.provision_leave_types(id) from public.tenants order by code;
select public.provision_pay_components(id) from public.tenants order by code;

-- Lương cơ bản mẫu (hư cấu) để tính hạn mức tạm ứng: Hà 15 triệu như prototype
insert into public.employee_compensations (tenant_id, employee_id, base_salary, effective_from, note)
select '10000000-0000-4000-8000-000000000001', e, s, '2026-01-01', 'Dữ liệu mẫu'
from (values ('60000000-0000-4000-8000-000000000142'::uuid, 15000000::bigint), ('60000000-0000-4000-8000-000000000003'::uuid, 28000000::bigint),
  ('60000000-0000-4000-8000-000000000005'::uuid, 18000000::bigint), ('60000000-0000-4000-8000-000000000007'::uuid, 30000000::bigint)) v(e, s);

-- Sổ phép năm của Hà: đã nghỉ 2 ngày trước khi chuyển sang Kavor (nhập số dư đầu kỳ từ bảng tính). Cấp/tích lũy do API tạo khi đọc sổ.
insert into public.leave_accounts (id, tenant_id, employee_id, leave_type_id, year)
select 'a5000000-0000-4000-8000-000000000142', t.tenant_id, '60000000-0000-4000-8000-000000000142', t.id, extract(year from current_date)::smallint
from public.leave_types t where t.tenant_id = '10000000-0000-4000-8000-000000000001' and t.code = 'AL';
insert into public.leave_transactions (tenant_id, account_id, kind, amount, effective_on, source_key, reason)
values ('10000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000142', 'adjust', -2, date_trunc('year', current_date)::date + 40,
  'opening:import', 'Đã nghỉ 2 ngày trước khi chuyển sang Kavor (nhập từ bảng tính)');

-- Kỳ công 26 tháng trước → 25 tháng này (PILOT_RULEBOOK §1)
update public.tenant_settings set attendance_settings = attendance_settings || '{"periodStartDay":26}' where tenant_id = '10000000-0000-4000-8000-000000000001';

-- Chấm công mẫu cho các ngày làm việc đã qua của kỳ hiện tại (không gồm hôm nay), để bảng công/giải trình có dữ liệu khi dev.
-- Hà (HD0142) theo kiểu prototype: thường đúng giờ, có ngày đi muộn, quên chấm vào, quên chấm ra (ngày gần nhất quên chấm ra,
-- ngày trước đó đi muộn). Nhân viên khác đều đặn.
with period as (
  select case when extract(day from current_date) >= 26 then date_trunc('month', current_date)::date + 25
              else (date_trunc('month', current_date) - interval '1 month')::date + 25 end as start_on
), days as (
  select d::date as d from period, generate_series((select start_on from period), current_date - 1, interval '1 day') d
  where extract(isodow from d) between 1 and 5
), people as (
  select * from (values
    ('60000000-0000-4000-8000-000000000142'::uuid, true),
    ('60000000-0000-4000-8000-000000000003'::uuid, false),
    ('60000000-0000-4000-8000-000000000004'::uuid, false),
    ('60000000-0000-4000-8000-000000000005'::uuid, false)) v(emp, varied)
), recent as (
  -- Hai ngày làm việc gần nhất của Hà: luôn còn trong hạn giải trình → thử được giải trình bất cứ hôm nào
  select d, row_number() over (order by d desc) as n from days
), plan as (
  select p.emp, days.d,
    case when p.varied and r.n = 2 then time '08:21'
         when p.varied and extract(day from days.d)::int % 7 = 3 then time '08:14'
         when p.varied and extract(day from days.d)::int % 13 = 2 then null
         else time '07:52' + make_interval(mins => (extract(day from days.d)::int * 3) % 8) end as t_in,
    case when p.varied and r.n = 1 then null
         when p.varied and extract(day from days.d)::int % 11 = 4 then null
         else time '17:05' + make_interval(mins => (extract(day from days.d)::int * 5) % 25) end as t_out
  from people p cross join days join recent r on r.d = days.d
  where not exists (select 1 from public.holidays h join public.holiday_calendars c on c.id = h.calendar_id
                    where h.holiday_date = days.d and (c.tenant_id is null or c.tenant_id = '10000000-0000-4000-8000-000000000001'))
)
insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, received_at, status, location_id, latitude, longitude, accuracy_m, distance_m)
select '10000000-0000-4000-8000-000000000001', emp, k.kind, 'seed-' || left(emp::text, 8) || right(emp::text, 4) || '-' || d || '-' || k.kind,
  ((d + k.t) at time zone 'Asia/Ho_Chi_Minh'), ((d + k.t) at time zone 'Asia/Ho_Chi_Minh'), 'accepted',
  '70000000-0000-4000-8000-000000000001', 10.774390, 106.703940, 8, 4
from plan cross join lateral (values ('in', plan.t_in), ('out', plan.t_out)) k(kind, t)
where k.t is not null;

-- Bản tin mẫu (nội dung như prototype mobile; ngày tính theo lúc reset, bài "hôm nay" đăng lúc 0:30 để không thành bài hẹn giờ). Bài 9 chỉ gửi phòng Nhân sự, bài 10 hẹn giờ ngày mai, bài 11 là nháp.
-- File đính kèm không seed được (nằm ở Storage) — HR tải lên trên web.
with t(tid) as (values ('10000000-0000-4000-8000-000000000001'::uuid)),
posts(id, days, hm, category, important, pinned, author, title, body) as (values
  ('a0000000-0000-4000-8000-000000000006'::uuid, 0, '00:30', 'notice', true, false, 'Phòng IT', 'Bảo trì hệ thống Kavor tối nay 22:00 – 23:30',
   'Trong thời gian bảo trì, app tạm dừng. Ra ca trước 22:00 hoặc sau 23:30 vẫn được ghi nhận bình thường.'),
  ('a0000000-0000-4000-8000-000000000007'::uuid, 0, '00:45', 'event', false, false, 'Ban Văn hóa', 'Sinh nhật tháng này: 16:00 hôm nay tại pantry tầng 5',
   'Mời cả nhà ghé chúc mừng 8 bạn có sinh nhật trong tháng.'),
  ('a0000000-0000-4000-8000-000000000008'::uuid, 1, '09:00', 'notice', false, false, 'Hành chính', 'Đổi khu vực gửi xe máy từ thứ Hai tới',
   'Xe máy nhân viên chuyển xuống hầm B2, lối vào phía đường Hồ Tùng Mậu. Thẻ xe cũ vẫn dùng được.'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 1, '10:00', 'policy', true, true, 'Phòng Nhân sự', 'Chấm công GPS trên app Kavor áp dụng từ 01/11/2026',
   E'Từ ngày 01/11/2026, nhân viên khối văn phòng chấm công vào/ra ca trên app Kavor thay cho máy vân tay ở sảnh.\n\nMỗi người đăng ký một điện thoại để chấm công. Khi đổi máy, gửi yêu cầu reset trong Hồ sơ → Bảo mật và thiết bị.\n\n- Bán kính chấm công: 50 m quanh điểm đặt tại văn phòng.\n- Quên chấm hoặc lỗi định vị: gửi giải trình, tối đa 3 lần/tháng.\n- Hạn giải trình: trước ngày chốt công 3 ngày.\n\nMáy vân tay vẫn chạy song song đến hết 30/11 để đối chiếu.'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 2, '09:30', 'notice', false, false, 'Phòng Nhân sự', 'Lịch nghỉ Tết Dương lịch 2027',
   'Công ty nghỉ Tết Dương lịch vào Thứ Sáu 01/01/2027. Bộ phận trực vận hành nhận lịch phân ca riêng từ quản lý.'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 4, '14:00', 'event', false, false, 'Ban Văn hóa', 'Team building quý 4 tại Đà Lạt, 13–15/11',
   'Đăng ký trước 05/11 qua quản lý trực tiếp. Công ty hỗ trợ chi phí đi lại và lưu trú.'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 6, '08:00', 'notice', false, false, 'Phòng Nhân sự', 'Nhắc hạn gửi giải trình trước ngày chốt công',
   'Hạn gửi giải trình công là 3 ngày trước ngày chốt công. Sau đó bảng công được khóa để tính lương.'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 11, '10:00', 'event', false, false, 'Ban Văn hóa', 'Sáu đồng nghiệp tròn 5 năm gắn bó',
   'Quà kỷ niệm sẽ được trao tại buổi họp toàn thể cuối tháng.'),
  ('a0000000-0000-4000-8000-000000000009'::uuid, 3, '11:00', 'policy', false, false, 'Phòng Nhân sự', 'Quy trình tiếp nhận hồ sơ nhân viên mới',
   E'Áp dụng cho phòng Nhân sự từ tuần này.\n\n- Kiểm tra đủ giấy tờ trước ngày nhận việc.\n- Tạo hồ sơ và mời kích hoạt app trong ngày đầu tiên.'),
  ('a0000000-0000-4000-8000-000000000010'::uuid, -1, '08:00', 'event', false, false, 'Ban Văn hóa', 'Giải chạy bộ nội bộ cuối năm',
   'Đăng ký theo phòng ban, mỗi phòng tối thiểu 3 người.'),
  ('a0000000-0000-4000-8000-000000000011'::uuid, null, null, 'notice', false, false, 'Phòng Nhân sự', 'Khảo sát mức độ hài lòng quý 4 (nháp)',
   'Khảo sát ẩn danh, mất khoảng 5 phút.')
)
insert into public.announcements (id, tenant_id, category, title, body, author_label, important, pinned, audience, publish_at, created_at)
select p.id, t.tid, p.category, p.title, p.body, p.author, p.important, p.pinned,
  case when p.id = 'a0000000-0000-4000-8000-000000000009' then 'units' else 'tenant' end,
  case when p.days is null then null else ((public.tenant_today(t.tid) - p.days) + p.hm::time) at time zone 'Asia/Ho_Chi_Minh' end,
  coalesce(((public.tenant_today(t.tid) - greatest(p.days, 0)) + time '07:00') at time zone 'Asia/Ho_Chi_Minh', now())
from posts p cross join t;
insert into public.announcement_audiences (announcement_id, tenant_id, scope_type, scope_id)
values ('a0000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'department', '40000000-0000-4000-8000-000000000002');
