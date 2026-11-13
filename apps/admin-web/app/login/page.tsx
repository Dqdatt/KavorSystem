"use client";
/* Đăng nhập web HR/Admin (thiết kế bổ sung theo phong cách prototype — prototype HR không có màn đăng nhập).
   Quản trị viên được mời lần đầu kích hoạt tài khoản ngay tại đây: mã nhân viên + email công ty → OTP → đặt mật khẩu.
   Sau mật khẩu luôn có bước xác thực hai lớp (TOTP): lần đầu quét mã QR bằng ứng dụng xác thực, các lần sau chỉ nhập mã. */
import { Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordInput } from "@kavor/web-ui";
import { Icon } from "../_ui/kit";
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

  const err = error ? <p className="lg-err" role="alert"><Icon name="alert" size={14} />{error}</p> : null;
  const back = (to: "login") => <button type="button" className="lg-back" onClick={() => { setMode(to); setError(null); }}><Icon name="chevL" size={16} />Đăng nhập</button>;
  return (
    <div className="lg-page">
      {["a", "b", "c", "d", "e", "f"].map((k) => <i key={k} className={`lg-orb ${k}`} aria-hidden="true" />)}
      <div className="lg-card">
        <aside className="lg-side"><h2>Quản lý nhân sự gọn hơn</h2><p>Chấm công, nghỉ phép và lương trong một nơi.</p><img src="/login-art.svg" alt="" /></aside>
        <section className="lg-fm">
          <div className="lg-bd"><img src="/kavor-logo.svg" alt="" /><b>Kavor</b></div>
          <div className="lg-box">
          {mode === "login" ? (
            <form onSubmit={(e) => run(e, async () => { await post("/api/auth/login", { identifier, password }); done(); })}>
              <h1>Chào mừng trở lại</h1>
              <p className="lg-sub">Đăng nhập vào tài khoản của bạn</p>
              <Fld id="id" label="Mã nhân viên hoặc email công ty" icon="user"><input id="id" placeholder="Mã nhân viên hoặc email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></Fld>
              <Fld id="pw" label="Mật khẩu" icon="lock"><PasswordInput id="pw" placeholder="Mật khẩu" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Fld>
              <div className="lg-opt"><button type="button" className="lg-link" onClick={() => { setMode("activate"); setError(null); }}>Quên mật khẩu?</button></div>
              {err}
              <button className="btn primary lg-btn" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
              <p className="lg-alt">Được mời lần đầu? <button type="button" className="lg-link strong" onClick={() => { setMode("activate"); setError(null); }}>Kích hoạt tài khoản</button></p>
            </form>
          ) : mode === "activate" ? (
            <form onSubmit={(e) => run(e, async () => {
              const r = await post<{ destination: string | null; email: string | null }>("/api/auth/activate/start", { employeeCode: code, email });
              setEmail(r.email ?? email); setInfo(`Đã gửi mã OTP tới ${r.destination ?? email}. Mã có hiệu lực 5 phút.`); setMode("otp");
            })}>
              {back("login")}
              <h1>Kích hoạt tài khoản</h1>
              <p className="lg-sub">Nhập mã nhân viên và email công ty trong thư mời. Cũng dùng khi quên mật khẩu: Kavor gửi mã OTP để đặt mật khẩu mới.</p>
              <Fld id="code" label="Mã nhân viên" icon="user"><input id="code" placeholder="Mã nhân viên" value={code} onChange={(e) => setCode(e.target.value)} required /></Fld>
              <Fld id="email" label="Email công ty" icon="mail"><input id="email" type="email" placeholder="Email công ty" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Fld>
              {err}
              <button className="btn primary lg-btn" disabled={busy}>{busy ? "Đang gửi mã…" : "Gửi mã OTP"}</button>
            </form>
          ) : mode === "mfa" ? (
            <form onSubmit={(e) => run(e, async () => {
              if (!mfa) return;
              await post("/api/auth/mfa/verify", { factorId: mfa.factorId, code: totp }); done();
            })}>
              <h1>Xác thực hai lớp</h1>
              {mfa?.enroll ? (
                <>
                  <p className="lg-sub">Tài khoản quản trị bắt buộc dùng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator, 1Password…). Quét mã dưới đây, rồi nhập mã 6 số ứng dụng hiển thị.</p>
                  <div className="lg-qr"><img src={mfa.enroll.qrCode} alt="Mã QR liên kết ứng dụng xác thực" width={180} height={180} /></div>
                  <p className="lg-hint">Không quét được? Nhập khóa thủ công: <b>{mfa.enroll.secret}</b></p>
                </>
              ) : <p className="lg-sub">{mfa ? "Mở ứng dụng xác thực trên điện thoại và nhập mã 6 số của Kavor." : error ? "" : "Đang chuẩn bị…"}</p>}
              <Fld id="totp" label="Mã xác thực (6 số)" icon="lock"><input id="totp" placeholder="Mã xác thực 6 số" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} disabled={!mfa} autoFocus required /></Fld>
              {err}
              <button className="btn primary lg-btn" disabled={busy || !mfa || totp.length !== 6}>{busy ? "Đang kiểm tra…" : "Xác nhận"}</button>
              <p className="lg-alt">Mất điện thoại? Nhờ quản trị viên khác đặt lại xác thực hai lớp. <a className="lg-link strong" href="/login?switch=1">Đăng nhập tài khoản khác</a></p>
            </form>
          ) : (
            <form onSubmit={(e) => run(e, async () => {
              const p = passwordProblems(newPw, code);
              if (p.length) throw new Error(p.join(" "));
              await post("/api/auth/activate/verify", { email, code: otp.trim(), password: newPw }); done();
            })}>
              <h1>Nhập mã và đặt mật khẩu</h1>
              <p className="lg-sub">{info}</p>
              <Fld id="otp" label="Mã OTP (6 số)" icon="mail"><input id="otp" placeholder="Mã OTP 6 số" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required /></Fld>
              <Fld id="npw" label="Mật khẩu mới" icon="lock"><PasswordInput id="npw" placeholder="Mật khẩu mới" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required /></Fld>
              <p className="lg-hint">Ít nhất 8 ký tự, có chữ hoa và số, không chứa mã nhân viên.</p>
              {err}
              <button className="btn primary lg-btn" disabled={busy}>{busy ? "Đang kích hoạt…" : "Kích hoạt và đăng nhập"}</button>
            </form>
          )}
          </div>
        </section>
      </div>
      <footer className="lg-legal"><span>© {new Date().getFullYear()} Kavor</span></footer>
    </div>
  );
}

/* Ô nhập có biểu tượng bên trái (như prototype v2); nhãn ẩn về mặt hiển thị nhưng vẫn cho trình đọc màn hình */
function Fld({ id, label, icon, children }: { id: string; label: string; icon: string; children: ReactNode }) {
  return <div className="lgf"><label htmlFor={id}>{label}</label><div className="lgi"><Icon name={icon} size={18} />{children}</div></div>;
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
