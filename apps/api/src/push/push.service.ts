/* Web Push cho PWA nhân viên (migration 202612130001). Trình duyệt đăng ký endpoint của máy chủ push (Apple/Google/Mozilla/Microsoft)
   cho nhân viên đang đăng nhập. Thông báo trong app được trigger SQL đưa vào hàng đợi; API rút hàng đợi mỗi 5 giây rồi gửi
   (thư viện web-push: ký VAPID + mã hóa đầu-cuối theo RFC 8291, máy chủ push không đọc được nội dung). */
import webpush from "web-push";
import type { NotificationKind, PushSubscriptionInput } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import type { EmployeeRow } from "../auth/auth.service.js";
import { invalid } from "../admin/context.js";
import type { Body } from "../admin/validate.js";

export type WebPushConfig = { publicKey: string; privateKey: string; subject: string };
type Claim = { notification_id: string; endpoint: string; p256dh: string; auth: string; kind: string; title: string; body: string; link_type: string | null; link_id: string | null; link_no: string | null };
type Send = (sub: PushSubscriptionInput, payload: string) => Promise<unknown>;

/* 5 giây: hàng đợi rỗng thì push_claim chỉ là một truy vấn chỉ mục, đổi lại push tới máy nhanh */
const DRAIN_MS = 5_000;
const BATCH = 500;
const PARALLEL = 20;
/* Endpoint do trình duyệt gửi lên rồi API gọi tới: chỉ nhận máy chủ push thật, không cho trỏ vào mạng nội bộ/dịch vụ khác (SSRF) */
const PUSH_HOSTS = [/^([a-z0-9-]+\.)*push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
const B64URL = /^[A-Za-z0-9_-]+$/;

/* Kiểm và chuẩn hóa PushSubscription.toJSON() của trình duyệt; sai thì báo 400 */
export function parseSubscription(b: Body): PushSubscriptionInput {
  const endpoint = typeof b?.endpoint === "string" ? b.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 1000) throw invalid("Đăng ký thông báo không hợp lệ.");
  let u: URL;
  try { u = new URL(endpoint); } catch { throw invalid("Đăng ký thông báo không hợp lệ."); }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !PUSH_HOSTS.some((h) => h.test(u.hostname))) throw invalid("Máy chủ thông báo của trình duyệt không được hỗ trợ.");
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const key = (v: unknown, bytes: number) => {
    const s = typeof v === "string" ? v.trim().replace(/=+$/, "") : "";
    if (!B64URL.test(s) || Buffer.from(s, "base64url").length !== bytes) throw invalid("Khóa đăng ký thông báo không hợp lệ.");
    return s;
  };
  const p256dh = key(keys.p256dh, 65);
  if (Buffer.from(p256dh, "base64url")[0] !== 0x04) throw invalid("Khóa đăng ký thông báo không hợp lệ."); // điểm P-256 dạng chưa nén
  /* Giữ nguyên chuỗi trình duyệt gửi (không chuẩn hóa) để lúc hủy đăng ký so khớp được */
  return { endpoint, keys: { p256dh, auth: key(keys.auth, 16) } };
}

export class PushService {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly send: Send | null;

  constructor(private readonly sb: SupabaseGateway, cfg: WebPushConfig | null, send?: Send) {
    this.send = send ?? (cfg ? (sub, payload) => webpush.sendNotification(sub, payload, { vapidDetails: cfg, TTL: 12 * 3600, timeout: 10_000, urgency: "high" }) : null);
  }

  get enabled() { return !!this.send; }

  async subscribe(emp: EmployeeRow, b: Body): Promise<{ enabled: boolean }> {
    if (!this.enabled) return { enabled: false };
    const s = parseSubscription(b);
    const { error } = await this.sb.admin.rpc("push_subscribe", { p_tenant: emp.tenant_id, p_employee: emp.id, p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth });
    if (error) throw error;
    return { enabled: true };
  }

  /* Đăng xuất / tắt thông báo trên trình duyệt này: chỉ xóa endpoint của chính người gọi */
  async unsubscribe(emp: EmployeeRow, b: Body): Promise<{ enabled: boolean }> {
    const endpoint = typeof b?.endpoint === "string" ? b.endpoint.trim() : "";
    if (!endpoint || endpoint.length > 1000) throw invalid("Đăng ký thông báo không hợp lệ.");
    const { error } = await this.sb.admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("employee_id", emp.id);
    if (error) throw error;
    return { enabled: this.enabled };
  }

  /* Gửi một lượt hàng đợi; trả số push gửi thành công. Không chạy chồng lượt. */
  async drain(): Promise<number> {
    if (!this.send || this.busy) return 0;
    this.busy = true;
    try {
      const { data, error } = await this.sb.admin.rpc("push_claim", { p_limit: BATCH });
      if (error) throw error;
      const rows = (data ?? []) as Claim[];
      let ok = 0;
      for (let i = 0; i < rows.length; i += PARALLEL) {
        const res = await Promise.allSettled(rows.slice(i, i + PARALLEL).map((r) => this.send!({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload(r))));
        for (const [j, x] of res.entries()) {
          if (x.status === "fulfilled") { ok++; continue; }
          const r = rows[i + j]!;
          const status = (x.reason as { statusCode?: number })?.statusCode;
          /* 404/410: trình duyệt đã hủy đăng ký (gỡ app, thu hồi quyền, đăng xuất) → xóa. Không ghi endpoint vào log: nó là khóa gửi push. */
          if (status === 404 || status === 410) await this.sb.admin.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          else console.error(`[push] gửi lỗi ${status ?? (x.reason as Error)?.message ?? "?"} tới ${new URL(r.endpoint).hostname}`);
        }
      }
      return ok;
    } finally {
      this.busy = false;
    }
  }

  startDrain() {
    if (this.timer || !this.send) return;
    const run = () => { void this.drain().catch((e: unknown) => console.error("[push]", (e as Error)?.message ?? e)); };
    this.timer = setInterval(run, DRAIN_MS);
    this.timer.unref();
  }
}

/* Icon chỉ có trong push màn hình khóa; app mobile có icon riêng (NOTIF_ICON ở apps/mobile/src/screens/profile.tsx) */
const PUSH_ICON: Partial<Record<NotificationKind, string>> = {
  "approval.pending": "📝", "approval.due": "⏰", "request.approved": "✅", "request.rejected": "❌",
  "device.approved": "📱", "device.rejected": "📱", "advance.paid": "💵", "payslip.published": "💰",
  "announcement.published": "📢", "reminder.announcement": "📢", "attendance.adjusted": "🕘",
  "reminder.attendance": "⏰", "reminder.documents": "📄",
};

/* Nội dung push: service worker của PWA hiện tiêu đề/nội dung, bấm vào mở đúng đơn/bản tin (data.link) */
function payload(r: Claim): string {
  const icon = !r.title.startsWith("❗") ? PUSH_ICON[r.kind as NotificationKind] : undefined;
  const title = icon ? `${icon} ${r.title}` : r.title;
  return JSON.stringify({
    title, body: r.body, tag: r.notification_id,
    data: { id: r.notification_id, kind: r.kind, link: r.link_type && r.link_id ? { type: r.link_type, id: r.link_id, no: r.link_no } : null },
  });
}
