/* Máy chủ nhỏ cho bản PWA đã build (dist/): phục vụ file tĩnh + chuyển /api/v1/* sang Kavor API (tránh CORS — API chỉ cho
   localhost:3000/3001). Không phụ thuộc gói ngoài.
   PORT (mặc định 8090), API_TARGET (mặc định http://127.0.0.1:4000), HTTPS=1 dùng .cert/key.pem + .cert/cert.pem
   (tạo bằng tools/make-cert.sh — cần HTTPS để iPhone trong mạng LAN có GPS, Face ID, service worker). */
import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import { readFileSync, statSync, createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { forward } from "../api/proxy.mjs";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(HERE, "dist");
const PORT = Number(process.env.PORT ?? 8090);
const useHttps = process.env.HTTPS === "1";
const TARGET = new URL(process.env.API_TARGET ?? "http://127.0.0.1:4000");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff2": "font/woff2", ".map": "application/json" };

if (!existsSync(join(DIST, "index.html"))) { console.error("Chưa có dist/ — chạy: npm run build"); process.exit(1); }

/* Cùng proxy với bản Vercel (api/proxy.mjs): refresh token nằm trong cookie HttpOnly */
async function proxy(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`${useHttps ? "https" : "http"}://${req.headers.host}${req.url}`, {
    method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  const r = await forward(request, { api: `${TARGET.origin}/api/v1` });
  const out = Object.fromEntries(r.headers);
  const cookies = r.headers.getSetCookie();
  if (cookies.length) out["set-cookie"] = cookies;
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}

function serveFile(req, res) {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  let st = existsSync(file) ? statSync(file) : null;
  if (!st || st.isDirectory()) { file = join(DIST, "index.html"); st = statSync(file); } // SPA: mọi đường dẫn về app
  const ext = extname(file);
  const immutable = file.includes(`${join("_expo", "static")}`) || file.includes(join("assets", ""));
  res.writeHead(200, {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "content-length": st.size,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
    ...(ext === ".js" && path === "/sw.js" ? { "service-worker-allowed": "/" } : {}),
  });
  createReadStream(file).pipe(res);
}

const handler = (req, res) => {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.socket.remoteAddress} ${req.method} ${req.url}`);
  return req.url.startsWith("/api/v1/") ? proxy(req, res) : serveFile(req, res);
};
const server = useHttps
  ? https({ key: readFileSync(join(HERE, ".cert/key.pem")), cert: readFileSync(join(HERE, ".cert/cert.pem")) }, handler)
  : http(handler);
server.listen(PORT, "0.0.0.0", () => console.log(`Kavor PWA: ${useHttps ? "https" : "http"}://localhost:${PORT}  (API → ${TARGET.origin})`));
