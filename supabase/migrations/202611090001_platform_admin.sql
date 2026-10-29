-- Quản trị viên Kavor Console (platform_admin): mời / đổi vai trò / khóa nhân viên Kavor ngay trên Console, không cần chạy lệnh.
-- Người đầu tiên: API cho email cấu hình CONSOLE_BOOTSTRAP_EMAIL tự kích hoạt (OTP email) khi nền tảng chưa có quản trị viên nào.
-- Mọi thao tác đi qua API (service role); client không đọc được các bảng nền tảng.

alter table public.platform_operators drop constraint platform_operators_role_check;
alter table public.platform_operators add constraint platform_operators_role_check
  check (role in ('platform_admin','platform_operator','platform_support'));

-- Lời mời nhân viên Kavor: người được mời tự đặt mật khẩu bằng mã OTP gửi về email (không ai biết mật khẩu của người khác)
create table public.platform_operator_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role text not null check (role in ('platform_admin','platform_operator','platform_support')),
  invited_by uuid not null references public.platform_operators(user_id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  decided_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index platform_operator_invites_one_pending on public.platform_operator_invites (email) where status = 'pending';

-- Lời mời chỉ chuyển pending → accepted/revoked; nội dung không đổi sau khi tạo (trừ lần gửi thư gần nhất)
create function public.platform_invite_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then raise exception 'Lời mời đã % — không sửa được', old.status using errcode = '23514'; end if;
  if new.email <> old.email or new.full_name <> old.full_name or new.role <> old.role or new.invited_by <> old.invited_by or new.expires_at <> old.expires_at then
    raise exception 'Không sửa nội dung lời mời; thu hồi rồi mời lại' using errcode = '23514';
  end if;
  if new.status <> 'pending' then new.decided_at := now(); end if;
  return new;
end $$;
create trigger platform_invite_guard before update on public.platform_operator_invites for each row execute function public.platform_invite_guard();

-- Nền tảng không được mất quản trị viên cuối cùng (đổi vai trò, khóa hoặc xóa người quản trị đang hoạt động cuối cùng)
create function public.platform_keep_admin() returns trigger language plpgsql as $$
begin
  if old.role = 'platform_admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'platform_admin' or new.status <> 'active')
     and not exists (select 1 from public.platform_operators where role = 'platform_admin' and status = 'active' and user_id <> old.user_id) then
    raise exception 'Phải còn ít nhất một quản trị viên Kavor Console đang hoạt động' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger platform_keep_admin before update or delete on public.platform_operators for each row execute function public.platform_keep_admin();

alter table public.platform_operator_invites enable row level security;
grant select, insert, update on public.platform_operator_invites to service_role;
