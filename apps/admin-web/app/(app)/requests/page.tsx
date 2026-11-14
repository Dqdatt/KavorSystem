"use client";
/* Đơn & phê duyệt: hộp thư 2 cột bám Kavor HR Admin Prototype v2.html (danh sách trái, chi tiết + duyệt phải).
   "Cấu hình workflow" là thiết kế bổ sung: luồng duyệt theo loại đơn (giải trình, nghỉ phép), có phiên bản theo ngày hiệu lực. */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { STEP_RESOLVERS, type OrgOptions, type RequestItem, type RequestQueue, type RequestType, type StepResolver, type WorkflowDef, type WorkflowStepInput } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { vs, PageActions, Avatar, Empty, ErrorLine, Field, Icon, LoadError, Modal, Status, can, fmtDate, num, tenantToday, useAction, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, REQUEST_TYPE, RequestDetail, TypeBadge, requestSummary, slaLabel } from "../../_ui/request";
import { Select, SkeletonLines } from "@kavor/web-ui";

export default function Page() { return <Suspense><RequestsPage /></Suspense>; }

type Tab = "mine" | "others" | "done";
const TABS: Array<[Tab, string]> = [["mine", "Cần tôi duyệt"], ["others", "Đang chờ người khác"], ["done", "Đã xử lý"]];
const EMPTY_TEXT: Record<Tab, string> = { mine: "Bạn đã xử lý hết đơn cần duyệt. Đơn mới sẽ hiện ở đây và trên chuông thông báo.", others: "Không có đơn nào đang chờ người khác.", done: "Chưa có đơn nào được xử lý." };
const PAGE_SIZE = 50;
const NO_FILTER = { type: "", departmentId: "", from: "", to: "", dateBy: "applied" };

function RequestsPage() {
  const me = useMe();
  const router = useRouter();
  const openId = useSearchParams().get("open");
  const [tab, setTab] = useState<Tab>("mine");
  const [f, setF] = useState(NO_FILTER);
  const [showF, setShowF] = useState(false);
  const [q, setQ] = useState(""), [qq, setQq] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [extra, setExtra] = useState<RequestItem | null>(null);
  const [config, setConfig] = useState(false);
  const inbox = useRef<HTMLDivElement>(null);
  /* Tìm theo mã đơn/tên gửi lên máy chủ sau khi ngừng gõ */
  useEffect(() => { const t = setTimeout(() => { setQq(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const status = tab === "done" ? "done" : "pending";
  const query = new URLSearchParams(Object.entries({ ...f, q: qq, only: tab === "mine" ? "mine" : tab === "others" ? "others" : "", page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, v]) => v)).toString();
  const { data, error, reload } = useApi<RequestQueue>(`requests?status=${status}&${query}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const { data: org } = useApi<OrgOptions>("org");
  /* Mở từ thông báo: /requests?open=<id> (đơn có thể không thuộc bộ lọc đang xem) */
  useEffect(() => {
    if (!openId) return;
    void call<RequestItem>("GET", `requests/${openId}`).then((r) => { setExtra(r); setSel(r.id); }).catch(() => undefined).finally(() => router.replace("/requests", { scroll: false }));
  }, [openId, router]);
  /* Chiều cao hộp thư = phần còn lại của màn hình (trừ chân trang); ≤1100px xếp 1 cột, cao theo nội dung */
  useEffect(() => {
    const fit = () => {
      const el = inbox.current; if (!el) return;
      if (window.innerWidth <= 1100) { el.style.height = ""; return; }
      const foot = document.querySelector(".foot");
      el.style.height = `${Math.max(440, window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 12 - (foot instanceof HTMLElement ? foot.offsetHeight : 0))}px`;
    };
    fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, [data]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const pick = (t: Tab) => { setTab(t); setPage(1); setSel(null); setExtra(null); };
  const c = data?.counts;
  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!(f.type || f.departmentId || f.from || f.to || qq);
  const cur: RequestItem | undefined = items.find((r) => r.id === sel) ?? (extra && extra.id === sel ? extra : undefined) ?? items[0];
  const after = (r: RequestItem) => {
    const i = items.findIndex((x) => x.id === r.id);
    setSel((items[i + 1] ?? items[i - 1])?.id ?? null); setExtra(null); void reload();
  };
  const counts: Record<Tab, number | undefined> = { mine: c?.mine, others: c ? c.pending - c.mine : undefined, done: c?.done };
  /* Xuất CSV theo bộ lọc đang xem; qua route Next cùng origin */
  const exportHref = `/api/requests/export?status=${status}&${new URLSearchParams(Object.entries({ ...f, q: qq }).filter(([, v]) => v)).toString()}`;
  return (
    <section className="page active">
      <PageActions>
        <a className="btn" href={exportHref}><Icon name="download" /> Xuất CSV</a>
        {can(me, "request.read") ? <button className="btn" onClick={() => setConfig(true)}><Icon name="settings" /> Cấu hình luồng duyệt</button> : null}</PageActions>
      <LoadError error={error} retry={reload} />
      <div className="segmented" role="tablist" style={{ marginBottom: 16 }}>{TABS.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => pick(k)}>{label}{counts[k] != null ? <span className={`n ${k === "mine" && counts[k]! > 0 ? "hot" : ""}`}>{counts[k]}</span> : null}</button>
      ))}</div>
      <div className="inbox" ref={inbox}>
        <section className="card lst">
          <div className="flt">
            <div className="fr">
              <label className="search" style={{ flex: 1 }}><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn hoặc người gửi…" /></label>
              <button className={`tog ${showF ? "on" : ""}`} onClick={() => setShowF(!showF)} aria-label="Lọc" aria-pressed={showF}><Icon name="filter" /></button>
            </div>
            <div className="fr">
              <Select className="select" value={f.type} onChange={set("type")} aria-label="Loại đơn"><option value="">Mọi loại đơn</option>{(Object.keys(REQUEST_TYPE) as RequestType[]).map((t) => <option key={t} value={t}>{REQUEST_TYPE[t]}</option>)}</Select>
              <span className="small muted" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{data ? num(data.total) : "…"} đơn</span>
            </div>
            {showF ? <div className="fr" style={{ flexWrap: "wrap" }}>
              <Select className="select" value={f.departmentId} onChange={set("departmentId")} aria-label="Phòng ban"><option value="">Mọi phòng ban</option>{(org?.departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              <Select className="select" value={f.dateBy} onChange={set("dateBy")} aria-label="Lọc theo ngày"><option value="applied">Ngày áp dụng</option><option value="submitted">Ngày gửi</option></Select>
              <span className="date-range"><input type="date" value={f.from} max={f.to || undefined} onChange={set("from")} aria-label="Từ ngày" /><i>–</i><input type="date" value={f.to} min={f.from || undefined} onChange={set("to")} aria-label="Đến ngày" /></span>
              {filtered ? <button className="btn small" onClick={() => { setF(NO_FILTER); setQ(""); setPage(1); }}>Bỏ lọc</button> : null}
            </div> : null}
          </div>
          {!data && !error ? <div style={{ padding: 12 }}><SkeletonLines lines={5} /></div> : null}
          {data && !items.length ? <div className="muted" style={{ padding: 16 }}>Không có đơn.</div> : null}
          {items.map((r) => {
            const sla = slaLabel(r.dueAt);
            return (
              <button key={r.id} className={`req ${cur?.id === r.id ? "on" : ""}`} onClick={() => { setSel(r.id); setExtra(null); }}>
                <div className="rsp"><span className="rw"><Avatar name={r.requester.fullName} seed={r.requester.code} /><b style={{ fontWeight: 600 }}>{r.requester.fullName}</b></span>
                  {r.status === "pending" ? (sla[1] === "bad" ? <Status v={sla} /> : <span className="small muted">{sla[0]}</span>) : <Status v={REQUEST_STATUS[r.status]} />}</div>
                <div className="rw small" style={{ margin: "6px 0 2px" }}><TypeBadge type={r.type} /><span className="muted">{r.no}</span></div>
                <div className="sub">{vs(requestSummary(r))}</div>
              </button>
            );
          })}
          {data && data.total > data.pageSize ? <div className="rsp small muted" style={{ padding: "8px 4px 0" }}>
            <span>{num((page - 1) * data.pageSize + 1)}–{num(Math.min(page * data.pageSize, data.total))} / {num(data.total)}</span>
            <span className="rw"><button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau</button></span>
          </div> : null}
        </section>
        <section className="card det">
          {cur ? <RequestDetail key={cur.id} r={cur} onDone={after} /> : data ? <Empty title="Không còn đơn nào ở đây" text={EMPTY_TEXT[tab]} /> : null}
        </section>
      </div>
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
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>Hạn xử lý <input type="number" min={1} max={240} disabled={!manage} value={s.slaHours} onChange={(e) => set(i, { slaHours: Number(e.target.value) || 1 })} style={{ width: 64 }} /> giờ</label>
            {type === "leave" ? <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" disabled={!manage} checked={s.daysOver != null} onChange={(e) => set(i, { daysOver: e.target.checked ? 2 : null })} />Chỉ khi nghỉ trên
              <input type="number" min={0} max={30} disabled={!manage || s.daysOver == null} value={s.daysOver ?? ""} onChange={(e) => set(i, { daysOver: Number(e.target.value) || 0 })} style={{ width: 48 }} /> ngày</label>
              : type === "salary_advance" ? <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
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
      <p className="muted" style={{ fontSize: 12.5, margin: "10px 0" }}>Không có quản lý trực tiếp (hoặc người gửi chính là quản lý) thì bước Quản lý được bỏ qua; không còn bước nào thì chuyển cho Phòng Nhân sự. Không ai tự duyệt đơn của mình.{type === "leave" ? " Đơn nghỉ trước phép (số dư âm) luôn cần Phòng Nhân sự duyệt." : ""}</p>
      {manage ? <div className="form-grid">
        <Field label="Hiệu lực từ"><input type="date" min={tenantToday(me.tenant.timezone)} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Ghi chú"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div> : null}
      <ErrorLine text={err} />
      <ul className="version-list">{(wf?.versions ?? []).map((v) => <li key={v.versionNo}>v{v.versionNo}<i className="vs" />từ {fmtDate(v.effectiveFrom)}<i className="vs" />{v.steps.map((s) => `${STEP_RESOLVERS[s.resolver]} (${s.slaHours} giờ${s.daysOver != null ? `, khi nghỉ trên ${s.daysOver} ngày` : ""}${s.amountOver != null ? `, khi trên ${s.amountOver.toLocaleString("vi-VN")} ₫` : ""})`).join(" → ")}{v.note ? ` — ${v.note}` : ""}</li>)}</ul>
    </Modal>
  );
}
