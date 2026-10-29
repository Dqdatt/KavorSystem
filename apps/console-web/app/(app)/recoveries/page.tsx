"use client";
/* Khôi phục chủ sở hữu (thiết kế bổ sung, cùng bố cục trang Support access của prototype): Tenant Admin mất điện thoại
   hoặc công ty không còn ai quản trị. Có xác minh, cần hai nhân viên Kavor khác nhau, yêu cầu hết hạn sau 24 giờ. */
import { useState } from "react";
import type { OwnerRecovery } from "@kavor/contracts";
import { useApi } from "../../_lib/client";
import { Empty, Icon, LoadError, Status, fmtDateTime, num } from "../../_ui/kit";
import { DecideModal, KIND, RSTATUS, RecoveryForm } from "../../_ui/recovery";

const TZ = "Asia/Ho_Chi_Minh";

export default function RecoveriesPage() {
  const { data, error, reload } = useApi<OwnerRecovery[]>("recoveries");
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<{ r: OwnerRecovery; action: "approve" | "reject" | "cancel" } | null>(null);
  const rows = data ?? [];
  const count = (s: OwnerRecovery["status"]) => rows.filter((r) => r.status === s).length;
  return (
    <section className="page active">
      <div className="page-head"><div><p>Chỉ thực hiện qua Kavor Console: xác minh qua kênh độc lập, một người tạo, một người khác duyệt, mọi bước ghi nhật ký hoạt động.</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="key" /> Tạo yêu cầu</button></div>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Chờ duyệt</span><strong>{num(count("pending"))}</strong><small>Hết hạn sau 24 giờ</small></span></article>
        <article className="card metric-card"><span className="metric-icon"><Icon name="check" /></span><span className="metric-copy"><span>Đã duyệt</span><strong>{num(count("approved"))}</strong><small>Đã thực hiện</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="x" /></span><span className="metric-copy"><span>Từ chối</span><strong>{num(count("rejected"))}</strong><small>Chưa đủ xác minh</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="shield" /></span><span className="metric-copy"><span>Hủy / quá hạn</span><strong>{num(count("cancelled") + count("expired"))}</strong><small>Không thực hiện</small></span></article>
      </div>
      <article className="card">
        {data && !rows.length ? <Empty title="Chưa có yêu cầu khôi phục nào" text="Tạo yêu cầu khi quản trị viên công ty mất điện thoại hoặc công ty không còn ai quản trị." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 1100 }}><thead><tr><th>Doanh nghiệp</th><th>Loại</th><th>Người nhận</th><th>Đã xác minh</th><th>Người tạo</th><th>Hết hạn</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.tenant.name}</b><br /><small className="muted">{r.tenant.code}</small></td>
                <td>{KIND[r.kind]}</td>
                <td>{r.target.name}<br /><small className="muted">{r.target.email ?? "—"}</small></td>
                <td style={{ maxWidth: 260, whiteSpace: "normal" }}><small>{r.verification}</small><br /><small className="muted">{r.reason}</small></td>
                <td>{r.requestedBy}<br /><small className="muted">{fmtDateTime(r.requestedAt, TZ)}</small></td>
                <td className="nowrap">{fmtDateTime(r.expiresAt, TZ)}</td>
                <td><Status v={RSTATUS[r.status]} />{r.decidedBy ? <><br /><small className="muted">{r.decidedBy}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</small></> : null}</td>
                <td><span className="row-actions">
                  {r.status === "pending" && !r.mine ? <><button className="btn small primary" onClick={() => setDeciding({ r, action: "approve" })}>Duyệt</button><button className="btn small" onClick={() => setDeciding({ r, action: "reject" })}>Từ chối</button></> : null}
                  {r.status === "pending" && r.mine ? <><span className="muted" style={{ fontSize: 11 }}>Chờ người khác duyệt</span><button className="btn small" onClick={() => setDeciding({ r, action: "cancel" })}>Hủy</button></> : null}
                </span></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {creating ? <RecoveryForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void reload(); }} /> : null}
      {deciding ? <DecideModal r={deciding.r} action={deciding.action} onClose={() => setDeciding(null)} onDone={() => void reload()} /> : null}
    </section>
  );
}
