/* Cấu hình Supabase Realtime cho trình duyệt: URL + publishable key + access token hiện tại (ngắn hạn).
   Realtime kiểm tra RLS bằng token này nên chỉ báo thay đổi trong phạm vi quyền của người dùng; web chỉ coi đó là
   tín hiệu để gọi lại Kavor API, không dùng dữ liệu trong sự kiện. Rủi ro: token này đọc được từ JS (refresh token thì không). */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE } from "../../_lib/session";

/* Chỉ đọc claim, không xác minh chữ ký: token lấy từ cookie httpOnly do chính server đặt, Supabase vẫn xác minh khi dùng */
function aal(token: string): unknown {
  try { return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).aal; } catch { return null; }
}

export async function GET() {
  const jar = await cookies();
  const token = jar.get(COOKIE.access)?.value;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return NextResponse.json({ data: null, meta: { correlationId: "web" }, error: { code: "REALTIME_UNAVAILABLE", message: "Realtime chưa cấu hình.", retryable: false } }, { status: 503 });
  // Cookie giữ cả phiên aal1 trong lúc nhập mã MFA: không cấp token đó cho JS (DB cũng chặn aal1, đây là lớp thứ hai)
  if (aal(token) !== "aal2") return NextResponse.json({ data: null, meta: { correlationId: "web" }, error: { code: "MFA_REQUIRED", message: "Cần xác thực hai lớp.", retryable: false } }, { status: 403 });
  return NextResponse.json({ data: { url, key, token, expiresAt: Number(jar.get(COOKIE.expires)?.value ?? 0) }, meta: { correlationId: "web" }, error: null }, { headers: { "cache-control": "no-store" } });
}
