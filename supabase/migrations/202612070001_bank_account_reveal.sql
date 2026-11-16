-- Xem số tài khoản: người có employee.sensitive.read chỉ thấy số đầy đủ qua API "Hiện số" (POST .../bank-account/reveal),
-- mỗi lượt xem ghi audit_logs. Trình duyệt web có access token (cho Realtime) nên RLS không được cho họ đọc thẳng hai bảng này,
-- nếu không sẽ lách được nhật ký. API dùng service role nên không bị ảnh hưởng; nhân viên vẫn đọc số của chính mình.

drop policy employee_bank_accounts_read on public.employee_bank_accounts;
create policy employee_bank_accounts_read on public.employee_bank_accounts for select to authenticated
  using (employee_id in (select public.current_employee_ids()));

drop policy profile_change_bank_read on public.profile_change_bank;
create policy profile_change_bank_read on public.profile_change_bank for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_employee_id in (select public.current_employee_ids())));

update public.permissions set description = 'Xem số tài khoản ngân hàng đầy đủ của nhân viên trong phạm vi (mỗi lượt xem ghi nhật ký)'
where code = 'employee.sensitive.read';
