import {
  ATTENDANCE_ERRORS, distanceMeters,
  type AttendanceEvent, type AttendanceEventRequest, type AttendanceRejectReason, type AttendanceToday,
  type DeviceInfo, type DeviceRegisterRequest, type ShiftInfo, type WorkLocation,
} from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { PolicyIndex, loadPlacements, minutesOf } from "./policy.js";

type DeviceRow = { id: string; status: DeviceInfo["status"]; platform: DeviceInfo["platform"]; device_model: string | null; os_version: string | null; registered_at: string; installation_id: string; decision_reason: string | null };
export type EventRow = {
  id: string; employee_id: string; kind: "in" | "out"; occurred_at: string; received_at: string; status: "accepted" | "rejected";
  reject_reason: AttendanceRejectReason | null; distance_m: number | null; accuracy_m: number | null; location_id: string | null;
  recorded_offline: boolean; client_event_id: string; device_id: string | null;
};
export type Settings = { timezone: string; maxOfflineHours: number };

export const EVENT_COLS = "id, employee_id, kind, occurred_at, received_at, status, reject_reason, distance_m, accuracy_m, location_id, recorded_offline, client_event_id, device_id";
const DEVICE_COLS = "id, status, platform, device_model, os_version, registered_at, installation_id, decision_reason";

/* Ngày (YYYY-MM-DD) và số phút trong ngày của một thời điểm theo múi giờ công ty */
export function localParts(iso: string | Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/* Quyết định một lần chấm công có hợp lệ về vị trí không. Độ chính xác GPS kém hơn ngưỡng thì từ chối,
   kể cả khi tọa độ rơi vào vùng, vì vị trí thật có thể lệch xa. */
export function judgeLocation(lat: number, lng: number, accuracy: number, locations: WorkLocation[]) {
  if (!locations.length) return null;
  const ranked = locations.map((l) => ({ l, d: distanceMeters(lat, lng, l.latitude, l.longitude) })).sort((a, b) => a.d - b.d);
  const { l, d } = ranked[0]!;
  const reason: AttendanceRejectReason | null = accuracy > l.maxAccuracyM ? "low_accuracy" : d > l.radiusM ? "out_of_range" : null;
  return { location: l, distance: Math.round(d * 10) / 10, reason };
}

/* Phút đi muộn (vào) hoặc về sớm (ra) so với ca; không có ca thì 0 */
export function deviation(kind: "in" | "out", minuteOfDay: number, shift: ShiftInfo | null) {
  if (!shift) return 0;
  return kind === "in" ? Math.max(0, minuteOfDay - minutesOf(shift.start)) : Math.max(0, minutesOf(shift.end) - minuteOfDay);
}

export function toAttendanceEvent(e: EventRow, index: PolicyIndex, shift: ShiftInfo | null, tz: string): AttendanceEvent {
  const { date, minutes } = localParts(e.occurred_at, tz);
  return {
    id: e.id, recordCode: `CC-${e.id.slice(0, 8).toUpperCase()}`, kind: e.kind, occurredAt: e.occurred_at, receivedAt: e.received_at,
    status: e.status, rejectReason: e.reject_reason, distanceM: e.distance_m, accuracyM: e.accuracy_m,
    locationName: e.location_id ? index.location(e.location_id, date)?.name ?? null : null, offline: e.recorded_offline,
    deviationMinutes: deviation(e.kind, minutes, shift),
  };
}

export async function tenantSettings(sb: SupabaseGateway, tenantId: string): Promise<Settings> {
  const [{ data: t }, { data: ts }] = await Promise.all([
    sb.admin.from("tenants").select("timezone").eq("id", tenantId).single(),
    sb.admin.from("tenant_settings").select("attendance_settings").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const a = (ts?.attendance_settings ?? {}) as Partial<Settings>;
  return { timezone: (t?.timezone as string) ?? "Asia/Ho_Chi_Minh", maxOfflineHours: a.maxOfflineHours ?? 24 };
}

export class AttendanceService {
  constructor(private readonly sb: SupabaseGateway) {}

  /* ---------- Thiết bị ---------- */
  async registerDevice(emp: EmployeeRow, req: DeviceRegisterRequest, correlationId: string): Promise<DeviceInfo> {
    const db = this.sb.admin;
    const { data: mine } = await db.from("employee_devices").select(DEVICE_COLS).eq("employee_id", emp.id);
    const rows = (mine ?? []) as DeviceRow[];
    const same = rows.find((d) => d.installation_id === req.installationId);
    if (same && (same.status === "active" || same.status === "pending")) {
      await db.from("employee_devices").update({ last_seen_at: new Date().toISOString(), app_version: req.appVersion ?? null, os_version: req.osVersion ?? null }).eq("id", same.id);
      return toDevice(same);
    }
    /* Chỉ máy đầu tiên (chưa từng đăng ký máy nào) tự hoạt động. Đã có máy khác, hoặc máy từng bị HR thu hồi/từ chối,
       thì chờ HR duyệt (E18/E19) — nếu không, thu hồi máy sẽ vô tác dụng vì nhân viên tự đăng ký lại được ngay. */
    const status = rows.length ? "pending" : "active";
    const fields = {
      platform: req.platform, device_model: req.deviceModel ?? null, os_version: req.osVersion ?? null, app_version: req.appVersion ?? null,
      status, last_seen_at: new Date().toISOString(), registered_at: new Date().toISOString(), revoked_at: null, decided_by: null, decided_at: null, decision_reason: null,
    };
    const { data, error } = same
      ? await db.from("employee_devices").update(fields).eq("id", same.id).select(DEVICE_COLS).single()
      : await db.from("employee_devices").insert({ ...fields, tenant_id: emp.tenant_id, employee_id: emp.id, installation_id: req.installationId }).select(DEVICE_COLS).single();
    if (error || !data) throw new AuthError("INTERNAL_ERROR", "Chưa đăng ký được thiết bị. Vui lòng thử lại.", 500, true);
    await this.audit(emp, status === "active" ? "device.registered" : "device.change_requested", "employee_device", (data as DeviceRow).id, correlationId);
    return toDevice(data as DeviceRow);
  }

  /* ---------- Hôm nay ---------- */
  async today(emp: EmployeeRow, installationId?: string): Promise<AttendanceToday> {
    const s = await tenantSettings(this.sb, emp.tenant_id);
    const today = localParts(new Date(), s.timezone).date;
    const { index, policies } = await this.policies(emp, today);
    const events = await this.eventsOn(emp, today, s);
    let device: DeviceInfo | null = null;
    if (installationId) {
      const { data } = await this.sb.admin.from("employee_devices").select(DEVICE_COLS).eq("employee_id", emp.id).eq("installation_id", installationId).maybeSingle();
      device = data ? toDevice(data as DeviceRow) : null;
    }
    const mapped = events.map((e) => toAttendanceEvent(e, index, policies.shift, s.timezone));
    const accepted = mapped.filter((e) => e.status === "accepted");
    let shift: ShiftInfo | null = null;
    if (policies.shift) { const { source: _source, ...rest } = policies.shift; shift = rest; }
    return {
      date: today, timezone: s.timezone, shift,
      locations: policies.locations, device, events: mapped,
      clockIn: accepted.find((e) => e.kind === "in") ?? null, clockOut: accepted.find((e) => e.kind === "out") ?? null,
    };
  }

  /* ---------- Chấm công ---------- */
  async record(emp: EmployeeRow, req: AttendanceEventRequest, correlationId: string): Promise<{ event: AttendanceEvent; created: boolean }> {
    const db = this.sb.admin;
    const s = await tenantSettings(this.sb, emp.tenant_id);

    /* Gửi lại cùng khóa: trả bản ghi đã có, không tạo mới */
    const { data: existing } = await db.from("attendance_events").select(EVENT_COLS).eq("employee_id", emp.id).eq("client_event_id", req.clientEventId).maybeSingle();
    if (existing) {
      const { index, policies } = await this.policies(emp, localParts((existing as EventRow).occurred_at, s.timezone).date);
      return { event: toAttendanceEvent(existing as EventRow, index, policies.shift, s.timezone), created: false };
    }

    const { data: dev } = await db.from("employee_devices").select(DEVICE_COLS).eq("employee_id", emp.id).eq("installation_id", req.installationId).in("status", ["active", "pending"]).maybeSingle();
    if (!dev) throw new AuthError(ATTENDANCE_ERRORS.deviceNotRegistered, "Thiết bị này chưa được đăng ký chấm công.", 403);
    if ((dev as DeviceRow).status === "pending") throw new AuthError(ATTENDANCE_ERRORS.devicePending, "Thiết bị đang chờ HR duyệt nên chưa chấm công được.", 403);

    /* Giờ ghi nhận: online dùng giờ máy chủ; offline dùng giờ máy nhưng không được ở tương lai hay quá cũ */
    const now = Date.now();
    let occurred = new Date(now);
    if (req.offline && req.occurredAt) {
      const t = Date.parse(req.occurredAt);
      if (Number.isNaN(t) || t > now + 2 * 60_000 || now - t > s.maxOfflineHours * 3600_000) {
        throw new AuthError(ATTENDANCE_ERRORS.clockSkew, `Bản ghi offline quá cũ (hơn ${s.maxOfflineHours} giờ) hoặc giờ trên máy không đúng. Hãy gửi giải trình.`, 422);
      }
      occurred = new Date(t);
    }

    const day = localParts(occurred, s.timezone).date;
    const { index, policies } = await this.policies(emp, day);
    const accepted = (await this.eventsOn(emp, day, s)).filter((e) => e.status === "accepted");
    const hasIn = accepted.some((e) => e.kind === "in"), hasOut = accepted.some((e) => e.kind === "out");
    if (req.kind === "in" && hasIn) throw new AuthError(ATTENDANCE_ERRORS.invalidSequence, "Bạn đã vào ca hôm nay.", 409);
    if (req.kind === "out" && !hasIn) throw new AuthError(ATTENDANCE_ERRORS.invalidSequence, "Bạn chưa vào ca hôm nay.", 409);
    if (req.kind === "out" && hasOut) throw new AuthError(ATTENDANCE_ERRORS.invalidSequence, "Bạn đã ra ca hôm nay.", 409);

    const verdict = judgeLocation(req.latitude, req.longitude, req.accuracyM, policies.locations);
    if (!verdict) throw new AuthError(ATTENDANCE_ERRORS.noLocation, "Bạn chưa được áp dụng địa điểm chấm công nào. Liên hệ phòng Nhân sự.", 422);

    const { data, error } = await db.from("attendance_events").insert({
      tenant_id: emp.tenant_id, employee_id: emp.id, device_id: (dev as DeviceRow).id, kind: req.kind, client_event_id: req.clientEventId,
      occurred_at: occurred.toISOString(), recorded_offline: !!req.offline, latitude: req.latitude, longitude: req.longitude, accuracy_m: req.accuracyM,
      location_id: verdict.location.id, distance_m: verdict.distance, status: verdict.reason ? "rejected" : "accepted", reject_reason: verdict.reason,
    }).select(EVENT_COLS).single();
    if (error?.code === "23505") {
      /* Hai request cùng khóa chạy song song: lấy bản ghi đã thắng */
      const { data: again } = await db.from("attendance_events").select(EVENT_COLS).eq("employee_id", emp.id).eq("client_event_id", req.clientEventId).single();
      return { event: toAttendanceEvent(again as EventRow, index, policies.shift, s.timezone), created: false };
    }
    if (error || !data) throw new AuthError("INTERNAL_ERROR", "Chưa ghi nhận được chấm công. Vui lòng thử lại.", 500, true);
    await db.from("employee_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", (dev as DeviceRow).id);
    await this.audit(emp, `attendance.${req.kind}.${verdict.reason ? "rejected" : "accepted"}`, "attendance_event", (data as EventRow).id, correlationId);
    return { event: toAttendanceEvent(data as EventRow, index, policies.shift, s.timezone), created: true };
  }

  /* ---------- Nội bộ ---------- */
  /* Ca + địa điểm áp dụng cho nhân viên vào ngày `date` (tra theo tầng, ADR 0001) */
  private async policies(emp: EmployeeRow, date: string) {
    const [index, placements] = await Promise.all([PolicyIndex.load(this.sb.admin, emp.tenant_id), loadPlacements(this.sb.admin, emp.tenant_id, date, [emp.id])]);
    return { index, policies: index.resolve(emp.id, placements.get(emp.id) ?? null, date) };
  }

  /* Các bản ghi của một ngày theo múi giờ công ty (lấy rộng ±1 ngày rồi lọc chính xác) */
  private async eventsOn(emp: EmployeeRow, day: string, s: Settings): Promise<EventRow[]> {
    const from = new Date(Date.parse(`${day}T00:00:00Z`) - 86400_000).toISOString();
    const to = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400_000).toISOString();
    const { data } = await this.sb.admin.from("attendance_events").select(EVENT_COLS).eq("employee_id", emp.id).gte("occurred_at", from).lt("occurred_at", to).order("occurred_at");
    return ((data ?? []) as EventRow[]).filter((e) => localParts(e.occurred_at, s.timezone).date === day);
  }

  private async audit(emp: EmployeeRow, action: string, resourceType: string, resourceId: string, correlationId: string) {
    await this.sb.admin.from("audit_logs").insert({ tenant_id: emp.tenant_id, actor_user_id: emp.user_id, actor_type: "user", action, resource_type: resourceType, resource_id: resourceId, correlation_id: correlationId });
  }
}

const toDevice = (d: DeviceRow): DeviceInfo => ({ id: d.id, status: d.status, platform: d.platform, deviceModel: d.device_model, osVersion: d.os_version, registeredAt: d.registered_at, decisionReason: d.decision_reason });
