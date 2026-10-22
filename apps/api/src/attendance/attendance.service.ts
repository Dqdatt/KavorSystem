import {
  ATTENDANCE_ERRORS, distanceMeters,
  type AttendanceEvent, type AttendanceEventRequest, type AttendanceRejectReason, type AttendanceToday,
  type DeviceInfo, type DeviceRegisterRequest, type WorkLocation,
} from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";

type LocationRow = { id: string; name: string; address: string | null; latitude: number; longitude: number; radius_m: number; max_accuracy_m: number };
type DeviceRow = { id: string; status: DeviceInfo["status"]; platform: DeviceInfo["platform"]; device_model: string | null; os_version: string | null; registered_at: string; installation_id: string };
type EventRow = {
  id: string; kind: "in" | "out"; occurred_at: string; received_at: string; status: "accepted" | "rejected";
  reject_reason: AttendanceRejectReason | null; distance_m: number | null; accuracy_m: number | null; location_id: string | null;
  recorded_offline: boolean; client_event_id: string;
};
type Settings = { timezone: string; shiftStart: string; shiftEnd: string; maxOfflineHours: number };

const EVENT_COLS = "id, kind, occurred_at, received_at, status, reject_reason, distance_m, accuracy_m, location_id, recorded_offline, client_event_id";
const DEVICE_COLS = "id, status, platform, device_model, os_version, registered_at, installation_id";

/* Ngày (YYYY-MM-DD) và số phút trong ngày của một thời điểm theo múi giờ công ty */
export function localParts(iso: string | Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toMin = (hhmm: string) => { const [h = 0, m = 0] = hhmm.split(":").map(Number); return h * 60 + m; };

/* Quyết định một lần chấm công có hợp lệ về vị trí không. Độ chính xác GPS kém hơn ngưỡng thì từ chối,
   kể cả khi tọa độ rơi vào vùng, vì vị trí thật có thể lệch xa. */
export function judgeLocation(lat: number, lng: number, accuracy: number, locations: LocationRow[]) {
  if (!locations.length) return null;
  const ranked = locations.map((l) => ({ l, d: distanceMeters(lat, lng, l.latitude, l.longitude) })).sort((a, b) => a.d - b.d);
  const { l, d } = ranked[0]!;
  const reason: AttendanceRejectReason | null = accuracy > l.max_accuracy_m ? "low_accuracy" : d > l.radius_m ? "out_of_range" : null;
  return { location: l, distance: Math.round(d * 10) / 10, reason };
}

export class AttendanceService {
  constructor(private readonly sb: SupabaseGateway, private readonly env: string) {}

  /* ---------- Thiết bị ---------- */
  async registerDevice(emp: EmployeeRow, req: DeviceRegisterRequest, correlationId: string): Promise<DeviceInfo> {
    const db = this.sb.admin;
    const { data: mine } = await db.from("employee_devices").select(DEVICE_COLS).eq("employee_id", emp.id).neq("status", "revoked");
    const rows = (mine ?? []) as DeviceRow[];
    const same = rows.find((d) => d.installation_id === req.installationId);
    if (same) {
      await db.from("employee_devices").update({ last_seen_at: new Date().toISOString(), app_version: req.appVersion ?? null, os_version: req.osVersion ?? null }).eq("id", same.id);
      return toDevice(same);
    }
    /* Đã có máy khác đang hoạt động: máy mới chờ HR duyệt (E18/E19) */
    const status = rows.some((d) => d.status === "active") ? "pending" : "active";
    const { data, error } = await db.from("employee_devices").insert({
      tenant_id: emp.tenant_id, employee_id: emp.id, installation_id: req.installationId, platform: req.platform,
      device_model: req.deviceModel ?? null, os_version: req.osVersion ?? null, app_version: req.appVersion ?? null, status, last_seen_at: new Date().toISOString(),
    }).select(DEVICE_COLS).single();
    if (error || !data) throw new AuthError("INTERNAL_ERROR", "Chưa đăng ký được thiết bị. Vui lòng thử lại.", 500, true);
    await this.audit(emp, status === "active" ? "device.registered" : "device.change_requested", "employee_device", (data as DeviceRow).id, correlationId);
    return toDevice(data as DeviceRow);
  }

  /* ---------- Hôm nay ---------- */
  async today(emp: EmployeeRow, installationId?: string): Promise<AttendanceToday> {
    const s = await this.settings(emp.tenant_id);
    const locations = await this.locations(emp.tenant_id);
    const today = localParts(new Date(), s.timezone).date;
    const events = await this.eventsOn(emp, today, s);
    let device: DeviceInfo | null = null;
    if (installationId) {
      const { data } = await this.sb.admin.from("employee_devices").select(DEVICE_COLS).eq("employee_id", emp.id).eq("installation_id", installationId).neq("status", "revoked").maybeSingle();
      device = data ? toDevice(data as DeviceRow) : null;
    }
    const mapped = events.map((e) => this.toEvent(e, locations, s));
    const accepted = mapped.filter((e) => e.status === "accepted");
    return {
      date: today, timezone: s.timezone, shift: { start: s.shiftStart, end: s.shiftEnd },
      locations: locations.map(toLocation), device, events: mapped,
      clockIn: accepted.find((e) => e.kind === "in") ?? null, clockOut: accepted.find((e) => e.kind === "out") ?? null,
    };
  }

  /* ---------- Chấm công ---------- */
  async record(emp: EmployeeRow, req: AttendanceEventRequest, correlationId: string): Promise<{ event: AttendanceEvent; created: boolean }> {
    const db = this.sb.admin;
    const s = await this.settings(emp.tenant_id);
    const locations = await this.locations(emp.tenant_id);

    /* Gửi lại cùng khóa: trả bản ghi đã có, không tạo mới */
    const { data: existing } = await db.from("attendance_events").select(EVENT_COLS).eq("employee_id", emp.id).eq("client_event_id", req.clientEventId).maybeSingle();
    if (existing) return { event: this.toEvent(existing as EventRow, locations, s), created: false };

    const { data: dev } = await db.from("employee_devices").select(DEVICE_COLS).eq("employee_id", emp.id).eq("installation_id", req.installationId).neq("status", "revoked").maybeSingle();
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
    const accepted = (await this.eventsOn(emp, day, s)).filter((e) => e.status === "accepted");
    const hasIn = accepted.some((e) => e.kind === "in"), hasOut = accepted.some((e) => e.kind === "out");
    if (req.kind === "in" && hasIn) throw new AuthError(ATTENDANCE_ERRORS.invalidSequence, "Bạn đã vào ca hôm nay.", 409);
    if (req.kind === "out" && !hasIn) throw new AuthError(ATTENDANCE_ERRORS.invalidSequence, "Bạn chưa vào ca hôm nay.", 409);
    if (req.kind === "out" && hasOut) throw new AuthError(ATTENDANCE_ERRORS.invalidSequence, "Bạn đã ra ca hôm nay.", 409);

    const verdict = judgeLocation(req.latitude, req.longitude, req.accuracyM, locations);
    if (!verdict) throw new AuthError(ATTENDANCE_ERRORS.noLocation, "Công ty chưa cấu hình địa điểm chấm công. Liên hệ phòng Nhân sự.", 422);

    const { data, error } = await db.from("attendance_events").insert({
      tenant_id: emp.tenant_id, employee_id: emp.id, device_id: (dev as DeviceRow).id, kind: req.kind, client_event_id: req.clientEventId,
      occurred_at: occurred.toISOString(), recorded_offline: !!req.offline, latitude: req.latitude, longitude: req.longitude, accuracy_m: req.accuracyM,
      location_id: verdict.location.id, distance_m: verdict.distance, status: verdict.reason ? "rejected" : "accepted", reject_reason: verdict.reason,
    }).select(EVENT_COLS).single();
    if (error?.code === "23505") {
      /* Hai request cùng khóa chạy song song: lấy bản ghi đã thắng */
      const { data: again } = await db.from("attendance_events").select(EVENT_COLS).eq("employee_id", emp.id).eq("client_event_id", req.clientEventId).single();
      return { event: this.toEvent(again as EventRow, locations, s), created: false };
    }
    if (error || !data) throw new AuthError("INTERNAL_ERROR", "Chưa ghi nhận được chấm công. Vui lòng thử lại.", 500, true);
    await db.from("employee_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", (dev as DeviceRow).id);
    await this.audit(emp, `attendance.${req.kind}.${verdict.reason ? "rejected" : "accepted"}`, "attendance_event", (data as EventRow).id, correlationId);
    return { event: this.toEvent(data as EventRow, locations, s), created: true };
  }

  /* Chỉ cho môi trường development: chuyển địa điểm chấm công tới vị trí hiện tại để thử trong vùng/ngoài vùng */
  async devMoveLocation(emp: EmployeeRow, latitude: number, longitude: number, radiusM?: number): Promise<WorkLocation> {
    if (this.env !== "development") throw new AuthError("NOT_FOUND", "Không tìm thấy.", 404);
    const [first] = await this.locations(emp.tenant_id);
    if (!first) throw new AuthError(ATTENDANCE_ERRORS.noLocation, "Chưa có địa điểm chấm công.", 422);
    const patch: Record<string, number> = { latitude, longitude };
    if (radiusM) patch.radius_m = Math.max(3, Math.min(5000, Math.round(radiusM)));
    const { data } = await this.sb.admin.from("work_locations").update(patch).eq("id", first.id).select("id, name, address, latitude, longitude, radius_m, max_accuracy_m").single();
    return toLocation(data as LocationRow);
  }

  /* ---------- Nội bộ ---------- */
  private async settings(tenantId: string): Promise<Settings> {
    const { data: t } = await this.sb.admin.from("tenants").select("timezone").eq("id", tenantId).single();
    const { data: ts } = await this.sb.admin.from("tenant_settings").select("attendance_settings").eq("tenant_id", tenantId).maybeSingle();
    const a = (ts?.attendance_settings ?? {}) as Partial<Settings>;
    return { timezone: (t?.timezone as string) ?? "Asia/Ho_Chi_Minh", shiftStart: a.shiftStart ?? "08:00", shiftEnd: a.shiftEnd ?? "17:00", maxOfflineHours: a.maxOfflineHours ?? 24 };
  }

  private async locations(tenantId: string): Promise<LocationRow[]> {
    const { data } = await this.sb.admin.from("work_locations").select("id, name, address, latitude, longitude, radius_m, max_accuracy_m").eq("tenant_id", tenantId).eq("active", true);
    return (data ?? []) as LocationRow[];
  }

  /* Các bản ghi của một ngày theo múi giờ công ty (lấy rộng ±1 ngày rồi lọc chính xác) */
  private async eventsOn(emp: EmployeeRow, day: string, s: Settings): Promise<EventRow[]> {
    const from = new Date(Date.parse(`${day}T00:00:00Z`) - 86400_000).toISOString();
    const to = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400_000).toISOString();
    const { data } = await this.sb.admin.from("attendance_events").select(EVENT_COLS).eq("employee_id", emp.id).gte("occurred_at", from).lt("occurred_at", to).order("occurred_at");
    return ((data ?? []) as EventRow[]).filter((e) => localParts(e.occurred_at, s.timezone).date === day);
  }

  private toEvent(e: EventRow, locations: LocationRow[], s: Settings): AttendanceEvent {
    const m = localParts(e.occurred_at, s.timezone).minutes;
    const deviation = e.kind === "in" ? Math.max(0, m - toMin(s.shiftStart)) : Math.max(0, toMin(s.shiftEnd) - m);
    return {
      id: e.id, recordCode: `CC-${e.id.slice(0, 8).toUpperCase()}`, kind: e.kind, occurredAt: e.occurred_at, receivedAt: e.received_at,
      status: e.status, rejectReason: e.reject_reason, distanceM: e.distance_m, accuracyM: e.accuracy_m,
      locationName: locations.find((l) => l.id === e.location_id)?.name ?? null, offline: e.recorded_offline, deviationMinutes: deviation,
    };
  }

  private async audit(emp: EmployeeRow, action: string, resourceType: string, resourceId: string, correlationId: string) {
    await this.sb.admin.from("audit_logs").insert({ tenant_id: emp.tenant_id, actor_user_id: emp.user_id, actor_type: "user", action, resource_type: resourceType, resource_id: resourceId, correlation_id: correlationId });
  }
}

const toDevice = (d: DeviceRow): DeviceInfo => ({ id: d.id, status: d.status, platform: d.platform, deviceModel: d.device_model, osVersion: d.os_version, registeredAt: d.registered_at });
const toLocation = (l: LocationRow): WorkLocation => ({ id: l.id, name: l.name, address: l.address, latitude: l.latitude, longitude: l.longitude, radiusM: l.radius_m, maxAccuracyM: l.max_accuracy_m });
