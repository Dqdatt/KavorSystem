/* Gọi Kavor API: parse envelope { data, meta, error } và chuẩn hóa lỗi để màn hình hiển thị.
   Bật khi build có EXPO_PUBLIC_API_URL (và không ở chế độ QA chụp ảnh dùng dữ liệu mẫu). */
import type {
  AttendanceEvent, AttendanceEventRequest, AttendanceToday, DeviceInfo, DeviceRegisterRequest,
  ActivationStartRequest, ActivationVerifyRequest, ApiEnvelope, AuthResult, BrandingKind, ExplanationInput, LoginRequest, MeProfile, AdvanceInput, LeaveInput, MyAdvance, MyApprovals, MyCompany, MyLeave, MyOvertime, MyTimesheet, NotificationFeed, OvertimeInput, RequestItem,
  MyAnnouncement, MyAnnouncements, MyDocuments, MyPayslip, MyProfile, MyPayslips, OtpSentResponse, PasswordForgotRequest, PasswordResetRequest, PrivacyConsentRequest, RefreshRequest,
} from "@kavor/contracts";
import { QA_ENABLED } from "../qa";

declare const process: { env: Record<string, string | undefined> };
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const REMOTE = !!BASE && !QA_ENABLED;

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly retryable = false) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, token?: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError("NETWORK", "Không kết nối được máy chủ Kavor. Kiểm tra mạng rồi thử lại.", 0, true);
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !json || json.error || json.data == null) {
    const e = json?.error;
    throw new ApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.", res.status, e?.retryable ?? res.status >= 500);
  }
  return json.data;
}

export const authApi = {
  login: (b: LoginRequest) => call<AuthResult>("POST", "/auth/login", b),
  activateStart: (b: ActivationStartRequest) => call<OtpSentResponse>("POST", "/auth/activate/start", b),
  activateVerify: (b: ActivationVerifyRequest) => call<AuthResult>("POST", "/auth/activate/verify", b),
  forgot: (b: PasswordForgotRequest) => call<OtpSentResponse>("POST", "/auth/password/forgot", b),
  reset: (b: PasswordResetRequest) => call<AuthResult>("POST", "/auth/password/reset", b),
  refresh: (b: RefreshRequest) => call<AuthResult>("POST", "/auth/refresh", b),
  logout: (token: string) => call<{ ok: true }>("POST", "/auth/logout", {}, token),
  me: (token: string) => call<MeProfile>("GET", "/me", undefined, token),
};

/* Lấy access token hiện tại (đã được làm mới khi mở app) — gán từ store để tránh vòng import */
let tokenSource: () => Promise<string | null> = async () => null;
export function setTokenSource(fn: () => Promise<string | null>) { tokenSource = fn; }
async function token(): Promise<string> {
  const t = await tokenSource();
  if (!t) throw new ApiError("AUTH_SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return t;
}

export const attendanceApi = {
  registerDevice: async (b: DeviceRegisterRequest) => call<DeviceInfo>("POST", "/me/devices", b, await token()),
  today: async (installationId: string) => call<AttendanceToday>("GET", `/me/attendance/today?installationId=${encodeURIComponent(installationId)}`, undefined, await token()),
  record: async (b: AttendanceEventRequest) => call<AttendanceEvent>("POST", "/me/attendance/events", b, await token()),
};

/* Thông tin công ty (thương hiệu, liên hệ HR, ngày lễ, điều khoản dữ liệu cá nhân) — công ty cấu hình trên web */
export const companyApi = {
  get: async () => call<MyCompany>("GET", "/me/company", undefined, await token()),
  profile: async () => call<MyProfile>("GET", "/me/profile", undefined, await token()),
  consent: async (b: PrivacyConsentRequest) => call<{ acceptedVersionNo: number }>("POST", "/me/privacy-consents", b, await token()),
  /* Ảnh tải bằng <Image> kèm header Authorization; ?v= đổi khi công ty thay ảnh nên cache được */
  brandingSource: async (kind: BrandingKind, version: string) => ({ uri: `${BASE}/me/company/branding/${kind}?v=${version}`, headers: { authorization: `Bearer ${await token()}` } }),
};

/* Bảng công tháng, giải trình, đơn của tôi, duyệt (quản lý/HR) */
export const timesheetApi = {
  get: async (month?: string) => call<MyTimesheet>("GET", `/me/timesheet${month ? `?month=${month}` : ""}`, undefined, await token()),
  explain: async (b: ExplanationInput) => call<RequestItem>("POST", "/me/requests/explanations", b, await token()),
  mine: async () => call<RequestItem[]>("GET", "/me/requests", undefined, await token()),
  cancel: async (id: string) => call<RequestItem>("POST", `/me/requests/${id}/cancel`, {}, await token()),
  approvals: async () => call<MyApprovals>("GET", "/me/approvals", undefined, await token()),
  decide: async (taskId: string, approve: boolean, comment?: string) => call<RequestItem>("POST", `/me/approvals/${taskId}/${approve ? "approve" : "reject"}`, { comment: comment ?? null }, await token()),
};

export const leaveApi = {
  get: async () => call<MyLeave>("GET", "/me/leave", undefined, await token()),
  create: async (b: LeaveInput) => call<RequestItem>("POST", "/me/requests/leave", b, await token()),
};

export const overtimeApi = {
  get: async () => call<MyOvertime>("GET", "/me/overtime", undefined, await token()),
  create: async (b: OvertimeInput) => call<RequestItem>("POST", "/me/requests/overtime", b, await token()),
};

export const advanceApi = {
  get: async () => call<MyAdvance>("GET", "/me/advance", undefined, await token()),
  create: async (b: AdvanceInput) => call<RequestItem>("POST", "/me/requests/advance", b, await token()),
};

export const payslipApi = {
  list: async () => call<MyPayslips>("GET", "/me/payslips", undefined, await token()),
  get: async (month: string) => call<MyPayslip>("GET", `/me/payslips/${encodeURIComponent(month)}`, undefined, await token()),
};

/* Bản tin: mở bài = đã đọc. File mở bằng trình duyệt hệ thống qua liên kết ký 5 phút (không gửi được header Authorization) */
export const announcementsApi = {
  list: async () => call<MyAnnouncements>("GET", "/me/announcements", undefined, await token()),
  get: async (id: string) => call<MyAnnouncement>("GET", `/me/announcements/${encodeURIComponent(id)}`, undefined, await token()),
  fileUrl: async (id: string) => `${BASE}/${(await call<{ path: string; expiresAt: string }>("POST", `/me/announcements/${encodeURIComponent(id)}/file-link`, {}, await token())).path}`,
};

/* Tài liệu HR chia sẻ với mình (hợp đồng, quyết định…): mở bằng trình duyệt hệ thống qua liên kết ký 5 phút */
export const documentsApi = {
  list: async () => call<MyDocuments>("GET", "/me/documents", undefined, await token()),
  fileUrl: async (id: string) => `${BASE}/${(await call<{ path: string; expiresAt: string }>("POST", `/me/documents/${encodeURIComponent(id)}/file-link`, {}, await token())).path}`,
};

export const notificationsApi = {
  feed: async () => call<NotificationFeed>("GET", "/me/notifications", undefined, await token()),
  read: async (ids?: string[]) => call<NotificationFeed>("POST", "/me/notifications/read", ids ? { ids } : {}, await token()),
};

export const isNetworkError = (e: unknown) => e instanceof ApiError && (e.code === "NETWORK" || e.status >= 500);
