-- Tạo/sửa hồ sơ nhân viên trong một giao dịch. Trước đây API ghi `employees` rồi mới kiểm phạm vi của phòng ban mới (403 nhưng tên đã
-- đổi, không nhật ký), đóng phân công cũ rồi mới chèn bản mới (lỗi giữa chừng → không còn phân công), lấy "phân công hiện tại" theo
-- hôm nay nên nhân viên chưa vào làm đổi phòng ban thành hai phân công (tới ngày vào làm bản cũ thắng), và HR phạm vi phòng ban tạo
-- nhân viên ngày vào tương lai thì 404 ngay sau khi tạo (scoped_employees chỉ xét phân công đang hiệu lực).
-- API kiểm hết quyền/phạm vi/hợp lệ TRƯỚC khi gọi; hàm ghi hồ sơ + phân công + nhật ký và chặn khi phân công vừa bị người khác đổi.

-- p_employee null = tạo mới (p_patch đủ trường). p_patch: chỉ các cột có trong khóa mới đổi (giá trị null = xóa).
-- p_placement (null = không đổi phân công): {from, currentFrom, legal_entity_id, branch_id, department_id, position_id, manager_employee_id};
--   currentFrom = effective_from của phân công chính mới nhất mà API đã thấy (null nếu chưa có). from = currentFrom → sửa bản đó,
--   from > currentFrom → đóng bản đó tới from − 1 rồi mở bản mới.
-- p_audit: {before, after}
create or replace function public.save_employee(
  p_tenant uuid, p_actor uuid, p_employee uuid, p_patch jsonb, p_placement jsonb, p_audit jsonb, p_correlation text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  cur public.employee_assignments;
  f date;
begin
  if p_employee is null then
    insert into public.employees (tenant_id, employee_code, full_name, work_email, phone, hire_date, employment_type, status, source_system)
    values (p_tenant, p_patch->>'employee_code', p_patch->>'full_name', p_patch->>'work_email', p_patch->>'phone', (p_patch->>'hire_date')::date,
      p_patch->>'employment_type', coalesce(p_patch->>'status', 'active'), 'kavor')
    returning * into e;
  else
    select * into e from public.employees where id = p_employee and tenant_id = p_tenant for update;
    if e.id is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0001'; end if;
    if p_patch <> '{}'::jsonb then
      update public.employees set
        employee_code = case when p_patch ? 'employee_code' then p_patch->>'employee_code' else employee_code end,
        full_name = case when p_patch ? 'full_name' then p_patch->>'full_name' else full_name end,
        work_email = case when p_patch ? 'work_email' then p_patch->>'work_email' else work_email end,
        phone = case when p_patch ? 'phone' then p_patch->>'phone' else phone end,
        hire_date = case when p_patch ? 'hire_date' then (p_patch->>'hire_date')::date else hire_date end,
        employment_type = case when p_patch ? 'employment_type' then p_patch->>'employment_type' else employment_type end,
        status = case when p_patch ? 'status' then p_patch->>'status' else status end,
        termination_date = case when p_patch ? 'termination_date' then (p_patch->>'termination_date')::date else termination_date end,
        termination_reason = case when p_patch ? 'termination_reason' then p_patch->>'termination_reason' else termination_reason end,
        termination_handover = case when p_patch ? 'termination_handover' then (p_patch->>'termination_handover')::boolean else termination_handover end,
        termination_note = case when p_patch ? 'termination_note' then p_patch->>'termination_note' else termination_note end
      where id = e.id;
    end if;
  end if;

  if p_placement is not null then
    f := (p_placement->>'from')::date;
    select * into cur from public.employee_assignments where employee_id = e.id and is_primary order by effective_from desc limit 1 for update;
    if cur.effective_from is distinct from (p_placement->>'currentFrom')::date then raise exception 'PLACEMENT_CHANGED' using errcode = 'P0001'; end if;
    if cur.id is not null and f < cur.effective_from then raise exception 'PLACEMENT_FROM_INVALID' using errcode = 'P0001'; end if;
    if cur.id is not null and f = cur.effective_from then
      update public.employee_assignments set legal_entity_id = (p_placement->>'legal_entity_id')::uuid, branch_id = (p_placement->>'branch_id')::uuid,
        department_id = (p_placement->>'department_id')::uuid, position_id = (p_placement->>'position_id')::uuid,
        manager_employee_id = (p_placement->>'manager_employee_id')::uuid
      where id = cur.id;
    else
      if cur.id is not null then
        update public.employee_assignments set effective_to = least(coalesce(effective_to, f - 1), f - 1) where id = cur.id;
      end if;
      insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from)
      values (p_tenant, e.id, (p_placement->>'legal_entity_id')::uuid, (p_placement->>'branch_id')::uuid, (p_placement->>'department_id')::uuid,
        (p_placement->>'position_id')::uuid, (p_placement->>'manager_employee_id')::uuid, f);
    end if;
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, before_data, after_data, correlation_id)
  values (p_tenant, p_actor, 'user', case when p_employee is null then 'employee.created' else 'employee.updated' end, 'employee', e.id,
    p_audit->'before', p_audit->'after', p_correlation);
  return e.id;
end;
$$;
revoke all on function public.save_employee(uuid, uuid, uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_employee(uuid, uuid, uuid, jsonb, jsonb, jsonb, text) to service_role;

-- Phạm vi theo phân công: đang hiệu lực vào ngày xét; chưa có (nhân viên sắp vào làm) thì phân công sắp hiệu lực sớm nhất
create or replace function public.scoped_employees(p_user uuid, p_tenant uuid, p_perm text, p_date date default null)
returns setof public.employees
language sql
stable
security definer
set search_path = public
as $$
  with d as (select coalesce(p_date, public.tenant_today(p_tenant)) as day),
  s as (select * from public.permission_scopes(p_user, p_tenant, p_perm, (select day from d))),
  me as (select id from public.employees where user_id = p_user and tenant_id = p_tenant)
  select e.* from public.employees e
  left join lateral (
    select a.legal_entity_id, a.branch_id, a.department_id, a.manager_employee_id
    from public.employee_assignments a
    where a.employee_id = e.id and a.is_primary and (a.effective_to is null or a.effective_to >= (select day from d))
    order by (a.effective_from > (select day from d)), case when a.effective_from <= (select day from d) then a.effective_from end desc nulls last, a.effective_from
    limit 1
  ) a on true
  where e.tenant_id = p_tenant and exists (
    select 1 from s where
      s.scope_type = 'tenant'
      or (s.scope_type = 'legal_entity' and a.legal_entity_id = s.scope_id)
      or (s.scope_type = 'branch' and a.branch_id = s.scope_id)
      or (s.scope_type = 'department' and a.department_id = s.scope_id)
      or (s.scope_type = 'self' and e.id in (select id from me))
      or (s.scope_type = 'direct_reports' and a.manager_employee_id in (select id from me))
  );
$$;
