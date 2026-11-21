-- Chữ thông báo tạm ứng đã chi + phiếu lương đã công bố: dễ đọc trên màn hình khóa (Web Push) và KHÔNG hiện số tiền, không dùng dấu "·"
-- (ai cầm máy cũng đọc được màn hình khóa; số tiền xem trong app sau khi mở khóa). Chỉ đổi chữ truyền vào notify(),
-- phần còn lại chép nguyên từ 202610300001_salary_advance.sql / 202610310001_payroll.sql.

create or replace function public.notify_advance_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
begin
  if old.paid_at is not null or new.paid_at is null then return null; end if;
  select * into r from public.requests where id = new.request_id;
  perform public.notify(new.tenant_id, new.employee_id, 'advance.paid', 'Đã chi tạm ứng lương',
    'Trừ vào lương ' || to_char(new.deduct_month, 'MM/YYYY') || '.' || coalesce(' Ghi chú: ' || rtrim(nullif(btrim(new.payout_note), ''), '.') || '.', '')
      || ' Mã đơn ' || r.request_no || '.',
    'request', r.id, r.request_no, null, 'paid:' || new.id);
  return null;
end;
$$;

-- Công bố và các hiệu ứng trong cùng transaction. ADVANCE lệch chỉ cảnh báo; không đánh dấu sai là đã trừ.
create or replace function public.notify_payroll_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  emp uuid;
  imported_advance bigint;
  paid_advance numeric;
  already_deducted boolean;
begin
  if new.status <> 'published' or old.status = 'published' then return null; end if;
  -- Khóa các tạm ứng đã chi trước khi đọc tổng và đánh dấu, thứ tự cố định để tránh deadlock.
  perform 1 from public.salary_advances s where s.tenant_id = new.tenant_id
    and s.deduct_month = (new.month || '-01')::date and s.paid_at is not null order by s.id for update;
  for emp in
    select employee_id from public.payroll_results where cycle_id = new.id
    union
    select employee_id from public.salary_advances where tenant_id = new.tenant_id and deduct_month = (new.month || '-01')::date and paid_at is not null
  loop
    select coalesce(sum(i.amount), 0)::bigint into imported_advance from public.payroll_results pr
      join public.payroll_result_items i on i.result_id = pr.id
      where pr.cycle_id = new.id and pr.employee_id = emp and i.component_code = 'ADVANCE';
    select coalesce(sum(s.amount), 0), coalesce(bool_or(s.deducted_cycle_id is not null), false)
      into paid_advance, already_deducted from public.salary_advances s
      where s.tenant_id = new.tenant_id and s.employee_id = emp and s.deduct_month = (new.month || '-01')::date and s.paid_at is not null;
    if imported_advance = paid_advance and paid_advance > 0 and not already_deducted then
      update public.salary_advances set deducted_cycle_id = new.id
      where tenant_id = new.tenant_id and employee_id = emp and deduct_month = (new.month || '-01')::date and paid_at is not null and deducted_cycle_id is null;
    elsif imported_advance <> paid_advance or already_deducted then
      insert into public.payroll_cycle_events (tenant_id, cycle_id, action, from_status, to_status, actor_user_id, employee_id, reason)
      values (new.tenant_id, new.id, 'advance_mismatch', old.status, new.status, new.published_by, emp,
        'Tạm ứng chưa đối chiếu khớp; chưa ghi nhận khấu trừ.');
    end if;
  end loop;
  for r in select id, employee_id from public.payroll_results where cycle_id = new.id loop
    perform public.notify(new.tenant_id, r.employee_id, 'payslip.published',
      'Đã có phiếu lương tháng ' || to_char((new.month || '-01')::date, 'MM/YYYY'),
      'Chạm để xem lương thực nhận, các khoản cộng và khấu trừ.', 'payslip', r.id, new.month, null, 'payslip:' || r.id);
  end loop;
  return null;
end;
$$;
