/* Bản web của apps/mobile/src/attach.ts (cùng export). Trình duyệt chỉ mở hộp chọn file trong chính thao tác bấm của người dùng,
   nên nút trong hộp thoại nguồn mở <input type=file> ngay lúc bấm; pickFile/pickAvatar chỉ chờ kết quả đó. */
import { webAlert } from "./alert";

export type PickedFile = { name: string; size: number; base64: string };
/* Hàm proxy Vercel nhận body tối đa 4,5 MB; file gửi dạng base64 (+33%) nên PWA chỉ nhận 3 MB (app native 5 MB).
   shortcut: tệp 3–5 MB không gửi được qua PWA; khi cần thì tải thẳng lên Storage bằng link ký sẵn. */
export const PICK_MAX_BYTES = 3 * 1024 * 1024;
type Source = "camera" | "library" | "pdf";

let pending: Promise<File | null> | null = null;

function openInput(accept: string, capture?: "user" | "environment"): Promise<File | null> {
  return new Promise((done) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) input.setAttribute("capture", capture);
    input.style.display = "none";
    let settled = false;
    const finish = (f: File | null) => { if (settled) return; settled = true; input.remove(); done(f); };
    input.onchange = () => finish(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

const ACCEPT: Record<Source, [string, ("user" | "environment")?]> = {
  camera: ["image/*", "environment"],
  library: ["image/*"],
  pdf: ["application/pdf"],
};

export function chooseSource(): Promise<Source | null> {
  return new Promise((done) => {
    const pick = (s: Source) => () => { pending = openInput(...ACCEPT[s]); done(s); };
    webAlert("Thêm minh chứng", "Ảnh hoặc PDF, tối đa 3 MB", [
      { text: "Chụp ảnh", onPress: pick("camera") },
      { text: "Chọn ảnh", onPress: pick("library") },
      { text: "Chọn tệp PDF", onPress: pick("pdf") },
      { text: "Hủy", style: "cancel", onPress: () => done(null) },
    ], { cancelable: true, onDismiss: () => done(null) });
  });
}

const toBase64 = (b: Blob) => new Promise<string>((ok, fail) => {
  const fr = new FileReader();
  fr.onerror = () => fail(new Error("Không đọc được tệp."));
  fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ""));
  fr.readAsDataURL(b);
});

async function loadImage(f: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("Không đọc được ảnh. Chọn ảnh JPEG/PNG khác.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/* Ảnh → JPEG, cạnh dài tối đa maxSide (iPhone chụp HEIC/ảnh lớn — máy chủ chỉ nhận PDF/PNG/JPEG/WebP) */
async function toJpeg(f: Blob, maxSide: number, quality: number, square = false): Promise<Blob> {
  const img = await loadImage(f);
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const side = Math.min(sw, sh);
  const [sx, sy, cw, ch] = square ? [(sw - side) / 2, (sh - side) / 2, side, side] : [0, 0, sw, sh];
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cw * k);
  canvas.height = Math.round(ch * k);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Trình duyệt không xử lý được ảnh.");
  g.drawImage(img, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Không nén được ảnh."))), "image/jpeg", quality));
}

export type AvatarPick = { base64: string } | "remove" | null;
export async function pickAvatar(hasAvatar: boolean): Promise<AvatarPick> {
  const src = await new Promise<"pick" | "remove" | null>((done) => {
    const pick = (capture?: "user") => () => { pending = openInput("image/*", capture); done("pick"); };
    const btns: Array<{ text: string; style?: "cancel" | "destructive"; onPress: () => void }> = [
      { text: "Chụp ảnh", onPress: pick("user") },
      { text: "Chọn ảnh", onPress: pick() },
    ];
    if (hasAvatar) btns.push({ text: "Gỡ ảnh đại diện", style: "destructive", onPress: () => done("remove") });
    btns.push({ text: "Hủy", style: "cancel", onPress: () => done(null) });
    webAlert("Ảnh đại diện", "Ảnh được cắt vuông ở giữa", btns, { cancelable: true, onDismiss: () => done(null) });
  });
  if (src !== "pick") return src;
  const f = await (pending ?? Promise.resolve(null));
  pending = null;
  if (!f) return null;
  const jpeg = await toJpeg(f, 800, 0.8, true);
  if (jpeg.size > 2 * 1024 * 1024) throw new Error("Ảnh lớn hơn 2 MB. Cắt nhỏ hơn hoặc chọn ảnh khác.");
  return { base64: await toBase64(jpeg) };
}

/* null: người dùng hủy. Lỗi (quá dung lượng, không đọc được) ném Error có lời nhắn tiếng Việt */
export async function pickFile(source: Source): Promise<PickedFile | null> {
  const f = await (pending ?? Promise.resolve(null));
  pending = null;
  if (!f) return null;
  if (source === "pdf" || f.type === "application/pdf") {
    if (f.type && f.type !== "application/pdf") throw new Error("Chỉ nhận tệp PDF.");
    return checkSize({ name: f.name || "minh-chung.pdf", size: f.size, base64: await toBase64(f) });
  }
  const keep = /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 1.5 * 1024 * 1024;
  const blob = keep ? f : await toJpeg(f, 2048, 0.75);
  const name = keep ? f.name : (f.name || `anh-${Date.now()}`).replace(/\.\w+$/, "") + ".jpg";
  return checkSize({ name, size: blob.size, base64: await toBase64(blob) });
}

function checkSize(f: PickedFile) {
  if (f.size > PICK_MAX_BYTES) throw new Error("Tệp lớn hơn 3 MB. Chọn tệp nhỏ hơn.");
  return f;
}

export const sizeText = (n: number) => n >= 1024 * 1024 ? `${String(Math.round(n / 1024 / 102.4) / 10).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
