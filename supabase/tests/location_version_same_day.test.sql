-- Phiên bản địa điểm cùng ngày hiệu lực: được thêm (bản số lớn hơn thay bản cũ), nhưng vẫn bất biến và không trùng số phiên bản.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.work_locations (id, tenant_id, code, name)
values ('70000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001', 'TEST-SD', 'Thử cùng ngày');
insert into public.work_location_versions (tenant_id, location_id, version_no, latitude, longitude, radius_m, max_accuracy_m, effective_from)
values ('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-0000000000e1', 1, 10.75, 106.60, 50, 60, '2026-10-30');

select lives_ok($$insert into public.work_location_versions (tenant_id, location_id, version_no, latitude, longitude, radius_m, max_accuracy_m, effective_from)
  values ('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-0000000000e1', 2, 10.751, 106.601, 200, 60, '2026-10-30')$$,
  'Thêm phiên bản thứ hai cùng ngày hiệu lực');
select throws_ok($$insert into public.work_location_versions (tenant_id, location_id, version_no, latitude, longitude, radius_m, max_accuracy_m, effective_from)
  values ('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-0000000000e1', 2, 10.75, 106.60, 80, 60, '2026-10-31')$$,
  '23505', null, 'Số phiên bản vẫn không được trùng');
select throws_ok($$update public.work_location_versions set radius_m = 300 where location_id = '70000000-0000-4000-8000-0000000000e1' and version_no = 1$$,
  null, null, 'Phiên bản bị thay vẫn không sửa được');
select is((select count(*)::int from public.work_location_versions where location_id = '70000000-0000-4000-8000-0000000000e1'), 2,
  'Bản bị thay vẫn còn làm lịch sử');

select * from finish();
rollback;
