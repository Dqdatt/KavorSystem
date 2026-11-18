# HANDOFF — 18/11/2026 (phiên 20)

**Mục tiêu phiên vừa rồi:** vòng 2 UAT — bước 1–3: cập nhật tài liệu thử tay, dựng môi trường local, chạy nhánh A (công ty mới) và sửa P0.

## Đã xong
- `fe028f4`: TEST_WORKFLOW/TEST_CASES viết lại theo hiện trạng (2 nhánh: A công ty mới, B lương Hải Đăng + 30 NV), ghi 5 mục người dùng chốt.
- Môi trường local: DB reset + `scale-data.sh 30` (SC0001–SC0030 Hải Đăng, kỳ công **2026-10** đủ công); API mới **cổng 4100** + web HR/Console qua `.claude/launch.json` (`api-4100`, `admin-web-4100`, `console-web-4100`); app Release trên iOS Simulator "iPhone 17e" và Android emulator `Kavor_Pixel_6` trỏ 4100.
- Nhánh A đạt — chi tiết `docs/plans/uat-vong2-ketqua.md`. 2 P0 đã sửa (**chưa commit**): web không có nút "Thêm địa điểm"/"Tạo ca" khi trống (`_ui/kit.tsx` `Empty.action`, `schedules/page.tsx`); app hiện dữ liệu người trước trên máy (`apps/mobile/src/store.ts`: cache khóa theo `employeeId`, `signIn` reset trường CACHED khi đổi người, đăng ký/duyệt máy gọi `refreshWork()`). Kèm: menu "+" bỏ "Tháng 09/2026" giả. Typecheck + test mobile đạt, iOS đã build lại và kiểm.

## Đang dở
- Chưa verify-all, chưa commit code (6 file + `uat-vong2-ketqua.md`). `next-env.d.ts` (2 file) do Next dev tự sửa — KHÔNG commit (`git checkout` khi tắt dev).
- Android chưa build lại bản `store.ts` mới, chưa thử lại. AndroidManifest đang tạm `android:usesCleartextTraffic="true"` (native, không theo git) — gỡ sau UAT.
- API cũ cổng 4000 (bản 16/11) vẫn chạy — máy chặn lệnh tắt; người dùng tự tắt được. Preview không đọc `apps/api/.env.local` → quản trị Console đầu tiên là `admin@kavor.test`.
- DB local hiện có: ABC-001 (ADMIN01 = quản trị + Kế toán, NV001 lương 12 tr, NP-0001 đã duyệt, TU-0001 đã chi), ops1 chờ kích hoạt. Hải Đăng chưa kích hoạt tài khoản nào. Mật khẩu thử/TOTP ở scratchpad phiên 20 (có thể mất) — cần thì "Quên mật khẩu" + OTP Mailpit.

## Quyết định đã chốt
- UAT 2 nhánh như trên; Claude tự thao tác web (trình duyệt trong app) + Simulator/emulator; iPhone 11 giữ bản online.
- Chỉ sửa P0, còn lại ghi "Sau v1"; sửa P2 một dòng được làm kèm khi đằng nào cũng build lại.
- (Trước đó) Đăng xuất không xóa lần chấm chưa gửi; 6 mục chốt 18/11 (TS-3010 thử nhưng dữ liệu thật, bản đồ/tham số luật/Singapore dùng tạm, phòng con Sau v1); tạm ứng hạn mức theo từng đơn; migration cloud `supabase db query --linked -f`.

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `attendance.ts` hàng đợi của người không đăng nhập lại; `leave.service.ts` sổ phép năm trước.

## Việc tiếp theo
1. **Nhánh B — lương** `[opus xhigh]`: TEST_CASES mục 9 (H-60…H-69c) trên Hải Đăng kỳ 2026-10: kích hoạt HD0007/HD0215/HD0216 (OTP Mailpit, web cần TOTP) → khóa kỳ công → chốt bảng → Kavor tính → đối chiếu tay SC0001 (10.900.000; BH NV 10,5%; giảm trừ 15,5 tr) → 2 Kế toán duyệt → công bố → phiếu SC0001 trên app.
2. **Đóng vòng 2** `[opus high]`: build lại Android (+iOS) bản sửa và thử nhanh; verify-all ở cổng 4100 (tắt Simulator/emulator nếu tải cao); review; commit; ghi PROGRESS; deploy (push nhánh).
3. **Người dùng quyết**: một người (quản lý kiêm Kế toán) duyệt cả 2 bước tạm ứng — có chặn không.

## File cần đọc đầu tiên
- `docs/plans/uat-vong2-ketqua.md`, `docs/TEST_CASES.md` (mục 9), `docs/TASKS.md` (Đợt 5), `AGENTS.md` (Cạm bẫy)
