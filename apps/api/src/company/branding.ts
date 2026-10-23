/* Logo và ảnh bìa của công ty trên Supabase Storage. Bucket riêng tư `tenant-branding`, mỗi tenant một thư mục
   `<tenant_id>/`; chỉ API (service role) đọc/ghi, client lấy ảnh qua API nên không phụ thuộc địa chỉ Supabase
   (iPhone trong mạng LAN không tới được 127.0.0.1) và không lộ đường dẫn của tenant khác. */
import { randomUUID } from "node:crypto";
import type { BrandingKind } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";

export const BRANDING_BUCKET = "tenant-branding";
export const BRANDING_MAX_BYTES = 2 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export type ImageType = keyof typeof TYPES;

/* Nhận dạng ảnh theo byte đầu file, không tin content-type client gửi (SVG bị loại vì có thể chứa script) */
export function sniffImage(b: Buffer): ImageType | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/* Phiên bản ảnh = đoạn ngẫu nhiên trong tên file, đổi mỗi lần thay ảnh (client dùng làm khóa cache) */
export const brandingVersion = (path: string | null | undefined) => (path ? /-([0-9a-f]{8})[0-9a-f-]*\.\w+$/.exec(path)?.[1] ?? null : null);

export class BrandingStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly sb: SupabaseGateway) {}

  /* Tạo bucket lần đầu (Storage có thể chưa chạy lúc migrate nên không tạo trong migration) */
  private ensureBucket() {
    this.ready ??= (async () => {
      const { error } = await this.sb.admin.storage.createBucket(BRANDING_BUCKET, { public: false, fileSizeLimit: BRANDING_MAX_BYTES, allowedMimeTypes: Object.keys(TYPES) });
      if (error && !/exist/i.test(error.message)) { this.ready = null; throw error; }
    })();
    return this.ready;
  }

  async put(tenantId: string, kind: BrandingKind, data: Buffer, type: ImageType): Promise<string> {
    const path = `${tenantId}/${kind}-${randomUUID()}.${TYPES[type]}`;
    const upload = async () => {
      await this.ensureBucket();
      return (await this.sb.admin.storage.from(BRANDING_BUCKET).upload(path, data, { contentType: type, upsert: false })).error;
    };
    let error = await upload();
    /* Bucket bị xóa sau khi API đã tạo (ví dụ DB local vừa reset): tạo lại một lần */
    if (error && /bucket not found/i.test(error.message)) { this.ready = null; error = await upload(); }
    if (error) throw error;
    return path;
  }

  async get(path: string): Promise<{ data: Buffer; contentType: string } | null> {
    const { data, error } = await this.sb.admin.storage.from(BRANDING_BUCKET).download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return { data: buf, contentType: sniffImage(buf) ?? "application/octet-stream" };
  }

  async remove(path: string) {
    await this.sb.admin.storage.from(BRANDING_BUCKET).remove([path]);
  }
}
