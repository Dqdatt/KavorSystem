-- Kavor Console chọn được mã nhân viên của quản trị viên công ty đầu tiên khi tạo doanh nghiệp (trước đây luôn là ADMIN01).
-- Bọc create_tenant_with_admin (giữ nguyên hàm cũ) trong cùng một transaction: tạo tenant rồi đổi mã hồ sơ quản trị viên.
create function public.create_tenant_with_admin_code(
  p_code text, p_name text, p_legal_name text, p_plan text, p_employee_limit integer, p_admin_name text, p_admin_email citext, p_actor uuid, p_admin_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  c text := upper(trim(coalesce(p_admin_code, '')));
begin
  if c <> '' and c !~ '^[A-Z0-9._-]{2,40}$' then raise exception 'ADMIN_CODE_INVALID' using errcode = '22023'; end if;
  r := public.create_tenant_with_admin(p_code, p_name, p_legal_name, p_plan, p_employee_limit, p_admin_name, p_admin_email, p_actor);
  if c <> '' then
    update public.employees set employee_code = c where id = (r ->> 'admin_employee_id')::uuid and employee_code <> c;
  end if;
  return r;
end;
$$;
revoke all on function public.create_tenant_with_admin_code(text, text, text, text, integer, text, citext, uuid, text) from public, anon, authenticated;
grant execute on function public.create_tenant_with_admin_code(text, text, text, text, integer, text, citext, uuid, text) to service_role;
