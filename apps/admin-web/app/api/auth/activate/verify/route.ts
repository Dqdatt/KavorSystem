import { NextResponse } from "next/server";
import type { AuthResult } from "@kavor/contracts";
import { api } from "../../../../_lib/session";
import { fail, sameOrigin, startWebSession } from "../../_shared";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { status, json } = await api<AuthResult>("POST", "auth/activate/verify", { body: { email: b?.email, code: b?.code, password: b?.password } });
  if (status !== 200 || !json.data) return NextResponse.json(json, { status });
  return startWebSession(json.data);
}
