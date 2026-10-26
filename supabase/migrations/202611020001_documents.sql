-- Tài liệu nhân sự (docs/plans/documents.md): mỗi tài liệu gắn một nhân viên; mỗi lần thay file là phiên bản mới, bất biến.
-- File nằm ở Storage riêng tư (API đọc/ghi), DB giữ metadata + SHA-256. Gỡ tài liệu (có lý do) thay cho xóa. Quyền xem:
-- "HR + Nhân viên" hoặc "Chỉ HR". Không làm chữ ký số. Chưa có dịch vụ quét virus: phiên bản ghi scan_status = not_scanned.

-- ---------- 1. Permission ----------
insert into public.permissions (code, module, description) values
  ('document.self.read','document','Xem/tải tài liệu của chính mình được HR chia sẻ'),
  ('document.read','document','Xem/tải tài liệu nhân sự trong phạm vi'),
  ('document.upload','document','Tải tài liệu và phiên bản mới cho nhân viên trong phạm vi'),
  ('document.manage','document','Sửa thông tin, gỡ tài liệu nhân sự trong phạm vi')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = any (case r.code
  when 'employee' then array['document.self.read']
  when 'hr_ops' then array['document.read','document.upload','document.manage']
  when 'tenant_admin' then array['document.read','document.upload','document.manage']
end)
where r.tenant_id is null and r.is_system and r.code in ('employee','hr_ops','tenant_admin')
on conflict do nothing;

-- ---------- 2. Bảng ----------
create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  category text not null check (category in ('contract','appendix','decision','personal','insurance','other')),
  title text not null check (length(trim(title)) between 1 and 200),
  doc_no text check (length(doc_no) between 1 and 80),
  issued_on date,
  expires_on date,
  visibility text not null default 'hr_employee' check (visibility in ('hr_employee','hr_only')),
  current_version_id uuid,
  version_count integer not null default 0 check (version_count >= 0),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete restrict,
  archive_reason text check (length(archive_reason) between 5 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (expires_on is null or issued_on is null or expires_on >= issued_on),
  check ((archived_at is null) = (archive_reason is null))
);
create index employee_documents_employee_idx on public.employee_documents (tenant_id, employee_id);
create index employee_documents_expiry_idx on public.employee_documents (tenant_id, expires_on) where archived_at is null and expires_on is not null;

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_id uuid not null,
  version_no integer not null check (version_no >= 1),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status text not null default 'not_scanned' check (scan_status in ('not_scanned','clean','infected')),
  note text check (length(note) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_id, version_no),
  unique (tenant_id, id),
  foreign key (tenant_id, document_id) references public.employee_documents(tenant_id, id) on delete restrict
);
alter table public.employee_documents add constraint employee_documents_current_version_fk
  foreign key (tenant_id, current_version_id) references public.document_versions(tenant_id, id) deferrable initially deferred;

-- Tài liệu không xóa (chỉ gỡ), đã gỡ không sửa, không đổi nhân viên; phiên bản bất biến
create or replace function public.employee_documents_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'DOCUMENT_IMMUTABLE' using errcode = 'P0001'; end if;
  if new.tenant_id <> old.tenant_id or new.employee_id <> old.employee_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'DOCUMENT_IMMUTABLE' using errcode = 'P0001';
  end if;
  if old.archived_at is not null then raise exception 'DOCUMENT_ARCHIVED' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger employee_documents_guard before update or delete on public.employee_documents for each row execute function public.employee_documents_guard();

create or replace function public.document_versions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'DOCUMENT_VERSION_IMMUTABLE' using errcode = 'P0001';
end;
$$;
create trigger document_versions_guard before update or delete on public.document_versions for each row execute function public.document_versions_guard();

-- ---------- 3. Ghi (API gọi bằng service role với người dùng đã xác thực; SQL kiểm lại phạm vi) ----------
-- p_version = {"storagePath","fileName","mimeType","sizeBytes","sha256","note"}
create or replace function public.add_document_version_row(p_doc public.employee_documents, p_user uuid, p_version jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  vid uuid;
  n integer := p_doc.version_count + 1;
begin
  insert into public.document_versions (tenant_id, document_id, version_no, storage_path, file_name, mime_type, size_bytes, sha256, note, created_by)
  values (p_doc.tenant_id, p_doc.id, n, p_version->>'storagePath', p_version->>'fileName', p_version->>'mimeType',
    (p_version->>'sizeBytes')::integer, p_version->>'sha256', nullif(trim(coalesce(p_version->>'note', '')), ''), p_user)
  returning id into vid;
  update public.employee_documents set current_version_id = vid, version_count = n, updated_by = p_user, updated_at = now() where id = p_doc.id;
  return vid;
end;
$$;

create or replace function public.create_employee_document(p_tenant uuid, p_user uuid, p_employee uuid, p_data jsonb, p_version jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.employee_documents;
begin
  if not public.employee_in_scope(p_user, p_tenant, 'document.upload', p_employee) then raise exception 'DOCUMENT_FORBIDDEN' using errcode = 'P0001'; end if;
  insert into public.employee_documents (tenant_id, employee_id, category, title, doc_no, issued_on, expires_on, visibility, created_by, updated_by)
  values (p_tenant, p_employee, p_data->>'category', trim(p_data->>'title'), nullif(trim(coalesce(p_data->>'docNo', '')), ''),
    (p_data->>'issuedOn')::date, (p_data->>'expiresOn')::date, coalesce(p_data->>'visibility', 'hr_employee'), p_user, p_user)
  returning * into d;
  perform public.add_document_version_row(d, p_user, p_version);
  return d.id;
end;
$$;

create or replace function public.add_document_version(p_tenant uuid, p_user uuid, p_document uuid, p_version jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.employee_documents;
begin
  select * into d from public.employee_documents where id = p_document and tenant_id = p_tenant for update;
  if not found or not public.employee_in_scope(p_user, p_tenant, 'document.upload', d.employee_id) then raise exception 'DOCUMENT_FORBIDDEN' using errcode = 'P0001'; end if;
  if d.archived_at is not null then raise exception 'DOCUMENT_ARCHIVED' using errcode = 'P0001'; end if;
  perform public.add_document_version_row(d, p_user, p_version);
  return d.version_count + 1;
end;
$$;

revoke all on function public.add_document_version_row(public.employee_documents, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_employee_document(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.add_document_version(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_employee_document(uuid, uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.add_document_version(uuid, uuid, uuid, jsonb) to service_role;

-- ---------- 4. RLS: client chỉ đọc; ghi qua API ----------
-- Nhân viên: tài liệu "HR + Nhân viên" chưa gỡ của chính mình; HR: theo phạm vi document.read
create or replace function public.can_read_document(p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.employee_documents d where d.id = p_document and (
      public.can_read_employee('document.read', d.tenant_id, d.employee_id)
      or (d.visibility = 'hr_employee' and d.archived_at is null and d.employee_id in (select public.current_employee_ids())
          and public.can_read_employee('document.self.read', d.tenant_id, d.employee_id))));
$$;
revoke all on function public.can_read_document(uuid) from public, anon;
grant execute on function public.can_read_document(uuid) to authenticated;

alter table public.employee_documents enable row level security;
alter table public.document_versions enable row level security;
create policy employee_documents_read on public.employee_documents for select to authenticated using (public.can_read_document(id));
create policy document_versions_read on public.document_versions for select to authenticated using (public.can_read_document(document_id));
grant select on public.employee_documents, public.document_versions to authenticated;
