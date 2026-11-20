/* Banner đầu trang trên iPhone/Android: báo app native đã có trên cửa hàng, hoặc hướng dẫn cài PWA ra Màn hình chính. */
declare const process: { env: Record<string, string | undefined> };

const KEY = "kavor-pwa:banner-closed";
type Links = { ios: string | null; android: string | null };

async function loadLinks(): Promise<Links> {
  const none: Links = { ios: null, android: null };
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) return none;
  try {
    const res = await fetch(`${base}/meta`);
    const l = ((await res.json()) as { data?: { appLinks?: Partial<Links> } }).data?.appLinks;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    return { ios: str(l?.ios), android: str(l?.android) };
  } catch {
    return none;
  }
}

function show(id: string, title: string, sub: string, link?: string) {
  const el = document.createElement("div");
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Cài ứng dụng Kavor");
  el.style.cssText = "position:fixed;top:env(safe-area-inset-top);left:50%;transform:translateX(-50%);width:calc(100% - 16px);max-width:440px;box-sizing:border-box;z-index:2147483000;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#065F46;color:#fff;font:13px/1.35 -apple-system,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3)";
  const text = document.createElement("div");
  text.style.flex = "1";
  const t = document.createElement("div");
  t.style.fontWeight = "600";
  t.textContent = title;
  const s = document.createElement("div");
  s.style.cssText = "font-size:12px;opacity:.85";
  s.textContent = sub;
  text.append(t, s);
  el.append(text);
  if (link) {
    const go = document.createElement("button");
    go.textContent = "Tải app";
    go.style.cssText = "border:0;border-radius:10px;padding:8px 12px;background:#fff;color:#065F46;font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer";
    go.onclick = () => { window.open(link, "_blank", "noopener"); };
    el.append(go);
  }
  const x = document.createElement("button");
  x.textContent = "×";
  x.setAttribute("aria-label", "Đóng");
  x.style.cssText = "border:0;background:transparent;color:#fff;font:22px/1 -apple-system,system-ui,sans-serif;padding:4px 6px;cursor:pointer";
  x.onclick = () => {
    try { localStorage.setItem(KEY, id); } catch {}
    el.remove();
  };
  el.append(x);
  document.body.appendChild(el);
}

async function run() {
  if (navigator.webdriver) return;
  const ua = navigator.userAgent;
  const android = /Android/.test(ua);
  /* iPad đời mới báo platform "MacIntel" + có cảm ứng; xét sau Android để không bắt nhầm máy Android giả lập trên Mac */
  const ios = !android && (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  if (!ios && !android) return;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const links = await loadLinks();
  const link = ios ? links.ios : links.android;
  let id: string;
  let title: string;
  let sub: string;
  let store: string | undefined;
  let external = false;
  if (link) { try { external = new URL(link, location.href).origin !== location.origin; } catch {} }
  if (link && external) {
    const host = new URL(link, location.href).host;
    id = link;
    title = host === "apps.apple.com" ? "Kavor đã có trên App Store" : host === "play.google.com" ? "Kavor đã có trên Google Play" : "Đã có ứng dụng Kavor";
    sub = "Cài app rồi đăng nhập lại; HR sẽ duyệt máy mới để chấm công.";
    store = link;
  } else if (!standalone) {
    id = "install";
    title = ios ? "Cài Kavor ra Màn hình chính: mở bằng Safari → nút Chia sẻ → Thêm vào MH chính" : "Cài Kavor: menu ⋮ của Chrome → Thêm vào Màn hình chính";
    sub = "";
  } else return;
  try { if (localStorage.getItem(KEY) === id) return; } catch {}
  show(id, title, sub, store);
}

if (document.readyState === "complete") void run();
else window.addEventListener("load", () => { void run(); });

export {};
