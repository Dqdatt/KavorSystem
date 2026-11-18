# Việc đang mở

Theo kế hoạch v1 (`docs/plans/hoan-thien-v1.md`): làm đúng thứ tự đợt; việc mới không phải P0 (sai tiền/công, lộ dữ liệu, mất dữ liệu,
crash luồng chính) ghi vào "Sau v1", không làm trước khi xong v1. Chi tiết từng mục: file:dòng ghi kèm (từ review 16/11/2026).

## Đợt 1 — Bảo mật (xong 17/11/2026, `202612080001` + commit Đợt 1; xem PROGRESS)
- [x] Deploy `a6d559e`: migration `202612070001` lên cloud TRƯỚC, rồi push; kiểm online chỉ xem — [opus high]
- [x] MFA bị lách khi đọc DB: RLS không kiểm `aal` → chỉ cần mật khẩu là lấy token aal1 (`/api/realtime` trả token của cookie phiên chưa qua MFA, hoặc gọi thẳng Supabase Auth) rồi đọc PostgREST: lương, CCCD, phiếu lương, nhật ký. API chạy service role, mobile không dùng supabase-js → thu SELECT của `authenticated` ở mọi bảng trừ 7 bảng Realtime (`_lib/client.ts:63`), `/api/realtime` từ chối aal1, nhánh theo quyền trên 7 bảng đòi aal2; siết luôn `support_access_sessions`/`tenant_settings`/`memberships`/`role_assignments` (mọi thành viên đang đọc được); sửa pgTAP — [opus xhigh]
- [x] CCCD/sổ BHXH hở (làm cùng mục MFA): RLS `employee_profiles` cho mọi người có `employee.read` (cả quản lý trực tiếp) đọc thẳng số đầy đủ qua PostgREST bằng token Realtime, dù API che; người có `employee.sensitive.read` xem đầy đủ không ghi nhật ký trong khi ghi chú hồ sơ nói "mỗi lần xem được ghi vào lịch sử" — siết RLS + áp cách "Hiện số". Payload đơn sửa hồ sơ (`request_versions`) chứa CCCD/BHXH/MST đầy đủ, người duyệt đọc thẳng được; ghi chú `employees/profile.tsx:203` nói "mỗi lần xem được ghi" là sai với CCCD — [opus xhigh]
- [x] Đăng nhập: `main.ts:22` `trust proxy = true` → giả `X-Forwarded-For` vô hiệu giới hạn thử mật khẩu/OTP; `forgotPassword` trả email đầy đủ cho ai biết mã NV (giới hạn theo IP+mã nên dò hàng loạt được); `findEmployeeByCode/Email` dùng `ilike` không escape `%`/`_` — [opus xhigh]
- [x] Web đăng nhập: `next=/\evil.com` lọt kiểm tra → chuyển ra trang ngoài sau đăng nhập (`login/page.tsx:39`, Console `login/page.tsx:37`) — [opus high]
- [x] Phân quyền nhỏ: khóa/mời tài khoản kiểm phạm vi bằng `employee.read` thay vì `membership.disable/invite` (`employees.service.ts:389,425`), mở khóa được người đã nghỉ; nút nhắc chấm công chỉ cần `attendance.read` (Kiểm soát gửi được); lý do nghỉ trong lịch theo `ctx.can` không theo phạm vi (`leave.service.ts:314`) — [opus xhigh]

## Đợt 2 — Đúng số công/lương (lên online trước khi công ty thật khóa kỳ công tháng 12)
- [x] Duyệt đơn bấm 2 lần bỏ qua bước sau: `decide_approval` (`202610250001_timesheet_requests.sql:229`) đọc bước duyệt trước khi khóa đơn → lần bấm thứ 2 thấy bản cũ "pending", bước 2 đã thành pending nên đơn thành `approved` (tạm ứng > 5 triệu bỏ qua HR/Kế toán). Khóa `requests` trước rồi `select … for update` bước duyệt — [opus xhigh] (318c68c, deploy 17/11)
- [x] Trần 1000 dòng PostgREST (`max_rows`, cloud cũng 1000) cắt ngầm: bảng công `timesheet.service.ts:144` (lô 100 NV × ~62 lượt/tháng → sai từ ~16 NV đủ công, khóa kỳ chụp số sai → lương sai), adjustments/leave_days/OT cùng hàm; chấm công hôm nay `attendance-admin.service.ts:176`; `loadPlacements` > 100 id (`attendance/policy.ts:170`); `scopedEmployeeIds`; `lock()`; checklist `gaps()`; `documents.service.ts:95`; danh sách NV/overview/memberships/`privacy_consents`; `employees.service.ts:545` `slice(0,200)`. Dùng chung helper phân trang (`all()` ở payroll.service) + chia lô `.in()` ≤ 100 id (URL quá dài ở HR > ~220 NV); thêm smoke ≥ 30 NV đủ công (dùng lại ở Đợt 5) — [opus xhigh] (cec4bab, deploy 17/11; `tools/scale-data.sh` dùng lại ở Đợt 5)
- [x] Race tạo dữ liệu: đơn nghỉ trùng ngày/vượt số dư (`create_leave_request` không khóa), chấm công 2 lần với `clientEventId` khác (`attendance.service.ts:147`), giải trình vượt hạn mức tháng — kiểm và khóa trong SQL — [opus high] (3d2b37c, thêm hạn mức OT; deploy 17/11)
- [x] Phép tồn năm trước thiếu khi sổ năm cũ chưa tích lũy đủ (chỉ ghi khi có người đọc sổ; khóa `carry:${year}` không tính lại) — `leave.service.ts:106` — [opus xhigh] (125a5d8, deploy 17/11)
- [x] API sửa hồ sơ NV ghi bảng `employees` trước khi kiểm phạm vi (403 nhưng tên đã đổi, không nhật ký), đóng phân công cũ trước khi chèn mới; NV chưa vào làm sửa phòng ban → hai phân công, đến ngày vào làm bản cũ thắng; HR phạm vi phòng tạo NV ngày vào tương lai → 404 sau khi đã tạo — gom vào một RPC (`employees.service.ts:226-313`) — [opus high] (6bc76d4, deploy 17/11)

## Đợt 3 — Mobile chạy ổn (vòng 1; phạm vi cắt 17/11, người dùng đồng ý)
- [x] Mobile crash khi mở app lúc mất mạng rồi bấm đơn/thông báo: `reqItems` (Map) nằm trong `CACHED` (`store.ts:762`) → khôi phục thành `{}` → `.get` lỗi — [sonnet] (18/11: lưu Map dạng mảng cặp, bản lưu cũ bỏ qua; thử Simulator mất mạng mở TU-0001 không crash)
- [x] Mobile: widget mô phỏng ở bản thật sửa `S.clockIn` (`store.ts:1714`) → lần chấm thật sau thành "ra", máy chủ báo sai thứ tự — [sonnet] (18/11: bản thật chỉ báo toast)
- [x] Mobile chấm công offline: hàng đợi không gắn NV và không xóa khi đăng xuất (máy dùng chung → người sau gửi hộ); lỗi tạm thời (chờ đồng ý điều khoản, máy chờ duyệt, 429) bị xóa khỏi hàng đợi; race `enqueue`/`flushQueue` — `attendance.ts:116-145` — [opus high] (18/11: gắn `emp`, giữ khi đăng xuất và chỉ người đó gửi; `keepQueued`; khóa `locked()`; test 10 ca, Simulator đạt)
- [x] Build Release cài iPhone 11 + thử Android emulator: mất mạng mở app bấm đơn/thông báo không crash; chấm offline → đăng xuất → người khác đăng nhập thì không gửi hộ — [opus high]
  (18/11: Simulator + Android emulator Release đạt; Android sửa thêm hộp thoại "Location Accuracy" hỏi lặp khi từ chối; đã cài iPhone 11 bản `1c79ea4`)

## Đợt 4 — Web & API toàn vẹn (vòng 1; phạm vi cắt 17/11)
- [x] CSV xuất (đơn, bảng công, bảng lương đầu vào) chặn công thức `= + - @` (file mở bằng Excel của Kế toán) — tách từ việc validate API — [sonnet] (18/11: `apps/api/src/csv.ts`)
- [x] `mailer.ts:103` nuốt lỗi SMTP (lời mời/OTP không gửi mà không ai biết) — [opus high] (18/11: ghi nguyên nhân vào log API/trạm thư/OTP; trạm 401/404 báo chưa cấu hình; tạo NV kèm mời lỗi vẫn trả hồ sơ + `inviteError`)

## Đợt 5 — Chạy thử trọn vòng
- [ ] Người dùng chốt 6 mục "Cần người dùng chốt" trong `docs/plans/hoan-thien-v1.md`
- [ ] UAT trọn vòng trên DB local, công ty mẫu ≥ 30 NV, một tháng công (`docs/TEST_WORKFLOW.md`, iPhone + Android emulator): Console → HR → app → chấm công → đơn → duyệt → khóa kỳ → Kavor tính lương → công bố → phiếu trên app; không còn P0 — [opus high]

## Sau v1 (đóng băng — không làm trước khi xong v1)
- Cắt khỏi Đợt 3–4 ngày 17/11 (không sai tiền/công, không mất dữ liệu; người dùng đồng ý để xong v1 trong 2 vòng):
- [ ] Mobile: GPS độ chính xác cao mỗi 1 giây không tắt khi rời trang chủ (pin); giờ/ngày hiển thị theo múi giờ máy thay vì công ty; POST tạo đơn không idempotent (timeout 15 giây → gửi lại ra đơn trùng); `S.net`/NetBar là mã chết — [sonnet]
- [ ] Mobile bảo mật: che màn hình lương/tài liệu khi vào nền + khóa PIN khi vào nền (hiện mở 5 phút); deep link bỏ qua màn đồng ý/đăng ký máy và tự đặt role; đăng xuất đúng lúc refresh thì phiên được ghi lại; xóa file đính kèm tạm trong cache — [opus high]
- [ ] Ghi nửa chừng: tạo ca/địa điểm/quy định chèn định nghĩa rồi mới chèn phiên bản 1 → lỗi để lại định nghĩa mồ côi chiếm mã, không sửa được (`schedule.service.ts:48,134`, `rules.service.ts:41`) — [sonnet]
- [ ] Không ngừng được phòng ban/chức danh từng có người nghỉ: `endUnit` đếm phân công/vai trò của người đã nghỉ, `offboard_employee` không đóng `effective_to` (`org.service.ts:176`) — [opus high]
- [ ] Validate API: id không phải uuid → 500 (`schedule.service.ts`), `?q=a&q=b`, `?status` sai enum; tạo NV nhận `terminated`/`leaving` lách luồng nghỉ việc; email so khớp phân biệt hoa thường + chưa có unique `lower(work_email)`; `markRead` với `ids: []` đánh dấu đọc hết — [opus high]
- [ ] Web hộp thoại: Esc đóng dropdown `Select` đóng luôn modal (`useEsc` ở `_ui/kit.tsx:112` không kiểm `defaultPrevented`, lớp chồng đóng cả hai), bấm nền đóng modal đang nhập; soạn bản tin lỗi đính kèm → lưu lại tạo bài trùng (`announcements/page.tsx:221`); nhập CSV kỳ lương bấm đúp → 2 lượt nhập (`payroll/cycles.tsx:278`); Cài đặt `key={tab}` mất sửa đổi khi đổi tab — [sonnet]
- [ ] Web: chọn tháng neo theo tháng đang xem nên không quay lại tháng mới nhất (`attendance/month.tsx:49`, `overtime.tsx:40`, `payroll/advances.tsx:44`); `slaLabel` quá hạn < 30 phút hiện "Còn 1 giờ" (`_ui/request.tsx:43`); 10 ô tìm kiếm không bỏ dấu (đưa `fold` vào web-ui) — [sonnet]
- [ ] Truy cập web: `Field` không gắn nhãn với ô nhập/`Select`; modal không đưa/giữ/trả focus — [sonnet]
- [ ] Thông báo duyệt sửa hồ sơ lặp chữ "Sửa hồ sơ Sửa email…" — [sonnet]
- [ ] Web còn ngưỡng nghiệp vụ cứng trái ADR 0001: lương ≥ 1.000.000 (chặn thực tập/CTV), thử việc 85–100%, đoàn phí 0–5%, mốc 5 triệu (`employees/pay.tsx:124`, `settings/page.tsx:91`, `requests/page.tsx:161`) — [opus high]
- [ ] `requests.items()` (danh sách/xuất CSV đơn) `.in()` theo mọi id đơn: > ~200 đơn trong một lần xuất → URL quá dài, lỗi 500 (lỗi rõ, không sai số) — chia lô bằng `allIn` (db/rows.ts) — [sonnet]
- [ ] Hồ sơ nhân viên sắp vào làm hiện trống phòng ban/quản lý (`detail`/`enrich` lấy phân công theo hôm nay); phạm vi và sửa hồ sơ đã theo phân công sắp hiệu lực (17/11) — [sonnet]
- [ ] `payroll_law` (`202611270001:23`) khóa sửa tham số luật theo `current_date` (UTC): 00:00–07:00 VN ngày hiệu lực Console vẫn sửa được — đổi sang ngày VN — [opus xhigh]
- [ ] Phép tồn: sổ năm trước bổ sung theo quy định phép năm đang áp dụng hôm nay (shortcut 17/11, `leave.service.ts`) — đổi khi quy định có lịch sử theo năm — [opus high]
- [ ] (Tùy chọn) HR điều chỉnh công: xóa một giờ chấm sai (hiện chỉ đặt giờ), ca qua đêm; tab Lịch sử hồ sơ hiện ngày được sửa — [opus high]
- [ ] (Tùy chọn) Tạm nghỉ: mobile báo "Đang tạm nghỉ" ở màn chấm công; tính 50% theo ngày làm việc của ca thay vì ngày lịch; tạm ứng khi đang tạm nghỉ — [opus high]
- [ ] (Tùy chọn) Chuyển người duyệt khi quản lý trực tiếp nghỉ việc (bước "Quản lý trực tiếp" giao đích danh, hiện chỉ cảnh báo) — [opus high]
- [ ] (Tùy chọn) "Nhắc người duyệt" ở chi tiết đơn chờ duyệt (prototype có; hiện chỉ nhắc tự động theo hạn) — [opus high]
- [ ] Thời hạn thử việc trong hồ sơ → "hết thử việc" ở khối Sắp tới — [opus high]
- [ ] Tìm đơn theo mã trong Ctrl K; nút Ctrl K trên màn hẹp; "Xuất danh sách" chấm công hôm nay; ô "Người đang áp dụng" (Ca & địa điểm); phân trang bảng Ngày lễ — [sonnet]
- [ ] P3 lương: trang Lương theo prototype (tổng quỹ lương nhiều kỳ, cơ cấu quỹ, hộp Chốt bảng 4 bước); xem thanh 4 bước bằng Kế toán HD0215 — [opus xhigh]
- [ ] Lệch prototype còn lại (đối chiếu "Điểm mới" 15/11): hồ sơ có thẻ tóm tắt cố định bên trái; Tính thử lương tự cập nhật + thanh phân bổ; đơn nghỉ hiện số dư phép; xem trước tài liệu (ov:docview) + yêu cầu tài liệu (docreq) — [opus high]
- [ ] (Tùy chọn) Hộp nhập file: sửa dòng lỗi ngay trên bảng như prototype — cần API nhận dòng đã sửa; xem hộp ở màn hẹp — [opus high]
- [ ] Hiệu năng: N+1 ở bảng phép (`balance()` từng NV) và bản tin (RPC từng bài); danh sách đơn đọc toàn bộ lịch sử tenant mỗi lần mở; đếm exact `attendance_events` ở trang Cài đặt; mời 300 người gửi thư tuần tự (quá timeout Render) — [opus high]
- [ ] Console: 16 chỗ chữ < 12px (tenants, support, recoveries) + 3 chỗ `kavor.css`; chưa có `PageActions`; gộp `kit.tsx`/`client.ts` Console trùng web HR vào `@kavor/web-ui` — [sonnet]
- [ ] Dọn code (`/ponytail ultra`): `_ui/google-location-map.tsx` (không dùng được ở VN), helper chép nhiều bản (`toBase64`×4, `fold`×3, cộng tháng×5, `STATE`/`ASSIGN_STATE`), import thừa ~12 chỗ, `sb`/`idParam` thừa ở org/settings service — [haiku]

## Đã xong (trước kế hoạch v1)
- [x] Rà bản online/local web HR v2 với prototype v2, sửa lệch từng trang (1ab49be, ec8236f, 8454334, 977f0cc)
- [x] Chữ không rớt dòng giữa cụm (vs(), Dl, số + đơn vị) (64b9461)
- [x] Rà hồ sơ tab Lương/Giấy tờ/Đơn từ/Lịch sử, hộp thoại, ngăn kéo chấm công + sổ phép (127dbc4)
- [x] So tiếp luồng duyệt, chi tiết đơn vị/bài viết, khóa kỳ, vai trò, hộp ngừng, người phụ thuộc, mời kích hoạt + kiểm online (e7d90e3 + đợt sau)
- [x] Chặn ngừng ca/địa điểm còn áp dụng ở API (409) + hộp chặn/xác nhận trên web
- [x] Hộp Nhập file nhân viên 3 bước như prototype (Tải mẫu .xlsx, kéo thả, xem trước) (91f93ad)
- [x] Dọn lệch nhỏ: "·" → vạch |; chức danh người gửi (chi tiết đơn) + "Chưa có app" ở người đọc bài (thêm trường API); so chi tiết tài liệu
- [x] Script nạp dữ liệu thử ổn định (tools/demo-data.sh; lỗi "Bad Request" do bash 3.2 brace-expand body JSON)
- [x] Màn prototype có, web chưa có, chỉ UI: Điểm mới, Ghi chú phiên bản, "Hồ sơ của tôi", Thêm khoản phụ cấp mẫu
- [x] Cho nghỉ việc: `offboard_employee` + vòng quét qua ngày cuối + hộp web (hủy đơn chờ, khóa tài khoản)
- [x] Tạm nghỉ: `employee_pauses` + ngày `paused` trong bảng công + trừ phép năm theo lý do + hộp web
- [x] Test app simulator online TSNV002 + sửa nút/ghi chú trống chữ, nhãn vỡ dòng, giải trình giờ ngược (8113500)
- [x] Trang chủ mobile ngày nghỉ theo `shift.workDays`: dòng ca "Hôm nay nghỉ", vẫn cho chấm (16/11/2026, `store.ts`)
- [x] Ngày có giờ vào > giờ ra (dữ liệu cũ, vd TSNV002 04/11) vẫn 1 công trong `computeDay` → đổi luật (16/11): giờ ra ≤ giờ vào = Thiếu ra, 0 công
- [x] Màn "Xem số tài khoản" (16/11): 4 số cuối + "Hiện số" có nhật ký ở hồ sơ, Mức lương, đơn sửa hồ sơ; RLS ngân hàng chỉ cho chính nhân viên; file xuất lương giữ số đầy đủ
- [x] Lương người vào/nghỉ giữa kỳ (16/11/2026, cách a — công chuẩn cả kỳ, xem HANDOFF)
- [x] Kiểm online sau deploy `79014e6` (16/11): không kỳ nào cần mở/khóa/chốt lại
- [x] Công cụ "HR điều chỉnh công" trên web (16/11/2026): quyền `attendance.adjust`, nút "Sửa giờ" ở ngăn kéo chấm công, lý do bắt buộc, nhật ký + thông báo NV, chặn kỳ khóa/tự sửa/ngày tới/giải trình chờ
- [x] Deploy `8cf718b` (16/11): migration `202612060001` lên cloud, push `0801ea6`, kiểm online, test simulator
- [x] Mobile đếm "Đi muộn" khớp web (`f39d263`, đã push 16/11)
- [x] Cài app iPhone thật có `f39d263` (16/11), HR đã duyệt lại iPhone 11 (simulator tự thu hồi)
- [x] Mobile: nhãn "Duyệt" ở Tạm ứng bị giá trị dài bóp mất (`InfoRow` minWidth nhãn); màn "Đang chờ HR xử lý" dùng máy + giờ gửi thật từ máy chủ, làm mới cập nhật lại (16/11)
- [x] "Lỗi 403 Tổng quan" (16/11): là 403 `MFA_REQUIRED` cố ý lúc đăng nhập, không phải lỗi; nhãn Realtime lúc mới mở đổi thành "Đang kết nối…" (ghi cạm bẫy trong AGENTS.md)
- [x] Nút "Nhắc" (chấm công/giấy tờ/bản tin): `notify_reminders` + 3 endpoint HR + nút web + icon fallback web/mobile
