-- Ảnh đại diện nhân viên: file trong bucket riêng tư `tenant-branding` (thư mục <tenant_id>/, API service role ghi/đọc), cột chỉ giữ đường dẫn.
-- Nhân viên tự đổi trên app qua API (POST /me/avatar); xóa doanh nghiệp thì purge_tenant xóa cả thư mục <tenant_id>/.
alter table public.employees add column if not exists avatar_path text
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/avatar-[0-9a-f-]{36}\.(png|jpg|webp)$');
comment on column public.employees.avatar_path is 'Đường dẫn ảnh đại diện trong bucket tenant-branding; phiên bản ảnh = đoạn ngẫu nhiên trong tên file';
