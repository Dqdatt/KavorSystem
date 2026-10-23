/* Phiên đăng nhập web HR/Admin: token chỉ nằm trong cookie httpOnly do server Next đặt; trình duyệt không đọc được
   (trừ access token ngắn hạn cấp riêng cho Realtime, xem app/api/realtime). Mọi lời gọi API đi qua server Next. */
import type { ApiEnvelope, AuthResult } from "@kavor/contracts";

export const API_URL = (process.env.KAVOR_API_URL ?? "http://localhost:4000/api/v1").replace(/\/+$/, "");
export const COOKIE = { access: "kv_at", refresh: "kv_rt", expires: "kv_exp" } as const;
const REFRESH_DAYS = 30;

type CookieSetter = { set(name: string, value: string, options: Record<string, unknown>): unknown };

const base = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" });

export function writeSession(cookies: CookieSetter, s: AuthResult["session"]) {
  const maxAge = Math.max(60, s.expiresAt - Math.floor(Date.now() / 1000));
  cookies.set(COOKIE.access, s.accessToken, { ...base(), maxAge });
  cookies.set(COOKIE.expires, String(s.expiresAt), { ...base(), maxAge });
  cookies.set(COOKIE.refresh, s.refreshToken, { ...base(), maxAge: REFRESH_DAYS * 86400 });
}

export function clearSession(cookies: CookieSetter) {
  for (const name of Object.values(COOKIE)) cookies.set(name, "", { ...base(), maxAge: 0 });
}

/* Gọi Kavor API từ server Next; trả nguyên envelope và mã HTTP */
export async function api<T>(method: string, path: string, opts: { token?: string; body?: unknown; correlationId?: string } = {}): Promise<{ status: number; json: ApiEnvelope<T> }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/${path.replace(/^\/+/, "")}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.correlationId ? { "x-correlation-id": opts.correlationId } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
  } catch {
    return { status: 503, json: { data: null, meta: { correlationId: "web" }, error: { code: "API_UNREACHABLE", message: "Không kết nối được máy chủ Kavor.", retryable: true } } };
  }
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  return { status: res.status, json: json ?? { data: null, meta: { correlationId: "web" }, error: { code: `HTTP_${res.status}`, message: "Máy chủ trả dữ liệu không hợp lệ.", retryable: res.status >= 500 } } };
}

/* Access token còn hạn (dư 30 giây) */
export function freshToken(get: (name: string) => string | undefined): string | null {
  const at = get(COOKIE.access), exp = Number(get(COOKIE.expires) ?? 0);
  return at && exp - 30 > Date.now() / 1000 ? at : null;
}
