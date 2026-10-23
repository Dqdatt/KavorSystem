import { NextResponse } from "next/server";
import { ADMIN_ERRORS, type ApiEnvelope, type AuthSession, type OperatorMe } from "@kavor/contracts";
import { api, writeSession } from "../../_lib/session";

export const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ data: null, meta: { correlationId: "web" }, error: { code, message, retryable: false } } satisfies ApiEnvelope<null>, { status });

/* Chống CSRF cho các route ghi: chỉ nhận request từ chính origin của web */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(req.url).origin;
}

/* Sau khi Kavor API cấp phiên: chỉ đặt cookie nếu là nhân viên Kavor. Phiên mật khẩu (aal1) vẫn được đặt cookie để làm
   bước xác thực hai lớp; API chặn mọi trang khác cho tới khi nhập mã. */
export async function startWebSession(result: { session: AuthSession }) {
  const me = await api<OperatorMe>("GET", "console/me", { token: result.session.accessToken });
  if (me.json.error?.code === ADMIN_ERRORS.mfaRequired) {
    const res = NextResponse.json(me.json, { status: 403 });
    writeSession(res.cookies, result.session);
    return res;
  }
  if (me.status !== 200 || !me.json.data) {
    await api("POST", "console/auth/logout", { token: result.session.accessToken });
    return NextResponse.json(me.json, { status: me.status === 200 ? 403 : me.status });
  }
  const res = NextResponse.json({ data: me.json.data, meta: me.json.meta, error: null } satisfies ApiEnvelope<OperatorMe>);
  writeSession(res.cookies, result.session);
  return res;
}
