-- Tham số luật tính lương do Kavor duy trì (ADR 0001: luật nhà nước Kavor cập nhật, công ty không tự nhập). Mỗi phiên bản có ngày hiệu lực,
-- tra theo ngày. Phiên bản đã/đang hiệu lực bất biến (sửa = tạo phiên bản mới); phiên bản tương lai sửa/xóa được. Mọi người dùng đăng nhập đọc
-- được (thông tin công khai); ghi qua API Console (service role). params: xem apps/api/src/payroll/law.ts (kiểm tra cấu trúc ở API).

create table public.payroll_law_versions (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  -- Nguồn từng mục: [{ item, ref, verified }]; verified=false = cần đối chiếu văn bản gốc (hiện cảnh báo ở Console/khi tính)
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  note text check (length(note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payroll_law_versions enable row level security;
create policy payroll_law_versions_read on public.payroll_law_versions for select to authenticated using (true);
grant select on public.payroll_law_versions to authenticated;

create or replace function public.payroll_law_versions_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.effective_from <= current_date then raise exception 'PAYROLL_LAW_IMMUTABLE' using errcode = 'P0001'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger payroll_law_versions_guard before update or delete on public.payroll_law_versions
  for each row when (coalesce(current_setting('kavor.purge_tenant', true), '') = '') execute function public.payroll_law_versions_guard();

-- Phiên bản ban đầu (đối chiếu 08/11/2026 qua thuvienphapluat.vn, lsvn.vn, luatvietnam.vn; thuế suất biểu 5 bậc cần đối chiếu Điều 9 Luật 109/2025/QH15)
insert into public.payroll_law_versions (effective_from, params, sources, note) values
('2026-01-01', '{
  "baseSalary": 2340000,
  "regionMinWage": {"1": 5310000, "2": 4730000, "3": 4140000, "4": 3700000},
  "employee": {"si": 0.08, "hi": 0.015, "ui": 0.01},
  "employer": {"si": 0.175, "hi": 0.03, "ui": 0.01},
  "capMultiplier": {"siHi": 20, "ui": 20},
  "deduction": {"self": 15500000, "dependent": 6200000},
  "pit": [{"upTo": 10000000, "rate": 0.05}, {"upTo": 30000000, "rate": 0.10}, {"upTo": 60000000, "rate": 0.20}, {"upTo": 100000000, "rate": 0.30}, {"upTo": null, "rate": 0.35}],
  "casual": {"rate": 0.10, "threshold": 2000000},
  "union": {"employee": 0.01, "employeeCapOfBase": 0.10, "employer": 0.02}
}', '[
  {"item": "Lương cơ sở", "ref": "Nghị định 73/2024/NĐ-CP (2.340.000 từ 01/07/2024)", "verified": true},
  {"item": "Lương tối thiểu vùng", "ref": "Nghị định 293/2025/NĐ-CP (từ 01/01/2026)", "verified": true},
  {"item": "Tỷ lệ BHXH/BHYT/BHTN", "ref": "Luật BHXH 2024, Luật Việc làm, Luật BHYT: NLĐ 8%/1,5%/1%; DN 17,5% (14% hưu trí-tử tuất, 3% ốm đau-thai sản, 0,5% TNLĐ-BNN)/3%/1%", "verified": true},
  {"item": "Trần đóng", "ref": "BHXH/BHYT 20 lần mức tham chiếu (= lương cơ sở); BHTN 20 lần lương tối thiểu vùng", "verified": true},
  {"item": "Giảm trừ gia cảnh", "ref": "Nghị quyết 110/2025/UBTVQH15 (15,5 triệu / 6,2 triệu từ kỳ tính thuế 2026)", "verified": true},
  {"item": "Biểu thuế lũy tiến 5 bậc", "ref": "Luật Thuế TNCN 109/2025/QH15: mốc 10/30/60/100 triệu; thuế suất 5/10/20/30/35% — các nguồn tin lệch nhau, cần đối chiếu Điều 9 văn bản gốc", "verified": false},
  {"item": "Khấu trừ 10% (hợp đồng dưới 3 tháng)", "ref": "Thông tư 111/2013/TT-BTC: từ 2.000.000 ₫/lần trở lên — cần đối chiếu ngưỡng theo luật mới", "verified": false},
  {"item": "Đoàn phí", "ref": "Luật Công đoàn 2024: DN 2% quỹ lương đóng BHXH; đoàn viên 1% (tối đa 10% lương cơ sở)", "verified": true}
]', 'Phiên bản đầu tiên do Kavor nhập'),
('2026-07-01', '{
  "baseSalary": 2530000,
  "regionMinWage": {"1": 5310000, "2": 4730000, "3": 4140000, "4": 3700000},
  "employee": {"si": 0.08, "hi": 0.015, "ui": 0.01},
  "employer": {"si": 0.175, "hi": 0.03, "ui": 0.01},
  "capMultiplier": {"siHi": 20, "ui": 20},
  "deduction": {"self": 15500000, "dependent": 6200000},
  "pit": [{"upTo": 10000000, "rate": 0.05}, {"upTo": 30000000, "rate": 0.10}, {"upTo": 60000000, "rate": 0.20}, {"upTo": 100000000, "rate": 0.30}, {"upTo": null, "rate": 0.35}],
  "casual": {"rate": 0.10, "threshold": 2000000},
  "union": {"employee": 0.01, "employeeCapOfBase": 0.10, "employer": 0.02}
}', '[
  {"item": "Lương cơ sở", "ref": "Nghị định 161/2026/NĐ-CP (2.530.000 từ 01/07/2026; trần BHXH 50,6 triệu)", "verified": true},
  {"item": "Lương tối thiểu vùng", "ref": "Nghị định 293/2025/NĐ-CP", "verified": true},
  {"item": "Biểu thuế lũy tiến 5 bậc", "ref": "Luật Thuế TNCN 109/2025/QH15 — cần đối chiếu Điều 9 văn bản gốc", "verified": false},
  {"item": "Khấu trừ 10% (hợp đồng dưới 3 tháng)", "ref": "Cần đối chiếu ngưỡng theo luật mới", "verified": false}
]', 'Lương cơ sở mới từ 01/07/2026');
