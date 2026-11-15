"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./kit";

/* Popover neo cố định (.pop): đóng khi bấm ra ngoài hoặc Esc. Nút mở phải có data-pop-btn để bấm lại nút đó không mở lại ngay. */
export function Popover({ className, label, onClose, children }: { className: string; label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { const t = e.target as Element; if (!box.current?.contains(t) && !t.closest("[data-pop-btn]")) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return <div ref={box} className={`pop ${className}`} role="dialog" aria-label={label}>{children}</div>;
}

export function TickList({ items, small }: { items: string[]; small?: boolean }) {
  return <div className="pop-list">{items.map((x) => <div key={x} className="pop-row"><span className={`yes${small ? " sm" : ""}`}><Icon name="check" size={small ? 13 : 16} /></span><span>{x}</span></div>)}</div>;
}
