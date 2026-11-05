/* Ảnh đại diện/ảnh bìa lưu trên máy theo phiên bản: mở app hiện ngay từ file, chỉ tải lại khi phiên bản đổi.
   Ảnh cần token nên không dựa vào cache của <Image> (header Authorization làm cache không ổn định). */
import { Directory, File, Paths } from "expo-file-system";

export type ImgKind = "avatar" | "cover";
const dir = () => new Directory(Paths.document, "kavor-img");
const file = (kind: ImgKind, ver: string) => new File(dir(), `${kind}-${ver.replace(/[^\w.-]/g, "_")}.jpg`);

/* Đã có trên máy thì trả uri file (đọc đồng bộ, không gọi mạng) */
export function cachedImage(kind: ImgKind, ver: string | null | undefined): string | null {
  if (!ver) return null;
  try { const f = file(kind, ver); return f.exists ? f.uri : null; } catch { return null; }
}

/* Tải về (một lần cho mỗi phiên bản) rồi xóa các phiên bản cũ cùng loại */
const inflight = new Map<string, Promise<string | null>>();
export function storeImage(kind: ImgKind, ver: string, src: { uri: string; headers: Record<string, string> }): Promise<string | null> {
  const hit = cachedImage(kind, ver);
  if (hit) return Promise.resolve(hit);
  const key = `${kind}:${ver}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const d = dir();
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
      const f = file(kind, ver);
      const out = await File.downloadFileAsync(src.uri, f, { headers: src.headers, idempotent: true });
      for (const x of d.list()) if (x instanceof File && x.name.startsWith(`${kind}-`) && x.uri !== out.uri) { try { x.delete(); } catch { /* bỏ qua */ } }
      return out.uri;
    } catch { return null; } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/* Đăng xuất: xóa ảnh đại diện của người dùng trước (ảnh bìa là của công ty, giữ lại cho màn đăng nhập) */
export function clearImages(kind: ImgKind) {
  try { const d = dir(); if (d.exists) for (const x of d.list()) if (x instanceof File && x.name.startsWith(`${kind}-`)) x.delete(); } catch { /* bỏ qua */ }
}
