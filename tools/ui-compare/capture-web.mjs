// Chụp web HR/Admin (http://localhost:3000) và `Kavor HR Admin Prototype.html` cùng kích thước 1440×900 rồi ghép cạnh nhau.
// Cần: API + Supabase local (pnpm dev:backend), web (pnpm dev:admin), tài khoản HR đã kích hoạt.
// Chạy: KAVOR_WEB_ID=HD0007 KAVOR_WEB_PW=... node tools/ui-compare/capture-web.mjs [trạng thái ...]
// Ảnh gốc ghi vào $RAW (mặc định thư mục tạm); ảnh ghép (để so sánh, được commit) ở docs/ui-comparison/web/.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/ui-comparison/web");
const RAW = process.env.RAW ?? mkdtempSync(join(tmpdir(), "kavor-web-shots-"));
const PROTO = pathToFileURL(join(ROOT, "Kavor HR Admin Prototype.html")).href;
const WEB = process.env.WEB ?? "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.KAVOR_WEB_ID || !process.env.KAVOR_WEB_PW) { console.error("Thiếu KAVOR_WEB_ID / KAVOR_WEB_PW"); process.exit(1); }

/* Trạng thái: [tên, thao tác trên prototype (JS, null = không có trong prototype), đường dẫn web, thao tác trên web] */
const ONLY = process.argv.slice(2);
const STATES = [
  ["dashboard", `showPage('dashboard')`, "/", null],
  ["employees", `showPage('employees')`, "/employees", null],
  ["employee-drawer", `showPage('employees'); openEmployee('ha')`, "/employees?id=60000000-0000-4000-8000-000000000142", null],
  ["employee-add", `showPage('employees'); openModal('addEmployee')`, "/employees", `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Thêm nhân viên')).click()`],
  ["attendance", `showPage('attendance')`, "/attendance", null],
  ["attendance-rejected", null, "/attendance?tab=rejected", null],
  ["attendance-devices", null, "/attendance?tab=devices", null],
  ["schedules", `showPage('schedules')`, "/schedules", null],
  ["schedules-locations", null, "/schedules?tab=locations", null],
  ["schedules-assignments", null, "/schedules?tab=assignments", null],
];

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "kavor-cdp-"))}`, "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
process.on("exit", () => chrome.kill());
let targets;
for (let i = 0; i < 50 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => null); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text);
  return res.result?.result?.value;
};
const shot = async (file) => { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(s.result.data, "base64")); };

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
mkdirSync(OUT, { recursive: true }); mkdirSync(RAW, { recursive: true });

/* Đăng nhập web một lần (cookie httpOnly do server Next đặt) */
await send("Page.navigate", { url: `${WEB}/login` });
await sleep(2500);
const login = await evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:${JSON.stringify(process.env.KAVOR_WEB_ID)},password:${JSON.stringify(process.env.KAVOR_WEB_PW)}})}).then(r=>r.status)`);
if (login !== 200) { console.error("Đăng nhập web thất bại:", login); process.exit(1); }

for (const [name, proto, path, webAct] of STATES.filter(([n]) => !ONLY.length || ONLY.includes(n))) {
  if (proto) {
    await send("Page.navigate", { url: PROTO });
    await sleep(900);
    // Web chạy toàn trang: bỏ khung trình duyệt giả và bo góc của prototype để so đúng vùng app
    await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.browser-bar{display:none!important}.prototype-stage{width:100%!important;margin:0!important}.app-shell{min-height:100vh!important;height:100vh!important;max-height:none!important;border-radius:0!important;border:0!important;box-shadow:none!important}';document.head.appendChild(s);})()`);
    await evaluate(proto);
    await sleep(700);
    await shot(join(RAW, `${name}.prototype.png`));
  }
  await send("Page.navigate", { url: `${WEB}${path}` });
  await sleep(3500);
  if (webAct) { await evaluate(webAct); await sleep(800); }
  await shot(join(RAW, `${name}.web.png`));
  // Ghép: trái prototype (hoặc ô trống "thiết kế bổ sung"), phải web
  execFileSync("python3", ["-I", join(ROOT, "tools/ui-compare/pair-web.py"), RAW, name, OUT], { stdio: "inherit" });
  console.log("captured", name);
}
ws.close();
chrome.kill();
process.exit(0);
