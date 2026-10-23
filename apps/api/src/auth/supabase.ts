import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";

/* Hai loại client:
   - admin: service role, đọc/ghi DB và quản trị user. Không bao giờ dùng để đăng nhập, vì supabase-js
     sẽ gắn token của người dùng vào client và các truy vấn sau chạy dưới quyền người đó.
   - authClient(): client mới cho mỗi lần gọi Supabase Auth (OTP, đăng nhập), không lưu phiên. */
export class SupabaseGateway {
  readonly admin: SupabaseClient;

  constructor(private readonly config: NonNullable<AppConfig["supabase"]>) {
    this.admin = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /* Gọi Supabase Auth (GoTrue) REST dưới danh nghĩa người dùng — dùng cho MFA (enroll/challenge/verify), vì supabase-js
     chỉ làm việc này qua phiên lưu trong client. Không ném lỗi: trả mã HTTP để nơi gọi tự xử lý. */
  async authRequest<T>(method: "GET" | "POST" | "DELETE", path: string, accessToken: string, body?: unknown): Promise<{ status: number; data: T | null; message: string | null }> {
    const res = await fetch(`${this.config.url.replace(/\/+$/, "")}/auth/v1${path}`, {
      method,
      headers: { apikey: this.config.serviceRoleKey, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (T & { msg?: string; message?: string; error_description?: string }) | null;
    if (!res.ok) return { status: res.status, data: null, message: json?.msg ?? json?.message ?? json?.error_description ?? null };
    return { status: res.status, data: json, message: null };
  }

  authClient(): SupabaseClient {
    return createClient(this.config.url, this.config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
}
