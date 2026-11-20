/* Kiểm tra bản PWA đã build bằng Chrome headless ở kích thước iPhone 11 (390×844 @2x):
   bắt lỗi console/runtime, chụp màn hình và thử các thao tác chính (đăng nhập, đăng ký máy, 4 tab, menu +, chấm công, hồ sơ, thông báo). */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(HERE, "shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 18090;
const CDP = 19335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOTS, { recursive: true });
const srv = spawn(process.execPath, [join(HERE, "tools/serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "kavor-pwa-cdp-"))}`, "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill(); } catch {} try { srv.kill(); } catch {} };
process.on("exit", cleanup);

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(150);
  targets = await fetch(`http://127.0.0.1:${CDP}/json`).then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? "exception");
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
});
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text);
  return res.result?.result?.value;
};
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(s.result.data, "base64"));
  console.log("shot:", name);
};
const clickText = (txt) => evalJs(`(() => {
  const els = [...document.querySelectorAll('div,span,button')].filter(e => e.textContent?.trim() === ${JSON.stringify(txt)} && e.offsetParent !== null);
  const t = els[els.length - 1];
  t?.click();
  return !!t;
})()`);
const clickLabel = (lbl) => evalJs(`(() => {
  const el = document.querySelector(${JSON.stringify(`[aria-label="${lbl}"]`)});
  el?.click();
  return !!el;
})()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await sleep(2400);
await evalJs(`document.fonts.ready.then(()=>1)`);
await shot("01-login");

await clickText("Đăng nhập");
await sleep(800);
await shot("02-device");

await clickText("Đăng ký thiết bị này");
await sleep(3200);
await shot("03-home");

await clickLabel("Bảng công");
await sleep(700);
await shot("04-attendance");

await clickLabel("Đơn từ");
await sleep(700);
await shot("05-requests");

await clickLabel("Bản tin");
await sleep(700);
await shot("06-news");

await clickLabel("Trang chủ");
await sleep(700);
await clickLabel("Tạo nhanh");
await sleep(500);
await shot("07-quick-menu");

await clickText("Chấm công");
await sleep(700);
await shot("08-clock");

await clickLabel("Quay lại");
await sleep(500);
await clickLabel("Tạo nhanh");
await sleep(400);
await clickText("Phiếu lương");
await sleep(700);
await shot("09-payslips");

await clickLabel("Quay lại");
await sleep(500);
await clickText("TH");
await sleep(700);
await shot("10-profile");

if (errors.length) { console.error("CONSOLE/RUNTIME ERRORS:", errors); process.exit(1); }
console.log("ALL SMOKE CHECKS PASSED (0 console/runtime errors)");
cleanup();
process.exit(0);
