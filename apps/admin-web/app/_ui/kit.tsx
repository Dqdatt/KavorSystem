"use client";
/* Thành phần giao diện theo đúng class của Kavor HR Admin Prototype.html (app/kavor-desktop.css) */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AccountStatus, AdminMe, DeviceStatus, EmployeeStatus, EmploymentType } from "@kavor/contracts";
import { ICONS } from "./icons";

export function Icon({ name, size, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", ...(size ? { width: size, height: size } : {}) }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />
  );
}

/* ---------- Định dạng (giờ theo múi giờ công ty) ---------- */
/* Như prototype: chữ đầu của họ + chữ đầu của tên ("Mai Phương Thảo" → MT) */
export const initials = (name: string) => { const p = name.trim().split(/\s+/); return ((p.length > 1 ? p[0]![0]! : "") + p[p.length - 1]![0]!).toUpperCase(); };
const TONES = ["", "purple", "gold"] as const;
export const avatarTone = (seed: string) => TONES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
export function Avatar({ name, seed }: { name: string; seed?: string }) { return <span className={`avatar ${avatarTone(seed ?? name)}`}>{initials(name)}</span>; }
export function Person({ name, sub, seed }: { name: string; sub?: ReactNode; seed?: string }) {
  return <span className="person"><Avatar name={name} seed={seed} /><span className="person-copy"><b>{name}</b>{sub ? <span>{sub}</span> : null}</span></span>;
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
export const ago = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
};
export const num = (n: number) => n.toLocaleString("vi-VN");
/* Khoảng cách kiểu Việt như mobile: 1,8 m · 126 m · 11 km */
export const meters = (m: number) => (m >= 1000 ? `${(Math.round(m / 100) / 10).toLocaleString("vi-VN")} km` : `${Math.round(m)} m`);
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
export const scopeText = (s: { scopeType: string; scopeName: string }) => (s.scopeType === "tenant" ? "Toàn công ty" : `${SCOPE[s.scopeType] ?? s.scopeType}: ${s.scopeName}`);
export const SCOPE: Record<string, string> = { tenant: "Toàn công ty", legal_entity: "Pháp nhân", branch: "Chi nhánh", department: "Phòng ban", employee: "Cá nhân" };
export function Status({ v }: { v: [string, string] }) { return <span className={`status ${v[1]}`}>{v[0]}</span>; }

/* ---------- Người đang đăng nhập ---------- */
export const MeContext = createContext<AdminMe | null>(null);
export function useMe() { const m = useContext(MeContext); if (!m) throw new Error("MeContext"); return m; }
export const can = (me: AdminMe, perm: string) => me.permissions.includes(perm);

/* ---------- Toast ---------- */
const ToastContext = createContext<(m: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((m: string) => { setMsg(m); setShow(true); clearTimeout(timer.current); timer.current = setTimeout(() => setShow(false), 2700); }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast ${show ? "show" : ""}`} role="status"><Icon name="checks" /><span>{msg}</span></div>
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
        <div className="modal-head"><div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div><button className="modal-close" onClick={onClose} aria-label="Đóng">×</button></div>
        <div className="modal-body">{children}</div>
        {foot ? <div className="modal-foot">{foot}</div> : null}
      </section>
    </div></Layer>
  );
}
export function Drawer({ onClose, head, children }: { onClose: () => void; head: ReactNode; children: ReactNode }) {
  useEsc(onClose);
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

export function Field({ label, full, hint, children }: { label: string; full?: boolean; hint?: string; children: ReactNode }) {
  return <div className={`field ${full ? "full" : ""}`}><label>{label}</label>{children}{hint ? <small>{hint}</small> : null}</div>;
}
export function ErrorLine({ text }: { text: string | null }) { return text ? <p className="text-red" style={{ margin: "10px 0 0", fontSize: 12.5 }}>{text}</p> : null; }

export function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="empty-state"><b>{title}</b>{text ? <span>{text}</span> : null}</div>;
}
export function LoadError({ error, retry }: { error: { message: string } | null; retry: () => void }) {
  if (!error) return null;
  return <div className="banner error"><span className="banner-icon"><Icon name="alert" /></span><span className="banner-copy"><b>Chưa tải được dữ liệu</b><span>{error.message}</span></span><button className="btn" onClick={retry}>Thử lại</button></div>;
}

/* Nút chạy thao tác bất đồng bộ: khóa khi đang chạy, báo lỗi bằng toast */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message); return false; } finally { setBusy(null); }
  }, [toast]);
  return { busy, run };
}
