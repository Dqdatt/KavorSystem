# Bàn giao từ phiên cloud → Claude Desktop (Mac)

> Đọc file này **trước** khi làm tiếp trên Mac. Phiên cloud (Claude Code trên web, container Linux) không có Mac/Xcode/iPhone/Android emulator,
> nên mọi thứ dưới đây mới được kiểm bằng: `bash tools/verify-all.sh` (typecheck, unit, pgTAP, smoke API thật, build, lint DB), trình duyệt tự động
> (Playwright headless) cho web, và test hành vi mobile trong Node (`pnpm --filter @kavor/mobile test`). **Chưa có gì chạy trên simulator hay iPhone.**
>
> Nhánh: `claude/ecstatic-pascal-dblg7v` (chưa merge vào `main`). Người dùng giao (26/10): "đang dùng cloud nên cứ làm tiếp, done thì push,
> log lại để Desktop biết chỗ nào push nhưng còn thiếu gì, chưa test gì". Cập nhật file này sau **mỗi** lần push từ cloud.

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
| `docs: file bàn giao` (sau `fc488df`) | File này + trỏ từ PROGRESS/AGENTS | — | — | — |
| commit "Web HR: cơ cấu tổ chức + vai trò & phân quyền" | Trang `/organization` (sơ đồ, cây, thêm/sửa/ngừng đơn vị, chức danh) và `/roles` (5 vai trò mẫu, gán theo phạm vi + ngày hiệu lực, thu hồi); quyền `role.assign`, `organization.manage` | verify-all (pgTAP 451, smoke org 41), web tự động (sơ đồ, thêm phòng con, ngừng bị chặn, gán + thu hồi) | Không có phần mobile. Phạm vi phòng ban **không gồm phòng con**; chưa có vai trò tùy chỉnh, import cơ cấu, người duyệt thứ hai cho vai trò nhạy cảm | `docs/plans/org-roles.md` (phạm vi cho từng vai trò, chỉ Tenant Admin gán, ngừng = đặt ngày kết thúc) |
| commit "Nhập nhân viên hàng loạt từ CSV" | Nhân viên → Nhập từ file (xem trước, chỉ nhập khi cả file sạch, nguyên khối); `import_employees`; file mẫu `sample-data/employees_import_sample.csv`; sửa test `hr_rls` không đếm cứng | verify-all (pgTAP 460, smoke import 14), web tự động (file lỗi → khóa nút; file mẫu → nhập 3 người) | Không có phần mobile. Chưa cập nhật hồ sơ cũ bằng file, chưa .xlsx/Google Sheets trực tiếp, chưa gửi lời mời hàng loạt; người dùng chưa thử bằng file Excel thật (dấu phẩy/chấm phẩy theo vùng) | `docs/plans/employee-import.md` (CSV, cột, bỏ qua mã đã có, tối đa 1.000 dòng) |

## Lưu ý môi trường đã gặp ở cloud (không áp dụng cho Mac)

- Docker daemon phải tự bật (`dockerd`), `supabase` gọi qua `node_modules/.bin`; API chạy bằng script riêng thay `tools/dev-backend.sh` (không có `ipconfig`/Docker Desktop).
- Smoke timesheet từng lỗi một lần ở bước kích hoạt ngay sau reset (Auth chưa sẵn sàng), chạy lại đạt — nếu gặp trên Mac thì đo nguyên nhân trong `tools/db-reset.sh`.
