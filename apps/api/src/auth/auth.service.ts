import {
  AUTH_ERRORS, maskEmail, passwordProblems,
  type AuthResult, type AuthSession, type MeProfile, type OtpSentResponse,
} from "@kavor/contracts";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseGateway } from "./supabase.js";
import { currentTerms, recordConsent } from "../company/privacy.js";

export class AuthError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly retryable = false) {
    super(message);
  }
}

export type EmployeeRow = { id: string; tenant_id: string; employee_code: string; full_name: string; work_email: string | null; user_id: string | null; status: string };

const OTP_TTL_SECONDS = 300;
const EMPLOYEE_COLS = "id, tenant_id, employee_code, full_name, work_email, user_id, status";

/* Giới hạn số lần thất bại theo khóa (IP + định danh) trong cửa sổ thời gian, chống dò mật khẩu/OTP.
   Chỉ lần thất bại bị đếm; thành công thì xóa bộ đếm. Bộ nhớ trong tiến trình: đủ cho một instance API. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  private recent(key: string) {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    return list;
  }
  async guard<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.recent(key).length >= this.max) throw new AuthError(AUTH_ERRORS.rateLimited, "Bạn thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.", 429, true);
    try {
      const r = await fn();
      this.hits.delete(key);
      return r;
    } catch (e) {
      if (e instanceof AuthError && e.status < 500 && e.code !== AUTH_ERRORS.rateLimited) this.recent(key).push(Date.now());
      throw e;
    }
  }
}

export class AuthService {
  private readonly loginLimiter = new RateLimiter(5, 5 * 60_000);
  private readonly otpLimiter = new RateLimiter(5, 15 * 60_000);

  constructor(private readonly sb: SupabaseGateway) {}

  /* ---------- Kích hoạt tài khoản ---------- */
  async startActivation(employeeCode: string, email: string, ip: string, correlationId: string): Promise<OtpSentResponse> {
    return this.otpLimiter.guard(`act:${ip}:${email.toLowerCase()}`, async () => {
    /* Tìm theo email (khóa duy nhất của tài khoản đăng nhập) rồi đối chiếu mã: mã như ADMIN01, NV001 trùng giữa các công ty.
       Không tiết lộ mã nào tồn tại: cùng một thông báo khi sai mã hoặc sai email */
    const emp = await this.findEmployeeByEmail(email);
    if (!emp || !emp.work_email || emp.employee_code.toLowerCase() !== employeeCode.trim().toLowerCase()) {
      throw new AuthError(AUTH_ERRORS.employeeNotFound, "Mã nhân viên và email công ty không khớp hồ sơ nhân sự. Liên hệ phòng Nhân sự nếu bạn chắc chắn thông tin đúng.", 404);
    }
    if (emp.status === "terminated" || emp.status === "suspended") throw new AuthError(AUTH_ERRORS.accountDisabled, "Hồ sơ nhân viên đang không hoạt động. Liên hệ phòng Nhân sự.", 403);
    if (emp.user_id) throw new AuthError(AUTH_ERRORS.alreadyActivated, "Tài khoản đã được kích hoạt. Hãy đăng nhập hoặc dùng Quên mật khẩu.", 409);
    /* Đăng ký công khai bị tắt: tạo tài khoản (chưa có mật khẩu) bằng quyền admin rồi gửi OTP đăng nhập */
    const { error: cErr } = await this.sb.admin.auth.admin.createUser({ email: emp.work_email, email_confirm: true, app_metadata: { active_tenant_id: emp.tenant_id } });
    if (cErr && !/already.*registered|already exists/i.test(cErr.message)) throw new AuthError("AUTH_OTP_SEND_FAILED", "Chưa tạo được tài khoản. Vui lòng thử lại.", 502, true);
    await this.sendOtp(emp.work_email);
    await this.audit(emp.tenant_id, null, "auth.activation.otp_sent", emp.id, correlationId);
    return { sent: true, email: emp.work_email, destination: maskEmail(emp.work_email), expiresInSeconds: OTP_TTL_SECONDS };
    });
  }

  /* consent: nhân viên đã tích đồng ý xử lý dữ liệu cá nhân ở màn kích hoạt → ghi nhận với điều khoản hiện hành */
  async verifyActivation(email: string, code: string, password: string, ip: string, correlationId: string, consent?: { installationId?: string; userAgent?: string }): Promise<AuthResult> {
    return this.otpLimiter.guard(`actv:${ip}:${email.toLowerCase()}`, async () => {
    const emp = await this.findEmployeeByEmail(email);
    if (!emp || emp.user_id) throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP không đúng hoặc đã hết hạn.", 400);
    const problems = passwordProblems(password, emp.employee_code);
    if (problems.length) throw new AuthError(AUTH_ERRORS.weakPassword, problems.join(" "), 400);

    const userId = await this.verifyOtp(email, code);
    const { error: upErr } = await this.sb.admin.auth.admin.updateUserById(userId, { password, app_metadata: { active_tenant_id: emp.tenant_id } });
    if (upErr) throw new AuthError(AUTH_ERRORS.weakPassword, "Không đặt được mật khẩu. Thử mật khẩu khác.", 400);

    /* Liên kết tài khoản với hồ sơ nhân viên; chỉ thành công nếu hồ sơ chưa gắn tài khoản nào */
    const { data: linked, error: linkErr } = await this.sb.admin.from("employees").update({ user_id: userId }).eq("id", emp.id).is("user_id", null).select("id");
    if (linkErr || !linked?.length) throw new AuthError(AUTH_ERRORS.alreadyActivated, "Tài khoản đã được kích hoạt.", 409);
    /* Membership có thể đã được tạo trước (HR/Admin được mời và gán role trước khi kích hoạt) */
    const joined = { user_id: userId, status: "active", joined_at: new Date().toISOString() };
    const { data: invited } = await this.sb.admin.from("memberships").update(joined).eq("tenant_id", emp.tenant_id).eq("employee_id", emp.id).select("id");
    if (!invited?.length) await this.sb.admin.from("memberships").upsert({ tenant_id: emp.tenant_id, employee_id: emp.id, ...joined }, { onConflict: "tenant_id,user_id" });
    await this.sb.admin.from("user_profiles").upsert({ id: userId, display_name: emp.full_name });
    await this.audit(emp.tenant_id, userId, "auth.activated", emp.id, correlationId);
    if (consent) {
      const terms = await currentTerms(this.sb.admin, emp.tenant_id);
      if (terms) {
        await recordConsent(this.sb.admin, { tenantId: emp.tenant_id, employeeId: emp.id, userId, termsId: terms.id, installationId: consent.installationId, ip, userAgent: consent.userAgent });
        await this.audit(emp.tenant_id, userId, "privacy.consented", emp.id, correlationId);
      }
    }
    return this.passwordLogin(email, password, emp);
    });
  }

  /* ---------- Đăng nhập ---------- */
  async login(identifier: string, password: string, ip: string, correlationId: string): Promise<AuthResult> {
    return this.loginLimiter.guard(`login:${ip}:${identifier.toLowerCase()}`, async () => {
    const emp = await this.resolveEmployee(identifier);
    const invalid = new AuthError(AUTH_ERRORS.invalidCredentials, "Mã nhân viên hoặc mật khẩu không đúng.", 401);
    if (!emp) throw invalid;
    if (!emp.user_id) throw new AuthError(AUTH_ERRORS.notActivated, "Tài khoản chưa được kích hoạt. Chọn “Kích hoạt tài khoản” để bắt đầu.", 403);
    if (emp.status === "terminated" || emp.status === "suspended") throw new AuthError(AUTH_ERRORS.accountDisabled, "Tài khoản đang bị khóa. Liên hệ phòng Nhân sự.", 403);
    await this.assertNotLocked(emp);
    const { data: u } = await this.sb.admin.auth.admin.getUserById(emp.user_id);
    if (!u.user?.email) throw invalid;
    try {
      const result = await this.passwordLogin(u.user.email, password, emp);
      await this.sb.admin.from("user_profiles").update({ last_login_at: new Date().toISOString() }).eq("id", emp.user_id);
      await this.audit(emp.tenant_id, emp.user_id, "auth.login", emp.id, correlationId);
      return result;
    } catch (e) {
      if (e instanceof AuthError && e.code === AUTH_ERRORS.invalidCredentials) await this.audit(emp.tenant_id, emp.user_id, "auth.login_failed", emp.id, correlationId);
      throw e;
    }
    });
  }

  /* ---------- Quên / đặt lại mật khẩu ---------- */
  async forgotPassword(identifier: string, ip: string, correlationId: string): Promise<OtpSentResponse> {
    return this.otpLimiter.guard(`fg:${ip}:${identifier.toLowerCase()}`, async () => {
    const emp = await this.resolveEmployee(identifier);
    if (!emp?.user_id) throw new AuthError(AUTH_ERRORS.employeeNotFound, "Không tìm thấy tài khoản đã kích hoạt với thông tin này.", 404);
    const { data: u } = await this.sb.admin.auth.admin.getUserById(emp.user_id);
    const email = u.user?.email;
    if (!email) throw new AuthError(AUTH_ERRORS.employeeNotFound, "Không tìm thấy tài khoản đã kích hoạt với thông tin này.", 404);
    await this.sendOtp(email);
    await this.audit(emp.tenant_id, emp.user_id, "auth.password_reset.otp_sent", emp.id, correlationId);
    return { sent: true, email, destination: maskEmail(email), expiresInSeconds: OTP_TTL_SECONDS };
    });
  }

  async resetPassword(email: string, code: string, newPassword: string, ip: string, correlationId: string): Promise<AuthResult> {
    return this.otpLimiter.guard(`rs:${ip}:${email.toLowerCase()}`, async () => {
    const emp = await this.findEmployeeByEmail(email);
    if (!emp?.user_id) throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP không đúng hoặc đã hết hạn.", 400);
    const problems = passwordProblems(newPassword, emp.employee_code);
    if (problems.length) throw new AuthError(AUTH_ERRORS.weakPassword, problems.join(" "), 400);
    const userId = await this.verifyOtp(email, code);
    if (userId !== emp.user_id) throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP không đúng hoặc đã hết hạn.", 400);
    const { error } = await this.sb.admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new AuthError(AUTH_ERRORS.weakPassword, "Không đặt được mật khẩu mới. Thử mật khẩu khác.", 400);
    await this.audit(emp.tenant_id, userId, "auth.password_reset", emp.id, correlationId);
    return this.passwordLogin(email, newPassword, emp);
    });
  }

  /* ---------- Phiên ---------- */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const { data, error } = await this.sb.authClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) throw new AuthError(AUTH_ERRORS.sessionExpired, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
    const emp = await this.findEmployeeByUser(data.user.id);
    if (!emp) throw new AuthError(AUTH_ERRORS.sessionExpired, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
    if (emp.status === "terminated" || emp.status === "suspended") throw new AuthError(AUTH_ERRORS.accountDisabled, "Tài khoản đang bị khóa. Liên hệ phòng Nhân sự.", 403);
    await this.assertNotLocked(emp);
    return { session: toSession(data.session), me: await this.me(emp) };
  }

  async logout(accessToken: string) {
    await this.sb.admin.auth.admin.signOut(accessToken, "local").catch(() => undefined);
  }

  async meFromToken(accessToken: string): Promise<MeProfile> {
    return this.me(await this.employeeFromToken(accessToken));
  }

  /* Nhân viên của phiên hiện tại; dùng cho mọi endpoint /me/*. Tenant lấy từ hồ sơ, không tin client. */
  async employeeFromToken(accessToken: string): Promise<EmployeeRow> {
    const { data, error } = await this.sb.admin.auth.getUser(accessToken);
    if (error && error.status !== 401 && error.status !== 403) throw new AuthError("AUTH_UNAVAILABLE", "Máy chủ xác thực đang bận. Vui lòng thử lại.", 503, true);
    if (error || !data.user) throw new AuthError(AUTH_ERRORS.sessionExpired, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
    const emp = await this.findEmployeeByUser(data.user.id);
    if (!emp) throw new AuthError(AUTH_ERRORS.notActivated, "Tài khoản chưa gắn với hồ sơ nhân viên.", 403);
    if (emp.status === "terminated" || emp.status === "suspended") throw new AuthError(AUTH_ERRORS.accountDisabled, "Tài khoản đang bị khóa. Liên hệ phòng Nhân sự.", 403);
    await this.assertNotLocked(emp);
    return emp;
  }

  /* HR khóa đăng nhập bằng cách chuyển membership sang suspended (hồ sơ nhân sự giữ nguyên) */
  private async assertNotLocked(emp: EmployeeRow) {
    if (!emp.user_id) return;
    const { data } = await this.sb.admin.from("memberships").select("status").eq("tenant_id", emp.tenant_id).eq("user_id", emp.user_id).maybeSingle();
    if (data && data.status !== "active") throw new AuthError(AUTH_ERRORS.accountDisabled, "Tài khoản đang bị khóa. Liên hệ phòng Nhân sự.", 403);
  }

  /* ---------- Nội bộ ---------- */
  private async passwordLogin(email: string, password: string, emp: EmployeeRow): Promise<AuthResult> {
    const { data, error } = await this.sb.authClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new AuthError(AUTH_ERRORS.invalidCredentials, "Mã nhân viên hoặc mật khẩu không đúng.", 401);
    return { session: toSession(data.session), me: await this.me({ ...emp, user_id: data.user.id }) };
  }

  private async sendOtp(email: string) {
    const { error } = await this.sb.authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      const limited = error.status === 429;
      throw new AuthError(limited ? AUTH_ERRORS.rateLimited : "AUTH_OTP_SEND_FAILED", limited ? "Bạn yêu cầu mã quá nhanh. Đợi một chút rồi gửi lại." : "Chưa gửi được mã OTP. Vui lòng thử lại.", limited ? 429 : 502, true);
    }
  }

  private async verifyOtp(email: string, code: string): Promise<string> {
    if (!/^\d{6}$/.test(code)) throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP gồm 6 chữ số.", 400);
    const { data, error } = await this.sb.authClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.user) throw new AuthError(AUTH_ERRORS.otpInvalid, "Mã OTP không đúng hoặc đã hết hạn.", 400);
    return data.user.id;
  }

  private async me(emp: EmployeeRow): Promise<MeProfile> {
    const { data: t } = await this.sb.admin.from("tenants").select("id, code, display_name").eq("id", emp.tenant_id).single();
    return {
      userId: emp.user_id ?? "",
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      fullName: emp.full_name,
      email: emp.work_email ?? "",
      tenant: { id: emp.tenant_id, code: t?.code ?? "", name: t?.display_name ?? "" },
    };
  }

  /* Định danh là email nếu có "@", ngược lại là mã nhân viên */
  private resolveEmployee(identifier: string) {
    const id = identifier.trim();
    return id.includes("@") ? this.findEmployeeByEmail(id) : this.findEmployeeByCode(id);
  }

  private async findEmployeeByCode(code: string): Promise<EmployeeRow | null> {
    const { data } = await this.sb.admin.from("employees").select(EMPLOYEE_COLS).ilike("employee_code", code.trim()).limit(2);
    /* Cùng mã ở nhiều công ty: không đoán, yêu cầu đăng nhập bằng email */
    if (data && data.length > 1) throw new AuthError(AUTH_ERRORS.employeeNotFound, "Mã nhân viên này tồn tại ở nhiều công ty. Hãy dùng email công ty.", 409);
    return (data?.[0] as EmployeeRow | undefined) ?? null;
  }

  private async findEmployeeByEmail(email: string): Promise<EmployeeRow | null> {
    const { data } = await this.sb.admin.from("employees").select(EMPLOYEE_COLS).ilike("work_email", email.trim()).limit(2);
    if (data && data.length > 1) throw new AuthError(AUTH_ERRORS.employeeNotFound, "Email này gắn với nhiều hồ sơ. Liên hệ phòng Nhân sự.", 409);
    return (data?.[0] as EmployeeRow | undefined) ?? null;
  }

  private async findEmployeeByUser(userId: string): Promise<EmployeeRow | null> {
    const { data } = await this.sb.admin.from("employees").select(EMPLOYEE_COLS).eq("user_id", userId).limit(1);
    return (data?.[0] as EmployeeRow | undefined) ?? null;
  }

  private async audit(tenantId: string, actor: string | null, action: string, employeeId: string, correlationId: string) {
    await this.sb.admin.from("audit_logs").insert({ tenant_id: tenantId, actor_user_id: actor, actor_type: actor ? "user" : "system", action, resource_type: "employee", resource_id: employeeId, correlation_id: correlationId });
  }
}

function toSession(s: Session): AuthSession {
  return { accessToken: s.access_token, refreshToken: s.refresh_token, expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600) };
}
