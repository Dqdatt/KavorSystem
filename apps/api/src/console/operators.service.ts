/* Nhân viên Kavor trên Kavor Console: quản trị viên (platform_admin) mời / đổi vai trò / khóa / đặt lại xác thực hai lớp ngay trên web,
   không chạy lệnh. Người được mời (và quản trị viên đầu tiên — email CONSOLE_BOOTSTRAP_EMAIL khi nền tảng chưa có quản trị viên) tự đặt
   mật khẩu bằng mã OTP gửi về email; cùng luồng đó dùng cho "Quên mật khẩu" của người đang hoạt động. */
import {
  AUTH_ERRORS, OPERATOR_ROLES, maskEmail, passwordProblems,
  type ConsoleAuthResult, type ConsoleOperator, type ConsoleOperators, type OperatorInvite, type OperatorInviteResult, type OperatorRole, type OtpSentResponse,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound } from "../admin/context.js";
import type { Mailer } from "../admin/mailer.js";
import { EMAIL, oneOf, req, type Body } from "../admin/validate.js";
import { operatorOf, type ConsoleContext } from "./context.js";

const ROLES = Object.keys(OPERATOR_ROLES) as OperatorRole[];
const OTP_TTL_SECONDS = 600;
type OpRow = { user_id: string; email: string; full_name: string; role: OperatorRole; status: "active" | "disabled"; created_at: string };
type InviteRow = { id: string; email: string; full_name: string; role: OperatorRole; status: "pending" | "accepted" | "revoked"; invited_by: string; sent_at: string | null; expires_at: string; created_at: string };
const INVITE_COLS = "id, email, full_name, role, status, invited_by, sent_at, expires_at, created_at";
/* Việc cần làm khi nhập mã OTP: kích hoạt (lời mời / quản trị viên đầu tiên) hoặc đặt lại mật khẩu */
type Purpose = { kind: "activate"; role: OperatorRole; fullName: string; inviteId: string | null } | { kind: "reset"; userId: string } | null;

const vnTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export class OperatorsService {
  constructor(
    private readonly sb: SupabaseGateway,
    private readonly mailer: Mailer,
    private readonly consoleWebUrl: string,
    private readonly bootstrap: { email: string; fullName: string } | null,
  ) {}

  /* ---------- Kích hoạt / quên mật khẩu (chưa đăng nhập) ---------- */
  private async purpose(email: string): Promise<Purpose> {
    const db = this.sb.admin;
    const { data: op } = await db.from("platform_operators").select("user_id, status").eq("email", email).maybeSingle();
    if (op) return (op as { status: string }).status === "active" ? { kind: "reset", userId: (op as { user_id: string }).user_id } : null;
    const { data: inv } = await db.from("platform_operator_invites").select(INVITE_COLS).eq("email", email).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (inv) { const i = inv as InviteRow; return { kind: "activate", role: i.role, fullName: i.full_name, inviteId: i.id }; }
    if (this.bootstrap && email === this.bootstrap.email) {
      const { count } = await db.from("platform_operators").select("user_id", { count: "exact", head: true }).eq("role", "platform_admin").eq("status", "active");
      if (!count) return { kind: "activate", role: "platform_admin", fullName: this.bootstrap.fullName, inviteId: null };
    }
    return null;
  }

  /* Luôn trả cùng một câu trả lời dù email có thuộc nhân viên Kavor hay không (không lộ ai là nhân viên Kavor) */
  async startPassword(b: Body): Promise<OtpSentResponse> {
    const email = req(b, "email", { pattern: EMAIL, max: 200, hint: "email" }).toLowerCase();
    const p = await this.purpose(email);
    if (p?.kind === "activate") {
      /* Email đã là tài khoản nhân viên doanh nghiệp (đã kích hoạt) thì không dùng chung cho Console */
      const { data: emp } = await this.sb.admin.from("employees").select("id").eq("work_email", email).not("user_id", "is", null).limit(1);
      if (emp?.length) throw conflict("Email này đang là tài khoản nhân viên của một doanh nghiệp. Nhân viên Kavor dùng email riêng.");
      const { error } = await this.sb.admin.auth.admin.createUser({ email, email_confirm: true });
      if (error && !/already.*registered|already exists/i.test(error.message)) throw new AuthError("AUTH_OTP_SEND_FAILED", "Chưa tạo được tài khoản. Vui lòng thử lại.", 502, true);
    }
    if (p) {
      const { error } = await this.sb.authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) {
        const limited = error.status === 429;
        throw new AuthError(limited ? AUTH_ERRORS.rateLimited : "AUTH_OTP_SEND_FAILED", limited ? "Bạn yêu cầu mã quá nhanh. Đợi một chút rồi gửi lại." : "Chưa gửi được mã OTP. Vui lòng thử lại.", limited ? 429 : 502, true);
      }
    }
    return { sent: true, email: null, destination: maskEmail(email), expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyPassword(b: Body, correlationId: string): Promise<ConsoleAuthResult> {
    const email = req(b, "email", { pattern: EMAIL, max: 200, hint: "email" }).toLowerCase();
    const code = req(b, "code", { max: 6 });
    const password = req(b, "password", { max: 128 });
    const wrong = new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP không đúng hoặc đã hết hạn.", 400);
    const p = await this.purpose(email);
    if (!p) throw wrong;
    const problems = passwordProblems(password);
    if (problems.length) throw new AuthError(AUTH_ERRORS.weakPassword, problems.join(" "), 400);
    if (!/^\d{6}$/.test(code)) throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP gồm 6 chữ số.", 400);
    const { data, error } = await this.sb.authClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.user) throw wrong;
    const userId = data.user.id;
    if (p.kind === "reset" && userId !== p.userId) throw wrong;
    const { error: upErr } = await this.sb.admin.auth.admin.updateUserById(userId, { password });
    if (upErr) throw new AuthError(AUTH_ERRORS.weakPassword, "Không đặt được mật khẩu. Thử mật khẩu khác.", 400);

    const db = this.sb.admin;
    let action = "console.password_reset";
    if (p.kind === "activate") {
      const { error: insErr } = await db.from("platform_operators").insert({ user_id: userId, email, full_name: p.fullName, role: p.role });
      if (insErr) throw insErr;
      if (p.inviteId) await db.from("platform_operator_invites").update({ status: "accepted", accepted_user_id: userId }).eq("id", p.inviteId).eq("status", "pending");
      action = p.inviteId ? "operator.activated" : "operator.bootstrapped";
    }
    await db.from("audit_logs").insert({ tenant_id: null, actor_user_id: userId, actor_type: "platform", action, resource_type: "platform_operator", resource_id: userId,
      after_data: p.kind === "activate" ? { email, role: p.role } : null, correlation_id: correlationId });

    const { data: s, error: sErr } = await this.sb.authClient().auth.signInWithPassword({ email, password });
    const op = s.user ? await operatorOf(this.sb, s.user.id) : null;
    if (sErr || !s.session || !op) throw new AuthError(AUTH_ERRORS.invalidCredentials, "Đã đặt mật khẩu. Hãy đăng nhập lại.", 401);
    return {
      session: { accessToken: s.session.access_token, refreshToken: s.session.refresh_token, expiresAt: s.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600 },
      operator: op,
    };
  }

  /* ---------- Quản lý nhân viên Kavor (chỉ quản trị viên Console) ---------- */
  private requireAdmin(ctx: ConsoleContext) {
    if (ctx.operator.role !== "platform_admin") throw forbidden("Chỉ quản trị viên Kavor Console được quản lý nhân viên Kavor.");
  }

  async list(ctx: ConsoleContext): Promise<ConsoleOperators> {
    this.requireAdmin(ctx);
    const [{ data: ops, error }, { data: invs, error: iErr }] = await Promise.all([
      ctx.db.from("platform_operators").select("user_id, email, full_name, role, status, created_at").order("created_at"),
      ctx.db.from("platform_operator_invites").select(INVITE_COLS).order("created_at", { ascending: false }).limit(100),
    ]);
    if (error) throw error;
    if (iErr) throw iErr;
    const rows = (ops ?? []) as OpRow[];
    const users = await Promise.all(rows.map((o) => ctx.db.auth.admin.getUserById(o.user_id).then((r) => r.data.user, () => null)));
    const operators: ConsoleOperator[] = rows.map((o, i) => ({
      userId: o.user_id, email: o.email, fullName: o.full_name, role: o.role, status: o.status, createdAt: o.created_at, self: o.user_id === ctx.userId,
      mfa: (users[i]?.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified"),
      lastSignInAt: users[i]?.last_sign_in_at ?? null,
    }));
    const names = new Map(rows.map((o) => [o.user_id, o.full_name]));
    return { operators, invites: ((invs ?? []) as InviteRow[]).map((r) => this.toInvite(r, names)) };
  }

  private toInvite(r: InviteRow, names: Map<string, string>): OperatorInvite {
    const expired = r.status === "pending" && Date.parse(r.expires_at) <= Date.now();
    return { id: r.id, email: r.email, fullName: r.full_name, role: r.role, status: expired ? "expired" : r.status, invitedBy: names.get(r.invited_by) ?? "—", sentAt: r.sent_at, expiresAt: r.expires_at, createdAt: r.created_at };
  }

  async invite(ctx: ConsoleContext, b: Body): Promise<OperatorInviteResult> {
    this.requireAdmin(ctx);
    const email = req(b, "email", { pattern: EMAIL, max: 200, hint: "email" }).toLowerCase();
    const fullName = req(b, "fullName", { min: 2, max: 120 });
    const role = oneOf(b, "role", ROLES)!;
    const db = ctx.db;
    const [{ data: op }, { data: emp }] = await Promise.all([
      db.from("platform_operators").select("user_id").eq("email", email).maybeSingle(),
      db.from("employees").select("id").eq("work_email", email).not("user_id", "is", null).limit(1),
    ]);
    if (op) throw conflict("Email này đã là nhân viên Kavor. Đổi vai trò hoặc mở khóa ở danh sách.");
    if (emp?.length) throw conflict("Email này đang là tài khoản nhân viên của một doanh nghiệp. Nhân viên Kavor dùng email riêng.");
    /* Lời mời cũ đã hết hạn thì tự thu hồi để mời lại */
    await db.from("platform_operator_invites").update({ status: "revoked" }).eq("email", email).eq("status", "pending").lte("expires_at", new Date().toISOString());
    const { data, error } = await db.from("platform_operator_invites").insert({ email, full_name: fullName, role, invited_by: ctx.userId }).select(INVITE_COLS).single();
    if (error?.code === "23505") throw conflict("Email này đang có lời mời chờ kích hoạt. Dùng Gửi lại thư hoặc Thu hồi.");
    if (error) throw error;
    const row = data as InviteRow;
    await ctx.audit("operator.invited", "platform_operator_invite", row.id, null, { email, full_name: fullName, role });
    const mail = await this.send(ctx, row).then(() => ({ sent: true, error: null }), (e: unknown) => ({ sent: false, error: e instanceof AuthError ? e.message : "Chưa gửi được thư mời." }));
    return { invite: this.toInvite({ ...row, sent_at: mail.sent ? new Date().toISOString() : null }, new Map([[ctx.userId, ctx.operator.fullName]])), mail };
  }

  private async send(ctx: ConsoleContext, r: InviteRow) {
    await this.mailer.sendOperatorInvite({ to: r.email, fullName: r.full_name, roleLabel: OPERATOR_ROLES[r.role].label, invitedBy: `${ctx.operator.fullName} (Kavor)`, consoleUrl: this.consoleWebUrl, expiresAt: vnTime(r.expires_at) });
    await ctx.db.from("platform_operator_invites").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
  }

  private async pendingInvite(ctx: ConsoleContext, id: string): Promise<InviteRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("lời mời");
    const { data } = await ctx.db.from("platform_operator_invites").select(INVITE_COLS).eq("id", id).maybeSingle();
    const r = data as InviteRow | null;
    if (!r) throw notFound("lời mời");
    if (r.status !== "pending") throw conflict(r.status === "accepted" ? "Người này đã kích hoạt tài khoản." : "Lời mời đã thu hồi.");
    return r;
  }

  async resend(ctx: ConsoleContext, id: string) {
    this.requireAdmin(ctx);
    const r = await this.pendingInvite(ctx, id);
    if (Date.parse(r.expires_at) <= Date.now()) throw conflict("Lời mời đã hết hạn. Mời lại để tạo lời mời mới.");
    if (r.sent_at && Date.now() - Date.parse(r.sent_at) < 60_000) throw new AuthError(AUTH_ERRORS.rateLimited, "Vừa gửi thư. Đợi một phút rồi gửi lại.", 429, true);
    await this.send(ctx, r);
    await ctx.audit("operator.invite_resent", "platform_operator_invite", r.id, null, { email: r.email });
    return this.list(ctx);
  }

  async revoke(ctx: ConsoleContext, id: string) {
    this.requireAdmin(ctx);
    const r = await this.pendingInvite(ctx, id);
    const { error } = await ctx.db.from("platform_operator_invites").update({ status: "revoked" }).eq("id", r.id).eq("status", "pending");
    if (error) throw error;
    await ctx.audit("operator.invite_revoked", "platform_operator_invite", r.id, { status: "pending" }, { status: "revoked", email: r.email });
    return this.list(ctx);
  }

  private async target(ctx: ConsoleContext, userId: string): Promise<OpRow> {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw notFound("nhân viên Kavor");
    if (userId === ctx.userId) throw forbidden("Không tự đổi vai trò, khóa hay đặt lại xác thực của chính mình — nhờ một quản trị viên khác.");
    const { data } = await ctx.db.from("platform_operators").select("user_id, email, full_name, role, status, created_at").eq("user_id", userId).maybeSingle();
    if (!data) throw notFound("nhân viên Kavor");
    return data as OpRow;
  }

  async update(ctx: ConsoleContext, userId: string, b: Body) {
    this.requireAdmin(ctx);
    const t = await this.target(ctx, userId);
    const role = oneOf(b, "role", ROLES, true);
    const status = oneOf(b, "status", ["active", "disabled"] as const, true);
    const reason = req(b, "reason", { min: 5, max: 300, hint: "ít nhất 5 ký tự" });
    const patch: Partial<Pick<OpRow, "role" | "status">> = {};
    if (role && role !== t.role) patch.role = role;
    if (status && status !== t.status) patch.status = status;
    if (!Object.keys(patch).length) throw invalid("Không có gì thay đổi.");
    const { error } = await ctx.db.from("platform_operators").update(patch).eq("user_id", t.user_id);
    if (error?.code === "23514") throw conflict("Phải còn ít nhất một quản trị viên Kavor Console đang hoạt động.");
    if (error) throw error;
    await ctx.audit("operator.updated", "platform_operator", t.user_id, { role: t.role, status: t.status }, { ...patch, email: t.email }, reason);
    return this.list(ctx);
  }

  /* Nhân viên Kavor mất điện thoại: xóa ứng dụng xác thực, lần đăng nhập sau phải liên kết lại */
  async resetMfa(ctx: ConsoleContext, userId: string, b: Body) {
    this.requireAdmin(ctx);
    const t = await this.target(ctx, userId);
    const reason = req(b, "reason", { min: 5, max: 300, hint: "ít nhất 5 ký tự" });
    const { data, error } = await ctx.db.auth.admin.mfa.listFactors({ userId: t.user_id });
    if (error) throw error;
    const factors = data?.factors ?? [];
    if (!factors.length) throw conflict("Người này chưa liên kết ứng dụng xác thực.");
    for (const f of factors) await ctx.db.auth.admin.mfa.deleteFactor({ id: f.id, userId: t.user_id });
    await ctx.audit("operator.mfa_reset", "platform_operator", t.user_id, { factors: factors.length }, { email: t.email }, reason);
    return this.list(ctx);
  }
}
