# HANDOFF — 16/11/2026 (phiên 16)

**Mục tiêu phiên vừa rồi:** review toàn bộ dự án (RLS, lương/tạm ứng/auth, API, web, mobile) tìm lỗi và chỗ cải thiện — chỉ đọc, chưa sửa code.

## Đã xong
- `verify-all.sh` bản đầy đủ ĐẠT: typecheck, unit, pgTAP 656, 30 smoke, build, lint DB (2 cảnh báo 42804 ở `offboard_employee`/`pause_employee`, smoke vẫn đạt).
- 24 việc mới ghi cuối `docs/TASKS.md` (mục "Từ review toàn bộ"), nặng trước, có file:dòng; bổ sung vào việc CCCD/BHXH đã có.
- Đã tự xác nhận (đọc code/DB): MFA bị lách khi đọc DB; `decide_approval` duyệt trùng bỏ qua bước sau; trần 1000 dòng cắt bảng công; mobile crash offline (`reqItems` Map trong cache); hàng đợi chấm công không gắn NV; `trust proxy`/`forgotPassword` lộ email; sửa hồ sơ ghi trước khi kiểm phạm vi; `useEsc` đóng modal.
- Đã kiểm, KHÔNG lỗi: công thức lương/BH/thuế (`calc.ts`, `cycle-calc.ts`), `replace_payroll_results` đúng phạm vi, tạm ứng 1 đơn/tháng, MFA ở API, purge tenant, nhập file (chỉ bổ sung chỗ trống, kiểm phạm vi), không rò dữ liệu chéo công ty. Log `[payroll] lỗi DB` chỉ in `message` (dòng lỗi PostgREST nằm ở `details`) → không lộ lương.

## Đang dở
- Chưa sửa mục nào trong 24 việc. Chưa commit: `HANDOFF.md`, `docs/TASKS.md`; `docs/plans/roadmap-competitive.md` vẫn untracked (người dùng chưa quyết).
- `a6d559e` vẫn CHƯA deploy (migration `202612070001` cloud chưa chạy, nhánh chưa push).
- DB local vừa bị verify-all reset sạch: smoke account phải kích hoạt lại khi cần (`tools/smoke-lib.sh`).

## Quyết định đã chốt
- Review chỉ ghi việc, không sửa; người dùng chọn việc sửa ở phiên sau.
- Hướng sửa MFA/RLS: API dùng service role hết, mobile không dùng supabase-js → thu SELECT của `authenticated` mọi bảng trừ 7 bảng Realtime (`_lib/client.ts:63`), `/api/realtime` từ chối aal1. Gộp luôn việc CCCD/BHXH.
- Dữ liệu online là thật: chỉ xem; test ghi trên DB local.

## Nợ Ponytail
- Không có `shortcut:` mới. Nợ cũ: `apps/api/src/timesheet/pause.ts` (50% theo ngày lịch, nghỉ ốm không cộng đơn lẻ).

## Việc tiếp theo
1. Sửa `decide_approval` (khóa `requests` trước, `select … for update` bước duyệt) — migration mới + pgTAP duyệt 2 lần — `[opus xhigh]`
2. MFA bị lách + CCCD/BHXH: thu quyền SELECT, chặn aal1 ở `/api/realtime`, sửa pgTAP — `[opus xhigh]`
3. Trần 1000 dòng: helper phân trang chung + chia lô `.in()`, smoke ≥ 30 NV đủ công — `[opus xhigh]`
(Deploy `a6d559e` có thể làm trước, độc lập — `[opus high]`)

## File cần đọc đầu tiên
- `docs/TASKS.md` (mục "Từ review toàn bộ"), `AGENTS.md` (Cạm bẫy RLS + token trình duyệt)
- `supabase/migrations/202610250001_timesheet_requests.sql` (`decide_approval`)
- `apps/admin-web/app/api/realtime/route.ts`, `apps/admin-web/app/_lib/client.ts`
- `apps/api/src/timesheet/timesheet.service.ts` (`events`, `adjustments`)
