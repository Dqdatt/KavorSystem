# HANDOFF — 19/11/2026 (phiên 22)

**Mục tiêu phiên vừa rồi:** làm nốt việc vặt Đợt 5 → v1 xong; gom "Sau v1" thành 2 vòng hoàn thiện (người dùng: 1–2 vòng nữa là xong toàn hệ thống).
Người dùng: **không dùng `giao`** ở dự án này — workflow agent Claude (timcode/laptrinh/chaylenh/kiemtra).

## Đã xong (commit phiên này, CHƯA push)
- Việc vặt UAT vòng 2: người tạo ca hệ thống = "Hệ thống" (`schedule.service.ts`); placeholder mã NV "VD: NV0001"; ô nhập lại mật khẩu ở
  kích hoạt web HR (`login/page.tsx`); app ngày dd/MM (`money.tsx` payDate, `store.ts` punchLabel); widget ngày/khoảng cách thật (`screens/profile.tsx`);
  đăng xuất web HR/Console dùng Modal thay `confirm()`.
- Dọn code (ponytail ultra): bỏ Google Maps; `toBase64`/`shiftMonth`/`ASSIGN_STATE` chung ở `_ui/kit.tsx`, `fold` export từ `@kavor/web-ui`;
  bỏ import thừa, tham số `sb` thừa (OrgAdmin/SettingsAdmin/ConsoleService), `idParam`. `verify-all.sh` đọc biến `API`.
- Kiểm: verify-all đầy đủ ở API 4100 đạt (operators-smoke lỗi môi trường, chạy lại đạt — cách chạy trong AGENTS.md). kiemtra review: không lỗi chặn.
- Android emulator APK Release mới (10.0.2.2:4100): BX0002 Mẫu B → đăng xuất → HD0142 Hải Đăng không lộ dữ liệu, PIN tạo mới, phiếu 11/2026 có tên
  khoản, ngày "19/11"; đã gỡ `usesCleartextTraffic` (native, ngoài git). iPhone 11 đã cài bản Release online mới (chưa mở thử — dữ liệu online chỉ xem).
- `docs/TASKS.md`: Đợt 5 xong → **v1 xong**; "Sau v1" chia Vòng 1 / Vòng 2 / Tùy chọn / Việc của người dùng.

## Đang dở
- **Chưa push** (push = deploy Render/Vercel). Thay đổi không có migration; API chỉ đổi nhãn "Hệ thống" + dọn constructor.
- API 4100 (Preview `api-4100`) còn chạy; DB local đang có dữ liệu payroll-smoke + BX0002 đã kích hoạt.

## Quyết định đã chốt (đừng hỏi lại — xem PROGRESS "Quyết định đã chốt", `docs/plans/hoan-thien-v1.md`)
- Tạm ứng 2 bước: **chặn** một người duyệt cả 2 bước.
- Tham số luật, máy chủ Singapore, bản đồ OSM: dùng tạm (chốt 18/11), không chặn bản hoàn thiện.
- Mục "(Tùy chọn)": mặc định không làm trong 2 vòng, người dùng muốn thì kéo vào Vòng 2.

## Chờ người dùng
- Push `9b4c875` + commit tài liệu (deploy).

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `attendance.ts` hàng đợi của người không đăng nhập lại; `leave.service.ts` sổ phép năm trước.
- `payroll/advances.tsx` ~dòng 43 biểu thức `cur === … ? cur : cur` thừa — sửa cùng mục "chọn tháng neo" Vòng 2.

## Việc tiếp theo — Vòng 1 (đúng số, bảo mật, toàn vẹn) `docs/TASKS.md`
1. Tạm ứng (chặn 1 người duyệt 2 bước + cảnh báo thiếu tài khoản ngân hàng) + `payroll_law` ngày VN + phạm vi phòng ban con + phép tồn theo năm `[opus xhigh]` — phiên chính tự làm.
2. Mobile bảo mật, validate API, ghi nửa chừng, ngừng phòng ban, requests chia lô, hồ sơ sắp vào làm, app E16/E15, ngưỡng cứng ADR, hiệu năng.
3. verify-all → deploy → UAT ngắn phần đã sửa. Rồi Vòng 2 → bản hoàn thiện.

## File cần đọc đầu tiên
- `docs/TASKS.md` (Sau v1 — Vòng 1/2), `AGENTS.md` (Cạm bẫy), `PROGRESS.md` mục đầu "Đã xong".
