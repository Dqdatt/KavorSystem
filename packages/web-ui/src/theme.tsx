"use client";

/* Theme sáng/tối: <html data-theme="light|dark">, không có thuộc tính = theo hệ điều hành. Lựa chọn nhớ trong localStorage. */
import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "kavor-theme";

/** Chèn vào <head> (dangerouslySetInnerHTML) để đặt theme trước khi vẽ, tránh nháy màu. */
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function read(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(t: ThemeChoice) {
  const el = document.documentElement;
  if (t === "system") delete el.dataset.theme;
  else el.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* trình duyệt chặn lưu trữ: chỉ đổi trong phiên */
  }
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Theo hệ thống", light: "Sáng", dark: "Tối" };

const ICON: Record<ThemeChoice, React.ReactNode> = {
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
};

/** Nút trên topbar: bấm để đổi Theo hệ thống → Sáng → Tối. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => setTheme(read()), []);
  const next = NEXT[theme];
  return (
    <button
      type="button"
      className="icon-btn"
      title={`Giao diện: ${LABEL[theme]} — bấm để chuyển sang ${LABEL[next].toLowerCase()}`}
      aria-label={`Giao diện: ${LABEL[theme]}`}
      onClick={() => {
        apply(next);
        setTheme(next);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICON[theme]}
      </svg>
    </button>
  );
}
