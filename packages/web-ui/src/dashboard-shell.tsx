"use client";

import { useMemo, useState } from "react";

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "blue" | "violet" | "amber";
};

export type DashboardNavGroup = {
  label?: string;
  items: Array<{ id: string; label: string; badge?: string }>;
};

export type DashboardRow = {
  avatar: string;
  primary: string;
  secondary: string;
  values: string[];
  status: "Tốt" | "Cần xử lý" | "Đang thiết lập";
};

export type DashboardAlert = {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: "green" | "amber" | "red";
};

export type DashboardShellProps = {
  productName: string;
  productLabel: string;
  pageTitle: string;
  pageSubtitle: string;
  searchPlaceholder: string;
  accountLabel: string;
  navGroups: DashboardNavGroup[];
  banner: { title: string; detail: string; action: string };
  metrics: DashboardMetric[];
  chartTitle: string;
  chartSubtitle: string;
  tableTitle: string;
  tableColumns: string[];
  rows: DashboardRow[];
  alerts: DashboardAlert[];
  surface?: "admin" | "console";
};

type ModuleRow = {
  id: string;
  primary: string;
  secondary: string;
  values: string[];
  status: string;
  tone: "ok" | "warn" | "bad" | "info";
};
type ModuleConfig = {
  title: string;
  description: string;
  primaryAction?: string;
  secondaryAction?: string;
  stats: Array<[string, string, string]>;
  columns: string[];
  rows: ModuleRow[];
};

const chartValues = [42, 54, 48, 66, 73, 62, 79, 84, 77, 91];

const navIconPaths: Record<string, string[]> = {
  overview: ["M3 11.5 12 4l9 7.5", "M5.5 10v10h13V10", "M9 20v-6h6v6"],
  employees: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4",
    "M9 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 5.13a4 4 0 0 1 0 7.75",
  ],
  organization: [
    "M12 3v5",
    "M5 21v-5h14v5",
    "M5 16v-4h14v4",
    "M5 8h14v4",
    "M9 12v4",
    "M15 12v4",
  ],
  attendance: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M12 6v6l4 2"],
  schedule: ["M3 5h18v16H3z", "M16 3v4", "M8 3v4", "M3 10h18"],
  leave: ["M4 19c4-7 12-11 16-14-1 8-5 14-12 14H4z", "M12 9v10"],
  requests: [
    "M9 11l3 3L22 4",
    "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  ],
  payroll: ["M3 6h18v13H3z", "M3 10h18", "M16 15h2"],
  documents: ["M6 2h8l4 4v16H6z", "M14 2v5h5", "M9 13h6", "M9 17h6"],
  announcements: ["M4 5h16v14H4z", "M8 9h8", "M8 13h8", "M8 17h5"],
  reports: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20V7", "M2 20h21"],
  integrations: [
    "M8 12h8",
    "M12 8v8",
    "M6 3v4",
    "M18 3v4",
    "M5 7h14v3a7 7 0 0 1-14 0z",
  ],
  roles: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10", "M9 12l2 2 4-4"],
  settings: [
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
    "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 3.67-.08-.02a1.7 1.7 0 0 0-1.8-.48l-.95.39a1.7 1.7 0 0 0-1.05 1.47V22H9.6v-.03a1.7 1.7 0 0 0-1.05-1.47l-.95-.39a1.7 1.7 0 0 0-1.8.48l-.08.02L3.6 16.94l.06-.06A1.7 1.7 0 0 0 4 15l-.38-.92a1.7 1.7 0 0 0-1.47-1.05H2V8.8h.15a1.7 1.7 0 0 0 1.47-1.05L4 6.83a1.7 1.7 0 0 0-.34-1.88l-.06-.06L5.72 1.2l.08.03a1.7 1.7 0 0 0 1.8.48l.95-.4A1.7 1.7 0 0 0 9.6 0H14v.03a1.7 1.7 0 0 0 1.05 1.47l.95.39a1.7 1.7 0 0 0 1.8-.48l.08-.02L20 5.06l-.06.06A1.7 1.7 0 0 0 19.6 7l.38.92A1.7 1.7 0 0 0 21.45 9H22v4h-.55a1.7 1.7 0 0 0-1.47 1.05z",
  ],
  tenants: [
    "M4 21V5l8-3 8 3v16",
    "M8 8h2",
    "M14 8h2",
    "M8 12h2",
    "M14 12h2",
    "M10 21v-5h4v5",
  ],
  plans: ["M12 2 2 7l10 5 10-5z", "m2 12 10 5 10-5", "m2 5 10 5 10-5"],
  usage: ["M4 19a9 9 0 1 1 16 0", "M12 12l5-3", "M12 19h.01"],
  sync: [
    "M20 7h-5V2",
    "M4 17h5v5",
    "M5.5 8a7 7 0 0 1 11.7-2.6L20 7",
    "M4 17l2.8 1.6A7 7 0 0 0 18.5 16",
  ],
  incidents: ["M12 3 2 21h20z", "M12 9v5", "M12 18h.01"],
  releases: [
    "M14 4c3-2 6-2 6-2s0 3-2 6l-5 5-4-4z",
    "M9 9 4 10l5-2 2-5",
    "M14 14l-4 6-2-4",
  ],
  flags: ["M5 22V3", "M5 4h12l-2 4 2 4H5"],
  support: [
    "M4 14v-3a8 8 0 0 1 16 0v3",
    "M4 14a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2",
    "M20 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2",
    "M17 16c0 3-2 4-5 4",
  ],
  audit: [
    "M9 5h11",
    "M9 12h11",
    "M9 19h11",
    "M4 5h.01",
    "M4 12h.01",
    "M4 19h.01",
  ],
};

const adminModules: Record<string, ModuleConfig> = {
  employees: {
    title: "Danh sách nhân viên",
    description: "Quản lý hồ sơ, trạng thái và lịch sử công tác.",
    primaryAction: "Thêm nhân viên",
    secondaryAction: "Import dữ liệu",
    stats: [
      ["248", "Đang làm việc", "+6 tháng này"],
      ["18", "Đang thử việc", "7 sắp kết thúc"],
      ["4", "Sắp nghỉ", "Trong 30 ngày"],
      ["98,4%", "Đủ hồ sơ", "4 hồ sơ thiếu"],
    ],
    columns: ["Phòng ban", "Chức danh", "Ngày vào", "Trạng thái"],
    rows: [
      {
        id: "HD0142",
        primary: "Trần Thu Hà",
        secondary: "ha@haidang.vn",
        values: ["Marketing", "Marketing Executive", "12/03/2023"],
        status: "Đang làm việc",
        tone: "ok",
      },
      {
        id: "HD0256",
        primary: "Võ Thảo Linh",
        secondary: "linh@haidang.vn",
        values: ["Marketing", "Content Writer", "19/10/2026"],
        status: "Thử việc",
        tone: "info",
      },
      {
        id: "HD0098",
        primary: "Nguyễn Hoàng Minh",
        secondary: "minh@haidang.vn",
        values: ["Vận hành", "Operations Lead", "08/06/2021"],
        status: "Đang làm việc",
        tone: "ok",
      },
      {
        id: "HD0204",
        primary: "Đặng Văn Khoa",
        secondary: "khoa@haidang.vn",
        values: ["Marketing", "Video Editor", "04/01/2025"],
        status: "Thiếu hồ sơ",
        tone: "warn",
      },
    ],
  },
  organization: {
    title: "Cơ cấu tổ chức",
    description: "Pháp nhân, chi nhánh, phòng ban, nhóm và vị trí.",
    primaryAction: "Thêm đơn vị",
    stats: [
      ["4", "Pháp nhân", "Đang hoạt động"],
      ["7", "Chi nhánh", "3 tỉnh thành"],
      ["18", "Phòng ban", "42 nhóm"],
      ["64", "Vị trí", "8 đang trống"],
    ],
    columns: ["Cấp", "Quản lý", "Nhân sự", "Trạng thái"],
    rows: [
      {
        id: "ORG-01",
        primary: "Hải Đăng Group",
        secondary: "Pháp nhân chính",
        values: ["Pháp nhân", "Nguyễn Đức Hải", "248"],
        status: "Hoạt động",
        tone: "ok",
      },
      {
        id: "ORG-05",
        primary: "Khối Kinh doanh",
        secondary: "5 phòng ban",
        values: ["Khối", "Phạm Minh Anh", "82"],
        status: "Hoạt động",
        tone: "ok",
      },
      {
        id: "ORG-11",
        primary: "Marketing",
        secondary: "3 nhóm",
        values: ["Phòng ban", "Lê Quang Huy", "24"],
        status: "Đang tuyển",
        tone: "info",
      },
    ],
  },
  attendance: {
    title: "Chấm công tháng 10",
    description: "Theo dõi bản ghi gốc, bất thường và điều chỉnh có audit.",
    primaryAction: "Xuất bảng công",
    secondaryAction: "Khóa kỳ công",
    stats: [
      ["226", "Có mặt hôm nay", "91,1% nhân sự"],
      ["8", "Thiếu công", "3 mới hôm nay"],
      ["14", "Đi muộn", "Giảm 8%"],
      ["92%", "Đã đối soát", "Chốt sau 6 ngày"],
    ],
    columns: ["Ngày", "Giờ vào/ra", "Kết quả", "Trạng thái"],
    rows: [
      {
        id: "ATT-0142",
        primary: "Trần Thu Hà",
        secondary: "HD0142 · Marketing",
        values: ["19/10", "07:58 — 17:06", "8 giờ 08 phút"],
        status: "Đủ công",
        tone: "ok",
      },
      {
        id: "ATT-0204",
        primary: "Đặng Văn Khoa",
        secondary: "HD0204 · Marketing",
        values: ["19/10", "— — 17:06", "Thiếu giờ vào"],
        status: "Cần giải trình",
        tone: "bad",
      },
      {
        id: "ATT-0098",
        primary: "Nguyễn Hoàng Minh",
        secondary: "HD0098 · Vận hành",
        values: ["19/10", "08:14 — 17:12", "Muộn 14 phút"],
        status: "Chờ duyệt",
        tone: "warn",
      },
    ],
  },
  schedule: {
    title: "Ca & lịch làm",
    description: "Cấu hình ca và phân lịch theo đơn vị hoặc nhân viên.",
    primaryAction: "Tạo ca làm",
    secondaryAction: "Phân lịch",
    stats: [
      ["6", "Loại ca", "2 ca linh hoạt"],
      ["238", "Đã có lịch", "95,9%"],
      ["10", "Chưa phân lịch", "Cần xử lý"],
      ["3", "Đổi ca chờ duyệt", "Hôm nay"],
    ],
    columns: ["Khung giờ", "Áp dụng", "Nhân sự", "Trạng thái"],
    rows: [
      {
        id: "SHIFT-01",
        primary: "Ca hành chính",
        secondary: "T2–T6",
        values: ["08:00 — 17:00", "Toàn công ty", "184"],
        status: "Đang dùng",
        tone: "ok",
      },
      {
        id: "SHIFT-02",
        primary: "Ca chiều",
        secondary: "T2–T7",
        values: ["13:00 — 21:00", "CSKH", "32"],
        status: "Đang dùng",
        tone: "ok",
      },
      {
        id: "SHIFT-03",
        primary: "Ca đêm",
        secondary: "Theo lịch",
        values: ["21:00 — 06:00", "Vận hành", "18"],
        status: "Cần rà soát",
        tone: "warn",
      },
    ],
  },
  leave: {
    title: "Nghỉ phép",
    description: "Chính sách, số dư và giao dịch phép của nhân viên.",
    primaryAction: "Điều chỉnh số dư",
    secondaryAction: "Import số dư",
    stats: [
      ["1.426", "Ngày còn lại", "Toàn công ty"],
      ["132", "Đã sử dụng", "Tháng 10"],
      ["18", "Đang giữ chỗ", "12 đơn"],
      ["5", "Loại nghỉ", "Theo chính sách"],
    ],
    columns: ["Phòng ban", "Được cấp", "Còn lại", "Trạng thái"],
    rows: [
      {
        id: "LV-0142",
        primary: "Trần Thu Hà",
        secondary: "HD0142",
        values: ["Marketing", "14 ngày", "6,5 ngày"],
        status: "Bình thường",
        tone: "ok",
      },
      {
        id: "LV-0204",
        primary: "Đặng Văn Khoa",
        secondary: "HD0204",
        values: ["Marketing", "12 ngày", "1 ngày"],
        status: "Sắp hết",
        tone: "warn",
      },
      {
        id: "LV-0098",
        primary: "Nguyễn Hoàng Minh",
        secondary: "HD0098",
        values: ["Vận hành", "14 ngày", "9 ngày"],
        status: "Bình thường",
        tone: "ok",
      },
    ],
  },
  requests: {
    title: "Đơn & phê duyệt",
    description: "Duyệt nghỉ phép, OT, giải trình và tạm ứng theo workflow.",
    primaryAction: "Duyệt đã chọn",
    stats: [
      ["12", "Đang chờ", "4 quá 24 giờ"],
      ["31", "Đã duyệt", "Tuần này"],
      ["3", "Đã từ chối", "Tuần này"],
      ["8,4 giờ", "SLA trung bình", "Mục tiêu < 12 giờ"],
    ],
    columns: ["Loại đơn", "Nội dung", "Người duyệt", "Trạng thái"],
    rows: [
      {
        id: "NP-2310",
        primary: "Trần Thu Hà",
        secondary: "HD0142 · gửi 09:12",
        values: ["Nghỉ phép", "23/10 · 1 ngày", "Lê Quang Huy"],
        status: "Chờ duyệt",
        tone: "warn",
      },
      {
        id: "GT-1510",
        primary: "Đặng Văn Khoa",
        secondary: "HD0204 · gửi 08:30",
        values: ["Giải trình", "Thiếu giờ vào 15/10", "Lê Quang Huy"],
        status: "Chờ duyệt",
        tone: "warn",
      },
      {
        id: "TU-1016",
        primary: "Võ Thảo Linh",
        secondary: "HD0256 · gửi 07:30",
        values: ["Tạm ứng", "2.000.000 ₫", "HR → Kế toán"],
        status: "Quá SLA",
        tone: "bad",
      },
    ],
  },
  payroll: {
    title: "Payroll 10/2026",
    description:
      "Cấu hình theo doanh nghiệp, kiểm tra đầu vào và công bố phiếu lương.",
    primaryAction: "Công bố phiếu lương",
    secondaryAction: "Import kết quả",
    stats: [
      ["72%", "Tiến độ", "Đang kiểm tra"],
      ["248", "Nhân viên", "242 hợp lệ"],
      ["6", "Lỗi dữ liệu", "Cần xử lý"],
      ["3,84 tỷ", "Tổng thực lĩnh", "Tạm tính"],
    ],
    columns: ["Phòng ban", "Thực lĩnh", "Kiểm tra", "Trạng thái"],
    rows: [
      {
        id: "PAY-0142",
        primary: "Trần Thu Hà",
        secondary: "HD0142",
        values: ["Marketing", "18.420.000 ₫", "Đủ dữ liệu"],
        status: "Sẵn sàng",
        tone: "ok",
      },
      {
        id: "PAY-0256",
        primary: "Võ Thảo Linh",
        secondary: "HD0256",
        values: ["Marketing", "12.600.000 ₫", "Thiếu mapping"],
        status: "Có lỗi",
        tone: "bad",
      },
      {
        id: "PAY-0098",
        primary: "Nguyễn Hoàng Minh",
        secondary: "HD0098",
        values: ["Vận hành", "24.850.000 ₫", "Đủ dữ liệu"],
        status: "Sẵn sàng",
        tone: "ok",
      },
    ],
  },
  documents: {
    title: "Tài liệu",
    description: "Quản lý hồ sơ, biểu mẫu và tài liệu nhân viên.",
    primaryAction: "Tải tài liệu lên",
    secondaryAction: "Tạo thư mục",
    stats: [
      ["1.284", "Tệp đang lưu", "8,6 GB"],
      ["34", "Sắp hết hạn", "Trong 30 ngày"],
      ["4", "Thiếu hồ sơ", "Cần bổ sung"],
      ["100%", "Có audit", "Lượt tải/xem"],
    ],
    columns: ["Loại", "Đối tượng", "Cập nhật", "Trạng thái"],
    rows: [
      {
        id: "DOC-1008",
        primary: "Hợp đồng lao động",
        secondary: "Trần Thu Hà · PDF",
        values: ["Hợp đồng", "HD0142", "12/03/2026"],
        status: "Còn hiệu lực",
        tone: "ok",
      },
      {
        id: "DOC-1032",
        primary: "CCCD",
        secondary: "Đặng Văn Khoa · PDF",
        values: ["Hồ sơ cá nhân", "HD0204", "04/01/2025"],
        status: "Sắp hết hạn",
        tone: "warn",
      },
      {
        id: "DOC-1064",
        primary: "Quyết định điều chuyển",
        secondary: "Nguyễn Hoàng Minh · PDF",
        values: ["Quyết định", "HD0098", "18/10/2026"],
        status: "Mới",
        tone: "info",
      },
    ],
  },
  announcements: {
    title: "Bản tin",
    description: "Soạn, lên lịch và theo dõi thông báo nội bộ.",
    primaryAction: "Tạo bản tin",
    stats: [
      ["3", "Đang hiển thị", "1 quan trọng"],
      ["86%", "Đã đọc", "Trong 24 giờ"],
      ["2", "Đã lên lịch", "Tuần này"],
      ["14", "Bản nháp", "Chưa xuất bản"],
    ],
    columns: ["Chuyên mục", "Đối tượng", "Lượt đọc", "Trạng thái"],
    rows: [
      {
        id: "NEWS-1020",
        primary: "Chấm công GPS trên Kavor",
        secondary: "Phòng Nhân sự",
        values: ["Chính sách", "Toàn công ty", "214/248"],
        status: "Đã đăng",
        tone: "ok",
      },
      {
        id: "NEWS-1015",
        primary: "Lịch trực hỗ trợ cuối tháng",
        secondary: "Phòng Vận hành",
        values: ["Thông báo", "Vận hành", "62/82"],
        status: "Đã đăng",
        tone: "ok",
      },
      {
        id: "NEWS-1025",
        primary: "Town hall tháng 11",
        secondary: "Ban Truyền thông",
        values: ["Sự kiện", "Toàn công ty", "—"],
        status: "Đã lên lịch",
        tone: "info",
      },
    ],
  },
  integrations: {
    title: "Tích hợp dữ liệu",
    description: "Import CSV/Excel và đồng bộ Google Sheets có kiểm soát.",
    primaryAction: "Kết nối nguồn dữ liệu",
    secondaryAction: "Import file",
    stats: [
      ["2", "Kết nối hoạt động", "Google Sheets"],
      ["99,4%", "Tỷ lệ thành công", "30 ngày"],
      ["6", "Lỗi mapping", "Payroll"],
      ["08:15", "Lần đồng bộ cuối", "248 dòng"],
    ],
    columns: ["Nguồn", "Dataset", "Lần chạy cuối", "Trạng thái"],
    rows: [
      {
        id: "SYNC-EMP",
        primary: "Employee master",
        secondary: "Google Sheets · read-only",
        values: ["Google Sheets", "Nhân viên", "19/10 · 08:15"],
        status: "Đồng bộ",
        tone: "ok",
      },
      {
        id: "SYNC-PAY",
        primary: "Payroll input",
        secondary: "Google Sheets · read-only",
        values: ["Google Sheets", "Payroll", "19/10 · 08:08"],
        status: "6 lỗi",
        tone: "bad",
      },
      {
        id: "IMPORT-LV",
        primary: "Opening leave balance",
        secondary: "CSV import",
        values: ["CSV", "Nghỉ phép", "18/10 · 16:42"],
        status: "Hoàn tất",
        tone: "ok",
      },
    ],
  },
  reports: {
    title: "Báo cáo",
    description: "Báo cáo nhân sự, công, phép và payroll theo phạm vi quyền.",
    primaryAction: "Tạo báo cáo",
    secondaryAction: "Xuất Excel",
    stats: [
      ["18", "Báo cáo mẫu", "6 nhóm dữ liệu"],
      ["4", "Lịch gửi", "Đang hoạt động"],
      ["12", "Lượt xuất hôm nay", "Có audit"],
      ["0", "Lỗi tạo báo cáo", "7 ngày"],
    ],
    columns: ["Nhóm", "Kỳ dữ liệu", "Cập nhật", "Trạng thái"],
    rows: [
      {
        id: "RPT-ATT",
        primary: "Tổng hợp chấm công",
        secondary: "Theo phòng ban",
        values: ["Chấm công", "Tháng 10/2026", "5 phút trước"],
        status: "Sẵn sàng",
        tone: "ok",
      },
      {
        id: "RPT-HC",
        primary: "Biến động nhân sự",
        secondary: "Headcount & turnover",
        values: ["Nhân sự", "Quý 4/2026", "1 giờ trước"],
        status: "Sẵn sàng",
        tone: "ok",
      },
      {
        id: "RPT-PAY",
        primary: "Đối soát payroll",
        secondary: "Theo pháp nhân",
        values: ["Payroll", "Tháng 09/2026", "05/10"],
        status: "Đã khóa",
        tone: "info",
      },
    ],
  },
  roles: {
    title: "Vai trò & phân quyền",
    description: "RBAC theo tenant, vai trò và phạm vi tổ chức.",
    primaryAction: "Tạo vai trò",
    stats: [
      ["7", "Vai trò", "4 mặc định"],
      ["36", "Quyền", "Theo module"],
      ["18", "Quản lý", "Có team scope"],
      ["0", "Cross-tenant", "Bị chặn"],
    ],
    columns: ["Loại", "Người dùng", "Phạm vi", "Trạng thái"],
    rows: [
      {
        id: "ROLE-HR",
        primary: "HR Administrator",
        secondary: "Vai trò tùy chỉnh",
        values: ["Quản trị", "3", "Toàn doanh nghiệp"],
        status: "Hoạt động",
        tone: "ok",
      },
      {
        id: "ROLE-MGR",
        primary: "Line Manager",
        secondary: "Vai trò mặc định",
        values: ["Quản lý", "18", "Đội ngũ phụ trách"],
        status: "Hoạt động",
        tone: "ok",
      },
      {
        id: "ROLE-PAY",
        primary: "Payroll Specialist",
        secondary: "Vai trò tùy chỉnh",
        values: ["Tài chính", "2", "Payroll + tạm ứng"],
        status: "MFA bắt buộc",
        tone: "info",
      },
    ],
  },
  settings: {
    title: "Cài đặt doanh nghiệp",
    description: "Thông tin tenant, chính sách và quy tắc vận hành.",
    primaryAction: "Lưu thay đổi",
    stats: [
      ["Growth", "Gói hiện tại", "248/300 nhân sự"],
      ["4", "Pháp nhân", "7 chi nhánh"],
      ["Asia/HCM", "Múi giờ", "UTC+7"],
      ["12", "Workflow", "8 đang dùng"],
    ],
    columns: ["Nhóm cấu hình", "Giá trị", "Cập nhật bởi", "Trạng thái"],
    rows: [
      {
        id: "SET-GENERAL",
        primary: "Thông tin doanh nghiệp",
        secondary: "Tên, logo, múi giờ",
        values: ["Chung", "Hải Đăng Group", "Mai Phương Thảo"],
        status: "Đã cấu hình",
        tone: "ok",
      },
      {
        id: "SET-ATT",
        primary: "Chính sách chấm công",
        secondary: "GPS · bán kính 150 m",
        values: ["Thời gian", "Phiên bản 3", "Đạt Quản trị"],
        status: "Hiệu lực",
        tone: "ok",
      },
      {
        id: "SET-PAY",
        primary: "Cấu hình payroll",
        secondary: "Import kết quả",
        values: ["Tài chính", "Phiên bản 2", "Đỗ Hồng Nhung"],
        status: "Hiệu lực",
        tone: "ok",
      },
    ],
  },
};

const consoleModules: Record<string, ModuleConfig> = {
  tenants: {
    title: "Doanh nghiệp",
    description: "Quản lý tenant, trạng thái dịch vụ và giới hạn sử dụng.",
    primaryAction: "Tạo tenant",
    stats: [
      ["48", "Tenant hoạt động", "+4 quý này"],
      ["3", "Đang onboarding", "Cần hỗ trợ"],
      ["2", "Degraded", "Đang điều tra"],
      ["12.846", "Nhân sự active", "+8,4%"],
    ],
    columns: ["Gói", "Nhân sự", "Region", "Trạng thái"],
    rows: [
      {
        id: "HDG-001",
        primary: "Hải Đăng Group",
        secondary: "hr.haidang.vn",
        values: ["Growth", "248/300", "Singapore"],
        status: "Hoạt động",
        tone: "ok",
      },
      {
        id: "APR-012",
        primary: "An Phú Retail",
        secondary: "anphu.kavor.vn",
        values: ["Starter", "96/100", "Singapore"],
        status: "Gần giới hạn",
        tone: "warn",
      },
      {
        id: "MQL-028",
        primary: "Minh Quân Logistics",
        secondary: "hr.minhquan.vn",
        values: ["Enterprise", "1.842", "Singapore"],
        status: "Degraded",
        tone: "bad",
      },
    ],
  },
  plans: {
    title: "Gói dịch vụ",
    description: "Quản lý giới hạn và tính năng theo gói.",
    primaryAction: "Tạo gói",
    stats: [
      ["4", "Gói đang bán", "Trial → Enterprise"],
      ["24", "Growth", "50% tenant"],
      ["7", "Enterprise", "14,6% tenant"],
      ["486 triệu", "MRR dự kiến", "+12,6%"],
    ],
    columns: ["Giới hạn nhân sự", "Tenant", "Giá/tháng", "Trạng thái"],
    rows: [
      {
        id: "PLAN-START",
        primary: "Starter",
        secondary: "Core HR + công phép",
        values: ["100", "12", "2.900.000 ₫"],
        status: "Đang bán",
        tone: "ok",
      },
      {
        id: "PLAN-GROW",
        primary: "Growth",
        secondary: "+ payroll + integrations",
        values: ["500", "24", "7.900.000 ₫"],
        status: "Đang bán",
        tone: "ok",
      },
      {
        id: "PLAN-ENT",
        primary: "Enterprise",
        secondary: "SSO + SLA + tùy chỉnh",
        values: ["Không giới hạn", "7", "Liên hệ"],
        status: "Đang bán",
        tone: "ok",
      },
    ],
  },
  usage: {
    title: "Usage & giới hạn",
    description: "Theo dõi tiêu thụ tài nguyên theo tenant và gói.",
    secondaryAction: "Xuất usage",
    stats: [
      ["12.846", "MAU", "+8,4%"],
      ["18,4 triệu", "API calls", "30 ngày"],
      ["248 GB", "Storage", "62% quota"],
      ["3,2 triệu", "Jobs", "99,7% thành công"],
    ],
    columns: ["Gói", "MAU", "Storage", "Trạng thái"],
    rows: [
      {
        id: "USE-HDG",
        primary: "Hải Đăng Group",
        secondary: "HDG-001",
        values: ["Growth", "231/300", "8,6/20 GB"],
        status: "Bình thường",
        tone: "ok",
      },
      {
        id: "USE-APR",
        primary: "An Phú Retail",
        secondary: "APR-012",
        values: ["Starter", "83/100", "4,8/5 GB"],
        status: "Gần giới hạn",
        tone: "warn",
      },
      {
        id: "USE-MQL",
        primary: "Minh Quân Logistics",
        secondary: "MQL-028",
        values: ["Enterprise", "1.690", "64/200 GB"],
        status: "Bình thường",
        tone: "ok",
      },
    ],
  },
  sync: {
    title: "Sync jobs",
    description: "Giám sát import, Google Sheets và tác vụ nền.",
    primaryAction: "Retry lỗi",
    stats: [
      ["1.842", "Jobs hôm nay", "99,4% thành công"],
      ["6", "Đang lỗi", "3 tenant"],
      ["14", "Đang chạy", "Queue delay 1,4s"],
      ["32", "Đang backoff", "Google quota"],
    ],
    columns: ["Tenant", "Dataset", "Thời gian", "Trạng thái"],
    rows: [
      {
        id: "SYNC-8408",
        primary: "Employee sheet sync",
        secondary: "Hải Đăng Group",
        values: ["HDG-001", "employees", "08:15 · 42 giây"],
        status: "Thành công",
        tone: "ok",
      },
      {
        id: "SYNC-8401",
        primary: "Payroll mapping",
        secondary: "Hải Đăng Group",
        values: ["HDG-001", "payroll", "08:08 · 18 giây"],
        status: "6 lỗi",
        tone: "bad",
      },
      {
        id: "SYNC-8398",
        primary: "Employee sheet sync",
        secondary: "An Phú Retail",
        values: ["APR-012", "employees", "08:02 · retry 3"],
        status: "Backoff",
        tone: "warn",
      },
    ],
  },
  incidents: {
    title: "Sự cố & cảnh báo",
    description: "Điều phối incident, ảnh hưởng và cập nhật trạng thái.",
    primaryAction: "Tạo incident",
    stats: [
      ["2", "Đang mở", "1 SEV-2"],
      ["14 phút", "MTTA", "Mục tiêu < 20"],
      ["48 phút", "MTTR", "30 ngày"],
      ["0", "Sự cố toàn nền tảng", "30 ngày"],
    ],
    columns: ["Mức độ", "Ảnh hưởng", "Owner", "Trạng thái"],
    rows: [
      {
        id: "INC-019",
        primary: "Attendance queue delay",
        secondary: "Mở lúc 07:54",
        values: ["SEV-2", "MQL-028", "Platform on-call"],
        status: "Đang điều tra",
        tone: "bad",
      },
      {
        id: "INC-018",
        primary: "Google quota warning",
        secondary: "Mở lúc 07:31",
        values: ["SEV-3", "3 tenant", "Integrations"],
        status: "Đang giảm thiểu",
        tone: "warn",
      },
      {
        id: "INC-017",
        primary: "Email delivery delay",
        secondary: "18/10 · 15:20",
        values: ["SEV-3", "Invitation email", "Platform"],
        status: "Đã giải quyết",
        tone: "ok",
      },
    ],
  },
  releases: {
    title: "Releases",
    description: "Theo dõi phiên bản Web, API và mobile iOS/Android.",
    primaryAction: "Tạo release",
    stats: [
      ["v0.8.4", "Web/API", "Stable"],
      ["v2.4.0", "Mobile", "72% rollout"],
      ["2.3.1", "Minimum mobile", "iOS & Android"],
      ["0", "Rollback 30 ngày", "Ổn định"],
    ],
    columns: ["Bề mặt", "Ngày phát hành", "Rollout", "Trạng thái"],
    rows: [
      {
        id: "REL-084",
        primary: "v0.8.4",
        secondary: "Payroll validation, RLS hardening",
        values: ["Web/API", "18/10/2026", "100%"],
        status: "Stable",
        tone: "ok",
      },
      {
        id: "REL-240",
        primary: "v2.4.0",
        secondary: "Network retry, widget",
        values: ["iOS & Android", "16/10/2026", "72%"],
        status: "Rollout",
        tone: "info",
      },
      {
        id: "REL-083",
        primary: "v0.8.3",
        secondary: "Google Sheets connector",
        values: ["Web/API", "10/10/2026", "100%"],
        status: "Archived",
        tone: "info",
      },
    ],
  },
  flags: {
    title: "Feature flags",
    description: "Bật tính năng theo tenant, gói hoặc phần trăm rollout.",
    primaryAction: "Tạo flag",
    stats: [
      ["14", "Tổng flags", "11 đang bật"],
      ["3", "Đang rollout", "Có guardrail"],
      ["8", "Tenant pilot", "Sheet scheduler"],
      ["0", "Lỗi đánh giá", "24 giờ"],
    ],
    columns: ["Phạm vi", "Rollout", "Owner", "Trạng thái"],
    rows: [
      {
        id: "FLAG-SHEET",
        primary: "google_sheets_scheduled_sync",
        secondary: "Đồng bộ Sheet theo lịch",
        values: ["8 tenant pilot", "16%", "Integrations"],
        status: "Đang bật",
        tone: "ok",
      },
      {
        id: "FLAG-PAY",
        primary: "payroll_config_v2",
        secondary: "Payroll config versioned",
        values: ["Growth + Enterprise", "62%", "Payroll"],
        status: "Đang bật",
        tone: "ok",
      },
      {
        id: "FLAG-WIDGET",
        primary: "mobile_widget_v2",
        secondary: "Widget chấm công mới",
        values: ["iOS 17+", "72%", "Mobile"],
        status: "Đang bật",
        tone: "ok",
      },
    ],
  },
  support: {
    title: "Support access",
    description: "Truy cập tenant có lý do, thời hạn và audit.",
    primaryAction: "Yêu cầu truy cập",
    stats: [
      ["2", "Đang hiệu lực", "Tối đa 60 phút"],
      ["1", "Chờ tenant duyệt", "GFM-039"],
      ["18", "Phiên tháng này", "100% audit"],
      ["0", "Vi phạm", "90 ngày"],
    ],
    columns: ["Kỹ sư", "Phạm vi", "Hết hạn", "Trạng thái"],
    rows: [
      {
        id: "SUP-HDG",
        primary: "Hải Đăng Group",
        secondary: "Điều tra payroll sync",
        values: ["Nguyễn Duy", "Integration logs", "09:42"],
        status: "Đang hiệu lực",
        tone: "ok",
      },
      {
        id: "SUP-MQL",
        primary: "Minh Quân Logistics",
        secondary: "Queue delay attendance",
        values: ["Trần Vy", "Time service logs", "10:05"],
        status: "Đang hiệu lực",
        tone: "ok",
      },
      {
        id: "SUP-GFM",
        primary: "GreenFood Manufacturing",
        secondary: "Kiểm tra file import",
        values: ["Nguyễn Duy", "Import staging", "—"],
        status: "Chờ tenant",
        tone: "warn",
      },
    ],
  },
  audit: {
    title: "Platform audit",
    description: "Append-only log cho admin, automation và support access.",
    secondaryAction: "Xuất log",
    stats: [
      ["18.420", "Sự kiện hôm nay", "+12%"],
      ["42", "Actor", "18 human"],
      ["7", "Denied", "Đã chặn"],
      ["365 ngày", "Retention", "Production"],
    ],
    columns: ["Actor", "Tenant", "Action", "Kết quả"],
    rows: [
      {
        id: "AUD-8418",
        primary: "19/10 · 08:42:18",
        secondary: "support_access.granted",
        values: ["Nguyễn Duy", "Hải Đăng Group", "SYNC-8408 logs"],
        status: "Allowed",
        tone: "ok",
      },
      {
        id: "AUD-8312",
        primary: "19/10 · 08:31:02",
        secondary: "sync.retry_scheduled",
        values: ["system:sync-worker", "An Phú Retail", "SYNC-8398"],
        status: "Backoff",
        tone: "warn",
      },
      {
        id: "AUD-7561",
        primary: "19/10 · 07:56:17",
        secondary: "tenant.cross_access_denied",
        values: ["unknown", "Minh Quân Logistics", "employees/*"],
        status: "Denied",
        tone: "bad",
      },
    ],
  },
  settings: {
    title: "Cài đặt nền tảng",
    description: "Production environment và safety controls.",
    primaryAction: "Lưu bản nháp",
    stats: [
      ["Singapore", "Primary region", "Healthy"],
      ["2.3.1", "Minimum mobile", "iOS/Android"],
      ["60 phút", "Support session", "Tối đa"],
      ["Bắt buộc", "MFA", "Platform admin"],
    ],
    columns: ["Nhóm", "Giá trị", "Cập nhật", "Trạng thái"],
    rows: [
      {
        id: "CFG-REGION",
        primary: "Primary region",
        secondary: "Infrastructure",
        values: ["Environment", "Singapore", "18/10"],
        status: "Đang dùng",
        tone: "ok",
      },
      {
        id: "CFG-MOBILE",
        primary: "Minimum mobile version",
        secondary: "Release policy",
        values: ["Mobile", "2.3.1", "16/10"],
        status: "Enforced",
        tone: "info",
      },
      {
        id: "CFG-SUPPORT",
        primary: "Support session max",
        secondary: "Safety control",
        values: ["Security", "60 phút", "10/10"],
        status: "Đang dùng",
        tone: "ok",
      },
    ],
  },
};

function NavIcon({ id }: { id: string }) {
  const paths = navIconPaths[id] ?? navIconPaths.overview;

  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths?.map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

export function DashboardShell(props: DashboardShellProps) {
  const [active, setActive] = useState(
    props.navGroups[0]?.items[0]?.id ?? "overview",
  );
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState(props.alerts);
  const [message, setMessage] = useState<string | null>(null);
  const [moduleRows, setModuleRows] = useState<Record<string, ModuleRow[]>>({});
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ModuleRow | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const surface =
    props.surface ??
    (props.productLabel.includes("Console") ? "console" : "admin");
  const catalog = surface === "console" ? consoleModules : adminModules;
  const module = catalog[active];
  const currentModuleRows = moduleRows[active] ?? module?.rows ?? [];

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    const source = active === "overview" ? props.rows : currentModuleRows;
    return source.filter(
      (row) =>
        [row.primary, row.secondary, ...row.values]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(normalized) &&
        (!attentionOnly ||
          ("tone" in row
            ? row.tone === "bad" || row.tone === "warn"
            : row.status !== "Tốt")),
    );
  }, [active, attentionOnly, currentModuleRows, props.rows, query]);

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 2400);
  }

  function goTo(id: string) {
    setActive(id);
    setQuery("");
    setAttentionOnly(false);
    setSelectedRow(null);
  }

  function updateRow(id: string, status: string, tone: ModuleRow["tone"]) {
    if (!module) return;
    setModuleRows((state) => ({
      ...state,
      [active]: currentModuleRows.map((row) =>
        row.id === id ? { ...row, status, tone } : row,
      ),
    }));
    setSelectedRow((row) => (row?.id === id ? { ...row, status, tone } : row));
  }

  function runPrimaryAction() {
    if (!module) return;
    if (active === "requests") {
      setModuleRows((state) => ({
        ...state,
        [active]: currentModuleRows.map((row) =>
          row.tone === "warn" || row.tone === "bad"
            ? { ...row, status: "Đã duyệt", tone: "ok" }
            : row,
        ),
      }));
      notify("Đã duyệt các đơn đang chờ trong dữ liệu mẫu.");
      return;
    }
    if (active === "sync") {
      setModuleRows((state) => ({
        ...state,
        [active]: currentModuleRows.map((row) =>
          row.tone === "bad" || row.tone === "warn"
            ? { ...row, status: "Đang chạy", tone: "info" }
            : row,
        ),
      }));
      notify("Đã đưa các job lỗi vào hàng đợi retry.");
      return;
    }
    setDraftName("");
    setDraftNote("");
    setModalOpen(true);
  }

  function saveDraft() {
    if (!module || !draftName.trim()) {
      notify("Vui lòng nhập tên hoặc tiêu đề.");
      return;
    }
    const row: ModuleRow = {
      id: `${active.toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-4)}`,
      primary: draftName.trim(),
      secondary: draftNote.trim() || "Tạo từ dữ liệu mẫu",
      values: module.columns.slice(0, 3).map(() => "Chưa thiết lập"),
      status: active === "incidents" ? "Đang điều tra" : "Bản nháp",
      tone: active === "incidents" ? "bad" : "info",
    };
    setModuleRows((state) => ({
      ...state,
      [active]: [row, ...currentModuleRows],
    }));
    setModalOpen(false);
    notify(`${module.primaryAction ?? "Thao tác"} thành công.`);
  }

  function renderOverview() {
    const overviewRows = filteredRows as DashboardRow[];
    return (
      <>
        <section className="hero-banner">
          <span className="hero-icon">✓</span>
          <span>
            <strong>{props.banner.title}</strong>
            <small>{props.banner.detail}</small>
          </span>
          <button
            onClick={() =>
              goTo(surface === "admin" ? "attendance" : "incidents")
            }
          >
            {props.banner.action}　→
          </button>
        </section>
        <section className="metrics" aria-label="Chỉ số tổng quan">
          {props.metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span className={`metric-symbol ${metric.tone}`}>
                {metric.label.slice(0, 1)}
              </span>
              <span>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <em>{metric.detail}</em>
              </span>
              <svg viewBox="0 0 56 26" aria-hidden="true">
                <path d="M2 22 10 18 18 20 26 11 34 14 42 7 54 3" />
              </svg>
            </article>
          ))}
        </section>
        <section className="dashboard-grid">
          <article className="panel chart-panel">
            <header>
              <span>
                <h2>{props.chartTitle}</h2>
                <p>{props.chartSubtitle}</p>
              </span>
              <select aria-label="Khoảng thời gian">
                <option>12 tuần</option>
                <option>30 ngày</option>
              </select>
            </header>
            <div className="chart" role="img" aria-label={props.chartTitle}>
              {chartValues.map((value, index) => (
                <i key={index} style={{ height: `${value}%` }}>
                  <span>{index + 1}</span>
                </i>
              ))}
              <svg
                viewBox="0 0 100 44"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline points="2,36 12,31 22,33 32,24 42,19 52,26 62,15 72,12 82,17 98,7" />
              </svg>
            </div>
          </article>
          <aside className="side-stats">
            {props.metrics.slice(0, 3).map((metric) => (
              <article className="compact-card" key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <span>{metric.detail}</span>
              </article>
            ))}
          </aside>
        </section>
        <section className="lower-grid">
          <article className="panel table-panel">
            <header>
              <span>
                <h2>{props.tableTitle}</h2>
                <p>{overviewRows.length} kết quả trong dữ liệu mẫu</p>
              </span>
              <button onClick={() => setAttentionOnly((value) => !value)}>
                {attentionOnly ? "Bỏ lọc" : "Cần chú ý"}
              </button>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Đối tượng</th>
                    {props.tableColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewRows.map((row) => (
                    <tr key={row.secondary}>
                      <td>
                        <span className="entity">
                          <b>{row.avatar}</b>
                          <span>
                            <strong>{row.primary}</strong>
                            <small>{row.secondary}</small>
                          </span>
                        </span>
                      </td>
                      {row.values.map((value, index) => (
                        <td key={`${row.secondary}-${index}`}>{value}</td>
                      ))}
                      <td>
                        <span
                          className={`status ${row.status === "Tốt" ? "ok" : row.status === "Cần xử lý" ? "bad" : "warn"}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="panel alerts-panel">
            <header>
              <span>
                <h2>Thông báo</h2>
                <p>Hôm nay</p>
              </span>
            </header>
            <div className="alerts">
              {alerts.length ? (
                alerts.map((alert) => (
                  <div className="alert" key={alert.id}>
                    <i className={alert.tone}>!</i>
                    <span>
                      <strong>{alert.title}</strong>
                      <small>{alert.detail}</small>
                    </span>
                    <time>{alert.time}</time>
                    <button
                      aria-label={`Ẩn ${alert.title}`}
                      onClick={() =>
                        setAlerts((items) =>
                          items.filter((item) => item.id !== alert.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty">Đã xử lý tất cả thông báo.</p>
              )}
            </div>
          </article>
        </section>
      </>
    );
  }

  function renderModule() {
    if (!module)
      return (
        <div className="module-empty">
          <h2>Module đang được cấu hình</h2>
          <p>Nội dung sẽ được bổ sung trong dữ liệu mẫu.</p>
        </div>
      );
    return (
      <>
        <section className="module-stats">
          {module.stats.map(([value, label, detail], index) => (
            <article key={label}>
              <span className={`module-stat-icon tone-${index}`}>
                {label.slice(0, 1)}
              </span>
              <span>
                <small>{label}</small>
                <strong>{value}</strong>
                <em>{detail}</em>
              </span>
            </article>
          ))}
        </section>
        <section className="panel module-panel">
          <header className="module-toolbar">
            <label className="module-search">
              <span>⌕</span>
              <input
                aria-label={`Tìm trong ${module.title}`}
                placeholder={`Tìm trong ${module.title.toLocaleLowerCase("vi")}…`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span className="result-count">{filteredRows.length} kết quả</span>
            <button
              className={
                attentionOnly ? "filter-button active" : "filter-button"
              }
              onClick={() => setAttentionOnly((value) => !value)}
            >
              ⚑ Cần xử lý
            </button>
            <button
              className="filter-button"
              onClick={() => notify("Bộ lọc nâng cao đã sẵn sàng.")}
            >
              ☷ Bộ lọc
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            {module.secondaryAction ? (
              <button
                className="secondary-action"
                onClick={() =>
                  notify(
                    `${module.secondaryAction} đã hoàn tất với dữ liệu mẫu.`,
                  )
                }
              >
                {module.secondaryAction}
              </button>
            ) : null}
            {module.primaryAction ? (
              <button className="primary-action" onClick={runPrimaryAction}>
                ＋ {module.primaryAction}
              </button>
            ) : null}
          </header>
          <div className="table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Đối tượng</th>
                  {module.columns.slice(0, 3).map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(filteredRows as ModuleRow[]).map((row) => (
                  <tr key={row.id} onClick={() => setSelectedRow(row)}>
                    <td>
                      <span className="entity">
                        <b>
                          {row.primary
                            .split(" ")
                            .map((part) => part[0])
                            .slice(-2)
                            .join("")}
                        </b>
                        <span>
                          <strong>{row.primary}</strong>
                          <small>
                            {row.id} · {row.secondary}
                          </small>
                        </span>
                      </span>
                    </td>
                    {row.values.slice(0, 3).map((value, index) => (
                      <td key={`${row.id}-${index}`}>{value}</td>
                    ))}
                    <td>
                      <span className={`status ${row.tone}`}>{row.status}</span>
                    </td>
                    <td>
                      <button
                        className="row-more"
                        aria-label={`Mở ${row.primary}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRow(row);
                        }}
                      >
                        •••
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredRows.length ? (
              <div className="module-empty">
                <h3>Không có kết quả</h3>
                <p>Thử bỏ bộ lọc hoặc thay đổi từ khóa tìm kiếm.</p>
              </div>
            ) : null}
          </div>
        </section>
      </>
    );
  }

  return (
    <main className="kavor-stage">
      <section className="app-frame">
        <aside
          className="sidebar"
          aria-label={`Điều hướng ${props.productName}`}
        >
          <div className="brand">
            <span className="brand-logo">
              <img src="/kavor-logo.svg" alt="" />
            </span>
            <span>
              <strong>{props.productName}</strong>
              <small>{props.productLabel}</small>
            </span>
          </div>
          <nav>
            {props.navGroups.map((group, groupIndex) => (
              <div
                className="nav-group"
                key={`${group.label ?? "main"}-${groupIndex}`}
              >
                {group.label ? <p>{group.label}</p> : null}
                {group.items.map((item) => (
                  <button
                    className={
                      active === item.id ? "nav-item active" : "nav-item"
                    }
                    key={item.id}
                    onClick={() => goTo(item.id)}
                  >
                    <NavIcon id={item.id} />
                    <span>{item.label}</span>
                    {item.badge ? <b>{item.badge}</b> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-user">
            <span className="avatar">DQ</span>
            <span>
              <strong>Đạt Quản trị</strong>
              <small>Administrator</small>
            </span>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div>
              <h1>
                {active === "overview"
                  ? props.pageTitle
                  : (module?.title ?? props.pageTitle)}
              </h1>
              <p>
                {active === "overview"
                  ? props.pageSubtitle
                  : (module?.description ?? props.pageSubtitle)}
              </p>
            </div>
            <label className="global-search">
              <span>⌕</span>
              <input
                aria-label="Tìm kiếm"
                placeholder={props.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              className="icon-button"
              onClick={() => notify("Không có cảnh báo hệ thống mới.")}
            >
              ?
            </button>
            <button className="account-button">
              <span className="avatar small">HD</span>
              {props.accountLabel}⌄
            </button>
          </header>

          <div className="content">
            {active === "overview" ? renderOverview() : renderModule()}
          </div>
        </div>
      </section>
      {selectedRow ? (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedRow(null);
          }}
        >
          <aside className="record-drawer">
            <header>
              <div>
                <small>{selectedRow.id}</small>
                <h2>{selectedRow.primary}</h2>
                <p>{selectedRow.secondary}</p>
              </div>
              <button aria-label="Đóng" onClick={() => setSelectedRow(null)}>
                ×
              </button>
            </header>
            <div className="record-status">
              <span className={`status ${selectedRow.tone}`}>
                {selectedRow.status}
              </span>
              <small>Dữ liệu mẫu · cập nhật vừa xong</small>
            </div>
            <section>
              <h3>Thông tin chi tiết</h3>
              {module?.columns.slice(0, 3).map((label, index) => (
                <div className="detail-line" key={label}>
                  <span>{label}</span>
                  <strong>{selectedRow.values[index] ?? "—"}</strong>
                </div>
              ))}
              <div className="detail-line">
                <span>Audit</span>
                <strong>Đạt Quản trị · 20/10 11:32</strong>
              </div>
            </section>
            <section>
              <h3>Thao tác</h3>
              <div className="drawer-actions">
                {active === "requests" && selectedRow.status !== "Đã duyệt" ? (
                  <>
                    <button
                      className="secondary-action"
                      onClick={() => {
                        updateRow(selectedRow.id, "Từ chối", "bad");
                        notify(`Đã từ chối ${selectedRow.id}.`);
                      }}
                    >
                      Từ chối
                    </button>
                    <button
                      className="primary-action"
                      onClick={() => {
                        updateRow(selectedRow.id, "Đã duyệt", "ok");
                        notify(`Đã duyệt ${selectedRow.id}.`);
                      }}
                    >
                      Duyệt
                    </button>
                  </>
                ) : active === "sync" && selectedRow.tone !== "ok" ? (
                  <button
                    className="primary-action"
                    onClick={() => {
                      updateRow(selectedRow.id, "Đang chạy", "info");
                      notify(`Đã retry ${selectedRow.id}.`);
                    }}
                  >
                    Retry job
                  </button>
                ) : active === "support" &&
                  selectedRow.status === "Đang hiệu lực" ? (
                  <button
                    className="danger-action"
                    onClick={() => {
                      updateRow(selectedRow.id, "Đã thu hồi", "info");
                      notify(`Đã thu hồi ${selectedRow.id}.`);
                    }}
                  >
                    Thu hồi quyền
                  </button>
                ) : active === "flags" ? (
                  <button
                    className="primary-action"
                    onClick={() => {
                      const enabled = selectedRow.status === "Đang bật";
                      updateRow(
                        selectedRow.id,
                        enabled ? "Đã tắt" : "Đang bật",
                        enabled ? "info" : "ok",
                      );
                      notify(
                        `${enabled ? "Đã tắt" : "Đã bật"} ${selectedRow.primary}.`,
                      );
                    }}
                  >
                    {selectedRow.status === "Đang bật"
                      ? "Tắt flag"
                      : "Bật flag"}
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    onClick={() =>
                      notify(`Đã lưu cập nhật cho ${selectedRow.id}.`)
                    }
                  >
                    Lưu cập nhật
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
      {modalOpen && module ? (
        <div
          className="overlay modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <section className="action-modal">
            <header>
              <div>
                <h2>{module.primaryAction}</h2>
                <p>Tạo bản ghi mới bằng dữ liệu mẫu để kiểm thử luồng.</p>
              </div>
              <button aria-label="Đóng" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <label>
                <span>Tên hoặc tiêu đề *</span>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder={`Nhập ${module.title.toLocaleLowerCase("vi")}…`}
                />
              </label>
              <label>
                <span>Ghi chú</span>
                <textarea
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder="Thông tin bổ sung cho bản ghi mẫu"
                />
              </label>
              <div className="modal-preview">
                <strong>Quy trình sau khi lưu</strong>
                <span>
                  Kiểm tra dữ liệu → ghi audit → cập nhật danh sách → gửi thông
                  báo
                </span>
              </div>
            </div>
            <footer>
              <button
                className="secondary-action"
                onClick={() => setModalOpen(false)}
              >
                Hủy
              </button>
              <button className="primary-action" onClick={saveDraft}>
                Lưu dữ liệu mẫu
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {message ? (
        <div className="toast" role="status">
          {message}
        </div>
      ) : null}
    </main>
  );
}
