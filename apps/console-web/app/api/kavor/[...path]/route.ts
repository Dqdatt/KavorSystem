/* Cầu nối trình duyệt → Kavor API: gắn access token từ cookie httpOnly. Chỉ mở nhánh /console/*.
   Phiên đã được proxy.ts làm mới trước khi tới đây. Request ghi phải cùng origin (chống CSRF). */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, api } from "../../../_lib/session";
import { fail, sameOrigin } from "../../auth/_shared";

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, ctx: Ctx, method: string) {
  const { path } = await ctx.params;
  if (path[0] !== "console" || path.some((p) => p === ".." || p.includes("/"))) return fail(404, "NOT_FOUND", "Không tìm thấy.");
  if (method !== "GET" && !sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return fail(401, "AUTH_SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn.");
  const body = method === "GET" ? undefined : await req.json().catch(() => ({}));
  const { status, json } = await api(method, `${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, { token, body });
  return NextResponse.json(json, { status });
}

export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "GET");
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "POST");
export const PATCH = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "PATCH");
