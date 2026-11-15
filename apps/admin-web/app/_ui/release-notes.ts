/* Nội dung tĩnh cho "Ghi chú phiên bản" (chân trang) và "Điểm mới ở màn này" (topbar), theo prototype v2 (pop:ver, pop:notes).
   Chỉ ghi điều web đã làm thật; cập nhật khi đổi phiên bản trong apps/admin-web/package.json. */

export const RELEASE_DATE = "15/11/2026";
export const RELEASE_ITEMS = [
  "Giao diện mới cho các phân hệ web HR",
  "Đơn & phê duyệt dạng hộp thư hai cột",
  "Lịch nghỉ phép theo tháng",
  "Hồ sơ nhân viên mở thành trang riêng",
  "Nhập nhân viên từ file Excel/CSV bất kỳ, có file mẫu",
  "Tìm nhanh bằng Ctrl K",
];

/* Khóa = đường dẫn trang ("/employees/[id]" cho hồ sơ). Trang không có khóa thì ẩn nút Điểm mới. */
export const PAGE_NOTES: Record<string, string[]> = {
  "/": [
    "Trang chủ là nơi xử lý việc: đơn quá hạn, chưa mời, thiếu giấy tờ, thiếu công gom vào một danh sách có nút hành động.",
    "Tiến độ thiết lập ban đầu hiện ngay trên trang chủ và thanh bên.",
    "4 chỉ số trên cùng bấm được để mở trang tương ứng.",
  ],
  "/employees": [
    "Bộ lọc nhanh có số đếm; chọn nhiều dòng để gửi lời mời hàng loạt.",
    "Gộp chức danh và phòng ban vào một cột, thêm thâm niên và tiến độ giấy tờ.",
    "Trạng thái hồ sơ chỉ hiện cạnh tên khi khác Đang làm việc.",
  ],
  "/employees/[id]": [
    "Hồ sơ mở thành trang riêng, nội dung chia theo tab.",
    "Tab Tổng quan cho biết làm ở đâu, ca nào, còn bao nhiêu phép.",
    "Giấy tờ dạng checklist có vạch tiến độ, dòng chưa nộp có nút Đánh dấu đã nộp.",
  ],
  "/organization": [
    "Tách thành 3 tab: Sơ đồ, Đơn vị, Chức danh.",
    "Mỗi phòng trên sơ đồ hiện trưởng đơn vị và thành viên, bấm vào để xem danh sách.",
    "Sửa/Ngừng gom vào menu cuối dòng, bảng nhẹ hơn.",
  ],
  "/attendance": [
    "Tab Hôm nay đứng đầu, người cần chú ý (chưa vào ca, đi muộn) xếp trước.",
    "Bảng công dạng lưới ngày × người, nhìn một lần thấy ai thiếu công ngày nào.",
    "Khóa kỳ công có danh sách điều kiện, biết còn vướng gì trước khi khóa.",
  ],
  "/schedules": [
    "Ca, địa điểm và phạm vi áp dụng nhìn cùng một trang.",
    "Ca làm hiển thị bằng thanh thời gian và ngày trong tuần.",
    "Địa điểm có bản đồ bán kính ngay trên thẻ.",
  ],
  "/leave": [
    "Lịch nghỉ theo tháng: biết hôm nay và sắp tới ai vắng, đơn nào còn chờ duyệt.",
    "Số dư phép vẽ bằng vạch, mỗi vạch một ngày phép.",
    "Sổ phép: số dư ở trên, form điều chỉnh thu gọn sau một nút.",
  ],
  "/requests": [
    "Dạng hộp thư: danh sách bên trái, chi tiết bên phải, Duyệt/Từ chối luôn ở dưới cùng.",
    "Tab chính là Cần tôi duyệt, đơn sắp hết hạn xử lý xếp trước.",
    "Đơn làm thêm hiện sẵn chấm công thực tế để đối chiếu.",
  ],
  "/payroll": [
    "Thanh 4 bước của kỳ lương cho biết đang ở đâu và bước nào đang chặn.",
    "Cảnh báo lặp lại được gom thành bộ lọc Cần rà soát.",
  ],
  "/documents": [
    "Danh mục giấy tờ có tab riêng.",
    "Tab Thiếu hồ sơ liệt kê ai thiếu giấy tờ gì, kèm nút mở hồ sơ.",
    "Trạng thái hết hạn hiển thị ngay trên dòng.",
  ],
  "/announcements": [
    "Bài đã gửi hiện số đã đọc, tỷ lệ % và dãy vạch tiến độ.",
    "Chi tiết bài gồm nội dung và danh sách người chưa đọc.",
    "Soạn bài trong hộp rộng, tùy chọn xuất bản đặt cuối.",
  ],
  "/roles": [
    "Quyền hiển thị dạng ma trận Xem / Sửa / Duyệt theo phân hệ thay cho mã kỹ thuật.",
    "Vai trò chưa có ai được gán được cảnh báo ngay trên danh sách.",
    "Người được gán và nút gán nằm cùng màn hình.",
  ],
  "/settings": [
    "Cài đặt có mục riêng trên thanh bên, không còn ẩn trong menu tài khoản.",
    "Các tab ngang đổi thành menu dọc có nhóm.",
    "Quy định hiển thị tham số dạng danh sách nhãn–giá trị gọn.",
  ],
};
