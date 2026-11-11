-- Quy chế lương theo công ty có phiên bản theo ngày hiệu lực (ADR 0001; docs/plans/payroll-tenant-rules.md mục 3). Thay tenant_settings.payroll_settings
-- (giữ cột cũ, API không đọc nữa). Tra phiên bản hiệu lực vào ngày cuối kỳ lương; kỳ đã tính lưu ảnh chụp cấu hình đã dùng.
-- settings (API kiểm cấu trúc — apps/api/src/admin/settings.service.ts payrollConfigOf):
--   region 1–4 · probationRate 0.85–1 (BLLĐ 2019 Điều 26: ít nhất 85%) · probationAllowances (thử việc có dòng phụ cấp riêng không)
--   probationContract 'separate' (HĐ thử việc riêng: không BH, khấu trừ 10%) | 'in_contract' (thử việc trong HĐLĐ: đóng BH, lũy tiến) — mặc định điền sẵn
--   unionFee { collect: có thu đoàn phí qua lương, rate: null = theo tham số luật | tỷ lệ riêng } · prorate 'total' | 'per_item'
-- employee_tax_profiles thêm: hình thức thử việc của từng người (null = theo quy chế), cam kết 08/CK-TNCN, yêu cầu khấu trừ dưới ngưỡng.

create table public.payroll_policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  effective_from date not null,
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, effective_from)
);
alter table public.payroll_policy_versions enable row level security;
create policy payroll_policy_versions_read on public.payroll_policy_versions for select to authenticated using (public.is_active_member(tenant_id));
grant select on public.payroll_policy_versions to authenticated;
grant select, insert, update on public.payroll_policy_versions to service_role;

-- Phiên bản đầu cho công ty đang có: giữ vùng + cách xử lý thử việc cũ, thêm mặc định mới (85% lương cứng, không phụ cấp, thu đoàn phí theo luật, chia trên tổng)
insert into public.payroll_policy_versions (tenant_id, effective_from, settings)
select t.id, date '2026-01-01', jsonb_build_object(
  'region', coalesce((s.payroll_settings->>'region')::int, 1),
  'probationRate', 0.85, 'probationAllowances', false,
  'probationContract', case when s.payroll_settings->>'probation' = 'insured' then 'in_contract' else 'separate' end,
  'unionFee', jsonb_build_object('collect', true, 'rate', null),
  'prorate', 'total')
from public.tenants t left join public.tenant_settings s on s.tenant_id = t.id
on conflict do nothing;

alter table public.employee_tax_profiles
  add column probation_contract text check (probation_contract is null or probation_contract in ('separate','in_contract')),
  add column commitment_08 boolean not null default false,
  add column withholding_requested boolean not null default false;
