/* Ca, địa điểm chấm công và áp dụng theo tầng (ADR 0001). Phiên bản bất biến: sửa = thêm phiên bản mới từ hôm nay
   trở đi (không sửa hồi tố công đã tính). Áp dụng chỉ được kết thúc/hủy, không xóa. */
import type { LocationDef, LocationVersion, PolicyAssignment, PolicyKind, PolicyScopeType, ShiftDef, ShiftVersion } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { localParts, tenantSettings } from "../attendance/attendance.service.js";
import { PolicyIndex, hhmm, isEffective, nextVersion, pickVersion, type LocationVersionRow, type ShiftVersionRow } from "../attendance/policy.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "./context.js";
import { addDays, date, nullableText, number, oneOf, req, text, time, uuid, type Body } from "./validate.js";

const SCOPES: readonly PolicyScopeType[] = ["tenant", "legal_entity", "branch", "department", "employee"];
const KINDS: readonly PolicyKind[] = ["shift", "work_location", "explanation", "salary_advance", "reminder", "leave"];
/* Ca/địa điểm thuộc quyền xếp lịch; quy định nghiệp vụ (giải trình, tạm ứng, nhắc nhở, phép năm) thuộc quyền quản lý quy định */
const managePerm = (kind: PolicyKind) => (kind === "shift" || kind === "work_location" ? "schedule.manage" : "policy.manage");
const TARGET: Record<PolicyKind, [string, string]> = {
  shift: ["shift_definitions", "ca"], work_location: ["work_locations", "địa điểm"],
  explanation: ["policy_definitions", "quy định"], salary_advance: ["policy_definitions", "quy định"], reminder: ["policy_definitions", "quy định"],
  leave: ["policy_definitions", "quy định"],
};
const CODE = /^[A-Za-z0-9._-]{1,20}$/;

export class ScheduleAdmin {
  constructor(private readonly sb: SupabaseGateway) {}

  async today(ctx: AdminContext) { return localParts(new Date(), (await tenantSettings(this.sb, ctx.tenantId)).timezone).date; }

  /* Không cho phiên bản/áp dụng có hiệu lực trong quá khứ: công đã chấm phải giữ nguyên rule lúc chấm */
  notPast(d: string, today: string, field = "effectiveFrom") {
    if (d < today) throw invalid(`"${field}" phải từ hôm nay (${today}) trở đi; không sửa hồi tố công đã chấm.`);
  }

  /* ---------- Ca ---------- */
  async shifts(ctx: AdminContext): Promise<ShiftDef[]> {
    ctx.require("schedule.read");
    const today = await this.today(ctx);
    const index = await PolicyIndex.load(ctx.db, ctx.tenantId);
    return [...index.shifts.values()].sort((a, b) => a.code.localeCompare(b.code)).map((s) => {
      const vs = (index.shiftVersions.get(s.id) ?? []).sort((a, b) => b.version_no - a.version_no);
      const cur = pickVersion(vs, today), nxt = nextVersion(vs, today);
      return { id: s.id, code: s.code, name: s.name, active: s.active, current: cur && toShiftVersion(cur), next: nxt && toShiftVersion(nxt), versions: vs.map(toShiftVersion) };
    });
  }

  async createShift(ctx: AdminContext, b: Body): Promise<ShiftDef> {
    ctx.requireTenantWide("schedule.manage");
    const code = req(b, "code", { pattern: CODE, hint: "1–20 ký tự chữ/số" }).toUpperCase();
    const name = req(b, "name", { min: 2, max: 80 });
    const v = parseShiftVersion(b);
    const { data, error } = await ctx.db.from("shift_definitions").insert({ tenant_id: ctx.tenantId, code, name }).select("id").single();
    if (error?.code === "23505") throw conflict(`Mã ca ${code} đã tồn tại.`);
    if (error) throw error;
    const id = (data as { id: string }).id;
    const { error: vErr } = await ctx.db.from("shift_versions").insert({ tenant_id: ctx.tenantId, shift_id: id, version_no: 1, ...v, created_by: ctx.userId });
    if (vErr) throw shiftError(vErr);
    await ctx.audit("shift.created", "shift", id, null, { code, name, version: { version_no: 1, ...v } });
    return this.shiftById(ctx, id);
  }

  async addShiftVersion(ctx: AdminContext, shiftId: string, b: Body): Promise<ShiftDef> {
    ctx.requireTenantWide("schedule.manage");
    const today = await this.today(ctx);
    const v = parseShiftVersion(b);
    this.notPast(v.effective_from, today);
    const { data: vs } = await ctx.db.from("shift_versions").select("version_no, effective_from, start_time, end_time, break_start, break_end, late_grace_minutes, early_grace_minutes, work_days")
      .eq("shift_id", shiftId).eq("tenant_id", ctx.tenantId).order("version_no", { ascending: false });
    const list = (vs ?? []) as Array<ShiftVersionRow>;
    if (!list.length) throw notFound("ca");
    if (list.some((x) => x.effective_from === v.effective_from)) throw conflict(`Đã có phiên bản hiệu lực từ ${v.effective_from}.`);
    const no = list[0]!.version_no + 1;
    const { error } = await ctx.db.from("shift_versions").insert({ tenant_id: ctx.tenantId, shift_id: shiftId, version_no: no, ...v, created_by: ctx.userId });
    if (error) throw shiftError(error);
    const prev = pickVersion(list, v.effective_from);
    await ctx.audit("shift.version_added", "shift", shiftId, prev, { version_no: no, ...v });
    return this.shiftById(ctx, shiftId);
  }

  async updateShift(ctx: AdminContext, shiftId: string, b: Body): Promise<ShiftDef> {
    ctx.requireTenantWide("schedule.manage");
    const { data: before } = await ctx.db.from("shift_definitions").select("name, active").eq("id", shiftId).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!before) throw notFound("ca");
    const patch: Record<string, unknown> = {};
    const name = text(b, "name", { min: 2, max: 80, optional: true });
    if (name !== undefined) patch.name = name;
    if (typeof b?.active === "boolean") patch.active = b.active;
    if (Object.keys(patch).length) {
      const { error } = await ctx.db.from("shift_definitions").update(patch).eq("id", shiftId);
      if (error) throw error;
      await ctx.audit("shift.updated", "shift", shiftId, before, { ...before, ...patch });
    }
    return this.shiftById(ctx, shiftId);
  }

  private async shiftById(ctx: AdminContext, id: string) {
    const s = (await this.shifts(ctx)).find((x) => x.id === id);
    if (!s) throw notFound("ca");
    return s;
  }

  /* ---------- Địa điểm ---------- */
  async locations(ctx: AdminContext): Promise<LocationDef[]> {
    ctx.require("schedule.read");
    const today = await this.today(ctx);
    const [index, { data: br }] = await Promise.all([PolicyIndex.load(ctx.db, ctx.tenantId), ctx.db.from("branches").select("id, name").eq("tenant_id", ctx.tenantId)]);
    const branch = new Map(((br ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
    return [...index.locations.values()].sort((a, b) => a.code.localeCompare(b.code)).map((l) => {
      const vs = (index.locationVersions.get(l.id) ?? []).sort((a, b) => b.version_no - a.version_no);
      const cur = pickVersion(vs, today), nxt = nextVersion(vs, today);
      return {
        id: l.id, code: l.code, name: l.name, address: l.address, active: l.active,
        branch: l.branch_id ? { id: l.branch_id, name: branch.get(l.branch_id) ?? "—" } : null,
        current: cur && toLocationVersion(cur), next: nxt && toLocationVersion(nxt), versions: vs.map(toLocationVersion),
      };
    });
  }

  async createLocation(ctx: AdminContext, b: Body): Promise<LocationDef> {
    ctx.requireTenantWide("schedule.manage");
    const code = req(b, "code", { pattern: CODE, hint: "1–20 ký tự chữ/số" }).toUpperCase();
    const name = req(b, "name", { min: 2, max: 120 });
    const address = nullableText(b, "address", 250) ?? null;
    const branchId = uuid(b, "branchId", true) ?? null;
    if (branchId) await this.assertInTenant(ctx, "branches", branchId, "chi nhánh");
    const v = parseLocationVersion(b);
    const { data, error } = await ctx.db.from("work_locations").insert({ tenant_id: ctx.tenantId, code, name, address, branch_id: branchId }).select("id").single();
    if (error?.code === "23505") throw conflict(`Mã địa điểm ${code} đã tồn tại.`);
    if (error) throw error;
    const id = (data as { id: string }).id;
    const { error: vErr } = await ctx.db.from("work_location_versions").insert({ tenant_id: ctx.tenantId, location_id: id, version_no: 1, ...v, created_by: ctx.userId });
    if (vErr) throw vErr;
    await ctx.audit("work_location.created", "work_location", id, null, { code, name, address, branch_id: branchId, version: { version_no: 1, ...v } });
    return this.locationById(ctx, id);
  }

  async addLocationVersion(ctx: AdminContext, locationId: string, b: Body): Promise<LocationDef> {
    ctx.requireTenantWide("schedule.manage");
    const today = await this.today(ctx);
    const v = parseLocationVersion(b);
    this.notPast(v.effective_from, today);
    const { data: vs } = await ctx.db.from("work_location_versions").select("version_no, effective_from, latitude, longitude, radius_m, max_accuracy_m")
      .eq("location_id", locationId).eq("tenant_id", ctx.tenantId).order("version_no", { ascending: false });
    const list = (vs ?? []) as LocationVersionRow[];
    if (!list.length) throw notFound("địa điểm");
    if (list.some((x) => x.effective_from === v.effective_from)) throw conflict(`Đã có phiên bản hiệu lực từ ${v.effective_from}.`);
    const no = list[0]!.version_no + 1;
    const { error } = await ctx.db.from("work_location_versions").insert({ tenant_id: ctx.tenantId, location_id: locationId, version_no: no, ...v, created_by: ctx.userId });
    if (error) throw error;
    await ctx.audit("work_location.version_added", "work_location", locationId, pickVersion(list, v.effective_from), { version_no: no, ...v });
    return this.locationById(ctx, locationId);
  }

  async updateLocation(ctx: AdminContext, locationId: string, b: Body): Promise<LocationDef> {
    ctx.requireTenantWide("schedule.manage");
    const { data: before } = await ctx.db.from("work_locations").select("name, address, branch_id, active").eq("id", locationId).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!before) throw notFound("địa điểm");
    const patch: Record<string, unknown> = {};
    const name = text(b, "name", { min: 2, max: 120, optional: true });
    if (name !== undefined) patch.name = name;
    const address = nullableText(b, "address", 250);
    if (address !== undefined) patch.address = address;
    if ("branchId" in (b ?? {})) {
      const branchId = uuid(b, "branchId", true) ?? null;
      if (branchId) await this.assertInTenant(ctx, "branches", branchId, "chi nhánh");
      patch.branch_id = branchId;
    }
    if (typeof b?.active === "boolean") patch.active = b.active;
    if (Object.keys(patch).length) {
      const { error } = await ctx.db.from("work_locations").update(patch).eq("id", locationId);
      if (error) throw error;
      await ctx.audit("work_location.updated", "work_location", locationId, before, { ...before, ...patch });
    }
    return this.locationById(ctx, locationId);
  }

  private async locationById(ctx: AdminContext, id: string) {
    const l = (await this.locations(ctx)).find((x) => x.id === id);
    if (!l) throw notFound("địa điểm");
    return l;
  }

  /* ---------- Áp dụng theo tầng ---------- */
  async assignments(ctx: AdminContext, kind?: string, loaded?: PolicyIndex): Promise<PolicyAssignment[]> {
    if (!ctx.can("schedule.read")) ctx.require("policy.read");
    const today = await this.today(ctx);
    const index = loaded ?? await PolicyIndex.load(ctx.db, ctx.tenantId);
    const creators = [...new Set(index.assignments.map((a) => a.created_by).filter((x): x is string => !!x))];
    const { data: names } = creators.length ? await ctx.db.from("employees").select("user_id, full_name").eq("tenant_id", ctx.tenantId).in("user_id", creators) : { data: [] };
    const creator = new Map(((names ?? []) as Array<{ user_id: string; full_name: string }>).map((r) => [r.user_id, r.full_name]));
    const rank: Record<string, number> = { active: 0, scheduled: 1, ended: 2, cancelled: 3 };
    /* kind=schedule: chỉ ca + địa điểm (trang Ca & địa điểm); quy định nghiệp vụ hiển thị ở Cài đặt doanh nghiệp */
    const wanted = (k: PolicyKind) => !kind || (kind === "schedule" ? k === "shift" || k === "work_location" : k === kind);
    return index.assignments.filter((a) => wanted(a.kind)).map((a): PolicyAssignment => {
      const target = a.kind === "shift" ? index.shifts.get(a.target_id)?.name : a.kind === "work_location" ? index.locations.get(a.target_id)?.name : index.rules.get(a.target_id)?.name;
      const state = a.effective_to && a.effective_to < a.effective_from ? "cancelled" : isEffective(a, today) ? "active" : a.effective_from > today ? "scheduled" : "ended";
      return {
        id: a.id, kind: a.kind, target: { id: a.target_id, name: target ?? "—" }, scopeType: a.scope_type,
        scope: a.scope_id ? { id: a.scope_id, name: index.scopeName(a.scope_type, a.scope_id) } : null,
        effectiveFrom: a.effective_from, effectiveTo: a.effective_to, reason: a.reason, createdAt: a.created_at, createdBy: a.created_by ? creator.get(a.created_by) ?? "Người dùng" : null, state,
      };
    }).sort((x, y) => rank[x.state]! - rank[y.state]! || SCOPES.indexOf(x.scopeType) - SCOPES.indexOf(y.scopeType) || y.effectiveFrom.localeCompare(x.effectiveFrom));
  }

  async createAssignment(ctx: AdminContext, b: Body): Promise<PolicyAssignment> {
    const kind = oneOf(b, "kind", KINDS)!;
    const perm = managePerm(kind);
    ctx.require(perm);
    const today = await this.today(ctx);
    const targetId = uuid(b, "targetId")!;
    const scopeType = oneOf(b, "scopeType", SCOPES)!;
    const scopeId = scopeType === "tenant" ? null : uuid(b, "scopeId")!;
    const effectiveFrom = date(b, "effectiveFrom")!;
    const effectiveTo = date(b, "effectiveTo", true) ?? null;
    const reason = nullableText(b, "reason", 300) ?? null;
    this.notPast(effectiveFrom, today);
    if (effectiveTo && effectiveTo < effectiveFrom) throw invalid("Ngày kết thúc phải sau ngày bắt đầu.");
    if (scopeType === "employee" && (!reason || reason.length < 5)) throw invalid("Ngoại lệ cho một nhân viên bắt buộc ghi lý do (ít nhất 5 ký tự).");
    await this.assertInTenant(ctx, TARGET[kind][0], targetId, TARGET[kind][1], TARGET[kind][0] === "policy_definitions" ? kind : undefined);
    await this.assertScopeAllowed(ctx, scopeType, scopeId, perm);
    const { data, error } = await ctx.db.from("policy_assignments").insert({
      tenant_id: ctx.tenantId, kind, target_id: targetId, scope_type: scopeType, scope_id: scopeId, effective_from: effectiveFrom, effective_to: effectiveTo, reason, created_by: ctx.userId,
    }).select("id").single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    await ctx.audit("policy_assignment.created", "policy_assignment", id, null, { kind, target_id: targetId, scope_type: scopeType, scope_id: scopeId, effective_from: effectiveFrom, effective_to: effectiveTo }, reason);
    return (await this.assignments(ctx)).find((a) => a.id === id)!;
  }

  /* Kết thúc từ ngày `endOn` (ngày cuối còn áp dụng); áp dụng chưa bắt đầu thì hủy */
  async endAssignment(ctx: AdminContext, id: string, b: Body): Promise<PolicyAssignment> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("áp dụng");
    const { data } = await ctx.db.from("policy_assignments").select("id, kind, scope_type, scope_id, effective_from, effective_to").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) throw notFound("áp dụng");
    const a = data as { kind: PolicyKind; scope_type: PolicyScopeType; scope_id: string | null; effective_from: string; effective_to: string | null };
    const perm = managePerm(a.kind);
    ctx.require(perm);
    const today = await this.today(ctx);
    await this.assertScopeAllowed(ctx, a.scope_type, a.scope_id, perm);
    const notStarted = a.effective_from > today;
    const endOn = notStarted ? addDays(a.effective_from, -1) : date(b, "endOn", true) ?? today;
    if (!notStarted) this.notPast(endOn, addDays(today, -1), "endOn");
    if (!notStarted && endOn < a.effective_from) throw invalid("Ngày kết thúc phải sau ngày bắt đầu.");
    if (a.effective_to && a.effective_to <= endOn) throw conflict("Áp dụng này đã kết thúc trước ngày đó.");
    const reason = nullableText(b, "reason", 300) ?? null;
    const { error } = await ctx.db.from("policy_assignments").update({ effective_to: endOn, ended_by: ctx.userId }).eq("id", id);
    if (error) throw error;
    await ctx.audit(notStarted ? "policy_assignment.cancelled" : "policy_assignment.ended", "policy_assignment", id, { effective_to: a.effective_to }, { effective_to: endOn }, reason);
    return (await this.assignments(ctx)).find((x) => x.id === id)!;
  }

  private async assertInTenant(ctx: AdminContext, table: string, id: string, label: string, kind?: string) {
    let q = ctx.db.from(table).select("id").eq("id", id).eq("tenant_id", ctx.tenantId);
    if (kind) q = q.eq("kind", kind);
    const { data } = await q.maybeSingle();
    if (!data) throw notFound(label);
  }

  /* Áp dụng ở tầng công ty/pháp nhân cần quyền toàn công ty; HR phạm vi hẹp chỉ áp dụng cho đơn vị/nhân viên mình quản lý */
  private async assertScopeAllowed(ctx: AdminContext, scopeType: PolicyScopeType, scopeId: string | null, perm: string) {
    if (scopeType !== "tenant") {
      const table = { legal_entity: "legal_entities", branch: "branches", department: "departments", employee: "employees" }[scopeType];
      await this.assertInTenant(ctx, table, scopeId!, "phạm vi áp dụng");
    }
    if (ctx.tenantWide(perm)) return;
    if (scopeType === "employee") { await ctx.requireEmployee(perm, scopeId!); return; }
    if (!ctx.scopes(perm).some((g) => g.scope_type === scopeType && g.scope_id === scopeId)) throw forbidden("Phạm vi áp dụng nằm ngoài quyền của bạn.");
  }
}

function parseShiftVersion(b: Body) {
  const start = time(b, "start")!, end = time(b, "end")!;
  const breakStart = time(b, "breakStart", true) ?? null, breakEnd = time(b, "breakEnd", true) ?? null;
  if (end <= start) throw invalid("Giờ kết thúc phải sau giờ bắt đầu (chưa hỗ trợ ca qua đêm).");
  if ((breakStart === null) !== (breakEnd === null)) throw invalid("Nhập đủ giờ bắt đầu và kết thúc nghỉ giữa ca, hoặc bỏ trống cả hai.");
  if (breakStart && breakEnd && (breakStart < start || breakEnd > end || breakEnd <= breakStart)) throw invalid("Giờ nghỉ giữa ca phải nằm trong ca.");
  return {
    start_time: start, end_time: end, break_start: breakStart, break_end: breakEnd,
    late_grace_minutes: number(b, "lateGraceMinutes", 0, 120, { optional: true, integer: true }) ?? 0,
    early_grace_minutes: number(b, "earlyGraceMinutes", 0, 120, { optional: true, integer: true }) ?? 0,
    work_days: workDays(b),
    effective_from: date(b, "effectiveFrom")!, note: nullableText(b, "note", 300) ?? null,
  };
}

/* Ngày làm việc trong tuần (ISO 1–7); bỏ trống = Thứ Hai–Thứ Sáu */
function workDays(b: Body): number[] {
  const v = b?.workDays;
  if (v === undefined || v === null) return [1, 2, 3, 4, 5];
  if (!Array.isArray(v) || !v.length || v.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw invalid("Ngày làm việc phải chọn ít nhất một ngày (Thứ Hai–Chủ Nhật).");
  return [...new Set(v as number[])].sort();
}

function parseLocationVersion(b: Body) {
  return {
    latitude: number(b, "latitude", -90, 90)!, longitude: number(b, "longitude", -180, 180)!,
    radius_m: number(b, "radiusM", 10, 5000, { integer: true })!, max_accuracy_m: number(b, "maxAccuracyM", 5, 1000, { integer: true })!,
    effective_from: date(b, "effectiveFrom")!, note: nullableText(b, "note", 300) ?? null,
  };
}

const shiftError = (e: { code?: string; message: string }) => (e.code === "23514" ? invalid("Giờ ca không hợp lệ.") : e);

const toShiftVersion = (v: ShiftVersionRow): ShiftVersion => ({
  id: v.id, versionNo: v.version_no, start: hhmm(v.start_time)!, end: hhmm(v.end_time)!, breakStart: hhmm(v.break_start), breakEnd: hhmm(v.break_end),
  lateGraceMinutes: v.late_grace_minutes, earlyGraceMinutes: v.early_grace_minutes, workDays: v.work_days ?? [1, 2, 3, 4, 5], effectiveFrom: v.effective_from, note: v.note, createdAt: v.created_at,
});
const toLocationVersion = (v: LocationVersionRow): LocationVersion => ({
  id: v.id, versionNo: v.version_no, latitude: v.latitude, longitude: v.longitude, radiusM: v.radius_m, maxAccuracyM: v.max_accuracy_m, effectiveFrom: v.effective_from, note: v.note, createdAt: v.created_at,
});
