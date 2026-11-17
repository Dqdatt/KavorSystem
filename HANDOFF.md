# HANDOFF — 17/11/2026 (phiên 17)

**Mục tiêu phiên:** chốt kế hoạch hoàn thiện v1 (không sửa mãi) và làm Đợt 1 — bảo mật.

## Đã xong
- Kế hoạch `docs/plans/hoan-thien-v1.md` (người dùng đã chốt): định nghĩa "xong v1", luật phạm vi (chỉ P0 được chen vào), 5 đợt cố định;
  `docs/TASKS.md` chia theo đợt + mục "Sau v1 (đóng băng)".
- Đợt 1 xong và đã deploy (chi tiết PROGRESS "Đã xong"): `a6d559e`; migration `202612080001_browser_token_rls.sql` (token trình duyệt chỉ đọc 7 bảng
  Realtime, bắt buộc aal2); `/api/realtime` chặn aal1; đăng nhập (`limitAuth` theo tài khoản, `trust proxy` 1, quên mật khẩu không trả email,
  `ilikeExact`, `next=` cùng origin); phân quyền nhỏ (mời/khóa theo `membership.*`, không mở khóa người đã nghỉ, nhắc chấm công cần
  `attendance.adjust`, lý do nghỉ theo phạm vi `request.read`).
- Kiểm: verify-all đầy đủ trên API code mới — typecheck, unit 89, pgTAP 667, 33 smoke, build, lint DB. Smoke `overtime` lỗi theo ngày (seed vào 07:52
  vào ngày 16) → smoke chấm vào 07:50. Realtime local: aal2 nhận sự kiện, aal1 không.

## Đang dở
- API local cổng 4000 (terminal của người dùng) vẫn chạy code cũ → chạy lại `bash tools/dev-backend.sh` trước khi thử local. Có thể còn API thử
  cổng 4100 do phiên này bật (tắt được: `lsof -ti tcp:4100 | xargs kill`). iOS Simulator đã tắt (máy quá tải).
- `docs/plans/roadmap-competitive.md` vẫn untracked (mục 6 "Cần người dùng chốt" của kế hoạch v1).

## Quyết định đã chốt
- Làm theo kế hoạch v1; việc không phải P0 ghi "Sau v1". Không review toàn dự án/so prototype tới hết v1.
- Bảng mới: không GRANT cho authenticated (trừ bảng Realtime + policy `_mfa`) — AGENTS.md "Cạm bẫy".
- Nhắc chấm công chỉ HCNS/Quản trị viên công ty (quản lý, Kiểm soát không còn nút). Muốn quản lý nhắc được → quyền riêng (sau v1).
- shortcut `main.ts`: giả định 1 proxy trước API trên Render (không có tài liệu chính thức); sai thì lớp IP thành theo định danh.

## Việc tiếp theo — Đợt 2 (đúng số công/lương, phiên chính Opus xhigh)
1. `decide_approval` duyệt 2 lần bỏ qua bước sau (migration mới, test gọi song song)
2. Trần 1000 dòng: helper phân trang + chia lô `.in()`, bộ dữ liệu ≥ 30 NV đủ tháng công (dùng lại Đợt 5) — phải lên online trước khi công ty thật khóa kỳ tháng 12
3. Race tạo dữ liệu; phép tồn năm trước; sửa hồ sơ NV gom một RPC

## File cần đọc đầu tiên
- `docs/plans/hoan-thien-v1.md`, `docs/TASKS.md` (Đợt 2), `AGENTS.md` (Cạm bẫy RLS)
- `supabase/migrations/202610250001_timesheet_requests.sql` (`decide_approval`), `apps/api/src/timesheet/timesheet.service.ts` (`events`)
