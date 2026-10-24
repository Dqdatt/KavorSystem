/* Làm thêm giờ (PILOT_RULEBOOK §8, US-043; BLLĐ 2019 Điều 98, 107; NĐ 145/2020 Điều 60–62):
   - Quy định OT tra theo tầng (kind 'overtime'): hệ số theo loại ngày, giới hạn giờ/ngày làm việc, /tháng, /năm, hạn đăng ký sau khi làm.
   - Đơn OT: một khoảng giờ trong một ngày, bội số 30 phút; ngày làm việc không được trùng giờ ca chính; ngày nghỉ/lễ tối đa 12 giờ;
     giờ đang chờ + đã duyệt tính vào giới hạn (tháng/năm dương lịch). Hệ số chụp lại lúc gửi.
   - Web HR: tổng hợp OT theo tháng trong phạm vi overtime.read. Payroll đọc overtime_entries đã duyệt (module sau). */
import type {
  MyOvertime, OvertimeBoard, OvertimeDay, OvertimeDayKind, OvertimePolicy, OvertimeRow, RequestItem, RequestStatus, ResolvedRule,
} from "@kavor/contracts";
import type { EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, invalid, type AdminContext } from "../admin/context.js";
import { addDays, date, req, time, type Body } from "../admin/validate.js";
import { PolicyIndex, loadPlacements, minutesOf, type Placement } from "../attendance/policy.js";
import { holidaysOf } from "../company/company.service.js";
import { datesBetween, isoWeekday, monthOf, periodOf } from "../timesheet/compute.js";
import type { RequestsService, Viewer } from "../timesheet/requests.service.js";
import type { TimesheetService } from "../timesheet/timesheet.service.js";

type Db = SupabaseGateway["admin"];
type EntryRow = { employee_id: string; request_id: string; work_date: string; start_time: string; end_time: string; minutes: number; day_kind: OvertimeDayKind; requests: { request_no: string; status: RequestStatus } };
const ENTRY_COLS = "employee_id, request_id, work_date, start_time, end_time, minutes, day_kind, requests!inner(request_no, status)";
const ACTIVE: RequestStatus[] = ["pending", "approved"];
/* Ngày nghỉ/lễ: tổng giờ làm trong ngày không quá 12 (NĐ 145/2020 Điều 60) */
const OFF_DAY_LIMIT_MIN = 12 * 60;
const AHEAD_DAYS = 30;
const r1 = (n: number) => Math.round(n * 10) / 10;
const hours = (min: number) => r1(min / 60);
const fmt = (n: number) => String(r1(n)).replace(".", ",");

export function overtimePolicy(rule: ResolvedRule | undefined): OvertimePolicy | null {
  if (!rule) return null;
  const c = rule.config as Record<string, number>;
  return {
    name: rule.name, versionNo: rule.versionNo,
    weekdayRate: Number(c.weekdayRate ?? 150), weekendRate: Number(c.weekendRate ?? 200), holidayRate: Number(c.holidayRate ?? 300),
    dailyLimitHours: Number(c.dailyLimitHours ?? 4), monthlyLimitHours: Number(c.monthlyLimitHours ?? 40), yearlyLimitHours: Number(c.yearlyLimitHours ?? 200),
    submitAfterDays: Number(c.submitAfterDays ?? 1),
  };
}
const rateOf = (p: OvertimePolicy, k: OvertimeDayKind) => (k === "holiday" ? p.holidayRate : k === "weekend" ? p.weekendRate : p.weekdayRate);

export class OvertimeService {
  constructor(private readonly sb: SupabaseGateway, private readonly timesheets: TimesheetService, private readonly requests: RequestsService) {}

  /* Loại ngày + ca chính của các ngày trong khoảng */
  private async days(db: Db, tenantId: string, empId: string, placement: Placement | null, index: PolicyIndex, from: string, to: string) {
    const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
    const holidays = new Map((await Promise.all(years.map((y) => holidaysOf(db, tenantId, Number(y))))).flat().map((h) => [h.date, h.name]));
    return datesBetween(from, to).map((d) => {
      const shift = index.resolve(empId, placement, d).shift;
      const workday = !!shift && (shift.workDays ?? [1, 2, 3, 4, 5]).includes(isoWeekday(d));
      const kind: OvertimeDayKind = holidays.has(d) ? "holiday" : workday ? "workday" : "weekend";
      return { date: d, weekday: isoWeekday(d), dayKind: kind, holiday: holidays.get(d) ?? null, shift: kind === "workday" && shift ? { name: shift.name, start: shift.start, end: shift.end } : null };
    });
  }

  private async entries(db: Db, tenantId: string, empIds: string[], from: string, to: string): Promise<EntryRow[]> {
    if (!empIds.length) return [];
    const { data, error } = await db.from("overtime_entries").select(ENTRY_COLS).eq("tenant_id", tenantId).in("employee_id", empIds).gte("work_date", from).lte("work_date", to).in("requests.status", ACTIVE);
    if (error) throw error;
    return (data ?? []) as unknown as EntryRow[];
  }

  /* Giờ đã duyệt + đang chờ trong tháng/năm dương lịch của một ngày */
  private async usage(db: Db, tenantId: string, empId: string, day: string) {
    const year = Number(day.slice(0, 4)), month = day.slice(0, 7);
    const rows = await this.entries(db, tenantId, [empId], `${year}-01-01`, `${year}-12-31`);
    const inMonth = rows.filter((r) => r.work_date.startsWith(month));
    return {
      rows,
      usage: { month, monthHours: hours(inMonth.reduce((n, r) => n + r.minutes, 0)), monthApproved: hours(inMonth.filter((r) => r.requests.status === "approved").reduce((n, r) => n + r.minutes, 0)),
        year, yearHours: hours(rows.reduce((n, r) => n + r.minutes, 0)) },
    };
  }

  /* ---------- Nhân viên (mobile) ---------- */
  async myOvertime(me: EmployeeRow): Promise<MyOvertime> {
    const db = this.sb.admin;
    const clock = await this.timesheets.tenantClock(db, me.tenant_id);
    const [index, placements] = await Promise.all([PolicyIndex.load(db, me.tenant_id), loadPlacements(db, me.tenant_id, clock.today, [me.id])]);
    const placement = placements.get(me.id) ?? null;
    const policy = overtimePolicy(index.resolveRules(me.id, placement, clock.today).overtime);
    const from = addDays(clock.today, -(policy?.submitAfterDays ?? 1)), to = addDays(clock.today, AHEAD_DAYS);
    const [days, booked, { usage }, wf] = await Promise.all([
      this.days(db, me.tenant_id, me.id, placement, index, from, to), this.entries(db, me.tenant_id, [me.id], from, to), this.usage(db, me.tenant_id, me.id, clock.today),
      this.requests.workflowFor(db, me.tenant_id, "overtime", clock.today),
    ]);
    let approver: string | null = null;
    if (wf) {
      const first = this.requests.planSteps(wf.steps, me.id, placement?.manager_employee_id ?? null).find((t) => t.status === "pending");
      if (first?.assigneeEmployeeId) {
        const { data } = await db.from("employees").select("full_name").eq("id", first.assigneeEmployeeId).maybeSingle();
        approver = (data as { full_name: string } | null)?.full_name ?? null;
      } else if (first) approver = "Phòng Nhân sự";
    }
    const out: OvertimeDay[] = days.map((d) => ({
      ...d, booked: booked.filter((b) => b.work_date === d.date).map((b) => ({ start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5), status: b.requests.status, no: b.requests.request_no })),
    }));
    return { today: clock.today, policy, days: out, usage, approver };
  }

  async createOvertime(me: EmployeeRow, b: Body, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    const clock = await this.timesheets.tenantClock(db, me.tenant_id);
    const day = date(b, "date")!, start = time(b, "start")!, end = time(b, "end")!;
    const reason = req(b, "reason", { min: 3, max: 500, hint: "ghi công việc làm thêm" });
    const s = minutesOf(start), e = minutesOf(end), minutes = e - s;
    if (minutes <= 0) throw invalid("Giờ kết thúc phải sau giờ bắt đầu (OT qua nửa đêm: tách thành hai đơn).");
    if (minutes % 30 || s % 30) throw invalid("Giờ làm thêm theo bước 30 phút (ví dụ 17:30–19:00).");

    const [index, placements, emp] = await Promise.all([
      PolicyIndex.load(db, me.tenant_id), loadPlacements(db, me.tenant_id, clock.today, [me.id]),
      db.from("employees").select("hire_date, termination_date").eq("id", me.id).single(),
    ]);
    const placement = placements.get(me.id) ?? null;
    /* Hệ số + giới hạn theo quy định hiệu lực vào ngày làm thêm (ADR 0001: tra theo ngày); ngày trước phiên bản đầu tiên
       (vd OT hôm qua khi quy định mới áp dụng hôm nay) dùng phiên bản hiện hành */
    const rule = index.resolveRules(me.id, placement, day).overtime ?? index.resolveRules(me.id, placement, clock.today).overtime;
    const policy = overtimePolicy(rule);
    if (!policy) throw conflict("Công ty chưa áp dụng quy định làm thêm giờ cho bạn vào ngày này. Liên hệ phòng Nhân sự.");
    if (day < addDays(clock.today, -policy.submitAfterDays)) throw invalid(policy.submitAfterDays ? `Chỉ đăng ký bù OT trong vòng ${policy.submitAfterDays} ngày sau khi làm.` : "Phải đăng ký OT trước khi làm.");
    if (day > addDays(clock.today, AHEAD_DAYS)) throw invalid(`Chỉ đăng ký trước tối đa ${AHEAD_DAYS} ngày.`);
    const e0 = emp.data as { hire_date: string; termination_date: string | null };
    if (day < e0.hire_date || (e0.termination_date && day > e0.termination_date)) throw invalid("Ngày này bạn chưa/không còn làm việc tại công ty.");

    const info = (await this.days(db, me.tenant_id, me.id, placement, index, day, day))[0]!;
    if (info.shift && s < minutesOf(info.shift.end) && e > minutesOf(info.shift.start)) throw invalid(`Trùng giờ ca chính (${info.shift.name} ${info.shift.start}–${info.shift.end}). OT là giờ ngoài ca.`);
    const { rows, usage } = await this.usage(db, me.tenant_id, me.id, day);
    const sameDay = rows.filter((r) => r.work_date === day).reduce((n, r) => n + r.minutes, 0);
    const dayLimit = info.dayKind === "workday" ? policy.dailyLimitHours * 60 : OFF_DAY_LIMIT_MIN;
    if (sameDay + minutes > dayLimit) throw conflict(`Vượt giới hạn ${fmt(dayLimit / 60)} giờ làm thêm trong ${info.dayKind === "workday" ? "một ngày làm việc" : "một ngày nghỉ"} (đã đăng ký ${fmt(sameDay / 60)} giờ).`);
    const h = minutes / 60;
    if (usage.monthHours + h > policy.monthlyLimitHours) throw conflict(`Vượt giới hạn ${fmt(policy.monthlyLimitHours)} giờ làm thêm mỗi tháng (đã đăng ký ${fmt(usage.monthHours)} giờ trong tháng ${Number(day.slice(5, 7))}).`);
    if (usage.yearHours + h > policy.yearlyLimitHours) throw conflict(`Vượt giới hạn ${fmt(policy.yearlyLimitHours)} giờ làm thêm mỗi năm (đã đăng ký ${fmt(usage.yearHours)} giờ).`);

    const wf = await this.requests.workflowFor(db, me.tenant_id, "overtime", clock.today);
    if (!wf) throw conflict("Công ty chưa cấu hình luồng duyệt làm thêm giờ.");
    const tasks = this.requests.planSteps(wf.steps, me.id, placement?.manager_employee_id ?? null);
    const rate = rateOf(policy, info.dayKind);
    const payload = { date: day, start, end, hours: r1(h), dayKind: info.dayKind, ratePercent: rate, reason };
    const { data, error } = await db.rpc("create_overtime_request", {
      p_tenant: me.tenant_id, p_employee: me.id, p_user: me.user_id, p_workflow_version: wf.id,
      p_period_start: periodOf(monthOf(day, clock.periodStartDay), clock.periodStartDay).start, p_payload: payload,
      p_snapshot: { overtime: rule && { policyId: rule.policyId, versionNo: rule.versionNo, config: rule.config, source: rule.source }, day: info, usage, workflow: { versionNo: wf.version_no, steps: wf.steps } },
      p_tasks: tasks, p_entry: { date: day, start, end, minutes, dayKind: info.dayKind, ratePercent: rate },
    });
    if (error?.message?.includes("OVERTIME_OVERLAP")) throw conflict("Trùng giờ với một đơn làm thêm khác đang chờ hoặc đã duyệt.");
    if (error?.message?.includes("PERIOD_LOCKED")) throw conflict("Kỳ công của ngày này đã khóa. Liên hệ phòng Nhân sự.");
    if (error) throw error;
    const r = data as { id: string; no: string };
    await db.from("audit_logs").insert({ tenant_id: me.tenant_id, actor_user_id: me.user_id, actor_type: "user", action: "request.submitted", resource_type: "request", resource_id: r.id,
      after_data: { no: r.no, type: "overtime", ...payload }, correlation_id: correlationId });
    const v: Viewer = { userId: me.user_id ?? "", employeeId: me.id, tenantId: me.tenant_id, correlationId };
    return (await this.requests.items(db, v, [r.id]))[0]!;
  }

  /* ---------- Web HR ---------- */
  async board(ctx: AdminContext, monthRaw?: string): Promise<OvertimeBoard> {
    ctx.require("overtime.read");
    const db = ctx.db;
    const clock = await this.timesheets.tenantClock(db, ctx.tenantId);
    const month = monthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw) ? monthRaw : clock.today.slice(0, 7);
    const year = Number(month.slice(0, 4));
    const ids = [...await ctx.scopedEmployeeIds("overtime.read")];
    const [index, placements, emps, rows, deps] = await Promise.all([
      PolicyIndex.load(db, ctx.tenantId), loadPlacements(db, ctx.tenantId, clock.today, ids),
      ids.length ? db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", ids).neq("status", "terminated").order("employee_code") : Promise.resolve({ data: [] }),
      this.entries(db, ctx.tenantId, ids, `${year}-01-01`, `${year}-12-31`),
      db.from("employee_assignments").select("employee_id, effective_to, departments(name)").eq("tenant_id", ctx.tenantId).eq("is_primary", true).in("employee_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).order("effective_from", { ascending: false }),
    ]);
    const dept = new Map<string, string>();
    for (const d of (deps.data ?? []) as unknown as Array<{ employee_id: string; effective_to: string | null; departments: { name: string } | null }>) if (!d.effective_to && !dept.has(d.employee_id)) dept.set(d.employee_id, d.departments?.name ?? "");
    const out: OvertimeRow[] = [];
    for (const e of (emps.data ?? []) as Array<{ id: string; employee_code: string; full_name: string }>) {
      const mine = rows.filter((r) => r.employee_id === e.id), inMonth = mine.filter((r) => r.work_date.startsWith(month));
      if (!mine.length) continue;
      const approved = inMonth.filter((r) => r.requests.status === "approved");
      const byKind = { workday: 0, weekend: 0, holiday: 0 } as Record<OvertimeDayKind, number>;
      for (const r of approved) byKind[r.day_kind] = r1(byKind[r.day_kind] + r.minutes / 60);
      const policy = overtimePolicy(index.resolveRules(e.id, placements.get(e.id) ?? null, clock.today).overtime);
      out.push({
        employee: { id: e.id, code: e.employee_code, fullName: e.full_name, department: dept.get(e.id) || null },
        approvedHours: hours(approved.reduce((n, r) => n + r.minutes, 0)), pendingHours: hours(inMonth.filter((r) => r.requests.status === "pending").reduce((n, r) => n + r.minutes, 0)),
        yearHours: hours(mine.reduce((n, r) => n + r.minutes, 0)), monthLimit: policy?.monthlyLimitHours ?? null, byKind,
      });
    }
    const reqIds = [...new Set(rows.filter((r) => r.work_date.startsWith(month)).map((r) => r.request_id))];
    const requests = (await this.requests.items(db, { userId: ctx.userId, employeeId: ctx.actor?.id ?? null, tenantId: ctx.tenantId, correlationId: ctx.correlationId }, reqIds))
      .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || (b.workDate ?? "").localeCompare(a.workDate ?? ""));
    return {
      month, rows: out, requests,
      metrics: {
        approvedHours: r1(out.reduce((n, r) => n + r.approvedHours, 0)), pendingHours: r1(out.reduce((n, r) => n + r.pendingHours, 0)),
        employees: out.filter((r) => r.approvedHours + r.pendingHours > 0).length,
        nearLimit: out.filter((r) => r.monthLimit != null && r.monthLimit > 0 && r.approvedHours + r.pendingHours >= r.monthLimit * 0.8).length,
      },
    };
  }
}
