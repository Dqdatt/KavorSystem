-- Siết quyền truy cập cho schema public.
-- 1. Ba bảng chưa bật RLS: user_profiles, permissions, role_permissions.
-- 2. Supabase đời mới không tự cấp SELECT cho anon/authenticated nên các policy của migration nền tảng
--    không có tác dụng (người dùng đăng nhập không đọc được gì); đồng thời anon/authenticated lại có
--    TRUNCATE/TRIGGER/REFERENCES. Cấp lại đúng quyền đọc, thu hồi phần thừa.
-- Ghi dữ liệu vẫn đi qua API (service role) để kiểm tra nghiệp vụ và ghi audit.

-- Thu hồi toàn bộ quyền mặc định của client trên schema public, kể cả cho bảng tạo sau này
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- RLS cho các bảng còn thiếu
alter table public.user_profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

-- Người dùng chỉ đọc/sửa hồ sơ của chính mình; người cùng tenant đọc được tên hiển thị qua employees
create policy user_profiles_self_read on public.user_profiles for select to authenticated
  using (id = auth.uid());
create policy user_profiles_self_update on public.user_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Danh mục quyền là dữ liệu hệ thống, không chứa dữ liệu tenant
create policy permissions_read on public.permissions for select to authenticated
  using (true);

-- Quyền của vai trò: vai trò hệ thống (tenant_id null) hoặc vai trò thuộc tenant mình là thành viên
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and (r.tenant_id is null or public.is_active_member(r.tenant_id))
  ));

-- Quyền đọc cho người dùng đăng nhập; RLS quyết định hàng nào được thấy. anon không có quyền gì.
grant select on
  public.tenants, public.tenant_settings, public.memberships, public.roles, public.permissions,
  public.role_permissions, public.role_assignments, public.legal_entities, public.branches,
  public.departments, public.positions, public.employees, public.employee_assignments,
  public.audit_logs, public.user_profiles
to authenticated;
grant update (display_name, phone) on public.user_profiles to authenticated;

-- Audit chỉ được thêm, không sửa/xóa, kể cả từ service role qua PostgREST nhầm lẫn
create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();
