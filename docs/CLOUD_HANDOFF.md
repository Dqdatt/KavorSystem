# Bàn giao từ phiên cloud → Claude Desktop (Mac)

> Đọc file này **trước** khi làm tiếp trên Mac. Phiên cloud (Claude Code trên web, container Linux) không có Mac/Xcode/iPhone/Android emulator,
> nên mọi thứ dưới đây mới được kiểm bằng: `bash tools/verify-all.sh` (typecheck, unit, pgTAP, smoke API thật, build, lint DB), trình duyệt tự động
> (Playwright headless) cho web, và test hành vi mobile trong Node (`pnpm --filter @kavor/mobile test`). **Chưa có gì chạy trên simulator hay iPhone.**
>
> Nhánh: `claude/ecstatic-pascal-dblg7v` (chưa merge vào `main`), commit cuối từ cloud: `41bf4f4`. Người dùng giao (26/10): "đang dùng cloud nên cứ
> làm tiếp, done thì push, log lại để Desktop biết chỗ nào push nhưng còn thiếu gì, chưa test gì". **26/10: người dùng tạm dừng phiên cloud** —
> tiếp tục trên Claude Desktop từ file này. Lần verify-all cuối trên cloud: TẤT CẢ ĐẠT (pgTAP 460, 18 smoke, build, lint).

## Việc Desktop cần làm khi mở lại

1. `git fetch && git checkout claude/ecstatic-pascal-dblg7v && git pull`, `pnpm install`, `bash tools/db-reset.sh`, chạy lại `bash tools/verify-all.sh`
   trên Mac (cloud đã đạt — xem bảng dưới — nhưng Mac có cấu hình khác: cổng 553xx, Kong/Auth).
2. Build bản Release mới lên iPhone 11 "Dqdatt" với `EXPO_PUBLIC_API_URL` (xóa `$TMPDIR/metro-cache`, **không** bật QA) rồi đi các mục "Chưa test
   trên máy" bên dưới. Ghi kết quả vào PROGRESS.md.
3. Đối chiếu UI mobile mới (form/thẻ thiết kế bổ sung) — không có trạng thái QA/ảnh ghép `tools/ui-compare/` cho các màn này.
4. Hỏi người dùng các quyết định mặc định đang chờ review (cột "Quyết định chờ review").
5. Ổn thì merge vào `main`.

## Các commit đã push từ cloud

| Commit | Nội dung | Đã kiểm (cloud) | Chưa test / còn thiếu | Quyết định chờ review |
|---|---|---|---|---|
| `5e39305`, `96029d2` | Web `/payroll` (kỳ lương, nhập CSV, duyệt, công bố) + file mẫu `sample-data/payroll_import_2026-10.csv` | verify-all, smoke payroll, trình duyệt tự động | Người dùng chưa thử nhập CSV thật; export/PDF phiếu lương, mở lại kỳ đã công bố chưa làm | — |
| `8d09843`, `79e9cbd` | Bản tin: DB/API/smoke, web `/announcements`, tab Bản tin trên app (API) | verify-all, smoke 51, web tự động, test Node | **App chưa chạy trên máy**: tab Bản tin, mở file PDF qua liên kết ký, bấm thông báo bản tin. Chưa quét virus file | Đã chốt với người dùng (đính kèm, chỉ tính đã mở, HR chọn gửi thông báo) |
| `735d4d4`, `ba462f8`, `5d70fca` | Tài liệu nhân sự: DB/API/smoke, web `/documents`, Hồ sơ → Hợp đồng và quyết định (qua PIN/Face ID) | verify-all, smoke 42, web tự động, test Node | **App chưa chạy trên máy**: cổng PIN/Face ID trước danh sách, mở PDF. Chưa có "Tạo từ mẫu", nhắc hạn, quét virus | `docs/plans/documents.md` (6 danh mục cố định, quyền, 5 MB…) |
| `7e221bb` | Hồ sơ trên app đọc từ `/me/profile` | verify-all, test Node | **Chưa chạy trên máy** (thâm niên, điện thoại che giữa, ảnh bìa) | — |
| `61e7a55` | Đề nghị sửa hồ sơ (đơn HS): app gửi → HR duyệt → hồ sơ cập nhật; Kế toán đọc tài khoản ngân hàng | verify-all, smoke profile 32, pgTAP, web tự động, test Node | **Form sửa trên app chưa chạy trên máy** (form REMOTE là thiết kế bổ sung, prototype chỉ có điện thoại + địa chỉ; bàn phím che ô nhập?). Số tài khoản chưa mã hóa cột | Người dùng đã chốt trường + HR duyệt; mã hóa cột để lúc lên production |
| `531c4a6` | Console: gói dịch vụ, giới hạn nhân sự, tạm khóa/mở lại/đóng tenant; web HR hiện gói; app màn "Công ty tạm ngừng" | verify-all, smoke console-ops 39, pgTAP, Console + web HR tự động, test Node | **Màn lỗi "Công ty tạm ngừng" trên app chưa chạy trên máy**. Chưa có giá/tính năng theo gói, xuất/xóa dữ liệu tenant đã đóng | `docs/plans/console-ops.md` phần A (mức gói, đóng chỉ cần 1 người) |
| `fc488df` | Console: support access có thời hạn, Tenant Admin duyệt trên web HR (banner + tab Hỗ trợ Kavor) | verify-all, smoke support 36, pgTAP, hai phía tự động | Không có phần mobile. Chưa báo Tenant Admin qua app/email (chỉ banner web) | `docs/plans/console-ops.md` phần B (3 phạm vi, 30/60 phút, chỉ Tenant Admin duyệt) |
| `11a23d6` | File này + trỏ từ PROGRESS/AGENTS | — | — | — |
| `34438c9` | Trang `/organization` (sơ đồ, cây, thêm/sửa/ngừng đơn vị, chức danh) và `/roles` (5 vai trò mẫu, gán theo phạm vi + ngày hiệu lực, thu hồi); quyền `role.assign`, `organization.manage` | verify-all (pgTAP 451, smoke org 41), web tự động (sơ đồ, thêm phòng con, ngừng bị chặn, gán + thu hồi) | Không có phần mobile. Phạm vi phòng ban **không gồm phòng con**; chưa có vai trò tùy chỉnh, import cơ cấu, người duyệt thứ hai cho vai trò nhạy cảm | `docs/plans/org-roles.md` (phạm vi cho từng vai trò, chỉ Tenant Admin gán, ngừng = đặt ngày kết thúc) |
| `5a7a840` | Nhân viên → Nhập từ file (xem trước, chỉ nhập khi cả file sạch, nguyên khối); `import_employees`; file mẫu `sample-data/employees_import_sample.csv`; sửa test `hr_rls` không đếm cứng | verify-all (pgTAP 460, smoke import 14), web tự động (file lỗi → khóa nút; file mẫu → nhập 3 người) | Không có phần mobile. Chưa cập nhật hồ sơ cũ bằng file, chưa .xlsx/Google Sheets trực tiếp; người dùng chưa thử bằng file Excel thật (dấu phẩy/chấm phẩy theo vùng) | `docs/plans/employee-import.md` (CSV, cột, bỏ qua mã đã có, tối đa 1.000 dòng) |
| `41bf4f4` | Nhân viên → nút "Gửi lời mời (N)" cho người chưa mời; `POST /admin/employees/invite` bỏ qua người không đủ điều kiện kèm lý do | verify-all (smoke import 18), web tự động (gửi 10 người, thư tới Mailpit) | Gửi tuần tự trong request (cần hàng đợi nền khi SMTP thật chậm); chưa thử với Gmail SMTP thật | — |

## Checklist thử tay trên Mac (chưa ai thử — ghi kết quả vào PROGRESS.md)

Tài khoản mẫu (sau `bash tools/db-reset.sh`): HR Admin HD0007 · thao.mai@haidang.vn (kích hoạt trên trang đăng nhập web, OTP ở Mailpit
`http://127.0.0.1:55324`), Kế toán HD0215/HD0216, Quản lý HDG0003 · huy.le@example.test, nhân viên app HD0142 · thao.ha@haidang.vn.
Nhân viên Kavor (Console) tạo bằng `OPERATOR_PASSWORD='…' bash tools/create-operator.sh <email> "<Họ tên>"` (tạo 2 người).

Web HR (`pnpm dev:admin`, http://localhost:3000):
- [ ] Lương & tạm ứng: Kế toán nhập `sample-data/payroll_import_2026-10.csv`, người thứ hai duyệt, công bố → HD0142 xem phiếu trên app.
- [ ] Bản tin: đăng bài có PDF, hẹn giờ, bật thông báo; Tài liệu: tải hợp đồng cho HD0142, thay phiên bản.
- [ ] Cơ cấu tổ chức: thêm phòng con, đổi tên, ngừng (bị chặn khi còn người); Vai trò & phân quyền: gán HR Ops phạm vi phòng ban cho HD0142 → đăng
  nhập web bằng HD0142 chỉ thấy phòng đó → thu hồi.
- [ ] Nhân viên → Nhập từ file `sample-data/employees_import_sample.csv` (và thử **file Excel thật lưu CSV UTF-8** — Excel tiếng Việt có thể dùng dấu
  chấm phẩy, importer hiện chỉ đọc dấu phẩy) → Gửi lời mời (N) → thư tới Mailpit.
- [ ] Đơn & phê duyệt: duyệt đơn HS (sửa hồ sơ) do app gửi; Cài đặt → Hỗ trợ Kavor (sau khi Console gửi yêu cầu).

Kavor Console (`pnpm dev:console`, http://localhost:3001):
- [ ] Gói dịch vụ, đổi gói/giới hạn, tạm khóa → web HR + app bị chặn → mở lại; Support access: yêu cầu → HR duyệt → chế độ hỗ trợ → HR thu hồi.

App trên iPhone 11 (bản Release, `EXPO_PUBLIC_API_URL=http://<IP LAN Mac>:4000/api/v1`, không QA):
- [ ] Tab Bản tin (danh sách, chi tiết, mở PDF), bấm thông báo bản tin.
- [ ] Hồ sơ: thông tin thật, thẻ "Đề nghị sửa thông tin đang chờ HR", form Đề nghị sửa (bàn phím, cuộn, lỗi trong form) → HR duyệt → hồ sơ đổi.
- [ ] Hồ sơ → Hợp đồng và quyết định (PIN/Face ID trước, mở PDF).
- [ ] Phiếu lương sau khi Kế toán công bố; vòng chờ Face ID (lỗi cũ).
- [ ] Màn "Công ty tạm ngừng sử dụng Kavor" khi Console tạm khóa tenant.
- [ ] Android emulator: chấm công GPS + hàng đợi offline (chưa từng thử).

## Phản hồi UI mobile của người dùng (26/10) — chưa làm

9 điểm người dùng ghi khi thử app (splash xanh → gradient, OT hiện giờ chấm công + chọn giờ dạng vuốt, **chưa có cài đặt PIN — hiện mọi 6 số đều
mở được phiếu lương**, Face ID gọi thẳng hộp thoại Apple, sinh trắc học theo hệ điều hành, căn trái meta bản tin, tô dải ngày khi xin nghỉ nhiều ngày,
nút "?" hiện hướng dẫn sử dụng thay ghi chú QA, widget chấm công thật). Chi tiết, vị trí code, hướng làm: **`docs/plans/mobile-ui-feedback.md`**.

## Phản hồi UI web của người dùng (26/10) — kế hoạch, chưa làm

Hai web cần đẹp hơn theo tinh thần app mobile (gọn, có theme sáng/tối), sửa lỗi căn hàng (nguyên nhân chính đã tìm: `.field` thiếu
`align-content: start`), dropdown tự vẽ thay `<select>` của hệ điều hành, bản đồ kéo thả ghim cho địa điểm chấm công, Việt hóa thuật ngữ
("tenant"…), bỏ lặp tiêu đề topbar/page-head/modal. Kế hoạch 5 bước + hiện trạng đo được: **`docs/plans/web-ui-polish.md`**.

**29/10 — Claude Desktop đã làm xong phần này** (commit `d1db291` → `2a84f0a`, kết quả và bằng chứng ở đầu `docs/plans/web-ui-polish.md`).
Còn chờ người dùng: chọn nhà cung cấp bản đồ cho production (DNS VNPT chặn openstreetmap.org). Đoạn dưới là trạng thái cũ để tham khảo.

~~Đang dở (commit WIP 26/10)~~ — đã xong 29/10: người dùng đã duyệt bước 1–4
+ bảng từ Việt hóa + đổi font sang Montserrat. Đã làm:
- CSS chung một nguồn `packages/web-ui/src/kavor.css` (biến màu, theme sáng/tối qua `<html data-theme>`, không có thuộc tính = theo hệ điều
  hành; Montserrat tự host ở `packages/web-ui/fonts`, OFL); đã xóa `kavor-desktop.css`/`admin.css`/`console.css` của hai web; `.field` có
  `align-content: start` (lỗi lệch hàng).
- Component `Select` (`packages/web-ui/src/select.tsx`, dùng như `<select>`, onChange trả `{ target: { value } }`) và `ThemeToggle` +
  `themeInitScript` (`theme.tsx`); layout hai web đã chèn script theme.

Còn phải làm (theo `docs/plans/web-ui-polish.md`): thay 49 chỗ `<select>` bằng `Select` (`<select className="select"` → bộ lọc gọn), gắn
`ThemeToggle` vào `.top-actions` của hai `shell.tsx`, đổi mã màu viết cứng trong các trang (`(app)/page.tsx`, organization, settings,
announcements, roles/support/recovery `#79510e` → `.note-amber`, trang đăng nhập) sang biến; bước 2 (bỏ h2 `page-head` ở 12 trang HR + 5 trang
Console); bước 3 (Việt hóa); rồi chụp toàn bộ trang hai web theme sáng + tối, so với ảnh trước, `verify-all`, cập nhật AGENTS.md (CSS ở
`packages/web-ui`). **Chưa ai xem ảnh sau khi đổi CSS** — có thể vỡ bố cục ở vài trang.

## Đánh giá MVP (26/10) — chưa đủ để pilot

Theo `IMPLEMENTATION_ROADMAP.md` §15–19 (P0 – Pilot, go-live gate):

Đã có (dev, kiểm bằng smoke/pgTAP): tenant/auth/RBAC/RLS/audit, tổ chức + nhân viên + import CSV, ca/chấm công/bảng công/giải trình, nghỉ phép/OT/
luồng duyệt, nhập kết quả lương/phiếu lương/tạm ứng, bản tin, tài liệu, thông báo trong app, web HR, Console (tenant, gói, khóa, khôi phục, support access).

Thiếu về tính năng (P0):
1. Nhập số dư phép đầu kỳ hàng loạt (go-live tuần 1 cần; hiện chỉ điều chỉnh từng người).
2. Bảng công chưa tính nghỉ phép/OT/ca qua đêm; chưa có ca qua đêm, xếp ca theo ngày.
3. Ủy quyền người duyệt khi vắng; đính kèm minh chứng (giải trình, nghỉ phép).
4. Google Sheets manual sync (hiện chỉ CSV); trang Báo cáo; trang Nhật ký hoạt động toàn công ty.
5. OT ban đêm/qua nửa đêm; nghỉ nửa ngày theo nửa ca; sửa loại nghỉ trên web.
6. Push khi app tắt (cần Apple Developer trả phí).

Thiếu về bảo mật/dữ liệu cá nhân (làm trước khi có dữ liệu thật): mã hóa cột số tài khoản ngân hàng, quét virus file tải lên, đặt lại MFA phải đăng xuất
phiên đang mở, quyền của chủ dữ liệu theo NĐ 13 (xem/xuất/xóa), xuất/xóa dữ liệu tenant đã đóng, server chặn chấm công khi chưa đồng ý điều khoản.

Chặn pilot không phải code: chưa test máy thật (checklist trên), chưa merge `main`, chưa staging/production (Supabase project thật, hosting API + 2 web,
SMTP thật — phương án Render Singapore ~$21/tháng trong PROGRESS), chưa phân phối app (TestFlight/Google Play cần tài khoản trả phí), chưa backup/
Sentry, chưa tài liệu hướng dẫn + kênh hỗ trợ, số liệu luật cần SME/luật sư xác nhận, pháp lý dữ liệu ở Singapore (NĐ 13), chưa chọn công ty pilot.

Kỹ thuật: web HR/Console chưa có test tự động riêng (placeholder); màn mobile thiết kế bổ sung chưa có trạng thái QA/ảnh ghép; danh sách lọc trong bộ
nhớ API (đủ vài nghìn nhân viên); gửi lời mời hàng loạt chạy trong request (cần hàng đợi khi SMTP thật).

Quyết định chờ người dùng: phạm vi "phòng ban" có gồm phòng con không (hiện không); vai trò tùy chỉnh + người duyệt thứ hai cho vai trò nhạy cảm; review các
mặc định trong `docs/plans/documents.md`, `console-ops.md`, `org-roles.md`, `employee-import.md`; lịch lễ 2027 (chờ lịch Tết).

Thứ tự đề xuất sau khi thử tay xong: (1) nhập số dư phép đầu kỳ hàng loạt → (2) bảng công tính nghỉ phép + OT → (3) ủy quyền duyệt → (4) báo cáo cơ bản;
song song các mục bảo mật trước khi có dữ liệu thật; quyết định chi phí staging/Apple Developer khi chốt công ty pilot.

## Lưu ý môi trường đã gặp ở cloud (không áp dụng cho Mac)

- Docker daemon phải tự bật (`dockerd`), `supabase` gọi qua `node_modules/.bin`; API chạy bằng script riêng thay `tools/dev-backend.sh` (không có `ipconfig`/Docker Desktop).
- Smoke timesheet từng lỗi một lần ở bước kích hoạt ngay sau reset (Auth chưa sẵn sàng), chạy lại đạt — nếu gặp trên Mac thì đo nguyên nhân trong `tools/db-reset.sh`.
