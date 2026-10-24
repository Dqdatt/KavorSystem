import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { ApiEnvelope } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError, type AuthService, type EmployeeRow } from "../auth/auth.service.js";
import { AUTH_SERVICE } from "../auth/auth.controller.js";
import { invalid } from "../admin/context.js";
import type { Body as Json } from "../admin/validate.js";
import { MONTH, type TimesheetService } from "./timesheet.service.js";
import type { RequestsService, Viewer } from "./requests.service.js";

export const TIMESHEET_SERVICES = Symbol("TIMESHEET_SERVICES");
export type TimesheetServices = { timesheets: TimesheetService; requests: RequestsService };

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}

/* App nhân viên: bảng công tháng, giải trình, đơn của tôi, duyệt (quản lý/HR) */
@Controller("me")
export class TimesheetController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService | null,
    @Inject(TIMESHEET_SERVICES) private readonly svc: TimesheetServices | null,
  ) {}

  private async run<T>(req: CorrelatedRequest, authz: string | undefined, fn: (svc: TimesheetServices, emp: EmployeeRow, v: Viewer) => Promise<T>): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.auth || !this.svc) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const emp = await this.auth.employeeFromToken(bearer(authz));
      const v: Viewer = { userId: emp.user_id ?? "", employeeId: emp.id, tenantId: emp.tenant_id, correlationId };
      return { data: await fn(this.svc, emp, v), meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  @Get("timesheet")
  timesheet(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("month") month?: string) {
    return this.run(r, a, (s, emp) => {
      if (month !== undefined && !MONTH.test(month)) throw invalid("Tháng phải có dạng YYYY-MM.");
      return s.requests.myTimesheet(emp, month);
    });
  }

  @Get("requests")
  mine(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp, v) => s.requests.mine(emp, v.correlationId)); }
  @Post("requests/explanations") @HttpCode(201)
  explain(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, emp, v) => s.requests.createExplanation(emp, b, v.correlationId)); }
  @Post("requests/:id/cancel") @HttpCode(200)
  cancel(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, emp, v) => s.requests.cancel(emp, id, v.correlationId)); }

  @Get("approvals")
  approvals(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, _e, v) => s.requests.approvals(v)); }
  @Post("approvals/:taskId/:action") @HttpCode(200)
  decide(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("taskId") taskId: string, @Param("action") action: string, @Body() b: Json) {
    return this.run(r, a, (s, _e, v) => {
      if (action !== "approve" && action !== "reject") throw new AuthError("NOT_FOUND", "Không tìm thấy.", 404);
      return s.requests.decide(v, taskId, action === "approve", b);
    });
  }
}
