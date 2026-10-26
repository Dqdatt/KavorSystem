/* Support access có thời hạn (docs/plans/console-ops.md phần B; PRODUCT_SPEC §6.11, US-072).
   Nhân viên Kavor yêu cầu → Tenant Admin duyệt trên web HR → nhân viên Kavor xem chỉ đọc theo phạm vi cho tới khi hết hạn/thu hồi.
   Thời hạn do DB tính lúc duyệt; mỗi lần xem kiểm tra lại phiên (support_session_active) và ghi audit tenant thấy. */
import {
  SUPPORT_MINUTES, SUPPORT_SCOPES,
  type AccountStatus, type EmployeeStatus, type SupportAuditRow, type SupportBanner, type SupportDirectoryRow, type SupportScope, type SupportSession,
  type SupportSettingsView, type SupportStatus, type SupportView,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import { nullableText, number, req, uuid, type Body } from "../admin/validate.js";
import type { ConsoleContext } from "../console/context.js";
import { localParts } from "../attendance/attendance.service.js";
import { loadPlacements } from "../attendance/policy.js";
import { holidaysOf } from "../company/company.service.js";
import { planOf } from "../tenancy/plan.js";

type Db = SupabaseGateway["admin"];
type Row = {
  id: string; tenant_id: string; operator_user_id: string; ticket: string; reason: string; scopes: SupportScope[]; duration_minutes: number;
  status: "pending" | "approved" | "rejected" | "cancelled" | "revoked" | "ended"; requested_at: string; request_expires_at: string;
  decided_by: string | null; decided_at: string | null; decision_note: string | null; starts_at: string | null; expires_at: string | null; ended_at: string | null;
};
const COLS = "id, tenant_id, operator_user_id, ticket, reason, scopes, duration_minutes, status, requested_at, request_expires_at, decided_by, decided_at, decision_note, starts_at, expires_at, ended_at";
const SCOPES = Object.keys(SUPPORT_SCOPES) as SupportScope[];
const AUDIT_DAYS = 30;

export function statusOf(r: Pick<Row, "status" | "request_expires_at" | "expires_at">, now = Date.now()): SupportStatus {
  if (r.status === "pending") return Date.parse(r.request_expires_at) <= now ? "expired" : "pending";
  if (r.status === "approved") return r.expires_at && Date.parse(r.expires_at) <= now ? "expired" : "active";
  return r.status;
}

/* Lỗi trigger SQL → thông báo cho người dùng */
function dbError(e: { message?: string } | null) {
  const m = e?.message ?? "";
  if (m.includes("SUPPORT_REQUEST_EXPIRED")) return conflict("Yêu cầu đã quá 24 giờ, không duyệt được nữa.");
  if (m.includes("SUPPORT_INVALID_TRANSITION")) return conflict("Yêu cầu đã được xử lý.");
  return e;
}

export class SupportService {
  constructor(private readonly sb: SupabaseGateway) {}
  private get db(): Db { return this.sb.admin; }

  private async sessions(rows: Row[], viewerUserId: string | null): Promise<SupportSession[]> {
    if (!rows.length) return [];
    const tenantIds = [...new Set(rows.map((r) => r.tenant_id))], ops = [...new Set(rows.map((r) => r.operator_user_id))];
    const users = [...new Set(rows.map((r) => r.decided_by).filter((x): x is string => !!x))];
    const [{ data: ts }, { data: os }, { data: ps }] = await Promise.all([
      this.db.from("tenants").select("id, code, display_name").in("id", tenantIds),
      this.db.from("platform_operators").select("user_id, full_name").in("user_id", ops),
      users.length ? this.db.from("user_profiles").select("id, display_name").in("id", users) : Promise.resolve({ data: [] }),
    ]);
    const tenant = new Map(((ts ?? []) as Array<{ id: string; code: string; display_name: string }>).map((t) => [t.id, { id: t.id, code: t.code, name: t.display_name }]));
    const op = new Map(((os ?? []) as Array<{ user_id: string; full_name: string }>).map((o) => [o.user_id, o.full_name]));
    const person = new Map(((ps ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name ?? "Người dùng"]));
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id, tenant: tenant.get(r.tenant_id) ?? { id: r.tenant_id, code: "—", name: "—" }, operator: `${op.get(r.operator_user_id) ?? "Nhân viên Kavor"} (Kavor)`,
      ticket: r.ticket, reason: r.reason, scopes: r.scopes, minutes: r.duration_minutes, status: statusOf(r, now),
      requestedAt: r.requested_at, requestExpiresAt: r.request_expires_at, decidedBy: r.decided_by ? person.get(r.decided_by) ?? "Người dùng" : null,
      decidedAt: r.decided_at, decisionNote: r.decision_note, startsAt: r.starts_at, expiresAt: r.expires_at, endedAt: r.ended_at,
      mine: r.operator_user_id === viewerUserId,
    }));
  }

  private async row(id: string, tenantId?: string): Promise<Row> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("yêu cầu hỗ trợ");
    let q = this.db.from("support_access_sessions").select(COLS).eq("id", id);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data } = await q.maybeSingle();
    if (!data) throw notFound("yêu cầu hỗ trợ");
    return data as Row;
  }

  /* ---------- Kavor Console ---------- */
  async consoleList(ctx: ConsoleContext): Promise<SupportSession[]> {
    const { data, error } = await this.db.from("support_access_sessions").select(COLS).order("requested_at", { ascending: false }).limit(200);
    if (error) throw error;
    return this.sessions((data ?? []) as Row[], ctx.userId);
  }

  async request(ctx: ConsoleContext, b: Body): Promise<SupportSession> {
    const tenantId = uuid(b, "tenantId")!;
    const ticket = req(b, "ticket", { min: 2, max: 50, hint: "mã ticket" });
    const reason = req(b, "reason", { min: 10, max: 1000, hint: "ghi rõ việc cần hỗ trợ (ít nhất 10 ký tự)" });
    const raw = Array.isArray(b?.scopes) ? (b.scopes as unknown[]) : [];
    const scopes = [...new Set(raw)].filter((x): x is SupportScope => SCOPES.includes(x as SupportScope));
    if (!scopes.length || scopes.length !== raw.length) throw invalid("Chọn ít nhất một phạm vi hợp lệ.");
    const minutes = number(b, "minutes", 30, 60, { integer: true })!;
    if (!(SUPPORT_MINUTES as readonly number[]).includes(minutes)) throw invalid("Thời hạn 30 hoặc 60 phút.");
    const { data: t } = await this.db.from("tenants").select("status").eq("id", tenantId).maybeSingle();
    if (!t) throw notFound("tenant");
    if ((t as { status: string }).status !== "active") throw conflict("Tenant đang tạm khóa hoặc đã đóng.");
    const { data: open } = await this.db.from("support_access_sessions").select("id, status, expires_at").eq("tenant_id", tenantId).eq("operator_user_id", ctx.userId).eq("status", "approved").gt("expires_at", new Date().toISOString()).limit(1);
    if (open?.length) throw conflict("Bạn đang có phiên hỗ trợ còn hiệu lực với tenant này.");
    const { data, error } = await this.db.from("support_access_sessions").insert({ tenant_id: tenantId, operator_user_id: ctx.userId, ticket, reason, scopes, duration_minutes: minutes }).select(COLS).single();
    if (error?.code === "23505") throw conflict("Bạn đã có một yêu cầu đang chờ tenant này duyệt.");
    if (error) throw error;
    const r = data as Row;
    await ctx.audit("support.requested", "support_access", r.id, null, { ticket, scopes, minutes }, reason, tenantId);
    return (await this.sessions([r], ctx.userId))[0]!;
  }

  /* Người yêu cầu hủy yêu cầu đang chờ, hoặc kết thúc sớm phiên đang hiệu lực */
  async close(ctx: ConsoleContext, id: string): Promise<SupportSession> {
    const r = await this.row(id);
    if (r.operator_user_id !== ctx.userId) throw forbidden("Chỉ người yêu cầu được hủy hoặc kết thúc phiên.");
    const st = statusOf(r);
    if (st !== "pending" && st !== "active") throw conflict("Yêu cầu đã kết thúc.");
    const next = st === "pending" ? "cancelled" : "ended";
    const { data, error } = await this.db.from("support_access_sessions").update({ status: next, ended_by: ctx.userId }).eq("id", id).eq("status", r.status).select(COLS).single();
    if (error) throw dbError(error);
    await ctx.audit(`support.${next}`, "support_access", id, { status: r.status }, { status: next }, null, r.tenant_id);
    return (await this.sessions([data as Row], ctx.userId))[0]!;
  }

  /* Xem dữ liệu theo phạm vi: phiên của chính mình, đang hiệu lực, phạm vi được duyệt. Mỗi lần xem ghi audit tenant thấy */
  async view(ctx: ConsoleContext, id: string, scope: string): Promise<SupportView> {
    const r = await this.row(id);
    if (r.operator_user_id !== ctx.userId) throw forbidden("Phiên hỗ trợ này không phải của bạn.");
    const { data: ok } = await this.db.rpc("support_session_active", { p_session: id });
    if (ok !== true) throw new AuthError("SUPPORT_SESSION_INACTIVE", "Phiên hỗ trợ đã hết hạn, bị thu hồi hoặc chưa được duyệt.", 403);
    if (!r.scopes.includes(scope as SupportScope)) throw forbidden("Phạm vi này không có trong phiên được duyệt.");
    const session = (await this.sessions([r], ctx.userId))[0]!;
    await ctx.audit("support.viewed", "support_access", id, null, { scope }, null, r.tenant_id);
    if (scope === "settings") return { scope, session, data: await this.settings(r.tenant_id) };
    if (scope === "directory") return { scope, session, data: await this.directory(r.tenant_id) };
    return { scope: "audit", session, data: await this.auditRows(r.tenant_id) };
  }

  private async today(tenantId: string) {
    const { data } = await this.db.from("tenants").select("timezone").eq("id", tenantId).single();
    return localParts(new Date(), (data?.timezone as string) ?? "Asia/Ho_Chi_Minh").date;
  }

  private async settings(tenantId: string): Promise<SupportSettingsView> {
    const db = this.db, today = await this.today(tenantId);
    const [{ data: t }, plan, { data: pd }, { data: pv }, holidays, { data: wd }, { data: wv }, { data: sd }, { data: sv }, { data: locs }, { data: roles }, { data: ras }] = await Promise.all([
      db.from("tenants").select("code, display_name, timezone").eq("id", tenantId).single(),
      planOf(db, tenantId),
      db.from("policy_definitions").select("id, kind, name").eq("tenant_id", tenantId).eq("active", true),
      db.from("policy_versions").select("policy_id, version_no, config, effective_from").eq("tenant_id", tenantId).lte("effective_from", today),
      holidaysOf(db, tenantId, Number(today.slice(0, 4))),
      db.from("workflow_definitions").select("id, request_type, name").eq("tenant_id", tenantId),
      db.from("workflow_versions").select("workflow_id, version_no, steps, effective_from").eq("tenant_id", tenantId).lte("effective_from", today),
      db.from("shift_definitions").select("id, code, name").eq("tenant_id", tenantId).eq("active", true),
      db.from("shift_versions").select("shift_id, version_no, start_time, end_time, work_days").eq("tenant_id", tenantId).lte("effective_from", today),
      db.from("work_locations").select("code, name, radius_m, active").eq("tenant_id", tenantId).order("code"),
      db.from("roles").select("id, code, name, is_system, role_permissions(permissions(code))").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order("code"),
      db.from("role_assignments").select("role_id, effective_from, effective_to").eq("tenant_id", tenantId).lte("effective_from", today),
    ]);
    /* Bản hiệu lực hôm nay = số phiên bản lớn nhất đã có hiệu lực */
    const latest = <T extends { version_no: number }>(rows: T[] | null, key: keyof T) => {
      const m = new Map<string, T>();
      for (const r of rows ?? []) { const k = String(r[key]); const cur = m.get(k); if (!cur || r.version_no > cur.version_no) m.set(k, r); }
      return m;
    };
    const pvs = latest(pv as Array<{ policy_id: string; version_no: number; config: unknown; effective_from: string }>, "policy_id");
    const wvs = latest(wv as Array<{ workflow_id: string; version_no: number; steps: unknown; effective_from: string }>, "workflow_id");
    const svs = latest(sv as Array<{ shift_id: string; version_no: number; start_time: string; end_time: string; work_days: number[] | null }>, "shift_id");
    const members = new Map<string, number>();
    for (const a of (ras ?? []) as Array<{ role_id: string; effective_to: string | null }>) if (!a.effective_to || a.effective_to >= today) members.set(a.role_id, (members.get(a.role_id) ?? 0) + 1);
    return {
      tenant: { code: t?.code as string, name: t?.display_name as string, timezone: t?.timezone as string, plan: plan.name, employeeLimit: plan.employeeLimit, employees: plan.employees },
      rules: ((pd ?? []) as Array<{ id: string; kind: string; name: string }>).flatMap((p) => { const v = pvs.get(p.id); return v ? [{ kind: p.kind, name: p.name, versionNo: v.version_no, effectiveFrom: v.effective_from, config: v.config }] : []; }),
      holidays: holidays.map((h) => ({ date: h.date, name: h.name, scope: h.scope })),
      workflows: ((wd ?? []) as Array<{ id: string; request_type: string; name: string }>).flatMap((w) => { const v = wvs.get(w.id); return v ? [{ requestType: w.request_type, name: w.name, versionNo: v.version_no, effectiveFrom: v.effective_from, steps: v.steps }] : []; }),
      shifts: ((sd ?? []) as Array<{ id: string; code: string; name: string }>).flatMap((s) => { const v = svs.get(s.id); return v ? [{ code: s.code, name: s.name, start: v.start_time.slice(0, 5), end: v.end_time.slice(0, 5), workDays: v.work_days }] : []; }),
      locations: ((locs ?? []) as Array<{ code: string; name: string; radius_m: number; active: boolean }>).map((l) => ({ code: l.code, name: l.name, radiusM: l.radius_m, active: l.active })),
      roles: ((roles ?? []) as unknown as Array<{ id: string; code: string; name: string; is_system: boolean; role_permissions: Array<{ permissions: { code: string } | null }> }>)
        .map((r) => ({ code: r.code, name: r.name, system: r.is_system, permissions: r.role_permissions.map((x) => x.permissions?.code ?? "").filter(Boolean).sort(), members: members.get(r.id) ?? 0 })),
    };
  }

  private async directory(tenantId: string): Promise<SupportDirectoryRow[]> {
    const db = this.db, today = await this.today(tenantId);
    const [{ data: es, error }, { data: ms }, { data: deps }, { data: pos }] = await Promise.all([
      db.from("employees").select("id, employee_code, full_name, status, user_id, invited_at").eq("tenant_id", tenantId).order("employee_code"),
      db.from("memberships").select("user_id, status").eq("tenant_id", tenantId),
      db.from("departments").select("id, name").eq("tenant_id", tenantId),
      db.from("positions").select("id, name").eq("tenant_id", tenantId),
    ]);
    if (error) throw error;
    const rows = (es ?? []) as Array<{ id: string; employee_code: string; full_name: string; status: EmployeeStatus; user_id: string | null; invited_at: string | null }>;
    const place = await loadPlacements(db, tenantId, today, rows.map((e) => e.id));
    const member = new Map(((ms ?? []) as Array<{ user_id: string | null; status: string }>).filter((m) => m.user_id).map((m) => [m.user_id!, m.status]));
    const dep = new Map(((deps ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name])), po = new Map(((pos ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
    return rows.map((e) => {
      const p = place.get(e.id);
      const account: AccountStatus = !e.user_id ? (e.invited_at ? "invited" : "not_invited") : member.get(e.user_id) === "suspended" ? "locked" : "active";
      return { code: e.employee_code, fullName: e.full_name, department: p ? dep.get(p.department_id) ?? null : null, position: p ? po.get(p.position_id) ?? null : null, status: e.status, account };
    });
  }

  private async auditRows(tenantId: string): Promise<SupportAuditRow[]> {
    const since = new Date(Date.now() - AUDIT_DAYS * 86400_000).toISOString();
    const { data, error } = await this.db.from("audit_logs").select("created_at, actor_user_id, actor_type, action, resource_type").eq("tenant_id", tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ created_at: string; actor_user_id: string | null; actor_type: string; action: string; resource_type: string }>;
    const ids = [...new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => !!x))];
    const [{ data: ps }, { data: os }] = ids.length ? await Promise.all([
      this.db.from("user_profiles").select("id, display_name").in("id", ids),
      this.db.from("platform_operators").select("user_id, full_name").in("user_id", ids),
    ]) : [{ data: [] }, { data: [] }];
    const name = new Map<string, string>([
      ...((ps ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name ?? "Người dùng"] as [string, string]),
      ...((os ?? []) as Array<{ user_id: string; full_name: string }>).map((o) => [o.user_id, `${o.full_name} (Kavor)`] as [string, string]),
    ]);
    return rows.map((r) => ({ at: r.created_at, actor: r.actor_user_id ? name.get(r.actor_user_id) ?? "Người dùng" : "Hệ thống", action: r.action, resourceType: r.resource_type }));
  }

  /* ---------- Web HR (tenant) ---------- */
  async banner(ctx: AdminContext): Promise<SupportBanner> {
    const canApprove = ctx.tenantWide("support_access.approve");
    const { data, error } = await this.db.from("support_access_sessions").select(COLS).eq("tenant_id", ctx.tenantId).in("status", ["pending", "approved"]);
    if (error) throw error;
    const now = Date.now(), rows = (data ?? []) as Row[];
    const active = await this.sessions(rows.filter((r) => statusOf(r, now) === "active"), null);
    return {
      canApprove, pending: canApprove ? rows.filter((r) => statusOf(r, now) === "pending").length : 0,
      active: active.map((s) => ({ id: s.id, operator: s.operator, expiresAt: s.expiresAt!, scopes: s.scopes })),
    };
  }

  async tenantList(ctx: AdminContext): Promise<SupportSession[]> {
    if (!ctx.can("support_access.approve") && !ctx.can("audit.read")) throw forbidden();
    const { data, error } = await this.db.from("support_access_sessions").select(COLS).eq("tenant_id", ctx.tenantId).order("requested_at", { ascending: false }).limit(100);
    if (error) throw error;
    return this.sessions((data ?? []) as Row[], null);
  }

  /* Tenant Admin duyệt / từ chối yêu cầu chờ; thu hồi phiên đang hiệu lực */
  async decide(ctx: AdminContext, id: string, action: "approve" | "reject" | "revoke", b: Body): Promise<SupportSession> {
    ctx.requireTenantWide("support_access.approve");
    const r = await this.row(id, ctx.tenantId);
    const note = nullableText(b, "note", 500) ?? null;
    const st = statusOf(r);
    if (action === "revoke" ? st !== "active" : st !== "pending") throw conflict(st === "expired" ? "Yêu cầu đã hết hạn." : "Yêu cầu đã được xử lý.");
    if (action === "reject" && (!note || note.trim().length < 5)) throw invalid("Ghi lý do từ chối (ít nhất 5 ký tự).");
    const next = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
    const patch = action === "revoke" ? { status: next, ended_by: ctx.userId } : { status: next, decided_by: ctx.userId, decision_note: note };
    const { data, error } = await this.db.from("support_access_sessions").update(patch).eq("id", id).eq("status", r.status).select(COLS).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw conflict("Yêu cầu đã được xử lý.");
    await ctx.audit(`support.${next}`, "support_access", id, { status: r.status }, { status: next, scopes: r.scopes, minutes: r.duration_minutes }, note);
    return (await this.sessions([data as Row], null))[0]!;
  }
}
