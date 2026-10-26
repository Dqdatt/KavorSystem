# Cải thiện UI web HR + Kavor Console (phản hồi người dùng 26/10) — kế hoạch, chưa làm

Người dùng thử web trên Mac và góp ý (kèm ảnh): giao diện chưa đẹp, nhiều lỗi căn hàng, dropdown giống của hệ điều hành, thiếu bản đồ chọn vị
trí chấm công, dùng nhiều từ tiếng Anh ("tenant"…), tiêu đề lặp (topbar + page-head + header modal). Mục tiêu: **giống tinh thần app mobile
(sáng, bo tròn, liquid glass nhẹ) nhưng gọn để thao tác nhanh, có theme sáng/tối**. Người dùng: "nếu fix được thì plan ra, mai fix, không thì
note cho Claude Desktop".

## Hiện trạng đo được (26/10, nhánh `claude/ecstatic-pascal-dblg7v`)

- CSS: `apps/admin-web/app/kavor-desktop.css` và `apps/console-web/app/kavor-desktop.css` **giống hệt nhau** (bản sao), cộng `admin.css` /
  `console.css` riêng. Có biến màu ở `:root` nhưng còn **82 mã màu viết cứng** → chưa đổi theme được. `packages/web-ui` có `styles.css` +
  `DashboardShell` không còn ai dùng.
- **Lỗi căn hàng ở form (ảnh "Phiên bản mới · Văn phòng Quận 1")**: `.field { display: grid; gap: 6px }` thiếu `align-content: start` → khi ô
  bên cạnh có dòng gợi ý (`<small>`) cao hơn, ô không có gợi ý bị kéo giãn và ô nhập tụt xuống. Lỗi ở CSS dùng chung nên xảy ra ở **mọi form 2
  cột có gợi ý** (địa điểm, nhân viên, nhập file, gán vai trò…). Sửa 1 dòng, rồi chụp lại toàn bộ modal.
- Dropdown: **40 chỗ dùng `<select>` gốc** của trình duyệt (`.select`, `.field select`) → menu xổ xuống là của hệ điều hành, lệch hệ thống.
- Lặp tiêu đề (ảnh "Cài đặt doanh nghiệp"): topbar (`shell.tsx`, `TITLES[path]`) in tên trang, ngay dưới mỗi trang lại có `page-head` h2 + mô tả
  (12 trang web HR, 5 trang Console có `page-head`), modal lại có `modal-head` h3 + sub → 3 tầng chữ. AGENTS.md đã yêu cầu "tránh lặp title/header".
- Từ tiếng Anh trong giao diện: "tenant" ~80 chỗ, "Tenant Admin" 21, "Console" 10, "audit" 14, "MFA" 5, "SLA" 3, "workflow" 3, "Support access",
  "Primary region", "Database mode", "Trial", "Platform"… (đếm thô bằng grep chuỗi trong JSX).
- Địa điểm chấm công: chỉ nhập vĩ độ/kinh độ + nút "Dùng vị trí hiện tại của trình duyệt" (`apps/admin-web/app/(app)/schedules/page.tsx`).
  Phiên cloud **không tải được tile OpenStreetMap** (proxy chặn) → phần bản đồ phải kiểm trên Mac.

## Kế hoạch (thứ tự làm; mỗi bước: sửa → chụp lại các trang bị ảnh hưởng → verify-all)

1. **Sửa lỗi nhanh, rủi ro thấp** (làm được trên cloud)
   - `.field { align-content: start }`; kiểm tra các lưới khác (`.grid`, `.detail-row`, `.row-actions`, toolbar) bằng ảnh chụp từng trang ở
     1440×900 và 1280×800; sửa căn lề nút/ô lọc trên cùng một hàng (chiều cao 36px thống nhất cho input/select/button nhỏ).
   - Rà chữ tràn, bảng tràn ngang, khoảng cách card không đều; liệt kê lỗi thành checklist kèm ảnh trước/sau.
2. **Bỏ lặp tiêu đề** (cloud)
   - Topbar giữ tên khu vực + ngày; bỏ h2 trùng ở `page-head`, chỉ giữ một dòng mô tả ngắn (hoặc bỏ nếu thừa) + nút hành động thẳng hàng với
     bộ lọc. Modal: một tiêu đề, phụ đề chỉ khi có thông tin mới (không nhắc lại tên trang). Áp cho cả hai web.
3. **Việt hóa thuật ngữ** (cloud) — bảng từ thống nhất, đặt trong `packages/contracts` hoặc file nhãn chung để hai web dùng chung:
   tenant → "doanh nghiệp/công ty", Tenant Admin → "Quản trị viên công ty", Console → "Bảng điều khiển Kavor" (giữ tên sản phẩm "Kavor Console"
   ở trang đăng nhập), Support access → "Quyền hỗ trợ", audit/Audit log → "Nhật ký hoạt động", MFA → "Xác thực hai lớp", SLA → "Hạn xử lý",
   workflow → "Luồng duyệt", Trial → "Dùng thử", Primary region → "Vùng lưu trữ", Database mode → "Cách lưu dữ liệu", Platform → "Nền tảng",
   HR Operations/Payroll/Manager/Auditor → "Nhân sự vận hành/Kế toán/Quản lý/Kiểm soát". Mã kỹ thuật (mã tenant, mã quyền) giữ nguyên.
   **Hỏi người dùng duyệt bảng từ trước khi thay hàng loạt.**
4. **Hệ thống thiết kế dùng chung + theme** (cloud làm được, nên chốt hướng với người dùng bằng 1–2 ảnh mẫu trước)
   - Gộp CSS chung vào `packages/web-ui` (một nguồn cho hai web), xóa bản sao; đổi 82 màu cứng sang biến; thêm bộ biến **theme tối** +
     nút chuyển theme (theo hệ thống / sáng / tối, nhớ trong localStorage).
   - Tinh thần mobile: nền gradient nhẹ, card bo 14–16px, bóng mềm, sidebar mờ (glass nhẹ, không lạm dụng blur), cân nhắc đổi font web từ Inter (`--font`
     trong `kavor-desktop.css`) sang Montserrat như app — hỏi người dùng, màu chủ đạo xanh `#065F46` của app.
   - **Dropdown tự vẽ** (component `Select` có tìm kiếm khi nhiều mục, bàn phím ↑↓/Enter/Esc, đúng theme) thay 40 chỗ `<select>`; date picker
     đồng bộ theme nếu được.
   - Chụp lại **toàn bộ** trang hai web sau khi đổi component dùng chung (AGENTS.md: đổi component dùng chung thì chụp lại toàn bộ).
5. **Bản đồ chọn vị trí chấm công** (code được trên cloud, **kiểm hiển thị trên Mac** vì cloud không tải được tile)
   - Leaflet + tile OpenStreetMap (miễn phí, cần ghi nguồn "© OpenStreetMap"; lượng dùng lớn/production cân nhắc nhà cung cấp tile có key) trong
     modal phiên bản địa điểm: ghim kéo thả, vòng tròn bán kính vẽ theo ô "Bán kính", ô tìm địa chỉ (Nominatim, giới hạn tần suất) + nút "vị trí
     hiện tại"; vĩ độ/kinh độ vẫn hiện để chỉnh tay. Tải bản đồ phía client (`dynamic import`, không SSR).
   - Thay luôn mục "bản đồ chọn vị trí chưa có" trong PROGRESS.

## Kiểm tra / bằng chứng
- Mỗi bước: ảnh trước/sau từng trang (Playwright, 1440×900 + 1280×800, theme sáng + tối), `pnpm typecheck`, `bash tools/verify-all.sh`.
- Không đổi hành vi nghiệp vụ; smoke API không đổi. Trang nào đổi bố cục nhiều thì chạy lại các script E2E trình duyệt đã dùng (nằm trong
  scratchpad phiên cloud — Desktop viết lại nếu cần).
- Mobile không nằm trong kế hoạch này (xem `docs/plans/mobile-ui-feedback.md`).
