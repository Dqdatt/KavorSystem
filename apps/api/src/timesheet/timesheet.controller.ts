import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Query, Req, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import type { ApiEnvelope } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError, type AuthService, type EmployeeRow } from "../auth/auth.service.js";
import { AUTH_SERVICE } from "../auth/auth.controller.js";
import { invalid } from "../admin/context.js";
import type { Body as Json } from "../admin/validate.js";
import { MONTH, type TimesheetService } from "./timesheet.service.js";
import type { RequestsService, Viewer } from "./requests.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { LeaveService } from "../leave/leave.service.js";
import type { OvertimeService } from "../overtime/overtime.service.js";
import type { AdvanceService } from "../advance/advance.service.js";
import type { PayrollService } from "../payroll/payroll.service.js";
import type { AnnouncementsService } from "../announcements/announcements.service.js";
import type { DocumentsService } from "../documents/documents.service.js";
import type { ProfileService } from "../profile/profile.service.js";

export const TIMESHEET_SERVICES = Symbol("TIMESHEET_SERVICES");
export type TimesheetServices = { timesheets: TimesheetService; requests: RequestsService; notifications: NotificationsService; leave: LeaveService; overtime: OvertimeService; advance: AdvanceService; payroll: PayrollService; announcements: AnnouncementsService; documents: DocumentsService; profile: ProfileService };

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}

/* App nhân viên: bảng công tháng, giải trình, nghỉ phép, làm thêm giờ, đơn của tôi, duyệt (quản lý/HR), thông báo */
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
  @Get("leave")
  leave(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp) => s.leave.myLeave(emp)); }
  @Post("requests/leave") @HttpCode(201)
  leaveRequest(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, emp, v) => s.leave.createLeave(emp, b, v.correlationId)); }
  @Get("overtime")
  overtime(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp) => s.overtime.myOvertime(emp)); }
  @Post("requests/overtime") @HttpCode(201)
  overtimeRequest(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, emp, v) => s.overtime.createOvertime(emp, b, v.correlationId)); }
  @Get("advance")
  advance(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp, v) => s.advance.myAdvance(emp, v.correlationId)); }
  @Post("requests/advance") @HttpCode(201)
  advanceRequest(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, emp, v) => s.advance.createAdvance(emp, b, v.correlationId)); }
  @Get("payslips")
  payslips(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp, v) => s.payroll.myPayslips(emp, v.correlationId)); }
  @Get("payslips/:month")
  payslip(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("month") m: string) { return this.run(r, a, (s, emp, v) => s.payroll.myPayslip(emp, m, v.correlationId)); }
  @Get("announcements")
  announcements(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp) => s.announcements.mine(emp)); }
  @Get("announcements/:id")
  announcement(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, emp) => s.announcements.one(emp, id)); }
  @Post("announcements/:id/file-link") @HttpCode(200)
  announcementLink(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, emp) => s.announcements.fileLink(emp, id)); }
  /* Mở file trong trình duyệt hệ thống: không có header Authorization, xác thực bằng chữ ký ngắn hạn từ file-link */
  @Get("announcements/:id/file")
  async announcementFile(@Req() r: CorrelatedRequest, @Param("id") id: string, @Query("e") e: string, @Query("exp") exp: string, @Query("sig") sig: string, @Res({ passthrough: true }) res: Response) {
    return this.signedFile(r, res, (s) => s.announcements.linkedFile(id, String(e ?? ""), Number(exp), String(sig ?? "")));
  }
  /* Trả file nhị phân cho liên kết ký (không có header Authorization): lỗi vẫn theo envelope chung */
  private async signedFile(r: CorrelatedRequest, res: Response, fn: (s: TimesheetServices, correlationId: string) => Promise<{ data: Buffer; contentType: string; name: string }>) {
    const correlationId = r.correlationId ?? "unknown";
    try {
      if (!this.svc) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const f = await fn(this.svc, correlationId);
      res.setHeader("content-type", f.contentType);
      res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
      res.setHeader("cache-control", "private, no-store");
      res.setHeader("x-content-type-options", "nosniff");
      return new StreamableFile(f.data);
    } catch (err) {
      const x = err instanceof AuthError ? err : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(err instanceof AuthError)) console.error(`[${correlationId}]`, err);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: x.code, message: x.message, retryable: x.retryable } } satisfies ApiEnvelope<null>, x.status);
    }
  }
  @Get("documents")
  documents(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp) => s.documents.mine(emp)); }
  @Post("documents/:id/file-link") @HttpCode(200)
  documentLink(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, emp) => s.documents.fileLink(emp, id)); }
  /* Mở tài liệu trong trình duyệt hệ thống: xác thực bằng chữ ký ngắn hạn từ file-link, mỗi lần tải ghi audit */
  @Get("documents/:id/file")
  async documentFile(@Req() r: CorrelatedRequest, @Param("id") id: string, @Query("e") e: string, @Query("exp") exp: string, @Query("sig") sig: string, @Res({ passthrough: true }) res: Response) {
    return this.signedFile(r, res, (s, correlationId) => s.documents.linkedFile(id, String(e ?? ""), Number(exp), String(sig ?? ""), correlationId));
  }
  @Post("requests/profile") @HttpCode(201)
  profileRequest(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, emp, v) => s.profile.createChange(emp, b, v.correlationId)); }
  @Post("requests/:id/cancel") @HttpCode(200)
  cancel(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, emp, v) => s.requests.cancel(emp, id, v.correlationId)); }

  @Get("notifications")
  notifications(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp) => s.notifications.feed(emp.tenant_id, emp.id)); }
  @Post("notifications/read") @HttpCode(200)
  notificationsRead(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, emp) => s.notifications.markRead(emp.tenant_id, emp.id, b)); }

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
