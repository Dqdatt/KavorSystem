-- Việt hóa tên hiển thị của vai trò hệ thống (docs/plans/web-ui-polish.md, bảng từ người dùng đã duyệt 26/10).
-- Chỉ đổi cột name; mã vai trò (tenant_admin, hr_ops) giữ nguyên vì API, RLS và smoke dùng mã.
update public.roles set name = 'Quản trị viên công ty' where tenant_id is null and code = 'tenant_admin';
update public.roles set name = 'Nhân sự vận hành' where tenant_id is null and code = 'hr_ops';
