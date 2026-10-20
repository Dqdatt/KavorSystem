import { DashboardShell } from "@kavor/web-ui";

export default function ConsoleDashboard() {
  return (
    <DashboardShell
      surface="console"
      productName="Kavor"
      productLabel="Platform Console"
      pageTitle="Tổng quan nền tảng"
      pageSubtitle="Production · Singapore · 20/10/2026"
      searchPlaceholder="Tìm tenant, job, incident hoặc user…"
      accountLabel="Production"
      navGroups={[
        { items: [{ id: "overview", label: "Tổng quan nền tảng" }] },
        { label: "Khách hàng", items: [{ id: "tenants", label: "Doanh nghiệp", badge: "48" }, { id: "plans", label: "Gói dịch vụ" }, { id: "usage", label: "Usage & giới hạn" }] },
        { label: "Vận hành", items: [{ id: "sync", label: "Sync jobs", badge: "6" }, { id: "incidents", label: "Sự cố & cảnh báo", badge: "2" }, { id: "releases", label: "Releases" }, { id: "flags", label: "Feature flags" }] },
        { label: "An toàn", items: [{ id: "support", label: "Support access" }, { id: "audit", label: "Audit log" }, { id: "settings", label: "Cài đặt nền tảng" }] },
      ]}
      banner={{ title: "Tất cả dịch vụ cốt lõi đang hoạt động bình thường", detail: "API 99,98% · Database healthy · Queue delay 1,4 giây.", action: "Xem system status" }}
      metrics={[
        { label: "Tenant hoạt động", value: "48", detail: "+4 trong quý 4", tone: "green" },
        { label: "Nhân sự active", value: "12.846", detail: "+8,4% tháng trước", tone: "blue" },
        { label: "API uptime", value: "99,98%", detail: "30 ngày gần nhất", tone: "violet" },
        { label: "MRR dự kiến", value: "486 triệu", detail: "+12,6% tăng trưởng", tone: "amber" },
      ]}
      chartTitle="Tăng trưởng tenant và API traffic"
      chartSubtitle="12 tuần gần nhất"
      tableTitle="Tenant cần chú ý"
      tableColumns={["Gói", "Nhân sự", "Hoạt động gần nhất"]}
      rows={[
        { avatar: "HD", primary: "Hải Đăng Group", secondary: "HDG-001", values: ["Growth", "248/300", "2 phút trước"], status: "Cần xử lý" },
        { avatar: "AP", primary: "An Phú Retail", secondary: "APR-012", values: ["Starter", "96/100", "14 phút trước"], status: "Cần xử lý" },
        { avatar: "MQ", primary: "Minh Quân Logistics", secondary: "MQL-028", values: ["Enterprise", "1.842", "1 phút trước"], status: "Cần xử lý" },
        { avatar: "SG", primary: "Saigon Creative", secondary: "SGC-044", values: ["Trial", "28/50", "1 giờ trước"], status: "Đang thiết lập" },
      ]}
      alerts={[
        { id: "c1", title: "Queue delay tại MQL-028", detail: "Attendance worker vượt 9 giây", time: "4 phút", tone: "red" },
        { id: "c2", title: "Google quota warning", detail: "3 tenant dùng chung service account", time: "32 phút", tone: "amber" },
        { id: "c3", title: "Web v0.1.0 foundation", detail: "Build đầu tiên sẵn sàng kiểm thử", time: "vừa xong", tone: "green" },
      ]}
    />
  );
}
