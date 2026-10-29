"use client";
/* Hỗ trợ từ Kavor (docs/plans/console-ops.md phần B, thiết kế bổ sung — prototype HR không có): banner trên mọi trang khi Kavor đang hỗ trợ
   hoặc có yêu cầu chờ Tenant Admin duyệt; tab Cài đặt → Hỗ trợ Kavor để duyệt / từ chối / thu hồi. Phiên tự hết hạn theo thời hạn đã duyệt. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { SUPPORT_SCOPES, type SupportBanner as Banner, type SupportSession, type SupportStatus } from "@kavor/contracts";
import { call, useApi } from "../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Status, fmtDateTime, fmtTime, useAction, useMe } from "./kit";

export const SSTATUS: Record<SupportStatus, [string, string]> = {
  pending: ["Chờ duyệt", "warn"], active: ["Đang hỗ trợ", "info"], rejected: ["Đã từ chối", "bad"], cancelled: ["Kavor đã hủy", "muted"],
  revoked: ["Đã thu hồi", "muted"], ended: ["Đã kết thúc", "muted"], expired: ["Hết hạn", "muted"],
};
/* Thao tác của chính người dùng (duyệt/từ chối/thu hồi) báo banner tải lại ngay, không chờ Realtime (kênh cần vài giây sau khi mở trang mới nhận sự kiện) */
const CHANGED = "kavor:support-changed";
const scopeText = (s: SupportSession["scopes"]) => s.map((x) => SUPPORT_SCOPES[x].label).join(", ");

export function SupportBanner() {
  const me = useMe();
  const { data, reload } = useApi<Banner>("support/banner", { tables: ["support_access_sessions"], tenantId: me.tenant.id });
  useEffect(() => { const f = () => void reload(); window.addEventListener(CHANGED, f); return () => window.removeEventListener(CHANGED, f); }, [reload]);
  /* Tự ẩn banner đúng lúc phiên hết hạn (không có sự kiện DB nào lúc đó) */
  useEffect(() => {
    const next = Math.min(...(data?.active ?? []).map((a) => Date.parse(a.expiresAt)));
    if (!Number.isFinite(next)) return;
    const t = setTimeout(() => void reload(), Math.max(1000, next - Date.now() + 1000));
    return () => clearTimeout(t);
  }, [data, reload]);
  if (!data) return null;
  const a = data.active[0];
  if (a) return (
    <div className="banner support-banner"><span className="banner-icon"><Icon name="lock" /></span>
      <span className="banner-copy"><b>Kavor đang hỗ trợ công ty · {a.operator} · đến {fmtTime(a.expiresAt, me.tenant.timezone)}</b>
        <span>Chỉ đọc: {scopeText(a.scopes)}. Mọi lần xem đều ghi vào nhật ký hoạt động.</span></span>
      {data.canApprove ? <Link className="btn" href="/settings?tab=support">Xem / thu hồi <Icon name="arrow" /></Link> : null}</div>
  );
  if (data.pending) return (
    <div className="banner"><span className="banner-icon"><Icon name="shield" /></span>
      <span className="banner-copy"><b>{data.pending} yêu cầu hỗ trợ từ Kavor đang chờ bạn duyệt</b><span>Nhân viên Kavor chỉ xem được dữ liệu sau khi quản trị viên công ty đồng ý, trong thời hạn đã ghi.</span></span>
      <Link className="btn" href="/settings?tab=support">Xem yêu cầu <Icon name="arrow" /></Link></div>
  );
  return null;
}

export function SupportPanel() {
  const me = useMe();
  const { data, error, reload, setData } = useApi<SupportSession[]>("support", { tables: ["support_access_sessions"], tenantId: me.tenant.id });
  const [deciding, setDeciding] = useState<{ s: SupportSession; action: "approve" | "reject" | "revoke" } | null>(null);
  const tz = me.tenant.timezone;
  const canApprove = me.permissions.includes("support_access.approve");
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="card-head"><div><h3>Yêu cầu hỗ trợ từ Kavor</h3><p>Nhân viên Kavor không có quyền mặc định vào dữ liệu công ty. Mỗi yêu cầu nêu mã phiếu hỗ trợ, lý do, phạm vi và thời hạn; quyền tự hết hạn.</p></div></div>
        {data && !data.length ? <Empty title="Chưa có yêu cầu nào" text="Khi bạn liên hệ Kavor hỗ trợ, kỹ sư sẽ gửi yêu cầu truy cập để bạn duyệt tại đây." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Kỹ sư Kavor</th><th>Phiếu hỗ trợ · lý do</th><th>Phạm vi (chỉ đọc)</th><th>Thời hạn</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id}>
                <td><b>{s.operator}</b><div className="muted" style={{ fontSize: 10.5 }}>gửi {fmtDateTime(s.requestedAt, tz)}</div></td>
                <td style={{ whiteSpace: "normal", maxWidth: 280 }}><b>{s.ticket}</b> · {s.reason}</td>
                <td style={{ whiteSpace: "normal" }}>{scopeText(s.scopes)}</td>
                <td className="nowrap">{s.startsAt ? `${fmtTime(s.startsAt, tz)}–${fmtTime(s.endedAt ?? s.expiresAt, tz)}` : `${s.minutes} phút`}{s.decidedBy ? <div className="muted" style={{ fontSize: 10.5 }}>{s.decidedBy}</div> : null}</td>
                <td><Status v={SSTATUS[s.status]} /></td>
                <td><span className="row-actions">
                  {canApprove && s.status === "pending" ? <><button className="btn small primary" onClick={() => setDeciding({ s, action: "approve" })}>Duyệt</button><button className="btn small" onClick={() => setDeciding({ s, action: "reject" })}>Từ chối</button></> : null}
                  {canApprove && s.status === "active" ? <button className="btn small danger" onClick={() => setDeciding({ s, action: "revoke" })}>Thu hồi</button> : null}
                </span></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {deciding ? <DecideModal s={deciding.s} action={deciding.action} onClose={() => setDeciding(null)} onDone={(n) => setData((data ?? []).map((x) => (x.id === n.id ? n : x)))} /> : null}
    </>
  );
}

function DecideModal({ s, action, onClose, onDone }: { s: SupportSession; action: "approve" | "reject" | "revoke"; onClose: () => void; onDone: (s: SupportSession) => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const title = action === "approve" ? `Cho ${s.operator} xem dữ liệu ${s.minutes} phút?` : action === "reject" ? "Từ chối yêu cầu hỗ trợ?" : "Thu hồi quyền hỗ trợ ngay?";
  async function go() {
    if (action === "reject" && note.trim().length < 5) { setErr("Ghi lý do từ chối (ít nhất 5 ký tự)."); return; }
    await run("go", async () => { onDone(await call<SupportSession>("POST", `support/${s.id}/${action}`, { note: note.trim() || null })); window.dispatchEvent(new Event(CHANGED)); onClose(); },
      action === "approve" ? "Đã duyệt — quyền tự hết hạn theo thời hạn" : action === "reject" ? "Đã từ chối yêu cầu" : "Đã thu hồi quyền hỗ trợ");
  }
  return (
    <Modal title={title} sub={action === "approve" ? "Thời hạn tính từ bây giờ. Bạn thu hồi được bất cứ lúc nào; mọi lần xem đều ghi vào nhật ký." : action === "revoke" ? "Kỹ sư Kavor mất quyền ngay ở lần xem kế tiếp." : undefined} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Để sau</button><button className={`btn ${action === "approve" ? "primary" : "danger"}`} disabled={!!busy} onClick={() => void go()}>{busy ? "Đang xử lý…" : action === "approve" ? "Duyệt" : action === "reject" ? "Từ chối" : "Thu hồi"}</button></>}>
      <div className="card detail-list" style={{ marginBottom: 12 }}>
        <div className="detail-row"><span>Phiếu hỗ trợ</span><b>{s.ticket}</b></div>
        <div className="detail-row"><span>Lý do</span><b style={{ whiteSpace: "normal" }}>{s.reason}</b></div>
        <div className="detail-row"><span>Phạm vi</span><b style={{ whiteSpace: "normal" }}>{s.scopes.map((x) => `${SUPPORT_SCOPES[x].label} (${SUPPORT_SCOPES[x].detail})`).join("; ")}</b></div>
      </div>
      {action !== "revoke" ? <Field label={action === "reject" ? "Lý do từ chối" : "Ghi chú cho Kavor (không bắt buộc)"} full><textarea rows={2} value={note} onChange={(e) => { setNote(e.target.value); setErr(null); }} /></Field> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}
