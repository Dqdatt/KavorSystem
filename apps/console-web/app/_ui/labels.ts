/* Nhãn hiển thị dùng chung cho các trang Kavor Console */
import type { ConsoleTenant, PlanCode, SupportStatus, TenantStatus } from "@kavor/contracts";

export const PLAN: Record<PlanCode, string> = { trial: "Dùng thử", starter: "Starter", growth: "Growth", enterprise: "Enterprise" };
export const TSTATUS: Record<TenantStatus, [string, string]> = { active: ["Hoạt động", ""], provisioning: ["Đang khởi tạo", "info"], suspended: ["Tạm khóa", "bad"], closed: ["Đã đóng", "muted"] };
export const SSTATUS: Record<SupportStatus, [string, string]> = {
  pending: ["Chờ doanh nghiệp duyệt", "warn"], active: ["Đang hiệu lực", ""], rejected: ["Doanh nghiệp từ chối", "bad"], cancelled: ["Đã hủy", "muted"],
  revoked: ["Doanh nghiệp thu hồi", "bad"], ended: ["Đã kết thúc", "muted"], expired: ["Hết hạn", "muted"],
};
/* Cảnh báo chống mất quyền: không còn Tenant Admin hoạt động, hoặc chỉ còn một */
export function adminHealth(t: ConsoleTenant): [string, string] {
  if (t.admins.active === 0) return [t.admins.invited ? "Quản trị viên chưa kích hoạt" : "Không còn quản trị viên", t.admins.invited ? "info" : "bad"];
  if (t.admins.active === 1) return ["Chỉ 1 quản trị viên", "warn"];
  return [`${t.admins.active} quản trị viên`, ""];
}

/* Hành động trong audit (actor Kavor + một số hành động của khách liên quan) */
export const ACTION: Record<string, string> = {
  "console.login": "Đăng nhập bảng điều khiển", "tenant.created": "Tạo doanh nghiệp", "employee.invited": "Gửi lời mời quản trị viên công ty",
  "owner_recovery.requested": "Tạo yêu cầu khôi phục", "owner_recovery.approved": "Duyệt khôi phục", "owner_recovery.rejected": "Từ chối khôi phục",
  "owner_recovery.cancelled": "Hủy yêu cầu khôi phục", "auth.mfa_reset": "Đặt lại xác thực hai lớp", "role.granted": "Cấp quyền quản trị viên công ty",
  "auth.mfa_enrolled": "Bật xác thực hai lớp", "auth.mfa_verified": "Xác thực hai lớp",
  "support.requested": "Yêu cầu quyền hỗ trợ", "support.approved": "Doanh nghiệp duyệt quyền hỗ trợ", "support.rejected": "Doanh nghiệp từ chối quyền hỗ trợ",
  "support.revoked": "Doanh nghiệp thu hồi quyền hỗ trợ", "support.cancelled": "Hủy yêu cầu quyền hỗ trợ", "support.ended": "Kết thúc phiên hỗ trợ", "support.viewed": "Xem dữ liệu khi hỗ trợ",
  "tenant.plan_changed": "Đổi gói dịch vụ", "tenant.suspended": "Tạm khóa doanh nghiệp", "tenant.reactivated": "Mở lại doanh nghiệp", "tenant.closed": "Đóng doanh nghiệp",
};
