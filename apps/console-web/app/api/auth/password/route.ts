import { NextResponse } from "next/server";
import type { ConsoleAuthResult, OtpSentResponse } from "@kavor/contracts";
import { api } from "../../../_lib/session";
import { fail, sameOrigin, startWebSession } from "../_shared";

/* Kích hoạt tài khoản (người được mời / quản trị viên đầu tiên) hoặc quên mật khẩu: step "start" gửi OTP, "verify" đặt mật khẩu rồi mở phiên */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "Yêu cầu không hợp lệ.");
  const b = (await req.json().catch(() => null)) as { step?: unknown; email?: unknown; code?: unknown; password?: unknown } | null;
  if (b?.step === "start") {
    const { status, json } = await api<OtpSentResponse>("POST", "console/auth/password/start", { body: { email: b.email } });
    return NextResponse.json(json, { status });
  }
  if (b?.step !== "verify") return fail(400, "VALIDATION_FAILED", "Yêu cầu không hợp lệ.");
  const { status, json } = await api<ConsoleAuthResult>("POST", "console/auth/password/verify", { body: { email: b.email, code: b.code, password: b.password } });
  if (status !== 200 || !json.data) return NextResponse.json(json, { status });
  return startWebSession(json.data);
}
