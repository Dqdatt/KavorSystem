/* Bản web của apps/mobile/src/imgcache.ts: ảnh đại diện/ảnh bìa cần token nên tải bằng fetch có header rồi giữ trong Cache Storage
   (theo phiên bản), trả object URL để <Image> hiển thị. cachedImage() đọc đồng bộ từ bộ nhớ của lần chạy hiện tại. */
export type ImgKind = "avatar" | "cover";
const CACHE = "kavor-img";
const mem = new Map<string, string>();
const k = (kind: ImgKind, ver: string) => `${kind}-${ver.replace(/[^\w.-]/g, "_")}`;
const reqUrl = (key: string) => `/__kavor-img/${key}.jpg`;

export function cachedImage(kind: ImgKind, ver: string | null | undefined): string | null {
  if (!ver) return null;
  return mem.get(k(kind, ver)) ?? null;
}

/* Lần mở sau: nạp lại các ảnh đã lưu vào bộ nhớ (để cachedImage trả ngay) */
export async function warmImages() {
  try {
    const c = await caches.open(CACHE);
    for (const r of await c.keys()) {
      const key = new URL(r.url).pathname.replace(/^\/__kavor-img\//, "").replace(/\.jpg$/, "");
      const res = await c.match(r);
      if (res) mem.set(key, URL.createObjectURL(await res.blob()));
    }
  } catch { /* trình duyệt không có Cache Storage (http thường) */ }
}

const inflight = new Map<string, Promise<string | null>>();
export function storeImage(kind: ImgKind, ver: string, src: { uri: string; headers: Record<string, string> }): Promise<string | null> {
  const hit = cachedImage(kind, ver);
  if (hit) return Promise.resolve(hit);
  const key = k(kind, ver);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const res = await fetch(src.uri, { headers: src.headers });
      if (!res.ok) return null;
      const blob = await res.blob();
      for (const [old, url] of mem) if (old.startsWith(`${kind}-`) && old !== key) { URL.revokeObjectURL(url); mem.delete(old); }
      const url = URL.createObjectURL(blob);
      mem.set(key, url);
      try {
        const c = await caches.open(CACHE);
        for (const r of await c.keys()) if (new URL(r.url).pathname.startsWith(`/__kavor-img/${kind}-`)) await c.delete(r);
        await c.put(reqUrl(key), new Response(blob, { headers: { "content-type": blob.type || "image/jpeg" } }));
      } catch { /* chỉ giữ trong bộ nhớ */ }
      return url;
    } catch { return null; } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

export function clearImages(kind: ImgKind) {
  for (const [key, url] of mem) if (key.startsWith(`${kind}-`)) { URL.revokeObjectURL(url); mem.delete(key); }
  void caches?.open(CACHE).then(async (c) => { for (const r of await c.keys()) if (new URL(r.url).pathname.startsWith(`/__kavor-img/${kind}-`)) await c.delete(r); }).catch(() => {});
}
