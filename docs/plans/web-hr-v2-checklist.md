# Checklist màn web HR v2 ↔ prototype (15/11/2026)

Nguồn: `Kavor HR Admin Prototype v2.html` (P = dòng) so với `apps/admin-web/app` (W). Dùng để rà "giống prototype" từng màn.

## Prototype có, web chưa có
| Màn | Proto | Loại |
|---|---|---|
| Điểm mới ở màn này (topbar) | pop:notes P1090 | UI, nội dung tĩnh |
| Ghi chú phiên bản (popover chân trang) | pop:ver | UI, nội dung tĩnh |
| Hồ sơ của tôi (menu tài khoản) | P1097 | UI, trỏ hồ sơ sẵn có |
| Điều khoản sử dụng | ov:legal:terms P1526 | cần nội dung điều khoản |
| Tạm nghỉ nhân viên | ov:pause P1540 | tính năng mới (trạng thái NV, chấm công, lương) |
| Cho nghỉ việc | ov:offboard P1539 | tính năng mới (khóa tài khoản, lương cuối, phép) — nhạy cảm |
| Kết thúc áp dụng ca/địa điểm | ov:end-apply P1542 | API có `effectiveTo`? cần kiểm |
| Thêm khoản phụ cấp mẫu | allow-sample P1547 | UI + dữ liệu mẫu |
| Xem số tài khoản (drawer) | ov:bank P1549 | dữ liệu nhạy cảm, phân quyền |
| Tải mẫu .xlsx khi nhập NV | P1269 | file mẫu |
| Xem trước tài liệu / yêu cầu tài liệu | ov:docview P1552, docreq P1553 | drawer + API yêu cầu |

## Khác có chủ đích (đã chốt, không tính lỗi)
Đăng nhập có MFA/OTP; Quên mật khẩu đi qua OTP; Tìm nhanh không có nhóm "Đơn"; chi tiết đơn là modal; Kỳ lương, tab Tạm ứng, Thuế & công đoàn, sắp cấp bậc tự động, sửa tài liệu, gỡ/xóa bài là phần web thêm; ô tìm Bản tin/Tài liệu, dropdown "Đang làm việc"; không làm nút giả.

## Chưa chắc (cần mở xem)
Sổ phép nhân viên (P1394), chi tiết bài + người đọc (P1479), ma trận quyền (P1485), cảnh báo người duy nhất khi thu hồi vai trò (P1550), ngừng giấy tờ / ca / địa điểm / chi nhánh (P1536, P1365).

## Đợt so 15/11/2026 (1280px, sáng, dữ liệu thử local)
| Màn | Kết quả |
|---|---|
| Hồ sơ › Lương | Đã sửa: lịch sử lương = số in đậm + dòng phụ `|`; nút Đổi lương icon bút |
| Hồ sơ › Giấy tờ | Giống (web thêm "Sửa"/"Khác…", ghi nhận bản chính) |
| Hồ sơ › Đơn từ | Prototype chỉ có trạng thái rỗng; web là bảng đơn |
| Hồ sơ › Lịch sử | Đã sửa: thiếu nhãn hành động (checklist.updated…), dòng phụ dùng `|` |
| Topbar ≤1280px | Đã sửa: ô Tìm nhanh thu thành nút tròn (bị rule 170px đè) |
| Hộp thoại (mọi Modal) | Đã sửa: nút đóng = icon × nền trong 36px |
| Đổi lương | Đã sửa: tiêu đề "Đổi lương: Tên", nút "Lưu mức lương mới". Placeholder phụ cấp prototype "Mặc định …" — web "0" (khoản mẫu chưa có mức mặc định) |
| Ngăn kéo (Drawer) | Đã sửa: đầu = tiêu đề 20px + dòng phụ 13px + nút đóng phải. Không có chân "Mở hồ sơ / Đóng" như prototype |
| Chấm công một người | Đã sửa: thêm lịch tháng như prototype (giữ bảng Từng ngày) |
| Sổ phép | Đã sửa: tiêu đề "Sổ phép: Tên", "năm 2026", khối khóa–giá trị, thanh gập Điều chỉnh, Biến động dạng dòng thời gian |
| Trang Lương (kỳ này) | Lệch lớn (quỹ lương nhiều kỳ, cơ cấu quỹ) — việc riêng [opus xhigh] |

## Đợt so online 15/11/2026 (kavor-system.vercel.app, chỉ xem: dữ liệu thật, không bấm lưu/gửi)
Bản online đã có `64b9461` và `127dbc4` (kiểm chuỗi trong JS đã build); API `/health` ok.
| Màn | Kết quả |
|---|---|
| Đơn › chi tiết + luồng duyệt | Gần giống. Đã sửa: "Lý do" đứng trước "Chấm công gốc". Prototype có chức danh trong thẻ người gửi; API `requester` chưa có chức danh |
| Cơ cấu › chi tiết đơn vị | Đã sửa: dòng phụ dùng vạch `|` (cả gốc sơ đồ "Pháp nhân | N nhân sự") |
| Bản tin › chi tiết bài | Đã sửa: đầu = tiêu đề bài + "loại | người đăng | xuất bản …"; nhãn trạng thái và nút Sửa/Gỡ cùng một hàng; dòng "đã gửi" nằm trong khối Đã đọc; danh sách Chưa đọc bỏ nhãn "Chưa đọc" thừa. Chưa có: "Chưa có app" từng người, nút "Nhắc" (việc riêng), ghi chú mời kích hoạt |
| Tài liệu | Đã sửa nhãn "Lượt truy cập tuần này". Online chưa có tài liệu nào → chi tiết tài liệu so ở local |
| Vai trò › ma trận quyền | Bố cục giống; số liệu khác do dữ liệu thật (vùng nhạy cảm, không đụng) |
| Hồ sơ › Thuế và bảo hiểm | Đã sửa: "Người phụ thuộc" ngay sau MST, trống = "0"; dòng phụ người phụ thuộc dùng vạch |
| Mọi trang | Web còn ~50 chỗ dùng "·" ở dòng phụ/tiêu đề, prototype dùng vạch `|` — đổi dần theo từng màn |

Còn phải so ở local (cần bấm mở hộp thoại thao tác): khóa kỳ công, chốt bảng lương, gán/thu hồi vai trò, ngừng ca/địa điểm/đơn vị, form người phụ thuộc, nhập file, mời kích hoạt, chi tiết tài liệu.

## Màn đã có ở web (cần so giao diện)
Thanh bên, promo thiết lập, Tìm nhanh, Thông báo, Menu tài khoản, Đăng nhập, Tổng quan, Mời kích hoạt, Nhân viên (+ nhóm phòng ban, nhập file, thêm), Hồ sơ 7 tab (+ sửa, đổi lương, người phụ thuộc), Chấm công tháng một người, tải tài liệu, Lịch sử, Cơ cấu (sơ đồ, đơn vị, chức danh, chi tiết, thêm), Chấm công (hôm nay, bảng tháng, khóa kỳ, OT, bản ghi từ chối, thiết bị), Ca & địa điểm (tạo ca, địa điểm, áp dụng), Nghỉ phép 3 tab, Đơn 3 tab + chi tiết + luồng duyệt, Lương (bảng kỳ này, chốt, mức lương, phụ cấp, tính thử), Tài liệu 3 tab + danh mục, Bản tin 5 tab + tạo/xuất bản, Vai trò (+ gán), Cài đặt (doanh nghiệp, thiết lập, kỳ công & lương, quy định, ngày lễ, dữ liệu cá nhân, hỗ trợ).
