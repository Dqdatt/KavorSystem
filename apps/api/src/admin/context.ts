/* Ngữ cảnh của một request HR/Admin: ai, tenant nào, có permission gì trong phạm vi nào.
   Tenant lấy từ membership đang hoạt động của tài khoản, không tin dữ liệu client gửi lên.
   Phạm vi tính bằng hàm SQL `scoped_employees` — cùng hàm mà RLS dùng, nên API và Realtime không lệch nhau. */
import { ADMIN_ERRORS, AUTH_ERRORS, type ScopeType } from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";

export type Grant = { permission: string; role_code: string; role_name: string; scope_type: ScopeType; scope_id: string | null };
export type ActorEmployee = { id: string; full_name: string; employee_code: string; work_email: string | null };

/* Permission mở được web HR/Admin (có ít nhất một trong số này) */
export const WEB_PERMISSIONS = ["employee.read", "attendance.read", "schedule.read", "attendance.device.manage", "audit.read", "role.read"];

export const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") => new AuthError(ADMIN_ERRORS.forbidden, message, 403);
export const notFound = (what = "dữ liệu") => new AuthError(ADMIN_ERRORS.notFound, `Không tìm thấy ${what}.`, 404);
export const conflict = (message: string) => new AuthError(ADMIN_ERRORS.conflict, message, 409);
export const invalid = (message: string) => new AuthError("VALIDATION_FAILED", message, 400);

export class AdminContext {
  constructor(
    readonly sb: SupabaseGateway,
    readonly userId: string,
    readonly email: string,
    readonly tenantId: string,
    readonly membershipId: string,
    readonly actor: ActorEmployee | null,
    readonly grants: Grant[],
    readonly correlationId: string,
  ) {}

  get db() { return this.sb.admin; }

  permissions(): string[] { return [...new Set(this.grants.map((g) => g.permission))].sort(); }
  can(perm: string) { return this.grants.some((g) => g.permission === perm); }
  require(perm: string) { if (!this.can(perm)) throw forbidden(); }
  scopes(perm: string) { return this.grants.filter((g) => g.permission === perm); }
  /* Có permission ở phạm vi toàn công ty (bắt buộc với cấu hình cấp công ty như mẫu ca, địa điểm) */
  tenantWide(perm: string) { return this.scopes(perm).some((g) => g.scope_type === "tenant"); }
  requireTenantWide(perm: string) { this.require(perm); if (!this.tenantWide(perm)) throw forbidden("Thao tác này cần quyền ở phạm vi toàn công ty."); }

  /* Nhân viên trong phạm vi một permission — builder PostgREST, lọc/sắp xếp tiếp được */
  scopedEmployees(perm: string, columns = "*") {
    return this.db.rpc("scoped_employees", { p_user: this.userId, p_tenant: this.tenantId, p_perm: perm }).select(columns);
  }

  async scopedEmployeeIds(perm: string): Promise<Set<string>> {
    const { data, error } = await this.scopedEmployees(perm, "id");
    if (error) throw error;
    return new Set(((data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id));
  }

  /* Nhân viên ngoài phạm vi hoặc thuộc tenant khác đều trả 404 (không tiết lộ sự tồn tại) */
  async requireEmployee(perm: string, employeeId: string) {
    this.require(perm);
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) throw notFound("nhân viên");
    const { data, error } = await this.db.rpc("employee_in_scope", { p_user: this.userId, p_tenant: this.tenantId, p_perm: perm, p_employee: employeeId });
    if (error) throw error;
    if (data !== true) throw notFound("nhân viên");
  }

  /* Ghi audit trước/sau cho mọi thao tác ghi của HR */
  async audit(action: string, resourceType: string, resourceId: string | null, before: unknown = null, after: unknown = null, reason: string | null = null) {
    const { error } = await this.db.from("audit_logs").insert({
      tenant_id: this.tenantId, actor_user_id: this.userId, actor_type: "user", action, resource_type: resourceType, resource_id: resourceId,
      before_data: before, after_data: after, reason, correlation_id: this.correlationId,
    });
    if (error) throw error;
  }
}

export async function resolveAdmin(sb: SupabaseGateway, accessToken: string, correlationId: string): Promise<AdminContext> {
  const expired = new AuthError(AUTH_ERRORS.sessionExpired, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  const { data, error } = await sb.admin.auth.getUser(accessToken);
  /* Chỉ token sai/hết hạn mới là "hết phiên"; Auth chậm hoặc lỗi mạng thì báo thử lại, không đăng xuất người dùng */
  if (error && error.status !== 401 && error.status !== 403) throw new AuthError("AUTH_UNAVAILABLE", "Máy chủ xác thực đang bận. Vui lòng thử lại.", 503, true);
  if (error || !data.user) throw expired;
  const user = data.user;
  /* Tenant đang làm việc: ghi trong app_metadata lúc kích hoạt; không có thì lấy membership duy nhất */
  const preferred = (user.app_metadata as Record<string, unknown> | undefined)?.active_tenant_id as string | undefined;
  const { data: ms } = await sb.admin.from("memberships").select("id, tenant_id, status, employee_id").eq("user_id", user.id);
  const memberships = (ms ?? []) as Array<{ id: string; tenant_id: string; status: string; employee_id: string | null }>;
  const m = memberships.find((x) => x.tenant_id === preferred) ?? (memberships.length === 1 ? memberships[0] : undefined);
  if (!m) throw forbidden("Tài khoản chưa thuộc công ty nào trên Kavor.");
  if (m.status !== "active") throw new AuthError(AUTH_ERRORS.accountDisabled, "Tài khoản đang bị khóa. Liên hệ quản trị viên công ty.", 403);
  const [{ data: grants, error: gErr }, { data: emp }] = await Promise.all([
    sb.admin.rpc("permission_grants", { p_user: user.id, p_tenant: m.tenant_id }),
    sb.admin.from("employees").select("id, full_name, employee_code, work_email, status").eq("user_id", user.id).eq("tenant_id", m.tenant_id).maybeSingle(),
  ]);
  if (gErr) throw gErr;
  const e = emp as (ActorEmployee & { status: string }) | null;
  if (e && (e.status === "terminated" || e.status === "suspended")) throw new AuthError(AUTH_ERRORS.accountDisabled, "Tài khoản đang bị khóa. Liên hệ quản trị viên công ty.", 403);
  return new AdminContext(sb, user.id, user.email ?? "", m.tenant_id, m.id, e, (grants ?? []) as Grant[], correlationId);
}
