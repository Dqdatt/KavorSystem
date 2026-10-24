/* Tra ca và địa điểm chấm công áp dụng cho một nhân viên vào một ngày (ADR 0001 §2).
   Không sao chép rule vào nhân viên: mỗi lần cần thì tra từ phân công tổ chức hiện hành + policy_assignments,
   chọn tầng ưu tiên cao nhất (cá nhân > phòng ban > chi nhánh > pháp nhân > công ty), rồi chọn phiên bản
   có hiệu lực ở ngày đó. Phần chọn là hàm thuần để test được; PolicyIndex nạp dữ liệu một lần cho cả tenant. */
import { RULE_KINDS, type PolicyKind, type PolicyScopeType, type PolicySource, type ResolvedPolicies, type ResolvedRule, type RuleConfig, type RuleKind, type ShiftInfo, type WorkLocation } from "@kavor/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignmentRow = {
  id: string; kind: PolicyKind; target_id: string; scope_type: PolicyScopeType; scope_id: string | null;
  effective_from: string; effective_to: string | null; reason: string | null; created_at: string; created_by: string | null;
};
export type Placement = { legal_entity_id: string; branch_id: string; department_id: string; position_id: string; manager_employee_id: string | null; effective_from: string };
export type ShiftVersionRow = {
  id: string; shift_id: string; version_no: number; start_time: string; end_time: string; break_start: string | null; break_end: string | null;
  late_grace_minutes: number; early_grace_minutes: number; work_days: number[]; effective_from: string; note: string | null; created_at: string;
};
export type ShiftRow = { id: string; code: string; name: string; active: boolean };
export type LocationVersionRow = { id: string; location_id: string; version_no: number; latitude: number; longitude: number; radius_m: number; max_accuracy_m: number; effective_from: string; note: string | null; created_at: string };
export type LocationRow = { id: string; code: string; name: string; address: string | null; branch_id: string | null; active: boolean };
export type RuleRow = { id: string; kind: RuleKind; code: string; name: string; active: boolean };
export type RuleVersionRow = { id: string; policy_id: string; version_no: number; config: RuleConfig; effective_from: string; note: string | null; created_at: string };

export const TIER_RANK: Record<PolicyScopeType, number> = { employee: 5, department: 4, branch: 3, legal_entity: 2, tenant: 1 };

export const isEffective = (a: { effective_from: string; effective_to: string | null }, date: string) =>
  a.effective_from <= date && (a.effective_to == null || a.effective_to >= date);

/* Các assignment khớp nhân viên ở tầng ưu tiên cao nhất (cùng một phạm vi) */
export function pickTier(assignments: AssignmentRow[], kind: PolicyKind, employeeId: string, placement: Placement | null, date: string): AssignmentRow[] {
  const matches = (a: AssignmentRow) =>
    a.scope_type === "tenant"
    || (a.scope_type === "employee" && a.scope_id === employeeId)
    || (!!placement && (
      (a.scope_type === "department" && a.scope_id === placement.department_id)
      || (a.scope_type === "branch" && a.scope_id === placement.branch_id)
      || (a.scope_type === "legal_entity" && a.scope_id === placement.legal_entity_id)));
  const hit = assignments.filter((a) => a.kind === kind && isEffective(a, date) && matches(a));
  if (!hit.length) return [];
  const top = Math.max(...hit.map((a) => TIER_RANK[a.scope_type]));
  /* Áp dụng mới nhất đứng đầu: với ca chỉ lấy phần tử đầu */
  return hit.filter((a) => TIER_RANK[a.scope_type] === top).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at));
}

/* Phiên bản áp dụng cho ngày D: effective_from lớn nhất ≤ D */
export function pickVersion<T extends { effective_from: string }>(versions: T[], date: string): T | null {
  let best: T | null = null;
  for (const v of versions) if (v.effective_from <= date && (!best || v.effective_from > best.effective_from)) best = v;
  return best;
}
/* Phiên bản sắp có hiệu lực (gần nhất sau D), để web báo "từ ngày … đổi thành …" */
export function nextVersion<T extends { effective_from: string }>(versions: T[], date: string): T | null {
  let best: T | null = null;
  for (const v of versions) if (v.effective_from > date && (!best || v.effective_from < best.effective_from)) best = v;
  return best;
}

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
export const minutesOf = (t: string) => { const [h = 0, m = 0] = t.split(":").map(Number); return h * 60 + m; };

export const toShiftInfo = (s: ShiftRow, v: ShiftVersionRow): ShiftInfo => ({
  id: s.id, code: s.code, name: s.name, versionNo: v.version_no, start: hhmm(v.start_time)!, end: hhmm(v.end_time)!,
  breakStart: hhmm(v.break_start), breakEnd: hhmm(v.break_end), lateGraceMinutes: v.late_grace_minutes, earlyGraceMinutes: v.early_grace_minutes,
  workDays: v.work_days ?? [1, 2, 3, 4, 5],
});
export const toWorkLocation = (l: LocationRow, v: LocationVersionRow): WorkLocation => ({
  id: l.id, name: l.name, address: l.address, latitude: v.latitude, longitude: v.longitude, radiusM: v.radius_m, maxAccuracyM: v.max_accuracy_m,
});

/* Dữ liệu chính sách của một tenant, nạp một lần cho mỗi request */
export class PolicyIndex {
  private constructor(
    readonly assignments: AssignmentRow[],
    readonly shifts: Map<string, ShiftRow>,
    readonly shiftVersions: Map<string, ShiftVersionRow[]>,
    readonly locations: Map<string, LocationRow>,
    readonly locationVersions: Map<string, LocationVersionRow[]>,
    readonly rules: Map<string, RuleRow>,
    readonly ruleVersions: Map<string, RuleVersionRow[]>,
    private readonly names: Map<string, string>,
  ) {}

  static async load(db: SupabaseClient, tenantId: string): Promise<PolicyIndex> {
    const [as, sh, sv, lo, lv, ru, rv, de, br, le, em] = await Promise.all([
      db.from("policy_assignments").select("id, kind, target_id, scope_type, scope_id, effective_from, effective_to, reason, created_at, created_by").eq("tenant_id", tenantId),
      db.from("shift_definitions").select("id, code, name, active").eq("tenant_id", tenantId),
      db.from("shift_versions").select("id, shift_id, version_no, start_time, end_time, break_start, break_end, late_grace_minutes, early_grace_minutes, work_days, effective_from, note, created_at").eq("tenant_id", tenantId),
      db.from("work_locations").select("id, code, name, address, branch_id, active").eq("tenant_id", tenantId),
      db.from("work_location_versions").select("id, location_id, version_no, latitude, longitude, radius_m, max_accuracy_m, effective_from, note, created_at").eq("tenant_id", tenantId),
      db.from("policy_definitions").select("id, kind, code, name, active").eq("tenant_id", tenantId),
      db.from("policy_versions").select("id, policy_id, version_no, config, effective_from, note, created_at").eq("tenant_id", tenantId),
      db.from("departments").select("id, name").eq("tenant_id", tenantId),
      db.from("branches").select("id, name").eq("tenant_id", tenantId),
      db.from("legal_entities").select("id, name").eq("tenant_id", tenantId),
      db.from("employees").select("id, full_name").eq("tenant_id", tenantId),
    ]);
    for (const r of [as, sh, sv, lo, lv, ru, rv]) if (r.error) throw r.error;
    const group = <T extends Record<K, string>, K extends string>(rows: T[], key: K) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
      return m;
    };
    const names = new Map<string, string>();
    for (const r of [...(de.data ?? []), ...(br.data ?? []), ...(le.data ?? [])] as Array<{ id: string; name: string }>) names.set(r.id, r.name);
    for (const r of (em.data ?? []) as Array<{ id: string; full_name: string }>) names.set(r.id, r.full_name);
    return new PolicyIndex(
      (as.data ?? []) as AssignmentRow[],
      new Map(((sh.data ?? []) as ShiftRow[]).map((s) => [s.id, s])),
      group((sv.data ?? []) as ShiftVersionRow[], "shift_id"),
      new Map(((lo.data ?? []) as LocationRow[]).map((l) => [l.id, l])),
      group((lv.data ?? []) as LocationVersionRow[], "location_id"),
      new Map(((ru.data ?? []) as RuleRow[]).map((r) => [r.id, r])),
      group((rv.data ?? []) as RuleVersionRow[], "policy_id"),
      names,
    );
  }

  scopeName(scopeType: PolicyScopeType, scopeId: string | null): string {
    if (scopeType === "tenant") return "Toàn công ty";
    return (scopeId && this.names.get(scopeId)) ?? "—";
  }

  private source(a: AssignmentRow): PolicySource {
    return { scopeType: a.scope_type, scopeName: this.scopeName(a.scope_type, a.scope_id), assignmentId: a.id };
  }

  /* Địa điểm (phiên bản tại ngày) theo id, kể cả địa điểm không còn áp dụng — dùng để hiển thị bản ghi cũ */
  location(id: string, date: string): WorkLocation | null {
    const l = this.locations.get(id);
    const v = l && pickVersion(this.locationVersions.get(id) ?? [], date);
    return l && v ? toWorkLocation(l, v) : null;
  }

  resolve(employeeId: string, placement: Placement | null, date: string): ResolvedPolicies {
    let shift: ResolvedPolicies["shift"] = null;
    for (const a of pickTier(this.assignments, "shift", employeeId, placement, date)) {
      const s = this.shifts.get(a.target_id);
      const v = s?.active ? pickVersion(this.shiftVersions.get(a.target_id) ?? [], date) : null;
      if (s && v) { shift = { ...toShiftInfo(s, v), source: this.source(a) }; break; }
    }
    const locTier = pickTier(this.assignments, "work_location", employeeId, placement, date);
    const locations: WorkLocation[] = [];
    for (const a of locTier) {
      const l = this.locations.get(a.target_id);
      const loc = l?.active ? this.location(a.target_id, date) : null;
      if (loc && !locations.some((x) => x.id === loc.id)) locations.push(loc);
    }
    return { date, shift, locations, locationSource: locTier[0] ? this.source(locTier[0]) : null };
  }

  /* Quy định nghiệp vụ (giải trình, tạm ứng, nhắc nhở) áp dụng cho nhân viên vào ngày D, kèm tầng nguồn */
  resolveRules(employeeId: string, placement: Placement | null, date: string): Partial<Record<RuleKind, ResolvedRule>> {
    const out: Partial<Record<RuleKind, ResolvedRule>> = {};
    for (const kind of Object.keys(RULE_KINDS) as RuleKind[]) {
      for (const a of pickTier(this.assignments, kind, employeeId, placement, date)) {
        const r = this.rules.get(a.target_id);
        const v = r?.active ? pickVersion(this.ruleVersions.get(a.target_id) ?? [], date) : null;
        if (r && v) { out[kind] = { kind, policyId: r.id, name: r.name, versionNo: v.version_no, config: v.config, source: this.source(a) }; break; }
      }
    }
    return out;
  }
}

/* Phân công tổ chức chính đang hiệu lực của nhân viên (null nếu chưa có) */
export async function loadPlacements(db: SupabaseClient, tenantId: string, date: string, employeeIds?: string[]): Promise<Map<string, Placement>> {
  let q = db.from("employee_assignments").select("employee_id, legal_entity_id, branch_id, department_id, position_id, manager_employee_id, effective_from, effective_to")
    .eq("tenant_id", tenantId).eq("is_primary", true).lte("effective_from", date);
  if (employeeIds && employeeIds.length <= 100) q = q.in("employee_id", employeeIds);
  const { data, error } = await q.order("effective_from", { ascending: false });
  if (error) throw error;
  const map = new Map<string, Placement>();
  for (const r of (data ?? []) as Array<Placement & { employee_id: string; effective_to: string | null }>) {
    if (r.effective_to && r.effective_to < date) continue;
    if (!map.has(r.employee_id)) map.set(r.employee_id, r);
  }
  return map;
}
