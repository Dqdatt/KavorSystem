/* File đính kèm bản tin trên Supabase Storage: bucket riêng tư `announcement-files`, thư mục theo tenant; chỉ API đọc/ghi
   (như logo/ảnh bìa — iPhone trong LAN không tới được Storage local, và không lộ đường dẫn tenant khác).
   Chưa có dịch vụ quét virus: chỉ nhận PDF/PNG/JPEG/WebP, nhận dạng theo byte đầu file, không tin content-type client gửi. */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ANNOUNCEMENT_MAX_BYTES, type AnnouncementAttachment } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { sniffImage } from "../company/branding.js";

export const ANNOUNCEMENT_BUCKET = "announcement-files";
type FileType = AnnouncementAttachment["type"];
const EXT: Record<FileType, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function sniffFile(b: Buffer): FileType | null {
  if (b.length > 5 && b.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return sniffImage(b);
}

/* Liên kết tải ngắn hạn cho app mở file bằng trình duyệt hệ thống (không gửi được header Authorization).
   Khóa ngẫu nhiên theo tiến trình: API khởi động lại thì liên kết cũ hết hiệu lực — chấp nhận vì liên kết chỉ sống 5 phút. */
const KEY = randomBytes(32);
export const LINK_TTL_SECONDS = 300;
const sig = (id: string, employeeId: string, exp: number) => createHmac("sha256", KEY).update(`${id}.${employeeId}.${exp}`).digest("base64url");
export function signLink(id: string, employeeId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  return { exp, sig: sig(id, employeeId, exp) };
}
export function checkLink(id: string, employeeId: string, exp: number, s: string, now = Date.now()) {
  if (!Number.isInteger(exp) || exp < now / 1000 || exp > now / 1000 + LINK_TTL_SECONDS) return false;
  const want = Buffer.from(sig(id, employeeId, exp)), got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}

export class AnnouncementFiles {
  private ready: Promise<void> | null = null;
  constructor(private readonly sb: SupabaseGateway) {}

  /* Tạo bucket lần đầu (Storage có thể chưa chạy lúc migrate nên không tạo trong migration) */
  private ensureBucket() {
    this.ready ??= (async () => {
      const { error } = await this.sb.admin.storage.createBucket(ANNOUNCEMENT_BUCKET, { public: false, fileSizeLimit: ANNOUNCEMENT_MAX_BYTES, allowedMimeTypes: Object.keys(EXT) });
      if (error && !/exist/i.test(error.message)) { this.ready = null; throw error; }
    })();
    return this.ready;
  }

  async put(tenantId: string, announcementId: string, data: Buffer, type: FileType): Promise<string> {
    const path = `${tenantId}/${announcementId}-${randomUUID()}.${EXT[type]}`;
    const upload = async () => {
      await this.ensureBucket();
      return (await this.sb.admin.storage.from(ANNOUNCEMENT_BUCKET).upload(path, data, { contentType: type, upsert: false })).error;
    };
    let error = await upload();
    /* Bucket bị xóa sau khi API đã tạo (ví dụ DB local vừa reset): tạo lại một lần */
    if (error && /bucket not found/i.test(error.message)) { this.ready = null; error = await upload(); }
    if (error) throw error;
    return path;
  }

  async get(path: string): Promise<Buffer | null> {
    const { data, error } = await this.sb.admin.storage.from(ANNOUNCEMENT_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(path: string) {
    await this.sb.admin.storage.from(ANNOUNCEMENT_BUCKET).remove([path]);
  }
}
