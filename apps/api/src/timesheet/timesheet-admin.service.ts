/* Bảng công tháng trên web HR: tổng hợp theo nhân viên trong phạm vi attendance.read, chi tiết từng ngày, khóa/mở kỳ, xuất CSV.
   Khóa kỳ lưu ảnh chụp bảng công của toàn công ty; sau đó mọi nơi đọc ảnh chụp, đơn giải trình của kỳ bị chặn. */
import type { EmployeeTimesheet, TimesheetBoard, TimesheetRow, TimesheetSummary } from "@kavor/contracts";
import { conflict, invalid, notFound, type AdminContext } from "../admin/context.js";
import { nullableText, type Body } from "../admin/validate.js";
import { MONTH, EMP_LITE, type EmployeeLite, type Sheets, type TimesheetService } from "./timesheet.service.js";
import { viewerOf, type RequestsService } from "./requests.service.js";
import { periodOf } from "./compute.js";

const rowStatus = (s: TimesheetSummary): TimesheetRow["status"] => (s.missingDays > 0 ? "short" : s.pendingRequests > 0 ? "needs_action" : "ok");

export class TimesheetAdmin {
  constructor(private readonly timesheets: TimesheetService, private readonly requests: RequestsService) {}

  private async month(ctx: AdminContext, m?: string) {
    if (m !== undefined && !MONTH.test(m)) throw invalid("Tháng phải có dạng YYYY-MM.");
    return m ?? (await this.timesheets.tenantClock(ctx.db, ctx.tenantId)).currentMonth;
  }

  /* Nhân viên còn làm trong kỳ (kể cả nghỉ việc giữa kỳ) */
  private inPeriod(list: EmployeeLite[], start: string, end: string) {
    return list.filter((e) => e.hire_date <= end && (!e.termination_date || e.termination_date >= start));
  }

  private rows(sheets: Sheets): TimesheetRow[] {
    return [...sheets.sheets.values()].map((s) => ({
      employee: { id: s.employee.id, code: s.employee.employee_code, fullName: s.employee.full_name, department: s.placement ? sheets.index.scopeName("department", s.placement.department_id) : null },
      summary: s.summary, status: rowStatus(s.summary),
    })).sort((a, b) => a.employee.code.localeCompare(b.employee.code));
  }

  async board(ctx: AdminContext, m?: string): Promise<TimesheetBoard> {
    ctx.require("attendance.read");
    const month = await this.month(ctx, m);
    const { data, error } = await ctx.scopedEmployees("attendance.read", EMP_LITE);
    if (error) throw error;
    const clock = await this.timesheets.tenantClock(ctx.db, ctx.tenantId);
    const p = periodOf(month, clock.periodStartDay);
    const sheets = await this.timesheets.build(ctx.tenantId, this.inPeriod((data ?? []) as unknown as EmployeeLite[], p.start, p.end), month);
    const rows = this.rows(sheets);
    let lockedBy: string | null = null;
    if (sheets.lock?.locked_by) {
      const { data: e } = await ctx.db.from("employees").select("full_name").eq("tenant_id", ctx.tenantId).eq("user_id", sheets.lock.locked_by).maybeSingle();
      lockedBy = (e as { full_name: string } | null)?.full_name ?? null;
    }
    return {
      period: sheets.period, timezone: sheets.timezone, periodStartDay: sheets.periodStartDay, rows,
      metrics: {
        employees: rows.length, full: rows.filter((r) => r.status === "ok").length, short: rows.filter((r) => r.status === "short").length,
        unexplained: rows.reduce((n, r) => n + r.summary.missingDays, 0), lateEmployees: rows.filter((r) => r.summary.lateDays > 0).length,
        lateTimes: rows.reduce((n, r) => n + r.summary.lateDays, 0), pendingRequests: rows.reduce((n, r) => n + r.summary.pendingRequests, 0),
      },
      lock: sheets.lock ? { lockedAt: sheets.lock.locked_at, lockedBy, reason: sheets.lock.reason } : null,
      canLock: ctx.tenantWide("timesheet.lock"), canUnlock: ctx.tenantWide("timesheet.unlock"),
    };
  }

  async employee(ctx: AdminContext, employeeId: string, m?: string): Promise<EmployeeTimesheet> {
    await ctx.requireEmployee("attendance.read", employeeId);
    const month = await this.month(ctx, m);
    const lite = await this.requests.lite(ctx.db, ctx.tenantId, [employeeId]);
    const sheets = await this.timesheets.build(ctx.tenantId, lite, month);
    const s = sheets.sheets.get(employeeId);
    if (!s) throw notFound("nhân viên");
    const row = this.rows(sheets)[0]!;
    const { data } = await ctx.db.from("requests").select("id").eq("tenant_id", ctx.tenantId).eq("requester_employee_id", employeeId)
      .gte("work_date", sheets.period.start).lte("work_date", sheets.period.end).order("submitted_at", { ascending: false });
    const requests = ctx.can("request.read") ? await this.requests.items(ctx.db, viewerOf(ctx), ((data ?? []) as Array<{ id: string }>).map((r) => r.id)) : [];
    return { period: sheets.period, timezone: sheets.timezone, employee: row.employee, days: s.days, summary: s.summary, requests };
  }

  /* Khóa kỳ: chỉ khi kỳ đã kết thúc; ảnh chụp gồm mọi nhân viên của công ty (không chỉ phạm vi người khóa) */
  async lock(ctx: AdminContext, b: Body): Promise<TimesheetBoard> {
    ctx.requireTenantWide("timesheet.lock");
    const month = await this.month(ctx, typeof b?.month === "string" ? b.month : undefined);
    const reason = nullableText(b, "reason", 500) ?? null;
    const clock = await this.timesheets.tenantClock(ctx.db, ctx.tenantId);
    const p = periodOf(month, clock.periodStartDay);
    if (p.end > clock.today) throw conflict(`Kỳ công ${month} chưa kết thúc (tới ${p.end}).`);
    if (await this.timesheets.activeLock(ctx.db, ctx.tenantId, p.start)) throw conflict("Kỳ công này đã khóa.");
    const { data, error } = await ctx.db.from("employees").select(EMP_LITE).eq("tenant_id", ctx.tenantId);
    if (error) throw error;
    const sheets = await this.timesheets.build(ctx.tenantId, this.inPeriod((data ?? []) as EmployeeLite[], p.start, p.end), month, { fresh: true });
    const snapshot = { rows: [...sheets.sheets.values()].map((s) => ({ employeeId: s.employee.id, days: s.days.map((d) => ({ ...d, canExplain: false })), summary: s.summary })) };
    const pending = snapshot.rows.reduce((n, r) => n + r.summary.pendingRequests, 0), missing = snapshot.rows.reduce((n, r) => n + r.summary.missingDays, 0);
    const { data: lock, error: lErr } = await ctx.db.from("timesheet_locks").insert({ tenant_id: ctx.tenantId, period_start: p.start, period_end: p.end, locked_by: ctx.userId, reason, snapshot }).select("id").single();
    if (lErr?.code === "23505") throw conflict("Kỳ công này đã khóa.");
    if (lErr) throw lErr;
    await ctx.audit("timesheet.locked", "timesheet_lock", (lock as { id: string }).id, null, { month, start: p.start, end: p.end, employees: snapshot.rows.length, missing_days: missing, pending_requests: pending }, reason);
    return this.board(ctx, month);
  }

  async unlock(ctx: AdminContext, b: Body): Promise<TimesheetBoard> {
    ctx.requireTenantWide("timesheet.unlock");
    const month = await this.month(ctx, typeof b?.month === "string" ? b.month : undefined);
    const reason = nullableText(b, "reason", 500);
    if (!reason || reason.length < 5) throw invalid("Ghi lý do mở lại kỳ công (ít nhất 5 ký tự).");
    const clock = await this.timesheets.tenantClock(ctx.db, ctx.tenantId);
    const lock = await this.timesheets.activeLock(ctx.db, ctx.tenantId, periodOf(month, clock.periodStartDay).start);
    if (!lock) throw conflict("Kỳ công này chưa khóa.");
    const { error } = await ctx.db.from("timesheet_locks").update({ unlocked_by: ctx.userId, unlocked_at: new Date().toISOString(), unlock_reason: reason }).eq("id", lock.id);
    if (error) throw error;
    await ctx.audit("timesheet.unlocked", "timesheet_lock", lock.id, { locked_at: lock.locked_at }, { unlocked: true, month }, reason);
    return this.board(ctx, month);
  }

  /* CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt) */
  async exportCsv(ctx: AdminContext, m?: string): Promise<{ filename: string; body: string }> {
    const b = await this.board(ctx, m);
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Mã NV", "Họ tên", "Phòng ban", "Ngày công", "Công chuẩn", "Số ngày đi muộn", "Phút đi muộn", "Số ngày về sớm", "Thiếu công chưa giải trình", "Giải trình chờ duyệt", "Trạng thái"];
    const label = { ok: "Đủ dữ liệu", needs_action: "Cần xử lý", short: "Thiếu công" } as const;
    const lines = b.rows.map((r) => [r.employee.code, r.employee.fullName, r.employee.department ?? "", r.summary.credited, r.summary.standard, r.summary.lateDays, r.summary.lateMinutes, r.summary.earlyDays, r.summary.missingDays, r.summary.pendingRequests, label[r.status]].map(esc).join(","));
    await ctx.audit("timesheet.exported", "timesheet", null, null, { month: b.period.month, rows: b.rows.length });
    return { filename: `bang-cong-${b.period.month}.csv`, body: "﻿" + [head.join(","), ...lines].join("\r\n") + "\r\n" };
  }
}
