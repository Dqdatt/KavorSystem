-- Sửa tham số luật lương sau rà soát 10/11/2026 (docs/plans/payroll-law-research-2026-11.md). Hai phiên bản 2026 đã hiệu lực nên trigger không cho
-- sửa; đây là sửa dữ liệu có chủ đích (nhập sai từ đầu, không phải luật đổi) nên tạm tắt guard trong migration này.
--  1. Đoàn phí người lao động 0,5% lương đóng BHXH (QĐ 61/QĐ-TLĐ, từ 01/07/2025), trần 10% lương cơ sở giữ nguyên.
--  2. Ngưỡng khấu trừ 10% (không HĐ / HĐ dưới 3 tháng) 5.000.000/lần từ 01/07/2026 (NĐ 253/2026/NĐ-CP khoản 2 Điều 50); trước đó 2.000.000.
--  3. Tham số mới: taxFree.meal = mức miễn thuế tiền ăn giữa ca/tháng (730.000 → 1.200.000 từ 01/07/2026, NĐ 253/2026);
--     overtimeTaxFree = 'full' (Luật 109/2025: tiền lương làm thêm giờ/làm đêm miễn thuế toàn bộ trong giới hạn giờ của luật lao động, kỳ tính
--     thuế 2026) hoặc 'premium' (luật cũ: chỉ phần cao hơn giờ thường).
--  4. pay_items.tax_mode thêm 'meal' (ăn giữa ca, miễn đến mức luật Kavor duy trì) — khoản "partial" mức 730.000 hoặc tên ăn trưa/ăn ca chuyển sang.

alter table public.payroll_law_versions disable trigger payroll_law_versions_guard;

update public.payroll_law_versions set
  params = jsonb_set(jsonb_set(params, '{union,employee}', '0.005'), '{taxFree}', '{"meal": 730000}') || '{"overtimeTaxFree": "full"}',
  sources = '[
    {"item": "Lương cơ sở", "ref": "Nghị định 73/2024/NĐ-CP (2.340.000 từ 01/07/2024)", "verified": true},
    {"item": "Lương tối thiểu vùng", "ref": "Nghị định 293/2025/NĐ-CP (từ 01/01/2026)", "verified": true},
    {"item": "Tỷ lệ BHXH/BHYT/BHTN", "ref": "Luật BHXH 2024, Luật Việc làm, Luật BHYT: NLĐ 8%/1,5%/1%; DN 17,5% (14% hưu trí-tử tuất, 3% ốm đau-thai sản, 0,5% TNLĐ-BNN)/3%/1%", "verified": true},
    {"item": "Trần đóng", "ref": "BHXH/BHYT 20 lần mức tham chiếu (= lương cơ sở); BHTN 20 lần lương tối thiểu vùng", "verified": true},
    {"item": "Giảm trừ gia cảnh", "ref": "Nghị quyết 110/2025/UBTVQH15 (15,5 triệu / 6,2 triệu từ kỳ tính thuế 2026)", "verified": true},
    {"item": "Biểu thuế lũy tiến 5 bậc", "ref": "Luật Thuế TNCN 109/2025/QH15: 5/10/20/30/35% tại mốc 10/30/60/100 triệu (áp dụng kỳ tính thuế 2026 với tiền lương)", "verified": true},
    {"item": "Khấu trừ 10% (không HĐ / HĐ dưới 3 tháng)", "ref": "Thông tư 111/2013/TT-BTC: từ 2.000.000 ₫/lần (đến 30/06/2026)", "verified": true},
    {"item": "Miễn thuế tiền ăn trưa, ăn ca", "ref": "730.000 ₫/tháng (trước NĐ 253/2026)", "verified": true},
    {"item": "Miễn thuế làm thêm giờ, làm đêm", "ref": "Luật 109/2025/QH15 + NĐ 253/2026 Điều 26: miễn toàn bộ trong giới hạn giờ của luật lao động, kỳ tính thuế 2026 — các bài diễn giải chưa thống nhất", "verified": false},
    {"item": "Đoàn phí", "ref": "QĐ 61/QĐ-TLĐ (từ 01/07/2025): đoàn viên DN ngoài nhà nước 0,5% lương đóng BHXH, tối đa 10% lương cơ sở; DN 2% quỹ lương đóng BHXH (Luật Công đoàn 2024)", "verified": true}
  ]',
  note = 'Phiên bản đầu tiên do Kavor nhập; sửa 10/11/2026: đoàn phí 0,5%, thêm miễn thuế ăn giữa ca và làm thêm giờ',
  updated_at = now()
where effective_from = '2026-01-01';

update public.payroll_law_versions set
  params = jsonb_set(jsonb_set(jsonb_set(params, '{union,employee}', '0.005'), '{casual,threshold}', '5000000'), '{taxFree}', '{"meal": 1200000}') || '{"overtimeTaxFree": "full"}',
  sources = '[
    {"item": "Lương cơ sở", "ref": "Nghị định 161/2026/NĐ-CP (2.530.000 từ 01/07/2026; trần BHXH 50,6 triệu)", "verified": true},
    {"item": "Lương tối thiểu vùng", "ref": "Nghị định 293/2025/NĐ-CP", "verified": true},
    {"item": "Biểu thuế lũy tiến 5 bậc", "ref": "Luật Thuế TNCN 109/2025/QH15: 5/10/20/30/35% tại mốc 10/30/60/100 triệu", "verified": true},
    {"item": "Khấu trừ 10% (không HĐ / HĐ dưới 3 tháng)", "ref": "NĐ 253/2026/NĐ-CP khoản 2 Điều 50: từ 5.000.000 ₫/lần; dưới mức chỉ khấu trừ khi cá nhân yêu cầu (một nguồn ghi hiệu lực 01/01/2026 — cần văn bản gốc)", "verified": false},
    {"item": "Miễn thuế tiền ăn trưa, ăn ca", "ref": "NĐ 253/2026/NĐ-CP: 1.200.000 ₫/tháng; bữa ăn do DN tự nấu/mua suất/phiếu ăn không tính", "verified": true},
    {"item": "Miễn thuế làm thêm giờ, làm đêm", "ref": "Luật 109/2025/QH15 + NĐ 253/2026 Điều 26: miễn toàn bộ trong giới hạn giờ của luật lao động — các bài diễn giải chưa thống nhất", "verified": false},
    {"item": "Đoàn phí", "ref": "QĐ 61/QĐ-TLĐ: 0,5% lương đóng BHXH, tối đa 10% lương cơ sở", "verified": true}
  ]',
  note = 'Lương cơ sở mới từ 01/07/2026; sửa 10/11/2026: đoàn phí 0,5%, ngưỡng khấu trừ 10% 5 triệu, miễn thuế ăn giữa ca 1,2 triệu và làm thêm giờ',
  updated_at = now()
where effective_from = '2026-07-01';

-- Phiên bản do Console tạo sau này (nếu có) chưa có tham số mới: điền theo phiên bản 01/07/2026
update public.payroll_law_versions set
  params = params || jsonb_build_object('taxFree', coalesce(params->'taxFree', '{"meal": 1200000}'::jsonb), 'overtimeTaxFree', coalesce(params->'overtimeTaxFree', '"full"'::jsonb))
where effective_from > '2026-07-01' and (params->'taxFree' is null or params->'overtimeTaxFree' is null);

alter table public.payroll_law_versions enable trigger payroll_law_versions_guard;

-- pay_items: thêm tax_mode 'meal'
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.pay_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tax_mode%' loop
    execute format('alter table public.pay_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.pay_items add constraint pay_items_tax_mode_check check (tax_mode in ('taxable','exempt','partial','meal'));
alter table public.pay_items add constraint pay_items_tax_cap_check check (tax_mode = 'partial' or tax_free_cap is null);

update public.pay_items set tax_mode = 'meal', tax_free_cap = null, updated_at = now()
where tax_mode = 'partial' and (tax_free_cap = 730000 or name ~* '(ăn\s*(trưa|ca|giữa\s*ca))|(cơm\s*trưa)');
