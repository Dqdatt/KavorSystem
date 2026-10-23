/* Thư mời kích hoạt Kavor gửi tới email công ty của nhân viên. Dev: Mailpit (SMTP_URL=smtp://127.0.0.1:55325).
   Chưa cấu hình SMTP thì báo lỗi rõ ràng thay vì giả vờ đã gửi. */
import nodemailer, { type Transporter } from "nodemailer";
import { ADMIN_ERRORS } from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";

export type InviteMail = { to: string; fullName: string; employeeCode: string; companyName: string; invitedBy: string };

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function inviteContent(m: InviteMail) {
  const subject = `${m.companyName} mời bạn dùng Kavor`;
  const text = [
    `Chào ${m.fullName},`,
    ``,
    `${m.invitedBy} (${m.companyName}) đã tạo tài khoản Kavor cho bạn.`,
    `1. Cài ứng dụng Kavor trên điện thoại.`,
    `2. Chọn "Kích hoạt tài khoản", nhập mã nhân viên ${m.employeeCode} và email ${m.to}.`,
    `3. Nhập mã OTP gửi về email này rồi đặt mật khẩu.`,
    ``,
    `Nếu bạn không làm việc tại ${m.companyName}, hãy bỏ qua thư này.`,
  ].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;color:#14231c">
<h2 style="color:#065f46;margin:0 0 12px">Chào ${escape(m.fullName)},</h2>
<p>${escape(m.invitedBy)} (${escape(m.companyName)}) đã tạo tài khoản Kavor cho bạn.</p>
<ol style="line-height:1.7"><li>Cài ứng dụng <b>Kavor</b> trên điện thoại.</li>
<li>Chọn <b>Kích hoạt tài khoản</b>, nhập mã nhân viên <b style="font-family:monospace">${escape(m.employeeCode)}</b> và email <b>${escape(m.to)}</b>.</li>
<li>Nhập mã OTP gửi về email này rồi đặt mật khẩu.</li></ol>
<p style="color:#5b6b63;font-size:13px">Nếu bạn không làm việc tại ${escape(m.companyName)}, hãy bỏ qua thư này.</p></div>`;
  return { subject, text, html };
}

export class Mailer {
  private transport: Transporter | null;
  constructor(private readonly config: { smtpUrl: string; from: string } | null) {
    this.transport = config ? nodemailer.createTransport(config.smtpUrl) : null;
  }

  async sendInvite(m: InviteMail) {
    if (!this.transport || !this.config) throw new AuthError(ADMIN_ERRORS.emailNotConfigured, "Máy chủ chưa cấu hình gửi email (SMTP_URL). Chưa gửi được lời mời.", 503, true);
    try {
      await this.transport.sendMail({ from: this.config.from, to: m.to, ...inviteContent(m) });
    } catch {
      throw new AuthError("EMAIL_SEND_FAILED", "Chưa gửi được email mời. Vui lòng thử lại.", 502, true);
    }
  }
}
