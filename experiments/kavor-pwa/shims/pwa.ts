/* Phần PWA chạy trước app: khung điện thoại trên máy tính, chặn zoom/kéo trang của trình duyệt, đăng ký service worker. */
import * as RNW from "react-native-web";
import { webAlert } from "./alert";
import "./install-banner";

/* Đặt Platform.OS = "ios", Alert kiểu iOS, Linking.openURL/openSettings trực tiếp trên singleton react-native-web TRƯỚC khi
   App được require() ở index.ts (vì createExpoAutolinkingResolver của @expo/cli ghim cứng react-native → react-native-web) */
const RP = RNW.Platform as unknown as Record<string, unknown>;
RP.OS = "ios";
RP.select = <T,>(o: { ios?: T; native?: T; default?: T; web?: T }) => ("ios" in o ? o.ios : "native" in o ? o.native : o.default);

(RNW.Alert as unknown as { alert: typeof webAlert; prompt: typeof webAlert }).alert = webAlert;
(RNW.Alert as unknown as { alert: typeof webAlert; prompt: typeof webAlert }).prompt = webAlert;

const RL = RNW.Linking as unknown as Record<string, unknown>;
RL.getInitialURL = async () => {
  const p = window.location.pathname.replace(/^\/+/, "");
  if (!p) return null;
  window.history.replaceState(null, "", "/");
  return `kavor://${p}`;
};
RL.openURL = async (url: string) => {
  if (!/^(https?:|\/)/i.test(url)) { window.location.href = url; return; }
  const w = window.open(url, "_blank");
  if (w) { w.opener = null; return; }
  webAlert("Tệp đã sẵn sàng", "Liên kết chỉ dùng được trong 5 phút.", [{ text: "Hủy", style: "cancel" }, { text: "Mở", onPress: () => { window.open(url, "_blank", "noopener"); } }]);
};
RL.openSettings = async () => {
  webAlert("Mở Cài đặt", "Trình duyệt không mở được Cài đặt hộ app. Bật quyền trong Cài đặt của trình duyệt (Safari: Cài đặt → Safari → Vị trí / Camera).", [{ text: "Đã hiểu" }]);
};

const CSS = `
html,body{overscroll-behavior:none;-webkit-text-size-adjust:100%}
#root{max-width:440px;margin:0 auto;overflow:hidden;background:#fff;
  -webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
#root input,#root textarea{-webkit-user-select:text;user-select:text}
@media (min-width:600px){
  html,body{background:radial-gradient(circle at 20% 10%,#12976F 0%,#065F46 55%,#033D2D 100%) fixed}
  #root{position:relative;inset:auto;top:max(0px,calc((100% - 920px)/2));height:min(100%,920px);border-radius:44px;box-shadow:0 40px 80px -30px rgba(0,0,0,.6),0 0 0 10px #0B1F18}
}
`;

const style = document.createElement("style");
style.textContent = CSS;
document.head.appendChild(style);

/* iOS Safari: chặn phóng to bằng hai ngón và chạm đúp (app native không zoom) */
for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
let lastTouch = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !(e.target as HTMLElement).closest("input,textarea")) e.preventDefault();
  lastTouch = now;
}, { passive: false });

declare const process: { env: Record<string, string | undefined> };
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((reg) => reg.update()).catch(() => {});
  });
}

export {};
