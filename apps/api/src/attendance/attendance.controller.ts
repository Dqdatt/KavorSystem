import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Post, Query, Req } from "@nestjs/common";
import type { ApiEnvelope, AttendanceKind, DevicePlatform } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError, type AuthService, type EmployeeRow } from "../auth/auth.service.js";
import { AUTH_SERVICE } from "../auth/auth.controller.js";
import type { AttendanceService } from "./attendance.service.js";

export const ATTENDANCE_SERVICE = Symbol("ATTENDANCE_SERVICE");
type Body = Record<string, unknown>;

const invalid = (field: string) => new AuthError("VALIDATION_FAILED", `Thiếu hoặc sai trường "${field}".`, 400);
function str(b: Body, k: string, min = 1, max = 128, optional = false): string | undefined {
  const v = b?.[k];
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string" || v.trim().length < min || v.length > max) throw invalid(k);
  return v.trim();
}
function num(b: Body, k: string, lo: number, hi: number): number {
  const v = b?.[k];
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw invalid(k);
  return v;
}
function oneOf<T extends string>(b: Body, k: string, options: readonly T[]): T {
  const v = b?.[k];
  if (typeof v !== "string" || !options.includes(v as T)) throw invalid(k);
  return v as T;
}
function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}

@Controller()
export class AttendanceController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService | null,
    @Inject(ATTENDANCE_SERVICE) private readonly attendance: AttendanceService | null,
  ) {}

  private async run<T>(req: CorrelatedRequest, authz: string | undefined, fn: (svc: AttendanceService, emp: EmployeeRow, cid: string) => Promise<T>): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.auth || !this.attendance) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const emp = await this.auth.employeeFromToken(bearer(authz));
      return { data: await fn(this.attendance, emp, correlationId), meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  @Post("me/devices") @HttpCode(200)
  registerDevice(@Req() req: CorrelatedRequest, @Headers("authorization") authz: string | undefined, @Body() b: Body) {
    return this.run(req, authz, (svc, emp, cid) => svc.registerDevice(emp, {
      installationId: str(b, "installationId", 8)!,
      platform: oneOf<DevicePlatform>(b, "platform", ["ios", "android"]),
      deviceModel: str(b, "deviceModel", 1, 80, true),
      osVersion: str(b, "osVersion", 1, 40, true),
      appVersion: str(b, "appVersion", 1, 40, true),
    }, cid));
  }

  @Get("me/attendance/today")
  today(@Req() req: CorrelatedRequest, @Headers("authorization") authz: string | undefined, @Query("installationId") installationId?: string) {
    return this.run(req, authz, (svc, emp) => svc.today(emp, installationId));
  }

  @Post("me/attendance/events") @HttpCode(200)
  record(@Req() req: CorrelatedRequest, @Headers("authorization") authz: string | undefined, @Headers("idempotency-key") idem: string | undefined, @Body() b: Body) {
    return this.run(req, authz, async (svc, emp, cid) => {
      /* Idempotency-Key (theo API contract) hoặc clientEventId trong body đều được */
      const clientEventId = (idem && idem.length >= 8 && idem.length <= 128 ? idem : str(b, "clientEventId", 8))!;
      const { event } = await svc.record(emp, {
        clientEventId,
        kind: oneOf<AttendanceKind>(b, "kind", ["in", "out"]),
        installationId: str(b, "installationId", 8)!,
        latitude: num(b, "latitude", -90, 90),
        longitude: num(b, "longitude", -180, 180),
        accuracyM: num(b, "accuracyM", 0, 100000),
        occurredAt: str(b, "occurredAt", 10, 40, true),
        offline: b?.offline === true,
      }, cid);
      return event;
    });
  }
}
