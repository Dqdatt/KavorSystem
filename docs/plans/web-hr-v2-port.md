# Quy trình port 1 trang web HR v2 (cho agent laptrinh)

Mục tiêu: trang thật **giống prototype 100%** (bố cục, thứ tự, chữ, cỡ, màu, khoảng cách, trạng thái) — số liệu lấy từ API thật.

1. Đọc `AGENTS.md` (Quy ước UI), `docs/plans/web-hr-v2.md` (map class/biến ở mục P1, bảng dữ liệu từng trang).
2. Đọc đoạn prototype `Kavor HR Admin Prototype v2.html` của trang (JS `PAGES['<route>']`, `DRAWERS.*` liên quan, CSS class nó dùng)
   và file trang hiện tại + component nó gọi. Không đoán tên API/cột: xem `packages/contracts/src/index.ts`, `apps/api/src`.
3. Port nguyên văn: chép giá trị CSS (px, màu qua biến, weight), chữ tiếng Việt đúng từng ký tự, thứ tự khối/cột/tab.
   Tên class hiện có theo map (`.status` = `.badge`, `.btn.primary` = `.btn.pri`, `.segmented` = `.tabs/.seg`, `.data-table` = `.tbl`,
   `.card-head/.card-body` = `.hd/.bd`…); class mới thêm vào cuối `packages/web-ui/src/kavor.css` trong khối có chú thích tên trang.
   Không hex cứng, chữ ≥ 12px (prototype 11/11.5px → 12px), Dropdown dùng `Select` của `@kavor/web-ui`.
   Component dùng chung đã có: `Dl`, `Section`, `Person`, `Avatar`, `Status`, `PageActions`, `Modal`, `Empty`, `tenure` (`_ui/kit.tsx`),
   `RequestDetail/RequestModal/TypeBadge` (`_ui/request.tsx`), class `.tl .pt .ticks .ringw .tile .cap .param(s) .dl .receipt .inset .actbar .cb .bulk .tog .tfoot`.
4. Giữ mọi chức năng/quyền hiện có (không bỏ hành động); chức năng prototype mà API chưa có:
   - Nếu chỉ cần thêm trường/bộ lọc nhỏ vào endpoint có sẵn (dữ liệu đã tính sẵn trong service): thêm vào contracts + API + 1 kiểm ở smoke tương ứng
     (`tools/<module>-smoke.sh`, mẫu gán `_s1=$(…) || :` rồi `check`). Không đụng migration, không đụng logic tiền/lương/quyền.
   - Nặng hơn (endpoint mới, bảng mới, logic nghiệp vụ mới): KHÔNG làm; dựng đúng vị trí khối và ghi vào báo cáo "cần API".
   - Nút chỉ là thông báo giả trong prototype (toast, "Nhắc…") mà không có API: bỏ, ghi vào báo cáo.
5. Kiểm: `pnpm --filter @kavor/admin-web typecheck` (+ `@kavor/api typecheck` nếu sửa API). KHÔNG `next build` trong thư mục app, KHÔNG khởi động lại
   dev server/API (sửa API thì ghi rõ "cần restart API" trong báo cáo).
6. Đối chiếu ảnh (bắt buộc, dùng trình duyệt trong app `mcp__Claude_Browser__*`):
   - Prototype: http://localhost:8765/v2.html → chạy JS `document.documentElement.dataset.theme='light'; S.auth='in'; S.route='<route>'; S.tab['<key>']='<tab>'; render()`.
   - Trang thật: http://localhost:3000/<route> (đã đăng nhập HR Admin HD0007 sẵn trong pane; nếu bị đá ra login thì dừng và báo).
   - Cả hai ở `resize_window` 1440×900, colorScheme light; chụp từng tab/trạng thái, so từng khối; sửa; chụp lại tới khi chỉ còn khác do dữ liệu.
   - Kiểm thêm 390px: không tràn ngang (`document.documentElement.scrollWidth <= 390`).
7. Không commit. Báo cáo ngắn: file sửa, kết quả kiểm (dán), danh sách lệch còn lại + lý do, "cần API", chức năng bỏ.
