// Chụp từng trạng thái của `Kavor HRM Prototype.html` bằng Chrome headless (CDP).
// Chạy: node tools/ui-compare/capture-prototype.mjs [state ...]
// Ảnh 2x được lưu vào docs/ui-comparison/prototype/<state>.png (pair.py tự thu về 390×844).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STATES } from "./states.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/ui-comparison/prototype");
const PAGE = pathToFileURL(join(ROOT, "Kavor HRM Prototype.html")).href;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "kavor-cdp-"))}`, "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
process.on("exit", () => chrome.kill());

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(200);
  targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text);
  return res.result?.result?.value;
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1000, deviceScaleFactor: 2, mobile: false });
mkdirSync(OUT, { recursive: true });

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(STATES);
for (const name of names) {
  await send("Page.navigate", { url: PAGE });
  await sleep(900);
  await evaluate(`document.fonts.ready.then(()=>1)`);
  // Khung chụp phẳng: bỏ bo góc/viền máy và dynamic island để so với ảnh iPhone 11.
  await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.device{border-radius:0!important;box-shadow:none!important}.island{display:none!important}';document.head.appendChild(s);window.sleep=ms=>new Promise(r=>setTimeout(r,ms));})()`);
  await evaluate(`(async()=>{ ${STATES[name]} })()`);
  await sleep(1500);
  // Carousel bản tin: căn thẻ đang chọn vào giữa (scroll-snap của Chrome headless đôi khi lệch một thẻ).
  await evaluate(`(()=>{const nc=document.querySelector('#app .screen:not(.leaving) #nc'); if(!nc) return; const c=nc.children[S.ncIdx||0]; nc.style.scrollSnapType='none'; nc.scrollLeft=c.offsetLeft+c.offsetWidth/2-nc.clientWidth/2; nc.dispatchEvent(new Event('scroll'));})()`);
  await sleep(500);
  const box = await evaluate(`(()=>{const r=document.querySelector('#device').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 1 } });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.result.data, "base64"));
  console.log("captured", name);
}
ws.close();
chrome.kill();
process.exit(0);
