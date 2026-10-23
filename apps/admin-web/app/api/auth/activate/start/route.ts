import { NextResponse } from "next/server";
import { api } from "../../../../_lib/session";
import { fail, sameOrigin } from "../../_shared";

/* Quản trị viên được mời kích hoạt tài khoản trên web (cùng luồng mã NV + email công ty + OTP như mobile) */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { status, json } = await api("POST", "auth/activate/start", { body: { employeeCode: b?.employeeCode, email: b?.email } });
  return NextResponse.json(json, { status });
}
