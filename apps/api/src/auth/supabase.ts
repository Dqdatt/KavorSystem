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

  authClient(): SupabaseClient {
    return createClient(this.config.url, this.config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
}
