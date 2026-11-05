"use client";
/* Tab Bảng lương đầu vào (thiết kế bổ sung, prototype HR chưa có): HCNS lập bảng cho Kế toán tính lương chi tiết.
   Mỗi dòng: công (kỳ công của công ty), tình trạng lao động, mức lương (tách đoạn khi đổi trong kỳ), người phụ thuộc, MST, công đoàn,
   tạm ứng đã chi, tài khoản ngân hàng. Chốt khi kỳ công đã khóa → ảnh chụp bất biến (chốt lại = bản mới); xuất Excel (CSV). */
import { useMemo, useState, type ReactNode } from "react";
import type { PayrollInputRow, PayrollInputSheet } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { EMPLOYMENT, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, fmtDate, fmtDateTime, num, useAction, useMe } from "../../_ui/kit";
import { money } from "../../_ui/request";
import { Select, SkeletonRows } from "@kavor/web-ui";

const monthLabel = (m: string) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const hours = (m: number) => (m / 60).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

export function Inputs({ tabs }: { tabs: ReactNode }) {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const qs = [month ? `month=${month}` : "", live ? "source=live" : ""].filter(Boolean).join("&");
  const { data: s, error, reload, setData } = useApi<PayrollInputSheet>(`payroll/inputs${qs ? `?${qs}` : ""}`);
  const [q, setQ] = useState("");
  const [warnOnly, setWarnOnly] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const cur = s?.month ?? month;
  const months = cur ? [1, 0, -1, -2, -3, -4, -5].map((n) => shiftMonth(cur, n)) : [];
  const rows = useMemo(() => (s?.rows ?? []).filter((r) => (!warnOnly || r.warnings.length)
    && (!q.trim() || `${r.employee.fullName} ${r.employee.code} ${r.employee.department ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [s, q, warnOnly]);
  const rates = useMemo(() => [...new Set((s?.rows ?? []).flatMap((r) => Object.keys(r.overtime)))].sort((a, b) => Number(a) - Number(b)), [s]);
  const exportHref = s ? `/api/payroll/inputs/export?month=${s.month}${s.source === "live" ? "&source=live" : ""}` : "#";
  return (
    <>
      <div className="page-head">
        <div><p>{s ? `Kỳ công ${fmtDate(s.period.start)}–${fmtDate(s.period.end)} · ${s.period.locked ? "đã khóa" : "chưa khóa"}. HCNS lập bảng, Kế toán dùng để tính lương chi tiết (BHXH, thuế, công đoàn, thực nhận).`
          : "Công, thông tin người lao động, mức lương và người phụ thuộc của từng kỳ — gửi Kế toán tính lương."}</p></div>
        <div className="head-actions">
          {tabs}
          <Select className="select" value={cur ?? ""} onChange={(e) => { setMonth(e.target.value); setLive(false); }} aria-label="Kỳ">{months.map((x) => <option key={x} value={x}>{monthLabel(x)}</option>)}</Select>
          {s ? <a className="btn" href={exportHref}><Icon name="download" /> Xuất Excel</a> : null}
          {s?.canFinalize ? <button className="btn primary" disabled={!s.period.locked} title={s.period.locked ? undefined : "Khóa kỳ công trước khi chốt"} onClick={() => setFinalizing(true)}>
            <Icon name="lock" /> {s.finalized ? "Chốt lại" : "Chốt bảng"}</button> : null}
        </div>
      </div>
      <LoadError error={error} retry={reload} />
      {s && !s.period.locked ? <div className="note-amber" style={{ marginBottom: 12 }}>Kỳ công {monthLabel(s.month).toLowerCase()} chưa khóa — số công còn thay đổi. Khóa ở <b>Chấm công → Bảng công tháng</b> rồi mới chốt bảng lương đầu vào.</div> : null}
      {s?.finalized ? (
        <div className="note-soft" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{s.source === "final" ? "Đang xem bản đã chốt" : "Đang xem dữ liệu hiện tại (chưa chốt)"} · chốt lần {s.finalized.versions} lúc {fmtDateTime(s.finalized.at, me.tenant.timezone)}{s.finalized.by ? ` bởi ${s.finalized.by}` : ""}{s.finalized.note ? ` — ${s.finalized.note}` : ""}</span>
          <button className="btn small" style={{ marginLeft: "auto" }} onClick={() => setLive(s.source === "final")}>{s.source === "final" ? "Xem dữ liệu hiện tại" : "Xem bản đã chốt"}</button>
        </div>
      ) : null}
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Nhân viên</span><strong>{s ? num(s.totals.employees) : "—"}</strong><small>Còn làm trong kỳ</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="alert" /></span><span className="metric-copy"><span>Cần rà soát</span><strong>{s ? num(s.totals.warnings) : "—"}</strong><small>Dòng có cảnh báo</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="pay" /></span><span className="metric-copy"><span>Chưa nhập lương</span><strong>{s ? num(s.totals.noSalary) : "—"}</strong><small>Nhập ở hồ sơ nhân viên</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="checks" /></span><span className="metric-copy"><span>Trạng thái</span><strong>{s ? (s.finalized ? `Đã chốt` : "Chưa chốt") : "—"}</strong><small>{s?.finalized ? `${s.finalized.versions} lần chốt` : "Kế toán chờ bản chốt"}</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên, phòng ban…" /></label>
          <button className={`filter-chip ${!warnOnly ? "active" : ""}`} onClick={() => setWarnOnly(false)}>Tất cả {s?.rows.length ?? 0}</button>
          <button className={`filter-chip ${warnOnly ? "active" : ""}`} onClick={() => setWarnOnly(true)}>Cần rà soát {s?.totals.warnings ?? 0}</button>
        </div>
        {s && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 1180 }}><thead><tr>
            <th>Nhân viên</th><th>Tình trạng</th><th>Lương cơ bản</th><th>Đóng BH</th><th>Phụ cấp</th><th>Công</th><th>Phép có lương</th><th>Không lương</th>
            {rates.map((r) => <th key={r}>OT {r}%</th>)}<th>NPT</th><th>Tạm ứng</th><th>Cần rà soát</th>
          </tr></thead><tbody>
            {!s && !error ? <SkeletonRows cols={11} rows={8} person /> : null}
            {rows.map((r) => <Row key={r.employee.id} r={r} rates={rates} />)}
          </tbody></table></div>
        )}
      </article>
      {finalizing && s ? <FinalizeModal s={s} onClose={() => setFinalizing(false)} onDone={(x) => { setLive(false); setData(x); }} /> : null}
    </>
  );
}

function Row({ r, rates }: { r: PayrollInputRow; rates: string[] }) {
  return (
    <tr>
      <td><Person name={r.employee.fullName} seed={r.employee.code} sub={[r.employee.code, r.employee.department].filter(Boolean).join(" · ")} /></td>
      <td>{EMPLOYMENT[r.employmentType]}</td>
      <td className="num">{r.baseSalary !== null ? <b>{money(r.baseSalary)}</b> : <span className="text-red">Chưa nhập</span>}
        {r.segments.length > 1 ? r.segments.map((g) => <div key={g.from} className="muted nowrap" style={{ fontSize: 10.5 }}>
          {fmtDate(g.from).slice(0, 5)}–{fmtDate(g.to).slice(0, 5)}: {g.baseSalary !== null ? money(g.baseSalary) : "—"} · {EMPLOYMENT[g.employmentType]} · {num(g.credited)} công</div>) : null}</td>
      <td className="num">{r.insuranceSalary !== null ? money(r.insuranceSalary) : <span className="muted">= lương CB</span>}</td>
      <td className="num">{r.allowance ? money(r.allowance) : "—"}</td>
      <td className="num">{num(r.credited)}/{num(r.standard)}</td>
      <td className="num">{num(r.paidLeaveDays)}</td>
      <td className="num">{num(r.unpaidLeaveDays)}</td>
      {rates.map((x) => <td key={x} className="num">{r.overtime[x] ? `${hours(r.overtime[x]!)} giờ` : "—"}</td>)}
      <td className="num">{num(r.dependents)}</td>
      <td className="num">{r.advance ? money(r.advance) : "—"}</td>
      <td style={{ whiteSpace: "normal", fontSize: 11, minWidth: 160 }}>{r.warnings.length ? r.warnings.map((w) => <div key={w}><Status v={[w, "warn"]} /></div>) : <span className="text-green">Đủ</span>}</td>
    </tr>
  );
}

function FinalizeModal({ s, onClose, onDone }: { s: PayrollInputSheet; onClose: () => void; onDone: (x: PayrollInputSheet) => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function go() {
    setErr(null);
    await run("final", async () => { onDone(await call<PayrollInputSheet>("POST", `payroll/inputs/${s.month}/finalize`, { note: note.trim() || null })); onClose(); }, "Đã chốt bảng lương đầu vào");
  }
  return (
    <Modal title={`${s.finalized ? "Chốt lại" : "Chốt"} bảng lương đầu vào ${monthLabel(s.month).toLowerCase()}?`}
      sub="Chụp lại công, mức lương, người phụ thuộc, tạm ứng của toàn công ty tại thời điểm này. Bản chốt không sửa được; dữ liệu đổi sau đó cần chốt lại (bản cũ vẫn lưu)." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void go()}>{busy ? "Đang chốt…" : "Chốt bảng"}</button></>}>
      {s.totals.warnings ? <div className="note-amber" style={{ marginBottom: 12 }}>Còn {num(s.totals.warnings)} dòng cần rà soát ({num(s.totals.noSalary)} chưa nhập lương). Vẫn chốt được; Kế toán sẽ thấy cảnh báo.</div> : null}
      <Field label="Ghi chú cho Kế toán" full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đã đối soát công với các trưởng phòng" /></Field>
      <ErrorLine text={err} />
    </Modal>
  );
}
