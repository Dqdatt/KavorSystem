import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { CorrelationMiddleware } from "./correlation.middleware.js";
import { AuthController, AUTH_SERVICE } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { SupabaseGateway } from "./auth/supabase.js";
import { loadConfig } from "./config.js";
import { AttendanceController, ATTENDANCE_SERVICE } from "./attendance/attendance.controller.js";
import { AttendanceService } from "./attendance/attendance.service.js";
import { AdminController, ADMIN_SERVICES } from "./admin/admin.controller.js";
import { AttendanceAdmin } from "./admin/attendance-admin.service.js";
import { EmployeesAdmin } from "./admin/employees.service.js";
import { Mailer } from "./admin/mailer.js";
import { ScheduleAdmin } from "./admin/schedule.service.js";
import { SettingsAdmin } from "./admin/settings.service.js";
import { RulesAdmin } from "./admin/rules.service.js";
import { MfaAdmin } from "./admin/mfa.service.js";
import { BrandingStore } from "./company/branding.js";
import { CompanyService } from "./company/company.service.js";
import { CompanyController, COMPANY_SERVICE } from "./company/company.controller.js";
import { ConsoleController, CONSOLE_SERVICES } from "./console/console.controller.js";
import { OperatorsService } from "./console/operators.service.js";
import { ConsoleService } from "./console/console.service.js";
import { SupportService } from "./support/support.service.js";
import { OrgAdmin } from "./admin/org.service.js";
import { EmployeeImport } from "./admin/import.service.js";
import { TimesheetController, TIMESHEET_SERVICES } from "./timesheet/timesheet.controller.js";
import { TimesheetService } from "./timesheet/timesheet.service.js";
import { RequestsService } from "./timesheet/requests.service.js";
import { TimesheetAdmin } from "./timesheet/timesheet-admin.service.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { LeaveService } from "./leave/leave.service.js";
import { OvertimeService } from "./overtime/overtime.service.js";
import { AdvanceService } from "./advance/advance.service.js";
import { PayrollService } from "./payroll/payroll.service.js";
import { AnnouncementsService } from "./announcements/announcements.service.js";
import { DocumentsService } from "./documents/documents.service.js";
import { ProfileService } from "./profile/profile.service.js";
import type { TimesheetServices } from "./timesheet/timesheet.controller.js";

@Module({
  controllers: [AppController, AuthController, AttendanceController, CompanyController, TimesheetController, AdminController, ConsoleController],
  providers: [
    AppService,
    /* Chưa cấu hình Supabase (dev chỉ dùng dữ liệu mẫu) thì các endpoint auth trả 503 */
    { provide: SupabaseGateway, useFactory: () => { const c = loadConfig().supabase; return c ? new SupabaseGateway(c) : null; } },
    { provide: AUTH_SERVICE, inject: [SupabaseGateway], useFactory: (sb: SupabaseGateway | null) => (sb ? new AuthService(sb) : null) },
    { provide: ATTENDANCE_SERVICE, inject: [SupabaseGateway], useFactory: (sb: SupabaseGateway | null) => (sb ? new AttendanceService(sb) : null) },
    {
      provide: TIMESHEET_SERVICES, inject: [SupabaseGateway],
      useFactory: (sb: SupabaseGateway | null) => {
        if (!sb) return null;
        const timesheets = new TimesheetService(sb);
        const notifications = new NotificationsService(sb);
        notifications.startDueSweep();
        const requests = new RequestsService(sb, timesheets);
        return { timesheets, requests, notifications, leave: new LeaveService(sb, timesheets, requests), overtime: new OvertimeService(sb, timesheets, requests), advance: new AdvanceService(sb, timesheets, requests), payroll: new PayrollService(sb, timesheets), announcements: new AnnouncementsService(sb), documents: new DocumentsService(sb), profile: new ProfileService(sb, requests) };
      },
    },
    {
      provide: CONSOLE_SERVICES, inject: [SupabaseGateway],
      useFactory: (sb: SupabaseGateway | null) => {
        if (!sb) return null;
        const c = loadConfig();
        const mailer = new Mailer(c.mail);
        return { console: new ConsoleService(sb, mailer, c.adminWebUrl), mfa: new MfaAdmin(sb), support: new SupportService(sb), operators: new OperatorsService(sb, mailer, c.consoleWebUrl, c.consoleBootstrap) };
      },
    },
    { provide: BrandingStore, inject: [SupabaseGateway], useFactory: (sb: SupabaseGateway | null) => (sb ? new BrandingStore(sb) : null) },
    { provide: COMPANY_SERVICE, inject: [SupabaseGateway, BrandingStore], useFactory: (sb: SupabaseGateway | null, b: BrandingStore | null) => (sb && b ? new CompanyService(sb, b) : null) },
    {
      provide: ADMIN_SERVICES, inject: [SupabaseGateway, BrandingStore, COMPANY_SERVICE, TIMESHEET_SERVICES],
      useFactory: (sb: SupabaseGateway | null, branding: BrandingStore | null, company: CompanyService | null, ts: TimesheetServices | null) => {
        if (!sb || !branding || !company || !ts) return null;
        const attendance = new AttendanceAdmin(sb);
        const schedule = new ScheduleAdmin(sb);
        return {
          attendance, schedule, company,
          employees: new EmployeesAdmin(sb, new Mailer(loadConfig().mail), attendance),
          settings: new SettingsAdmin(sb, branding, schedule), rules: new RulesAdmin(schedule), mfa: new MfaAdmin(sb),
          timesheets: new TimesheetAdmin(ts.timesheets, ts.requests), requests: ts.requests, notifications: ts.notifications, leave: ts.leave, overtime: ts.overtime, advance: ts.advance, payroll: ts.payroll, announcements: ts.announcements, documents: ts.documents, support: new SupportService(sb), org: new OrgAdmin(sb), importer: new EmployeeImport(sb),
        };
      },
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
