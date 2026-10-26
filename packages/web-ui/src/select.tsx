"use client";

/* Dropdown tự vẽ thay <select> gốc của trình duyệt (menu đúng theme, có ô tìm khi nhiều mục, bàn phím ↑↓/Enter/Esc).
   Dùng như <select>: con là <option>, onChange nhận { target: { value } } nên handler cũ giữ nguyên. */
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Opt = { value: string; label: string; disabled: boolean };
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };

export type SelectChangeEvent = { target: { value: string } };

export type SelectProps = {
  value?: string | number;
  onChange?: (e: SelectChangeEvent) => void;
  children?: ReactNode;
  disabled?: boolean;
  /** "select" (bộ lọc trên thanh công cụ) → kiểu gọn, không giãn hết chiều ngang. */
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  "aria-label"?: string;
  id?: string;
};

const SEARCH_FROM = 9;

function text(node: ReactNode): string {
  let out = "";
  Children.forEach(node, (c) => {
    if (typeof c === "string" || typeof c === "number") out += String(c);
    else if (isValidElement<{ children?: ReactNode }>(c)) out += text(c.props.children);
  });
  return out;
}

function collect(node: ReactNode, out: Opt[]): Opt[] {
  Children.forEach(node, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) {
      collect((c as ReactElement<{ children?: ReactNode }>).props.children, out);
      return;
    }
    if (c.type === "option") {
      const p = (c as ReactElement<OptionProps>).props;
      const label = text(p.children);
      out.push({ value: p.value === undefined ? label : String(p.value), label, disabled: !!p.disabled });
    }
  });
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export function Select({ value, onChange, children, disabled, className, style, placeholder, id, ...rest }: SelectProps) {
  const options = useMemo(() => collect(children, []), [children]);
  const current = value === undefined ? "" : String(value);
  // Giống <select> gốc: giá trị không khớp mục nào thì hiện mục đầu.
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const searchable = options.length >= SEARCH_FROM;

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(o.label).includes(q)) : options;
  }, [options, query]);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, maxHeight: Math.min(320, Math.max(160, up ? above : below)), up });
  }, []);

  const close = useCallback((focus = true) => {
    setOpen(false);
    setQuery("");
    if (focus) btn.current?.focus();
  }, []);

  const show = () => {
    if (disabled) return;
    place();
    const i = options.findIndex((o) => o.value === selected?.value);
    setActive(Math.max(0, i));
    setOpen(true);
  };

  const pick = (o: Opt | undefined) => {
    if (!o || o.disabled) return;
    close();
    if (o.value !== current) onChange?.({ target: { value: o.value } });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const scroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  useEffect(() => setActive(0), [query]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < shown.length; i += dir) if (!shown[i]!.disabled) return i;
    return from;
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(step(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); setActive(step(shown.length, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") e.preventDefault(); close(e.key === "Escape"); }
  };

  const inline = className?.split(/\s+/).includes("select");
  const cls = ["kv-select", inline ? "inline" : "", open ? "open" : "", className?.replace(/\bselect\b/, "").trim() ?? ""].filter(Boolean).join(" ");

  return (
    <>
      <button
        ref={btn}
        type="button"
        id={id}
        className={cls}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest["aria-label"]}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        <span className={`kv-select-value${selected ? "" : " placeholder"}`}>{selected?.label ?? placeholder ?? "Chọn…"}</span>
        <svg className="kv-select-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              className="kv-menu"
              style={{
                left: pos.left,
                minWidth: pos.width,
                maxWidth: Math.max(pos.width, 360),
                maxHeight: pos.maxHeight,
                ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
              }}
              onKeyDown={onKey}
            >
              {searchable ? (
                <label className="kv-menu-search">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm…" aria-label="Tìm trong danh sách" />
                </label>
              ) : null}
              <div ref={list} className="kv-menu-list" role="listbox" id={listId}>
                {shown.length === 0 ? <div className="kv-menu-empty">Không có mục phù hợp</div> : null}
                {shown.map((o, i) => (
                  <button
                    key={`${o.value}-${i}`}
                    type="button"
                    role="option"
                    data-i={i}
                    aria-selected={o.value === selected?.value}
                    disabled={o.disabled}
                    className={`kv-option${i === active ? " active" : ""}${o.value === selected?.value ? " selected" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    tabIndex={-1}
                  >
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
