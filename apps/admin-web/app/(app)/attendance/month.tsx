"use client";
/* Bảng công tháng: bám page-attendance của Kavor HR Admin Prototype.html (chỉ số, bảng theo nhân viên, Xuất Excel,
   modal "Khóa kỳ công"). Drawer chi tiết từng ngày + mở lại kỳ là thiết kế bổ sung. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { EmployeeTimesheet, RequestItem, TimesheetBoard, TimesheetDay, TimesheetRow } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Drawer, Empty, Field, Icon, LoadError, Modal, Person, Status, dur, fmtDate, fmtDateTime, num, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { REQUEST_STATUS, RequestModal, requestSummary } from "../../_ui/request";
import { Select, SkeletonLines, SkeletonRows } from "@kavor/web-ui";

const ROW: Record<TimesheetRow["status"], [string, string]> = { ok: ["Đủ dữ liệu", ""], needs_action: ["Cần xử lý", "warn"], short: ["Thiếu công", "bad"] };
const ISSUE: Record<string, [string, string]> = {
  missing_in: ["Thiếu vào", "bad"], missing_out: ["Thiếu ra", "bad"], absent: ["Vắng", "bad"], late: ["Đi muộn", "warn"], early: ["Về sớm", "warn"], late_early: ["Muộn, về sớm", "warn"],
};
const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
/* "2026-10" → "Tháng 10/2026"; danh sách 6 kỳ gần nhất để chọn */
const monthLabel = (m: string) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export function MonthTab({ setAction }: { setAction: (n: ReactNode) => void }) {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const { data: b, error, reload, setData } = useApi<TimesheetBoard>(`timesheets${month ? `?month=${month}` : ""}`, { tables: ["attendance_events", "requests", "approval_tasks"], tenantId: me.tenant.id });
  const [filter, setFilter] = useState<"all" | "short" | "late">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const cur = b?.period.month ?? month;
  useEffect(() => {
    if (!b) return;
    setAction(<>
      <a className="btn" href={`/api/timesheets/export?month=${b.period.month}`}><Icon name="download" /> Xuất Excel</a>
      {b.period.locked ? (b.canUnlock ? <button className="btn" onClick={() => setUnlocking(true)}><Icon name="lock" /> Mở lại kỳ công</button> : null)
        : b.canLock ? <button className="btn primary" onClick={() => setLocking(true)}><Icon name="lock" /> Khóa kỳ công</button> : null}
    </>);
    return () => setAction(null);
  }, [b, setAction]);
  const rows = useMemo(() => (b?.rows ?? []).filter((r) => (filter === "all" || (filter === "short" ? r.status === "short" : r.summary.lateDays > 0))
    && (!q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()))), [b, filter, q]);
  const m = b?.metrics;
  const months = cur ? [0, -1, -2, -3, -4, -5].map((n) => shiftMonth(cur === b?.period.month && !month ? cur : cur, n)) : [];
  return (
    <>
      <LoadError error={error} retry={reload} />
      {b ? <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 12 }}>Kỳ {fmtDate(b.period.start)}–{fmtDate(b.period.end)} · {b.period.locked && b.lock ? `đã khóa ${fmtDateTime(b.lock.lockedAt, b.timezone)}${b.lock.lockedBy ? ` bởi ${b.lock.lockedBy}` : ""}` : "chưa khóa"}</p> : null}
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Đủ công</span><strong>{m ? num(m.full) : "—"}</strong><small>{m && m.employees ? `${((m.full / m.employees) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% nhân sự` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Thiếu công</span><strong>{m ? num(m.short) : "—"}</strong><small>{m ? `${num(m.unexplained)} ngày chưa giải trình` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Đi muộn</span><strong>{m ? num(m.lateEmployees) : "—"}</strong><small>{m ? `${num(m.lateTimes)} lượt trong kỳ` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="checks" /></span><span className="metric-copy"><span>Chờ điều chỉnh</span><strong>{m ? num(m.pendingRequests) : "—"}</strong><small>Giải trình chờ duyệt</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" /></label>
          <button className={`filter-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Tất cả {b?.rows.length ?? 0}</button>
          <button className={`filter-chip ${filter === "short" ? "active" : ""}`} onClick={() => setFilter("short")}>Thiếu công {m?.short ?? 0}</button>
          <button className={`filter-chip ${filter === "late" ? "active" : ""}`} onClick={() => setFilter("late")}>Đi muộn {m?.lateEmployees ?? 0}</button>
          <span className="toolbar-spacer" />
          <Select className="select" value={cur ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Kỳ công">{months.map((x) => <option key={x} value={x}>{monthLabel(x)}</option>)}</Select>
        </div>
        {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 960 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Ngày công</th><th>Đi muộn</th><th>Thiếu bản ghi</th><th>Giải trình chờ</th><th>Trạng thái kỳ</th><th /></tr></thead><tbody>
            {!b && !error ? <SkeletonRows cols={8} rows={8} person /> : null}
            {rows.map((r) => (
              <tr key={r.employee.id} className="clickable" onClick={() => setOpen(r.employee.id)}>
                <td><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.code} /></td>
                <td>{r.employee.department ?? "—"}</td>
                <td className="num">{num(r.summary.credited)}/{num(r.summary.standard)}</td>
                <td className="num">{num(r.summary.lateDays)}</td>
                <td className={`num ${r.summary.missingDays ? "text-red" : ""}`}>{num(r.summary.missingDays)}</td>
                <td className="num">{num(r.summary.pendingRequests)}</td>
                <td><Status v={ROW[r.status]} /></td>
                <td><button className="btn small" onClick={(e) => { e.stopPropagation(); setOpen(r.employee.id); }}>Chi tiết</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {open && b ? <EmployeeMonth id={open} month={b.period.month} onClose={() => setOpen(null)} onChanged={() => void reload()} /> : null}
      {locking && b ? <LockModal b={b} onClose={() => setLocking(false)} onDone={setData} /> : null}
      {unlocking && b ? <ReasonModal title={`Mở lại kỳ công ${monthLabel(b.period.month)}?`} label="Lý do mở lại" ok="Đã mở lại kỳ công — nhân viên gửi được giải trình trong hạn"
        go={(reason) => call<TimesheetBoard>("POST", "timesheets/unlock", { month: b.period.month, reason }).then(setData)} onClose={() => setUnlocking(false)} onDone={() => {}} /> : null}
    </>
  );
}

function LockModal({ b, onClose, onDone }: { b: TimesheetBoard; onClose: () => void; onDone: (b: TimesheetBoard) => void }) {
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const m = b.metrics;
  const me = useMe();
  /* Theo ngày giờ công ty (không theo UTC của trình duyệt) */
  const ended = b.period.end < tenantToday(me.tenant.timezone);
  return (
    <Modal title={`Khóa kỳ công ${monthLabel(b.period.month).toLowerCase()}?`} sub="Nhân viên và quản lý sẽ không thể gửi thêm điều chỉnh." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Để sau</button><button className="btn danger" disabled={!!busy} onClick={() => run("lock", async () => { onDone(await call<TimesheetBoard>("POST", "timesheets/lock", { month: b.period.month, reason: note || null })); onClose(); }, "Kỳ công đã khóa")}>{busy ? "Đang khóa…" : "Vẫn khóa kỳ"}</button></>}>
      {m.unexplained || m.pendingRequests ? (
        <div className="notification"><span className="metric-icon red"><Icon name="alert" /></span><span className="notification-copy"><b>Còn {num(m.unexplained)} ngày thiếu công và {num(m.pendingRequests)} giải trình chờ duyệt</b><span>Bạn nên xử lý trước khi khóa kỳ.</span></span></div>
      ) : null}
      {!ended ? <p className="text-red" style={{ fontSize: 12 }}>Kỳ công chưa kết thúc (tới {fmtDate(b.period.end)}): chỉ khóa được sau ngày cuối kỳ.</p> : null}
      <Field label="Ghi chú khóa kỳ" full><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đã đối soát với quản lý các phòng ban" /></Field>
    </Modal>
  );
}

function EmployeeMonth({ id, month, onClose, onChanged }: { id: string; month: string; onClose: () => void; onChanged: () => void }) {
  const me = useMe();
  const { data: e, error, reload } = useApi<EmployeeTimesheet>(`timesheets/${id}?month=${month}`);
  const [req, setReq] = useState<RequestItem | null>(null);
  const tz = me.tenant.timezone;
  const days = (e?.days ?? []).filter((d) => d.kind !== "future" && d.kind !== "not_employed").slice().reverse();
  return (
    <Drawer onClose={onClose} head={<div><b>{e?.employee.fullName ?? "…"}</b><div className="muted" style={{ fontSize: 10 }}>{e ? `${e.employee.code} · ${monthLabel(month)}` : ""}</div></div>}>
      <LoadError error={error} retry={reload} />
      {e ? <>
        <div className="grid three" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="card card-body"><b>{num(e.summary.credited)}/{num(e.summary.standard)}</b><div className="muted" style={{ fontSize: 10 }}>Ngày công</div></div>
          <div className="card card-body"><b>{num(e.summary.lateDays)} · {dur(e.summary.lateMinutes)}</b><div className="muted" style={{ fontSize: 10 }}>Đi muộn</div></div>
          <div className="card card-body"><b className={e.summary.missingDays ? "text-red" : ""}>{num(e.summary.missingDays)}</b><div className="muted" style={{ fontSize: 10 }}>Thiếu chưa giải trình</div></div>
        </div>
        <div className="drawer-section"><h4>Từng ngày</h4>
          <div className="card"><div className="table-wrap"><table className="data-table compact"><thead><tr><th>Ngày</th><th>Vào</th><th>Ra</th><th>Giờ làm</th><th>Ghi chú</th></tr></thead><tbody>
            {days.map((d) => <DayRow key={d.date} d={d} onRequest={() => { const r = e.requests.find((x) => x.id === d.request?.id); if (r) setReq(r); }} />)}
          </tbody></table></div></div>
        </div>
        <div className="drawer-section"><h4>Giải trình trong kỳ</h4>
          {e.requests.length ? <div className="card detail-list">{e.requests.map((r) => (
            <div key={r.id} className="detail-row clickable" style={{ cursor: "pointer" }} onClick={() => setReq(r)}><span>{r.no} · {requestSummary(r)}<small style={{ display: "block" }}>{fmtDateTime(r.submittedAt, tz)}</small></span><b><Status v={REQUEST_STATUS[r.status]} /></b></div>
          ))}</div> : <p className="muted" style={{ fontSize: 12 }}>Chưa có giải trình nào.</p>}
        </div>
      </> : (error ? null : <SkeletonLines lines={6} avatar />)}
      {req ? <RequestModal r={req} onClose={() => setReq(null)} onDone={() => { void reload(); onChanged(); }} /> : null}
    </Drawer>
  );
}

function DayRow({ d, onRequest }: { d: TimesheetDay; onRequest: () => void }) {
  const t = (v: string | null, raw: string | null) => v ? <>{v}{d.adjusted && v !== raw ? <span className="source-tag" title={`Chấm công gốc: ${raw ?? "--:--"}`}>điều chỉnh</span> : null}</> : <span className="muted">--:--</span>;
  const note = d.kind === "holiday" ? <Status v={[d.holidayName ?? "Ngày lễ", "info"]} /> : d.kind === "off" ? <span className="muted">Ngày nghỉ</span>
    : d.leave && !d.issue ? <Status v={[`${d.leave.typeName}${d.leave.half === "am" ? " · sáng" : d.leave.half === "pm" ? " · chiều" : ""} · ${d.leave.requestNo}`, "info"]} />
    : d.request ? <button className="btn small" title={REQUEST_STATUS[d.request.status][0]} onClick={onRequest}>{d.request.no}{d.request.status === "pending" ? " · chờ" : ""}</button>
    : d.issue ? <Status v={ISSUE[d.issue] ?? [d.issue, "warn"]} /> : d.kind === "today" ? <span className="muted">Hôm nay</span> : null;
  return (
    <tr style={d.kind === "off" || d.kind === "holiday" || d.kind === "leave" ? { opacity: 0.6 } : undefined}>
      <td className="nowrap"><b>{fmtDate(d.date).slice(0, 5)}</b> <span className="muted">{WD[d.weekday]}</span></td>
      <td>{d.kind === "off" && !d.clockIn ? "" : t(d.clockIn, d.rawIn)}{d.lateMinutes ? <small className="text-red"> +{d.lateMinutes}′</small> : null}</td>
      <td>{d.kind === "off" && !d.clockOut ? "" : t(d.clockOut, d.rawOut)}{d.earlyMinutes ? <small className="text-red"> −{d.earlyMinutes}′</small> : null}</td>
      <td className="num">{d.workedMinutes ? `${Math.floor(d.workedMinutes / 60)}:${String(d.workedMinutes % 60).padStart(2, "0")}` : "—"}</td>
      <td>{note}{d.overtime ? <span className="source-tag" title={d.overtime.requestNos.join(", ")}>OT {(d.overtime.minutes / 60).toLocaleString("vi-VN")} giờ · {d.overtime.ratePercent}%</span> : null}</td>
    </tr>
  );
}
