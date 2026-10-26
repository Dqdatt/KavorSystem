"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AdminMe } from "@kavor/contracts";
import { useRealtimeStatus } from "../_lib/client";
import { Icon, MeContext, ToastProvider, can, initials, longDate } from "../_ui/kit";
import { NotificationBell } from "../_ui/notifications";

/* perm dạng mảng = có một trong các quyền là thấy mục */
type NavItem = { href: string; label: string; icon: string; perm?: string | string[] };
/* Chỉ hiện trang của module đã làm (chấm công, nghỉ phép, đơn & phê duyệt, lương & tạm ứng, bản tin, cài đặt doanh nghiệp). Các mục
   khác của prototype (Tổ chức, Tài liệu, Tích hợp, Báo cáo, Phân quyền) sẽ thêm khi module tương ứng tới lượt. */
const NAV: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ href: "/", label: "Tổng quan", icon: "home" }] },
  { label: "Nhân sự", items: [{ href: "/employees", label: "Nhân viên", icon: "users", perm: "employee.read" }] },
  { label: "Thời gian", items: [
    { href: "/attendance", label: "Chấm công", icon: "clock", perm: "attendance.read" },
    { href: "/schedules", label: "Ca & địa điểm", icon: "calendar", perm: "schedule.read" },
    { href: "/leave", label: "Nghỉ phép", icon: "plane", perm: "leave.read" },
  ] },
  { label: "Vận hành", items: [
    { href: "/requests", label: "Đơn & phê duyệt", icon: "checks", perm: "request.read" },
    { href: "/payroll", label: "Lương & tạm ứng", icon: "pay", perm: ["payroll.read", "salary_advance.process", "compensation.read"] },
    { href: "/announcements", label: "Bản tin", icon: "news", perm: "announcement.publish" },
  ] },
];
const TITLES: Record<string, string> = { "/": "Tổng quan", "/employees": "Nhân viên", "/attendance": "Chấm công", "/schedules": "Ca & địa điểm", "/settings": "Cài đặt doanh nghiệp", "/requests": "Đơn & phê duyệt", "/leave": "Nghỉ phép", "/payroll": "Lương & tạm ứng", "/announcements": "Bản tin" };

function today(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function Shell({ me, children }: { me: AdminMe; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const live = useRealtimeStatus(me.tenant.id);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const role = me.roles[0];

  async function logout() {
    if (!confirm("Đăng xuất khỏi Kavor HR?")) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <MeContext.Provider value={me}>
      <main className={`app-shell full ${menu ? "menu-open" : ""}`}>
        <ToastProvider>
          <aside className="sidebar" aria-label="Điều hướng HR">
            <div className="brand">
              <img src="/kavor-logo.svg" alt="Kavor" />
              <span className="brand-copy"><b>Kavor</b><small>HR Workspace</small></span>
              <button className="collapse-btn" onClick={() => setMenu(false)} aria-label="Đóng menu">‹</button>
            </div>
            {NAV.map((g, i) => {
              const items = g.items.filter((it) => !it.perm || [it.perm].flat().some((p) => can(me, p)));
              if (!items.length) return null;
              return (
                <div key={i}>
                  {g.label ? <div className="nav-label">{g.label}</div> : null}
                  {items.map((it) => (
                    <Link key={it.href} href={it.href} className={`nav-item ${active(it.href) ? "active" : ""}`} onClick={() => setMenu(false)}>
                      <span className="nav-icon"><Icon name={it.icon} /></span><span className="nav-text">{it.label}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
            <div className="sidebar-spacer" />
            <div className="nav-sep" />
            {can(me, "policy.read") || can(me, "tenant.settings.manage") ? (
              <Link href="/settings" className={`nav-item ${active("/settings") ? "active" : ""}`} onClick={() => setMenu(false)}>
                <span className="nav-icon"><Icon name="settings" /></span><span className="nav-text">Cài đặt doanh nghiệp</span>
              </Link>
            ) : null}
            <button className="nav-item" onClick={logout}><span className="nav-icon"><Icon name="logout" /></span><span className="nav-text">Đăng xuất</span></button>
            <div className="sidebar-user" title={me.roles.map((r) => `${r.name} · ${r.scopeName}`).join("\n")}>
              <span className="avatar">{initials(me.fullName)}</span>
              <span className="user-copy"><b>{me.fullName}</b><span>{role ? `${role.name}${me.roles.length > 1 ? ` +${me.roles.length - 1}` : ""}` : "—"}</span></span>
            </div>
          </aside>

          <section className="app-main">
            <header className="topbar">
              <button className="icon-btn mobile-menu" onClick={() => setMenu(true)} aria-label="Mở menu"><Icon name="menu" /></button>
              <div className="title-copy"><h1>{TITLES[path] ?? "Kavor HR"}</h1><span className="topbar-sub">{longDate(today(me.tenant.timezone))}</span></div>
              {can(me, "employee.read") ? (
                <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên theo tên, mã hoặc email…"
                  onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) router.push(`/employees?q=${encodeURIComponent(q.trim())}`); }} /></label>
              ) : <span />}
              <div className="top-actions">
                <span className={`realtime-dot ${live ? "on" : ""}`} title={live ? "Đang nhận cập nhật trực tiếp" : "Cập nhật mỗi 30 giây"}><i />{live ? "Trực tiếp" : "30 giây"}</span>
                <NotificationBell />
                <span className="account-chip" title={`Tenant ${me.tenant.code}`}><span className="avatar">{initials(me.fullName)}</span><span>{me.tenant.name}</span></span>
              </div>
            </header>
            <div className="workspace">{children}</div>
          </section>
        </ToastProvider>
      </main>
    </MeContext.Provider>
  );
}
