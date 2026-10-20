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
  '{"primaryColor":"#176d4a","logo":"kavor-sample"}',
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
  ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','OPS','Vận hành','2026-01-01')
on conflict (tenant_id, code) do nothing;

insert into public.positions (id, tenant_id, code, name, job_level, effective_from) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','CEO','Tổng Giám đốc','L6','2026-01-01'),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','HRM','Trưởng phòng Nhân sự','L4','2026-01-01'),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','HRO','Chuyên viên Nhân sự','L2','2026-01-01'),
  ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','ACCT','Kế toán viên','L2','2026-01-01'),
  ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','OM','Trưởng nhóm Vận hành','L3','2026-01-01')
on conflict (tenant_id, code) do nothing;

insert into public.employees (
  id, tenant_id, employee_code, full_name, work_email, phone, hire_date,
  employment_type, status, source_system, external_id
) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','HDG0001','Nguyễn Minh An','an.nguyen@example.test','0900000001','2022-01-10','official','active','sample','HDG0001'),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','HDG0002','Trần Thu Hà','ha.tran@example.test','0900000002','2023-03-15','official','active','sample','HDG0002'),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','HDG0003','Lê Quang Huy','huy.le@example.test','0900000003','2024-02-19','official','active','sample','HDG0003'),
  ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','HDG0004','Phạm Ngọc Anh','anh.pham@example.test','0900000004','2023-08-01','official','active','sample','HDG0004'),
  ('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','HDG0005','Võ Thảo Linh','linh.vo@example.test','0900000005','2022-11-07','official','active','sample','HDG0005')
on conflict (tenant_id, employee_code) do nothing;

insert into public.audit_logs (
  tenant_id, actor_type, action, resource_type, resource_id, after_data, reason, correlation_id
) values (
  '10000000-0000-4000-8000-000000000001', 'system', 'seed.created', 'tenant',
  '10000000-0000-4000-8000-000000000001', '{"source":"sample-data"}',
  'Development seed only', 'seed-20261020'
);
