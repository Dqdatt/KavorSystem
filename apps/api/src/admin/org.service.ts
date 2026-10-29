/* Cơ cấu tổ chức + vai trò & phân quyền trên web HR (docs/plans/org-roles.md; PERMISSION_MATRIX §4, §11).
   Đơn vị không xóa: ngừng = đặt ngày kết thúc, chặn khi còn người/đơn vị con/vai trò/quy định đang dùng. Gán vai trò theo mẫu hệ thống,
   phạm vi hợp lệ theo từng vai trò, hiệu lực từ hôm nay; thu hồi có hiệu lực ngay (API đọc quyền mỗi request). */
import type {
  AccountStatus, OrgTree, OrgUnit, OrgUnitKind, RoleAssignmentRow, RoleInfo, RolesBoard, ScopeType,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "./../auth/supabase.js";
import { conflict, invalid, notFound, type AdminContext } from "./context.js";
import { date, nullableText, oneOf, req, uuid, type Body } from "./validate.js";
import { localParts } from "../attendance/attendance.service.js";
import { loadPlacements } from "../attendance/policy.js";

type Db = SupabaseGateway["admin"];
const KINDS: readonly OrgUnitKind[] = ["legal_entity", "branch", "department", "position"];
const TABLE: Record<OrgUnitKind, string> = { legal_entity: "legal_entities", branch: "branches", department: "departments", position: "positions" };
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/;
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/* Mô tả vai trò mẫu (PERMISSION_MATRIX §1, prototype page-roles) và phạm vi được phép gán */
const ROLE_META: Record<string, { description: string; defaultScope: string; payrollData: string; sensitive: boolean; scopes: ScopeType[] }> = {
  tenant_admin: { description: "Quản trị công ty, người dùng, vai trò và cấu hình", defaultScope: "Toàn doanh nghiệp", payrollData: "Không mặc định", sensitive: true, scopes: ["tenant"] },
  hr_ops: { description: "Vận hành hồ sơ, công, phép, đơn từ", defaultScope: "Pháp nhân được gán", payrollData: "Không", sensitive: false, scopes: ["tenant", "legal_entity", "branch", "department"] },
  payroll: { description: "Vận hành lương, tạm ứng và dữ liệu tài chính", defaultScope: "Toàn doanh nghiệp", payrollData: "Có", sensitive: true, scopes: ["tenant", "legal_entity"] },
  manager: { description: "Quản lý và phê duyệt trong phạm vi đội ngũ", defaultScope: "Đội ngũ trực tiếp", payrollData: "Không", sensitive: false, scopes: ["direct_reports", "department", "branch", "legal_entity"] },
  auditor: { description: "Đọc dữ liệu và nhật ký được cấp, không chỉnh sửa", defaultScope: "Chỉ đọc", payrollData: "Theo cấp quyền", sensitive: false, scopes: ["tenant", "legal_entity", "branch", "department"] },
};
const ROLE_ORDER = ["tenant_admin", "hr_ops", "payroll", "manager", "auditor"];
const SCOPE_NAME: Record<string, string> = { tenant: "Toàn công ty", direct_reports: "Nhân viên trực tiếp", self: "Bản thân" };

type UnitRow = { id: string; code: string; name: string; effective_from: string; effective_to: string | null; legal_entity_id?: string; branch_id?: string | null; parent_id?: string | null; tax_code?: string | null; job_level?: string | null };

export class OrgAdmin {
  constructor(private readonly sb: SupabaseGateway) {}

  private async today(ctx: AdminContext) {
    const { data } = await ctx.db.from("tenants").select("timezone").eq("id", ctx.tenantId).single();
    return localParts(new Date(), (data?.timezone as string) ?? "Asia/Ho_Chi_Minh").date;
  }

  private async units(db: Db, tenantId: string) {
    const [le, br, de, po] = await Promise.all([
      db.from("legal_entities").select("id, code, name, tax_code, effective_from, effective_to").eq("tenant_id", tenantId).order("code"),
      db.from("branches").select("id, code, name, legal_entity_id, effective_from, effective_to").eq("tenant_id", tenantId).order("code"),
      db.from("departments").select("id, code, name, branch_id, parent_id, effective_from, effective_to").eq("tenant_id", tenantId).order("code"),
      db.from("positions").select("id, code, name, job_level, effective_from, effective_to").eq("tenant_id", tenantId).order("code"),
    ]);
    for (const r of [le, br, de, po]) if (r.error) throw r.error;
    return { le: (le.data ?? []) as UnitRow[], br: (br.data ?? []) as UnitRow[], de: (de.data ?? []) as UnitRow[], po: (po.data ?? []) as UnitRow[] };
  }

  /* ---------- Cơ cấu tổ chức ---------- */
  async tree(ctx: AdminContext): Promise<OrgTree> {
    ctx.require("organization.read");
    const today = await this.today(ctx);
    const [{ le, br, de, po }, { data: emps }] = await Promise.all([
      this.units(ctx.db, ctx.tenantId),
      ctx.db.from("employees").select("id").eq("tenant_id", ctx.tenantId).neq("status", "terminated"),
    ]);
    const ids = ((emps ?? []) as Array<{ id: string }>).map((e) => e.id);
    const place = await loadPlacements(ctx.db, ctx.tenantId, today, ids);
    const n = new Map<string, number>(); const managers = new Set<string>();
    for (const p of place.values()) {
      for (const k of [p.legal_entity_id, p.branch_id, p.department_id, p.position_id]) n.set(k, (n.get(k) ?? 0) + 1);
      if (p.manager_employee_id) managers.add(p.manager_employee_id);
    }
    const live = (u: UnitRow) => u.effective_from <= today && (!u.effective_to || u.effective_to >= today) || u.effective_from > today;
    const unit = (kind: OrgUnitKind, u: UnitRow, parentId: string | null, branchId: string | null): OrgUnit => ({
      id: u.id, kind, code: u.code, name: u.name, parentId, branchId, taxCode: u.tax_code ?? null, jobLevel: u.job_level ?? null,
      effectiveFrom: u.effective_from, effectiveTo: u.effective_to, active: live(u), employees: n.get(u.id) ?? 0,
    });
    const units = [
      ...le.map((u) => unit("legal_entity", u, null, null)),
      ...br.map((u) => unit("branch", u, u.legal_entity_id ?? null, null)),
      ...de.map((u) => unit("department", u, u.parent_id ?? null, u.branch_id ?? null)),
      ...po.map((u) => unit("position", u, null, null)),
    ];
    const count = (k: OrgUnitKind) => units.filter((u) => u.kind === k && u.active).length;
    return {
      units, today, canManage: ctx.tenantWide("organization.manage"),
      metrics: { legalEntities: count("legal_entity"), branches: count("branch"), departments: count("department"), positions: count("position"), managers: managers.size, employees: place.size },
    };
  }

  async createUnit(ctx: AdminContext, b: Body): Promise<OrgTree> {
    ctx.requireTenantWide("organization.manage");
    const today = await this.today(ctx);
    const kind = oneOf(b, "kind", KINDS)!;
    const code = req(b, "code", { max: 20, pattern: CODE, hint: "1–20 ký tự chữ, số, gạch" }).toUpperCase();
    const name = req(b, "name", { min: 2, max: 120 });
    const effectiveFrom = date(b, "effectiveFrom", true) ?? today;
    if (effectiveFrom < today) throw invalid("Ngày hiệu lực không được trước hôm nay.");
    const row: Record<string, unknown> = { tenant_id: ctx.tenantId, code, name, effective_from: effectiveFrom };
    const { le, br, de } = await this.units(ctx.db, ctx.tenantId);
    const activeIn = (rows: UnitRow[], id: string) => rows.find((r) => r.id === id && (!r.effective_to || r.effective_to >= effectiveFrom));
    if (kind === "legal_entity") row.tax_code = nullableText(b, "taxCode", 20) ?? null;
    if (kind === "position") row.job_level = nullableText(b, "jobLevel", 40) ?? null;
    if (kind === "branch") {
      const parent = uuid(b, "parentId")!;
      if (!activeIn(le, parent)) throw invalid("Chọn pháp nhân đang hoạt động.");
      row.legal_entity_id = parent;
    }
    if (kind === "department") {
      const branchId = uuid(b, "branchId")!;
      if (!activeIn(br, branchId)) throw invalid("Chọn chi nhánh đang hoạt động.");
      const parent = uuid(b, "parentId", true) ?? null;
      if (parent) {
        const p = activeIn(de, parent);
        if (!p) throw invalid("Phòng ban cha không còn hoạt động.");
        if (p.branch_id !== branchId) throw invalid("Phòng ban cha phải cùng chi nhánh.");
      }
      Object.assign(row, { branch_id: branchId, parent_id: parent });
    }
    const { data, error } = await ctx.db.from(TABLE[kind]).insert(row).select("id").single();
    if (error?.code === "23505") throw conflict(`Mã ${code} đã có trong công ty.`);
    if (error) throw error;
    await ctx.audit("organization.unit_created", kind, (data as { id: string }).id, null, row);
    return this.tree(ctx);
  }

  async updateUnit(ctx: AdminContext, kindRaw: string, id: string, b: Body): Promise<OrgTree> {
    ctx.requireTenantWide("organization.manage");
    const kind = this.kind(kindRaw);
    const before = await this.unitRow(ctx, kind, id);
    const patch: Record<string, unknown> = {};
    if (b?.code !== undefined) patch.code = req(b, "code", { max: 20, pattern: CODE, hint: "1–20 ký tự chữ, số, gạch" }).toUpperCase();
    if (b?.name !== undefined) patch.name = req(b, "name", { min: 2, max: 120 });
    if (kind === "legal_entity" && b?.taxCode !== undefined) patch.tax_code = nullableText(b, "taxCode", 20) ?? null;
    if (kind === "position" && b?.jobLevel !== undefined) patch.job_level = nullableText(b, "jobLevel", 40) ?? null;
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v));
    if (!Object.keys(changed).length) throw invalid("Không có thay đổi.");
    const { error } = await ctx.db.from(TABLE[kind]).update(changed).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error?.code === "23505") throw conflict(`Mã ${String(changed.code)} đã có trong công ty.`);
    if (error) throw error;
    await ctx.audit("organization.unit_updated", kind, id, Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]])), changed);
    return this.tree(ctx);
  }

  /* Ngừng đơn vị từ ngày effectiveTo (đơn vị còn hiệu lực tới hết ngày đó) */
  async endUnit(ctx: AdminContext, kindRaw: string, id: string, b: Body): Promise<OrgTree> {
    ctx.requireTenantWide("organization.manage");
    const kind = this.kind(kindRaw);
    const u = await this.unitRow(ctx, kind, id);
    const today = await this.today(ctx);
    const end = date(b, "effectiveTo", true) ?? addDays(today, -1);
    if (end < addDays(today, -1)) throw invalid("Ngày kết thúc không được trước hôm qua (không sửa hồi tố).");
    if (u.effective_to) throw conflict("Đơn vị đã ngừng.");
    /* Đơn vị chưa từng có hiệu lực trước ngày kết thúc (tạo nhầm hôm nay/tương lai) thì xóa hẳn sau khi chắc chắn không còn gì tham chiếu */
    const remove = end < u.effective_from;
    if (remove && u.effective_from < today) throw invalid("Ngày kết thúc phải sau ngày hiệu lực.");
    const reason = req(b, "reason", { min: 5, max: 300, hint: "ít nhất 5 ký tự" });
    const col = { legal_entity: "legal_entity_id", branch: "branch_id", department: "department_id", position: "position_id" }[kind];
    const open = `effective_to.is.null,effective_to.gt.${end}`;
    const [ea, ra, pa, children] = await Promise.all([
      ctx.db.from("employee_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq(col, id).or(open),
      kind === "position" ? Promise.resolve({ count: 0 }) : ctx.db.from("role_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("scope_type", kind).eq("scope_id", id).or(open),
      kind === "position" ? Promise.resolve({ count: 0 }) : ctx.db.from("policy_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("scope_type", kind).eq("scope_id", id).or(open),
      kind === "legal_entity" ? ctx.db.from("branches").select("id", { count: "exact", head: true }).eq("legal_entity_id", id).or(open)
        : kind === "branch" ? ctx.db.from("departments").select("id", { count: "exact", head: true }).eq("branch_id", id).or(open)
        : kind === "department" ? ctx.db.from("departments").select("id", { count: "exact", head: true }).eq("parent_id", id).or(open)
        : Promise.resolve({ count: 0 }),
    ]);
    const blockers = [
      ea.count ? `${ea.count} phân công nhân viên` : "", children.count ? `${children.count} đơn vị con` : "",
      ra.count ? `${ra.count} vai trò gán theo đơn vị này` : "", pa.count ? `${pa.count} quy định/ca áp dụng riêng` : "",
    ].filter(Boolean);
    if (blockers.length) throw conflict(`Chưa ngừng được: còn ${blockers.join(", ")} sau ngày ${end.split("-").reverse().join("/")}. Chuyển hoặc kết thúc chúng trước.`);
    const { error } = remove
      ? await ctx.db.from(TABLE[kind]).delete().eq("id", id).eq("tenant_id", ctx.tenantId)
      : await ctx.db.from(TABLE[kind]).update({ effective_to: end }).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error?.code === "23503") throw conflict("Đơn vị đang được tham chiếu ở nơi khác nên chưa xóa được; đặt ngày kết thúc từ ngày mai.");
    if (error) throw error;
    await ctx.audit("organization.unit_ended", kind, id, { effective_to: null, code: u.code, name: u.name }, remove ? { deleted: true } : { effective_to: end }, reason);
    return this.tree(ctx);
  }

  private kind(k: string): OrgUnitKind {
    if (!(KINDS as readonly string[]).includes(k)) throw notFound("loại đơn vị");
    return k as OrgUnitKind;
  }
  private async unitRow(ctx: AdminContext, kind: OrgUnitKind, id: string): Promise<UnitRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("đơn vị");
    const { data } = await ctx.db.from(TABLE[kind]).select("*").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) throw notFound("đơn vị");
    return data as UnitRow;
  }

  /* ---------- Vai trò & phân quyền ---------- */
  async roles(ctx: AdminContext): Promise<RolesBoard> {
    ctx.require("role.read");
    const db = ctx.db, today = await this.today(ctx);
    const [{ data: roles, error }, { data: ras }, { le, br, de }] = await Promise.all([
      db.from("roles").select("id, code, name, is_system, role_permissions(permissions(code, description))").is("tenant_id", null).in("code", ROLE_ORDER),
      db.from("role_assignments").select("id, role_id, membership_id, scope_type, scope_id, effective_from, effective_to, created_at").eq("tenant_id", ctx.tenantId),
      this.units(db, ctx.tenantId),
    ]);
    if (error) throw error;
    const rows = (ras ?? []) as Array<{ id: string; role_id: string; membership_id: string; scope_type: ScopeType; scope_id: string | null; effective_from: string; effective_to: string | null; created_at: string }>;
    const { data: ms } = rows.length ? await db.from("memberships").select("id, employee_id, user_id, status").in("id", [...new Set(rows.map((r) => r.membership_id))]) : { data: [] };
    const member = new Map(((ms ?? []) as Array<{ id: string; employee_id: string | null; user_id: string | null; status: string }>).map((m) => [m.id, m]));
    const empIds = [...new Set([...member.values()].map((m) => m.employee_id).filter((x): x is string => !!x))];
    const { data: es } = empIds.length ? await db.from("employees").select("id, employee_code, full_name, invited_at").in("id", empIds) : { data: [] };
    const emp = new Map(((es ?? []) as Array<{ id: string; employee_code: string; full_name: string; invited_at: string | null }>).map((e) => [e.id, e]));
    const unitName = new Map([...le, ...br, ...de].map((u) => [u.id, u.name]));
    const list: RoleInfo[] = ((roles ?? []) as unknown as Array<{ id: string; code: string; name: string; is_system: boolean; role_permissions: Array<{ permissions: { code: string; description: string } | null }> }>)
      .sort((a, b) => ROLE_ORDER.indexOf(a.code) - ROLE_ORDER.indexOf(b.code))
      .map((r) => {
        const meta = ROLE_META[r.code]!;
        const assignments: RoleAssignmentRow[] = rows.filter((a) => a.role_id === r.id).flatMap((a) => {
          const m = member.get(a.membership_id), e = m?.employee_id ? emp.get(m.employee_id) : undefined;
          if (!m || !e) return [];
          const account: AccountStatus = m.status === "suspended" ? "locked" : m.user_id && m.status === "active" ? "active" : e.invited_at ? "invited" : "not_invited";
          const state: RoleAssignmentRow["state"] = a.effective_to && a.effective_to < today ? "ended" : a.effective_from > today ? "future" : "active";
          return [{ id: a.id, employee: { id: e.id, code: e.employee_code, fullName: e.full_name }, account, scopeType: a.scope_type, scopeId: a.scope_id,
            scopeName: SCOPE_NAME[a.scope_type] ?? unitName.get(a.scope_id ?? "") ?? a.scope_type, effectiveFrom: a.effective_from, effectiveTo: a.effective_to, state }];
        }).sort((x, y) => Number(x.state === "ended") - Number(y.state === "ended") || x.employee.code.localeCompare(y.employee.code));
        const mine = rows.filter((a) => a.role_id === r.id);
        return {
          code: r.code, name: r.name, system: r.is_system, description: meta.description, defaultScope: meta.defaultScope, sensitive: meta.sensitive,
          payrollData: meta.payrollData, allowedScopes: meta.scopes,
          permissions: r.role_permissions.flatMap((p) => (p.permissions ? [p.permissions] : [])).sort((a, b) => a.code.localeCompare(b.code)),
          members: new Set(assignments.filter((a) => a.state === "active").map((a) => a.employee.id)).size,
          updatedAt: mine.length ? mine.map((a) => a.created_at).sort().at(-1)! : null, assignments,
        };
      });
    return { roles: list, canAssign: ctx.tenantWide("role.assign"), today };
  }

  async assign(ctx: AdminContext, b: Body): Promise<RolesBoard> {
    ctx.requireTenantWide("role.assign");
    const today = await this.today(ctx);
    const employeeId = uuid(b, "employeeId")!;
    const roleCode = oneOf(b, "roleCode", ROLE_ORDER)!;
    const meta = ROLE_META[roleCode]!;
    const scopeType = oneOf(b, "scopeType", meta.scopes) as ScopeType | undefined;
    if (!scopeType) throw invalid("Phạm vi không hợp lệ cho vai trò này.");
    const effectiveFrom = date(b, "effectiveFrom", true) ?? today;
    const effectiveTo = date(b, "effectiveTo", true) ?? null;
    if (effectiveFrom < today) throw invalid("Ngày hiệu lực không được trước hôm nay.");
    if (effectiveTo && effectiveTo < effectiveFrom) throw invalid("Ngày kết thúc phải sau ngày hiệu lực.");
    let scopeId: string | null = null;
    if (scopeType === "legal_entity" || scopeType === "branch" || scopeType === "department") {
      scopeId = uuid(b, "scopeId")!;
      const { data: u } = await ctx.db.from(TABLE[scopeType]).select("id, effective_to").eq("id", scopeId).eq("tenant_id", ctx.tenantId).maybeSingle();
      if (!u || ((u as { effective_to: string | null }).effective_to ?? "9999") < effectiveFrom) throw invalid("Đơn vị phạm vi không tồn tại hoặc đã ngừng.");
    }
    const { data: e } = await ctx.db.from("employees").select("id, status, user_id, full_name, employee_code").eq("id", employeeId).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!e) throw notFound("nhân viên");
    if ((e as { status: string }).status === "terminated") throw conflict("Nhân viên đã nghỉ việc.");
    /* Membership gắn hồ sơ; chưa kích hoạt thì tạo membership "invited" — quyền có tác dụng khi người đó kích hoạt */
    let { data: m } = await ctx.db.from("memberships").select("id").eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).maybeSingle();
    if (!m) {
      const emp = e as { user_id: string | null };
      const ins = await ctx.db.from("memberships").insert({ tenant_id: ctx.tenantId, employee_id: employeeId, user_id: emp.user_id, status: emp.user_id ? "active" : "invited" }).select("id").single();
      if (ins.error) throw ins.error;
      m = ins.data;
    }
    const { data: role } = await ctx.db.from("roles").select("id").eq("code", roleCode).is("tenant_id", null).single();
    const { data, error } = await ctx.db.from("role_assignments").insert({
      tenant_id: ctx.tenantId, membership_id: (m as { id: string }).id, role_id: (role as { id: string }).id, scope_type: scopeType, scope_id: scopeId, effective_from: effectiveFrom, effective_to: effectiveTo,
    }).select("id").single();
    if (error?.code === "23505") throw conflict("Người này đã có vai trò này ở cùng phạm vi.");
    if (error) throw error;
    await ctx.audit("role.granted", "employee", employeeId, null, { role: roleCode, scope_type: scopeType, scope_id: scopeId, effective_from: effectiveFrom, effective_to: effectiveTo, assignment_id: (data as { id: string }).id });
    return this.roles(ctx);
  }

  /* Thu hồi: hết hiệu lực từ hôm nay. Bản gán chưa từng có hiệu lực trước hôm nay thì xóa (vẫn còn audit) */
  async revoke(ctx: AdminContext, id: string, b: Body): Promise<RolesBoard> {
    ctx.requireTenantWide("role.assign");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("vai trò được gán");
    const today = await this.today(ctx);
    const { data: a } = await ctx.db.from("role_assignments").select("id, membership_id, effective_from, effective_to, scope_type, scope_id, roles!inner(code, tenant_id), memberships!inner(employee_id)")
      .eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    const row = a as unknown as { id: string; effective_from: string; effective_to: string | null; scope_type: string; scope_id: string | null; roles: { code: string; tenant_id: string | null }; memberships: { employee_id: string | null } } | null;
    if (!row || row.roles.tenant_id !== null || !ROLE_ORDER.includes(row.roles.code)) throw notFound("vai trò được gán");
    if (row.effective_to && row.effective_to < today) throw conflict("Vai trò này đã hết hiệu lực.");
    const reason = nullableText(b, "reason", 300) ?? null;
    const yesterday = addDays(today, -1);
    const q = row.effective_from <= yesterday
      ? ctx.db.from("role_assignments").update({ effective_to: yesterday }).eq("id", id)
      : ctx.db.from("role_assignments").delete().eq("id", id);
    const { error } = await q;
    if (error?.message?.includes("LAST_TENANT_ADMIN")) throw new AuthError("LAST_TENANT_ADMIN", "Đây là quản trị viên cuối cùng của công ty nên không thể thu hồi. Hãy gán thêm một quản trị viên công ty trước.", 409);
    if (error) throw error;
    await ctx.audit("role.revoked", "employee", row.memberships.employee_id, { role: row.roles.code, scope_type: row.scope_type, scope_id: row.scope_id, effective_to: row.effective_to },
      { effective_to: row.effective_from <= yesterday ? yesterday : "deleted" }, reason);
    return this.roles(ctx);
  }
}
