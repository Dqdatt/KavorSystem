-- Minh chứng đính kèm đơn giải trình / nghỉ phép (docs/plans/request-attachments.md).
-- Nhân viên tải lên khi đơn đang chờ (tối đa 3 file PDF/ảnh ≤ 5 MB); file bất biến, không xóa (hủy đơn nếu nhầm).
-- File nằm ở bucket riêng tư `request-attachments/<tenantId>/…`, chỉ API đọc/ghi; người xem: người gửi, quản lý được giao duyệt,
-- người có request.read trong phạm vi. Đơn nghỉ cần minh chứng (policy_snapshot.attachmentRequired) không duyệt được bước cuối khi chưa có file.

create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status text not null default 'not_scanned' check (scan_status in ('not_scanned','clean','infected')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index request_attachments_request_idx on public.request_attachments (request_id, created_at);

-- Chỉ thêm vào đơn giải trình/nghỉ đang chờ của cùng tenant, tối đa 3 file; khóa dòng đơn để hai lần tải cùng lúc không vượt 3
create or replace function public.request_attachments_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare r public.requests;
begin
  select * into r from public.requests where id = new.request_id for update;
  if r.id is null or r.tenant_id <> new.tenant_id then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.request_type not in ('explanation','leave') then raise exception 'ATTACHMENT_NOT_ALLOWED' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001'; end if;
  if (select count(*) from public.request_attachments where request_id = new.request_id) >= 3 then
    raise exception 'ATTACHMENT_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger request_attachments_insert_guard before insert on public.request_attachments for each row
  when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.request_attachments_insert_guard();

create or replace function public.request_attachments_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'ATTACHMENT_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger request_attachments_immutable before update or delete on public.request_attachments for each row
  when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.request_attachments_immutable();

-- Chặn duyệt bước cuối của đơn cần minh chứng mà chưa có file (kể cả khi gọi decide_approval trực tiếp)
create or replace function public.request_attachment_missing(p_request uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((v.policy_snapshot->>'attachmentRequired')::boolean, false)
    and not exists (select 1 from public.request_attachments a where a.request_id = r.id)
  from public.requests r join public.request_versions v on v.request_id = r.id and v.version_no = r.current_version
  where r.id = p_request;
$$;
revoke all on function public.request_attachment_missing(uuid) from public, anon, authenticated;
grant execute on function public.request_attachment_missing(uuid) to service_role;

create or replace function public.approval_tasks_attachment_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status = 'pending'
    and not exists (select 1 from public.approval_tasks t where t.request_id = new.request_id and t.step_no > new.step_no and t.status = 'waiting')
    and coalesce(public.request_attachment_missing(new.request_id), false) then
    raise exception 'ATTACHMENT_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger approval_tasks_attachment_guard before update on public.approval_tasks for each row
  when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.approval_tasks_attachment_guard();

-- Client không đọc trực tiếp (đi qua API), nhưng bảng mới vẫn bật RLS: cùng quyền đọc với đơn
alter table public.request_attachments enable row level security;
create policy request_attachments_read on public.request_attachments for select to authenticated using (public.can_read_request(request_id));
grant select on public.request_attachments to authenticated;
grant select, insert on public.request_attachments to service_role;
