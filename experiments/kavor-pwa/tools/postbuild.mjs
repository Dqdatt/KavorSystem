/* Tạo dist/sw.js có danh sách vỏ app đã build để mở được khi mất mạng.
   Chỉ cache vỏ giao diện (HTML, bundle JS, font, icon); KHÔNG cache /api/* — dữ liệu offline và hàng đợi chấm công
   do chính store.ts/attendance.ts của app đảm nhiệm. */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(HERE, "dist");

function walk(dir, list = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, list);
    else if (name !== "sw.js" && name !== "metadata.json") list.push("/" + relative(DIST, full).replace(/\\/g, "/"));
  }
  return list;
}

/* Cài sẵn vỏ app (HTML, bundle JS, manifest, icon); font/ảnh khác cache khi app dùng tới lần đầu (không tải hết 18 font) */
const files = ["/", ...walk(DIST).filter((f) => f.startsWith("/_expo/") || /^\/[^/]+\.(png|ico|webmanifest)$/.test(f))].filter((f) => !f.endsWith(".map"));
const ver = `kavor-shell-${Date.now().toString(36)}`;

const sw = `/* Service worker ${ver} (sinh bởi tools/postbuild.mjs). Mỗi bản build một tên cache: bản mới xóa cache vỏ cũ.
   HTML: lấy mạng trước, mất mạng thì dùng bản đã lưu. File còn lại cùng origin: cache trước. Không đụng /api/* và cache ảnh kavor-img. */
const VER = ${JSON.stringify(ver)};
const FILES = ${JSON.stringify(files)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("kavor-shell-") && k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).catch(() => caches.match("/", { cacheName: VER }).then((m) => m || Response.error())));
    return;
  }
  e.respondWith(caches.open(VER).then((c) => c.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) void c.put(r, res.clone()); return res; }))));
});
self.addEventListener("notificationclick", (e) => {
  const n = e.notification;
  n.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const msg = { type: "kavor-notification-click", title: n.title, body: n.body, data: n.data };
      const win = list[0];
      if (win) { win.postMessage(msg); return win.focus(); }
      return self.clients.openWindow("/");
    }),
  );
});
`;

/* Xóa <meta name="theme-color"> trùng do expo export tự chèn thêm từ app.json (chỉ giữ thẻ #kv-theme của mình) */
const indexPath = join(DIST, "index.html");
const html = readFileSync(indexPath, "utf8").replace(/<meta name="theme-color" content="#065F46"\s*\/?>/g, "");
writeFileSync(indexPath, html);

writeFileSync(join(DIST, "sw.js"), sw);
console.log(`sw.js: ${files.length} file (${ver})`);
