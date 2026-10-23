/* Ngữ cảnh một request Kavor Console: nhân viên Kavor nào (platform_operators), phiên đã qua MFA chưa.
   Nhân viên Kavor không có membership trong tenant: thao tác lên tenant đi qua hàm SQL riêng và ghi audit actor 'platform'. */
import { AUTH_ERRORS, type OperatorMe, type OperatorRole } from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { claim, forbidden, type MfaFactor } from "../admin/context.js";

export class ConsoleContext {
  /* MfaCtx cần `actor` (id hồ sơ để ghi audit); nhân viên Kavor không có hồ sơ nhân viên */
  readonly actor = null;

  constructor(
    readonly sb: SupabaseGateway,
    readonly operator: OperatorMe,
    readonly correlationId: string,
    readonly accessToken: string,
    readonly aal: string,
    readonly factors: MfaFactor[],
  ) {}

  get db() { return this.sb.admin; }
  get userId() { return this.operator.userId; }
  totpFactor(): MfaFactor | null { return this.factors.find((f) => f.factor_type === "totp" && f.status === "verified") ?? null; }
  /* Console luôn bắt buộc MFA, kể cả khi sau này web HR cho tenant tùy chọn */
  mfaSatisfied() { return this.aal === "aal2"; }

  /* tenantId: tenant bị tác động (tenant đó cũng thấy dòng audit này); null = thao tác cấp nền tảng */
  async audit(action: string, resourceType: string, resourceId: string | null, before: unknown = null, after: unknown = null, reason: string | null = null, tenantId: string | null = null) {
    const { error } = await this.db.from("audit_logs").insert({
      tenant_id: tenantId, actor_user_id: this.userId, actor_type: "platform", action, resource_type: resourceType, resource_id: resourceId,
      before_data: before, after_data: after, reason, correlation_id: this.correlationId,
    });
    if (error) throw error;
  }
}

export async function resolveConsole(sb: SupabaseGateway, accessToken: string, correlationId: string): Promise<ConsoleContext> {
  const { data, error } = await sb.admin.auth.getUser(accessToken);
  if (error && error.status !== 401 && error.status !== 403) throw new AuthError("AUTH_UNAVAILABLE", "Máy chủ xác thực đang bận. Vui lòng thử lại.", 503, true);
  if (error || !data.user) throw new AuthError(AUTH_ERRORS.sessionExpired, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  const op = await operatorOf(sb, data.user.id);
  if (!op) throw forbidden("Tài khoản này không phải nhân viên vận hành Kavor.");
  const factors = ((data.user.factors ?? []) as MfaFactor[]).map((f) => ({ id: f.id, factor_type: f.factor_type, status: f.status }));
  return new ConsoleContext(sb, op, correlationId, accessToken, String(claim(accessToken, "aal") ?? "aal1"), factors);
}

export async function operatorOf(sb: SupabaseGateway, userId: string): Promise<OperatorMe | null> {
  const { data } = await sb.admin.from("platform_operators").select("user_id, email, full_name, role, status").eq("user_id", userId).maybeSingle();
  const o = data as { user_id: string; email: string; full_name: string; role: OperatorRole; status: string } | null;
  return o && o.status === "active" ? { userId: o.user_id, email: o.email, fullName: o.full_name, role: o.role } : null;
}
