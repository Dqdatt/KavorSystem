-- Cấp quản lý của chức danh: chỉ 1–4 hoặc trống; công ty mới từ mẫu có Ban Giám đốc 4, Quản lý 3, Nhân viên 1, Quản trị viên để trống.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select throws_ok($$ update public.positions set management_tier = 5 where tenant_id = '10000000-0000-4000-8000-000000000001' $$, '23514', null, 'Cấp quản lý ngoài 1–4 bị chặn');
insert into public.tenants (id, code, display_name) values ('10000000-0000-4000-8000-0000000000e7', 'TEST-TIER', 'Thử cấp quản lý');
select public.provision_tenant('10000000-0000-4000-8000-0000000000e7');
select is((select string_agg(code || ':' || coalesce(management_tier::text, '-'), ',' order by code) from public.positions where tenant_id = '10000000-0000-4000-8000-0000000000e7'),
  'BGD:4,NV:1,QL:3,QTV:-', 'Công ty mới có chức danh mẫu kèm cấp quản lý');
select is((select management_tier from public.positions where tenant_id = '10000000-0000-4000-8000-000000000001' and code = 'CEO'), 4::smallint, 'Dữ liệu mẫu: Tổng Giám đốc ở cấp Ban Giám đốc');

select * from finish();
rollback;
