/* Quy tắc quản lý trực tiếp mặc định theo hệ cấp bậc chuẩn (Nhân viên → Trưởng nhóm → Quản lý → Ban Giám đốc), dùng chung cho nhập file và
   "Sắp xếp tự động" ở Cơ cấu tổ chức. Thuần (không DB) để kiểm thử. */
import { inferTier, MANAGEMENT_TIERS, managerTierOk, type ManagementTier, type StructureInput, type StructurePlan, type StructureRow } from "@kavor/contracts";
import { localParts, tenantSettings } from "../attendance/attendance.service.js";
import { loadPlacements } from "../attendance/policy.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import type { AdminContext } from "./context.js";
import type { Body } from "./validate.js";

export type StructPerson = { id: string; name: string; dept: string | null; tier: ManagementTier | null };
export type Proposal = { managerId: string | null; note: string | null };

/* Mỗi phòng (từ phòng mình lên phòng cha): người cấp cao hơn gần nhất trong phòng, không có thì Trưởng đơn vị của phòng (nếu cấp cao hơn mình);
   hết chuỗi → Ban Giám đốc nếu công ty chỉ có một người. Nhiều người cùng cấp ở nơi tìm thấy → không đoán. */
export function managerRules(people: StructPerson[], parentOf: Map<string, string | null>, headOf: Map<string, string | null> = new Map()) {
  const byDept = new Map<string, StructPerson[]>();
  for (const p of people) if (p.dept) byDept.set(p.dept, [...(byDept.get(p.dept) ?? []), p]);
  const bod = people.filter((p) => p.tier === 4);
  return (me: StructPerson, deptName: (id: string) => string = (id) => id): Proposal => {
    const t = me.tier ?? 1;
    if (t >= 4) return { managerId: null, note: null };
    const seen = new Set<string>();
    for (let d = me.dept, hop = 0; d && !seen.has(d); d = parentOf.get(d) ?? null, hop++) {
      seen.add(d);
      const above = (byDept.get(d) ?? []).filter((p) => p.id !== me.id && (p.tier ?? 1) > t);
      if (!above.length) {
        const head = headOf.get(d) ? people.find((p) => p.id === headOf.get(d)) : undefined;
        if (head && head.id !== me.id && (head.tier ?? 1) > t) return { managerId: head.id, note: `Trưởng đơn vị ${hop ? `phòng cấp trên ${deptName(d)}` : "của phòng"}` };
        continue;
      }
      const min = Math.min(...above.map((p) => p.tier ?? 1)) as ManagementTier, at = above.filter((p) => (p.tier ?? 1) === min);
      const where = hop ? `phòng cấp trên ${deptName(d)}` : "cùng phòng";
      if (at.length === 1) return { managerId: at[0]!.id, note: `${MANAGEMENT_TIERS[min]} ${where}` };
      return { managerId: null, note: `${at.length} người cấp ${MANAGEMENT_TIERS[min]} ở ${hop ? deptName(d) : "phòng"} — chọn tay` };
    }
    const boss = bod.filter((p) => p.id !== me.id);
    if (boss.length === 1) return { managerId: boss[0]!.id, note: "Ban Giám đốc (phòng chưa có cấp quản lý)" };
    return { managerId: null, note: boss.length ? `Phòng chưa có Trưởng nhóm/Quản lý, công ty có ${boss.length} người Ban Giám đốc — chọn tay` : null };
  };
}

/* ---------- "Sắp xếp tự động": đề xuất cấp chức danh + quản lý trực tiếp cho cả công ty, áp dụng nguyên khối ---------- */

const UUID = /^[0-9a-f-]{36}$/i;
export function structureInput(b: Body): Required<StructureInput> {
  const raw = b?.tiers && typeof b.tiers === "object" && !Array.isArray(b.tiers) ? b.tiers as Record<string, unknown> : {};
  const tiers = Object.fromEntries(Object.entries(raw).filter(([k, v]) => UUID.test(k) && [1, 2, 3, 4].includes(v as number)).slice(0, 2000)) as Record<string, ManagementTier>;
  const skip = Array.isArray(b?.skip) ? (b.skip as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 5000) : [];
  return { tiers, overwrite: b?.overwrite === true, skip };
}

export class StructureAdmin {
  constructor(private readonly sb: SupabaseGateway) {}

  async plan(ctx: AdminContext, b: Body): Promise<StructurePlan> {
    ctx.requireTenantWide("organization.manage");
    ctx.requireTenantWide("employee.update");
    const input = structureInput(b);
    const db = ctx.db;
    const today = localParts(new Date(), (await tenantSettings(this.sb, ctx.tenantId)).timezone).date;
    const live = `effective_to.is.null,effective_to.gte.${today}`;
    const [{ data: deps, error: e1 }, { data: pos, error: e2 }, { data: emps, error: e3 }] = await Promise.all([
      db.from("departments").select("id, name, parent_id, head_employee_id").eq("tenant_id", ctx.tenantId).or(live),
      db.from("positions").select("id, code, name, management_tier").eq("tenant_id", ctx.tenantId).or(live).order("name"),
      db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).neq("status", "terminated"),
    ]);
    if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
    const depts = (deps ?? []) as Array<{ id: string; name: string; parent_id: string | null; head_employee_id: string | null }>;
    const positions = (pos ?? []) as Array<{ id: string; code: string; name: string; management_tier: ManagementTier | null }>;
    const employees = (emps ?? []) as Array<{ id: string; employee_code: string; full_name: string }>;
    const place = employees.length ? await loadPlacements(db, ctx.tenantId, today, employees.length <= 100 ? employees.map((e) => e.id) : undefined) : new Map();
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    /* Cấp áp dụng: HR chọn > đề xuất theo tên (đề xuất ghi đè cấp sai đang có — HR xem bảng trước khi áp dụng) */
    const tierOf = new Map(positions.map((p) => [p.id, input.tiers[p.id] ?? inferTier(p.name)]));
    const people: StructPerson[] = employees.filter((e) => place.has(e.id)).map((e) => {
      const pl = place.get(e.id)!;
      return { id: e.id, name: e.full_name, dept: pl.department_id, tier: tierOf.get(pl.position_id) ?? null };
    });
    const personOf = new Map(people.map((p) => [p.id, p]));
    const rule = managerRules(people, new Map(depts.map((d) => [d.id, d.parent_id])), new Map(depts.map((d) => [d.id, d.head_employee_id])));
    const posName = new Map(positions.map((p) => [p.id, p.name]));
    const nameOf = new Map(employees.map((e) => [e.id, e.full_name]));
    const skip = new Set(input.skip);
    const rows: StructureRow[] = employees.filter((e) => place.has(e.id)).map((e) => {
      const pl = place.get(e.id)!, me = personOf.get(e.id)!;
      const curId: string | null = pl.manager_employee_id ?? null;
      const cur = curId ? personOf.get(curId) : undefined;
      const currentOk = !!curId && !!cur && managerTierOk(cur.tier, me.tier);
      const p = rule(me, (id) => deptName.get(id) ?? "—");
      const wanted = currentOk && !input.overwrite ? curId : p.managerId;
      const change = !!wanted && wanted !== curId && !skip.has(e.id);
      return {
        employeeId: e.id, code: e.employee_code, name: e.full_name, department: deptName.get(pl.department_id) ?? null, position: posName.get(pl.position_id) ?? null, tier: me.tier,
        current: curId ? { id: curId, name: nameOf.get(curId) ?? "—" } : null, currentOk,
        proposed: wanted ? { id: wanted, name: nameOf.get(wanted) ?? "—" } : null, change,
        note: currentOk && !input.overwrite ? "Giữ quản lý hiện tại (đúng cấp)" : p.note ?? (curId && !currentOk ? "Quản lý hiện tại sai cấp hoặc đã nghỉ" : null),
      };
    }).sort((a, b) => (a.department ?? "").localeCompare(b.department ?? "", "vi") || (b.tier ?? 1) - (a.tier ?? 1) || a.name.localeCompare(b.name, "vi"));
    const outPos = positions.map((p) => ({ id: p.id, code: p.code, name: p.name, current: p.management_tier, suggested: inferTier(p.name), tier: tierOf.get(p.id)!,
      people: people.filter((x) => place.get(x.id)?.position_id === p.id).length }));
    return { today, positions: outPos, rows, changes: { tiers: outPos.filter((p) => p.tier !== p.current).length, managers: rows.filter((r) => r.change).length } };
  }

  async apply(ctx: AdminContext, b: Body): Promise<StructurePlan & { applied: { tiers: number; managers: number } }> {
    /* Tính lại ở máy chủ từ cùng lựa chọn (không tin danh sách client gửi) */
    const plan = await this.plan(ctx, b);
    const tiers = plan.positions.filter((p) => p.tier !== p.current).map((p) => ({ id: p.id, tier: p.tier }));
    const managers = plan.rows.filter((r) => r.change).map((r) => ({ employee_id: r.employeeId, manager_id: r.proposed!.id }));
    const { data, error } = await ctx.db.rpc("apply_structure_plan", { p_tenant: ctx.tenantId, p_today: plan.today, p_tiers: tiers, p_managers: managers });
    if (error) throw error;
    const applied = data as { tiers: number; managers: number };
    await ctx.audit("organization.structure_applied", "tenant", ctx.tenantId, null, { tiers, managers, applied });
    return { ...(await this.plan(ctx, { tiers: Object.fromEntries(plan.positions.map((p) => [p.id, p.tier])) })), applied };
  }
}
