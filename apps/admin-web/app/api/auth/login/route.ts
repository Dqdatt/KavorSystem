import { NextResponse } from "next/server";
import type { AuthResult } from "@kavor/contracts";
import { api } from "../../../_lib/session";
import { fail, sameOrigin, startWebSession } from "../_shared";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const body = (await req.json().catch(() => null)) as { identifier?: unknown; password?: unknown } | null;
  const { status, json } = await api<AuthResult>("POST", "auth/login", { body: { identifier: body?.identifier, password: body?.password } });
  if (status !== 200 || !json.data) return NextResponse.json(json, { status });
  return startWebSession(json.data);
}
