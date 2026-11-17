# HANDOFF — 17/11/2026 (phiên 18)

**Mục tiêu phiên:** Đợt 2 của `docs/plans/hoan-thien-v1.md` — đúng số công/lương (5 mục), deploy trước khi công ty thật khóa kỳ tháng 12.

## Đã xong (cả 5 mục đã deploy: migration lên Supabase cloud + push nhánh)
1. `318c68c` duyệt bấm 2 lần: `decide_approval` khóa đơn trước (`202612090001`).
2. `cec4bab` trần 1.000 dòng: `apps/api/src/db/rows.ts` (`all`, `allIn`) + `tools/scale-data.sh`/`scale-smoke.sh` (120 NV, dùng lại Đợt 5).
3. `3d2b37c` race tạo dữ liệu: `lock_employee_requests` trong `create_request`, kiểm lại số dư/hạn mức/giới hạn OT trong SQL, trigger chấm công
   một lượt vào/ra mỗi ngày (`202612100001`). Gộp cả hạn mức OT (cùng kiểu race; đề xuất trong plan, người dùng chốt plan nhưng chưa trả lời riêng câu này).
4. `125a5d8` phép tồn năm trước (API, không migration).
5. `6bc76d4` sửa hồ sơ NV một RPC `save_employee` + `scoped_employees` gồm người sắp vào làm (`202612110001`).
- Kiểm: verify-all đầy đủ (mục 1, 2, 3 riêng; mục 4+5 chung một lượt) qua API thử cổng 4100. Mỗi smoke race/1.000 dòng/phép tồn đã chạy trên code
  cũ → hỏng đúng chỗ, code mới → đạt. Chi tiết: PROGRESS "Đã xong", AGENTS "Cạm bẫy" (3 mục mới).
- Dữ liệu cloud (chỉ SELECT): công ty TS-3010 có **229 NV**, 248 phân công, chưa khóa kỳ nào.

## Đang dở
- API local cổng 4000 (terminal người dùng) vẫn chạy code cũ → `bash tools/dev-backend.sh` trước khi thử local. API thử cổng 4100 đã tắt.
  DB local đã bị verify-all reset (dữ liệu mẫu).
- Online đã xem (chỉ xem, phiên đăng nhập sẵn trong trình duyệt của app): Nhân viên, Chấm công tải đúng dữ liệu thật; API 200, hàm/trigger mới có trên
  cloud. Chưa xác nhận Render đã chạy commit cuối (health không có số phiên bản).

## Quyết định đã chốt
- Tạm ứng (17/11, người dùng): giữ như hiện tại — hạn mức kiểm theo từng đơn (≤ % lương cứng), không cộng các đơn khác trong tháng;
  người duyệt tự cân nhắc khi một người gửi nhiều đơn. Không phải P0.

## Câu hỏi chờ người dùng
- Phép tồn: năm trước khi dùng Kavor không tạo sổ (HR nhập tay như cũ) — đang làm theo cách này.
- `docs/plans/roadmap-competitive.md` vẫn untracked (mục 6 "Cần người dùng chốt").

## Việc tiếp theo
- Đợt 3 — mobile chạy ổn (`docs/TASKS.md`). Việc mới phát hiện, không P0, đã ghi "Sau v1": xuất CSV đơn > ~200 đơn (URL), hồ sơ người sắp vào
  làm trống phòng ban, shortcut quy định năm trước của phép tồn.
