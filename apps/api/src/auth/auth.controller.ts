import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Post, Req } from "@nestjs/common";
import type { ApiEnvelope } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError, AuthService } from "./auth.service.js";

export const AUTH_SERVICE = Symbol("AUTH_SERVICE");

type Body = Record<string, unknown>;

function str(body: Body, key: string, max = 200): string {
  const v = body?.[key];
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new AuthError("VALIDATION_FAILED", `Thiếu hoặc sai trường "${key}".`, 400);
  return v;
}

@Controller()
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly auth: AuthService | null) {}

  private async run<T>(req: CorrelatedRequest, fn: (svc: AuthService, ip: string, cid: string) => Promise<T>): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.auth) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const data = await fn(this.auth, req.ip ?? "unknown", correlationId);
      return { data, meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  @Post("auth/activate/start") @HttpCode(200)
  activateStart(@Req() req: CorrelatedRequest, @Body() b: Body) {
    return this.run(req, (s, ip, cid) => s.startActivation(str(b, "employeeCode", 40), str(b, "email"), ip, cid));
  }

  @Post("auth/activate/verify") @HttpCode(200)
  activateVerify(@Req() req: CorrelatedRequest, @Headers("user-agent") ua: string | undefined, @Body() b: Body) {
    const installationId = typeof b?.installationId === "string" && b.installationId.length <= 128 ? b.installationId : undefined;
    return this.run(req, (s, ip, cid) => s.verifyActivation(str(b, "email"), str(b, "code", 6), str(b, "password", 128), ip, cid,
      b?.privacyAccepted === true ? { installationId, userAgent: ua } : undefined));
  }

  @Post("auth/login") @HttpCode(200)
  login(@Req() req: CorrelatedRequest, @Body() b: Body) {
    return this.run(req, (s, ip, cid) => s.login(str(b, "identifier"), str(b, "password", 128), ip, cid));
  }

  @Post("auth/password/forgot") @HttpCode(200)
  forgot(@Req() req: CorrelatedRequest, @Body() b: Body) {
    return this.run(req, (s, ip, cid) => s.forgotPassword(str(b, "identifier"), ip, cid));
  }

  @Post("auth/password/reset") @HttpCode(200)
  reset(@Req() req: CorrelatedRequest, @Body() b: Body) {
    return this.run(req, (s, ip, cid) => s.resetPassword(str(b, "email"), str(b, "code", 6), str(b, "newPassword", 128), ip, cid));
  }

  @Post("auth/refresh") @HttpCode(200)
  refresh(@Req() req: CorrelatedRequest, @Body() b: Body) {
    return this.run(req, (s) => s.refresh(str(b, "refreshToken", 4000)));
  }

  @Post("auth/logout") @HttpCode(200)
  logout(@Req() req: CorrelatedRequest, @Headers("authorization") authz?: string) {
    return this.run(req, async (s) => { await s.logout(bearer(authz)); return { ok: true }; });
  }

  @Get("me")
  me(@Req() req: CorrelatedRequest, @Headers("authorization") authz?: string) {
    return this.run(req, (s) => s.meFromToken(bearer(authz)));
  }
}

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}
