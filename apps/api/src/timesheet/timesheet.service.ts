/* Bảng công tháng: nạp chấm công, điều chỉnh, lịch lễ, ca theo tầng, giải trình, nghỉ phép đã duyệt của kỳ rồi tính bằng compute.ts.
   Kỳ đã khóa thì đọc ảnh chụp lúc khóa (không tính lại), để payroll và báo cáo khớp với thứ HR đã chốt. */
import type { ExplanationQuota, LeaveHalf, RequestStatus, TimesheetDay, TimesheetPeriod, TimesheetSummary } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { localParts } from "../attendance/attendance.service.js";
import { PolicyIndex, loadPlacements, type Placement } from "../attendance/policy.js";
import { addDays } from "../admin/validate.js";
import { periodStartDayOf } from "../admin/settings.service.js";
import { holidaysOf } from "../company/company.service.js";
import { computeDay, datesBetween, explainDeadline, isoWeekday, monthOf, periodOf, periodView, summarize, type DayAdjustment, type DayEvent, type DayLeave, type DayOvertimeEntry } from "./compute.js";

type Db = SupabaseGateway["admin"];
export type EmployeeLite = { id: string; employee_code: string; full_name: string; hire_date: string; termination_date: string | null; user_id: string | null };
export type EmployeeSheet = { employee: EmployeeLite; days: TimesheetDay[]; summary: TimesheetSummary; quota: ExplanationQuota | null; placement: Placement | null };
export type Sheets = { period: TimesheetPeriod; timezone: string; periodStartDay: number; today: string; sheets: Map<string, EmployeeSheet>; index: PolicyIndex; lock: LockRow | null };
export type LockRow = { id: string; period_start: string; period_end: string; locked_at: string; locked_by: string | null; reason: string | null; snapshot: { rows: Array<{ employeeId: string; days: TimesheetDay[]; summary: TimesheetSummary }> } };

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const EXPLAIN_COUNTED: RequestStatus[] = ["pending", "approved"];

export class TimesheetService {
  constructor(private readonly sb: SupabaseGateway) {}

  async tenantClock(db: Db, tenantId: string) {
    const [{ data: t }, { data: ts }] = await Promise.all([
      db.from("tenants").select("timezone").eq("id", tenantId).single(),
      db.from("tenant_settings").select("attendance_settings").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    const timezone = (t?.timezone as string) ?? "Asia/Ho_Chi_Minh";
    const periodStartDay = periodStartDayOf(ts?.attendance_settings);
    const today = localParts(new Date(), timezone).date;
    return { timezone, periodStartDay, today, currentMonth: monthOf(today, periodStartDay) };
  }

  async activeLock(db: Db, tenantId: string, periodStart: string): Promise<LockRow | null> {
    const { data } = await db.from("timesheet_locks").select("id, period_start, period_end, locked_at, locked_by, reason, snapshot").eq("tenant_id", tenantId).eq("period_start", periodStart).is("unlocked_at", null).maybeSingle();
    return (data as LockRow | null) ?? null;
  }

  /* Bảng công của các nhân viên trong một kỳ. fresh: bỏ qua ảnh chụp khóa (dùng khi tạo ảnh chụp) */
  async build(tenantId: string, employees: EmployeeLite[], month: string, opts: { fresh?: boolean; periodStartDay?: number } = {}): Promise<Sheets> {
    const db = this.sb.admin;
    const clock = await this.tenantClock(db, tenantId);
    // Payroll dùng kỳ đã chụp lúc mở, kể cả khi HR đổi cấu hình kỳ công sau đó.
    const periodStartDay = opts.periodStartDay ?? clock.periodStartDay;
    const { start, end } = periodOf(month, periodStartDay);
    const ids = employees.map((e) => e.id);
    const [index, placements, lock] = await Promise.all([
      PolicyIndex.load(db, tenantId),
      loadPlacements(db, tenantId, end < clock.today ? end : clock.today, ids),
      this.activeLock(db, tenantId, start),
    ]);
    const period = periodView(month, periodStartDay, lock);
    const sheets = new Map<string, EmployeeSheet>();
    if (!ids.length) return { ...clock, period, sheets, index, lock };

    const [events, adjustments, requests, holidayList, leaveDays, otRows] = await Promise.all([
      this.events(db, tenantId, ids, start, end, clock.timezone),
      this.adjustments(db, tenantId, ids, start, end),
      db.from("requests").select("id, request_no, requester_employee_id, work_date, status, submitted_at").eq("tenant_id", tenantId).eq("request_type", "explanation").in("requester_employee_id", ids).gte("work_date", start).lte("work_date", end).order("submitted_at"),
      Promise.all([...new Set([start.slice(0, 4), end.slice(0, 4)])].map((y) => holidaysOf(db, tenantId, Number(y)))).then((x) => x.flat()),
      db.from("leave_days").select("employee_id, leave_date, half, requests!inner(request_no, status), leave_types(name, paid)").eq("tenant_id", tenantId)
        .in("employee_id", ids).gte("leave_date", start).lte("leave_date", end).eq("requests.status", "approved"),
      db.from("overtime_entries").select("employee_id, work_date, start_time, end_time, minutes, rate_percent, requests!inner(request_no, status)").eq("tenant_id", tenantId)
        .in("employee_id", ids).gte("work_date", start).lte("work_date", end).eq("requests.status", "approved"),
    ]);
    const ots = new Map<string, DayOvertimeEntry[]>();
    for (const o of (otRows.data ?? []) as unknown as Array<{ employee_id: string; work_date: string; start_time: string; end_time: string; minutes: number; rate_percent: number; requests: { request_no: string } }>) {
      const k = `${o.employee_id}|${o.work_date}`;
      ots.set(k, [...(ots.get(k) ?? []), { start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5), minutes: o.minutes, ratePercent: o.rate_percent, requestNo: o.requests.request_no }]);
    }
    const leaves = new Map<string, DayLeave>();
    for (const l of (leaveDays.data ?? []) as unknown as Array<{ employee_id: string; leave_date: string; half: LeaveHalf; requests: { request_no: string }; leave_types: { name: string; paid: boolean } | null }>) {
      leaves.set(`${l.employee_id}|${l.leave_date}`, { typeName: l.leave_types?.name ?? "Nghỉ phép", half: l.half, paid: !!l.leave_types?.paid, requestNo: l.requests.request_no });
    }
    const holiday = new Map(holidayList.map((h) => [h.date, h.name]));
    const adj = adjustments;
    /* Mỗi ngày lấy đơn mới nhất; đơn đã hủy/từ chối vẫn hiện (để biết) nhưng không chặn giải trình lại */
    const reqs = new Map<string, { id: string; no: string; status: RequestStatus }>();
    const counted = new Map<string, number>();
    for (const r of (requests.data ?? []) as Array<{ id: string; request_no: string; requester_employee_id: string; work_date: string; status: RequestStatus }>) {
      const k = `${r.requester_employee_id}|${r.work_date}`, prev = reqs.get(k);
      if (!prev || EXPLAIN_COUNTED.includes(r.status) || !EXPLAIN_COUNTED.includes(prev.status)) reqs.set(k, { id: r.id, no: r.request_no, status: r.status });
      if (EXPLAIN_COUNTED.includes(r.status)) counted.set(r.requester_employee_id, (counted.get(r.requester_employee_id) ?? 0) + 1);
    }

    const dates = datesBetween(start, end);
    for (const emp of employees) {
      const placement = placements.get(emp.id) ?? null;
      const snap = !opts.fresh && lock ? lock.snapshot.rows.find((r) => r.employeeId === emp.id) : undefined;
      const rule = index.resolveRules(emp.id, placement, clock.today).explanation;
      const limit = rule ? Number(rule.config.monthlyLimit ?? 0) : 0, deadlineDays = rule ? Number(rule.config.deadlineDays ?? 3) : 3;
      const used = counted.get(emp.id) ?? 0;
      const quota: ExplanationQuota | null = rule ? { limit, used, left: Math.max(0, limit - used), deadlineDays } : null;
      if (snap) { sheets.set(emp.id, { employee: emp, ...fromSnapshot(snap), quota, placement }); continue; }
      const shiftAt = (d: string) => {
        const s = index.resolve(emp.id, placement, d).shift;
        return s ? { ...s, workDays: s.workDays ?? [1, 2, 3, 4, 5] } : null;
      };
      const isWorkday = (d: string) => { const s = shiftAt(d); return !!s && s.workDays.includes(isoWeekday(d)) && !holiday.has(d); };
      const days: TimesheetDay[] = dates.map((d) => {
        const base = computeDay({
          date: d, today: clock.today, employed: d >= emp.hire_date && (!emp.termination_date || d <= emp.termination_date),
          holiday: holiday.get(d) ?? null, shift: shiftAt(d), events: events.get(`${emp.id}|${d}`) ?? [], adjustment: adj.get(`${emp.id}|${d}`) ?? null,
          request: reqs.get(`${emp.id}|${d}`) ?? null, leave: leaves.get(`${emp.id}|${d}`) ?? null, overtime: ots.get(`${emp.id}|${d}`),
        });
        const deadline = base.kind === "work" && base.issue ? explainDeadline(d, deadlineDays, isWorkday) : null;
        const open = !base.request || base.request.status === "rejected" || base.request.status === "cancelled";
        const canExplain = !!quota && quota.left > 0 && !lock && base.kind === "work" && !!base.issue && open && !!deadline && clock.today <= deadline && d <= end;
        return { ...base, canExplain, explainDeadline: deadline };
      });
      sheets.set(emp.id, { employee: emp, days, summary: summarize(days), quota, placement });
    }
    return { ...clock, period, sheets, index, lock };
  }

  /* Chấm công + điều chỉnh đã duyệt theo nhân viên + ngày (khóa "empId|date"), không dựng cả kỳ — dùng cho đối chiếu OT */
  async presence(db: Db, tenantId: string, tz: string, ids: string[], start: string, end: string) {
    if (!ids.length) return { events: new Map<string, DayEvent[]>(), adjustments: new Map<string, DayAdjustment>() };
    const [events, adjustments] = await Promise.all([this.events(db, tenantId, ids, start, end, tz), this.adjustments(db, tenantId, ids, start, end)]);
    return { events, adjustments };
  }

  /* Điều chỉnh đã duyệt của ngày: bản sau ghi đè từng giờ vào/ra của bản trước */
  private async adjustments(db: Db, tenantId: string, ids: string[], start: string, end: string) {
    const { data, error } = await db.from("attendance_adjustments").select("employee_id, work_date, clock_in, clock_out, created_at").eq("tenant_id", tenantId).in("employee_id", ids).gte("work_date", start).lte("work_date", end).order("created_at");
    if (error) throw error;
    const adj = new Map<string, DayAdjustment>();
    for (const a of (data ?? []) as Array<{ employee_id: string; work_date: string; clock_in: string | null; clock_out: string | null }>) {
      const k = `${a.employee_id}|${a.work_date}`, prev = adj.get(k);
      adj.set(k, { clockIn: a.clock_in?.slice(0, 5) ?? prev?.clockIn ?? null, clockOut: a.clock_out?.slice(0, 5) ?? prev?.clockOut ?? null });
    }
    return adj;
  }

  /* Chấm công hợp lệ, gom theo nhân viên + ngày (giờ công ty) */
  private async events(db: Db, tenantId: string, ids: string[], start: string, end: string, tz: string) {
    const out = new Map<string, DayEvent[]>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("attendance_events").select("employee_id, kind, occurred_at").eq("tenant_id", tenantId).eq("status", "accepted")
        .in("employee_id", ids.slice(i, i + 100)).gte("occurred_at", `${addDays(start, -1)}T00:00:00Z`).lte("occurred_at", `${addDays(end, 1)}T23:59:59Z`);
      if (error) throw error;
      for (const e of (data ?? []) as Array<{ employee_id: string; kind: "in" | "out"; occurred_at: string }>) {
        const p = localParts(e.occurred_at, tz);
        if (p.date < start || p.date > end) continue;
        const k = `${e.employee_id}|${p.date}`;
        out.set(k, [...(out.get(k) ?? []), { kind: e.kind, minute: p.minutes }]);
      }
    }
    return out;
  }
}

/* Ảnh chụp khóa kỳ trước khi có đối chiếu OT (31/10/2026) chỉ có giờ đã duyệt: coi là đã tính, không đối chiếu */
function fromSnapshot(snap: { days: TimesheetDay[]; summary: TimesheetSummary }) {
  const days = snap.days.map((d) => d.overtime && d.overtime.approvedMinutes === undefined ? { ...d, overtime: { ...d.overtime, approvedMinutes: d.overtime.minutes, checked: false } } : d);
  return { days, summary: { ...snap.summary, overtimeApprovedMinutes: snap.summary.overtimeApprovedMinutes ?? snap.summary.overtimeMinutes, overtimeShortDays: snap.summary.overtimeShortDays ?? 0 } };
}

export const EMP_LITE = "id, employee_code, full_name, hire_date, termination_date, user_id";
