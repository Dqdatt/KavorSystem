/* Lương đầu vào do HCNS quản lý + bảng lương đầu vào theo kỳ (gửi Kế toán tính lương chi tiết).
   - Quyền: compensation.read (xem) / compensation.manage (sửa) trong phạm vi vai trò — mặc định Nhân sự vận hành, Quản trị viên công ty, Kế toán.
     Quản lý trực tiếp không thấy lương. Ngoài phạm vi trả 404.
   - Phiên bản lương bất biến (đổi = bản mới từ ngày hiệu lực): lương cơ bản, lương đóng BH (null = bằng lương cơ bản), phụ cấp cố định,
     tình trạng lao động (null = theo hồ sơ). Người phụ thuộc theo tháng bắt đầu/kết thúc; MST + đoàn viên công đoàn.
   - Bảng đầu vào: công (kỳ công của tenant) + thông tin người lao động + mức lương (tách đoạn khi đổi trong kỳ) + người phụ thuộc + tạm ứng.
     Chốt (toàn công ty, kỳ công đã khóa) = ảnh chụp bất biến; chốt lại = bản mới. Ảnh chụp không lưu số tài khoản (đọc bản hiện hành khi xem).
   - Nhật ký không ghi số tiền lương. */
import type {
  BankAccountView, CompensationVersion, EmployeeDependent, EmployeePay, EmploymentType, PayrollInputRow, PayrollInputSegment, PayrollInputSheet, TimesheetDay,
} from "@kavor/contracts";
import { conflict, invalid, notFound, type AdminContext } from "../admin/context.js";
import { date, nullableText, number, oneOf, type Body } from "../admin/validate.js";
import { bankView } from "../profile/profile.service.js";
import { periodOf } from "../timesheet/compute.js";
import { MONTH, type EmployeeLite, type TimesheetService } from "../timesheet/timesheet.service.js";

const EMPLOYMENT: readonly EmploymentType[] = ["probation", "official", "contractor", "intern"];
const TAX = /^[0-9]{10}([0-9]{2}|-[0-9]{3})?$/;
type CompRow = { employee_id: string; base_salary: number; insurance_salary: number | null; allowance: number; employment_type: EmploymentType | null; effective_from: string; note: string | null; created_at: string };
type DepRow = { id: string; employee_id: string; full_name: string; relation: string; birth_date: string | null; tax_code: string | null; from_month: string; to_month: string | null };
type EmpRow = EmployeeLite & { work_email: string | null; employment_type: EmploymentType };
type BankRow = { employee_id: string; bank_name: string; account_no: string; holder: string };
const COMP_COLS = "employee_id, base_salary, insurance_salary, allowance, employment_type, effective_from, note, created_at";
const DEP_COLS = "id, employee_id, full_name, relation, birth_date, tax_code, from_month, to_month";

const version = (c: CompRow): CompensationVersion => ({
  baseSalary: Number(c.base_salary), insuranceSalary: c.insurance_salary === null ? null : Number(c.insurance_salary), allowance: Number(c.allowance ?? 0),
  employmentType: c.employment_type, effectiveFrom: c.effective_from, note: c.note, createdAt: c.created_at,
});
const dependent = (d: DepRow): EmployeeDependent => ({ id: d.id, fullName: d.full_name, relation: d.relation, birthDate: d.birth_date, taxCode: d.tax_code, fromMonth: d.from_month, toMonth: d.to_month });
const activeIn = (d: { from_month: string; to_month: string | null }, month: string) => d.from_month <= month && (!d.to_month || d.to_month >= month);
const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const monthField = (b: Body, k: string, optional: boolean) => {
  const v = b?.[k];
  if ((v === undefined || v === null || v === "") && optional) return null;
  if (typeof v !== "string" || !MONTH.test(v)) throw invalid(`${k} phải có dạng YYYY-MM.`);
  return v;
};
const taxField = (b: Body, k: string) => {
  const v = nullableText(b, k, 20);
  if (v && !TAX.test(v)) throw invalid("Mã số thuế gồm 10 hoặc 13 chữ số (dạng 0123456789 hoặc 0123456789-001).");
  return v ?? null;
};

export class PayrollInputs {
  constructor(private readonly timesheets: TimesheetService) {}

  /* ---------- A. Mục Lương trong hồ sơ nhân viên ---------- */
  async pay(ctx: AdminContext, employeeId: string, audit = true): Promise<EmployeePay> {
    await ctx.requireEmployee("compensation.read", employeeId);
    const db = ctx.db;
    const [{ data: emp, error }, { data: comps, error: cErr }, { data: deps, error: dErr }, { data: tax, error: tErr }, clock] = await Promise.all([
      db.from("employees").select("employment_type").eq("tenant_id", ctx.tenantId).eq("id", employeeId).maybeSingle(),
      db.from("employee_compensations").select(COMP_COLS).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).order("effective_from", { ascending: false }),
      db.from("employee_dependents").select(DEP_COLS).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).order("from_month"),
      db.from("employee_tax_profiles").select("tax_code, union_member").eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).maybeSingle(),
      this.timesheets.tenantClock(ctx.db, ctx.tenantId),
    ]);
    if (error ?? cErr ?? dErr ?? tErr) throw error ?? cErr ?? dErr ?? tErr;
    if (!emp) throw notFound("nhân viên");
    const history = ((comps ?? []) as CompRow[]).map(version);
    const t = tax as { tax_code: string | null; union_member: boolean } | null;
    const month = clock.today.slice(0, 7);
    /* Ghi vào loại tài nguyên riêng để lượt xem không lấn "Lịch sử thay đổi" của hồ sơ */
    if (audit) await ctx.audit("compensation.viewed", "employee_pay", employeeId, null, null);
    return {
      employmentType: (emp as { employment_type: EmploymentType }).employment_type,
      current: history.find((h) => h.effectiveFrom <= clock.today) ?? null, history,
      taxCode: t?.tax_code ?? null, unionMember: !!t?.union_member,
      dependents: ((deps ?? []) as DepRow[]).map(dependent), activeDependents: ((deps ?? []) as DepRow[]).filter((d) => activeIn(d, month)).length,
      canManage: ctx.can("compensation.manage"),
    };
  }

  /* Phiên bản lương mới (dùng chung cho tab Lương cơ bản và hồ sơ nhân viên) */
  async addCompensation(ctx: AdminContext, employeeId: string, b: Body) {
    ctx.require("compensation.manage");
    await ctx.requireEmployee("compensation.manage", employeeId);
    const base = number(b, "baseSalary", 1_000_000, 10_000_000_000, { integer: true })!;
    const insurance = number(b, "insuranceSalary", 1_000_000, 10_000_000_000, { integer: true, optional: true }) ?? null;
    const allowance = number(b, "allowance", 0, 10_000_000_000, { integer: true, optional: true }) ?? 0;
    const type = b?.employmentType === null || b?.employmentType === "" ? null : oneOf(b, "employmentType", EMPLOYMENT, true) ?? null;
    const from = date(b, "effectiveFrom")!;
    const note = nullableText(b, "note", 200) ?? null;
    const { error } = await ctx.db.from("employee_compensations").insert({
      tenant_id: ctx.tenantId, employee_id: employeeId, base_salary: base, insurance_salary: insurance, allowance, employment_type: type, effective_from: from, note, created_by: ctx.userId,
    });
    if (error?.code === "23505") throw conflict(`Đã có mức lương hiệu lực từ ${from}. Chọn ngày khác.`);
    if (error) throw error;
    /* Không ghi số tiền vào nhật ký: người xem nhật ký hồ sơ có thể không có quyền xem lương */
    await ctx.audit("compensation.changed", "employee", employeeId, null, { effective_from: from, ...(type ? { employment_type: type } : {}) }, note);
  }

  async setCompensation(ctx: AdminContext, employeeId: string, b: Body): Promise<EmployeePay> {
    await this.addCompensation(ctx, employeeId, b);
    return this.pay(ctx, employeeId, false);
  }

  async setTax(ctx: AdminContext, employeeId: string, b: Body): Promise<EmployeePay> {
    await ctx.requireEmployee("compensation.manage", employeeId);
    const taxCode = taxField(b, "taxCode");
    if (typeof b?.unionMember !== "boolean") throw invalid("unionMember phải là true/false.");
    const { data: before } = await ctx.db.from("employee_tax_profiles").select("tax_code, union_member").eq("employee_id", employeeId).maybeSingle();
    const { error } = await ctx.db.from("employee_tax_profiles").upsert({ employee_id: employeeId, tenant_id: ctx.tenantId, tax_code: taxCode, union_member: b.unionMember, updated_by: ctx.userId, updated_at: new Date().toISOString() });
    if (error) throw error;
    const b0 = before as { tax_code: string | null; union_member: boolean } | null;
    await ctx.audit("tax_profile.changed", "employee", employeeId, b0 ? { has_tax_code: !!b0.tax_code, union_member: b0.union_member } : null, { has_tax_code: !!taxCode, union_member: b.unionMember });
    return this.pay(ctx, employeeId, false);
  }

  private dependentFields(b: Body) {
    const full = nullableText(b, "fullName", 100), rel = nullableText(b, "relation", 50);
    if (!full) throw invalid("Nhập họ tên người phụ thuộc.");
    if (!rel) throw invalid("Nhập quan hệ (ví dụ: Con, Cha, Mẹ).");
    const from = monthField(b, "fromMonth", false)!, to = monthField(b, "toMonth", true);
    if (to && to < from) throw invalid("Tháng kết thúc phải từ tháng bắt đầu trở đi.");
    const birth = b?.birthDate ? date(b, "birthDate")! : null;
    return { full_name: full, relation: rel, birth_date: birth, tax_code: taxField(b, "taxCode"), from_month: from, to_month: to };
  }

  async addDependent(ctx: AdminContext, employeeId: string, b: Body): Promise<EmployeePay> {
    await ctx.requireEmployee("compensation.manage", employeeId);
    const f = this.dependentFields(b);
    const { data, error } = await ctx.db.from("employee_dependents").insert({ tenant_id: ctx.tenantId, employee_id: employeeId, ...f, created_by: ctx.userId }).select("id").single();
    if (error) throw error;
    await ctx.audit("dependent.added", "employee", employeeId, null, { dependent_id: (data as { id: string }).id, relation: f.relation, from_month: f.from_month, to_month: f.to_month });
    return this.pay(ctx, employeeId, false);
  }

  private async ownDependent(ctx: AdminContext, employeeId: string, depId: string) {
    await ctx.requireEmployee("compensation.manage", employeeId);
    if (!/^[0-9a-f-]{36}$/i.test(depId)) throw notFound("người phụ thuộc");
    const { data } = await ctx.db.from("employee_dependents").select(DEP_COLS).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).eq("id", depId).maybeSingle();
    if (!data) throw notFound("người phụ thuộc");
    return data as DepRow;
  }

  async updateDependent(ctx: AdminContext, employeeId: string, depId: string, b: Body): Promise<EmployeePay> {
    const before = await this.ownDependent(ctx, employeeId, depId);
    const f = this.dependentFields(b);
    const { error } = await ctx.db.from("employee_dependents").update({ ...f, updated_at: new Date().toISOString() }).eq("id", depId);
    if (error) throw error;
    await ctx.audit("dependent.changed", "employee", employeeId, { dependent_id: depId, from_month: before.from_month, to_month: before.to_month }, { dependent_id: depId, from_month: f.from_month, to_month: f.to_month });
    return this.pay(ctx, employeeId, false);
  }

  /* Xóa chỉ để sửa nhập nhầm; hết giảm trừ thì đặt tháng kết thúc (giữ lịch sử cho các kỳ đã tính) */
  async removeDependent(ctx: AdminContext, employeeId: string, depId: string, b: Body): Promise<EmployeePay> {
    const before = await this.ownDependent(ctx, employeeId, depId);
    const reason = nullableText(b, "reason", 200);
    if (!reason || reason.length < 3) throw invalid("Ghi lý do xóa (ví dụ: nhập nhầm).");
    const { error } = await ctx.db.from("employee_dependents").delete().eq("id", depId);
    if (error) throw error;
    await ctx.audit("dependent.removed", "employee", employeeId, { dependent_id: depId, relation: before.relation, from_month: before.from_month }, null, reason);
    return this.pay(ctx, employeeId, false);
  }

  /* ---------- B. Bảng lương đầu vào theo kỳ ---------- */
  private async month(ctx: AdminContext, m?: string) {
    if (m !== undefined && m !== "" && !MONTH.test(m)) throw invalid("Tháng phải có dạng YYYY-MM.");
    const clock = await this.timesheets.tenantClock(ctx.db, ctx.tenantId);
    return { clock, month: m || clock.currentMonth };
  }

  private async latest(ctx: AdminContext, month: string) {
    const { data, error } = await ctx.db.from("payroll_input_sheets").select("id, rows, note, finalized_by, finalized_at").eq("tenant_id", ctx.tenantId).eq("month", month).order("finalized_at", { ascending: false });
    if (error) throw error;
    const list = (data ?? []) as Array<{ id: string; rows: PayrollInputRow[]; note: string | null; finalized_by: string | null; finalized_at: string }>;
    return { last: list[0] ?? null, versions: list.length };
  }

  /* Bank: chỉ hiện số đầy đủ khi người xem có employee.sensitive.read với nhân viên đó */
  private async banks(ctx: AdminContext, ids: string[]) {
    if (!ids.length) return new Map<string, BankAccountView>();
    const sens = ctx.can("employee.sensitive.read") ? await ctx.scopedEmployeeIds("employee.sensitive.read") : new Set<string>();
    const { data, error } = await ctx.db.from("employee_bank_accounts").select("employee_id, bank_name, account_no, holder").eq("tenant_id", ctx.tenantId).in("employee_id", ids);
    if (error) throw error;
    return new Map(((data ?? []) as BankRow[]).map((x) => [x.employee_id, bankView(x, sens.has(x.employee_id))]));
  }

  /* Tính từ dữ liệu hiện tại cho các nhân viên (đã lọc phạm vi) còn làm trong kỳ */
  private async live(ctx: AdminContext, ids: string[], month: string, periodStartDay: number): Promise<PayrollInputRow[]> {
    const db = ctx.db;
    const p = periodOf(month, periodStartDay);
    if (!ids.length) return [];
    const { data: empData, error } = await db.from("employees").select("id, employee_code, full_name, hire_date, termination_date, user_id, work_email, employment_type").eq("tenant_id", ctx.tenantId).in("id", ids).order("employee_code");
    if (error) throw error;
    const emps = ((empData ?? []) as EmpRow[]).filter((e) => e.hire_date <= p.end && (!e.termination_date || e.termination_date >= p.start));
    const eids = emps.map((e) => e.id);
    if (!eids.length) return [];
    const [sheets, { data: comps }, { data: deps }, { data: taxes }, { data: advs }, { data: asg }] = await Promise.all([
      this.timesheets.build(ctx.tenantId, emps, month, { periodStartDay }),
      db.from("employee_compensations").select(COMP_COLS).eq("tenant_id", ctx.tenantId).in("employee_id", eids).lte("effective_from", p.end).order("effective_from"),
      db.from("employee_dependents").select(DEP_COLS).eq("tenant_id", ctx.tenantId).in("employee_id", eids),
      db.from("employee_tax_profiles").select("employee_id, tax_code, union_member").eq("tenant_id", ctx.tenantId).in("employee_id", eids),
      db.from("salary_advances").select("employee_id, amount").eq("tenant_id", ctx.tenantId).in("employee_id", eids).eq("deduct_month", `${month}-01`).not("paid_at", "is", null),
      db.from("employee_assignments").select("employee_id, effective_from, effective_to, departments(name), positions(name)").eq("tenant_id", ctx.tenantId).eq("is_primary", true).in("employee_id", eids)
        .lte("effective_from", p.end).order("effective_from", { ascending: false }),
    ]);
    const tax = new Map(((taxes ?? []) as Array<{ employee_id: string; tax_code: string | null; union_member: boolean }>).map((t) => [t.employee_id, t]));
    const adv = new Map<string, number>();
    for (const a of (advs ?? []) as Array<{ employee_id: string; amount: number }>) adv.set(a.employee_id, (adv.get(a.employee_id) ?? 0) + Number(a.amount));
    const place = new Map<string, { department: string | null; position: string | null }>();
    for (const a of (asg ?? []) as unknown as Array<{ employee_id: string; effective_to: string | null; departments: { name: string } | null; positions: { name: string } | null }>) {
      if (!place.has(a.employee_id) && (!a.effective_to || a.effective_to >= p.start)) place.set(a.employee_id, { department: a.departments?.name ?? null, position: a.positions?.name ?? null });
    }
    const banks = await this.banks(ctx, eids);
    return emps.map((e) => {
      const sheet = sheets.sheets.get(e.id)!;
      const days = sheet.days as TimesheetDay[];
      const from = e.hire_date > p.start ? e.hire_date : p.start, to = e.termination_date && e.termination_date < p.end ? e.termination_date : p.end;
      const versions = ((comps ?? []) as CompRow[]).filter((c) => c.employee_id === e.id);
      /* Đoạn: bản hiệu lực đầu kỳ + mỗi bản bắt đầu trong kỳ */
      const starts = [from, ...versions.filter((v) => v.effective_from > from && v.effective_from <= to).map((v) => v.effective_from)];
      const segments: PayrollInputSegment[] = starts.map((s, i) => {
        const end = i + 1 < starts.length ? prevDay(starts[i + 1]!) : to;
        const v = [...versions].reverse().find((x) => x.effective_from <= s) ?? null;
        return {
          from: s, to: end, baseSalary: v ? Number(v.base_salary) : null, insuranceSalary: v?.insurance_salary == null ? null : Number(v.insurance_salary),
          allowance: Number(v?.allowance ?? 0), employmentType: v?.employment_type ?? e.employment_type,
          credited: days.filter((d) => d.date >= s && d.date <= end).reduce((n, d) => n + d.credit, 0),
        };
      });
      const last = segments[segments.length - 1]!;
      const overtime: Record<string, number> = {};
      for (const d of days) if (d.overtime?.minutes) overtime[String(d.overtime.ratePercent)] = (overtime[String(d.overtime.ratePercent)] ?? 0) + d.overtime.minutes;
      const leave = (paid: boolean) => days.reduce((n, d) => n + (d.leave && d.leave.paid === paid ? (d.leave.half === "full" ? 1 : 0.5) : 0), 0);
      const t = tax.get(e.id);
      const s = sheet.summary;
      const warnings: string[] = [];
      if (last.baseSalary === null) warnings.push("Chưa nhập mức lương");
      if (segments.length > 1) warnings.push("Đổi lương/tình trạng trong kỳ");
      if (s.missingDays) warnings.push(`${s.missingDays} ngày thiếu công chưa giải trình`);
      if (s.pendingRequests) warnings.push(`${s.pendingRequests} giải trình chờ duyệt`);
      if (!banks.has(e.id)) warnings.push("Chưa có tài khoản ngân hàng");
      return {
        employee: { id: e.id, code: e.employee_code, fullName: e.full_name, department: place.get(e.id)?.department ?? null, position: place.get(e.id)?.position ?? null, email: e.work_email, hireDate: e.hire_date, terminationDate: e.termination_date },
        employmentType: last.employmentType, baseSalary: last.baseSalary, insuranceSalary: last.insuranceSalary, allowance: last.allowance, segments,
        standard: s.standard, credited: s.credited, paidLeaveDays: leave(true), unpaidLeaveDays: leave(false), holidays: days.filter((d) => d.kind === "holiday").length,
        lateMinutes: s.lateMinutes, missingDays: s.missingDays, overtime,
        dependents: ((deps ?? []) as DepRow[]).filter((d) => d.employee_id === e.id && activeIn(d, month)).length,
        taxCode: t?.tax_code ?? null, unionMember: !!t?.union_member, advance: adv.get(e.id) ?? 0, bank: banks.get(e.id) ?? null, warnings,
      };
    });
  }

  async sheet(ctx: AdminContext, m?: string, source?: string): Promise<PayrollInputSheet> {
    ctx.require("compensation.read");
    const { clock, month } = await this.month(ctx, m);
    const ids = [...await ctx.scopedEmployeeIds("compensation.read")];
    const { last, versions } = await this.latest(ctx, month);
    const p = periodOf(month, clock.periodStartDay);
    const lock = await this.timesheets.activeLock(ctx.db, ctx.tenantId, p.start);
    let rows: PayrollInputRow[];
    let src: PayrollInputSheet["source"];
    if (last && source !== "live") {
      /* Bản đã chốt: lọc theo phạm vi người xem, tài khoản ngân hàng đọc bản hiện hành */
      const scope = new Set(ids);
      const keep = last.rows.filter((r) => scope.has(r.employee.id));
      const banks = await this.banks(ctx, keep.map((r) => r.employee.id));
      rows = keep.map((r) => ({ ...r, bank: banks.get(r.employee.id) ?? null }));
      src = "final";
    } else {
      rows = await this.live(ctx, ids, month, clock.periodStartDay);
      src = "live";
    }
    let by: string | null = null;
    if (last?.finalized_by) {
      const { data } = await ctx.db.from("employees").select("full_name").eq("tenant_id", ctx.tenantId).eq("user_id", last.finalized_by).maybeSingle();
      by = (data as { full_name: string } | null)?.full_name ?? null;
    }
    await ctx.audit("payroll_input.viewed", "tenant", ctx.tenantId, null, { month, source: src, employees: rows.length });
    return {
      month, period: { month, start: p.start, end: p.end, locked: !!lock, lockedAt: lock?.locked_at ?? null }, rows, source: src,
      finalized: last ? { at: last.finalized_at, by, note: last.note, versions } : null,
      canFinalize: ctx.tenantWide("compensation.manage"),
      totals: { employees: rows.length, warnings: rows.filter((r) => r.warnings.length).length, noSalary: rows.filter((r) => r.baseSalary === null).length },
    };
  }

  /* Chốt: toàn công ty, kỳ công đã khóa (số công không đổi nữa). Chốt lại = bản mới, bản cũ giữ trong lịch sử. */
  async finalize(ctx: AdminContext, m: string, b: Body): Promise<PayrollInputSheet> {
    ctx.requireTenantWide("compensation.manage");
    const { clock, month } = await this.month(ctx, m);
    const p = periodOf(month, clock.periodStartDay);
    if (!(await this.timesheets.activeLock(ctx.db, ctx.tenantId, p.start))) throw conflict(`Khóa kỳ công ${month} ở Bảng công trước khi chốt bảng lương đầu vào.`);
    const note = nullableText(b, "note", 500) ?? null;
    const { data: all, error } = await ctx.db.from("employees").select("id").eq("tenant_id", ctx.tenantId);
    if (error) throw error;
    const rows = (await this.live(ctx, ((all ?? []) as Array<{ id: string }>).map((e) => e.id), month, clock.periodStartDay)).map((r) => ({ ...r, bank: null }));
    const { data: ins, error: iErr } = await ctx.db.from("payroll_input_sheets").insert({ tenant_id: ctx.tenantId, month, period_start: p.start, period_end: p.end, rows, employee_count: rows.length, note, finalized_by: ctx.userId }).select("id").single();
    if (iErr) throw iErr;
    await ctx.audit("payroll_input.finalized", "payroll_input_sheet", (ins as { id: string }).id, null, { month, employees: rows.length, warnings: rows.filter((r) => r.warnings.length).length }, note);
    return this.sheet(ctx, month);
  }

  /* CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt) — dữ liệu đúng như màn hình (bản đã chốt nếu có) */
  async exportCsv(ctx: AdminContext, m?: string, source?: string): Promise<{ filename: string; body: string }> {
    const s = await this.sheet(ctx, m, source);
    const esc = (v: unknown) => { const x = String(v ?? ""); return /[",\n;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const rates = [...new Set(s.rows.flatMap((r) => Object.keys(r.overtime)))].sort((a, b) => Number(a) - Number(b));
    const typeName: Record<EmploymentType, string> = { probation: "Thử việc", official: "Chính thức", contractor: "Cộng tác viên", intern: "Thực tập" };
    const head = ["Mã NV", "Họ tên", "Phòng ban", "Chức danh", "Email", "Ngày vào làm", "Ngày nghỉ việc", "Tình trạng", "Lương cơ bản", "Lương đóng BH", "Phụ cấp",
      "Công chuẩn", "Công thực tế", "Nghỉ phép có lương", "Nghỉ không lương", "Ngày lễ", ...rates.map((r) => `Giờ OT ${r}%`), "Số người phụ thuộc", "Mã số thuế",
      "Đoàn viên công đoàn", "Tạm ứng đã chi", "Ngân hàng", "Số tài khoản", "Chủ tài khoản", "Đổi trong kỳ", "Cảnh báo"];
    const lines = s.rows.map((r) => [r.employee.code, r.employee.fullName, r.employee.department, r.employee.position, r.employee.email, r.employee.hireDate, r.employee.terminationDate,
      typeName[r.employmentType], r.baseSalary, r.insuranceSalary ?? r.baseSalary, r.allowance, r.standard, r.credited, r.paidLeaveDays, r.unpaidLeaveDays, r.holidays,
      ...rates.map((x) => (r.overtime[x] ?? 0) / 60), r.dependents, r.taxCode, r.unionMember ? "Có" : "Không", r.advance, r.bank?.bankName, r.bank ? r.bank.accountNo ?? `•••• ${r.bank.last4}` : "", r.bank?.holder,
      r.segments.length > 1 ? r.segments.map((g) => `${g.from}→${g.to}: ${g.baseSalary ?? "—"} · ${typeName[g.employmentType]} · ${g.credited} công`).join(" | ") : "", r.warnings.join("; ")].map(esc).join(","));
    await ctx.audit("payroll_input.exported", "tenant", ctx.tenantId, null, { month: s.month, source: s.source, rows: s.rows.length });
    return { filename: `bang-luong-dau-vao-${s.month}${s.source === "live" ? "-tam" : ""}.csv`, body: "﻿" + [head.join(","), ...lines].join("\r\n") + "\r\n" };
  }
}
