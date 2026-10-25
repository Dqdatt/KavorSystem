import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Patch, Post, Query, Req, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { ADMIN_ERRORS, type ApiEnvelope, type BrandingKind } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError } from "../auth/auth.service.js";
import { SupabaseGateway } from "../auth/supabase.js";
import { forbidden, resolveAdmin, WEB_PERMISSIONS, type AdminContext } from "./context.js";
import type { AttendanceAdmin, DeviceAction } from "./attendance-admin.service.js";
import type { EmployeesAdmin } from "./employees.service.js";
import type { ScheduleAdmin } from "./schedule.service.js";
import type { MfaAdmin } from "./mfa.service.js";
import type { RulesAdmin } from "./rules.service.js";
import { yearParam, type SettingsAdmin } from "./settings.service.js";
import type { CompanyService } from "../company/company.service.js";
import type { RequestsService } from "../timesheet/requests.service.js";
import { viewerOf } from "../timesheet/requests.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { LeaveService } from "../leave/leave.service.js";
import type { OvertimeService } from "../overtime/overtime.service.js";
import type { AdvanceService } from "../advance/advance.service.js";
import type { TimesheetAdmin } from "../timesheet/timesheet-admin.service.js";
import { date, nullableText, oneOf, type Body as Json } from "./validate.js";

export const ADMIN_SERVICES = Symbol("ADMIN_SERVICES");
export type AdminServices = {
  employees: EmployeesAdmin; attendance: AttendanceAdmin; schedule: ScheduleAdmin;
  settings: SettingsAdmin; rules: RulesAdmin; mfa: MfaAdmin; company: CompanyService;
  timesheets: TimesheetAdmin; requests: RequestsService; notifications: NotificationsService; leave: LeaveService; overtime: OvertimeService; advance: AdvanceService;
};

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}

/* API cho web HR/Admin. Mỗi request: xác thực token → dựng ngữ cảnh quyền → bắt buộc đã qua MFA (trừ các bước MFA)
   → service tự kiểm tra permission + phạm vi. */
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(SupabaseGateway) private readonly sb: SupabaseGateway | null,
    @Inject(ADMIN_SERVICES) private readonly svc: AdminServices | null,
  ) {}

  private async run<T>(req: CorrelatedRequest, authz: string | undefined, fn: (svc: AdminServices, ctx: AdminContext) => Promise<T> | T, opts: { mfaStep?: boolean } = {}): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.sb || !this.svc) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const ctx = await resolveAdmin(this.sb, bearer(authz), correlationId);
      if (!WEB_PERMISSIONS.some((p) => ctx.can(p))) throw forbidden("Tài khoản của bạn không có quyền truy cập Kavor HR/Admin.");
      if (!opts.mfaStep && !ctx.mfaSatisfied()) {
        throw new AuthError(ADMIN_ERRORS.mfaRequired, ctx.totpFactor() ? "Nhập mã từ ứng dụng xác thực để tiếp tục." : "Tài khoản quản trị cần bật xác thực hai lớp trước khi sử dụng.", 403);
      }
      return { data: await fn(this.svc, ctx), meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  /* ---------- Xác thực hai lớp (được gọi khi phiên mới ở aal1) ---------- */
  @Get("mfa")
  mfa(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.mfa.status(c), { mfaStep: true }); }
  @Post("mfa/enroll") @HttpCode(200)
  mfaEnroll(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.mfa.enroll(c), { mfaStep: true }); }
  @Post("mfa/verify") @HttpCode(200)
  mfaVerify(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.mfa.verify(c, b), { mfaStep: true }); }
  @Post("employees/:id/mfa-reset") @HttpCode(200)
  mfaReset(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.mfa.reset(c, id, b)); }

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

  /* ---------- Cài đặt doanh nghiệp ---------- */
  @Get("settings")
  settings(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.settings.get(c)); }
  @Patch("settings")
  updateSettings(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.settings.update(c, b)); }
  @Get("settings/checklist")
  checklist(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.settings.checklist(c)); }
  @Post("settings/branding/:kind") @HttpCode(200)
  uploadBranding(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("kind") kind: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.settings.uploadBranding(c, kind, b)); }
  @Post("settings/branding/:kind/remove") @HttpCode(200)
  removeBranding(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("kind") kind: string) { return this.run(r, a, (s, c) => s.settings.removeBranding(c, kind)); }
  /* Ảnh logo/bìa (nhị phân) — web hiển thị qua route Next cùng origin */
  @Get("settings/branding/:kind")
  async brandingImage(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("kind") kind: string, @Res({ passthrough: true }) res: Response) {
    const env = await this.run(r, a, (s, c) => { c.require("tenant.read"); return s.company.brandingImage(c.tenantId, oneOf({ kind }, "kind", ["logo", "cover"] as BrandingKind[])!); });
    res.setHeader("content-type", env.data!.contentType);
    res.setHeader("cache-control", "private, max-age=86400");
    return new StreamableFile(env.data!.data);
  }

  @Get("holidays")
  holidays(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("year") year?: string) { return this.run(r, a, (s, c) => s.settings.holidays(c, yearParam(year))); }
  @Post("holidays") @HttpCode(201)
  addHoliday(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.settings.addHoliday(c, b)); }
  @Post("holidays/:id/remove") @HttpCode(200)
  removeHoliday(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.settings.removeHoliday(c, id, b)); }

  @Get("privacy")
  privacy(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.settings.privacy(c)); }
  @Post("privacy/terms") @HttpCode(201)
  publishPrivacy(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.settings.publishPrivacy(c, b)); }

  /* ---------- Quy định nghiệp vụ (áp dụng dùng chung /policy-assignments) ---------- */
  @Get("rules")
  rules(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.rules.list(c)); }
  @Post("rules") @HttpCode(201)
  createRule(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.rules.create(c, b)); }
  @Patch("rules/:id")
  updateRule(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.rules.update(c, id, b)); }
  @Post("rules/:id/versions") @HttpCode(201)
  ruleVersion(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.rules.addVersion(c, id, b)); }

  /* ---------- Bảng công tháng ---------- */
  @Get("timesheets")
  timesheets(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("month") month?: string) { return this.run(r, a, (s, c) => s.timesheets.board(c, month)); }
  @Get("timesheets/export")
  async exportTimesheet(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("month") month: string | undefined, @Res({ passthrough: true }) res: Response) {
    const env = await this.run(r, a, (s, c) => s.timesheets.exportCsv(c, month));
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${env.data!.filename}"`);
    return env.data!.body;
  }
  @Get("timesheets/:employeeId")
  employeeTimesheet(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("employeeId") id: string, @Query("month") month?: string) { return this.run(r, a, (s, c) => s.timesheets.employee(c, id, month)); }
  @Post("timesheets/lock") @HttpCode(200)
  lockTimesheet(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.timesheets.lock(c, b)); }
  @Post("timesheets/unlock") @HttpCode(200)
  unlockTimesheet(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.timesheets.unlock(c, b)); }

  /* ---------- Đơn & phê duyệt ---------- */
  /* Nghỉ phép: bảng số dư theo phạm vi, sổ phép từng người, HR điều chỉnh / nhập phép tồn */
  @Get("leave")
  leaveBoard(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("year") year?: string) { return this.run(r, a, (s, c) => s.leave.board(c, year)); }
  @Get("leave/:employeeId")
  leaveEmployee(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("employeeId") id: string, @Query("year") year?: string) { return this.run(r, a, (s, c) => s.leave.employee(c, id, year)); }
  @Post("leave/:employeeId/adjust") @HttpCode(200)
  leaveAdjust(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("employeeId") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.leave.adjust(c, id, b)); }

  /* Làm thêm giờ: tổng hợp theo tháng trong phạm vi */
  @Get("overtime")
  overtimeBoard(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("month") month?: string) { return this.run(r, a, (s, c) => s.overtime.board(c, month)); }

  /* Tạm ứng lương (Kế toán): danh sách theo tháng khấu trừ, xác nhận đã chi; lương cơ bản */
  @Get("advances")
  advances(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("month") month?: string) { return this.run(r, a, (s, c) => s.advance.board(c, month)); }
  @Post("advances/:requestId/paid") @HttpCode(200)
  advancePaid(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("requestId") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.advance.markPaid(c, id, b)); }
  @Get("compensations")
  compensations(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.advance.compensations(c)); }
  @Post("compensations/:employeeId") @HttpCode(200)
  compensationSet(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("employeeId") id: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.advance.setCompensation(c, id, b)); }

  /* Thông báo của chính người đăng nhập web (hồ sơ nhân viên gắn với tài khoản) */
  @Get("notifications")
  notifications(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) {
    return this.run(r, a, (s, c) => c.actor ? s.notifications.feed(c.tenantId, c.actor.id) : Promise.resolve({ items: [], unread: 0 }));
  }
  @Post("notifications/read") @HttpCode(200)
  notificationsRead(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) {
    return this.run(r, a, (s, c) => c.actor ? s.notifications.markRead(c.tenantId, c.actor.id, b) : Promise.resolve({ items: [], unread: 0 }));
  }

  @Get("requests")
  requests(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("status") status?: string) { return this.run(r, a, (s, c) => s.requests.queue(c, { status })); }
  @Get("requests/:id")
  request(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, c) => s.requests.detail(c, id)); }
  @Post("approvals/:taskId/:action") @HttpCode(200)
  decideApproval(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("taskId") taskId: string, @Param("action") action: string, @Body() b: Json) {
    return this.run(r, a, (s, c) => {
      if (action !== "approve" && action !== "reject") throw new AuthError("NOT_FOUND", "Không tìm thấy.", 404);
      return s.requests.decide(viewerOf(c), taskId, action === "approve", b);
    });
  }
  @Get("workflows")
  workflows(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.requests.workflows(c)); }
  @Post("workflows/:type/versions") @HttpCode(201)
  workflowVersion(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("type") type: string, @Body() b: Json) { return this.run(r, a, (s, c) => s.requests.addWorkflowVersion(c, type, b)); }
}
