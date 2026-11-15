# Checklist màn web HR v2 ↔ prototype (15/11/2026)

Nguồn: `Kavor HR Admin Prototype v2.html` (P = dòng) so với `apps/admin-web/app` (W). Dùng để rà "giống prototype" từng màn.

## Prototype có, web chưa có
| Màn | Proto | Loại |
|---|---|---|
| Điểm mới ở màn này (topbar) | pop:notes P1090 | Đã làm: nội dung `_ui/release-notes.ts`, chỉ ghi điều web có thật |
| Ghi chú phiên bản (popover chân trang) | pop:ver | Đã làm: cập nhật `release-notes.ts` khi đổi phiên bản |
| Hồ sơ của tôi (menu tài khoản) | P1097 | Đã làm |
| Điều khoản sử dụng | ov:legal:terms P1526 | cần nội dung điều khoản |
| Tạm nghỉ nhân viên | ov:pause P1540 | tính năng mới (trạng thái NV, chấm công, lương) |
| Cho nghỉ việc | ov:offboard P1539 | tính năng mới (khóa tài khoản, lương cuối, phép) — nhạy cảm |
| Kết thúc áp dụng ca/địa điểm | ov:end-apply P1542 | API có `effectiveTo`? cần kiểm |
| Thêm khoản phụ cấp mẫu | allow-sample P1547 | Đã làm: hộp tick chọn, API nhận `names`; mẫu ở contracts `PAY_ITEM_TEMPLATES` |
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
| Đơn › chi tiết + luồng duyệt | Gần giống. Đã sửa: "Lý do" đứng trước "Chấm công gốc". Đã sửa: thẻ người gửi "chức danh | phòng ban | mã" (API `requester.position`) |
| Cơ cấu › chi tiết đơn vị | Đã sửa: dòng phụ dùng vạch `|` (cả gốc sơ đồ "Pháp nhân | N nhân sự") |
| Bản tin › chi tiết bài | Đã sửa: đầu = tiêu đề bài + "loại | người đăng | xuất bản …"; nhãn trạng thái và nút Sửa/Gỡ cùng một hàng; dòng "đã gửi" nằm trong khối Đã đọc; danh sách Chưa đọc bỏ nhãn "Chưa đọc" thừa. Đã sửa: "Chưa có app" từng người (API `hasApp` = đã kích hoạt, kể cả đang khóa). Chưa có: nút "Nhắc" (việc riêng), ghi chú mời kích hoạt |
| Tài liệu | Đã sửa nhãn "Lượt truy cập tuần này". Online chưa có tài liệu nào → chi tiết tài liệu so ở local |
| Vai trò › ma trận quyền | Bố cục giống; số liệu khác do dữ liệu thật (vùng nhạy cảm, không đụng) |
| Hồ sơ › Thuế và bảo hiểm | Đã sửa: "Người phụ thuộc" ngay sau MST, trống = "0"; dòng phụ người phụ thuộc dùng vạch |
| Mọi trang | Đã sửa: "·" ở dòng phụ → vạch (`vs()` / `<i className="vs" />`); tiêu đề hộp "X: Tên". Giữ "·" ở ô chọn (prototype cũng vậy), toast, tooltip |

## Đợt so local 15/11/2026 (hộp thoại thao tác, tài khoản thử HD0007)
| Màn | Kết quả |
|---|---|
| Mọi hộp thoại | Đã sửa: nút Hủy/Đóng/Để sau kiểu ghost (chữ, không viền) như prototype — 39 chỗ |
| Khóa kỳ công | Đã sửa tiêu đề "Khóa kỳ công 11/2026". Web giữ thêm ô Ghi chú và nút "Vẫn khóa kỳ" khi còn lỗi (có chủ đích) |
| Chốt bảng lương | Lệch: web khóa nút "Chốt bảng" + băng cảnh báo khi kỳ công chưa khóa; prototype mở hộp liệt kê 4 bước (Khóa kỳ công, Rà soát đầu vào, Lương cơ bản, Quy chế) + nút "Mở bảng công". Gộp vào việc trang Lương [opus xhigh] |
| Gán vai trò | Đã sửa: "Chọn nhân viên", "Đến" + gợi ý "Không bắt buộc". Web giữ thêm ô Tìm nhân viên |
| Thu hồi vai trò | Đã sửa: quản trị viên duy nhất → hộp cảnh báo + "Gán người khác" như prototype (DB vẫn chặn LAST_TENANT_ADMIN) |
| Ngừng ca / địa điểm | Đã sửa: API chặn 409 khi còn lượt áp dụng đang/sắp hiệu lực (hr-smoke có bước kiểm); web có hộp chặn "Áp dụng ca khác" và hộp "Xác nhận ngừng" như prototype |
| Ngừng đơn vị | Web: hộp xác nhận + API báo lỗi khi còn người; prototype chặn trước ("Xem sơ đồ"). Lệch nhẹ |
| Form người phụ thuộc | Đã sửa: tiêu đề "Thêm người phụ thuộc: Tên", dòng phụ, "Họ và tên", "Mã số thuế" + Không bắt buộc, nút "Thêm người phụ thuộc". Web giữ "Đến tháng"; Quan hệ là ô chữ (prototype: chọn) |
| Nhập file nhân viên | Lệch lớn: prototype 3 bước (tải mẫu, kéo thả, xem trước); web chỉ ô chọn file. Gộp với việc "Tải mẫu .xlsx" |
| Mời kích hoạt | Đã sửa: tiêu đề, dòng phụ "N nhân viên…", ghi chú xanh, danh sách thẻ người (8 + "và N người khác"), nút "Gửi N lời mời" |
| Chi tiết tài liệu | Đã sửa: đầu = tên tài liệu + "danh mục, nhân viên", khối khóa–giá trị (thêm Số hiệu, Phiên bản "N | tải lên"), note sắp hết hạn. Web giữ hàng nút trên (Mở, Tải phiên bản mới, Sửa, Gỡ) và bảng phiên bản; chưa có khung xem trước (prototype chỉ minh họa) |

## Màn đã có ở web (cần so giao diện)
Thanh bên, promo thiết lập, Tìm nhanh, Thông báo, Menu tài khoản, Đăng nhập, Tổng quan, Mời kích hoạt, Nhân viên (+ nhóm phòng ban, nhập file, thêm), Hồ sơ 7 tab (+ sửa, đổi lương, người phụ thuộc), Chấm công tháng một người, tải tài liệu, Lịch sử, Cơ cấu (sơ đồ, đơn vị, chức danh, chi tiết, thêm), Chấm công (hôm nay, bảng tháng, khóa kỳ, OT, bản ghi từ chối, thiết bị), Ca & địa điểm (tạo ca, địa điểm, áp dụng), Nghỉ phép 3 tab, Đơn 3 tab + chi tiết + luồng duyệt, Lương (bảng kỳ này, chốt, mức lương, phụ cấp, tính thử), Tài liệu 3 tab + danh mục, Bản tin 5 tab + tạo/xuất bản, Vai trò (+ gán), Cài đặt (doanh nghiệp, thiết lập, kỳ công & lương, quy định, ngày lễ, dữ liệu cá nhân, hỗ trợ).
