"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { OperatorMe } from "@kavor/contracts";
import { Icon, MeContext, ToastProvider, initials, longDate, tenantToday } from "../_ui/kit";

type NavItem = { href: string; label: string; icon: string };
/* Chỉ hiện trang đã làm (tenant, gói dịch vụ, khôi phục chủ sở hữu, audit). Các mục khác của prototype (Usage — đã gộp bảng
   "gần giới hạn" vào Gói dịch vụ, Sync jobs, Sự cố, Releases, Feature flags, Cài đặt nền tảng) sẽ thêm khi tới lượt. */
const NAV: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ href: "/", label: "Tổng quan nền tảng", icon: "home" }] },
  { label: "Khách hàng", items: [{ href: "/tenants", label: "Doanh nghiệp", icon: "building" }, { href: "/plans", label: "Gói dịch vụ", icon: "card" }] },
  { label: "An toàn", items: [{ href: "/support", label: "Support access", icon: "lock" }, { href: "/recoveries", label: "Khôi phục chủ sở hữu", icon: "key" }, { href: "/audit", label: "Audit log", icon: "log" }] },
];
const TITLES: Record<string, string> = { "/": "Tổng quan nền tảng", "/tenants": "Doanh nghiệp", "/plans": "Gói dịch vụ", "/support": "Support access", "/recoveries": "Khôi phục chủ sở hữu", "/audit": "Audit log" };
const ROLE: Record<OperatorMe["role"], string> = { platform_operator: "Platform Operator", platform_support: "Kavor Support" };

export function Shell({ me, children }: { me: OperatorMe; children: ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  async function logout() {
    if (!confirm("Đăng xuất khỏi Kavor Console?")) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <MeContext.Provider value={me}>
      <main className={`app-shell full ${menu ? "menu-open" : ""}`}>
        <ToastProvider>
          <aside className="sidebar" aria-label="Điều hướng Kavor Console">
            <div className="brand">
              <img src="/kavor-logo.svg" alt="Kavor" />
              <span className="brand-copy"><b>Kavor</b><small>Platform Console</small></span>
              <button className="collapse-btn" onClick={() => setMenu(false)} aria-label="Đóng menu">‹</button>
            </div>
            {NAV.map((g, i) => (
              <div key={i}>
                {g.label ? <div className="nav-label">{g.label}</div> : null}
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className={`nav-item ${active(it.href) ? "active" : ""}`} onClick={() => setMenu(false)}>
                    <span className="nav-icon"><Icon name={it.icon} /></span><span className="nav-text">{it.label}</span>
                  </Link>
                ))}
              </div>
            ))}
            <div className="sidebar-spacer" />
            <div className="nav-sep" />
            <button className="nav-item" onClick={logout}><span className="nav-icon"><Icon name="logout" /></span><span className="nav-text">Đăng xuất</span></button>
            <div className="sidebar-user" title={me.email}>
              <span className="avatar purple">{initials(me.fullName)}</span>
              <span className="user-copy"><b>{me.fullName}</b><span>{ROLE[me.role]}</span></span>
            </div>
          </aside>

          <section className="app-main">
            <header className="topbar">
              <button className="icon-btn mobile-menu" onClick={() => setMenu(true)} aria-label="Mở menu"><Icon name="menu" /></button>
              <div className="title-copy"><h1>{TITLES[path] ?? (path.startsWith("/support/") ? "Chế độ hỗ trợ" : "Kavor Console")}</h1><span className="topbar-sub">{longDate(tenantToday("Asia/Ho_Chi_Minh"))}</span></div>
              <span />
              <div className="top-actions">
                <span className="account-chip" title={me.email}><span className="avatar purple">{initials(me.fullName)}</span><span>{process.env.NEXT_PUBLIC_KAVOR_ENV ?? "Local dev"}</span></span>
              </div>
            </header>
            <div className="workspace">{children}</div>
          </section>
        </ToastProvider>
      </main>
    </MeContext.Provider>
  );
}
