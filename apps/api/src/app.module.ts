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

@Module({
  controllers: [AppController, AuthController, AttendanceController, AdminController],
  providers: [
    AppService,
    /* Chưa cấu hình Supabase (dev chỉ dùng dữ liệu mẫu) thì các endpoint auth trả 503 */
    { provide: SupabaseGateway, useFactory: () => { const c = loadConfig().supabase; return c ? new SupabaseGateway(c) : null; } },
    { provide: AUTH_SERVICE, inject: [SupabaseGateway], useFactory: (sb: SupabaseGateway | null) => (sb ? new AuthService(sb) : null) },
    { provide: ATTENDANCE_SERVICE, inject: [SupabaseGateway], useFactory: (sb: SupabaseGateway | null) => (sb ? new AttendanceService(sb) : null) },
    {
      provide: ADMIN_SERVICES, inject: [SupabaseGateway],
      useFactory: (sb: SupabaseGateway | null) => {
        if (!sb) return null;
        const attendance = new AttendanceAdmin(sb);
        return { attendance, employees: new EmployeesAdmin(sb, new Mailer(loadConfig().mail), attendance), schedule: new ScheduleAdmin(sb) };
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
