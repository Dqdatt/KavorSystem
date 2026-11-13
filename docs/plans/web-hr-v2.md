# Web HR v2 — áp thiết kế mới (prototype `Kavor HR Admin Prototype v2.html`)

Người dùng gửi bản thiết kế lại web HR (13/11/2026). Đây là prototype chuẩn mới cho web HR/Admin (bản cũ `Kavor HR Admin Prototype.html`
giữ để tham khảo). Số liệu trong prototype là minh họa — mọi số lấy từ API; chỗ chưa có dữ liệu thì ẩn, không để số giả.

## Quyết định đã chốt (13/11)
- Font **Plus Jakarta Sans** tự host (`packages/web-ui/fonts/`, subset latin + vietnamese) thay Montserrat cho cả web HR và Console; mobile giữ Montserrat.
- **Cài đặt doanh nghiệp lên lại thanh bên** (nhóm Hệ thống), vẫn có trong menu tài khoản. Đăng xuất, giao diện ở menu tài khoản.
- Không chép nút "Điểm mới ở màn này" (`NOTES`, ghi chú của người thiết kế) và số liệu minh họa.
- Thứ tự: P1 nền chung → P2 từng trang (chỉ giao diện) → P3 phần cần API mới.
- Giữ tên class/biến CSS hiện có trong `kavor.css`, chỉ đổi giá trị theo prototype (map ở mục P1) để không phải sửa mọi trang một lúc.

## P1 — nền chung (kavor.css + shell)
Token prototype → tên hiện có: `--brand`→`--primary`, `--brand-strong`→`--primary-hover`, `--ink-3`→`--muted`, `--mint`→`--accent`,
`--brand-soft`→`--accent-2`, `--danger`→`--red`, `--warn`→`--amber`, `--info`→`--blue`; biến mới giữ tên prototype (`--brand-soft`, `--track`,
`--ok`, `--warn-fill`, `--t-gt|np|ot|tu|hs` màu loại đơn…). Class: `.btn.pri`→`.btn.primary`, `.kpi`→`.metric-card`, `.tbl`→`.data-table`,
`.seg/.tabs`→`.segmented`, `.badge`→`.status`, `.av`→`.avatar`, `.fchip`→`.filter-chip`, `.menu`→`.kv-menu`, `.pop`→`.account-pop/.notif-pop`.
Ngăn kéo (`.drawer`) thành hộp thoại giữa màn hình như prototype. Shell: thanh bên trắng 248px (thu gọn 76px), topbar sticky mờ,
nút tài khoản = avatar + tên + vai trò, footer (© Kavor + trạng thái cập nhật trực tiếp).

## P2/P3 — từng trang: prototype ↔ hiện tại ↔ dữ liệu

| Trang prototype | Route | Thay đổi chính | Dữ liệu | Pha |
|---|---|---|---|---|
| Tổng quan | `/` | 4 chỉ số bấm được; **Việc cần xử lý** (đơn quá hạn, chưa mời, thiếu giấy tờ, thiếu công, thiết bị chờ — mỗi dòng một nút); Chấm công hôm nay (lưới chấm + danh sách cần chú ý); thiết lập x/16 ở cuối thanh bên | overview, settings/checklist, attendance/board có. **Chưa có** endpoint gom việc cần xử lý (nguồn rời: requests counts.overdue, timesheets metrics, checklist/gaps, overview.notActivated) | P2 phần có dữ liệu; P3 endpoint `GET admin/tasks` |
| Nhân viên | `/employees` | Bộ lọc nhanh có số đếm (Tất cả/Chưa kích hoạt/Thiếu giấy tờ/Thử việc) thay dropdown; nhóm theo phòng ban; cột Phòng ban+Chức danh gộp; thâm niên; tiến độ hồ sơ; chọn nhiều để gửi lời mời; chỉ hiện ngoại lệ | Thâm niên tính từ hireDate ở web. Tiến độ giấy tờ theo người (đã nộp/bắt buộc) **chưa có** trong danh sách (chỉ "Thiếu N" từ checklist/gaps) | P2; P3 thêm `docsDone/docsRequired` vào danh sách |
| Hồ sơ nhân viên | (drawer trong `/employees`) | **Trang riêng** `/employees/[id]`: thẻ tóm tắt cố định trái, tab phải (Tổng quan · Cá nhân · Chấm công · Lương · Giấy tờ · Đơn từ · Lịch sử) | Các endpoint employees/:id/* có sẵn | P2 |
| Cơ cấu tổ chức | `/organization` | 3 tab Sơ đồ · Đơn vị · Chức danh; thẻ phòng có trưởng đơn vị + thành viên; Sửa/Ngừng vào menu "⋯" | Có | P2 |
| Chấm công | `/attendance` | Tab Hôm nay đứng đầu (người cần chú ý trước, 4 chỉ số); Bảng công tháng = **lưới ngày × người**; khóa kỳ có danh sách điều kiện | Board hôm nay có, **thiếu trạng thái nghỉ phép**. Lưới ngày × người **chưa có** một API. Điều kiện khóa chỉ có số đếm | P2 bố cục; P3 board thêm nghỉ phép, `GET timesheets/grid?month`, danh sách vướng khi khóa |
| Ca & địa điểm | `/schedules` | Gộp 3 tab thành một trang: ca (thanh thời gian + ngày trong tuần), địa điểm (bản đồ bán kính trên thẻ), phạm vi áp dụng | Có | P2 |
| Nghỉ phép | `/leave` | Tab Tổng quan · Lịch nghỉ · Số dư phép; số dư vẽ bằng vạch; form điều chỉnh sau một nút | **Lịch nghỉ tháng chưa có** endpoint | P2; P3 `GET leave/calendar?month` |
| Đơn & phê duyệt | `/requests` | **Hộp thư 2 cột** (danh sách trái, chi tiết phải, Duyệt/Từ chối dưới cùng); tab Cần tôi duyệt · Đang chờ người khác · Đã xử lý; quá hạn lên đầu; chi tiết có dữ liệu quyết định (số dư phép, chấm công thực tế, hạn mức) | requests, requests/:id có; cần kiểm requests/:id đã trả số dư/chấm công/hạn mức chưa | P2 (+ P3 nếu thiếu dữ liệu quyết định) |
| Lương & tạm ứng | `/payroll` | Tab Bảng lương kỳ này · Mức lương · Khoản phụ cấp; **thanh 4 bước kỳ lương**; biểu đồ quỹ lương theo tháng; bộ lọc "Cần rà soát" | Tổng quỹ lương theo tháng **chưa có** (phải cộng từng kỳ). Chỉ vai trò có quyền lương | P2; P3 `GET payroll/summary` (tự review — dính tiền) |
| Tài liệu | `/documents` | Tab Tài liệu · Thiếu hồ sơ (ai thiếu gì + nút nhắc) · Danh mục giấy tờ; hết hạn hiện trên dòng | checklist/gaps có; "nhắc" chưa có | P2; nút nhắc để sau |
| Bản tin | `/announcements` | Thanh tỷ lệ đã đọc mỗi bài; chi tiết 2 phần (nội dung + người chưa đọc); soạn trong hộp thoại rộng | recipients/reads/readers **có** | P2 |
| Vai trò & phân quyền | `/roles` | Ma trận Xem / Sửa / Duyệt theo phân hệ thay mã quyền; cảnh báo vai trò chưa ai gán; người được gán cùng màn | Map mã quyền → (phân hệ, mức) làm ở web từ roles; tự review (phân quyền) | P2 |
| Cài đặt doanh nghiệp | `/settings` | 7 tab ngang → **menu dọc có nhóm**; quy định hiện thẻ số | Có | P2 |
| Đăng nhập | `/login` | Thẻ kính giữa nền mờ, ô có icon, Ghi nhớ / Quên mật khẩu | Có | P2 |
| Tìm nhanh Ctrl K | (topbar) | Hộp thoại tìm trang + nhân viên + đơn | **Chưa có** (API employees?q có) | P3 |

## Cách kiểm mỗi trang (web)
Chụp prototype (state tương ứng, theme sáng, 1440 px và 390 px) và trang thật cùng kích thước bằng trình duyệt trong app, đặt cạnh nhau, liệt kê
lệch → sửa → chụp lại. Đổi CSS dùng chung thì chụp lại mọi trang + Console. `bash tools/verify-all.sh --quick` trước mỗi commit.
