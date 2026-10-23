/* Bước 2 của đăng nhập Console: mã TOTP → Kavor API đổi sang phiên aal2 → ghi lại cookie (thay phiên aal1). */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { AuthSession } from "@kavor/contracts";
import { COOKIE, api } from "../../../../_lib/session";
import { fail, sameOrigin, startWebSession } from "../../_shared";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const jar = await cookies();
  const token = jar.get(COOKIE.access)?.value;
  if (!token) return fail(401, "AUTH_SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { status, json } = await api<AuthSession>("POST", "console/mfa/verify", { token, body: { factorId: b?.factorId, code: b?.code } });
  if (status !== 200 || !json.data) return NextResponse.json(json, { status });
  return startWebSession({ session: json.data });
}
