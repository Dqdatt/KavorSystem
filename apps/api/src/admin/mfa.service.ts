/* Xác thực hai lớp (TOTP của Supabase Auth) cho web HR/Admin. Đăng nhập mật khẩu cho phiên aal1; phiên chỉ dùng được
   web sau khi nhập mã từ ứng dụng xác thực (aal2). Lần đầu: liên kết ứng dụng (quét QR) rồi nhập mã để xác nhận. */
import { AUTH_ERRORS, type AuthSession, type MfaEnrollment, type MfaStatus } from "@kavor/contracts";
import { AuthError, RateLimiter } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { MFA_REQUIRED_FOR_WEB, conflict, forbidden, invalid, notFound, type AdminContext } from "./context.js";
import { nullableText, req, uuid, type Body } from "./validate.js";

type Verified = { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number };

export class MfaAdmin {
  /* Mã TOTP chỉ có 10^6 khả năng: giới hạn số lần nhập sai theo tài khoản */
  private readonly limiter = new RateLimiter(5, 5 * 60_000);

  constructor(private readonly sb: SupabaseGateway) {}

  status(ctx: AdminContext): MfaStatus {
    const f = ctx.totpFactor();
    return { required: MFA_REQUIRED_FOR_WEB, enrolled: !!f, verified: ctx.aal === "aal2", factorId: f?.id ?? null };
  }

  async enroll(ctx: AdminContext): Promise<MfaEnrollment> {
    if (ctx.totpFactor()) throw conflict("Tài khoản đã liên kết ứng dụng xác thực. Nhập mã 6 số từ ứng dụng để tiếp tục.");
    /* Lần liên kết trước bỏ dở (chưa nhập mã) thì xóa để tạo mã QR mới */
    for (const f of ctx.factors.filter((x) => x.status !== "verified")) await ctx.db.auth.admin.mfa.deleteFactor({ id: f.id, userId: ctx.userId });
    const r = await this.sb.authRequest<{ id: string; totp: { qr_code: string; secret: string; uri: string } }>("POST", "/factors", ctx.accessToken, {
      factor_type: "totp", issuer: "Kavor", friendly_name: `Kavor HR ${new Date().toISOString().slice(0, 19)}`,
    });
    if (!r.data) throw new AuthError("MFA_UNAVAILABLE", r.message ?? "Chưa tạo được mã liên kết. Vui lòng thử lại.", r.status >= 500 ? 503 : 400, r.status >= 500);
    /* GoTrue trả SVG thô; đổi sang data URI để web đặt thẳng vào <img> */
    const qr = r.data.totp.qr_code;
    return { factorId: r.data.id, qrCode: qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`, secret: r.data.totp.secret, uri: r.data.totp.uri };
  }

  /* Nhập mã 6 số → phiên mới aal2 (web ghi lại cookie) */
  async verify(ctx: AdminContext, b: Body): Promise<AuthSession> {
    const factorId = uuid(b, "factorId")!;
    const code = req(b, "code", { pattern: /^\d{6}$/, hint: "6 chữ số" });
    const factor = ctx.factors.find((f) => f.id === factorId && f.factor_type === "totp");
    if (!factor) throw notFound("ứng dụng xác thực");
    return this.limiter.guard(`mfa:${ctx.userId}`, async () => {
      const ch = await this.sb.authRequest<{ id: string }>("POST", `/factors/${factorId}/challenge`, ctx.accessToken, {});
      if (!ch.data) throw new AuthError("MFA_UNAVAILABLE", "Chưa tạo được lượt xác thực. Vui lòng thử lại.", 503, true);
      const v = await this.sb.authRequest<Verified>("POST", `/factors/${factorId}/verify`, ctx.accessToken, { challenge_id: ch.data.id, code });
      if (!v.data) {
        if (v.status >= 500) throw new AuthError("MFA_UNAVAILABLE", "Máy chủ xác thực đang bận. Vui lòng thử lại.", 503, true);
        throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã xác thực không đúng hoặc đã hết hạn. Kiểm tra giờ trên điện thoại rồi thử mã mới.", 400);
      }
      await ctx.audit(factor.status === "verified" ? "auth.mfa_verified" : "auth.mfa_enrolled", "user", ctx.actor?.id ?? null);
      return { accessToken: v.data.access_token, refreshToken: v.data.refresh_token, expiresAt: v.data.expires_at ?? Math.floor(Date.now() / 1000) + (v.data.expires_in ?? 3600) };
    });
  }

  /* Mất điện thoại: người có quyền khóa tài khoản xóa liên kết để nhân viên liên kết lại ở lần đăng nhập sau */
  async reset(ctx: AdminContext, employeeId: string, b: Body) {
    await ctx.requireEmployee("membership.disable", employeeId);
    const reason = nullableText(b, "reason", 300);
    if (!reason || reason.length < 5) throw invalid("Ghi lý do đặt lại xác thực hai lớp (ít nhất 5 ký tự).");
    if (ctx.actor?.id === employeeId) throw forbidden("Không tự đặt lại xác thực hai lớp của chính mình. Nhờ một quản trị viên khác.");
    const { data: emp } = await ctx.db.from("employees").select("user_id").eq("id", employeeId).eq("tenant_id", ctx.tenantId).maybeSingle();
    const userId = (emp as { user_id: string | null } | null)?.user_id;
    if (!userId) throw conflict("Nhân viên chưa kích hoạt tài khoản.");
    const { data, error } = await ctx.db.auth.admin.mfa.listFactors({ userId });
    if (error) throw error;
    const factors = data?.factors ?? [];
    for (const f of factors) await ctx.db.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    await ctx.audit("auth.mfa_reset", "employee", employeeId, { factors: factors.length }, { factors: 0 }, reason);
    return { removed: factors.length };
  }
}
