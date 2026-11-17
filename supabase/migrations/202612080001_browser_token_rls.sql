-- Token Supabase trong trình duyệt chỉ dùng cho Realtime của web HR (apps/admin-web/app/_lib/client.ts, 7 bảng).
-- Trước đây authenticated đọc 69 bảng qua PostgREST theo RLS và RLS không kiểm aal: chỉ cần mật khẩu (phiên aal1, chưa qua MFA)
-- là đọc được lương, CCCD, phiếu lương, nhật ký; quản lý trực tiếp đọc thẳng CCCD dù API che.
-- API dùng service role, mobile không dùng supabase-js → chỉ giữ SELECT trên 7 bảng Realtime và bắt buộc aal2 trên các bảng đó.
-- Policy của các bảng khác giữ nguyên làm lớp phòng thủ (không còn GRANT nên không đọc được). Bảng mới: không GRANT cho authenticated
-- trừ khi cần Realtime (khi đó thêm vào danh sách dưới + client.ts + pgTAP browser_token).

revoke all on all tables in schema public from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['attendance_events', 'employee_devices', 'employees', 'requests', 'approval_tasks', 'notifications',
                           'support_access_sessions'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select auth.jwt() ->> ''aal'') = ''aal2'')',
                   t || '_mfa', t);
  end loop;
end $$;
