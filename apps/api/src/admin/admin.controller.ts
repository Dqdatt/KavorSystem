import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ApiEnvelope } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError } from "../auth/auth.service.js";
import { SupabaseGateway } from "../auth/supabase.js";
import { forbidden, resolveAdmin, WEB_PERMISSIONS, type AdminContext } from "./context.js";
import type { AttendanceAdmin, DeviceAction } from "./attendance-admin.service.js";
import type { EmployeesAdmin } from "./employees.service.js";
import type { ScheduleAdmin } from "./schedule.service.js";
import { date, nullableText, type Body as Json } from "./validate.js";

export const ADMIN_SERVICES = Symbol("ADMIN_SERVICES");
export type AdminServices = { employees: EmployeesAdmin; attendance: AttendanceAdmin; schedule: ScheduleAdmin };

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}

/* API cho web HR/Admin. Mỗi request: xác thực token → dựng ngữ cảnh quyền → service tự kiểm tra permission + phạm vi. */
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(SupabaseGateway) private readonly sb: SupabaseGateway | null,
    @Inject(ADMIN_SERVICES) private readonly svc: AdminServices | null,
  ) {}

  private async run<T>(req: CorrelatedRequest, authz: string | undefined, fn: (svc: AdminServices, ctx: AdminContext) => Promise<T>): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.sb || !this.svc) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const ctx = await resolveAdmin(this.sb, bearer(authz), correlationId);
      if (!WEB_PERMISSIONS.some((p) => ctx.can(p))) throw forbidden("Tài khoản của bạn không có quyền truy cập Kavor HR/Admin.");
      return { data: await fn(this.svc, ctx), meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  @Get("me")
  me(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.employees.me(c)); }

  @Get("overview")
  overview(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.employees.overview(c)); }

  @Get("org")
  org(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.employees.orgOptions(c)); }

  /* ---------- Nhân viên ---------- */
  @Get("employees")
  employees(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query() q: Record<string, string>) {
    return this.run(r, a, (s, c) => s.employees.list(c, { q: q.q, status: q.status, departmentId: q.departmentId, account: q.account }));
  }
  @Get("employees/:id")
  employee(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, c) => s.employees.detail(c, id)); }
  @Post("employees") @HttpCode(201)
  createEmployee(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.employees.create(c, b)); }
  @Patch("employees/:id")
  updateEmployee(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.employees.update(c, id, b)); }
  @Post("employees/:id/invite") @HttpCode(200)
  invite(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, c) => s.employees.invite(c, id)); }
  @Post("employees/:id/lock") @HttpCode(200)
  lock(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) {
    return this.run(r, a, (s, c) => s.employees.setLocked(c, id, true, nullableText(b, "reason", 300) ?? null));
  }
  @Post("employees/:id/unlock") @HttpCode(200)
  unlock(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) {
    return this.run(r, a, (s, c) => s.employees.setLocked(c, id, false, nullableText(b, "reason", 300) ?? null));
  }

  /* ---------- Chấm công ---------- */
  @Get("attendance/board")
  board(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("date") d?: string) {
    return this.run(r, a, (s, c) => s.attendance.board(c, d ? date({ date: d }, "date") : undefined));
  }
  @Get("attendance/rejected")
  rejected(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("from") from?: string, @Query("to") to?: string) {
    return this.run(r, a, (s, c) => s.attendance.rejected(c, from ? date({ from }, "from") : undefined, to ? date({ to }, "to") : undefined));
  }
  @Get("devices")
  devices(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("status") status?: string) { return this.run(r, a, (s, c) => s.attendance.listDevices(c, status)); }
  @Post("devices/:id/:action") @HttpCode(200)
  decide(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Param("action") action: string, @Body() b: Json) {
    return this.run(r, a, async (s, c) => {
      if (!["approve", "reject", "revoke"].includes(action)) throw new AuthError("NOT_FOUND", "Không tìm thấy.", 404);
      return s.attendance.decideDevice(c, id, action as DeviceAction, nullableText(b, "reason", 300) ?? null);
    });
  }

  /* ---------- Ca, địa điểm, áp dụng ---------- */
  @Get("shifts")
  shifts(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.schedule.shifts(c)); }
  @Post("shifts") @HttpCode(201)
  createShift(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.createShift(c, b)); }
  @Patch("shifts/:id")
  updateShift(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.updateShift(c, id, b)); }
  @Post("shifts/:id/versions") @HttpCode(201)
  shiftVersion(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.addShiftVersion(c, id, b)); }

  @Get("locations")
  locations(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.schedule.locations(c)); }
  @Post("locations") @HttpCode(201)
  createLocation(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.createLocation(c, b)); }
  @Patch("locations/:id")
  updateLocation(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.updateLocation(c, id, b)); }
  @Post("locations/:id/versions") @HttpCode(201)
  locationVersion(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.addLocationVersion(c, id, b)); }

  @Get("policy-assignments")
  assignments(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("kind") kind?: string) { return this.run(r, a, (s, c) => s.schedule.assignments(c, kind)); }
  @Post("policy-assignments") @HttpCode(201)
  createAssignment(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.createAssignment(c, b)); }
  @Post("policy-assignments/:id/end") @HttpCode(200)
  endAssignment(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.schedule.endAssignment(c, id, b)); }
}
