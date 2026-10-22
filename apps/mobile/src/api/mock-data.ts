/* Dữ liệu mẫu lấy nguyên từ Kavor HRM Prototype.html (hôm nay là Thứ Sáu 16/10/2026) */
import type { Approval, MyReq, News, OctDay, Payslip } from "../data";

export const OCT: OctDay[] = [
  { d: 1, in: "07:55", out: "17:32" }, { d: 2, in: "07:58", out: "17:10" }, { d: 5, in: "08:21", out: "17:15" }, { d: 6, in: "07:58", out: "17:05" },
  { d: 7, leave: true }, { d: 8, in: "07:59", out: null, explained: "GT-0108", fix: "17:00" }, { d: 9, in: "07:56", out: "16:40" },
  { d: 12, in: "08:14", out: "17:30" }, { d: 13, in: "07:55", out: "17:02" }, { d: 14, in: "07:57", out: "19:36", ot: "OT 2 giờ" }, { d: 15, in: null, out: "17:08" }, { d: 16, today: true },
];

export const MY_REQ_INIT: MyReq[] = [
  { id: "NP-1031", type: "leave", title: "Nghỉ phép năm", sub: "T6 23/10 · buổi chiều · 0,5 ngày", status: "pending", created: "14/10 09:12", reason: "Đưa con đi khám định kỳ" },
  { id: "HS-0221", type: "profile", title: "Đổi tài khoản ngân hàng", sub: "Vietcombank •6789 → Techcombank •2231", status: "pending", created: "13/10 16:40", reason: "Đổi tài khoản nhận lương" },
  { id: "OT-0418", type: "ot", title: "Làm thêm giờ", sub: "T4 14/10 · 17:30–19:30 · 2 giờ", status: "approved", created: "14/10 10:05", reason: "Key visual chiến dịch Tết" },
  { id: "GT-0108", type: "explain", title: "Giải trình công", sub: "T5 08/10 · quên chấm ra", status: "approved", created: "09/10 08:30", reason: "Họp khách tới 17:00, quên chấm ra" },
  { id: "NP-0927", type: "leave", title: "Nghỉ phép năm", sub: "T4 07/10 · cả ngày · 1 ngày", status: "approved", created: "30/09 14:22", reason: "Việc gia đình" },
  { id: "OT-0331", type: "ot", title: "Làm thêm giờ", sub: "T7 26/09 · 4 giờ", status: "rejected", created: "24/09 11:02", reason: "Hoàn thiện bộ ảnh sản phẩm", note: "Dự án đã chốt, không cần làm thêm." },
];

export const APPROVALS_INIT: Approval[] = [
  { id: "NP-1035", who: "Phạm Minh Đức", ini: "PĐ", role: "Designer", type: "leave", title: "Nghỉ phép năm", sub: "T2 26/10 – T3 27/10 · 2 ngày", reason: "Về quê có việc gia đình", ctx: "Còn 6 ngày phép", created: "15/10 17:42" },
  { id: "TU-1007", who: "Võ Thảo Linh", ini: "VL", role: "Content Writer", type: "advance", title: "Tạm ứng lương", sub: "2.000.000 ₫ · trừ kỳ 10/2026", reason: "Chi phí khám chữa bệnh", ctx: "Hạn mức 3.600.000 ₫", created: "16/10 07:30" },
  { id: "GT-1015", who: "Đặng Văn Khoa", ini: "ĐK", role: "Video Editor", type: "explain", title: "Giải trình công", sub: "T5 15/10 · đi công tác", reason: "Quay sản phẩm tại xưởng Bình Dương", ctx: "Lượt 1/3", created: "16/10 06:58" },
];

export const PAY: Payslip[] = [
  { k: "09/2026", pub: "05/10/2026", paid: "05/10/2026", work: "22/22", income: [["Lương cơ bản", 15000000, "22/22 ngày công"], ["Phụ cấp ăn trưa", 730000], ["Phụ cấp xăng xe", 500000], ["Làm thêm giờ", 1250000, "Theo bảng OT tháng 9"]],
    deduct: [["BHXH 8%", 1200000], ["BHYT 1,5%", 225000], ["BHTN 1%", 150000], ["Thuế TNCN", 87500], ["Trừ tạm ứng", 3000000, "Đơn TU-0912"]] },
  { k: "08/2026", pub: "05/09/2026", paid: "05/09/2026", work: "21/21", income: [["Lương cơ bản", 15000000, "21/21 ngày công"], ["Phụ cấp ăn trưa", 730000], ["Phụ cấp xăng xe", 500000]],
    deduct: [["BHXH 8%", 1200000], ["BHYT 1,5%", 225000], ["BHTN 1%", 150000], ["Thuế TNCN", 25000]] },
  { k: "07/2026", pub: "05/08/2026", paid: "06/08/2026", work: "23/23", income: [["Lương cơ bản", 15000000, "23/23 ngày công"], ["Phụ cấp ăn trưa", 730000], ["Phụ cấp xăng xe", 500000], ["Thưởng dự án", 2000000]],
    deduct: [["BHXH 8%", 1200000], ["BHYT 1,5%", 225000], ["BHTN 1%", 150000], ["Thuế TNCN", 125000]] },
];

export const NEWS: News[] = [
  { id: 6, cat: "notice", important: true, title: "Bảo trì hệ thống Kavor tối nay 22:00 – 23:30", date: "16/10", by: "Phòng IT", read: "1 phút", body: ["Trong thời gian bảo trì, app tạm dừng. Ra ca trước 22:00 hoặc sau 23:30 vẫn được ghi nhận bình thường."] },
  { id: 7, cat: "event", title: "Sinh nhật tháng 10: 16:00 hôm nay tại pantry tầng 5", date: "16/10", by: "Ban Văn hóa", read: "1 phút", body: ["Mời cả nhà ghé chúc mừng 8 bạn có sinh nhật trong tháng 10."] },
  { id: 8, cat: "notice", title: "Đổi khu vực gửi xe máy từ ngày 20/10", date: "15/10", by: "Hành chính", read: "1 phút", body: ["Xe máy nhân viên chuyển xuống hầm B2, lối vào phía đường Hồ Tùng Mậu. Thẻ xe cũ vẫn dùng được."] },
  { id: 1, cat: "policy", pin: true, important: true, title: "Chấm công GPS trên app Kavor áp dụng từ 01/11/2026", date: "15/10", by: "Phòng Nhân sự", read: "3 phút", file: "Quy-dinh-cham-cong-GPS.pdf · 412 KB",
    body: ["Từ ngày 01/11/2026, nhân viên khối văn phòng chấm công vào/ra ca trên app Kavor thay cho máy vân tay ở sảnh.", "Mỗi người đăng ký một điện thoại để chấm công. Khi đổi máy, gửi yêu cầu reset trong Hồ sơ → Bảo mật và thiết bị.", ["Bán kính chấm công: 3 m quanh điểm đặt tại văn phòng.", "Quên chấm hoặc lỗi định vị: gửi giải trình, tối đa 3 lần/tháng.", "Hạn giải trình: trước ngày chốt công 3 ngày."], "Máy vân tay vẫn chạy song song đến hết 30/11 để đối chiếu."] },
  { id: 2, cat: "notice", title: "Lịch nghỉ Tết Dương lịch 2027", date: "14/10", by: "Phòng Nhân sự", read: "1 phút", body: ["Công ty nghỉ Tết Dương lịch vào Thứ Sáu 01/01/2027. Bộ phận trực vận hành nhận lịch phân ca riêng từ quản lý."] },
  { id: 3, cat: "event", title: "Team building quý 4 tại Đà Lạt, 13–15/11", date: "12/10", by: "Ban Văn hóa", read: "2 phút", file: "Lich-trinh-Da-Lat.pdf · 1,1 MB", body: ["Đăng ký trước 25/10 qua quản lý trực tiếp. Công ty hỗ trợ chi phí đi lại và lưu trú."] },
  { id: 4, cat: "notice", title: "Chốt công tháng 10 vào ngày 25/10", date: "10/10", by: "Phòng Nhân sự", read: "1 phút", body: ["Hạn gửi giải trình công tháng 10 là hết ngày 22/10. Sau đó bảng công được khóa để tính lương."] },
  { id: 5, cat: "event", title: "Sáu đồng nghiệp tròn 5 năm gắn bó", date: "05/10", by: "Ban Văn hóa", read: "2 phút", body: ["Quà kỷ niệm sẽ được trao tại buổi họp toàn thể cuối tháng."] },
];
