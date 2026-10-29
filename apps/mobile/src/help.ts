/* Hướng dẫn sử dụng cho nút "?" trên thanh tiêu đề (phản hồi người dùng 26/10, mục 8). Viết cho nhân viên, không chứa số nghiệp vụ
   (hạn mức, số lượt, hệ số…) — các con số đó do công ty cấu hình và đã hiện ngay trên màn. Ghi chú QA của prototype nằm ở sheets.tsx. */
import type { Route } from "./store";

export type Guide = { title: string; steps: string[] };

export const GUIDES: Partial<Record<Route, Guide>> = {
  clock: { title: "Chấm công", steps: [
    "Đến địa điểm làm việc, đợi app báo đang ở trong vùng chấm công.",
    "Nhấn giữ nút tròn khoảng 1 giây cho tới khi vòng viền chạy hết — chấm công xong sẽ có biên nhận giờ vào/ra.",
    "Nút chuyển xám khi bạn ở ngoài vùng hoặc GPS chưa đủ chính xác: bước ra chỗ thoáng rồi bấm “Lấy lại vị trí”.",
    "Mất mạng vẫn chấm được: lần chấm được giữ trên máy và tự gửi khi có mạng.",
    "Quên chấm hoặc chấm sai giờ: vào Chấm công → chọn ngày → Giải trình.",
  ] },
  explain: { title: "Giải trình công", steps: [
    "Chọn ngày cần giải trình và loại (quên chấm vào, quên chấm ra, sai giờ…).",
    "Nhập giờ thực tế và lý do; có minh chứng thì đính kèm.",
    "Số lượt còn lại và hạn gửi của kỳ công hiện ngay trong form.",
    "Gửi xong, đơn chờ quản lý duyệt; khi được duyệt, bảng công tự cập nhật.",
  ] },
  leave: { title: "Nghỉ phép", steps: [
    "Thẻ số dư cho biết số ngày được cấp, đã dùng và đang chờ duyệt.",
    "Bấm “Tạo đơn nghỉ” để xin nghỉ; đơn đang chờ sẽ giữ chỗ số ngày phép.",
    "Muốn hủy đơn chưa duyệt: mở đơn trong danh sách “Đơn nghỉ của tôi”.",
  ] },
  leaveNew: { title: "Tạo đơn nghỉ", steps: [
    "Chọn loại nghỉ (phép năm, không lương, chế độ…).",
    "Chạm ngày bắt đầu rồi chạm ngày kết thúc — khoảng ngày nghỉ được tô thành dải.",
    "Nghỉ một ngày thì chọn cả ngày, buổi sáng hoặc buổi chiều.",
    "Cuối tuần và ngày lễ không bị tính; kiểm tra “Còn lại sau đơn” trước khi gửi.",
  ] },
  ot: { title: "Làm thêm giờ", steps: [
    "Chọn ngày làm thêm và giờ bắt đầu – kết thúc.",
    "App hiện hệ số theo loại ngày và số giờ còn được làm thêm trong tháng/năm trước khi gửi.",
    "Đăng ký cần quản lý duyệt; giờ chờ duyệt cũng được tính vào giới hạn.",
  ] },
  advance: { title: "Tạm ứng lương", steps: [
    "Màn này cho biết bạn có đủ điều kiện tạm ứng tháng này và hạn mức còn lại.",
    "Bấm “Đề nghị tạm ứng”, nhập số tiền rồi xác nhận bằng mã PIN hoặc sinh trắc học.",
    "Khoản ứng được trừ vào kỳ lương tương ứng; theo dõi từng bước duyệt trong chi tiết đơn.",
  ] },
  advanceNew: { title: "Đề nghị tạm ứng", steps: [
    "Nhập số tiền trong hạn mức hiện trên màn (hoặc chọn nhanh mức gợi ý).",
    "Ghi lý do nếu cần, xem lại rồi xác nhận bằng mã PIN.",
    "Hạn nhận đơn trong tháng do công ty quy định; quá hạn thì đơn chuyển sang tháng sau.",
  ] },
  advanceDetail: { title: "Theo dõi tạm ứng", steps: [
    "Dòng thời gian cho biết đơn đang ở bước nào: quản lý, nhân sự, kế toán, đã chi.",
    "Có thắc mắc về khoản chi, liên hệ phòng Kế toán hoặc Nhân sự.",
  ] },
  reqDetail: { title: "Chi tiết đơn", steps: [
    "Xem trạng thái và từng bước duyệt của đơn.",
    "Đơn còn chờ duyệt thì có thể hủy; đơn đã duyệt muốn đổi thì tạo đơn mới.",
  ] },
  approvalDetail: { title: "Duyệt đơn", steps: [
    "Kiểm tra nội dung đơn và ảnh hưởng tới công/phép của nhân viên.",
    "Bấm Duyệt hoặc Từ chối; từ chối cần ghi lý do để nhân viên biết.",
  ] },
  widgetGuide: { title: "Widget chấm công", steps: [
    "Giữ ngón tay trên màn hình chính → bấm dấu + → tìm Kavor.",
    "Chọn cỡ widget rồi bấm “Thêm tiện ích”.",
  ] },
};
