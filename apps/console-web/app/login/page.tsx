"use client";
/* Đăng nhập Kavor Console (thiết kế bổ sung theo phong cách prototype — prototype Console không có màn đăng nhập).
   Chỉ nhân viên Kavor. Người được mời (và quản trị viên đầu tiên của nền tảng) tự đặt mật khẩu ở "Kích hoạt tài khoản / Quên mật khẩu"
   bằng mã OTP gửi về email. Sau mật khẩu luôn có bước xác thực hai lớp (TOTP). */
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordInput } from "@kavor/web-ui";
import { ADMIN_ERRORS, type ApiEnvelope, type MfaEnrollment, type MfaStatus } from "@kavor/contracts";

class Failure extends Error { constructor(readonly code: string, message: string) { super(message); } }

async function send<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const j = (await r.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!r.ok || !j?.data) throw new Failure(j?.error?.code ?? `HTTP_${r.status}`, j?.error?.message ?? "Hệ thống đang gặp sự cố. Vui lòng thử lại.");
  return j.data;
}
const post = <T,>(url: string, body: unknown) => send<T>("POST", url, body);

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "otp" | "mfa">(params.get("step") === "mfa" ? "mfa" : "login");
  /* Bước kích hoạt / quên mật khẩu: null = nhập email, chuỗi = đã gửi mã tới địa chỉ (che bớt) */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password2, setPassword2] = useState("");
  const [mfa, setMfa] = useState<{ factorId: string; enroll: MfaEnrollment | null } | null>(null);
  const [totp, setTotp] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (params.get("switch")) void fetch("/api/auth/logout", { method: "POST" }); }, [params]);

  const done = () => { const next = params.get("next"); router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/"); router.refresh(); };
  async function run(e: FormEvent, fn: () => Promise<void>) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await fn(); } catch (err) {
      if (err instanceof Failure && err.code === ADMIN_ERRORS.mfaRequired) { setMode("mfa"); return; }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  /* Bước xác thực hai lớp: chưa liên kết thì tạo mã QR mới, đã liên kết thì chỉ hỏi mã */
  const startMfa = useCallback(async () => {
    setError(null); setMfa(null); setTotp("");
    try {
      const st = await send<MfaStatus>("GET", "/api/kavor/console/mfa");
      if (st.verified) { done(); return; }
      if (st.enrolled && st.factorId) { setMfa({ factorId: st.factorId, enroll: null }); return; }
      const en = await send<MfaEnrollment>("POST", "/api/kavor/console/mfa/enroll", {});
      setMfa({ factorId: en.factorId, enroll: en });
    } catch (err) {
      if (err instanceof Failure && err.code === "AUTH_SESSION_EXPIRED") { setMode("login"); return; }
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => { if (mode === "mfa") void startMfa(); }, [mode, startMfa]);

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="card-body" style={{ padding: 26 }}>
          <div className="brand"><img src="/kavor-logo.svg" alt="Kavor" /><span className="brand-copy"><b>Kavor</b><small>Bảng điều khiển</small></span></div>
          {mode === "login" ? (
            <form onSubmit={(e) => run(e, async () => { await post("/api/auth/login", { email: identifier, password }); done(); })}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Đăng nhập</h2>
              <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>Dành cho nhân viên vận hành Kavor. Khách hàng đăng nhập ở web HR của công ty.</p>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="field"><label htmlFor="id">Email Kavor</label><input id="id" type="email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></div>
                <div className="field"><label htmlFor="pw">Mật khẩu</label><PasswordInput id="pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              </div>
              {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
              <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: "center" }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setMode("otp"); setSentTo(null); setCode(""); setPassword(""); setPassword2(""); setError(null); }}>Kích hoạt tài khoản / Quên mật khẩu</a>
              </p>
            </form>
          ) : mode === "otp" ? (
            sentTo === null ? (
              <form onSubmit={(e) => run(e, async () => {
                const r = await post<{ destination: string | null }>("/api/auth/password", { step: "start", email: identifier });
                setSentTo(r.destination ?? identifier);
              })}>
                <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Kích hoạt tài khoản / Quên mật khẩu</h2>
                <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>Nhập email Kavor đã được mời (hoặc email quản trị viên đầu tiên). Kavor gửi mã OTP về email để bạn đặt mật khẩu.</p>
                <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="field"><label htmlFor="oe">Email Kavor</label><input id="oe" type="email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></div>
                </div>
                {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
                <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Đang gửi…" : "Gửi mã OTP"}</button>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: "center" }}><a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); }}>Quay lại đăng nhập</a></p>
              </form>
            ) : (
              <form onSubmit={(e) => run(e, async () => {
                if (password !== password2) throw new Error("Hai lần nhập mật khẩu không khớp.");
                await post("/api/auth/password", { step: "verify", email: identifier, code, password }); done();
              })}>
                <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Đặt mật khẩu</h2>
                <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>Nếu {sentTo} là email nhân viên Kavor (đã được mời hoặc đang hoạt động), mã OTP 6 số đã được gửi tới. Mã hết hạn sau 10 phút.</p>
                <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="field"><label htmlFor="oc">Mã OTP (6 số)</label><input id="oc" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required /></div>
                  <div className="field"><label htmlFor="np">Mật khẩu mới</label><PasswordInput id="np" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                  <div className="field"><label htmlFor="np2">Nhập lại mật khẩu</label><PasswordInput id="np2" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required /></div>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Ít nhất 8 ký tự, có chữ hoa, chữ thường và số.</p>
                {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
                <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy || code.length !== 6}>{busy ? "Đang lưu…" : "Đặt mật khẩu và đăng nhập"}</button>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: "center" }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); setSentTo(null); setCode(""); setError(null); }}>Gửi lại mã / đổi email</a> · <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); }}>Quay lại đăng nhập</a>
                </p>
              </form>
            )
          ) : (
            <form onSubmit={(e) => run(e, async () => {
              if (!mfa) return;
              await post("/api/auth/mfa/verify", { factorId: mfa.factorId, code: totp }); done();
            })}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Xác thực hai lớp</h2>
              {mfa?.enroll ? (
                <>
                  <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>Kavor Console bắt buộc dùng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator, 1Password…). Quét mã dưới đây, rồi nhập mã 6 số ứng dụng hiển thị.</p>
                  <div style={{ display: "grid", placeItems: "center", padding: 12, border: "1px solid var(--line)", borderRadius: 12, background: "#fff" /* QR luôn nền trắng để quét được cả ở theme tối */ }}>
                    <img src={mfa.enroll.qrCode} alt="Mã QR liên kết ứng dụng xác thực" width={180} height={180} />
                  </div>
                  <p className="muted" style={{ fontSize: 12, margin: "10px 0 14px", wordBreak: "break-all" }}>Không quét được? Nhập khóa thủ công: <b style={{ color: "var(--ink)", fontFamily: "ui-monospace, monospace" }}>{mfa.enroll.secret}</b></p>
                </>
              ) : <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>{mfa ? "Mở ứng dụng xác thực trên điện thoại và nhập mã 6 số của Kavor." : error ? "" : "Đang chuẩn bị…"}</p>}
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="field"><label htmlFor="totp">Mã xác thực (6 số)</label><input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} disabled={!mfa} autoFocus required /></div>
              </div>
              {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
              <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy || !mfa || totp.length !== 6}>{busy ? "Đang kiểm tra…" : "Xác nhận"}</button>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: "center" }}>
                Mất điện thoại? Nhờ quản trị viên Kavor Console đặt lại xác thực hai lớp. · <a href="/login?switch=1">Đăng nhập tài khoản khác</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
