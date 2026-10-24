"use client";
/* Đơn & phê duyệt: bám page-requests của Kavor HR Admin Prototype.html (hàng đợi theo SLA, modal xem & duyệt).
   "Cấu hình workflow" là thiết kế bổ sung: luồng duyệt theo loại đơn, có phiên bản theo ngày hiệu lực. */
import { useEffect, useMemo, useState } from "react";
import { STEP_RESOLVERS, type RequestItem, type RequestQueue, type StepResolver, type WorkflowDef, type WorkflowStepInput } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, can, fmtDate, fmtDateTime, tenantToday, useAction, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, REQUEST_TYPE, RequestModal, requestSummary, slaLabel } from "../../_ui/request";

export default function RequestsPage() {
  const me = useMe();
  const [status, setStatus] = useState("pending");
  const { data, error, reload } = useApi<RequestQueue>(`requests?status=${status}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const [filter, setFilter] = useState<"all" | "mine" | "overdue">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<RequestItem | null>(null);
  const [config, setConfig] = useState(false);
  const items = useMemo(() => (data?.items ?? []).filter((r) => (filter === "all" || (filter === "mine" ? !!r.myTaskId : r.overdue))
    && (!q.trim() || `${r.no} ${r.requester.fullName} ${r.requester.code}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, filter, q]);
  const c = data?.counts;
  return (
    <section className="page active">
      <div className="page-head"><div><h2>Hàng đợi phê duyệt</h2><p>Ưu tiên theo SLA và mức ảnh hưởng tới kỳ công/lương.</p></div>
        <div className="head-actions">{can(me, "request.read") ? <button className="btn" onClick={() => setConfig(true)}><Icon name="settings" /> Cấu hình workflow</button> : null}</div></div>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn hoặc người gửi…" /></label>
          <button className={`filter-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Tất cả {data?.items.length ?? 0}</button>
          <button className={`filter-chip ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")}>Chờ tôi duyệt {c?.mine ?? 0}</button>
          <button className={`filter-chip ${filter === "overdue" ? "active" : ""}`} onClick={() => setFilter("overdue")}>Quá SLA {c?.overdue ?? 0}</button>
          <span className="toolbar-spacer" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
            <option value="pending">Đang chờ</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option><option value="cancelled">Đã hủy</option><option value="all">Tất cả</option>
          </select>
        </div>
        {data && !items.length ? <Empty title={status === "pending" ? "Không còn đơn nào chờ duyệt" : "Không có đơn phù hợp"} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 980 }}><thead><tr><th>Mã đơn</th><th>Người gửi</th><th>Loại</th><th>Nội dung</th><th>Gửi lúc</th><th>{status === "pending" ? "SLA" : "Trạng thái"}</th><th /></tr></thead><tbody>
            {items.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td><b>{r.no}</b></td>
                <td><Person name={r.requester.fullName} seed={r.requester.code} sub={r.requester.department ?? r.requester.code} /></td>
                <td>{REQUEST_TYPE[r.type]}</td>
                <td>{requestSummary(r)}</td>
                <td className="nowrap">{fmtDateTime(r.submittedAt, me.tenant.timezone)}</td>
                <td>{r.status === "pending" ? <Status v={slaLabel(r.dueAt)} /> : <Status v={REQUEST_STATUS[r.status]} />}</td>
                <td><button className={`btn small ${r.myTaskId ? "primary" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.myTaskId ? "Xem & duyệt" : "Xem"}</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {open ? <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => void reload()} /> : null}
      {config ? <WorkflowModal onClose={() => setConfig(false)} /> : null}
    </section>
  );
}

/* Luồng duyệt giải trình: các bước theo thứ tự, SLA; lưu = phiên bản mới từ ngày hiệu lực */
function WorkflowModal({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const { data, error, reload, setData } = useApi<WorkflowDef[]>("workflows");
  const wf = data?.[0];
  const [steps, setSteps] = useState<WorkflowStepInput[] | null>(null);
  const [from, setFrom] = useState(tenantToday(me.tenant.timezone));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const manage = can(me, "workflow.manage");
  useEffect(() => { if (wf?.current && !steps) setSteps(wf.current.steps); }, [wf, steps]);
  const list = steps ?? [];
  const set = (i: number, patch: Partial<WorkflowStepInput>) => setSteps(list.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  async function save() {
    if (!list.length) { setErr("Cần ít nhất một bước duyệt."); return; }
    if (new Set(list.map((s) => s.resolver)).size !== list.length) { setErr("Mỗi loại người duyệt chỉ xuất hiện một lần."); return; }
    await run("save", async () => setData(await call<WorkflowDef[]>("POST", "workflows/explanation/versions", { steps: list, effectiveFrom: from, note: note || null })), "Đã lưu luồng duyệt mới");
  }
  return (
    <Modal wide title="Cấu hình workflow · Giải trình công" sub="Đơn đã gửi giữ luồng lúc gửi; luồng mới áp dụng cho đơn gửi từ ngày hiệu lực." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button>{manage ? <button className="btn primary" disabled={!!busy || !steps} onClick={save}>{busy ? "Đang lưu…" : "Lưu phiên bản mới"}</button> : null}</>}>
      {error ? <LoadError error={error} retry={reload} /> : null}
      <div className="card detail-list">
        {list.map((s, i) => (
          <div key={i} className="detail-row" style={{ gridTemplateColumns: "60px 1fr 130px auto", minHeight: 52 }}>
            <span style={{ color: "var(--ink)", fontSize: 12, fontWeight: 700 }}>Bước {i + 1}</span>
            <select className="select" disabled={!manage} value={s.resolver} onChange={(e) => set(i, { resolver: e.target.value as StepResolver })}>
              {(Object.keys(STEP_RESOLVERS) as StepResolver[]).map((k) => <option key={k} value={k}>{STEP_RESOLVERS[k]}</option>)}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>SLA <input type="number" min={1} max={240} disabled={!manage} value={s.slaHours} onChange={(e) => set(i, { slaHours: Number(e.target.value) || 1 })} style={{ width: 64 }} /> giờ</label>
            {manage ? <button className="btn small" disabled={list.length <= 1} onClick={() => setSteps(list.filter((_, k) => k !== i))}>Bỏ</button> : <span />}
          </div>
        ))}
      </div>
      {manage && list.length < 2 ? <button className="btn small" style={{ marginTop: 10 }} onClick={() => setSteps([...list, { resolver: list.some((s) => s.resolver === "hr") ? "direct_manager" : "hr", slaHours: 24 }])}><Icon name="plus" /> Thêm bước</button> : null}
      <p className="muted" style={{ fontSize: 11.5, margin: "10px 0" }}>Không có quản lý trực tiếp (hoặc người gửi chính là quản lý) thì bước Quản lý được bỏ qua; không còn bước nào thì chuyển cho Phòng Nhân sự. Không ai tự duyệt đơn của mình.</p>
      {manage ? <div className="form-grid">
        <Field label="Hiệu lực từ"><input type="date" min={tenantToday(me.tenant.timezone)} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Ghi chú"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div> : null}
      <ErrorLine text={err} />
      <ul className="version-list">{(wf?.versions ?? []).map((v) => <li key={v.versionNo}>v{v.versionNo} · từ {fmtDate(v.effectiveFrom)} · {v.steps.map((s) => `${STEP_RESOLVERS[s.resolver]} (${s.slaHours} giờ)`).join(" → ")}{v.note ? ` — ${v.note}` : ""}</li>)}</ul>
    </Modal>
  );
}
