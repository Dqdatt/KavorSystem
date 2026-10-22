import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { CorrelationMiddleware } from "./correlation.middleware.js";
import { AuthController, AUTH_SERVICE } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { SupabaseGateway } from "./auth/supabase.js";
import { loadConfig } from "./config.js";

@Module({
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    /* Chưa cấu hình Supabase (dev chỉ dùng dữ liệu mẫu) thì các endpoint auth trả 503 */
    { provide: AUTH_SERVICE, useFactory: () => { const c = loadConfig().supabase; return c ? new AuthService(new SupabaseGateway(c)) : null; } },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
