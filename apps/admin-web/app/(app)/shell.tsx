"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminMe, RequestQueue, SetupChecklist } from "@kavor/contracts";
import { useApi, useRealtimeStatus } from "../_lib/client";
import { AccountMenu } from "../_ui/account-menu";
import pkg from "../../package.json";
import { Icon, MeContext, SubContext, ToastProvider, can, longDate } from "../_ui/kit";
import { CmdK } from "../_ui/cmdk";
import { NotificationBell } from "../_ui/notifications";
import { SupportBanner } from "../_ui/support";

/* perm dạng mảng = có một trong các quyền là thấy mục */
type NavItem = { href: string; label: string; icon: string; perm?: string | string[] };
/* Chỉ hiện trang của module đã làm (chấm công, nghỉ phép, đơn & phê duyệt, lương & tạm ứng, tài liệu, bản tin, cơ cấu tổ chức, phân quyền,
   cài đặt doanh nghiệp). Các mục khác của prototype (Tích hợp, Báo cáo) sẽ thêm khi module tương ứng tới lượt. */
const NAV: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ href: "/", label: "Tổng quan", icon: "home" }] },
  { label: "Nhân sự", items: [{ href: "/employees", label: "Nhân viên", icon: "users", perm: "employee.read" }, { href: "/organization", label: "Cơ cấu tổ chức", icon: "org", perm: "organization.read" }] },
  { label: "Thời gian", items: [
    { href: "/attendance", label: "Chấm công", icon: "clock", perm: "attendance.read" },
    { href: "/schedules", label: "Ca & địa điểm", icon: "calendar", perm: "schedule.read" },
    { href: "/leave", label: "Nghỉ phép", icon: "plane", perm: "leave.read" },
  ] },
  { label: "Vận hành", items: [
    { href: "/requests", label: "Đơn & phê duyệt", icon: "checks", perm: "request.read" },
    { href: "/payroll", label: "Lương & tạm ứng", icon: "pay", perm: ["payroll.read", "salary_advance.process", "compensation.read"] },
    { href: "/documents", label: "Tài liệu", icon: "file", perm: "document.read" },
    { href: "/announcements", label: "Bản tin", icon: "news", perm: "announcement.publish" },
  ] },
  { label: "Hệ thống", items: [
    { href: "/roles", label: "Vai trò & phân quyền", icon: "shield", perm: "role.read" },
    { href: "/settings", label: "Cài đặt doanh nghiệp", icon: "settings", perm: ["policy.read", "tenant.settings.manage"] },
  ] },
];
const TITLES: Record<string, string> = { "/": "Tổng quan", "/employees": "Nhân viên", "/attendance": "Chấm công", "/schedules": "Ca & địa điểm", "/settings": "Cài đặt doanh nghiệp", "/requests": "Đơn & phê duyệt", "/leave": "Nghỉ phép", "/payroll": "Lương & tạm ứng", "/announcements": "Bản tin", "/documents": "Tài liệu", "/organization": "Cơ cấu tổ chức", "/roles": "Vai trò & phân quyền" };

/* Dòng phụ cố định của các trang không cần số liệu (chữ theo prototype); trang có số liệu dùng <PageSub> */
const SUBS: Record<string, string> = {
  "/schedules": "Ca làm, nơi được phép chấm công và phạm vi áp dụng. Thay đổi tạo phiên bản mới, không sửa lùi quá khứ.",
  "/requests": "Giải trình công, nghỉ phép, làm thêm giờ, tạm ứng và sửa hồ sơ.",
  "/payroll": "Bảng lương lấy công từ bảng công đã khóa và mức lương theo ngày hiệu lực.",
  "/documents": "Hợp đồng, quyết định và giấy tờ hồ sơ của nhân viên.",
  "/announcements": "Thông báo gửi tới nhân viên trên app. Bài quan trọng yêu cầu xác nhận đã đọc.",
  "/roles": "5 vai trò mẫu của Kavor. Mỗi người có thể giữ nhiều vai trò với phạm vi khác nhau.",
};

function today(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function Shell({ me, children }: { me: AdminMe; children: ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [mini, setMini] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  useEffect(() => { try { setMini(localStorage.getItem("kavor.sidebarMini") === "1"); } catch { /* chặn lưu trữ: giữ mặc định */ } }, []);
  const toggleMini = () => { const v = !mini; setMini(v); try { localStorage.setItem("kavor.sidebarMini", v ? "1" : "0"); } catch { /* không nhớ được cũng không sao */ } };
  const live = useRealtimeStatus(me.tenant.id);
  /* Số đơn chờ tôi duyệt (đếm đỏ ở mục Đơn & phê duyệt): chỉ lấy 1 dòng, cập nhật theo Realtime như trang đơn */
  const mine = useApi<RequestQueue>(can(me, "request.read") ? "requests?status=pending&only=mine&pageSize=1" : null, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id }).data?.counts.mine ?? 0;
  /* Tiến độ thiết lập ban đầu: chỉ người cấu hình được công ty; tải lại khi đổi trang (vừa lưu cài đặt xong) */
  const setupApi = useApi<SetupChecklist>(can(me, "tenant.settings.manage") ? "settings/checklist" : null);
  const setup = setupApi.data;
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd(true); } };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const pages = NAV.flatMap((g) => g.items).filter((it) => !it.perm || [it.perm].flat().some((p) => can(me, p)));
  const lastPath = useRef(path);
  useEffect(() => { if (lastPath.current !== path) { lastPath.current = path; void setupApi.reload(); } }, [path, setupApi]);
  const profile = path.startsWith("/employees/");
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <MeContext.Provider value={me}>
      <SubContext.Provider value={setSub}>
      <main className={`app-shell full ${menu ? "menu-open" : ""} ${mini ? "mini" : ""}`}>
        <ToastProvider>
          <aside className="sidebar" aria-label="Điều hướng HR">
            <div className="brand">
              <img src="/kavor-logo.svg" alt="Kavor" />
              <span className="brand-copy"><b>Kavor</b></span>
              <button className="mini-toggle" onClick={toggleMini} aria-label={mini ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} title={mini ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}><Icon name="panel" /></button>
              <button className="collapse-btn" onClick={() => setMenu(false)} aria-label="Đóng menu">‹</button>
            </div>
            {NAV.map((g, i) => {
              const items = g.items.filter((it) => !it.perm || [it.perm].flat().some((p) => can(me, p)));
              if (!items.length) return null;
              return (
                <div key={i} className="nav-group">
                  {g.label ? <div className="nav-label">{g.label}</div> : null}
                  {items.map((it) => (
                    <Link key={it.href} href={it.href} title={it.label} className={`nav-item ${active(it.href) ? "active" : ""}`} onClick={() => setMenu(false)}>
                      <span className="nav-icon"><Icon name={it.icon} /></span><span className="nav-text">{it.label}</span>
                      {it.href === "/requests" && mine > 0 ? <span className="nav-count" aria-label={`${mine} đơn chờ bạn duyệt`}>{mine}</span> : null}
                    </Link>
                  ))}
                </div>
              );
            })}
            {setup && setup.done < setup.total ? (
              <div className="promo">
                <div className="promo-top">
                  <span className="promo-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" /><circle className="val" cx="22" cy="22" r="18" strokeDasharray={`${((setup.done / setup.total) * 113.1).toFixed(1)} 113.1`} transform="rotate(-90 22 22)" /></svg><b>{setup.done}/{setup.total}</b></span>
                  <span className="promo-text"><small>Thiết lập hệ thống</small><b>Còn {setup.total - setup.done} bước</b></span>
                </div>
                <Link className="promo-btn" href="/settings?tab=setup" onClick={() => setMenu(false)}>Xem các bước<Icon name="chevR" /></Link>
              </div>
            ) : null}
          </aside>

          <section className="app-main">
            <header className="topbar">
              <button className="icon-btn mobile-menu" onClick={() => setMenu(true)} aria-label="Mở menu"><Icon name="menu" /></button>
              <div className="title-copy"><h1>{profile ? "Hồ sơ nhân viên" : TITLES[path] ?? "Kavor HR"}</h1>
                {profile ? <span className="topbar-sub"><Link href="/employees">Nhân viên</Link> / {sub}</span> : <span className="topbar-sub">{sub ? sub.split(" | ").map((x, i) => <Fragment key={i}>{i ? <i className="vs" /> : null}{x}</Fragment>) : SUBS[path] ?? longDate(today(me.tenant.timezone))}</span>}</div>
              <div id="page-actions" className="page-actions" />
              <button className="search cmdk-btn" onClick={() => setCmd(true)} aria-label="Tìm kiếm"><Icon name="search" /><span className="grow trunc">Tìm nhanh…</span><span className="kbd">Ctrl K</span></button>
              <div className="top-actions">
                <NotificationBell />
                <AccountMenu />
              </div>
            </header>
            <div className="workspace"><SupportBanner />{children}</div>
            <footer className="foot">
              <span>© {new Date().getFullYear()} Kavor</span>
              {can(me, "privacy.read") ? <Link href="/settings?tab=privacy">Chính sách bảo mật</Link> : null}
              {can(me, "support_access.approve") ? <Link href="/settings?tab=support">Liên hệ hỗ trợ</Link> : null}
              <span className="grow" />
              <span className={`realtime-dot ${live ? "on" : ""}`}><i />{live ? "Đang cập nhật trực tiếp" : "Mất kết nối cập nhật"}</span>
              <span className="ver">Phiên bản {pkg.version}</span>
            </footer>
          </section>
        {cmd ? <CmdK pages={pages} onClose={() => setCmd(false)} /> : null}
        </ToastProvider>
      </main>
      </SubContext.Provider>
    </MeContext.Provider>
  );
}
