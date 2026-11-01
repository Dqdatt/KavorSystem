-- Quản trị viên công ty duyệt được bước "Phòng Nhân sự" (request.hr_review, phạm vi toàn công ty).
-- Trước đây chỉ vai trò Nhân sự vận hành có quyền này, mà công ty tạo từ Console chỉ cấp vai trò Quản trị viên cho người đầu tiên
-- → mọi đơn có bước HR (giải trình, nghỉ trên 2 ngày, OT, sửa hồ sơ) không ai duyệt được. DB luôn giữ ít nhất một quản trị viên
-- đang hoạt động nên bước HR luôn có người duyệt. Bước Kế toán (salary_advance.process) cố ý không cấp: checklist cảnh báo thay.
-- Người duyệt/thông báo tính lúc đọc (employee_in_scope) nên đơn đang kẹt tự có người duyệt, không cần sửa dữ liệu.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'request.hr_review'
where r.tenant_id is null and r.is_system and r.code = 'tenant_admin'
on conflict do nothing;
