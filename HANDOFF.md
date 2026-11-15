# HANDOFF — 15/11/2026 (phiên 5)

**Mục tiêu phiên vừa rồi:** làm việc 1 của HANDOFF trước, tức script nạp dữ liệu thử `tools/demo-data.sh` chạy ổn định.

## Đã xong
- `5859d59` đưa `tools/demo-data.sh` vào repo (bản nháp cũ nằm trong scratchpad /tmp của một phiên trước). Lỗi "Bad Request" là do bash 3.2 của macOS đọc sai `\"` trong `"$(call … "{\"k\":…}")"` rồi brace-expand body JSON; giờ `say` tự gọi `call` từ tham số và in thông điệp lỗi thật
- Trên DB sạch cả 21 bước đều ok (đơn phép, sửa hồ sơ, tạm ứng đã chi, giấy tờ, MST, người phụ thuộc, khoản mẫu, kỳ lương 2026-10 đã gửi kiểm tra)
- `verify-all --quick` đạt (typecheck, unit, pgTAP 586). `AGENTS.md:74` ghi cách chạy và cạm bẫy bash 3.2; `CLAUDE.md` có dòng biến môi trường
- `/batdau`: dự án đã vào workflow từ trước, chỉ bổ sung dòng biến môi trường

## Đang dở
- Không có code dở. DB local vừa reset nên chưa có dữ liệu thử.
- `docs/plans/roadmap-competitive.md` chưa track: do một phiên Claude viết 06/11/2026 (lộ trình cạnh tranh). Không commit khi người dùng chưa quyết.

## Quyết định đã chốt
- Script dữ liệu thử chỉ dùng local, luôn chạy sau `db-reset`; không làm idempotent.
- Lệnh `payroll/pay-items/templates` gửi `{}` = thêm tất cả khoản mẫu (đúng ý đồ của API).
- Các quyết định của phiên 4 vẫn giữ: "·" giữ ở `<option>`/toast/tooltip; "Điểm mới" chỉ ghi điều web có thật; xong việc khớp prototype thì commit + push (= deploy) rồi so online, chưa xong thì chỉ commit.

## Mẹo local
- Xem UI với dữ liệu thử: `bash tools/db-reset.sh && bash tools/demo-data.sh` (API :4000 phải đang chạy). Script tự kích hoạt + MFA cho HD0007, HD0215; secret TOTP lấy từ `auth.mfa_factors` trong DB local.
- Shell trên Mac là bash 3.2: gán `r=$(call …)` trước, đừng lồng JSON có `\"` trong `"$(…)"`.
- `verify-all --quick` không reset DB: chạy `db-reset` trước, nếu không pgTAP có thể trượt vì fixture.
- API local không tự nạp lại code: sửa API thì chạy lại `bash tools/dev-backend.sh`.

## Nợ Ponytail
- Mới: `tools/demo-data.sh` chạy lại khi chưa reset sẽ tạo trùng; khi nào cần nạp dữ liệu lên DB đang dùng thật thì làm idempotent.
- Cũ: `kit.tsx` `vs()` cụm > 40 ký tự; `employees/page.tsx` DocTicks.

## Việc tiếp theo
1. Nút "Nhắc" (chấm công/giấy tờ/bản tin): endpoint HR + migration kind thông báo mới + icon fallback web/mobile `[opus high]`
2. Màn nhạy cảm: Cho nghỉ việc, Tạm nghỉ, Xem số tài khoản — mỗi màn một kế hoạch `[opus xhigh]`
3. Ctrl K tìm đơn theo mã, nút Ctrl K trên màn hẹp, "Xuất danh sách" chấm công hôm nay, "Người đang áp dụng", phân trang Ngày lễ `[sonnet]`

## File cần đọc đầu tiên
- `docs/TASKS.md`
- `AGENTS.md` (dòng thông báo: trigger SQL + `kind`, thông báo cục bộ mobile)
- `supabase/migrations/202610260001_notifications.sql`
- `docs/plans/web-hr-v2-checklist.md`
- `tools/smoke-lib.sh`
