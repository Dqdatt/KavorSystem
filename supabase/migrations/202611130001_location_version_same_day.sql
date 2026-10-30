-- Sửa địa điểm chấm công ngay trong ngày hiệu lực: cho phép nhiều phiên bản cùng effective_from, phiên bản số lớn hơn thắng
-- (API chỉ cho thêm khi chưa có lần chấm công nào dùng địa điểm từ ngày đó). Phiên bản vẫn bất biến: bản bị thay giữ lại làm lịch sử.
alter table public.work_location_versions drop constraint work_location_versions_location_id_effective_from_key;
create index work_location_versions_location_date_idx on public.work_location_versions (location_id, effective_from, version_no desc);
