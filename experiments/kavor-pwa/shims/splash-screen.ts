/* expo-splash-screen trên web: màn chờ là #boot-splash trong public/index.html; app gọi hideAsync khi lớp splash của app đã sẵn sàng */
export async function preventAutoHideAsync() { return true; }
export async function hideAsync() {
  const el = typeof document === "undefined" ? null : document.getElementById("boot-splash");
  if (!el) return;
  el.classList.add("gone");
  setTimeout(() => el.remove(), 300);
}
export function hide() { void hideAsync(); }
export function setOptions(_o: unknown) {}
