"use client";
/* Support access: bám page-access + modal requestAccess của Kavor Console Prototype.html, dữ liệu thật.
   Khác prototype: phạm vi là dữ liệu Kavor có (cấu hình công ty / danh sách nhân sự tối thiểu / nhật ký 30 ngày) và chọn được nhiều;
   thêm ô mã ticket; Kavor không thu hồi hộ tenant — người yêu cầu "Kết thúc", tenant thu hồi trên web HR; "Vi phạm" thay bằng từ chối/thu hồi. */
import { useState } from "react";
import Link from "next/link";
import { SUPPORT_MINUTES, SUPPORT_SCOPES, type ConsoleTenant, type SupportScope, type SupportSession } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Status, fmtDateTime, num, useAction } from "../../_ui/kit";
import { SSTATUS } from "../../_ui/labels";
import { Select } from "@kavor/web-ui";

const TZ = "Asia/Ho_Chi_Minh";

export default function SupportPage() {
  const { data, error, reload, setData } = useApi<SupportSession[]>("support");
  const [asking, setAsking] = useState(false);
  const { busy, run } = useAction();
  const all = data ?? [];
  const month = new Date().toISOString().slice(0, 7);
  const active = all.filter((s) => s.status === "active"), pending = all.filter((s) => s.status === "pending");
  const close = (s: SupportSession) => run(`c${s.id}`, async () => {
    const n = await call<SupportSession>("POST", `support/${s.id}/close`);
    setData(all.map((x) => (x.id === n.id ? n : x)));
  }, s.status === "pending" ? "Đã hủy yêu cầu" : "Đã kết thúc phiên hỗ trợ");
  return (
    <section className="page active">
      <div className="page-head"><div><h2>Quyền hỗ trợ tenant</h2><p>Nhân viên Kavor không mặc định được xem dữ liệu HR/payroll của khách hàng.</p></div>
        <button className="btn primary" onClick={() => setAsking(true)}><Icon name="key" /> Yêu cầu truy cập</button></div>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="lock" /></span><span className="metric-copy"><span>Đang hiệu lực</span><strong>{num(active.length)}</strong><small>Tối đa 60 phút</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Chờ tenant duyệt</span><strong>{num(pending.length)}</strong><small>{pending.map((s) => s.tenant.code).join(", ") || "—"}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="log" /></span><span className="metric-copy"><span>Phiên tháng này</span><strong>{num(all.filter((s) => s.startsAt?.startsWith(month)).length)}</strong><small>100% có audit</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="shield" /></span><span className="metric-copy"><span>Bị từ chối / thu hồi</span><strong>{num(all.filter((s) => s.status === "rejected" || s.status === "revoked").length)}</strong><small>Gần nhất 200 yêu cầu</small></span></article>
      </div>
      <article className="card">
        {data && !all.length ? <Empty title="Chưa có yêu cầu hỗ trợ nào" text="Tạo yêu cầu khi cần xem cấu hình hoặc danh sách nhân sự của khách để xử lý ticket." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 960 }}><thead><tr><th>Tenant</th><th>Kỹ sư</th><th>Lý do</th><th>Phạm vi</th><th>Hết hạn</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {all.map((s) => (
              <tr key={s.id}>
                <td><b>{s.tenant.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{s.tenant.code}</div></td>
                <td>{s.operator.replace(/ \(Kavor\)$/, "")}</td>
                <td style={{ whiteSpace: "normal", maxWidth: 280 }}><b>{s.ticket}</b> · {s.reason}{s.decisionNote ? <div className="muted" style={{ fontSize: 10.5 }}>Tenant: {s.decisionNote}</div> : null}</td>
                <td style={{ whiteSpace: "normal" }}>{s.scopes.map((x) => SUPPORT_SCOPES[x].label).join(", ")}</td>
                <td className="nowrap">{s.expiresAt ? fmtDateTime(s.expiresAt, TZ) : `${s.minutes} phút`}</td>
                <td><Status v={SSTATUS[s.status]} /></td>
                <td><span className="row-actions">
                  {s.mine && s.status === "active" ? <><Link className="btn small primary" href={`/support/${s.id}`}>Mở phiên</Link><button className="btn small danger" disabled={!!busy} onClick={() => void close(s)}>Kết thúc</button></> : null}
                  {s.mine && s.status === "pending" ? <button className="btn small" disabled={!!busy} onClick={() => void close(s)}>Hủy yêu cầu</button> : null}
                </span></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {asking ? <RequestModal onClose={() => setAsking(false)} onSaved={(s) => { setData([s, ...all]); setAsking(false); }} /> : null}
    </section>
  );
}

function RequestModal({ onClose, onSaved }: { onClose: () => void; onSaved: (s: SupportSession) => void }) {
  const tenants = (useApi<ConsoleTenant[]>("tenants").data ?? []).filter((t) => t.status === "active");
  const [f, setF] = useState({ tenantId: "", ticket: "", reason: "", minutes: 30 });
  const [scopes, setScopes] = useState<SupportScope[]>(["settings"]);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const toggle = (s: SupportScope) => { setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s]); setErr(null); };
  async function save() {
    if (!f.tenantId) { setErr("Chọn tenant."); return; }
    if (f.ticket.trim().length < 2) { setErr("Nhập mã ticket."); return; }
    if (f.reason.trim().length < 10) { setErr("Ghi nội dung cần hỗ trợ (ít nhất 10 ký tự)."); return; }
    if (!scopes.length) { setErr("Chọn ít nhất một phạm vi."); return; }
    await run("save", async () => onSaved(await call<SupportSession>("POST", "support", { ...f, scopes })), "Yêu cầu support access đã gửi tenant phê duyệt");
  }
  return (
    <Modal title="Yêu cầu support access" sub="Quyền có thời hạn và mọi thao tác đều được audit." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang gửi…" : "Gửi tenant phê duyệt"}</button></>}>
      <div className="form-grid">
        <Field label="Tenant" full><Select value={f.tenantId} onChange={(e) => { setF({ ...f, tenantId: e.target.value }); setErr(null); }}><option value="">Chọn…</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}</Select></Field>
        <Field label="Mã ticket"><input value={f.ticket} onChange={(e) => { setF({ ...f, ticket: e.target.value }); setErr(null); }} placeholder="SUP-1024" /></Field>
        <Field label="Thời hạn"><Select value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })}>{SUPPORT_MINUTES.map((m) => <option key={m} value={m}>{m} phút</option>)}</Select></Field>
        <Field label="Lý do" full><textarea value={f.reason} onChange={(e) => { setF({ ...f, reason: e.target.value }); setErr(null); }} placeholder="Mã ticket và nội dung cần hỗ trợ" /></Field>
        <Field label="Phạm vi tối thiểu" full>
          <div style={{ display: "grid", gap: 8 }}>
            {(Object.keys(SUPPORT_SCOPES) as SupportScope[]).map((s) => (
              <label key={s} className="check-row" style={{ alignItems: "flex-start" }}><input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
                <span><b>{SUPPORT_SCOPES[s].label}</b><span className="muted" style={{ display: "block", fontSize: 11 }}>{SUPPORT_SCOPES[s].detail}</span></span></label>
            ))}
          </div>
        </Field>
      </div>
      <div className="note-amber" style={{ marginTop: 14 }}>Không yêu cầu quyền xem payroll hoặc thông tin cá nhân nếu ticket không cần thiết. Thời hạn tính từ lúc Tenant Admin duyệt.</div>
      <ErrorLine text={err} />
    </Modal>
  );
}
