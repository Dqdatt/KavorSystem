-- Minh chứng đính kèm đơn: chỉ đơn giải trình/nghỉ đang chờ, tối đa 3 file, bất biến; đơn cần minh chứng không duyệt được bước cuối khi chưa có
-- file (bước HR đã bỏ qua thì bước quản lý là bước cuối); RLS. Không giả định DB trống (năm 2025 + id riêng).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values ('a8000000-0000-4000-8000-000000000005', 'linh.proof@example.test'), ('a8000000-0000-4000-8000-000000000142', 'ha.proof@example.test');
update public.employees set user_id = 'a8000000-0000-4000-8000-000000000005' where id = '60000000-0000-4000-8000-000000000005';
update public.employees set user_id = 'a8000000-0000-4000-8000-000000000142' where id = '60000000-0000-4000-8000-000000000142';
select set_config('test.wv', (select v.id::text from public.workflow_versions v join public.workflow_definitions d on d.id = v.workflow_id
  where d.tenant_id = '10000000-0000-4000-8000-000000000001' and d.request_type = 'leave' order by v.version_no limit 1), true);
select set_config('test.sl', (select id::text from public.leave_types where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'SL'), true);

-- Đơn nghỉ ốm 2 ngày cần minh chứng: quản lý → HR
create function pg_temp.leave(p_from date, p_required boolean, p_steps jsonb) returns uuid language sql as $$
  select (public.create_leave_request('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'a8000000-0000-4000-8000-000000000005',
    current_setting('test.wv')::uuid, '2025-05-26', current_setting('test.sl')::uuid,
    jsonb_build_object('leaveType', 'SL', 'leaveTypeName', 'Ốm đau (BHXH)', 'from', p_from, 'to', p_from + 1, 'half', 'full', 'days', 2, 'reason', 'Sốt cao'),
    jsonb_build_object('attachmentRequired', p_required), p_steps,
    jsonb_build_array(jsonb_build_object('date', p_from, 'half', 'full', 'portion', 1), jsonb_build_object('date', p_from + 1, 'half', 'full', 'portion', 1)), null, 2)->>'id')::uuid;
$$;
create function pg_temp.attach(p_request uuid, p_n int) returns void language sql as $$
  insert into public.request_attachments (tenant_id, request_id, storage_path, file_name, mime_type, size_bytes, sha256, created_by)
  values ('10000000-0000-4000-8000-000000000001', p_request, '10000000-0000-4000-8000-000000000001/' || p_request || '-' || p_n || '.pdf', 'giay-kham-' || p_n || '.pdf',
    'application/pdf', 1000, repeat('a', 64), 'a8000000-0000-4000-8000-000000000005');
$$;
select set_config('test.two', '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24},{"stepNo":2,"resolver":"hr","status":"waiting","slaHours":24}]', true);
select set_config('test.one', '[{"stepNo":1,"resolver":"direct_manager","assigneeEmployeeId":"60000000-0000-4000-8000-000000000001","status":"pending","slaHours":24},{"stepNo":2,"resolver":"hr","status":"skipped"}]', true);

select set_config('test.r1', pg_temp.leave('2025-06-02', true, current_setting('test.two')::jsonb)::text, true);
select is(public.request_attachment_missing(current_setting('test.r1')::uuid), true, 'Đơn cần minh chứng, chưa có file');
select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r1')::uuid and step_no = 1), null, true), 'next',
  'Quản lý vẫn duyệt được bước đầu khi chưa có minh chứng');
select throws_ok(format('select public.decide_approval(%L, null, true)', (select id from public.approval_tasks where request_id = current_setting('test.r1')::uuid and step_no = 2)),
  'P0001', 'ATTACHMENT_REQUIRED', 'Bước cuối (HR) không duyệt được khi chưa có minh chứng');
select lives_ok(format('select pg_temp.attach(%L, 1)', current_setting('test.r1')), 'Nhân viên đính kèm khi đơn đang chờ');
select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r1')::uuid and step_no = 2), null, true), 'approved',
  'Có minh chứng → HR duyệt được');
select throws_ok(format('select pg_temp.attach(%L, 2)', current_setting('test.r1')), 'P0001', 'REQUEST_NOT_PENDING', 'Đơn đã xử lý không thêm file');

-- Bước HR bị bỏ qua: bước quản lý là bước cuối
select set_config('test.r2', pg_temp.leave('2025-06-09', true, current_setting('test.one')::jsonb)::text, true);
select throws_ok(format('select public.decide_approval(%L, null, true)', (select id from public.approval_tasks where request_id = current_setting('test.r2')::uuid and step_no = 1)),
  'P0001', 'ATTACHMENT_REQUIRED', 'Bước HR bỏ qua → quản lý là bước cuối, bị chặn khi chưa có minh chứng');
select is(public.decide_approval((select id from public.approval_tasks where request_id = current_setting('test.r2')::uuid and step_no = 1), null, false, 'Thiếu giấy khám'), 'rejected',
  'Từ chối không cần minh chứng');

-- Đơn không yêu cầu minh chứng: duyệt bình thường; tối đa 3 file; bất biến
select set_config('test.r3', pg_temp.leave('2025-06-16', false, current_setting('test.one')::jsonb)::text, true);
select pg_temp.attach(current_setting('test.r3')::uuid, n) from generate_series(1, 3) n;
select throws_ok(format('select pg_temp.attach(%L, 4)', current_setting('test.r3')), 'P0001', 'ATTACHMENT_LIMIT', 'Tối đa 3 file mỗi đơn');
select throws_ok(format('update public.request_attachments set file_name = %L where request_id = %L', 'x.pdf', current_setting('test.r3')), 'P0001', 'ATTACHMENT_IMMUTABLE', 'Không sửa file đã đính kèm');
select throws_ok(format('delete from public.request_attachments where request_id = %L', current_setting('test.r3')), 'P0001', 'ATTACHMENT_IMMUTABLE', 'Không xóa file đã đính kèm');

-- RLS
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.request_attachments where request_id = current_setting('test.r3')::uuid), 3, 'Người gửi thấy minh chứng của mình');
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-8000-000000000142","role":"authenticated"}', true);
select is((select count(*)::int from public.request_attachments where request_id = current_setting('test.r3')::uuid), 0, 'Nhân viên khác không thấy');
reset role;

select * from finish();
rollback;
