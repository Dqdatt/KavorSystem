#!/bin/bash
# Bộ dữ liệu lớn (thử trần 1.000 dòng PostgREST, dùng lại cho chạy thử trọn vòng Đợt 5): N nhân viên (mặc định 120, mã SC0001…)
# ở công ty mẫu Hải Đăng, vào làm 01/01/2025, chấm công đủ mọi thứ 2–6 (trừ ngày lễ) của kỳ công TRƯỚC (đã kết thúc → khóa được),
# vào 07:45 ra 17:45. Lịch sử đủ lớn để vượt 1.000 dòng: mỗi người 10 phiên bản lương (bản cuối 10.900.000 ₫ từ 01/10/2025);
# người số chẵn đổi phân công hằng tháng 20 lần (01/2025 → 08/2026), người số lẻ giữ một phân công từ 01/01/2025.
#   bash tools/db-reset.sh && bash tools/scale-data.sh [N]    # in ra tháng của kỳ đã sinh (YYYY-MM)
# Không chạy lại trên cùng DB (trùng mã nhân viên).
set -euo pipefail
N=${1:-120}
docker exec -i supabase_db_kavor-system psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atq -v n="$N" <<'SQL'
\set tid '10000000-0000-4000-8000-000000000001'
create temp table sc as
  select g, ('6c000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid as id, 'SC' || lpad(g::text, 4, '0') as code from generate_series(1, :n) g;
-- Kỳ công trước của tenant (ngày bắt đầu kỳ theo cài đặt, Hải Đăng 26): [s, e]
create temp table per as
  with t as (select public.tenant_today(:'tid') as today,
    coalesce((select (attendance_settings->>'periodStartDay')::int from public.tenant_settings where tenant_id = :'tid'), 1) as sd),
  cur as (select case when extract(day from today) >= sd then date_trunc('month', today)::date + (sd - 1)
                      else (date_trunc('month', today) - interval '1 month')::date + (sd - 1) end as s from t)
  select (s - interval '1 month')::date as s, s - 1 as e from cur;

insert into public.employees (id, tenant_id, employee_code, full_name, work_email, hire_date, employment_type, status, source_system)
select id, :'tid', code, 'Nhân viên thử ' || code, lower(code) || '@scale.test', date '2025-01-01', 'official', 'active', 'kavor' from sc;

-- Phân công: số lẻ một bản từ 01/01/2025; số chẵn 20 bản theo tháng, bản cuối đang hiệu lực
insert into public.employee_assignments (tenant_id, employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from, effective_to)
select :'tid', sc.id, '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000006',
  '50000000-0000-4000-8000-000000000008', null, f, case when sc.g % 2 = 0 and k < 19 then (f + interval '1 month')::date - 1 end
from sc cross join lateral generate_series(0, case when sc.g % 2 = 0 then 19 else 0 end) k
cross join lateral (select (date '2025-01-01' + make_interval(months => k))::date as f) x;

insert into public.employee_compensations (tenant_id, employee_id, base_salary, effective_from, note)
select :'tid', sc.id, 10000000 + k * 100000, (date '2025-01-01' + make_interval(months => k))::date, 'Dữ liệu thử trần 1.000 dòng'
from sc cross join generate_series(0, 9) k;

insert into public.attendance_events (tenant_id, employee_id, kind, client_event_id, occurred_at, received_at, status, location_id, latitude, longitude, accuracy_m, distance_m)
select :'tid', sc.id, k.kind, 'scale-' || sc.code || '-' || d || '-' || k.kind,
  (d + k.t) at time zone 'Asia/Ho_Chi_Minh', (d + k.t) at time zone 'Asia/Ho_Chi_Minh', 'accepted',
  '70000000-0000-4000-8000-000000000001', 10.774390, 106.703940, 8, 4
from sc cross join per cross join generate_series(per.s, per.e, interval '1 day') g(d0)
cross join lateral (select d0::date as d) dd
cross join (values ('in', time '07:45'), ('out', time '17:45')) k(kind, t)
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.holidays h join public.holiday_calendars c on c.id = h.calendar_id
                  where h.holiday_date = d and (c.tenant_id is null or c.tenant_id = :'tid'));

select to_char(e, 'YYYY-MM') from per;
SQL
