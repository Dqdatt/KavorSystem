import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Query, Req, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import type { ApiEnvelope, BrandingKind } from "@kavor/contracts";
import type { CorrelatedRequest } from "../correlation.middleware.js";
import { AuthError, type AuthService, type EmployeeRow } from "../auth/auth.service.js";
import { AUTH_SERVICE } from "../auth/auth.controller.js";
import { isDate } from "../admin/validate.js";
import type { CompanyService } from "./company.service.js";

export const COMPANY_SERVICE = Symbol("COMPANY_SERVICE");
type Body = Record<string, unknown>;

function bearer(header?: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) throw new AuthError("AUTH_SESSION_EXPIRED", "Thiếu token đăng nhập.", 401);
  return m[1];
}
const invalid = (field: string) => new AuthError("VALIDATION_FAILED", `Thiếu hoặc sai trường "${field}".`, 400);

/* Thông tin công ty cho app nhân viên (/me/company, /me/policies, /me/privacy-consents) */
@Controller("me")
export class CompanyController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService | null,
    @Inject(COMPANY_SERVICE) private readonly company: CompanyService | null,
  ) {}

  private async run<T>(req: CorrelatedRequest, authz: string | undefined, fn: (svc: CompanyService, emp: EmployeeRow, cid: string) => Promise<T>): Promise<ApiEnvelope<T>> {
    const correlationId = req.correlationId ?? "unknown";
    try {
      if (!this.auth || !this.company) throw new AuthError("AUTH_NOT_CONFIGURED", "Máy chủ chưa cấu hình Supabase.", 503, true);
      const emp = await this.auth.employeeFromToken(bearer(authz));
      return { data: await fn(this.company, emp, correlationId), meta: { correlationId }, error: null };
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError("INTERNAL_ERROR", "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", 500, true);
      if (!(e instanceof AuthError)) console.error(`[${correlationId}]`, e);
      throw new HttpException({ data: null, meta: { correlationId }, error: { code: err.code, message: err.message, retryable: err.retryable } } satisfies ApiEnvelope<null>, err.status);
    }
  }

  @Get("company")
  get(@Req() r: CorrelatedRequest, @Headers("authorization") a?: string) { return this.run(r, a, (s, emp) => s.company(emp)); }

  /* Ảnh logo/bìa: app tải kèm header Authorization, phiên bản ảnh nằm ở query (?v=) làm khóa cache */
  @Get("company/branding/:kind")
  async branding(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Param("kind") kind: string, @Res({ passthrough: true }) res: Response) {
    const env = await this.run(r, a, async (s, emp) => {
      if (kind !== "logo" && kind !== "cover") throw new AuthError("NOT_FOUND", "Không tìm thấy.", 404);
      return s.brandingImage(emp.tenant_id, kind as BrandingKind);
    });
    res.setHeader("content-type", env.data!.contentType);
    res.setHeader("cache-control", "private, max-age=604800");
    return new StreamableFile(env.data!.data);
  }

  @Get("policies")
  policies(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Query("date") d?: string) {
    return this.run(r, a, (s, emp) => {
      if (d !== undefined && !isDate(d)) throw invalid("date");
      return s.policies(emp, d);
    });
  }

  @Post("privacy-consents") @HttpCode(200)
  consent(@Req() r: CorrelatedRequest, @Headers("authorization") a: string | undefined, @Headers("user-agent") ua: string | undefined, @Body() b: Body) {
    return this.run(r, a, (s, emp, cid) => {
      const termsId = b?.termsId, installationId = b?.installationId;
      if (typeof termsId !== "string" || !/^[0-9a-f-]{36}$/i.test(termsId)) throw invalid("termsId");
      if (installationId !== undefined && (typeof installationId !== "string" || installationId.length > 128)) throw invalid("installationId");
      return s.consent(emp, termsId, installationId as string | undefined, r.ip ?? "unknown", ua, cid);
    });
  }
}
