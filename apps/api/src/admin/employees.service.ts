/* Nhân viên và tài khoản đăng nhập (web HR/Admin). Mọi truy vấn đi qua phạm vi của người gọi; mọi thao tác ghi có audit. */
import type {
  AccountStatus, AdminDevice, AdminOverview, AttendanceBoard, OverviewDay, AdminMe, AuditEntry, EmployeeDetail, EmployeeListItem, EmployeeStatus, EmployeeUpsert, EmploymentType, OrgOptions, Ref, ScopeType,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { localParts, tenantSettings } from "../attendance/attendance.service.js";
import { PolicyIndex, loadPlacements, type Placement } from "../attendance/policy.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "./context.js";
import type { Mailer } from "./mailer.js";
import type { AttendanceAdmin } from "./attendance-admin.service.js";
import { addDays, EMAIL, date, nullableText, oneOf, req, text, uuid, type Body } from "./validate.js";
import { loadPersonal } from "../profile/profile.service.js";

export type EmployeeRowFull = {
  id: string; tenant_id: string; employee_code: string; full_name: string; work_email: string | null; phone: string | null;
  hire_date: string; termination_date: string | null; employment_type: EmploymentType; status: EmployeeStatus; user_id: string | null;
  invited_at: string | null; invite_count: number; created_at: string;
};
export const EMP_COLS = "id, tenant_id, employee_code, full_name, work_email, phone, hire_date, termination_date, employment_type, status, user_id, invited_at, invite_count, created_at";
export const EMPLOYMENT_TYPES = ["probation", "official", "contractor", "intern"] as const;
export const EMPLOYEE_STATUSES = ["preboarding", "active", "suspended", "on_leave", "leaving", "terminated"] as const;

type Org = { names: Map<string, string>; deptBranch: Map<string, string | null>; branchEntity: Map<string, string> };

/* Bỏ dấu tiếng Việt để tìm "thu ha" ra "Thu Hà" */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export class EmployeesAdmin {
  constructor(private readonly sb: SupabaseGateway, private readonly mailer: Mailer, private readonly attendance: AttendanceAdmin) {}

  /* ---------- Người đang đăng nhập ---------- */
  async me(ctx: AdminContext): Promise<AdminMe> {
    const [{ data: t }, { data: count }, org] = await Promise.all([
      ctx.db.from("tenants").select("id, code, display_name, timezone").eq("id", ctx.tenantId).single(),
      ctx.db.rpc("active_tenant_admin_count", { p_tenant: ctx.tenantId }),
      this.org(ctx),
    ]);
    const seen = new Set<string>();
    const roles = ctx.grants.filter((g) => { const k = `${g.role_code}:${g.scope_type}:${g.scope_id}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((g) => ({ code: g.role_code, name: g.role_name, scopeType: g.scope_type as ScopeType, scopeName: g.scope_type === "tenant" ? "Toàn công ty" : org.names.get(g.scope_id ?? "") ?? scopeLabel(g.scope_type) }));
    return {
      userId: ctx.userId, employeeId: ctx.actor?.id ?? null, fullName: ctx.actor?.full_name ?? ctx.email, email: ctx.email,
      tenant: { id: ctx.tenantId, code: (t?.code as string) ?? "", name: (t?.display_name as string) ?? "", timezone: (t?.timezone as string) ?? "Asia/Ho_Chi_Minh" },
      roles, permissions: ctx.permissions(), tenantAdminCount: (count as number) ?? 0,
    };
  }

  async orgOptions(ctx: AdminContext): Promise<OrgOptions> {
    ctx.require("employee.read");
    const db = ctx.db;
    const [le, br, de, po, em] = await Promise.all([
      db.from("legal_entities").select("id, name").eq("tenant_id", ctx.tenantId).order("name"),
      db.from("branches").select("id, name").eq("tenant_id", ctx.tenantId).order("name"),
      db.from("departments").select("id, name, branch_id").eq("tenant_id", ctx.tenantId).order("name"),
      db.from("positions").select("id, name").eq("tenant_id", ctx.tenantId).order("name"),
      ctx.scopedEmployees("employee.read", "id, full_name, employee_code, status").order("full_name"),
    ]);
    return {
      legalEntities: (le.data ?? []) as Ref[], branches: (br.data ?? []) as Ref[], positions: (po.data ?? []) as Ref[],
      departments: ((de.data ?? []) as Array<{ id: string; name: string; branch_id: string | null }>).map((d) => ({ id: d.id, name: d.name, branchId: d.branch_id })),
      employees: ((em.data ?? []) as unknown as Array<{ id: string; full_name: string; employee_code: string; status: string }>).filter((e) => e.status !== "terminated").map((e) => ({ id: e.id, name: e.full_name, code: e.employee_code })),
    };
  }

  /* ---------- Danh sách / chi tiết ---------- */
  async list(ctx: AdminContext, q: { q?: string; status?: string; departmentId?: string; account?: string }): Promise<EmployeeListItem[]> {
    ctx.require("employee.read");
    const { data, error } = await ctx.scopedEmployees("employee.read", EMP_COLS).order("employee_code");
    if (error) throw error;
    let items = await this.enrich(ctx, (data ?? []) as unknown as EmployeeRowFull[]);
    if (q.q?.trim()) { const k = fold(q.q.trim()); items = items.filter((e) => fold(`${e.fullName} ${e.code} ${e.email ?? ""} ${e.phone ?? ""}`).includes(k)); }
    if (q.status === "working") items = items.filter((e) => e.status !== "terminated");
    else if (q.status && q.status !== "all") items = items.filter((e) => e.status === q.status);
    if (q.departmentId) items = items.filter((e) => e.department?.id === q.departmentId);
    if (q.account && q.account !== "all") items = items.filter((e) => (q.account === "pending" ? e.account === "invited" || e.account === "not_invited" : e.account === q.account));
    return items;
  }

  async detail(ctx: AdminContext, id: string): Promise<EmployeeDetail> {
    await ctx.requireEmployee("employee.read", id);
    const row = await this.row(ctx, id);
    const [item] = await this.enrich(ctx, [row]);
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const today = localParts(new Date(), s.timezone).date;
    const [org, placements, index] = await Promise.all([this.org(ctx), loadPlacements(ctx.db, ctx.tenantId, today, [id]), PolicyIndex.load(ctx.db, ctx.tenantId)]);
    const p = placements.get(id) ?? null;
    const seeAttendance = ctx.can("attendance.read") && (await this.inScope(ctx, "attendance.read", id));
    let devices: AdminDevice[] = [], recentEvents: EmployeeDetail["recentEvents"] = [];
    if (seeAttendance) {
      devices = await this.attendance.devicesOf(ctx, [id]);
      recentEvents = await this.attendance.eventsFor(ctx, [id], addDays(today, -13), today, index, s.timezone);
    }
    let audit: AuditEntry[] = [];
    if (ctx.can("audit.read")) {
      /* Nhật ký của hồ sơ, thiết bị và đơn từ của nhân viên */
      const { data: reqs } = await ctx.db.from("requests").select("id").eq("tenant_id", ctx.tenantId).eq("requester_employee_id", id).order("submitted_at", { ascending: false }).limit(50);
      const ids = [id, ...devices.map((d) => d.id), ...((reqs ?? []) as Array<{ id: string }>).map((r) => r.id)];
      const { data: logs } = await ctx.db.from("audit_logs").select("id, action, actor_user_id, created_at, reason, before_data, after_data")
        .eq("tenant_id", ctx.tenantId).in("resource_id", ids).order("created_at", { ascending: false }).limit(40);
      const actors = await this.userNames(ctx, ((logs ?? []) as Array<{ actor_user_id: string | null }>).map((l) => l.actor_user_id));
      audit = ((logs ?? []) as Array<{ id: string; action: string; actor_user_id: string | null; created_at: string; reason: string | null; before_data: unknown; after_data: unknown }>)
        .map((l) => ({ id: l.id, action: l.action, actor: l.actor_user_id ? actors.get(l.actor_user_id) ?? "Người dùng" : "Hệ thống", createdAt: l.created_at, reason: l.reason, before: l.before_data, after: l.after_data }));
    }
    /* Thông tin cá nhân đã duyệt; số tài khoản đầy đủ chỉ khi có employee.sensitive.read với nhân viên này */
    const reveal = ctx.can("employee.sensitive.read") && (await this.inScope(ctx, "employee.sensitive.read", id));
    const personal = (await loadPersonal(ctx.db, ctx.tenantId, [id], () => reveal)).get(id)!;
    return {
      ...item!, personal,
      legalEntity: p ? { id: p.legal_entity_id, name: org.names.get(p.legal_entity_id) ?? "—" } : null,
      manager: p?.manager_employee_id ? { id: p.manager_employee_id, name: org.names.get(p.manager_employee_id) ?? "—" } : null,
      assignmentFrom: p?.effective_from ?? null, terminationDate: row.termination_date,
      devices, recentEvents, audit,
      policies: index.resolve(id, p, today),
    };
  }

  /* ---------- Tạo / sửa ---------- */
  async create(ctx: AdminContext, b: Body): Promise<EmployeeDetail> {
    ctx.require("employee.create");
    const input = required(parseUpsert(b, false));
    const org = await this.org(ctx);
    const placement = this.placementFor(org, input.departmentId, input.positionId);
    await this.assertPlacementAllowed(ctx, "employee.create", placement);
    if (input.managerEmployeeId) await ctx.requireEmployee("employee.read", input.managerEmployeeId);
    await this.assertEmailFree(ctx, input.workEmail, null);
    const { data, error } = await ctx.db.from("employees").insert({
      tenant_id: ctx.tenantId, employee_code: input.employeeCode, full_name: input.fullName, work_email: input.workEmail, phone: input.phone ?? null,
      hire_date: input.hireDate, employment_type: input.employmentType, status: input.status ?? "active", source_system: "kavor",
    }).select(EMP_COLS).single();
    if (error?.code === "23505") throw conflict(`Mã nhân viên ${input.employeeCode} đã tồn tại.`);
    if (error || !data) throw error ?? new Error("insert employee");
    const emp = data as EmployeeRowFull;
    const effectiveFrom = input.effectiveFrom ?? input.hireDate;
    const { error: aErr } = await ctx.db.from("employee_assignments").insert({ tenant_id: ctx.tenantId, employee_id: emp.id, ...placement, manager_employee_id: input.managerEmployeeId ?? null, effective_from: effectiveFrom });
    if (aErr) throw aErr;
    await ctx.audit("employee.created", "employee", emp.id, null, { ...snapshot(emp), ...placement, manager_employee_id: input.managerEmployeeId ?? null, effective_from: effectiveFrom });
    if (input.sendInvite) await this.invite(ctx, emp.id);
    return this.detail(ctx, emp.id);
  }

  async update(ctx: AdminContext, id: string, b: Body): Promise<EmployeeDetail> {
    await ctx.requireEmployee("employee.update", id);
    const before = await this.row(ctx, id);
    const input = parseUpsert(b, true);
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const today = localParts(new Date(), s.timezone).date;
    const patch: Record<string, unknown> = {};
    if (input.employeeCode !== undefined && input.employeeCode !== before.employee_code) patch.employee_code = input.employeeCode;
    if (input.fullName !== undefined && input.fullName !== before.full_name) patch.full_name = input.fullName;
    if (input.workEmail !== undefined && input.workEmail.toLowerCase() !== (before.work_email ?? "").toLowerCase()) {
      if (before.user_id) throw conflict("Nhân viên đã kích hoạt tài khoản bằng email này; chưa hỗ trợ đổi email đăng nhập.");
      await this.assertEmailFree(ctx, input.workEmail, id);
      patch.work_email = input.workEmail;
    }
    if (input.phone !== undefined && input.phone !== before.phone) patch.phone = input.phone;
    if (input.hireDate !== undefined && input.hireDate !== before.hire_date) patch.hire_date = input.hireDate;
    if (input.employmentType !== undefined && input.employmentType !== before.employment_type) patch.employment_type = input.employmentType;
    if (input.status !== undefined && input.status !== before.status) {
      patch.status = input.status;
      patch.termination_date = input.status === "terminated" ? (date(b, "terminationDate", true) ?? today) : null;
    }
    if (Object.keys(patch).length) {
      const { error } = await ctx.db.from("employees").update(patch).eq("id", id).eq("tenant_id", ctx.tenantId);
      if (error?.code === "23505") throw conflict(`Mã nhân viên ${String(patch.employee_code)} đã tồn tại.`);
      if (error) throw error;
    }

    /* Đổi phòng ban/chức danh/quản lý: đóng phân công cũ, mở phân công mới từ ngày hiệu lực (giữ lịch sử) */
    const current = (await loadPlacements(ctx.db, ctx.tenantId, today, [id])).get(id) ?? null;
    let placementChange: Record<string, unknown> | null = null;
    if (input.departmentId !== undefined || input.positionId !== undefined || input.managerEmployeeId !== undefined) {
      const org = await this.org(ctx);
      const next = this.placementFor(org, input.departmentId ?? current?.department_id ?? "", input.positionId ?? current?.position_id ?? "");
      const manager = input.managerEmployeeId !== undefined ? input.managerEmployeeId : current?.manager_employee_id ?? null;
      if (manager === id) throw invalid("Nhân viên không thể là quản lý trực tiếp của chính mình.");
      if (manager && manager !== current?.manager_employee_id) await ctx.requireEmployee("employee.read", manager);
      const changed = !current || current.department_id !== next.department_id || current.position_id !== next.position_id || (current.manager_employee_id ?? null) !== (manager ?? null);
      if (changed) {
        await this.assertPlacementAllowed(ctx, "employee.update", next);
        const from = input.effectiveFrom ?? today;
        if (current && from < current.effective_from) throw invalid(`Ngày hiệu lực phải từ ${current.effective_from} trở đi.`);
        if (current && from === current.effective_from) {
          const { error } = await ctx.db.from("employee_assignments").update({ ...next, manager_employee_id: manager }).eq("employee_id", id).eq("is_primary", true).eq("effective_from", from);
          if (error) throw error;
        } else {
          if (current) {
            const { error } = await ctx.db.from("employee_assignments").update({ effective_to: addDays(from, -1) }).eq("employee_id", id).eq("is_primary", true).eq("effective_from", current.effective_from);
            if (error) throw error;
          }
          const { error } = await ctx.db.from("employee_assignments").insert({ tenant_id: ctx.tenantId, employee_id: id, ...next, manager_employee_id: manager, effective_from: from });
          if (error) throw error;
        }
        placementChange = { before: current, after: { ...next, manager_employee_id: manager, effective_from: from } };
      }
    }
    if (Object.keys(patch).length || placementChange) {
      const after = { ...snapshot(before), ...patch };
      await ctx.audit("employee.updated", "employee", id, { ...snapshot(before), placement: placementChange?.before ?? undefined }, { ...after, placement: placementChange?.after ?? undefined });
    }
    return this.detail(ctx, id);
  }

  /* ---------- Tài khoản ---------- */
  async invite(ctx: AdminContext, id: string): Promise<{ invitedAt: string; inviteCount: number }> {
    ctx.require("membership.invite");
    await ctx.requireEmployee("employee.read", id);
    const emp = await this.row(ctx, id);
    if (emp.user_id) throw conflict("Nhân viên đã kích hoạt tài khoản.");
    if (!emp.work_email) throw invalid("Hồ sơ chưa có email công ty.");
    if (emp.status === "terminated") throw conflict("Nhân viên đã nghỉ việc.");
    if (emp.invited_at && Date.now() - Date.parse(emp.invited_at) < 60_000) throw new AuthError("RATE_LIMITED", "Vừa gửi lời mời. Đợi một phút rồi gửi lại.", 429, true);
    const { data: t } = await ctx.db.from("tenants").select("display_name").eq("id", ctx.tenantId).single();
    await this.mailer.sendInvite({ to: emp.work_email, fullName: emp.full_name, employeeCode: emp.employee_code, companyName: (t?.display_name as string) ?? "Công ty", invitedBy: ctx.actor?.full_name ?? "Phòng Nhân sự" });
    const invitedAt = new Date().toISOString();
    const { error } = await ctx.db.from("employees").update({ invited_at: invitedAt, invite_count: emp.invite_count + 1 }).eq("id", id);
    if (error) throw error;
    await ctx.audit("employee.invited", "employee", id, { invited_at: emp.invited_at, invite_count: emp.invite_count }, { invited_at: invitedAt, invite_count: emp.invite_count + 1, to: emp.work_email });
    return { invitedAt, inviteCount: emp.invite_count + 1 };
  }

  /* Khóa đăng nhập: membership chuyển suspended. Mọi request sau đó (kể cả token còn hạn, làm mới phiên, Realtime) bị chặn
     vì API và RLS đều kiểm tra membership. Hồ sơ nhân sự giữ nguyên. */
  async setLocked(ctx: AdminContext, id: string, locked: boolean, reason: string | null): Promise<{ account: AccountStatus }> {
    ctx.require("membership.disable");
    await ctx.requireEmployee("employee.read", id);
    const emp = await this.row(ctx, id);
    if (!emp.user_id) throw conflict("Nhân viên chưa kích hoạt tài khoản nên chưa có gì để khóa.");
    if (locked && emp.user_id === ctx.userId) throw conflict("Bạn không thể tự khóa tài khoản của mình.");
    if (locked && (!reason || reason.length < 5)) throw invalid("Cần ghi lý do khóa tài khoản (ít nhất 5 ký tự).");
    const { data: m } = await ctx.db.from("memberships").select("id, status").eq("tenant_id", ctx.tenantId).eq("user_id", emp.user_id).maybeSingle();
    const membership = m as { id: string; status: string } | null;
    const target = locked ? "suspended" : "active";
    if (membership?.status === target) return { account: locked ? "locked" : "active" };
    const { error } = membership
      ? await ctx.db.from("memberships").update({ status: target }).eq("id", membership.id)
      : await ctx.db.from("memberships").insert({ tenant_id: ctx.tenantId, user_id: emp.user_id, employee_id: id, status: target, joined_at: new Date().toISOString() });
    if (error?.message?.includes("LAST_TENANT_ADMIN")) throw new AuthError("LAST_TENANT_ADMIN", "Đây là Tenant Admin cuối cùng của công ty nên không thể khóa. Hãy gán thêm một Tenant Admin trước.", 409);
    if (error) throw error;
    await ctx.audit(locked ? "account.locked" : "account.unlocked", "employee", id, { membership_status: membership?.status ?? null }, { membership_status: target }, reason);
    return { account: locked ? "locked" : "active" };
  }

  /* ---------- Tổng quan ---------- */
  async overview(ctx: AdminContext): Promise<AdminOverview> {
    if (!ctx.can("employee.read") && !ctx.can("attendance.read")) throw forbidden();
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const today = localParts(new Date(), s.timezone).date;
    let activeEmployees = 0, notActivated = 0, recentEmployees: EmployeeListItem[] = [];
    if (ctx.can("employee.read")) {
      const { data } = await ctx.scopedEmployees("employee.read", EMP_COLS).neq("status", "terminated").order("created_at", { ascending: false });
      const rows = (data ?? []) as unknown as EmployeeRowFull[];
      activeEmployees = rows.length;
      notActivated = rows.filter((r) => !r.user_id).length;
      recentEmployees = await this.enrich(ctx, rows.slice(0, 5));
    }
    let board: AttendanceBoard | null = null, days: OverviewDay[] = [];
    if (ctx.can("attendance.read")) [board, days] = await Promise.all([this.attendance.board(ctx, today), this.attendance.days(ctx, 7)]);
    return {
      date: today, activeEmployees, notActivated,
      presentToday: board?.summary.present ?? 0, lateToday: board?.summary.late ?? 0, rejectedToday: board?.summary.rejected ?? 0,
      devicesPending: board?.summary.devicesPending ?? 0, days, recentEmployees,
    };
  }

  /* ---------- Nội bộ ---------- */
  async row(ctx: AdminContext, id: string): Promise<EmployeeRowFull> {
    const { data } = await ctx.db.from("employees").select(EMP_COLS).eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) throw notFound("nhân viên");
    return data as EmployeeRowFull;
  }

  async inScope(ctx: AdminContext, perm: string, id: string) {
    const { data } = await ctx.db.rpc("employee_in_scope", { p_user: ctx.userId, p_tenant: ctx.tenantId, p_perm: perm, p_employee: id });
    return data === true;
  }

  async org(ctx: AdminContext): Promise<Org> {
    const [le, br, de, po, em] = await Promise.all([
      ctx.db.from("legal_entities").select("id, name").eq("tenant_id", ctx.tenantId),
      ctx.db.from("branches").select("id, name, legal_entity_id").eq("tenant_id", ctx.tenantId),
      ctx.db.from("departments").select("id, name, branch_id").eq("tenant_id", ctx.tenantId),
      ctx.db.from("positions").select("id, name").eq("tenant_id", ctx.tenantId),
      ctx.db.from("employees").select("id, full_name").eq("tenant_id", ctx.tenantId),
    ]);
    const names = new Map<string, string>();
    for (const r of [...(le.data ?? []), ...(br.data ?? []), ...(de.data ?? []), ...(po.data ?? [])] as Array<{ id: string; name: string }>) names.set(r.id, r.name);
    for (const r of (em.data ?? []) as Array<{ id: string; full_name: string }>) names.set(r.id, r.full_name);
    return {
      names,
      deptBranch: new Map(((de.data ?? []) as Array<{ id: string; branch_id: string | null }>).map((d) => [d.id, d.branch_id])),
      branchEntity: new Map(((br.data ?? []) as Array<{ id: string; legal_entity_id: string }>).map((b) => [b.id, b.legal_entity_id])),
    };
  }

  /* Phòng ban quyết định chi nhánh và pháp nhân */
  private placementFor(org: Org, departmentId: string, positionId: string) {
    if (!org.deptBranch.has(departmentId)) throw invalid("Phòng ban không tồn tại.");
    if (!org.names.has(positionId)) throw invalid("Chức danh không tồn tại.");
    const branchId = org.deptBranch.get(departmentId);
    if (!branchId) throw invalid("Phòng ban chưa gắn chi nhánh. Cập nhật cơ cấu tổ chức trước.");
    return { legal_entity_id: org.branchEntity.get(branchId)!, branch_id: branchId, department_id: departmentId, position_id: positionId };
  }

  /* HR có phạm vi hẹp chỉ tạo/chuyển nhân viên vào đơn vị mình quản lý */
  private async assertPlacementAllowed(ctx: AdminContext, perm: string, p: Pick<Placement, "legal_entity_id" | "branch_id" | "department_id">) {
    const ok = ctx.scopes(perm).some((g) => g.scope_type === "tenant"
      || (g.scope_type === "legal_entity" && g.scope_id === p.legal_entity_id)
      || (g.scope_type === "branch" && g.scope_id === p.branch_id)
      || (g.scope_type === "department" && g.scope_id === p.department_id));
    if (!ok) throw forbidden("Phòng ban này nằm ngoài phạm vi bạn được quản lý.");
  }

  /* Đăng nhập/kích hoạt tra nhân viên theo email trên toàn hệ thống, nên email công ty phải là duy nhất */
  private async assertEmailFree(ctx: AdminContext, email: string, exceptId: string | null) {
    const { data } = await ctx.db.from("employees").select("id").eq("work_email", email).limit(2);
    if (((data ?? []) as Array<{ id: string }>).some((r) => r.id !== exceptId)) throw conflict("Email này đã được dùng cho một hồ sơ khác.");
  }

  private async userNames(ctx: AdminContext, ids: Array<string | null>) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (!list.length) return new Map<string, string>();
    const { data } = await ctx.db.from("employees").select("user_id, full_name").eq("tenant_id", ctx.tenantId).in("user_id", list);
    return new Map(((data ?? []) as Array<{ user_id: string; full_name: string }>).map((r) => [r.user_id, r.full_name]));
  }

  async enrich(ctx: AdminContext, rows: EmployeeRowFull[]): Promise<EmployeeListItem[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const userIds = rows.map((r) => r.user_id).filter((x): x is string => !!x);
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const today = localParts(new Date(), s.timezone).date;
    const [org, placements, ms, profiles, pending] = await Promise.all([
      this.org(ctx),
      loadPlacements(ctx.db, ctx.tenantId, today, ids),
      ctx.db.from("memberships").select("user_id, status").eq("tenant_id", ctx.tenantId).not("user_id", "is", null),
      userIds.length ? ctx.db.from("user_profiles").select("id, last_login_at").in("id", userIds.slice(0, 200)) : Promise.resolve({ data: [] }),
      ctx.db.from("employee_devices").select("employee_id").eq("tenant_id", ctx.tenantId).eq("status", "pending"),
    ]);
    const memberStatus = new Map(((ms.data ?? []) as Array<{ user_id: string; status: string }>).map((m) => [m.user_id, m.status]));
    const lastLogin = new Map(((profiles.data ?? []) as Array<{ id: string; last_login_at: string | null }>).map((p) => [p.id, p.last_login_at]));
    const pendingSet = new Set(((pending.data ?? []) as Array<{ employee_id: string }>).map((d) => d.employee_id));
    const ref = (id: string | undefined | null): Ref | null => (id ? { id, name: org.names.get(id) ?? "—" } : null);
    return rows.map((r) => {
      const p = placements.get(r.id);
      const account: AccountStatus = !r.user_id ? (r.invited_at ? "invited" : "not_invited") : memberStatus.get(r.user_id) === "suspended" ? "locked" : "active";
      return {
        id: r.id, code: r.employee_code, fullName: r.full_name, email: r.work_email, phone: r.phone, hireDate: r.hire_date,
        employmentType: r.employment_type, status: r.status, department: ref(p?.department_id), position: ref(p?.position_id), branch: ref(p?.branch_id),
        account, invitedAt: r.invited_at, lastLoginAt: r.user_id ? lastLogin.get(r.user_id) ?? null : null, devicePending: pendingSet.has(r.id),
      };
    });
  }
}

function parseUpsert(b: Body, partial: boolean) {
  const opt = partial;
  const workEmail = text(b, "workEmail", { max: 200, optional: opt, pattern: EMAIL, hint: "email không hợp lệ" })?.toLowerCase();
  const input = {
    employeeCode: text(b, "employeeCode", { min: 2, max: 40, optional: opt, pattern: /^[A-Za-z0-9._-]+$/, hint: "chỉ gồm chữ, số, . _ -" })?.toUpperCase(),
    fullName: text(b, "fullName", { min: 2, max: 120, optional: opt }),
    workEmail,
    phone: nullableText(b, "phone", 30),
    hireDate: date(b, "hireDate", opt),
    employmentType: oneOf(b, "employmentType", EMPLOYMENT_TYPES, opt),
    status: oneOf(b, "status", EMPLOYEE_STATUSES, true),
    departmentId: uuid(b, "departmentId", opt),
    positionId: uuid(b, "positionId", opt),
    managerEmployeeId: "managerEmployeeId" in (b ?? {}) ? (b.managerEmployeeId === null || b.managerEmployeeId === "" ? null : uuid(b, "managerEmployeeId")) : undefined,
    effectiveFrom: date(b, "effectiveFrom", true),
    sendInvite: b?.sendInvite === true,
  };
  if (!partial) { req(b, "employeeCode"); req(b, "fullName"); }
  return input;
}
/* Khi tạo mới, parseUpsert(b, false) đã bắt buộc các trường này */
const required = (i: ReturnType<typeof parseUpsert>) => i as typeof i & Required<Pick<EmployeeUpsert, "employeeCode" | "fullName" | "workEmail" | "hireDate" | "employmentType" | "departmentId" | "positionId">>;

const snapshot = (e: EmployeeRowFull) => ({
  employee_code: e.employee_code, full_name: e.full_name, work_email: e.work_email, phone: e.phone, hire_date: e.hire_date,
  employment_type: e.employment_type, status: e.status, termination_date: e.termination_date,
});

const scopeLabel = (t: string) => ({ self: "Bản thân", direct_reports: "Nhân viên trực tiếp", department: "Phòng ban", branch: "Chi nhánh", legal_entity: "Pháp nhân" } as Record<string, string>)[t] ?? t;
