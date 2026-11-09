-- Kavor tính kỳ lương (docs/plans/payroll-calc.md phần 2): cài đặt lương do từng công ty chọn. Khoản phụ cấp/thưởng, công chuẩn, lương từng người
-- đã cấu hình theo công ty ở bảng khác; ở đây chỉ thêm: vùng lương tối thiểu, cách xử lý thử việc. Kết quả tính ghi qua record_payroll_import +
-- replace_payroll_results như nhập file (giữ luồng duyệt/công bố/phiếu lương).
alter table public.tenant_settings add column payroll_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(payroll_settings) = 'object');
comment on column public.tenant_settings.payroll_settings is '{ region: 1–4, probation: "insured" | "withholding" }';
-- API tạo thành phần lương còn thiếu (BASE, INS_*, PIT, ITEM_…) khi ghi kết quả tính, sau khi đã kiểm quyền nhập kỳ lương
grant select, insert on public.pay_components to service_role;
