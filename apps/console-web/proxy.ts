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
  if (status !== 200 || !json.data) return deny();

  /* Cookie mới cho request đang xử lý (server component/route handler đọc được ngay) và cho trình duyệt */
  writeSession({ set: (name: string, value: string) => req.cookies.set(name, value) }, json.data.session);
  const res = NextResponse.next({ request: { headers: req.headers } });
  writeSession(res.cookies, json.data.session);
  return res;
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|kavor-logo.svg).*)"],
};
