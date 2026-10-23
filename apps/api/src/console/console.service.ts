/* Kavor Console tối thiểu (ADR 0001 §1): tạo tenant + mời Tenant Admin đầu tiên, theo dõi tenant còn bao nhiêu admin,
   khôi phục quyền chủ sở hữu (đặt lại MFA của Tenant Admin, cấp Tenant Admin mới) với xác minh + hai nhân viên Kavor.
   Nhân viên Kavor chỉ thấy thông tin vận hành (số lượng, danh sách admin), không đọc hồ sơ/chấm công của tenant. */
import type {
  AccountStatus, ConsoleAuditEntry, ConsoleOverview, ConsoleTenant, ConsoleTenantDetail, OwnerRecovery, PlanCode, RecoveryKind, RecoveryStatus,
  TenantAdminInfo, TenantCreateResult, TenantStatus,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound } from "../admin/context.js";
import type { Mailer } from "../admin/mailer.js";
import { EMAIL, nullableText, number, oneOf, req, uuid, type Body } from "../admin/validate.js";
import type { ConsoleContext } from "./context.js";

const PLANS: readonly PlanCode[] = ["trial", "starter", "growth", "enterprise"];
const KINDS: readonly RecoveryKind[] = ["mfa_reset", "grant_admin"];
const CODE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

type TenantRow = { id: string; code: string; display_name: string; legal_name: string | null; tax_code: string | null; timezone: string; plan_code: PlanCode; status: TenantStatus; employee_limit: number; created_at: string };
type AdminRow = { membership_id: string; status: string; employee_id: string | null; user_id: string | null };
type RecoveryRow = {
  id: string; tenant_id: string; kind: RecoveryKind; target_employee_id: string | null; new_admin_name: string | null; new_admin_email: string | null;
  verification: string; reason: string; requested_by: string; requested_at: string; expires_at: string; status: Exclude<RecoveryStatus, "expired">;
  decided_by: string | null; decided_at: string | null; decision_note: string | null; result: unknown;
};
const TENANT_COLS = "id, code, display_name, legal_name, tax_code, timezone, plan_code, status, employee_limit, created_at";
const RECOVERY_COLS = "id, tenant_id, kind, target_employee_id, new_admin_name, new_admin_email, verification, reason, requested_by, requested_at, expires_at, status, decided_by, decided_at, decision_note, result";

export class ConsoleService {
  constructor(private readonly sb: SupabaseGateway, private readonly mailer: Mailer, private readonly adminWebUrl: string) {}

  /* ---------- Tenant ---------- */
  private async summaries(ctx: ConsoleContext, only?: string): Promise<ConsoleTenant[]> {
    const db = ctx.db;
    let tq = db.from("tenants").select(TENANT_COLS).order("created_at", { ascending: false });
    if (only) tq = tq.eq("id", only);
    const [{ data: ts, error }, { data: es }, { data: as }] = await Promise.all([
      tq,
      db.from("employees").select("tenant_id, user_id, status").neq("status", "terminated"),
      db.from("role_assignments").select("tenant_id, effective_from, effective_to, roles!inner(code, tenant_id), memberships!inner(status)").eq("roles.code", "tenant_admin").is("roles.tenant_id", null),
    ]);
    if (error) throw error;
    const today = new Date().toISOString().slice(0, 10);
    const count = new Map<string, { employees: number; accounts: number; active: number; invited: number }>();
    const of = (t: string) => { let c = count.get(t); if (!c) count.set(t, c = { employees: 0, accounts: 0, active: 0, invited: 0 }); return c; };
    for (const e of (es ?? []) as Array<{ tenant_id: string; user_id: string | null }>) { const c = of(e.tenant_id); c.employees++; if (e.user_id) c.accounts++; }
    for (const a of (as ?? []) as unknown as Array<{ tenant_id: string; effective_from: string; effective_to: string | null; memberships: { status: string } }>) {
      if (a.effective_from > today || (a.effective_to && a.effective_to < today)) continue;
      if (a.memberships.status === "active") of(a.tenant_id).active++;
      else if (a.memberships.status === "invited") of(a.tenant_id).invited++;
    }
    return ((ts ?? []) as TenantRow[]).map((t) => {
      const c = of(t.id);
      return {
        id: t.id, code: t.code, name: t.display_name, legalName: t.legal_name, plan: t.plan_code, status: t.status, employeeLimit: t.employee_limit,
        employees: c.employees, accounts: c.accounts, admins: { active: c.active, invited: c.invited }, createdAt: t.created_at,
      };
    });
  }

  async overview(ctx: ConsoleContext): Promise<ConsoleOverview> {
    const [tenants, { count: pending }] = await Promise.all([
      this.summaries(ctx),
      ctx.db.from("owner_recovery_requests").select("id", { count: "exact", head: true }).eq("status", "pending").gt("expires_at", new Date().toISOString()),
    ]);
    const live = tenants.filter((t) => t.status !== "closed");
    return {
      tenants: { total: live.length, active: live.filter((t) => t.status === "active").length, trial: live.filter((t) => t.plan === "trial").length, suspended: live.filter((t) => t.status === "suspended").length },
      employees: live.reduce((n, t) => n + t.employees, 0), accounts: live.reduce((n, t) => n + t.accounts, 0), pendingRecoveries: pending ?? 0,
      singleAdminTenants: live.filter((t) => t.admins.active === 1).length,
      noActiveAdminTenants: live.filter((t) => t.admins.active === 0).length,
      recentTenants: tenants.slice(0, 6),
    };
  }

  async tenants(ctx: ConsoleContext): Promise<ConsoleTenant[]> { return this.summaries(ctx); }

  async tenant(ctx: ConsoleContext, id: string): Promise<ConsoleTenantDetail> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("tenant");
    const [summary] = await this.summaries(ctx, id);
    if (!summary) throw notFound("tenant");
    const [{ data: t }, admins, recoveries, audit] = await Promise.all([
      ctx.db.from("tenants").select("tax_code, timezone").eq("id", id).single(),
      this.admins(ctx, id),
      this.recoveries(ctx, id),
      this.audit(ctx, id),
    ]);
    return { ...summary, taxCode: (t?.tax_code as string | null) ?? null, timezone: (t?.timezone as string) ?? "Asia/Ho_Chi_Minh", tenantAdmins: admins, recoveries, audit };
  }

  /* Tenant Admin của một tenant: trạng thái tài khoản + đã liên kết MFA chưa (để biết có cần khôi phục) */
  private async admins(ctx: ConsoleContext, tenantId: string): Promise<TenantAdminInfo[]> {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await ctx.db.from("role_assignments").select("effective_from, effective_to, roles!inner(code, tenant_id), memberships!inner(id, status, employee_id, user_id)")
      .eq("tenant_id", tenantId).eq("roles.code", "tenant_admin").is("roles.tenant_id", null);
    const rows = ((data ?? []) as unknown as Array<{ effective_from: string; effective_to: string | null; memberships: AdminRow & { id: string } }>)
      .filter((a) => a.effective_from <= today && (!a.effective_to || a.effective_to >= today)).map((a) => a.memberships);
    const ids = [...new Set(rows.map((r) => r.employee_id).filter((x): x is string => !!x))];
    if (!ids.length) return [];
    const [{ data: es }, { data: ps }] = await Promise.all([
      ctx.db.from("employees").select("id, employee_code, full_name, work_email, user_id, invited_at").in("id", ids),
      ctx.db.from("user_profiles").select("id, last_login_at").in("id", rows.map((r) => r.user_id).filter((x): x is string => !!x)),
    ]);
    const login = new Map(((ps ?? []) as Array<{ id: string; last_login_at: string | null }>).map((p) => [p.id, p.last_login_at]));
    const out: TenantAdminInfo[] = [];
    for (const e of (es ?? []) as Array<{ id: string; employee_code: string; full_name: string; work_email: string | null; user_id: string | null; invited_at: string | null }>) {
      const m = rows.find((r) => r.employee_id === e.id);
      const account: AccountStatus = !e.user_id ? (e.invited_at ? "invited" : "not_invited") : m?.status === "active" ? "active" : "locked";
      let mfaEnrolled = false;
      if (e.user_id) {
        const { data: f } = await ctx.db.auth.admin.mfa.listFactors({ userId: e.user_id });
        mfaEnrolled = (f?.factors ?? []).some((x) => x.factor_type === "totp" && x.status === "verified");
      }
      out.push({ employeeId: e.id, code: e.employee_code, fullName: e.full_name, email: e.work_email, account, mfaEnrolled, lastLoginAt: e.user_id ? login.get(e.user_id) ?? null : null, invitedAt: e.invited_at });
    }
    return out.sort((a, b) => a.code.localeCompare(b.code));
  }

  /* Tạo tenant + bộ mẫu theo luật Việt Nam + hồ sơ Tenant Admin đầu tiên (một transaction), rồi gửi thư mời */
  async createTenant(ctx: ConsoleContext, b: Body): Promise<TenantCreateResult> {
    if (ctx.operator.role !== "platform_operator") throw forbidden("Chỉ Platform Operator được tạo tenant.");
    const code = req(b, "code", { max: 20 }).toUpperCase();
    if (!CODE.test(code)) throw invalid("Mã tenant 3–20 ký tự: chữ in hoa, số, dấu gạch (ví dụ ANP-002).");
    const name = req(b, "name", { min: 2, max: 120 });
    const legalName = nullableText(b, "legalName", 200) ?? null;
    const plan = oneOf(b, "plan", PLANS)!;
    const employeeLimit = number(b, "employeeLimit", 1, 100000, { integer: true })!;
    const adminName = req(b, "adminName", { min: 2, max: 120 });
    const adminEmail = req(b, "adminEmail", { pattern: EMAIL, max: 200, hint: "email công việc" }).toLowerCase();
    const { data, error } = await ctx.db.rpc("create_tenant_with_admin", {
      p_code: code, p_name: name, p_legal_name: legalName, p_plan: plan, p_employee_limit: employeeLimit, p_admin_name: adminName, p_admin_email: adminEmail, p_actor: ctx.userId,
    });
    if (error?.code === "23505") throw conflict(`Mã tenant ${code} đã tồn tại.`);
    if (error) throw error;
    const r = data as { tenant_id: string; admin_employee_id: string; provisioned: string[] };
    await ctx.audit("tenant.created", "tenant", r.tenant_id, null, { code, name, legal_name: legalName, plan, employee_limit: employeeLimit, admin_email: adminEmail, provisioned: r.provisioned }, null, r.tenant_id);
    const invite = await this.sendInvite(ctx, r.tenant_id, r.admin_employee_id).then(() => ({ sent: true, error: null }), (e: unknown) => ({ sent: false, error: e instanceof AuthError ? e.message : "Chưa gửi được thư mời." }));
    return { tenant: await this.tenant(ctx, r.tenant_id), invite };
  }

  /* Gửi lại thư mời cho Tenant Admin chưa kích hoạt (khách báo không nhận được thư) */
  async resendInvite(ctx: ConsoleContext, tenantId: string, employeeId: string) {
    if (!(await this.admins(ctx, tenantId)).some((a) => a.employeeId === employeeId && (a.account === "invited" || a.account === "not_invited"))) {
      throw notFound("Tenant Admin chưa kích hoạt");
    }
    const { data } = await ctx.db.from("employees").select("invited_at").eq("id", employeeId).single();
    const at = (data as { invited_at: string | null } | null)?.invited_at;
    if (at && Date.now() - Date.parse(at) < 60_000) throw new AuthError("RATE_LIMITED", "Vừa gửi lời mời. Đợi một phút rồi gửi lại.", 429, true);
    await this.sendInvite(ctx, tenantId, employeeId);
    return this.tenant(ctx, tenantId);
  }

  private async sendInvite(ctx: ConsoleContext, tenantId: string, employeeId: string) {
    const [{ data: e }, { data: t }] = await Promise.all([
      ctx.db.from("employees").select("employee_code, full_name, work_email, invited_at, invite_count").eq("id", employeeId).eq("tenant_id", tenantId).single(),
      ctx.db.from("tenants").select("display_name").eq("id", tenantId).single(),
    ]);
    const emp = e as { employee_code: string; full_name: string; work_email: string | null; invited_at: string | null; invite_count: number };
    if (!emp.work_email) throw invalid("Hồ sơ chưa có email.");
    await this.mailer.sendInvite({ to: emp.work_email, fullName: emp.full_name, employeeCode: emp.employee_code, companyName: (t?.display_name as string) ?? "Công ty", invitedBy: `${ctx.operator.fullName} (Kavor)`, webUrl: this.adminWebUrl });
    const invitedAt = new Date().toISOString();
    await ctx.db.from("employees").update({ invited_at: invitedAt, invite_count: emp.invite_count + 1 }).eq("id", employeeId);
    await ctx.audit("employee.invited", "employee", employeeId, { invited_at: emp.invited_at }, { invited_at: invitedAt, to: emp.work_email, role: "tenant_admin" }, null, tenantId);
  }

  /* ---------- Khôi phục quyền chủ sở hữu ---------- */
  async recoveries(ctx: ConsoleContext, tenantId?: string): Promise<OwnerRecovery[]> {
    let q = ctx.db.from("owner_recovery_requests").select(RECOVERY_COLS).order("requested_at", { ascending: false }).limit(100);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as RecoveryRow[];
    if (!rows.length) return [];
    const [{ data: ts }, { data: es }, { data: ops }] = await Promise.all([
      ctx.db.from("tenants").select("id, code, display_name").in("id", [...new Set(rows.map((r) => r.tenant_id))]),
      ctx.db.from("employees").select("id, full_name, work_email").in("id", rows.map((r) => r.target_employee_id).filter((x): x is string => !!x)),
      ctx.db.from("platform_operators").select("user_id, full_name"),
    ]);
    const tenant = new Map(((ts ?? []) as Array<{ id: string; code: string; display_name: string }>).map((t) => [t.id, { id: t.id, code: t.code, name: t.display_name }]));
    const emp = new Map(((es ?? []) as Array<{ id: string; full_name: string; work_email: string | null }>).map((e) => [e.id, e]));
    const op = new Map(((ops ?? []) as Array<{ user_id: string; full_name: string }>).map((o) => [o.user_id, o.full_name]));
    const now = new Date().toISOString();
    return rows.map((r) => {
      const e = r.target_employee_id ? emp.get(r.target_employee_id) : undefined;
      return {
        id: r.id, tenant: tenant.get(r.tenant_id) ?? { id: r.tenant_id, code: "—", name: "—" }, kind: r.kind,
        target: { employeeId: r.target_employee_id, name: e?.full_name ?? r.new_admin_name ?? "—", email: e?.work_email ?? r.new_admin_email },
        verification: r.verification, reason: r.reason, requestedBy: op.get(r.requested_by) ?? "—", requestedAt: r.requested_at, expiresAt: r.expires_at,
        status: (r.status === "pending" && r.expires_at < now ? "expired" : r.status) as RecoveryStatus,
        decidedBy: r.decided_by ? op.get(r.decided_by) ?? "—" : null, decidedAt: r.decided_at, decisionNote: r.decision_note, result: r.result,
        mine: r.requested_by === ctx.userId,
      };
    }).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  }

  async requestRecovery(ctx: ConsoleContext, b: Body): Promise<OwnerRecovery> {
    const tenantId = uuid(b, "tenantId")!;
    const kind = oneOf(b, "kind", KINDS)!;
    const verification = req(b, "verification", { min: 10, max: 1000, hint: "ghi cách đã xác minh người yêu cầu (ít nhất 10 ký tự)" });
    const reason = req(b, "reason", { min: 10, max: 1000, hint: "ít nhất 10 ký tự" });
    const { data: t } = await ctx.db.from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (!t) throw notFound("tenant");
    const targetEmployeeId = uuid(b, "targetEmployeeId", true) ?? null;
    let newAdminName: string | null = null, newAdminEmail: string | null = null;
    if (kind === "mfa_reset") {
      const admin = (await this.admins(ctx, tenantId)).find((a) => a.employeeId === targetEmployeeId);
      if (!admin) throw invalid("Chọn một Tenant Admin của tenant này.");
      if (!admin.mfaEnrolled) throw conflict("Tenant Admin này chưa liên kết ứng dụng xác thực nên không cần đặt lại.");
    } else if (targetEmployeeId) {
      const { data: e } = await ctx.db.from("employees").select("id").eq("id", targetEmployeeId).eq("tenant_id", tenantId).neq("status", "terminated").maybeSingle();
      if (!e) throw notFound("nhân viên trong tenant");
    } else {
      newAdminName = req(b, "newAdminName", { min: 2, max: 120 });
      newAdminEmail = req(b, "newAdminEmail", { pattern: EMAIL, max: 200 }).toLowerCase();
    }
    const { data, error } = await ctx.db.from("owner_recovery_requests").insert({
      tenant_id: tenantId, kind, target_employee_id: targetEmployeeId, new_admin_name: newAdminName, new_admin_email: newAdminEmail, verification, reason, requested_by: ctx.userId,
    }).select("id").single();
    if (error?.code === "23505") throw conflict("Tenant này đã có yêu cầu cùng loại đang chờ duyệt.");
    if (error) throw error;
    const id = (data as { id: string }).id;
    await ctx.audit("owner_recovery.requested", "owner_recovery", id, null, { kind, target_employee_id: targetEmployeeId, new_admin_email: newAdminEmail, verification }, reason, tenantId);
    return (await this.recoveries(ctx, tenantId)).find((r) => r.id === id)!;
  }

  /* Duyệt = thực hiện ngay. Thao tác idempotent (xóa MFA, cấp role), nên thực hiện trước rồi mới chốt trạng thái:
     nếu hai người duyệt cùng lúc, người sau nhận 409 còn kết quả vẫn đúng. */
  async decideRecovery(ctx: ConsoleContext, id: string, action: "approve" | "reject" | "cancel", b: Body): Promise<OwnerRecovery> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("yêu cầu");
    const { data } = await ctx.db.from("owner_recovery_requests").select(RECOVERY_COLS).eq("id", id).maybeSingle();
    const r = data as RecoveryRow | null;
    if (!r) throw notFound("yêu cầu");
    if (r.status !== "pending") throw conflict("Yêu cầu đã được xử lý.");
    const note = nullableText(b, "note", 500) ?? null;
    if (action === "cancel") {
      if (r.requested_by !== ctx.userId) throw forbidden("Chỉ người tạo yêu cầu được hủy.");
    } else {
      if (r.requested_by === ctx.userId) throw forbidden("Cần một nhân viên Kavor khác duyệt hoặc từ chối yêu cầu này.");
      if (ctx.operator.role !== "platform_operator") throw forbidden("Chỉ Platform Operator được duyệt khôi phục quyền.");
      if (action === "reject" && (!note || note.length < 5)) throw invalid("Ghi lý do từ chối (ít nhất 5 ký tự).");
    }
    if (action === "approve" && r.expires_at < new Date().toISOString()) throw conflict("Yêu cầu đã quá 24 giờ. Tạo yêu cầu mới sau khi xác minh lại.");
    const result = action === "approve" ? await this.execute(ctx, r) : null;
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";
    const { error } = await ctx.db.from("owner_recovery_requests").update({ status, decided_by: ctx.userId, decided_at: new Date().toISOString(), decision_note: note, result }).eq("id", id);
    if (error?.message?.includes("RECOVERY_ALREADY_DECIDED")) throw conflict("Yêu cầu vừa được người khác xử lý.");
    if (error) throw error;
    await ctx.audit(`owner_recovery.${status}`, "owner_recovery", id, { status: "pending" }, { status, result }, note, r.tenant_id);
    return (await this.recoveries(ctx, r.tenant_id)).find((x) => x.id === id)!;
  }

  private async execute(ctx: ConsoleContext, r: RecoveryRow): Promise<Record<string, unknown>> {
    if (r.kind === "mfa_reset") {
      const { data: e } = await ctx.db.from("employees").select("user_id").eq("id", r.target_employee_id!).single();
      const userId = (e as { user_id: string | null }).user_id;
      if (!userId) return { removedFactors: 0 };
      const { data: f, error } = await ctx.db.auth.admin.mfa.listFactors({ userId });
      if (error) throw error;
      for (const x of f?.factors ?? []) await ctx.db.auth.admin.mfa.deleteFactor({ id: x.id, userId });
      await ctx.audit("auth.mfa_reset", "employee", r.target_employee_id, { factors: f?.factors?.length ?? 0 }, { factors: 0 }, "Khôi phục qua Kavor Console", r.tenant_id);
      return { removedFactors: f?.factors?.length ?? 0 };
    }
    let name = r.new_admin_name, email = r.new_admin_email;
    if (r.target_employee_id) {
      const { data: e } = await ctx.db.from("employees").select("full_name, work_email").eq("id", r.target_employee_id).single();
      const emp = e as { full_name: string; work_email: string | null };
      if (!emp.work_email) throw invalid("Nhân viên được chọn chưa có email công việc.");
      name = emp.full_name; email = emp.work_email;
    }
    const { data, error } = await ctx.db.rpc("grant_tenant_admin", { p_tenant: r.tenant_id, p_name: name, p_email: email, p_actor: ctx.userId });
    if (error) throw error;
    const employeeId = data as string;
    const { data: e } = await ctx.db.from("employees").select("employee_code, user_id").eq("id", employeeId).single();
    const emp = e as { employee_code: string; user_id: string | null };
    let invited = false;
    if (!emp.user_id) { await this.sendInvite(ctx, r.tenant_id, employeeId); invited = true; }
    await ctx.audit("role.granted", "employee", employeeId, null, { role: "tenant_admin", scope: "tenant" }, "Khôi phục qua Kavor Console", r.tenant_id);
    return { employeeId, employeeCode: emp.employee_code, invited };
  }

  /* ---------- Audit nền tảng ---------- */
  async audit(ctx: ConsoleContext, tenantId?: string): Promise<ConsoleAuditEntry[]> {
    let q = ctx.db.from("audit_logs").select("id, created_at, actor_user_id, tenant_id, action, resource_type, resource_id, reason").eq("actor_type", "platform").order("created_at", { ascending: false }).limit(tenantId ? 30 : 200);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; created_at: string; actor_user_id: string | null; tenant_id: string | null; action: string; resource_type: string; resource_id: string | null; reason: string | null }>;
    const [{ data: ops }, { data: ts }] = await Promise.all([
      ctx.db.from("platform_operators").select("user_id, full_name"),
      ctx.db.from("tenants").select("id, code, display_name").in("id", [...new Set(rows.map((r) => r.tenant_id).filter((x): x is string => !!x))]),
    ]);
    const op = new Map(((ops ?? []) as Array<{ user_id: string; full_name: string }>).map((o) => [o.user_id, o.full_name]));
    const tenant = new Map(((ts ?? []) as Array<{ id: string; code: string; display_name: string }>).map((t) => [t.id, { id: t.id, code: t.code, name: t.display_name }]));
    return rows.map((r) => ({
      id: r.id, createdAt: r.created_at, actor: (r.actor_user_id && op.get(r.actor_user_id)) ?? "—", tenant: r.tenant_id ? tenant.get(r.tenant_id) ?? null : null,
      action: r.action, resourceType: r.resource_type, resourceId: r.resource_id, reason: r.reason,
    }));
  }
}
