import { NextResponse } from "next/server";
import { COOKIE, api, clearSession } from "../../../_lib/session";
import { fail, sameOrigin } from "../_shared";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE.access}=([^;]+)`))?.[1];
  if (token) await api("POST", "auth/logout", { token: decodeURIComponent(token) });
  const res = NextResponse.json({ data: { ok: true }, meta: { correlationId: "web" }, error: null });
  clearSession(res.cookies);
  return res;
}
