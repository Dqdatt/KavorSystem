"use client";
/* Thành phần giao diện theo đúng class của Kavor HR Admin Prototype.html (app/kavor-desktop.css) */
import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AccountStatus, AdminMe, DeviceStatus, EmployeeStatus, EmploymentType } from "@kavor/contracts";
import { Hint } from "@kavor/web-ui";
import { ICONS } from "./icons";

export function Icon({ name, size, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", ...(size ? { width: size, height: size } : {}) }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />
  );
}

/* ---------- Định dạng (giờ theo múi giờ công ty) ---------- */
/* Như prototype: chữ đầu của họ + chữ đầu của tên ("Mai Phương Thảo" → MT) */
export const initials = (name: string) => { const p = name.trim().split(/\s+/); return ((p.length > 1 ? p[0]![0]! : "") + p[p.length - 1]![0]!).toUpperCase(); };
const TONES = ["t0", "t1", "t2", "t3", "t4", "t5"] as const;
export const avatarTone = (seed: string) => TONES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
export function Avatar({ name, seed, xl }: { name: string; seed?: string; xl?: boolean }) { return <span className={`avatar ${xl ? "xl " : ""}${avatarTone(seed ?? name)}`}>{initials(name)}</span>; }
/* Dòng meta: " | " → vạch .vs như prototype (chuỗi dữ liệu/CSV/API giữ nguyên) */
export const vs = (t: ReactNode) => typeof t === "string" ? t.split(" | ").map((x, i) => <Fragment key={i}>{i ? <i className="vs" /> : null}{x}</Fragment>) : t;
export function Person({ name, sub, seed, badge }: { name: string; sub?: ReactNode; seed?: string; badge?: ReactNode }) {
  return <span className="person"><Avatar name={name} seed={seed} /><span className="person-copy"><b>{name}{badge ? <> {badge}</> : null}</b>{sub ? <span>{vs(sub)}</span> : null}</span></span>;
}

export const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export function fmtTime(iso: string | null | undefined, tz: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
export function fmtDateTime(iso: string | null | undefined, tz: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  const day = `${p.day}/${p.month}`;
  return `${day} ${fmtTime(iso, tz)}`;
}
export function longDate(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][d.getUTCDay()];
  return `${wd}, ${d.getUTCDate()} tháng ${d.getUTCMonth() + 1}, ${d.getUTCFullYear()}`;
}
export const tenantToday = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
/* Thâm niên từ ngày vào làm tới hôm nay (cả hai dạng YYYY-MM-DD): "x năm y tháng" / "y tháng" / "dưới 1 tháng" */
export function tenure(hireDate: string, today: string) {
  const [hy, hm, hd] = hireDate.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const total = (ty - hy) * 12 + (tm - hm) - (td < hd ? 1 : 0);
  if (total < 0) return "Chưa đến ngày vào làm";
  if (total < 1) return "dưới 1 tháng";
  const y = Math.floor(total / 12), m = total % 12;
  return [y ? `${y} năm` : "", m ? `${m} tháng` : ""].filter(Boolean).join(" ");
}
export const ago = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
};
export const num = (n: number) => n.toLocaleString("vi-VN");
/* Khoảng cách kiểu Việt như mobile: 1,8 m · 126 m · 11 km */
export const meters = (m: number) => (m >= 1000 ? `${(Math.round(m / 100) / 10).toLocaleString("vi-VN")}\u00a0km` : `${Math.round(m)}\u00a0m`);
export const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ""}` : `${m} phút`);

/* ---------- Nhãn trạng thái ---------- */
export const EMPLOYMENT: Record<EmploymentType, string> = { official: "Chính thức", probation: "Thử việc", contractor: "Cộng tác viên", intern: "Thực tập" };
export const EMP_STATUS: Record<EmployeeStatus, [string, string]> = {
  active: ["Đang làm việc", ""], preboarding: ["Chuẩn bị nhận việc", "info"], on_leave: ["Tạm nghỉ", "muted"], suspended: ["Đình chỉ", "bad"], leaving: ["Sắp nghỉ", "warn"], terminated: ["Đã nghỉ việc", "muted"],
};
export const ACCOUNT: Record<AccountStatus, [string, string]> = { active: ["Đã kích hoạt", ""], invited: ["Đã mời", "info"], not_invited: ["Chưa mời", "warn"], locked: ["Đã khóa", "bad"] };
export const DEVICE: Record<DeviceStatus, [string, string]> = { active: ["Đang dùng", ""], pending: ["Chờ duyệt", "warn"], revoked: ["Đã thu hồi", "muted"], rejected: ["Đã từ chối", "bad"] };
export const REJECT_REASON: Record<string, string> = {
  out_of_range: "Ngoài vùng chấm công", low_accuracy: "GPS kém chính xác", device_not_registered: "Thiết bị chưa đăng ký", invalid_sequence: "Sai trình tự", clock_skew: "Giờ máy không đúng",
};
/* "Phòng ban: Marketing"; tầng công ty chỉ ghi "Toàn công ty" */
export const scopeText = (s: { scopeType: string; scopeName: string }) => (s.scopeType === "tenant" ? "Toàn công ty" : s.scopeType === "self" ? s.scopeName : `${SCOPE[s.scopeType] ?? s.scopeType}: ${s.scopeName}`);
export const SCOPE: Record<string, string> = { tenant: "Toàn công ty", legal_entity: "Pháp nhân", branch: "Chi nhánh", department: "Phòng ban", employee: "Cá nhân" };
export function Status({ v }: { v: [string, string] }) { return <span className={`status ${v[1]}`}>{vs(v[0])}</span>; }

/* ---------- Người đang đăng nhập ---------- */
export const MeContext = createContext<AdminMe | null>(null);
export function useMe() { const m = useContext(MeContext); if (!m) throw new Error("MeContext"); return m; }
export const can = (me: AdminMe, perm: string) => me.permissions.includes(perm);

/* ---------- Toast ---------- */
/* kind "error": thông báo lỗi (biểu tượng cảnh báo đỏ) — trước đây lỗi cũng hiện dấu tích như thành công */
type Toast = (m: string, kind?: "error") => void;
const ToastContext = createContext<Toast>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback<Toast>((m, kind) => { setMsg(m); setErr(kind === "error"); setShow(true); clearTimeout(timer.current); timer.current = setTimeout(() => setShow(false), 2700); }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast ${show ? "show" : ""} ${err ? "error" : ""}`} role={err ? "alert" : "status"}><Icon name={err ? "alert" : "checks"} /><span>{msg}</span></div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ---------- Modal / Drawer ---------- */
function useEsc(onClose: () => void) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", f); return () => document.removeEventListener("keydown", f); }, [onClose]);
}
/* Modal/drawer gắn thẳng vào .app-shell như prototype: nếu để trong .page (có animation transform) thì
   position:absolute bị bó trong vùng nội dung trang */
function Layer({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(document.querySelector(".app-shell") ?? document.body); }, []);
  return host ? createPortal(children, host) : null;
}

export function Modal({ title, sub, onClose, children, foot, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEsc(onClose);
  return (
    <Layer><div className="modal-layer show">
      <div className="scrim" onClick={onClose} />
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: "min(760px, calc(100% - 28px))" } : undefined}>
        <div className="modal-head"><div><h3>{title}</h3>{sub ? <p>{vs(sub)}</p> : null}</div><button className="modal-close" onClick={onClose} aria-label="Đóng">×</button></div>
        <div className="modal-body">{children}</div>
        {foot ? <div className="modal-foot">{foot}</div> : null}
      </section>
    </div></Layer>
  );
}
export function Drawer({ onClose, head, children, wide }: { onClose: () => void; head: ReactNode; children: ReactNode; wide?: boolean }) {
  useEsc(onClose);
  /* wide: hồ sơ nhiều mục → modal rộng giữa màn hình, chiều cao cố định (đổi tab không nhảy khung) */
  if (wide) return (
    <Layer><div className="modal-layer show">
      <div className="scrim" onClick={onClose} />
      <section className="modal detail-modal" role="dialog" aria-modal="true">
        <div className="drawer-head"><button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" /></button>{head}</div>
        <div className="drawer-body">{children}</div>
      </section>
    </div></Layer>
  );
  return (
    <Layer><div className="drawer-layer show">
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head"><button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" /></button>{head}</div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div></Layer>
  );
}

/* hint: giải thích → biểu tượng ⓘ cạnh nhãn (chỉ hiện khi di chuột/chạm); note: dòng ngắn luôn hiện (cảnh báo, kết quả tính) */
/* Nút hành động của trang hiện trên topbar cạnh tên trang (portal vào #page-actions) — không còn hàng nút riêng để trống bên trái */
export function PageActions({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  /* Trang có hàng tab: nút nằm bên phải hàng tab (prototype .tabrow .acts); không có thì ở topbar */
  useEffect(() => { setHost(document.getElementById("tab-actions") ?? document.getElementById("page-actions")); }, []);
  return host ? createPortal(<>{children}</>, host) : null;
}

/* Dòng phụ dưới tên trang (topbar): trang gọi <PageSub text="…" /> để thay ngày mặc định; rời trang thì trả lại */
export const SubContext = createContext<(t: string | null) => void>(() => {});
export function PageSub({ text }: { text: string | null }) {
  const set = useContext(SubContext);
  useEffect(() => { set(text); return () => set(null); }, [set, text]);
  return null;
}

export function Field({ label, full, hint, note, children }: { label: string; full?: boolean; hint?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return <div className={`field ${full ? "full" : ""}`}><label>{label}{hint ? <Hint text={hint} /> : null}</label>{children}{note ? <small>{note}</small> : null}</div>;
}
export function ErrorLine({ text }: { text: string | null }) { return text ? <p className="text-red" style={{ margin: "10px 0 0", fontSize: 12.5 }}>{text}</p> : null; }

/* Icon trạng thái rỗng như prototype empty(icon,…): đoán theo tiêu đề, truyền icon để chỉ định */
const EMPTY_ICONS: Array<[RegExp, string]> = [[/còn đơn|bị từ chối|việc cần xử lý|thiếu giấy tờ/i, "check"], [/tìm thấy|phù hợp/i, "search"], [/giữ vai trò/i, "shield"],
  [/đơn|tạm ứng/i, "checks"], [/thiết bị/i, "phone"], [/bài/i, "news"], [/hỗ trợ|yêu cầu/i, "help"], [/nhân viên|nhân sự|ai /i, "users"], [/giấy tờ|tài liệu/i, "file"],
  [/địa điểm/i, "pin"], [/ca|lịch|phép/i, "calendar"], [/lương|phụ cấp/i, "pay"]];
export function Empty({ title, text, icon }: { title: string; text?: string; icon?: string }) {
  const ic = icon ?? EMPTY_ICONS.find(([re]) => re.test(title))?.[1] ?? "info";
  return <div className="empty-state"><span className="ring"><Icon name={ic} size={24} /></span><b>{title}</b>{text ? <span>{text}</span> : null}</div>;
}
export function LoadError({ error, retry }: { error: { message: string } | null; retry: () => void }) {
  if (!error) return null;
  return <div className="banner soft-bad"><span className="banner-icon"><Icon name="alert" /></span><span className="banner-copy"><b>Chưa tải được dữ liệu</b><span>{error.message}</span></span><button className="btn" onClick={retry}>Thử lại</button></div>;
}

/* Nút chạy thao tác bất đồng bộ: khóa khi đang chạy, báo lỗi bằng toast */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message, "error"); return false; } finally { setBusy(null); }
  }, [toast]);
  return { busy, run };
}

/* Giá trị dài (địa chỉ, "chi nhánh · pháp nhân"): xuống dòng giữa các cụm (sau dấu phẩy / dấu chấm giữa), không tách tên riêng như "Quảng | Ngãi".
   Cụm quá dài so với dòng vẫn tự xuống dòng bên trong. */
export function Phrases({ text }: { text: string | null | undefined }) {
  if (!text) return <>—</>;
  const parts = text.split(/(?<=,|·|;)\s+/);
  /* Dấu cách nằm ngoài cụm (trong inline-block nó bị nuốt); số + đơn vị dính nhau ("50 m", "8 giờ") */
  return <>{parts.map((t, i) => <Fragment key={i}><span className="phrase">{t.replace(/(\d) (?=[a-zA-Zđ%₫])/g, "$1\u00a0")}</span>{i < parts.length - 1 ? " " : null}</Fragment>)}</>;
}

/* Khối khóa–giá trị và thẻ có tiêu đề (web HR v2) */
export function Dl({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <div className="dl">{rows.map(([k, v], i) => <Fragment key={i}><div className="k">{k}</div><div className="v">{vs(v)}</div></Fragment>)}</div>;
}
/* Thẻ số liệu v2 (prototype .thk): nhãn, số lớn, chip phụ; icon vuông bên phải */
export function Thk({ label, value, chip, tone = "", icon }: { label: string; value: ReactNode; chip?: ReactNode; tone?: "" | "mint" | "ok" | "warn"; icon: string }) {
  return (
    <div className={`thk ${tone === "mint" ? "mint" : ""}`}>
      <div className="tx"><span className="l">{label}</span><b className="v">{value}</b>{chip ? <span className={`chip ${tone}`}>{chip}</span> : null}</div>
      <span className="ico"><Icon name={icon} size={24} /></span>
    </div>
  );
}
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="card"><div className="card-head"><h3>{title}</h3>{action}</div><div className="card-body">{children}</div></section>;
}

/* Menu "⋯": hành động phụ của hồ sơ */
export function MoreMenu({ items, bare }: { items: Array<{ label: string; icon: string; danger?: boolean; onClick: () => void }>; bare?: boolean }) {
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
  return (
    <div ref={box} className="menu-wrap">
      <button className={bare ? "iconbtn bare" : "btn"} aria-haspopup="menu" aria-expanded={open} aria-label="Thêm hành động" onClick={() => setOpen(!open)}><Icon name="more" /></button>
      {open ? <div className="kv-menu" role="menu">{items.map((it) => (
        <button key={it.label} role="menuitem" className={`kv-option ${it.danger ? "danger" : ""}`} onClick={() => { setOpen(false); it.onClick(); }}><Icon name={it.icon} />{it.label}</button>
      ))}</div> : null}
    </div>
  );
}
