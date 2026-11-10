-- Danh mục giấy tờ hồ sơ (docs/plans/payroll-tenant-rules.md mục 4). Luật không có danh mục bắt buộc → mỗi công ty tự khai; HR chỉ tích
-- nhân viên đã nộp gì. BLLĐ 2019 Điều 17 cấm giữ bản chính → chỉ ghi "nộp bản sao" / "đã đối chiếu bản chính". Luật BVDLCN 2025: mỗi mục ghi
-- mục đích thu thập. Ghi qua API (service role); client chỉ đọc theo RLS.
-- 1. document_checklist_items: tên, bắt buộc, áp dụng cho tình trạng lao động nào (null = mọi người), mục đích, thứ tự; ngừng dùng thay cho xóa.
-- 2. employee_checklist_status: nhân viên × mục → submitted (hình thức, ngày nộp) | waived (không áp dụng, có lý do). Không có dòng = chưa nộp.
--    Bỏ tích = xóa dòng (API ghi nhật ký checklist.*).

create table public.document_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  required boolean not null default true,
  employment_types text[] check (employment_types is null or (cardinality(employment_types) between 1 and 4
    and employment_types <@ array['probation','official','contractor','intern'])),
  purpose text check (purpose is null or length(purpose) <= 200),
  sort_order int not null default 0 check (sort_order between 0 and 10000),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index document_checklist_items_name_uq on public.document_checklist_items (tenant_id, lower(trim(name))) where archived_at is null;
create index document_checklist_items_tenant_idx on public.document_checklist_items (tenant_id, sort_order);

create table public.employee_checklist_status (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  item_id uuid not null references public.document_checklist_items(id) on delete restrict,
  status text not null check (status in ('submitted','waived')),
  -- copy: nộp bản sao · original_checked: đã đối chiếu bản chính (không giữ bản chính — BLLĐ Điều 17)
  form text check (form in ('copy','original_checked')),
  submitted_on date,
  note text check (note is null or length(note) <= 200),
  document_id uuid references public.employee_documents(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (employee_id, item_id),
  check ((status = 'submitted' and form is not null and submitted_on is not null) or (status = 'waived' and form is null and length(trim(coalesce(note, ''))) > 0))
);
create index employee_checklist_status_tenant_idx on public.employee_checklist_status (tenant_id, item_id);

alter table public.document_checklist_items enable row level security;
alter table public.employee_checklist_status enable row level security;
create policy document_checklist_items_read on public.document_checklist_items for select to authenticated using (public.is_active_member(tenant_id));
create policy employee_checklist_status_read on public.employee_checklist_status for select to authenticated
  using (public.can_read_employee('document.read', tenant_id, employee_id)
    or employee_id in (select public.current_employee_ids()));
grant select on public.document_checklist_items, public.employee_checklist_status to authenticated;
grant select, insert, update on public.document_checklist_items to service_role;
grant select, insert, update, delete on public.employee_checklist_status to service_role;
