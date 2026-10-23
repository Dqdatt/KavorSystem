/* Nhãn hiển thị dùng chung cho các trang Kavor Console */
import type { ConsoleTenant, PlanCode, TenantStatus } from "@kavor/contracts";

export const PLAN: Record<PlanCode, string> = { trial: "Trial", starter: "Starter", growth: "Growth", enterprise: "Enterprise" };
export const TSTATUS: Record<TenantStatus, [string, string]> = { active: ["Hoạt động", ""], provisioning: ["Đang khởi tạo", "info"], suspended: ["Đã khóa", "bad"], closed: ["Đã đóng", "muted"] };
/* Cảnh báo chống mất quyền: không còn Tenant Admin hoạt động, hoặc chỉ còn một */
export function adminHealth(t: ConsoleTenant): [string, string] {
  if (t.admins.active === 0) return [t.admins.invited ? "Admin chưa kích hoạt" : "Không còn Tenant Admin", t.admins.invited ? "info" : "bad"];
  if (t.admins.active === 1) return ["Chỉ 1 Tenant Admin", "warn"];
  return [`${t.admins.active} Tenant Admin`, ""];
}

/* Hành động trong audit (actor Kavor + một số hành động của khách liên quan) */
export const ACTION: Record<string, string> = {
  "console.login": "Đăng nhập Console", "tenant.created": "Tạo tenant", "employee.invited": "Gửi lời mời Tenant Admin",
  "owner_recovery.requested": "Tạo yêu cầu khôi phục", "owner_recovery.approved": "Duyệt khôi phục", "owner_recovery.rejected": "Từ chối khôi phục",
  "owner_recovery.cancelled": "Hủy yêu cầu khôi phục", "auth.mfa_reset": "Đặt lại xác thực hai lớp", "role.granted": "Cấp Tenant Admin",
  "auth.mfa_enrolled": "Bật xác thực hai lớp", "auth.mfa_verified": "Xác thực hai lớp",
};
