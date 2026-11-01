"use client";
/* Đơn & phê duyệt: bám page-requests của Kavor HR Admin Prototype.html (hàng đợi theo SLA, modal xem & duyệt).
   "Cấu hình workflow" là thiết kế bổ sung: luồng duyệt theo loại đơn (giải trình, nghỉ phép), có phiên bản theo ngày hiệu lực. */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { STEP_RESOLVERS, type OrgOptions, type RequestItem, type RequestQueue, type RequestQueueStatus, type RequestType, type StepResolver, type WorkflowDef, type WorkflowStepInput } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, can, fmtDate, fmtDateTime, num, tenantToday, useAction, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, REQUEST_TYPE, RequestModal, requestSummary, slaLabel } from "../../_ui/request";
import { Select, SkeletonRows } from "@kavor/web-ui";

export default function Page() { return <Suspense><RequestsPage /></Suspense>; }

const STATUS_TABS: Array<[RequestQueueStatus, string]> = [["pending", "Chờ duyệt"], ["approved", "Đã duyệt"], ["closed", "Từ chối/Hủy"], ["all", "Tất cả"]];
const PAGE_SIZE = 50;

function RequestsPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("open");
  const [status, setStatus] = useState<RequestQueueStatus>((params.get("status") as RequestQueueStatus) || "pending");
  const [only, setOnly] = useState<"" | "mine" | "overdue">("");
  const [f, setF] = useState({ type: "", departmentId: "", from: "", to: "", dateBy: "applied" });
  const [q, setQ] = useState(""), [qq, setQq] = useState("");
  const [page, setPage] = useState(1);
  /* Tìm theo mã đơn/tên gửi lên máy chủ sau khi ngừng gõ */
  useEffect(() => { const t = setTimeout(() => { setQq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const query = new URLSearchParams(Object.entries({ ...f, q: qq, only: status === "pending" ? only : "", page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, v]) => v)).toString();
  const { data, error, reload } = useApi<RequestQueue>(`requests?status=${status}&${query}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const { data: org } = useApi<OrgOptions>("org");
  const [open, setOpen] = useState<RequestItem | null>(null);
  const [config, setConfig] = useState(false);
  /* Mở từ thông báo: /requests?open=<id> (đơn có thể không thuộc bộ lọc đang xem) */
  useEffect(() => {
    if (!openId) return;
    void call<RequestItem>("GET", `requests/${openId}`).then(setOpen).catch(() => undefined).finally(() => router.replace("/requests", { scroll: false }));
  }, [openId, router]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const tab = (s: RequestQueueStatus) => { setStatus(s); setPage(1); setOnly(""); };
  const c = data?.counts;
  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!(f.type || f.departmentId || f.from || f.to || qq);
  /* Xuất CSV theo bộ lọc đang xem (tab Chờ duyệt cũng xuất được); qua route Next cùng origin */
  const exportHref = `/api/requests/export?status=${status}&${new URLSearchParams(Object.entries({ ...f, q: qq }).filter(([, v]) => v)).toString()}`;
  return (
    <section className="page active">
      <div className="page-head"><div><p>Ưu tiên theo hạn xử lý và mức ảnh hưởng tới kỳ công/lương. Đơn đã xử lý xem ở tab Đã duyệt, Từ chối/Hủy hoặc Tất cả.</p></div>
        <div className="head-actions">
          <a className="btn" href={exportHref}><Icon name="download" /> Xuất CSV</a>
          {can(me, "request.read") ? <button className="btn" onClick={() => setConfig(true)}><Icon name="settings" /> Cấu hình luồng duyệt</button> : null}</div></div>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar">
          <div className="segmented" role="tablist">{STATUS_TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={status === k} className={status === k ? "active" : ""} onClick={() => tab(k)}>{label} {c ? c[k] : ""}</button>)}</div>
          {status === "pending" ? <>
            <button className={`filter-chip ${only === "mine" ? "active" : ""}`} onClick={() => { setOnly(only === "mine" ? "" : "mine"); setPage(1); }}>Chờ tôi duyệt {c?.mine ?? 0}</button>
            <button className={`filter-chip ${only === "overdue" ? "active" : ""}`} onClick={() => { setOnly(only === "overdue" ? "" : "overdue"); setPage(1); }}>Quá hạn xử lý {c?.overdue ?? 0}</button>
          </> : null}
        </div>
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn hoặc người gửi…" /></label>
          <Select className="select" value={f.type} onChange={set("type")} aria-label="Loại đơn"><option value="">Mọi loại đơn</option>{(Object.keys(REQUEST_TYPE) as RequestType[]).map((t) => <option key={t} value={t}>{REQUEST_TYPE[t]}</option>)}</Select>
          <Select className="select" value={f.departmentId} onChange={set("departmentId")} aria-label="Phòng ban"><option value="">Mọi phòng ban</option>{(org?.departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select className="select" value={f.dateBy} onChange={set("dateBy")} aria-label="Lọc theo ngày"><option value="applied">Ngày áp dụng</option><option value="submitted">Ngày gửi</option></Select>
          <input type="date" value={f.from} max={f.to || undefined} onChange={set("from")} aria-label="Từ ngày" />
          <input type="date" value={f.to} min={f.from || undefined} onChange={set("to")} aria-label="Đến ngày" />
          {filtered ? <button className="btn small" onClick={() => { setF({ type: "", departmentId: "", from: "", to: "", dateBy: "applied" }); setQ(""); setPage(1); }}>Bỏ lọc</button> : null}
        </div>
        {data && !items.length ? <Empty title={status === "pending" && !filtered && !only ? "Không còn đơn nào chờ duyệt" : "Không có đơn phù hợp"} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 1040 }}><thead><tr><th>Mã đơn</th><th>Người gửi</th><th>Loại</th><th>Nội dung</th><th>Áp dụng</th><th>Gửi lúc</th><th>{status === "pending" ? "Hạn xử lý" : "Trạng thái"}</th><th /></tr></thead><tbody>
            {!data && !error ? <SkeletonRows cols={8} rows={6} /> : null}
            {items.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td><b>{r.no}</b></td>
                <td><Person name={r.requester.fullName} seed={r.requester.code} sub={r.requester.department ?? r.requester.code} /></td>
                <td>{REQUEST_TYPE[r.type]}</td>
                <td>{requestSummary(r)}</td>
                <td className="nowrap">{r.applied ? (r.applied.from === r.applied.to ? fmtDate(r.applied.from) : `${fmtDate(r.applied.from).slice(0, 5)}–${fmtDate(r.applied.to)}`) : <span className="muted">—</span>}</td>
                <td className="nowrap">{fmtDateTime(r.submittedAt, me.tenant.timezone)}</td>
                <td>{r.status === "pending" ? <Status v={slaLabel(r.dueAt)} /> : <Status v={REQUEST_STATUS[r.status]} />}</td>
                <td><button className={`btn small ${r.myTaskId ? "primary" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.myTaskId ? "Xem & duyệt" : "Xem"}</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        {data && data.total > data.pageSize ? <div className="toolbar" style={{ justifyContent: "flex-end" }}>
          <span className="muted" style={{ fontSize: 12 }}>{num((page - 1) * data.pageSize + 1)}–{num(Math.min(page * data.pageSize, data.total))} / {num(data.total)} đơn</span>
          <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
          <button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau</button>
        </div> : null}
      </article>
      {open ? <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => void reload()} /> : null}
      {config ? <WorkflowModal onClose={() => setConfig(false)} /> : null}
    </section>
  );
}

/* Luồng duyệt theo loại đơn: các bước theo thứ tự, SLA; đơn nghỉ đặt được "chỉ khi nghỉ trên N ngày". Lưu = phiên bản mới từ ngày hiệu lực */
function WorkflowModal({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const { data, error, reload, setData } = useApi<WorkflowDef[]>("workflows");
  const [type, setType] = useState<RequestType>("explanation");
  const wf = data?.find((w) => w.requestType === type);
  const [steps, setSteps] = useState<WorkflowStepInput[] | null>(null);
  const [from, setFrom] = useState(tenantToday(me.tenant.timezone));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const manage = can(me, "workflow.manage");
  useEffect(() => { setSteps(wf?.current ? wf.current.steps : null); setErr(null); }, [wf]);
  const list = steps ?? [];
  const set = (i: number, patch: Partial<WorkflowStepInput>) => setSteps(list.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  async function save() {
    if (!list.length) { setErr("Cần ít nhất một bước duyệt."); return; }
    if (new Set(list.map((s) => s.resolver)).size !== list.length) { setErr("Mỗi loại người duyệt chỉ xuất hiện một lần."); return; }
    if (list.every((s) => s.daysOver != null || s.amountOver != null)) { setErr("Cần ít nhất một bước luôn áp dụng."); return; }
    if (type === "salary_advance" && !list.some((s) => s.resolver === "payroll")) { setErr("Luồng tạm ứng phải có bước Kế toán (người chi tiền)."); return; }
    await run("save", async () => setData(await call<WorkflowDef[]>("POST", `workflows/${type}/versions`, { steps: list, effectiveFrom: from, note: note || null })), "Đã lưu luồng duyệt mới");
  }
  return (
    <Modal wide title={`Luồng duyệt · ${REQUEST_TYPE[type]}`} sub="Đơn đã gửi giữ luồng lúc gửi; luồng mới áp dụng cho đơn gửi từ ngày hiệu lực." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button>{manage ? <button className="btn primary" disabled={!!busy || !steps} onClick={save}>{busy ? "Đang lưu…" : "Lưu phiên bản mới"}</button> : null}</>}>
      {error ? <LoadError error={error} retry={reload} /> : null}
      <div className="toolbar" style={{ padding: "0 0 10px" }}>
        {(data ?? []).map((w) => <button key={w.requestType} className={`filter-chip ${type === w.requestType ? "active" : ""}`} onClick={() => setType(w.requestType)}>{REQUEST_TYPE[w.requestType]}</button>)}
      </div>
      <div className="card detail-list">
        {list.map((s, i) => (
          <div key={i} className="detail-row" style={{ gridTemplateColumns: type === "leave" || type === "salary_advance" ? "60px 1fr 130px 230px auto" : "60px 1fr 130px auto", minHeight: 52 }}>
            <span style={{ color: "var(--ink)", fontSize: 12, fontWeight: 700 }}>Bước {i + 1}</span>
            <Select className="select" disabled={!manage} value={s.resolver} onChange={(e) => set(i, { resolver: e.target.value as StepResolver })}>
              {(Object.keys(STEP_RESOLVERS) as StepResolver[]).filter((k) => k !== "payroll" || type === "salary_advance").map((k) => <option key={k} value={k}>{STEP_RESOLVERS[k]}</option>)}
            </Select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>Hạn xử lý <input type="number" min={1} max={240} disabled={!manage} value={s.slaHours} onChange={(e) => set(i, { slaHours: Number(e.target.value) || 1 })} style={{ width: 64 }} /> giờ</label>
            {type === "leave" ? <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
              <input type="checkbox" disabled={!manage} checked={s.daysOver != null} onChange={(e) => set(i, { daysOver: e.target.checked ? 2 : null })} />Chỉ khi nghỉ trên
              <input type="number" min={0} max={30} disabled={!manage || s.daysOver == null} value={s.daysOver ?? ""} onChange={(e) => set(i, { daysOver: Number(e.target.value) || 0 })} style={{ width: 48 }} /> ngày</label>
              : type === "salary_advance" ? <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
              <input type="checkbox" disabled={!manage} checked={s.amountOver != null} onChange={(e) => set(i, { amountOver: e.target.checked ? 5000000 : null })} />Chỉ khi trên
              <input type="number" min={0} step={500000} disabled={!manage || s.amountOver == null} value={s.amountOver ?? ""} onChange={(e) => set(i, { amountOver: Number(e.target.value) || 0 })} style={{ width: 96 }} /> ₫</label> : null}
            {manage ? <button className="btn small" disabled={list.length <= 1} onClick={() => setSteps(list.filter((_, k) => k !== i))}>Bỏ</button> : <span />}
          </div>
        ))}
      </div>
      {manage && steps && list.length < (type === "salary_advance" ? 3 : 2) ? <button className="btn small" style={{ marginTop: 10 }} onClick={() => {
        const free = (["direct_manager", "hr", "payroll"] as StepResolver[]).find((k) => (k !== "payroll" || type === "salary_advance") && !list.some((s) => s.resolver === k));
        if (free) setSteps([...list, { resolver: free, slaHours: 24 }]);
      }}><Icon name="plus" /> Thêm bước</button> : null}
      <p className="muted" style={{ fontSize: 11.5, margin: "10px 0" }}>Không có quản lý trực tiếp (hoặc người gửi chính là quản lý) thì bước Quản lý được bỏ qua; không còn bước nào thì chuyển cho Phòng Nhân sự. Không ai tự duyệt đơn của mình.{type === "leave" ? " Đơn nghỉ trước phép (số dư âm) luôn cần Phòng Nhân sự duyệt." : ""}</p>
      {manage ? <div className="form-grid">
        <Field label="Hiệu lực từ"><input type="date" min={tenantToday(me.tenant.timezone)} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Ghi chú"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div> : null}
      <ErrorLine text={err} />
      <ul className="version-list">{(wf?.versions ?? []).map((v) => <li key={v.versionNo}>v{v.versionNo} · từ {fmtDate(v.effectiveFrom)} · {v.steps.map((s) => `${STEP_RESOLVERS[s.resolver]} (${s.slaHours} giờ${s.daysOver != null ? `, khi nghỉ trên ${s.daysOver} ngày` : ""}${s.amountOver != null ? `, khi trên ${s.amountOver.toLocaleString("vi-VN")} ₫` : ""})`).join(" → ")}{v.note ? ` — ${v.note}` : ""}</li>)}</ul>
    </Modal>
  );
}
