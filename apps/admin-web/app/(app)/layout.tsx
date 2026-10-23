import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_ERRORS, type AdminMe } from "@kavor/contracts";
import { COOKIE, api } from "../_lib/session";
import { Shell } from "./shell";

/* Người dùng và quyền lấy từ Kavor API ở mỗi lần tải trang; menu dựng theo permission */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) redirect("/login");
  const { status, json } = await api<AdminMe>("GET", "admin/me", { token });
  if (status === 401) redirect("/login");
  if (json.error?.code === ADMIN_ERRORS.mfaRequired) redirect("/login?step=mfa");
  if (!json.data) {
    return (
      <div className="login-wrap"><div className="card login-card"><div className="card-body">
        <h3 style={{ marginTop: 0 }}>Không vào được Kavor HR</h3>
        <p className="muted">{json.error?.message ?? "Hệ thống đang gặp sự cố."}</p>
        <div className="head-actions" style={{ justifyContent: "flex-start" }}>
          {json.error?.retryable ? <a className="btn primary" href="">Thử lại</a> : null}
          <a className="btn" href="/login?switch=1">Đăng nhập bằng tài khoản khác</a>
        </div>
      </div></div></div>
    );
  }
  return <Shell me={json.data}>{children}</Shell>;
}
