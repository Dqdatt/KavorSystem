-- HR điều chỉnh công: HR sửa giờ vào/ra của một ngày trên web, không qua đơn (vd giải trình duyệt nhầm giờ — trước đây chỉ sửa được bằng SQL).
-- Ghi một dòng attendance_adjustments không gắn đơn (request_id null, approved_by = người sửa); bản sau ghi đè bản trước, chấm công gốc không đổi.
-- Cùng giao dịch: nhật ký trước/sau + lý do, thông báo cho nhân viên. Kỳ công đã khóa: trigger attendance_adjustments_period_guard chặn.
-- API kiểm quyền attendance.adjust + phạm vi nhân viên trước khi gọi; hàm kiểm lại dữ liệu (ngày, người sửa, đơn chờ).

insert into public.permissions (code, module, description) values
  ('attendance.adjust','attendance','Điều chỉnh giờ vào/ra của nhân viên (không qua đơn)')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'attendance.adjust'
where r.tenant_id is null and r.is_system and r.code in ('hr_ops','tenant_admin')
on conflict do nothing;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval.pending','approval.due','request.approved','request.rejected','device.approved','device.rejected','advance.paid','payslip.published','announcement.published',
    'reminder.attendance','reminder.documents','reminder.announcement','attendance.adjusted'));

-- p_before: giờ ghi nhận trước khi sửa (API tính từ bảng công) để lưu nhật ký. Trả id dòng điều chỉnh.
create or replace function public.hr_adjust_attendance(p_tenant uuid, p_employee uuid, p_date date, p_in time, p_out time, p_reason text,
  p_user uuid, p_before jsonb, p_correlation text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  why text := btrim(coalesce(p_reason, ''));
  aid uuid;
begin
  select * into e from public.employees where id = p_employee and tenant_id = p_tenant;
  if e.id is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_user is null then raise exception 'ADJUST_ACTOR_REQUIRED' using errcode = 'P0001'; end if;
  -- Không tự sửa công của mình
  if e.user_id = p_user then raise exception 'ADJUST_SELF' using errcode = 'P0001'; end if;
  if p_in is null or p_out is null or p_out <= p_in then raise exception 'ADJUST_TIME_INVALID' using errcode = 'P0001'; end if;
  if char_length(why) not between 5 and 500 then raise exception 'ADJUST_REASON_INVALID' using errcode = 'P0001'; end if;
  if p_date is null or p_date > public.tenant_today(p_tenant) then raise exception 'ADJUST_DATE_FUTURE' using errcode = 'P0001'; end if;
  if p_date < e.hire_date or p_date > coalesce(e.termination_date, 'infinity'::date) then raise exception 'ADJUST_NOT_EMPLOYED' using errcode = 'P0001'; end if;
  -- Giải trình đang chờ của ngày: xử lý đơn trước (đơn duyệt sau sẽ ghi đè giờ HR vừa sửa)
  if exists (select 1 from public.requests where tenant_id = p_tenant and requester_employee_id = p_employee and request_type = 'explanation'
      and work_date = p_date and status = 'pending') then
    raise exception 'ADJUST_REQUEST_PENDING' using errcode = 'P0001';
  end if;

  insert into public.attendance_adjustments (tenant_id, employee_id, work_date, clock_in, clock_out, reason, approved_by)
  values (p_tenant, p_employee, p_date, p_in, p_out, why, p_user)
  returning id into aid;
  insert into public.audit_logs (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, before_data, after_data, reason, correlation_id)
  -- Gắn với hồ sơ nhân viên để hiện ở tab Lịch sử của hồ sơ
  values (p_tenant, p_user, 'user', 'attendance.adjusted', 'employee', p_employee, p_before,
    jsonb_build_object('adjustment_id', aid, 'work_date', p_date, 'clock_in', to_char(p_in, 'HH24:MI'), 'clock_out', to_char(p_out, 'HH24:MI')),
    why, coalesce(p_correlation, 'hr_adjust_attendance'));
  perform public.notify(p_tenant, p_employee, 'attendance.adjusted', 'Công ngày ' || to_char(p_date, 'DD/MM/YYYY') || ' đã được HR điều chỉnh',
    'Giờ vào ' || to_char(p_in, 'HH24:MI') || ', giờ ra ' || to_char(p_out, 'HH24:MI') || '. Lý do: ' || why,
    null, null, null, null, 'attendance.adjusted:' || aid);
  return aid;
end;
$$;

revoke all on function public.hr_adjust_attendance(uuid, uuid, date, time, time, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.hr_adjust_attendance(uuid, uuid, date, time, time, text, uuid, jsonb, text) to service_role;
