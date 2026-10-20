import { SAMPLE_TENANT } from "@kavor/contracts";
import { DashboardShell } from "@kavor/web-ui";

export default function AdminDashboard() {
  return (
    <DashboardShell
      surface="admin"
      productName="Kavor"
      productLabel="HR/Admin"
      pageTitle="Tổng quan"
      pageSubtitle="Thứ Ba, 20 tháng 10, 2026"
      searchPlaceholder="Tìm nhân viên, đơn từ hoặc tài liệu…"
      accountLabel={SAMPLE_TENANT.name}
      navGroups={[
        { items: [{ id: "overview", label: "Tổng quan" }] },
        { label: "Nhân sự", items: [{ id: "employees", label: "Nhân viên", badge: "248" }, { id: "organization", label: "Tổ chức" }] },
        { label: "Vận hành", items: [{ id: "attendance", label: "Chấm công", badge: "8" }, { id: "schedule", label: "Lịch làm" }, { id: "leave", label: "Nghỉ phép" }, { id: "requests", label: "Phê duyệt", badge: "12" }] },
        { label: "Tài chính", items: [{ id: "payroll", label: "Payroll" }, { id: "documents", label: "Tài liệu" }] },
        { label: "Truyền thông", items: [{ id: "announcements", label: "Bản tin" }, { id: "reports", label: "Báo cáo" }] },
        { label: "Hệ thống", items: [{ id: "integrations", label: "Tích hợp dữ liệu", badge: "2" }, { id: "roles", label: "Phân quyền" }, { id: "settings", label: "Cài đặt" }] },
      ]}
      banner={{ title: "Kỳ công tháng 10 sẽ chốt sau 6 ngày", detail: "Còn 8 bất thường và 12 đơn đang chờ phê duyệt.", action: "Kiểm tra bảng công" }}
      metrics={[
        { label: "Nhân sự hoạt động", value: "248", detail: "+6 trong tháng 10", tone: "green" },
        { label: "Có mặt hôm nay", value: "226", detail: "91,1% tổng nhân sự", tone: "blue" },
        { label: "Đang chờ duyệt", value: "12", detail: "4 quá 24 giờ", tone: "amber" },
        { label: "Payroll 10/2026", value: "72%", detail: "Đang kiểm tra đầu vào", tone: "violet" },
      ]}
      chartTitle="Hiện diện và bất thường chấm công"
      chartSubtitle="12 tuần gần nhất · toàn công ty"
      tableTitle="Nhân sự cần chú ý"
      tableColumns={["Phòng ban", "Ca làm", "Hoạt động gần nhất"]}
      rows={[
        { avatar: "TH", primary: "Trần Thu Hà", secondary: "HDG0002", values: ["Nhân sự", "Văn phòng", "2 phút trước"], status: "Tốt" },
        { avatar: "VL", primary: "Võ Thảo Linh", secondary: "HDG0005", values: ["Vận hành", "Ca đêm", "Thiếu mapping payroll"], status: "Cần xử lý" },
        { avatar: "NM", primary: "Nguyễn Mai Chi", secondary: "HDG0007", values: ["Kinh doanh", "Văn phòng", "Ngoài geofence"], status: "Cần xử lý" },
        { avatar: "TB", primary: "Trương Bảo Trâm", secondary: "HDG0010", values: ["CSKH", "Ca chiều", "Đang thử việc"], status: "Đang thiết lập" },
      ]}
      alerts={[
        { id: "a1", title: "8 bất thường chấm công", detail: "3 trường hợp mới hôm nay", time: "5 phút", tone: "red" },
        { id: "a2", title: "Payroll còn 6 lỗi", detail: "Thiếu component hoặc tài khoản", time: "18 phút", tone: "amber" },
        { id: "a3", title: "Google Sheets đã đồng bộ", detail: "248 dòng nhân sự thành công", time: "1 giờ", tone: "green" },
      ]}
    />
  );
}
