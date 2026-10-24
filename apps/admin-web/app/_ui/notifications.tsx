"use client";
/* Chuông thông báo trên thanh trên (bám icon-btn + ping của Kavor HR Admin Prototype.html); bảng thả xuống là thiết kế bổ sung
   dùng .notification của prototype. Cập nhật trực tiếp qua Realtime (bảng notifications, RLS chỉ gửi cho người nhận). */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppNotification, NotificationFeed, NotificationKind } from "@kavor/contracts";
import { call, useApi } from "../_lib/client";
import { Icon, fmtDateTime, useMe } from "./kit";

const ICON: Record<NotificationKind, [string, string]> = {
  "approval.pending": ["checks", ""], "approval.due": ["clock", "amber"], "request.approved": ["checks", ""], "request.rejected": ["alert", "red"],
  "device.approved": ["phone", "blue"], "device.rejected": ["phone", "red"],
};

export function NotificationBell() {
  const me = useMe();
  const router = useRouter();
  const { data, setData } = useApi<NotificationFeed>("notifications", { tables: ["notifications", "approval_tasks"], tenantId: me.tenant.id });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const unread = data?.unread ?? 0;
  const read = async (ids?: string[]) => setData(await call<NotificationFeed>("POST", "notifications/read", ids ? { ids } : {}));
  const pick = (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) void read([n.id]);
    if (n.link?.type === "request") router.push(`/requests?open=${n.link.id}`);
    else if (n.link?.type === "device") router.push("/attendance?tab=devices");
  };
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="icon-btn" aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" />{unread ? <i className="ping" /> : null}
      </button>
      {open ? (
        <div className="card notif-pop" role="dialog" aria-label="Thông báo">
          <div className="card-head"><div><h3>Thông báo</h3><p>{unread ? `${unread} chưa đọc` : "Đã đọc hết"}</p></div>
            {unread ? <button className="btn small" onClick={() => void read()}>Đánh dấu đã đọc</button> : null}</div>
          <div className="notification-list">
            {!data?.items.length ? <p className="muted" style={{ padding: "8px 2px", fontSize: 11 }}>Chưa có thông báo. Đơn cần bạn duyệt và đơn sắp quá hạn sẽ hiện ở đây.</p>
              : data.items.slice(0, 20).map((n) => {
                const [icon, tone] = ICON[n.kind];
                return (
                  <button key={n.id} className={`notification ${n.readAt ? "" : "unread"}`} onClick={() => pick(n)}>
                    <span className={`metric-icon ${tone}`}><Icon name={icon} /></span>
                    <span className="notification-copy"><b>{n.title}</b><span>{n.body}</span>{n.actionable ? <span className="notif-act">Xem & duyệt →</span> : null}</span>
                    <time>{fmtDateTime(n.createdAt, me.tenant.timezone)}</time>
                  </button>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
