/* Gọi Kavor API: parse envelope { data, meta, error } và chuẩn hóa lỗi để màn hình hiển thị.
   Bật khi build có EXPO_PUBLIC_API_URL (và không ở chế độ QA chụp ảnh dùng dữ liệu mẫu). */
import type {
  AttendanceEvent, AttendanceEventRequest, AttendanceToday, DeviceInfo, DeviceRegisterRequest,
  ActivationStartRequest, ActivationVerifyRequest, ApiEnvelope, AuthResult, LoginRequest, MeProfile,
  OtpSentResponse, PasswordForgotRequest, PasswordResetRequest, RefreshRequest,
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

export const isNetworkError = (e: unknown) => e instanceof ApiError && (e.code === "NETWORK" || e.status >= 500);
