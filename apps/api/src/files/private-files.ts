/* File riêng tư trên Supabase Storage (đính kèm bản tin, tài liệu nhân sự): bucket riêng, thư mục theo tenant; chỉ API đọc/ghi
   (như logo/ảnh bìa — iPhone trong LAN không tới được Storage local, và không lộ đường dẫn tenant khác).
   Chưa có dịch vụ quét virus: chỉ nhận PDF/PNG/JPEG/WebP, nhận dạng theo byte đầu file, không tin content-type client gửi. */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseGateway } from "../auth/supabase.js";
import { sniffImage } from "../company/branding.js";

export type FileType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<FileType, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const FILE_MAX_BYTES = 5 * 1024 * 1024;

export function sniffFile(b: Buffer): FileType | null {
  if (b.length > 5 && b.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return sniffImage(b);
}
export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
/* Tên file hiển thị: bỏ ký tự đường dẫn/xuống dòng */
export const safeName = (name: string) => name.replace(/[\\/\r\n\t]/g, "_");

/* Liên kết tải ngắn hạn để app mở file bằng trình duyệt hệ thống (không gửi được header Authorization). Chữ ký gắn loại tài nguyên +
   id + nhân viên. Khóa ngẫu nhiên theo tiến trình: API khởi động lại thì liên kết cũ hết hiệu lực — chấp nhận vì liên kết chỉ sống 5 phút. */
export type LinkKind = "announcement" | "document";
const KEY = randomBytes(32);
export const LINK_TTL_SECONDS = 300;
const sig = (kind: LinkKind, id: string, employeeId: string, exp: number) => createHmac("sha256", KEY).update(`${kind}.${id}.${employeeId}.${exp}`).digest("base64url");
export function signLink(kind: LinkKind, id: string, employeeId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  return { exp, sig: sig(kind, id, employeeId, exp) };
}
export function checkLink(kind: LinkKind, id: string, employeeId: string, exp: number, s: string, now = Date.now()) {
  if (!Number.isInteger(exp) || exp < now / 1000 || exp > now / 1000 + LINK_TTL_SECONDS) return false;
  const want = Buffer.from(sig(kind, id, employeeId, exp)), got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}

export class PrivateFiles {
  private ready: Promise<void> | null = null;
  constructor(private readonly sb: SupabaseGateway, private readonly bucket: string) {}

  /* Tạo bucket lần đầu (Storage có thể chưa chạy lúc migrate nên không tạo trong migration) */
  private ensureBucket() {
    this.ready ??= (async () => {
      const { error } = await this.sb.admin.storage.createBucket(this.bucket, { public: false, fileSizeLimit: FILE_MAX_BYTES, allowedMimeTypes: Object.keys(EXT) });
      if (error && !/exist/i.test(error.message)) { this.ready = null; throw error; }
    })();
    return this.ready;
  }

  /* prefix: thư mục con trong tenant (ví dụ id bài viết / id nhân viên) */
  async put(tenantId: string, prefix: string, data: Buffer, type: FileType): Promise<string> {
    const path = `${tenantId}/${prefix}-${randomUUID()}.${EXT[type]}`;
    const upload = async () => {
      await this.ensureBucket();
      return (await this.sb.admin.storage.from(this.bucket).upload(path, data, { contentType: type, upsert: false })).error;
    };
    let error = await upload();
    /* Bucket bị xóa sau khi API đã tạo (ví dụ DB local vừa reset): tạo lại một lần */
    if (error && /bucket not found/i.test(error.message)) { this.ready = null; error = await upload(); }
    if (error) throw error;
    return path;
  }

  async get(path: string): Promise<Buffer | null> {
    const { data, error } = await this.sb.admin.storage.from(this.bucket).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(path: string) {
    await this.sb.admin.storage.from(this.bucket).remove([path]);
  }
}
