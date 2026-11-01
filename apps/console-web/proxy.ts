/* Kiểm tra phiên trước mỗi trang và mỗi lời gọi /api/kavor: access token hết hạn thì dùng refresh token (httpOnly)
   để làm mới, ghi cookie mới cho cả request hiện tại lẫn trình duyệt. Không có phiên → trang /login (hoặc 401 cho API).
   Đây chỉ là kiểm tra lạc quan; quyền thật do Kavor API kiểm tra ở từng request. */
import { NextResponse, type NextRequest } from "next/server";
import type { ConsoleAuthResult } from "@kavor/contracts";
import { COOKIE, api, clearSession, freshToken, writeSession } from "./app/_lib/session";

export async function proxy(req: NextRequest) {
  if (freshToken((n) => req.cookies.get(n)?.value)) return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const deny = () => {
    const res = isApi
      ? NextResponse.json({ data: null, meta: { correlationId: "web" }, error: { code: "AUTH_SESSION_EXPIRED", message: "Phiên đăng nhập đã hết hạn.", retryable: false } }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
    clearSession(res.cookies);
    return res;
  };

  const refreshToken = req.cookies.get(COOKIE.refresh)?.value;
  if (!refreshToken) return deny();
  const { status, json } = await api<ConsoleAuthResult>("POST", "console/auth/refresh", { body: { refreshToken } });
  /* Chỉ đăng xuất khi API trả 4xx (phiên hết hạn/bị thu hồi, tài khoản bị khóa). Lỗi tạm thời (5xx/mất mạng: API khởi động lại, Supabase chậm)
     thì giữ cookie: API trả 503 thử lại, trang hiện "máy chủ đang bận" và tự tải lại — trước đây lỗi này làm người dùng bị đăng xuất. */
  if (status >= 400 && status < 500) return deny();
  if (status !== 200 || !json.data) return busy(isApi, json.error?.message);

  /* Cookie mới cho request đang xử lý (server component/route handler đọc được ngay) và cho trình duyệt */
  writeSession({ set: (name: string, value: string) => req.cookies.set(name, value) }, json.data.session);
  const res = NextResponse.next({ request: { headers: req.headers } });
  writeSession(res.cookies, json.data.session);
  return res;
}

function busy(isApi: boolean, message?: string) {
  const msg = message || "Máy chủ Kavor đang bận. Vui lòng thử lại.";
  if (isApi) return NextResponse.json({ data: null, meta: { correlationId: "web" }, error: { code: "AUTH_UNAVAILABLE", message: msg, retryable: true } }, { status: 503 });
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>Kavor</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center"><div><h1 style="font-size:20px">Máy chủ Kavor đang bận</h1>
<p>${msg.replace(/[<>&]/g, "")}</p><p>Trang sẽ tự tải lại sau 5 giây. Bạn vẫn đang đăng nhập.</p></div></body></html>`;
  return new NextResponse(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "5", "cache-control": "no-store" } });
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|kavor-logo.svg).*)"],
};
