import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Req } from "@nestjs/common";
import { ADMIN_ERRORS, AUTH_ERRORS, type ApiEnvelope, type AuthSession, type ConsoleAuthResult } from "@kavor/contracts";
import type { Session } from "@supabase/supabase-js";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError, RateLimiter } from "../auth/auth.service.js";
import { SupabaseGateway } from "../auth/supabase.js";
import type { MfaAdmin } from "../admin/mfa.service.js";
import { EMAIL, req, type Body as Json } from "../admin/validate.js";
import { operatorOf, resolveConsole, type ConsoleContext } from "./context.js";
import type { ConsoleService } from "./console.service.js";

export const CONSOLE_SERVICES = Symbol("CONSOLE_SERVICES");
export type ConsoleServices = { console: ConsoleService; mfa: MfaAdmin };

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError(AUTH_ERRORS.sessionExpired, "Thiếu token đăng nhập.", 401);
  return m[1];
}
const toSession = (s: Session): AuthSession => ({ accessToken: s.access_token, refreshToken: s.refresh_token, expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600) });

/* API của Kavor Console. Đăng nhập riêng (nhân viên Kavor không phải nhân viên tenant), luôn bắt buộc MFA. */
@Controller("console")
export class ConsoleController {
  private readonly loginLimiter = new RateLimiter(5, 5 * 60_000);

  constructor(
    @Inject(SupabaseGateway) private readonly sb: SupabaseGateway | null,
    @Inject(CONSOLE_SERVICES) private readonly svc: ConsoleServices | null,
  ) {}

  private async envelope<T>(req: CorrelatedRequest, fn: (sb: SupabaseGateway, svc: ConsoleServices, cid: string) => Promise<T> | T): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.sb || !this.svc) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      return { data: await fn(this.sb, this.svc, correlationId), meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  private run<T>(req: CorrelatedRequest, authz: string | undefined, fn: (svc: ConsoleServices, ctx: ConsoleContext) => Promise<T> | T, opts: { mfaStep?: boolean } = {}) {
    return this.envelope(req, async (sb, svc, cid) => {
      const ctx = await resolveConsole(sb, bearer(authz), cid);
      if (!opts.mfaStep && !ctx.mfaSatisfied()) {
        throw new AuthError(ADMIN_ERRORS.mfaRequired, ctx.totpFactor() ? "Nhập mã từ ứng dụng xác thực để tiếp tục." : "Tài khoản Kavor Console cần bật xác thực hai lớp trước khi sử dụng.", 403);
      }
      return fn(svc, ctx);
    });
  }

  /* ---------- Đăng nhập ---------- */
  @Post("auth/login") @HttpCode(200)
  login(@Req() r: CorrelatedRequest, @Body() b: Json) {
    return this.envelope(r, async (sb) => {
      const email = req(b, "email", { pattern: EMAIL, max: 200 }).toLowerCase();
      const password = req(b, "password", { max: 128 });
      return this.loginLimiter.guard(`console:${r.ip}:${email}`, async (): Promise<ConsoleAuthResult> => {
        const invalidLogin = new AuthError(AUTH_ERRORS.invalidCredentials, "Email hoặc mật khẩu không đúng.", 401);
        const { data, error } = await sb.authClient().auth.signInWithPassword({ email, password });
        if (error || !data.session) throw invalidLogin;
        const op = await operatorOf(sb, data.user.id);
        /* Tài khoản tenant đúng mật khẩu vẫn báo chung chung: không tiết lộ ai là nhân viên Kavor */
        if (!op) { await sb.admin.auth.admin.signOut(data.session.access_token, "local").catch(() => undefined); throw invalidLogin; }
        await sb.admin.from("audit_logs").insert({ tenant_id: null, actor_user_id: op.userId, actor_type: "platform", action: "console.login", resource_type: "platform_operator", resource_id: op.userId, correlation_id: r.correlationId ?? "unknown" });
        return { session: toSession(data.session), operator: op };
      });
    });
  }

  @Post("auth/refresh") @HttpCode(200)
  refresh(@Req() r: CorrelatedRequest, @Body() b: Json) {
    return this.envelope(r, async (sb): Promise<ConsoleAuthResult> => {
      const expired = new AuthError(AUTH_ERRORS.sessionExpired, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
      const { data, error } = await sb.authClient().auth.refreshSession({ refresh_token: req(b, "refreshToken", { max: 4000 }) });
      if (error || !data.session || !data.user) throw expired;
      const op = await operatorOf(sb, data.user.id);
      if (!op) throw expired;
      return { session: toSession(data.session), operator: op };
    });
  }

  @Post("auth/logout") @HttpCode(200)
  logout(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) {
    return this.envelope(r, async (sb) => { await sb.admin.auth.admin.signOut(bearer(a), "local").catch(() => undefined); return { ok: true }; });
  }

  @Get("mfa")
  mfa(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.mfa.status(c), { mfaStep: true }); }
  @Post("mfa/enroll") @HttpCode(200)
  mfaEnroll(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.mfa.enroll(c), { mfaStep: true }); }
  @Post("mfa/verify") @HttpCode(200)
  mfaVerify(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.mfa.verify(c, b), { mfaStep: true }); }

  /* ---------- Vận hành ---------- */
  @Get("me")
  me(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (_s, c) => c.operator); }
  @Get("overview")
  overview(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.console.overview(c)); }

  @Get("tenants")
  tenants(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.console.tenants(c)); }
  @Post("tenants") @HttpCode(201)
  createTenant(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.console.createTenant(c, b)); }
  @Get("tenants/:id")
  tenant(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string) { return this.run(r, a, (s, c) => s.console.tenant(c, id)); }
  @Post("tenants/:id/admins/:employeeId/invite") @HttpCode(200)
  invite(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Param("employeeId") employeeId: string) {
    return this.run(r, a, (s, c) => s.console.resendInvite(c, id, employeeId));
  }

  @Get("recoveries")
  recoveries(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.console.recoveries(c)); }
  @Post("recoveries") @HttpCode(201)
  requestRecovery(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Body() b: Json) { return this.run(r, a, (s, c) => s.console.requestRecovery(c, b)); }
  @Post("recoveries/:id/:action") @HttpCode(200)
  decide(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("id") id: string, @Param("action") action: string, @Body() b: Json) {
    return this.run(r, a, (s, c) => {
      if (action !== "approve" && action !== "reject" && action !== "cancel") throw new AuthError("NOT_FOUND", "Không tìm thấy.", 404);
      return s.console.decideRecovery(c, id, action, b);
    });
  }

  @Get("audit")
  audit(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, c) => s.console.audit(c)); }
}
