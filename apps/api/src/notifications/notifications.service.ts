/* Thông báo trong app: đọc/đánh dấu đã đọc cho mobile (/me) và web HR (/admin). Thông báo được tạo bằng trigger SQL
   (migration 202610260001); riêng nhắc hạn duyệt cần chạy định kỳ nên API gọi notify_due_approvals() mỗi 10 phút. */
import type { AppNotification, NotificationFeed, NotificationKind } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { invalid } from "../admin/context.js";
import type { Body } from "../admin/validate.js";

type Row = { id: string; kind: NotificationKind; title: string; body: string; created_at: string; read_at: string | null; link_type: "request" | "device" | null; link_id: string | null; link_no: string | null; task_id: string | null };
const COLS = "id, kind, title, body, created_at, read_at, link_type, link_id, link_no, task_id";
const SWEEP_MS = 10 * 60_000;
const UUID = /^[0-9a-f-]{36}$/i;

export class NotificationsService {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly sb: SupabaseGateway) {}

  async feed(tenantId: string, employeeId: string): Promise<NotificationFeed> {
    const db = this.sb.admin;
    const [{ data, error }, { count }] = await Promise.all([
      db.from("notifications").select(COLS).eq("tenant_id", tenantId).eq("recipient_employee_id", employeeId).order("created_at", { ascending: false }).limit(50),
      db.from("notifications").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("recipient_employee_id", employeeId).is("read_at", null),
    ]);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const taskIds = [...new Set(rows.map((r) => r.task_id).filter((x): x is string => !!x))];
    const pending = new Set<string>();
    if (taskIds.length) {
      const { data: tasks } = await db.from("approval_tasks").select("id").in("id", taskIds).eq("status", "pending");
      for (const t of (tasks ?? []) as Array<{ id: string }>) pending.add(t.id);
    }
    const items: AppNotification[] = rows.map((r) => ({
      id: r.id, kind: r.kind, title: r.title, body: r.body, createdAt: r.created_at, readAt: r.read_at,
      link: r.link_type && r.link_id ? { type: r.link_type, id: r.link_id, no: r.link_no } : null,
      actionable: (r.kind === "approval.pending" || r.kind === "approval.due") && !!r.task_id && pending.has(r.task_id),
    }));
    return { items, unread: count ?? 0 };
  }

  async markRead(tenantId: string, employeeId: string, b: Body): Promise<NotificationFeed> {
    const ids = b?.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 200 || !ids.every((x) => typeof x === "string" && UUID.test(x)))) throw invalid("Danh sách thông báo không hợp lệ.");
    let q = this.sb.admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("recipient_employee_id", employeeId).is("read_at", null);
    if (Array.isArray(ids) && ids.length) q = q.in("id", ids as string[]);
    const { error } = await q;
    if (error) throw error;
    return this.feed(tenantId, employeeId);
  }

  /* Nhắc hạn duyệt: chạy ngay khi khởi động rồi mỗi 10 phút (hàm SQL tự chống nhắc trùng) */
  startDueSweep() {
    if (this.timer) return;
    const run = () => { void this.sb.admin.rpc("notify_due_approvals").then(({ error }) => { if (error) console.error("[notify_due_approvals]", error.message); }); };
    setTimeout(run, 5_000).unref();
    this.timer = setInterval(run, SWEEP_MS);
    this.timer.unref();
  }
}
