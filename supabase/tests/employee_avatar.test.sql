-- Ảnh đại diện: chỉ nhận đường dẫn đúng khuôn <tenant_id>/avatar-<uuid>.<ext> (không trỏ sang file khác trong bucket)
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_column('public', 'employees', 'avatar_path', 'Có cột ảnh đại diện');
select lives_ok($$ update public.employees set avatar_path = tenant_id || '/avatar-00000000-0000-4000-8000-000000000abc.jpg' where employee_code = 'HD0142' $$, 'Đường dẫn đúng khuôn được nhận');
select throws_ok($$ update public.employees set avatar_path = tenant_id || '/logo-00000000-0000-4000-8000-000000000abc.png' where employee_code = 'HD0142' $$, '23514', null, 'Đường dẫn sai khuôn bị chặn');

select * from finish();
rollback;
