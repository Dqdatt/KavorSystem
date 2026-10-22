-- API ghi/đọc dữ liệu bằng service_role (bỏ qua RLS, tự kiểm tra quyền nghiệp vụ và ghi audit).
-- Supabase đời mới không tự cấp quyền DML cho service_role trên bảng tạo bằng migration, nên cấp rõ ràng,
-- kể cả cho bảng tạo sau này.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
-- TRUNCATE bỏ qua trigger/RLS từng dòng: không cho client nào dùng
revoke truncate on all tables in schema public from service_role;
