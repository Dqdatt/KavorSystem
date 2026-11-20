/* expo-status-bar trên web: đổi <meta name="theme-color"> và màu nền html/body theo màn hình
   (splash emerald → #065F46; các màn trong app → #FFFFFF) để phần đỉnh/đáy tràn viền trên iOS hòa hẳn vào nền app. */
import { useEffect } from "react";

export function setStatusBarStyle(style?: "auto" | "inverted" | "light" | "dark") {
  if (typeof document === "undefined") return;
  /* style="light" (chữ trắng: màn Splash xanh #065F46 hoặc màn SpringBoard); style="dark" (chữ đen: các màn trong app có nền #ECFBF3 ở đỉnh) */
  const color = style === "light" ? "#065F46" : "#ECFBF3";
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", color);
  if (window.innerWidth < 600) {
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
  }
}

export function StatusBar({ style }: { style?: "auto" | "inverted" | "light" | "dark"; animated?: boolean }) {
  useEffect(() => { setStatusBarStyle(style); }, [style]);
  return null;
}

export default StatusBar;
