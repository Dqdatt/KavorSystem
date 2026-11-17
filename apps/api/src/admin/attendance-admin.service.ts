/* Chấm công phía HR: bảng hôm nay, bản ghi bị từ chối, thiết bị (duyệt/từ chối/thu hồi). */
import type { AdminAttendanceEvent, AdminDevice, AttendanceBoard, LeaveHalf, OverviewDay, ReminderResult, TodayRow } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { EVENT_COLS, localParts, tenantSettings, toAttendanceEvent, type EventRow } from "../attendance/attendance.service.js";
import { PolicyIndex, loadPlacements, minutesOf } from "../attendance/policy.js";
import { conflict, invalid, notFound, type AdminContext } from "./context.js";
import { all, allIn } from "../db/rows.js";
import { addDays, uuids, type Body } from "./validate.js";
import { holidaysOf } from "../company/company.service.js";
import { isoWeekday } from "../timesheet/compute.js";
import { loadPauses, pauseOn, PAUSE_LABEL } from "../timesheet/pause.js";

type DeviceRow = {
  id: string; employee_id: string; platform: AdminDevice["platform"]; device_model: string | null; os_version: string | null; app_version: string | null;
  status: AdminDevice["status"]; registered_at: string; last_seen_at: string | null; decided_at: string | null; decided_by: string | null; decision_reason: string | null;
};
const DEVICE_COLS = "id, employee_id, platform, device_model, os_version, app_version, status, registered_at, last_seen_at, decided_at, decided_by, decision_reason";
type Emp = { id: string; employee_code: string; full_name: string; status: string };

export type DeviceAction = "approve" | "reject" | "revoke";

export class AttendanceAdmin {
  constructor(private readonly sb: SupabaseGateway) {}

  /* ---------- Thiết bị ---------- */
  async listDevices(ctx: AdminContext, status?: string): Promise<AdminDevice[]> {
    ctx.require("attendance.read");
    const ids = await ctx.scopedEmployeeIds("attendance.read");
    const rows = await allIn<DeviceRow>(ids, (lot, a, b) => {
      let q = ctx.db.from("employee_devices").select(DEVICE_COLS).eq("tenant_id", ctx.tenantId).in("employee_id", lot);
      if (status && status !== "all") q = q.eq("status", status);
      return q.order("registered_at", { ascending: false }).order("id").range(a, b);
    });
    return this.toDevices(ctx, byRegisteredDesc(rows));
  }

  async devicesOf(ctx: AdminContext, employeeIds: string[]): Promise<AdminDevice[]> {
    const rows = await allIn<DeviceRow>(employeeIds, (lot, a, b) => ctx.db.from("employee_devices").select(DEVICE_COLS).eq("tenant_id", ctx.tenantId).in("employee_id", lot).order("registered_at", { ascending: false }).order("id").range(a, b));
    return this.toDevices(ctx, byRegisteredDesc(rows));
  }

  async decideDevice(ctx: AdminContext, deviceId: string, action: DeviceAction, reason: string | null): Promise<AdminDevice> {
    ctx.require("attendance.device.manage");
    const { data } = await ctx.db.from("employee_devices").select(DEVICE_COLS).eq("id", deviceId).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) throw notFound("thiết bị");
    const before = data as DeviceRow;
    await ctx.requireEmployee("attendance.device.manage", before.employee_id);
    if (action !== "approve" && (!reason || reason.length < 5)) throw invalid("Cần ghi lý do (ít nhất 5 ký tự) để nhân viên biết vì sao.");
    const now = new Date().toISOString();
    if (action === "approve") {
      if (before.status !== "pending") throw conflict("Chỉ duyệt được thiết bị đang chờ duyệt.");
      const { data: replaced, error } = await ctx.db.rpc("approve_device", { p_device: deviceId, p_actor: ctx.userId, p_reason: reason });
      if (error?.message?.includes("DEVICE_NOT_PENDING")) throw conflict("Thiết bị không còn ở trạng thái chờ duyệt.");
      if (error) throw error;
      if (replaced) await ctx.audit("device.revoked", "employee_device", replaced as string, { status: "active" }, { status: "revoked" }, "Thay bằng thiết bị mới được duyệt");
    } else if (action === "reject") {
      if (before.status !== "pending") throw conflict("Chỉ từ chối được thiết bị đang chờ duyệt.");
      const { error } = await ctx.db.from("employee_devices").update({ status: "rejected", decided_by: ctx.userId, decided_at: now, decision_reason: reason }).eq("id", deviceId).eq("status", "pending");
      if (error) throw error;
    } else {
      if (before.status !== "active" && before.status !== "pending") throw conflict("Thiết bị đã bị thu hồi hoặc từ chối.");
      const { error } = await ctx.db.from("employee_devices").update({ status: "revoked", revoked_at: now, decided_by: ctx.userId, decided_at: now, decision_reason: reason }).eq("id", deviceId);
      if (error) throw error;
    }
    const { data: after } = await ctx.db.from("employee_devices").select(DEVICE_COLS).eq("id", deviceId).single();
    const a = after as DeviceRow;
    await ctx.audit(`device.${action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked"}`, "employee_device", deviceId,
      { status: before.status, decision_reason: before.decision_reason }, { status: a.status, decision_reason: a.decision_reason, employee_id: a.employee_id }, reason);
    return (await this.toDevices(ctx, [a]))[0]!;
  }

  /* Nút "Nhắc": người trong phạm vi hôm nay chưa chấm vào (trừ nghỉ phép cả ngày); employeeIds giới hạn thêm */
  async remind(ctx: AdminContext, b: Body): Promise<ReminderResult> {
    ctx.require("attendance.adjust"); // nhắc là thao tác của HR (HCNS/Quản trị viên công ty); Kiểm soát, quản lý chỉ xem
    const only = uuids(b, "employeeIds", 2000);
    const { rows } = await this.board(ctx);
    const items = rows.filter((r) => (r.state === "not_started" || r.state === "absent") && r.leave?.half !== "full" && (!only || only.includes(r.employee.id)))
      .map((r) => ({ id: r.employee.id, detail: r.shift ? `Ca ${r.shift.name} ${r.shift.start}–${r.shift.end}` : null }));
    return sendReminders(ctx, "reminder.attendance", items);
  }

  /* ---------- Bảng hôm nay ---------- */
  async board(ctx: AdminContext, day?: string): Promise<AttendanceBoard> {
    ctx.require("attendance.read");
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const now = localParts(new Date(), s.timezone);
    const date = day ?? now.date;
    const emps = (await all<Emp>((a, b) => ctx.scopedEmployees("attendance.read", "id, employee_code, full_name, status").order("full_name").order("id").range(a, b))).filter((e) => e.status !== "terminated");
    const ids = emps.map((e) => e.id);
    const [index, placements, events, pending, depts, leaves, holidays, pauses] = await Promise.all([
      PolicyIndex.load(ctx.db, ctx.tenantId),
      loadPlacements(ctx.db, ctx.tenantId, date, ids),
      this.rawEvents(ctx, ids, date, date, s.timezone),
      ctx.db.from("employee_devices").select("employee_id").eq("tenant_id", ctx.tenantId).eq("status", "pending"),
      ctx.db.from("departments").select("id, name").eq("tenant_id", ctx.tenantId),
      allIn<{ employee_id: string; half: LeaveHalf; leave_types: { name: string } | null }>(ids, (lot, a, b) => ctx.db.from("leave_days").select("employee_id, half, requests!inner(status), leave_types(name)").eq("tenant_id", ctx.tenantId).eq("leave_date", date).eq("requests.status", "approved").in("employee_id", lot).order("id").range(a, b)),
      holidaysOf(ctx.db, ctx.tenantId, Number(date.slice(0, 4))),
      loadPauses(ctx.db, ctx.tenantId, ids, date, date),
    ]);
    const leaveOf = new Map(leaves.map((l) => [l.employee_id, { typeName: l.leave_types?.name ?? "Nghỉ phép", half: l.half }]));
    const deptName = new Map(((depts.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
    const byEmp = groupBy(events, (e) => e.employee_id);
    const rows: TodayRow[] = emps.map((e) => {
      const p = placements.get(e.id) ?? null;
      const shift = index.resolve(e.id, p, date).shift;
      const off = !!shift && (!shift.workDays.includes(isoWeekday(date)) || holidays.some((h) => h.date === date));
      /* Tạm nghỉ hiện như nghỉ cả ngày: không tính chưa chấm, không bị nhắc */
      const pause = pauseOn(pauses, e.id, date);
      return { ...boardRow(e, p ? deptName.get(p.department_id) ?? null : null, shift, byEmp.get(e.id) ?? [], index, s.timezone, date, now, off),
        leave: pause ? { typeName: PAUSE_LABEL[pause.reason], half: "full" as const } : leaveOf.get(e.id) ?? null };
    });
    const idSet = new Set(ids);
    return {
      date, timezone: s.timezone, rows,
      summary: {
        inScope: rows.length,
        present: rows.filter((r) => r.clockIn).length,
        late: rows.filter((r) => r.late).length,
        notYet: rows.filter((r) => r.state === "not_started" && r.leave?.half !== "full").length,
        onLeave: rows.filter((r) => r.leave?.half === "full").length,
        rejected: events.filter((e) => e.status === "rejected").length,
        devicesPending: ((pending.data ?? []) as Array<{ employee_id: string }>).filter((d) => idSet.has(d.employee_id)).length,
      },
    };
  }

  /* Có mặt / đi muộn / bị từ chối theo ngày (biểu đồ tổng quan) */
  async days(ctx: AdminContext, count: number): Promise<OverviewDay[]> {
    ctx.require("attendance.read");
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const today = localParts(new Date(), s.timezone).date;
    const from = addDays(today, -(count - 1));
    const ids = [...(await ctx.scopedEmployeeIds("attendance.read"))];
    const [index, placements, events] = await Promise.all([
      PolicyIndex.load(ctx.db, ctx.tenantId), loadPlacements(ctx.db, ctx.tenantId, today, ids), this.rawEvents(ctx, ids, from, today, s.timezone),
    ]);
    const out: OverviewDay[] = [];
    for (let i = 0; i < count; i++) {
      const date = addDays(from, i);
      const dayEvents = events.filter((e) => localParts(e.occurred_at, s.timezone).date === date);
      const ins = new Map<string, EventRow>();
      for (const e of dayEvents) if (e.status === "accepted" && e.kind === "in" && !ins.has(e.employee_id)) ins.set(e.employee_id, e);
      let late = 0;
      for (const [empId, e] of ins) {
        const shift = index.resolve(empId, placements.get(empId) ?? null, date).shift;
        if (shift && localParts(e.occurred_at, s.timezone).minutes - minutesOf(shift.start) > shift.lateGraceMinutes) late++;
      }
      out.push({ date, present: ins.size, late, rejected: dayEvents.filter((e) => e.status === "rejected").length });
    }
    return out;
  }

  /* ---------- Bản ghi ---------- */
  async rejected(ctx: AdminContext, from?: string, to?: string): Promise<AdminAttendanceEvent[]> {
    ctx.require("attendance.read");
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const today = localParts(new Date(), s.timezone).date;
    const end = to ?? today, start = from ?? addDays(end, -6);
    if (start > end || Date.parse(end) - Date.parse(start) > 92 * 86400_000) throw invalid("Khoảng ngày không hợp lệ (tối đa 93 ngày).");
    const ids = [...(await ctx.scopedEmployeeIds("attendance.read"))];
    const index = await PolicyIndex.load(ctx.db, ctx.tenantId);
    const events = (await this.rawEvents(ctx, ids, start, end, s.timezone)).filter((e) => e.status === "rejected").reverse();
    return this.toAdminEvents(ctx, events, index, s.timezone, today);
  }

  async eventsFor(ctx: AdminContext, employeeIds: string[], from: string, to: string, index: PolicyIndex, tz: string): Promise<AdminAttendanceEvent[]> {
    const events = (await this.rawEvents(ctx, employeeIds, from, to, tz)).reverse();
    return this.toAdminEvents(ctx, events, index, tz, to);
  }

  /* Bản ghi trong khoảng ngày (theo múi giờ công ty) của các nhân viên, cũ → mới */
  private async rawEvents(ctx: AdminContext, employeeIds: string[], from: string, to: string, tz: string): Promise<EventRow[]> {
    if (!employeeIds.length) return [];
    const lo = new Date(Date.parse(`${from}T00:00:00Z`) - 86400_000).toISOString();
    const hi = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86400_000).toISOString();
    const data = await allIn<EventRow>(employeeIds, (lot, a, b) => ctx.db.from("attendance_events").select(EVENT_COLS).eq("tenant_id", ctx.tenantId).gte("occurred_at", lo).lt("occurred_at", hi).in("employee_id", lot).order("occurred_at").order("id").range(a, b));
    const ids = new Set(employeeIds);
    return data.sort((x, y) => Date.parse(x.occurred_at) - Date.parse(y.occurred_at)).filter((e) => ids.has(e.employee_id) && (() => { const d = localParts(e.occurred_at, tz).date; return d >= from && d <= to; })());
  }

  private async toAdminEvents(ctx: AdminContext, events: EventRow[], index: PolicyIndex, tz: string, date: string): Promise<AdminAttendanceEvent[]> {
    if (!events.length) return [];
    const empIds = [...new Set(events.map((e) => e.employee_id))];
    const devIds = [...new Set(events.map((e) => e.device_id).filter((x): x is string => !!x))];
    const [emps, placements, devs, depts] = await Promise.all([
      allIn<{ id: string; employee_code: string; full_name: string }>(empIds, (lot, a, b) => ctx.db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", lot).order("id").range(a, b)),
      loadPlacements(ctx.db, ctx.tenantId, date, empIds),
      allIn<{ id: string; device_model: string | null }>(devIds, (lot, a, b) => ctx.db.from("employee_devices").select("id, device_model").in("id", lot).order("id").range(a, b)),
      ctx.db.from("departments").select("id, name").eq("tenant_id", ctx.tenantId),
    ]);
    const emp = new Map((emps).map((e) => [e.id, e]));
    const dev = new Map((devs).map((d) => [d.id, d.device_model]));
    const deptName = new Map(((depts.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
    return events.map((e) => {
      const p = placements.get(e.employee_id) ?? null;
      const shift = index.resolve(e.employee_id, p, localParts(e.occurred_at, tz).date).shift;
      const m = emp.get(e.employee_id);
      return {
        ...toAttendanceEvent(e, index, shift, tz),
        employee: { id: e.employee_id, code: m?.employee_code ?? "", fullName: m?.full_name ?? "", department: p ? deptName.get(p.department_id) ?? null : null },
        deviceModel: e.device_id ? dev.get(e.device_id) ?? null : null,
      };
    });
  }

  private async toDevices(ctx: AdminContext, rows: DeviceRow[]): Promise<AdminDevice[]> {
    if (!rows.length) return [];
    const empIds = [...new Set(rows.map((d) => d.employee_id))];
    const deciders = [...new Set(rows.map((d) => d.decided_by).filter((x): x is string => !!x))];
    const [emps, dec] = await Promise.all([
      allIn<{ id: string; employee_code: string; full_name: string }>(empIds, (lot, a, b) => ctx.db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", lot).order("id").range(a, b)),
      allIn<{ user_id: string; full_name: string }>(deciders, (lot, a, b) => ctx.db.from("employees").select("id, user_id, full_name").eq("tenant_id", ctx.tenantId).in("user_id", lot).order("id").range(a, b)),
    ]);
    const emp = new Map(emps.map((e) => [e.id, e]));
    const decider = new Map((dec).map((e) => [e.user_id, e.full_name]));
    return rows.map((d) => ({
      id: d.id, employee: { id: d.employee_id, code: emp.get(d.employee_id)?.employee_code ?? "", fullName: emp.get(d.employee_id)?.full_name ?? "" },
      platform: d.platform, deviceModel: d.device_model, osVersion: d.os_version, appVersion: d.app_version, status: d.status,
      registeredAt: d.registered_at, lastSeenAt: d.last_seen_at, decidedAt: d.decided_at, decidedBy: d.decided_by ? decider.get(d.decided_by) ?? "Người dùng" : null, decisionReason: d.decision_reason,
    }));
  }
}

/* Một dòng của bảng hôm nay: giờ vào/ra hợp lệ đầu tiên, muộn/sớm theo ca và ân hạn, trạng thái */
export function boardRow(e: Emp, department: string | null, shift: ReturnType<PolicyIndex["resolve"]>["shift"], events: EventRow[], index: PolicyIndex, tz: string, date: string, now: { date: string; minutes: number }, off = false): TodayRow {
  const accepted = events.filter((x) => x.status === "accepted");
  const cin = accepted.find((x) => x.kind === "in"), cout = accepted.find((x) => x.kind === "out");
  const ev = (x: EventRow | undefined) => (x ? toAttendanceEvent(x, index, shift, tz) : null);
  const i = ev(cin), o = ev(cout);
  const late = !!i && !!shift && i.deviationMinutes > shift.lateGraceMinutes;
  const early = !!o && !!shift && o.deviationMinutes > shift.earlyGraceMinutes;
  const pastEnd = date < now.date || (date === now.date && !!shift && now.minutes > minutesOf(shift.end));
  const state: TodayRow["state"] = i ? (o ? "done" : "working") : !shift ? "no_shift" : off ? "off" : pastEnd ? "absent" : "not_started";
  return {
    employee: { id: e.id, code: e.employee_code, fullName: e.full_name, department },
    shift: shift ? { name: shift.name, start: shift.start, end: shift.end } : null,
    clockIn: i ? { at: i.occurredAt, lateMinutes: i.deviationMinutes, offline: i.offline, location: i.locationName } : null,
    clockOut: o ? { at: o.occurredAt, earlyMinutes: o.deviationMinutes, offline: o.offline, location: o.locationName } : null,
    state, late, early, rejectedCount: events.filter((x) => x.status === "rejected").length, leave: null,
  };
}

const byRegisteredDesc = (rows: DeviceRow[]) => rows.sort((x, y) => Date.parse(y.registered_at) - Date.parse(x.registered_at));

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

/* Gọi notify_reminders (người chưa có app / đã nhắc hôm nay bị bỏ qua) và ghi audit */
export async function sendReminders(ctx: AdminContext, kind: "reminder.attendance" | "reminder.documents", items: Array<{ id: string; detail: string | null }>): Promise<ReminderResult> {
  if (!items.length) return { sent: 0, total: 0 };
  const { data, error } = await ctx.db.rpc("notify_reminders", { p_tenant: ctx.tenantId, p_kind: kind, p_items: items });
  if (error) throw error;
  const out = { sent: (data as number) ?? 0, total: items.length };
  await ctx.audit("reminder.sent", "tenant", ctx.tenantId, null, { kind, ...out });
  return out;
}
