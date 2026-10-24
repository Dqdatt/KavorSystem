/* Nghỉ phép (PILOT_RULEBOOK §7, §9): loại nghỉ của công ty, sổ phép năm dạng ledger, đơn nghỉ qua luồng duyệt.
   - Sổ phép: giao dịch cấp/tích lũy/thâm niên/phép tồn/hết hạn được bổ sung khi đọc sổ (idempotent nhờ source_key), theo quy định
     phép năm áp dụng cho nhân viên hôm nay (tra theo tầng). Giữ chỗ/trả/trừ phép do SQL làm cùng transaction với đơn.
   - Số ngày nghỉ = ngày làm việc theo ca trong khoảng (bỏ ngày nghỉ, ngày lễ); nửa ngày = 0,5.
   - Đơn nghỉ trên ngưỡng ngày (daysOver của luồng) hoặc dùng phép âm thì cần thêm bước HR. */
import { randomUUID } from "node:crypto";
import type {
  EmployeeLeave, LeaveBalance, LeaveBoard, LeaveCalendarDay, LeaveHalf, LeaveLedgerEntry, LeaveRow, LeaveTxKind, LeaveType, MyLeave, RequestItem, ResolvedRule,
} from "@kavor/contracts";
import type { EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, invalid, notFound, type AdminContext } from "../admin/context.js";
import { addDays, date, isDate, number, oneOf, req, type Body } from "../admin/validate.js";
import { PolicyIndex, loadPlacements, type Placement } from "../attendance/policy.js";
import { holidaysOf } from "../company/company.service.js";
import { datesBetween, isoWeekday, monthOf, periodOf } from "../timesheet/compute.js";
import type { RequestsService, Viewer } from "../timesheet/requests.service.js";
import type { TimesheetService } from "../timesheet/timesheet.service.js";

type Db = SupabaseGateway["admin"];
type Emp = { id: string; employee_code: string; full_name: string; hire_date: string; termination_date: string | null; user_id: string | null; employment_type: string };
type TypeRow = { id: string; code: string; name: string; paid: boolean; deducts_balance: boolean; max_days: number | null; attachment_from_days: number | null; description: string | null };
type TxRow = { id: string; kind: LeaveTxKind; amount: number; effective_on: string; expires_on: string | null; request_id: string | null; source_key: string; reason: string | null; created_by: string | null; created_at: string };
const EMP_COLS = "id, employee_code, full_name, hire_date, termination_date, user_id, employment_type";
const TYPE_COLS = "id, code, name, paid, deducts_balance, max_days, attachment_from_days, description";
const TX_COLS = "id, kind, amount, effective_on, expires_on, request_id, source_key, reason, created_by, created_at";
const HALVES: readonly LeaveHalf[] = ["full", "am", "pm"];

const r2 = (n: number) => Math.round(n * 100) / 100;
/* Làm tròn 0,5 ngày (định mức theo tháng/tỷ lệ) */
const half = (n: number) => Math.round(n * 2) / 2;
const lastDayOfMonth = (y: number, m: number) => addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
/* Số năm làm việc đủ tính tới một ngày */
function fullYears(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
}
const toType = (t: TypeRow): LeaveType => ({
  id: t.id, code: t.code, name: t.name, paid: t.paid, deductsBalance: t.deducts_balance,
  maxDays: t.max_days == null ? null : Number(t.max_days), attachmentFromDays: t.attachment_from_days == null ? null : Number(t.attachment_from_days), description: t.description,
});

export class LeaveService {
  constructor(private readonly sb: SupabaseGateway, private readonly timesheets: TimesheetService, private readonly requests: RequestsService) {}

  async types(db: Db, tenantId: string): Promise<TypeRow[]> {
    const { data, error } = await db.from("leave_types").select(TYPE_COLS).eq("tenant_id", tenantId).eq("active", true).order("sort");
    if (error) throw error;
    return (data ?? []) as TypeRow[];
  }

  /* ---------- Sổ phép ---------- */
  /* Sổ phép năm `year` của nhân viên: tạo sổ nếu chưa có, bổ sung giao dịch theo quy định rồi tính số dư.
     null: công ty chưa áp dụng quy định phép năm / chưa có loại nghỉ trừ phép / chưa vào làm trong năm. */
  async balance(db: Db, tenantId: string, emp: Emp, year: number, today: string, rule: ResolvedRule | undefined, al: TypeRow | undefined)
    : Promise<{ account: string; balance: LeaveBalance; tx: TxRow[] } | null> {
    if (!rule || !al || Number(emp.hire_date.slice(0, 4)) > year) return null;
    const c = rule.config as Record<string, number | boolean>;
    const annual = Number(c.annualDays ?? 12), monthly = c.accrualMonthly !== false, allowNegative = Number(c.allowNegativeDays ?? 0);
    const accrues = emp.employment_type !== "probation" || c.probationAccrues === true;
    const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
    const startMonth = Number(emp.hire_date.slice(0, 4)) === year ? Number(emp.hire_date.slice(5, 7)) : 1;
    const months = 13 - startMonth;
    const yearStart = `${year}-01-01`;
    const seniority = Number(c.seniorityYears ?? 0) > 0 ? Math.floor(Math.max(0, fullYears(emp.hire_date, yearStart)) / Number(c.seniorityYears)) * Number(c.seniorityBonusDays ?? 0) : 0;
    const yearEntitlement = accrues ? half((annual * months) / 12) + seniority : 0;

    await db.from("leave_accounts").upsert({ tenant_id: tenantId, employee_id: emp.id, leave_type_id: al.id, year }, { onConflict: "employee_id,leave_type_id,year", ignoreDuplicates: true });
    const { data: acc } = await db.from("leave_accounts").select("id").eq("employee_id", emp.id).eq("leave_type_id", al.id).eq("year", year).single();
    const account = (acc as { id: string }).id;
    const load = async () => {
      const { data, error } = await db.from("leave_transactions").select(TX_COLS).eq("account_id", account).order("effective_on").order("created_at");
      if (error) throw error;
      return ((data ?? []) as TxRow[]).map((t) => ({ ...t, amount: Number(t.amount) }));
    };
    let tx = await load();
    const has = new Set(tx.map((t) => t.source_key));
    const add: Array<Partial<TxRow> & { kind: LeaveTxKind; amount: number; effective_on: string; source_key: string }> = [];

    if (accrues && year <= ty) {
      if (monthly) {
        /* Tích lũy đầu mỗi tháng: lũy kế làm tròn 0,5 để đủ định mức vào tháng cuối */
        const last = year < ty ? 12 : tm;
        for (let m = startMonth, prev = 0; m <= last; m++) {
          const cum = half((annual * (m - startMonth + 1)) / 12), amt = r2(cum - prev); prev = cum;
          const key = `accrual:${year}-${String(m).padStart(2, "0")}`;
          if (amt > 0 && !has.has(key)) add.push({ kind: "accrual", amount: amt, effective_on: `${year}-${String(m).padStart(2, "0")}-01`, source_key: key, reason: `Tích lũy tháng ${m}/${year}` });
        }
      } else if (!has.has(`grant:${year}`)) {
        const amt = half((annual * months) / 12);
        if (amt > 0) add.push({ kind: "grant", amount: amt, effective_on: startMonth === 1 ? yearStart : emp.hire_date, source_key: `grant:${year}`, reason: `Phép năm ${year}` });
      }
      if (seniority > 0 && !has.has(`seniority:${year}`)) add.push({ kind: "grant", amount: seniority, effective_on: yearStart, source_key: `seniority:${year}`, reason: `Phép thâm niên (${fullYears(emp.hire_date, yearStart)} năm làm việc)` });
    }
    /* Phép tồn năm trước: chuyển tối đa N ngày, dùng tới hết tháng quy định của năm nay */
    if (year <= ty && !has.has(`carry:${year}`) && Number(c.carryOverMaxDays ?? 0) > 0) {
      const { data: prevAcc } = await db.from("leave_accounts").select("id").eq("employee_id", emp.id).eq("leave_type_id", al.id).eq("year", year - 1).maybeSingle();
      if (prevAcc) {
        const { data: prevTx } = await db.from("leave_transactions").select("amount").eq("account_id", (prevAcc as { id: string }).id);
        const left = ((prevTx ?? []) as Array<{ amount: number }>).reduce((n, t) => n + Number(t.amount), 0);
        const carry = Math.min(Math.max(0, half(left)), Number(c.carryOverMaxDays));
        if (carry > 0) add.push({ kind: "carry", amount: carry, effective_on: yearStart, expires_on: lastDayOfMonth(year, Number(c.carryOverExpiryMonth ?? 3)), source_key: `carry:${year}`, reason: `Phép tồn năm ${year - 1}` });
      }
    }
    if (add.length) {
      const { error } = await db.from("leave_transactions").upsert(add.map((a) => ({ tenant_id: tenantId, account_id: account, ...a })), { onConflict: "account_id,source_key", ignoreDuplicates: true });
      if (error) throw error;
      tx = await load();
    }
    /* Phép tồn hết hạn: phần chưa dùng tới ngày hết hạn (dùng phép tồn trước) */
    const expiries = [...new Set(tx.filter((t) => t.kind === "carry" && t.expires_on && t.expires_on < today).map((t) => t.expires_on!))].sort();
    const exp: typeof add = [];
    for (const e of expiries) {
      if (tx.some((t) => t.source_key === `expire:${e}`)) continue;
      const carried = tx.filter((t) => t.kind === "carry" && t.expires_on! <= e).reduce((n, t) => n + t.amount, 0);
      const usedBefore = -tx.filter((t) => t.kind === "consume" && t.effective_on <= e).reduce((n, t) => n + t.amount, 0);
      const expired = -tx.filter((t) => t.kind === "expire").reduce((n, t) => n + t.amount, 0) - exp.reduce((n, t) => n + t.amount, 0);
      const amt = r2(carried - usedBefore - expired);
      if (amt > 0) exp.push({ kind: "expire", amount: -amt, effective_on: addDays(e, 1), source_key: `expire:${e}`, reason: `Phép tồn hết hạn ${e.slice(8, 10)}/${e.slice(5, 7)}` });
    }
    if (exp.length) {
      const { error } = await db.from("leave_transactions").upsert(exp.map((a) => ({ tenant_id: tenantId, account_id: account, ...a })), { onConflict: "account_id,source_key", ignoreDuplicates: true });
      if (error) throw error;
      tx = await load();
    }

    const sum = (...k: LeaveTxKind[]) => r2(tx.filter((t) => k.includes(t.kind)).reduce((n, t) => n + t.amount, 0));
    const carryRow = tx.filter((t) => t.kind === "carry").sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""))[0];
    return {
      account, tx,
      balance: {
        year, typeName: al.name, granted: sum("grant", "accrual"), carry: sum("carry"), carryExpiresOn: carryRow?.expires_on ?? null, expired: -sum("expire"),
        adjusted: sum("adjust"), used: -sum("consume"), pending: -sum("hold", "release"), available: sum(...(Object.keys(KIND_ORDER) as LeaveTxKind[])),
        yearEntitlement, accrualMonthly: monthly, allowNegative, policy: { name: rule.name, versionNo: rule.versionNo },
      },
    };
  }

  /* ---------- Lịch làm việc (để đếm ngày nghỉ) ---------- */
  private async calendar(db: Db, tenantId: string, emp: Emp, placement: Placement | null, index: PolicyIndex, from: string, to: string) {
    const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
    const holidays = new Map((await Promise.all(years.map((y) => holidaysOf(db, tenantId, Number(y))))).flat().map((h) => [h.date, h.name]));
    return datesBetween(from, to).map((d) => {
      const shift = index.resolve(emp.id, placement, d).shift;
      const workDays = shift?.workDays ?? [1, 2, 3, 4, 5];
      const employed = d >= emp.hire_date && (!emp.termination_date || d <= emp.termination_date);
      return { date: d, weekday: isoWeekday(d), workday: employed && !!shift && workDays.includes(isoWeekday(d)) && !holidays.has(d), holiday: holidays.get(d) ?? null };
    });
  }

  /* Buổi đã có đơn nghỉ đang chờ/đã duyệt */
  private async taken(db: Db, empId: string, from: string, to: string) {
    const { data } = await db.from("leave_days").select("leave_date, half, requests!inner(status)").eq("employee_id", empId).gte("leave_date", from).lte("leave_date", to).in("requests.status", ["pending", "approved"]);
    const out = new Map<string, LeaveHalf>();
    for (const d of (data ?? []) as unknown as Array<{ leave_date: string; half: LeaveHalf }>) out.set(d.leave_date, out.has(d.leave_date) ? "full" : d.half);
    return out;
  }

  private async emp(db: Db, tenantId: string, id: string): Promise<Emp> {
    const { data } = await db.from("employees").select(EMP_COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (!data) throw notFound("nhân viên");
    return data as Emp;
  }

  /* ---------- Nhân viên (mobile) ---------- */
  async myLeave(me: EmployeeRow): Promise<MyLeave> {
    const db = this.sb.admin;
    const clock = await this.timesheets.tenantClock(db, me.tenant_id);
    const emp = await this.emp(db, me.tenant_id, me.id);
    const [index, placements, types] = await Promise.all([PolicyIndex.load(db, me.tenant_id), loadPlacements(db, me.tenant_id, clock.today, [emp.id]), this.types(db, me.tenant_id)]);
    const placement = placements.get(emp.id) ?? null;
    const rule = index.resolveRules(emp.id, placement, clock.today).leave;
    const b = await this.balance(db, me.tenant_id, emp, Number(clock.today.slice(0, 4)), clock.today, rule, types.find((t) => t.deducts_balance));
    const from = periodOf(clock.currentMonth, clock.periodStartDay).start, to = addDays(clock.today, 60);
    const [cal, taken, wf] = await Promise.all([this.calendar(db, me.tenant_id, emp, placement, index, from, to), this.taken(db, emp.id, from, to), this.requests.workflowFor(db, me.tenant_id, "leave", clock.today)]);
    const calendar: LeaveCalendarDay[] = cal.map((d) => ({ ...d, taken: taken.get(d.date) ?? null }));
    let approver: string | null = null, hrOverDays: number | null = null;
    if (wf) {
      const first = this.requests.planSteps(wf.steps, emp.id, placement?.manager_employee_id ?? null).find((t) => t.status === "pending");
      approver = first?.assigneeEmployeeId ? await this.nameOf(db, first.assigneeEmployeeId) : first ? "Phòng Nhân sự" : null;
      hrOverDays = wf.steps.find((s) => s.resolver === "hr")?.daysOver ?? null;
    }
    return { today: clock.today, balance: b?.balance ?? null, types: types.map(toType), calendar, approver, hrOverDays };
  }

  private async nameOf(db: Db, id: string) {
    const { data } = await db.from("employees").select("full_name").eq("id", id).maybeSingle();
    return (data as { full_name: string } | null)?.full_name ?? null;
  }

  async createLeave(me: EmployeeRow, b: Body, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    const clock = await this.timesheets.tenantClock(db, me.tenant_id);
    const emp = await this.emp(db, me.tenant_id, me.id);
    const types = await this.types(db, me.tenant_id);
    const code = req(b, "leaveType", { max: 20, hint: "chọn loại nghỉ" });
    const type = types.find((t) => t.code === code);
    if (!type) throw invalid("Loại nghỉ không có hoặc đã ngừng áp dụng.");
    const from = date(b, "from")!, to = date(b, "to", true) ?? from;
    const halfDay = oneOf(b, "half", HALVES, true) ?? "full";
    const reason = req(b, "reason", { min: 3, max: 500, hint: "ghi lý do nghỉ" });
    if (to < from) throw invalid("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
    if (halfDay !== "full" && to !== from) throw invalid("Nghỉ nửa ngày chỉ áp dụng cho một ngày.");
    if (from.slice(0, 4) !== to.slice(0, 4)) throw invalid("Đơn nghỉ không vượt qua năm mới — tách thành hai đơn.");
    if (datesBetween(from, to).length > 60) throw invalid("Mỗi đơn nghỉ tối đa 60 ngày.");
    if (from < addDays(clock.today, -45)) throw invalid("Chỉ xin nghỉ bù cho ngày trong vòng 45 ngày qua.");
    if (to > addDays(clock.today, 365)) throw invalid("Chỉ xin nghỉ trước tối đa 1 năm.");

    const [index, placements] = await Promise.all([PolicyIndex.load(db, me.tenant_id), loadPlacements(db, me.tenant_id, clock.today, [emp.id])]);
    const placement = placements.get(emp.id) ?? null;
    const cal = await this.calendar(db, me.tenant_id, emp, placement, index, from, to);
    const days = cal.filter((d) => d.workday).map((d) => ({ date: d.date, half: halfDay, portion: halfDay === "full" ? 1 : 0.5 }));
    if (!days.length) throw invalid("Khoảng ngày đã chọn không có ngày làm việc nào (ngày nghỉ, ngày lễ không cần xin nghỉ).");
    const total = days.reduce((n, d) => n + d.portion, 0);
    if (type.max_days != null && total > Number(type.max_days)) throw invalid(`${type.name} tối đa ${String(Number(type.max_days)).replace(".", ",")} ngày mỗi đơn.`);

    let account: string | null = null, forceHr = false;
    const rule = index.resolveRules(emp.id, placement, clock.today).leave;
    let snapshotBalance: LeaveBalance | null = null;
    if (type.deducts_balance) {
      const bal = await this.balance(db, me.tenant_id, emp, Number(from.slice(0, 4)), clock.today, rule, type);
      if (!bal) throw conflict("Công ty chưa áp dụng quy định phép năm cho bạn. Liên hệ phòng Nhân sự.");
      const after = r2(bal.balance.available - total);
      if (after < -bal.balance.allowNegative) {
        throw conflict(`Không đủ phép: còn ${fmt(bal.balance.available)} ngày, đơn cần ${fmt(total)} ngày${bal.balance.allowNegative ? ` (được nghỉ trước tối đa ${fmt(bal.balance.allowNegative)} ngày)` : ""}.`);
      }
      account = bal.account; forceHr = after < 0; snapshotBalance = bal.balance;
    }

    const wf = await this.requests.workflowFor(db, me.tenant_id, "leave", clock.today);
    if (!wf) throw conflict("Công ty chưa cấu hình luồng duyệt đơn nghỉ.");
    const tasks = this.requests.planSteps(wf.steps, emp.id, placement?.manager_employee_id ?? null, { days: total, forceHr });
    const payload = { leaveType: type.code, leaveTypeName: type.name, from, to, half: halfDay, days: total, reason };
    const { data, error } = await db.rpc("create_leave_request", {
      p_tenant: me.tenant_id, p_employee: emp.id, p_user: me.user_id, p_workflow_version: wf.id, p_period_start: periodOf(monthOf(from, clock.periodStartDay), clock.periodStartDay).start,
      p_leave_type: type.id, p_payload: payload,
      p_snapshot: { leaveType: toType(type), leave: rule && { policyId: rule.policyId, versionNo: rule.versionNo, config: rule.config, source: rule.source }, balance: snapshotBalance, forceHr,
        attachmentRequired: type.attachment_from_days != null && total >= Number(type.attachment_from_days), workflow: { versionNo: wf.version_no, steps: wf.steps } },
      p_tasks: tasks, p_days: days, p_account: account, p_total: total,
    });
    if (error?.message?.includes("LEAVE_OVERLAP")) throw conflict("Đã có đơn nghỉ đang chờ hoặc đã duyệt trùng ngày này.");
    if (error?.message?.includes("PERIOD_LOCKED")) throw conflict("Kỳ công của ngày nghỉ đã khóa. Liên hệ phòng Nhân sự.");
    if (error) throw error;
    const r = data as { id: string; no: string };
    const v: Viewer = { userId: me.user_id ?? "", employeeId: emp.id, tenantId: me.tenant_id, correlationId };
    await db.from("audit_logs").insert({ tenant_id: me.tenant_id, actor_user_id: me.user_id, actor_type: "user", action: "request.submitted", resource_type: "request", resource_id: r.id,
      after_data: { no: r.no, type: "leave", ...payload }, correlation_id: correlationId });
    return (await this.requests.items(db, v, [r.id]))[0]!;
  }

  /* ---------- Web HR ---------- */
  async board(ctx: AdminContext, yearRaw?: string): Promise<LeaveBoard> {
    ctx.require("leave.read");
    const db = ctx.db;
    const clock = await this.timesheets.tenantClock(db, ctx.tenantId);
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : Number(clock.today.slice(0, 4));
    const ids = [...await ctx.scopedEmployeeIds("leave.read")];
    const [index, placements, types, emps, deps] = await Promise.all([
      PolicyIndex.load(db, ctx.tenantId), loadPlacements(db, ctx.tenantId, clock.today, ids), this.types(db, ctx.tenantId),
      ids.length ? db.from("employees").select(EMP_COLS).eq("tenant_id", ctx.tenantId).in("id", ids).neq("status", "terminated").order("employee_code") : Promise.resolve({ data: [] }),
      this.departments(db, ctx.tenantId, ids),
    ]);
    const al = types.find((t) => t.deducts_balance);
    const rows: LeaveRow[] = [];
    for (const e of (emps.data ?? []) as Emp[]) {
      const placement = placements.get(e.id) ?? null;
      const b = await this.balance(db, ctx.tenantId, e, year, clock.today, index.resolveRules(e.id, placement, clock.today).leave, al);
      rows.push({ employee: { id: e.id, code: e.employee_code, fullName: e.full_name, department: deps.get(e.id) ?? null, hireDate: e.hire_date }, balance: b?.balance ?? null });
    }
    const bs = rows.map((r) => r.balance).filter((x): x is LeaveBalance => !!x);
    const expiring = bs.filter((x) => x.carryExpiresOn && x.carryExpiresOn >= clock.today);
    const expiringOn = expiring.map((x) => x.carryExpiresOn!).sort()[0] ?? null;
    return {
      year, rows, types: types.map(toType), canManage: ctx.can("leave.manage"),
      metrics: {
        available: r2(bs.reduce((n, x) => n + x.available, 0)), used: r2(bs.reduce((n, x) => n + x.used, 0)), pending: r2(bs.reduce((n, x) => n + x.pending, 0)),
        /* Phép tồn còn hạn chưa dùng (ước tính: phép tồn trừ phần đã nghỉ, không quá số dư) */
        expiringCarry: r2(expiring.reduce((n, x) => n + Math.max(0, Math.min(x.carry - x.used, x.available)), 0)), expiringOn,
      },
    };
  }

  private async departments(db: Db, tenantId: string, ids: string[]) {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const { data } = await db.from("employee_assignments").select("employee_id, effective_to, departments(name)").eq("tenant_id", tenantId).eq("is_primary", true).in("employee_id", ids).order("effective_from", { ascending: false });
    for (const d of (data ?? []) as unknown as Array<{ employee_id: string; effective_to: string | null; departments: { name: string } | null }>) if (!d.effective_to && !out.has(d.employee_id)) out.set(d.employee_id, d.departments?.name ?? "");
    return out;
  }

  async employee(ctx: AdminContext, id: string, yearRaw?: string): Promise<EmployeeLeave> {
    await ctx.requireEmployee("leave.read", id);
    const db = ctx.db;
    const clock = await this.timesheets.tenantClock(db, ctx.tenantId);
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : Number(clock.today.slice(0, 4));
    const emp = await this.emp(db, ctx.tenantId, id);
    const [index, placements, types, deps] = await Promise.all([PolicyIndex.load(db, ctx.tenantId), loadPlacements(db, ctx.tenantId, clock.today, [id]), this.types(db, ctx.tenantId), this.departments(db, ctx.tenantId, [id])]);
    const b = await this.balance(db, ctx.tenantId, emp, year, clock.today, index.resolveRules(id, placements.get(id) ?? null, clock.today).leave, types.find((t) => t.deducts_balance));
    const tx = b?.tx ?? [];
    const reqIds = [...new Set(tx.map((t) => t.request_id).filter((x): x is string => !!x))];
    const [{ data: reqNos }, { data: actors }, { data: mine }] = await Promise.all([
      reqIds.length ? db.from("requests").select("id, request_no").in("id", reqIds) : Promise.resolve({ data: [] }),
      db.from("employees").select("user_id, full_name").eq("tenant_id", ctx.tenantId).in("user_id", [...new Set(tx.map((t) => t.created_by).filter((x): x is string => !!x))]),
      db.from("requests").select("id").eq("tenant_id", ctx.tenantId).eq("request_type", "leave").eq("requester_employee_id", id).gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`).order("submitted_at", { ascending: false }),
    ]);
    const no = new Map(((reqNos ?? []) as Array<{ id: string; request_no: string }>).map((r) => [r.id, r.request_no]));
    const who = new Map(((actors ?? []) as Array<{ user_id: string; full_name: string }>).map((a) => [a.user_id, a.full_name]));
    const ledger: LeaveLedgerEntry[] = [...tx].reverse().map((t) => ({
      id: t.id, kind: t.kind, amount: t.amount, effectiveOn: t.effective_on, expiresOn: t.expires_on, requestNo: t.request_id ? no.get(t.request_id) ?? null : null,
      reason: t.reason, createdBy: t.created_by ? who.get(t.created_by) ?? "—" : null, createdAt: t.created_at,
    }));
    const requests = await this.requests.items(db, { userId: ctx.userId, employeeId: ctx.actor?.id ?? null, tenantId: ctx.tenantId, correlationId: ctx.correlationId }, ((mine ?? []) as Array<{ id: string }>).map((r) => r.id));
    return { employee: { id: emp.id, code: emp.employee_code, fullName: emp.full_name, department: deps.get(id) ?? null, hireDate: emp.hire_date }, year, balance: b?.balance ?? null, ledger, requests };
  }

  /* HR điều chỉnh sổ phép (+/−) hoặc nhập phép tồn năm trước kèm hạn dùng — có lý do, ghi audit */
  async adjust(ctx: AdminContext, id: string, b: Body): Promise<EmployeeLeave> {
    ctx.require("leave.manage");
    await ctx.requireEmployee("leave.manage", id);
    const db = ctx.db;
    const clock = await this.timesheets.tenantClock(db, ctx.tenantId);
    const year = number(b, "year", 2000, 2100, { integer: true, optional: true }) ?? Number(clock.today.slice(0, 4));
    const amount = number(b, "amount", -60, 60)!;
    if (!amount || Math.round(amount * 2) !== amount * 2) throw invalid("Số ngày điều chỉnh khác 0, theo bước 0,5 ngày.");
    const reason = req(b, "reason", { min: 5, max: 300, hint: "ghi lý do điều chỉnh" });
    const carry = b?.carry === true;
    let expiresOn: string | null = null;
    if (carry) {
      if (amount <= 0) throw invalid("Phép tồn phải là số ngày dương.");
      expiresOn = date(b, "expiresOn")!;
      if (!isDate(expiresOn) || expiresOn.slice(0, 4) !== String(year)) throw invalid(`Hạn dùng phép tồn phải trong năm ${year}.`);
    }
    const emp = await this.emp(db, ctx.tenantId, id);
    const [index, placements, types] = await Promise.all([PolicyIndex.load(db, ctx.tenantId), loadPlacements(db, ctx.tenantId, clock.today, [id]), this.types(db, ctx.tenantId)]);
    const bal = await this.balance(db, ctx.tenantId, emp, year, clock.today, index.resolveRules(id, placements.get(id) ?? null, clock.today).leave, types.find((t) => t.deducts_balance));
    if (!bal) throw conflict("Nhân viên chưa có sổ phép năm này (chưa áp dụng quy định phép năm hoặc chưa vào làm).");
    const key = `${carry ? "carry-import" : "adjust"}:${randomUUID()}`;
    const row = { tenant_id: ctx.tenantId, account_id: bal.account, kind: carry ? "carry" : "adjust", amount, effective_on: clock.today < `${year}-01-01` ? `${year}-01-01` : clock.today.slice(0, 4) === String(year) ? clock.today : `${year}-12-31`,
      expires_on: expiresOn, source_key: key, reason, created_by: ctx.userId };
    const { data, error } = await db.from("leave_transactions").insert(row).select("id").single();
    if (error) throw error;
    /* Nhật ký gắn với nhân viên để hiện trong hồ sơ; mã giao dịch phép nằm trong nội dung */
    await ctx.audit(carry ? "leave.carry_imported" : "leave.adjusted", "employee_leave", id, { available: bal.balance.available }, { year, amount, expires_on: expiresOn, transaction_id: (data as { id: string }).id }, reason);
    return this.employee(ctx, id, String(year));
  }
}

/* Thứ tự hiển thị các loại giao dịch; cũng là danh sách mọi loại khi cộng số dư */
const KIND_ORDER: Record<LeaveTxKind, number> = { grant: 1, accrual: 2, carry: 3, adjust: 4, hold: 5, release: 6, consume: 7, expire: 8 };
const fmt = (n: number) => String(r2(n)).replace(".", ",");
