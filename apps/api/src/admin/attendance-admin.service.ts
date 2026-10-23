/* Chấm công phía HR: bảng hôm nay, bản ghi bị từ chối, thiết bị (duyệt/từ chối/thu hồi). */
import type { AdminAttendanceEvent, AdminDevice, AttendanceBoard, OverviewDay, TodayRow } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { EVENT_COLS, localParts, tenantSettings, toAttendanceEvent, type EventRow } from "../attendance/attendance.service.js";
import { PolicyIndex, loadPlacements, minutesOf } from "../attendance/policy.js";
import { conflict, invalid, notFound, type AdminContext } from "./context.js";
import { addDays } from "./validate.js";

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
    let q = ctx.db.from("employee_devices").select(DEVICE_COLS).eq("tenant_id", ctx.tenantId).order("registered_at", { ascending: false }).limit(500);
    if (status && status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return this.toDevices(ctx, ((data ?? []) as DeviceRow[]).filter((d) => ids.has(d.employee_id)));
  }

  async devicesOf(ctx: AdminContext, employeeIds: string[]): Promise<AdminDevice[]> {
    const { data } = await ctx.db.from("employee_devices").select(DEVICE_COLS).eq("tenant_id", ctx.tenantId).in("employee_id", employeeIds).order("registered_at", { ascending: false });
    return this.toDevices(ctx, (data ?? []) as DeviceRow[]);
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

  /* ---------- Bảng hôm nay ---------- */
  async board(ctx: AdminContext, day?: string): Promise<AttendanceBoard> {
    ctx.require("attendance.read");
    const s = await tenantSettings(this.sb, ctx.tenantId);
    const now = localParts(new Date(), s.timezone);
    const date = day ?? now.date;
    const { data, error } = await ctx.scopedEmployees("attendance.read", "id, employee_code, full_name, status").order("full_name");
    if (error) throw error;
    const emps = ((data ?? []) as unknown as Emp[]).filter((e) => e.status !== "terminated");
    const ids = emps.map((e) => e.id);
    const [index, placements, events, pending, depts] = await Promise.all([
      PolicyIndex.load(ctx.db, ctx.tenantId),
      loadPlacements(ctx.db, ctx.tenantId, date, ids),
      this.rawEvents(ctx, ids, date, date, s.timezone),
      ctx.db.from("employee_devices").select("employee_id").eq("tenant_id", ctx.tenantId).eq("status", "pending"),
      ctx.db.from("departments").select("id, name").eq("tenant_id", ctx.tenantId),
    ]);
    const deptName = new Map(((depts.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
    const byEmp = groupBy(events, (e) => e.employee_id);
    const rows: TodayRow[] = emps.map((e) => {
      const p = placements.get(e.id) ?? null;
      const shift = index.resolve(e.id, p, date).shift;
      return boardRow(e, p ? deptName.get(p.department_id) ?? null : null, shift, byEmp.get(e.id) ?? [], index, s.timezone, date, now);
    });
    const idSet = new Set(ids);
    return {
      date, timezone: s.timezone, rows,
      summary: {
        inScope: rows.length,
        present: rows.filter((r) => r.clockIn).length,
        late: rows.filter((r) => r.late).length,
        notYet: rows.filter((r) => r.state === "not_started").length,
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
    let q = ctx.db.from("attendance_events").select(EVENT_COLS).eq("tenant_id", ctx.tenantId).gte("occurred_at", lo).lt("occurred_at", hi).order("occurred_at").limit(10000);
    if (employeeIds.length <= 100) q = q.in("employee_id", employeeIds);
    const { data, error } = await q;
    if (error) throw error;
    const ids = new Set(employeeIds);
    return ((data ?? []) as EventRow[]).filter((e) => ids.has(e.employee_id) && (() => { const d = localParts(e.occurred_at, tz).date; return d >= from && d <= to; })());
  }

  private async toAdminEvents(ctx: AdminContext, events: EventRow[], index: PolicyIndex, tz: string, date: string): Promise<AdminAttendanceEvent[]> {
    if (!events.length) return [];
    const empIds = [...new Set(events.map((e) => e.employee_id))];
    const devIds = [...new Set(events.map((e) => e.device_id).filter((x): x is string => !!x))];
    const [emps, placements, devs, depts] = await Promise.all([
      ctx.db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", empIds),
      loadPlacements(ctx.db, ctx.tenantId, date, empIds),
      devIds.length ? ctx.db.from("employee_devices").select("id, device_model").in("id", devIds) : Promise.resolve({ data: [] }),
      ctx.db.from("departments").select("id, name").eq("tenant_id", ctx.tenantId),
    ]);
    const emp = new Map(((emps.data ?? []) as Array<{ id: string; employee_code: string; full_name: string }>).map((e) => [e.id, e]));
    const dev = new Map(((devs.data ?? []) as Array<{ id: string; device_model: string | null }>).map((d) => [d.id, d.device_model]));
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
    const [{ data: emps }, { data: dec }] = await Promise.all([
      ctx.db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", empIds),
      deciders.length ? ctx.db.from("employees").select("user_id, full_name").eq("tenant_id", ctx.tenantId).in("user_id", deciders) : Promise.resolve({ data: [] }),
    ]);
    const emp = new Map(((emps ?? []) as Array<{ id: string; employee_code: string; full_name: string }>).map((e) => [e.id, e]));
    const decider = new Map(((dec ?? []) as Array<{ user_id: string; full_name: string }>).map((e) => [e.user_id, e.full_name]));
    return rows.map((d) => ({
      id: d.id, employee: { id: d.employee_id, code: emp.get(d.employee_id)?.employee_code ?? "", fullName: emp.get(d.employee_id)?.full_name ?? "" },
      platform: d.platform, deviceModel: d.device_model, osVersion: d.os_version, appVersion: d.app_version, status: d.status,
      registeredAt: d.registered_at, lastSeenAt: d.last_seen_at, decidedAt: d.decided_at, decidedBy: d.decided_by ? decider.get(d.decided_by) ?? "Người dùng" : null, decisionReason: d.decision_reason,
    }));
  }
}

/* Một dòng của bảng hôm nay: giờ vào/ra hợp lệ đầu tiên, muộn/sớm theo ca và ân hạn, trạng thái */
export function boardRow(e: Emp, department: string | null, shift: ReturnType<PolicyIndex["resolve"]>["shift"], events: EventRow[], index: PolicyIndex, tz: string, date: string, now: { date: string; minutes: number }): TodayRow {
  const accepted = events.filter((x) => x.status === "accepted");
  const cin = accepted.find((x) => x.kind === "in"), cout = accepted.find((x) => x.kind === "out");
  const ev = (x: EventRow | undefined) => (x ? toAttendanceEvent(x, index, shift, tz) : null);
  const i = ev(cin), o = ev(cout);
  const late = !!i && !!shift && i.deviationMinutes > shift.lateGraceMinutes;
  const early = !!o && !!shift && o.deviationMinutes > shift.earlyGraceMinutes;
  const pastEnd = date < now.date || (date === now.date && !!shift && now.minutes > minutesOf(shift.end));
  const state: TodayRow["state"] = i ? (o ? "done" : "working") : !shift ? "no_shift" : pastEnd ? "absent" : "not_started";
  return {
    employee: { id: e.id, code: e.employee_code, fullName: e.full_name, department },
    shift: shift ? { name: shift.name, start: shift.start, end: shift.end } : null,
    clockIn: i ? { at: i.occurredAt, lateMinutes: i.deviationMinutes, offline: i.offline, location: i.locationName } : null,
    clockOut: o ? { at: o.occurredAt, earlyMinutes: o.deviationMinutes, offline: o.offline, location: o.locationName } : null,
    state, late, early, rejectedCount: events.filter((x) => x.status === "rejected").length,
  };
}

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}
