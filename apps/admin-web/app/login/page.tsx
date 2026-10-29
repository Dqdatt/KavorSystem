"use client";
/* Đăng nhập web HR/Admin (thiết kế bổ sung theo phong cách prototype — prototype HR không có màn đăng nhập).
   Quản trị viên được mời lần đầu kích hoạt tài khoản ngay tại đây: mã nhân viên + email công ty → OTP → đặt mật khẩu.
   Sau mật khẩu luôn có bước xác thực hai lớp (TOTP): lần đầu quét mã QR bằng ứng dụng xác thực, các lần sau chỉ nhập mã. */
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADMIN_ERRORS, passwordProblems, type ApiEnvelope, type MfaEnrollment, type MfaStatus } from "@kavor/contracts";

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
  const [mode, setMode] = useState<"login" | "activate" | "otp" | "mfa">(params.get("step") === "mfa" ? "mfa" : "login");
  const [mfa, setMfa] = useState<{ factorId: string; enroll: MfaEnrollment | null } | null>(null);
  const [totp, setTotp] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
      const st = await send<MfaStatus>("GET", "/api/kavor/admin/mfa");
      if (st.verified) { done(); return; }
      if (st.enrolled && st.factorId) { setMfa({ factorId: st.factorId, enroll: null }); return; }
      const en = await send<MfaEnrollment>("POST", "/api/kavor/admin/mfa/enroll", {});
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
          <div className="brand"><img src="/kavor-logo.svg" alt="Kavor" /><span className="brand-copy"><b>Kavor</b><small>HR Workspace</small></span></div>
          {mode === "login" ? (
            <form onSubmit={(e) => run(e, async () => { await post("/api/auth/login", { identifier, password }); done(); })}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Đăng nhập</h2>
              <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>Dành cho quản trị viên, HR và quản lý của doanh nghiệp.</p>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="field"><label htmlFor="id">Mã nhân viên hoặc email công ty</label><input id="id" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></div>
                <div className="field"><label htmlFor="pw">Mật khẩu</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              </div>
              {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
              <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: "center" }}>
                Được mời lần đầu? <a href="#" onClick={(e) => { e.preventDefault(); setMode("activate"); setError(null); }}>Kích hoạt tài khoản</a>
              </p>
            </form>
          ) : mode === "activate" ? (
            <form onSubmit={(e) => run(e, async () => {
              const r = await post<{ destination: string | null; email: string | null }>("/api/auth/activate/start", { employeeCode: code, email });
              setEmail(r.email ?? email); setInfo(`Đã gửi mã OTP tới ${r.destination ?? email}. Mã có hiệu lực 5 phút.`); setMode("otp");
            })}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Kích hoạt tài khoản</h2>
              <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>Nhập mã nhân viên và email công ty trong thư mời.</p>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="field"><label htmlFor="code">Mã nhân viên</label><input id="code" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
                <div className="field"><label htmlFor="email">Email công ty</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              </div>
              {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
              <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Đang gửi mã…" : "Gửi mã OTP"}</button>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: "center" }}><a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); }}>Quay lại đăng nhập</a></p>
            </form>
          ) : mode === "mfa" ? (
            <form onSubmit={(e) => run(e, async () => {
              if (!mfa) return;
              await post("/api/auth/mfa/verify", { factorId: mfa.factorId, code: totp }); done();
            })}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Xác thực hai lớp</h2>
              {mfa?.enroll ? (
                <>
                  <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>Tài khoản quản trị bắt buộc dùng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator, 1Password…). Quét mã dưới đây, rồi nhập mã 6 số ứng dụng hiển thị.</p>
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
                Mất điện thoại? Nhờ quản trị viên khác đặt lại xác thực hai lớp. · <a href="/login?switch=1">Đăng nhập tài khoản khác</a>
              </p>
            </form>
          ) : (
            <form onSubmit={(e) => run(e, async () => {
              const p = passwordProblems(newPw, code);
              if (p.length) throw new Error(p.join(" "));
              await post("/api/auth/activate/verify", { email, code: otp.trim(), password: newPw }); done();
            })}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Nhập mã và đặt mật khẩu</h2>
              <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>{info}</p>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="field"><label htmlFor="otp">Mã OTP (6 số)</label><input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required /></div>
                <div className="field"><label htmlFor="npw">Mật khẩu mới</label><input id="npw" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
                  <small>Ít nhất 8 ký tự, có chữ hoa và số, không chứa mã nhân viên.</small></div>
              </div>
              {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error}</p> : null}
              <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Đang kích hoạt…" : "Kích hoạt và đăng nhập"}</button>
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
