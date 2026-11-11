"use client";
/* Menu tài khoản ở góc trên phải (bấm tên doanh nghiệp): thông tin người đăng nhập + vai trò, doanh nghiệp, Cài đặt doanh nghiệp,
   giao diện sáng/tối, trạng thái cập nhật trực tiếp và Đăng xuất. Thay cho khối cuối thanh bên (phản hồi người dùng 11/11). */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeSwitch } from "@kavor/web-ui";
import { Icon, can, initials, scopeText, useMe } from "./kit";

export function AccountMenu({ live }: { live: boolean }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function logout() {
    if (!confirm("Đăng xuất khỏi Kavor HR?")) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  const settings = can(me, "policy.read") || can(me, "tenant.settings.manage");
  const support = can(me, "support_access.approve");
  const done = () => setOpen(false);
  return (
    <div ref={box} className="account-wrap">
      <button className={`account-chip ${open ? "open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar">{initials(me.fullName)}</span>
        <span className="account-name">{me.tenant.name}</span>
        <svg className="account-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="card account-pop" role="menu" aria-label="Tài khoản">
          <div className="account-head">
            <span className="avatar">{initials(me.fullName)}</span>
            <span className="account-copy"><b>{me.fullName}</b><span>{me.email}</span></span>
          </div>
          {me.roles.length ? (
            <div className="account-roles">
              {me.roles.map((r, i) => <span key={i} className="account-role"><b>{r.name}</b><span>{scopeText(r)}</span></span>)}
            </div>
          ) : null}
          <div className="account-sep" />
          <div className="account-company">
            <span className="metric-icon"><Icon name="brief" /></span>
            <span className="account-copy"><b>{me.tenant.name}</b><span>Mã công ty {me.tenant.code}</span></span>
          </div>
          {settings ? <Link role="menuitem" className="account-item" href="/settings" onClick={done}><Icon name="settings" />Cài đặt doanh nghiệp</Link> : null}
          {settings ? <Link role="menuitem" className="account-item" href="/settings?tab=setup" onClick={done}><Icon name="checks" />Thiết lập ban đầu</Link> : null}
          {support ? <Link role="menuitem" className="account-item" href="/settings?tab=support" onClick={done}><Icon name="help" />Hỗ trợ Kavor</Link> : null}
          <div className="account-sep" />
          <div className="account-row"><span>Giao diện</span><ThemeSwitch /></div>
          <div className="account-row"><span>Cập nhật dữ liệu</span><span className={`realtime-dot ${live ? "on" : ""}`}><i />{live ? "Trực tiếp" : "Mỗi 30 giây"}</span></div>
          <div className="account-sep" />
          <button role="menuitem" className="account-item danger" onClick={() => void logout()}><Icon name="logout" />Đăng xuất</button>
        </div>
      ) : null}
    </div>
  );
}
