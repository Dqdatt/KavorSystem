/* Trạm gửi thư cho Kavor API: Render Free chặn cổng SMTP nên API gửi nội dung thư (đã dựng sẵn) tới đây bằng HTTPS, web gửi qua
   SMTP (Vercel mở cổng 465/587). Chỉ API biết MAIL_RELAY_SECRET; thiếu biến môi trường thì coi như không có đường dẫn này (404).
   Không có phiên người dùng — proxy.ts bỏ qua /api/internal. */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const json = (status: number, code: string | null, message?: string) =>
  NextResponse.json({ data: code ? null : { sent: true }, meta: { correlationId: "web" }, error: code ? { code, message, retryable: status >= 500 } : null }, { status });

/* So khớp hằng thời gian trên bản băm (độ dài bằng nhau) */
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const text = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export async function POST(req: Request) {
  const secret = process.env.MAIL_RELAY_SECRET, smtpUrl = process.env.SMTP_URL, from = process.env.MAIL_FROM;
  if (!secret || secret.length < 32 || !smtpUrl || !from) return json(404, "NOT_FOUND", "Không tìm thấy.");
  const auth = req.headers.get("authorization") ?? "";
  if (!same(auth, `Bearer ${secret}`)) return json(401, "UNAUTHORIZED", "Sai khóa trạm gửi thư.");

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const to = text(b?.to, 254), subject = text(b?.subject, 300), body = text(b?.text, 20_000), html = text(b?.html, 100_000);
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !subject || !body || !html) return json(400, "VALIDATION_ERROR", "Thiếu người nhận, tiêu đề hoặc nội dung.");

  try {
    /* Phải chờ gửi xong trước khi trả lời: Vercel tạm dừng hàm ngay khi đã có response */
    await nodemailer.createTransport(smtpUrl).sendMail({ from, to, subject, text: body, html });
  } catch {
    return json(502, "EMAIL_SEND_FAILED", "Máy chủ thư từ chối gửi.");
  }
  return json(200, null);
}
