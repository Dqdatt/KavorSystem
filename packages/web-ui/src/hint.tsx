"use client";

/* Gợi ý dạng biểu tượng ⓘ cạnh nhãn: chữ giải thích chỉ hiện khi di chuột/focus/chạm, thay cho dòng chữ nhỏ dưới ô nhập
   (phản hồi người dùng 11/11: chữ giải thích nhiều làm rối form). Tooltip vẽ bằng portal, position fixed → không bị modal/bảng cắt. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Hint({ text, label = "Giải thích" }: { text: ReactNode; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = pop.current?.offsetWidth ?? 280, h = pop.current?.offsetHeight ?? 60;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = r.top - h - 8 < 8;
    setPos({ left, top: below ? r.bottom + 8 : r.top - h - 8, below });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  return (
    <span
      ref={ref}
      className="kv-hint"
      tabIndex={0}
      role="button"
      aria-label={label}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div ref={pop} role="tooltip" className={`kv-hint-pop ${pos?.below ? "below" : ""}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>{text}</div>,
            document.body,
          )
        : null}
    </span>
  );
}
