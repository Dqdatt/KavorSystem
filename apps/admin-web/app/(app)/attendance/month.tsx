"use client";
/* Bảng công tháng: bám PAGES['cham-cong'] tab month của Kavor HR Admin Prototype v2.html (lưới ngày × người, chú giải, hộp "Khóa kỳ công"
   có danh sách điều kiện, chi tiết từng ngày). Mở lại kỳ là thiết kế bổ sung. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminDevice, EmployeeTimesheet, RequestItem, TimesheetBoard, TimesheetDay } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { vs, Drawer, Empty, Field, Icon, LoadError, Modal, Person, Status, dur, fmtDate, fmtDateTime, num, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { REQUEST_STATUS, RequestModal, requestSummary } from "../../_ui/request";
import { Select, SkeletonLines, SkeletonRows } from "@kavor/web-ui";

const ISSUE: Record<string, [string, string]> = {
  missing_in: ["Thiếu vào", "bad"], missing_out: ["Thiếu ra", "bad"], absent: ["Vắng", "bad"], late: ["Đi muộn", "warn"], early: ["Về sớm", "warn"], late_early: ["Muộn, về sớm", "warn"],
};
/* Các ngày start..end (YYYY-MM-DD) kèm thứ ISO 1–7; chỉ cộng ngày trên lịch, không phụ thuộc múi giờ máy */
function gridDates(start: string, end: string) {
  const out: Array<{ date: string; weekday: number }> = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`) && out.length < 62; t += 86400_000) { const d = new Date(t); out.push({ date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() || 7 }); }
  return out;
}
const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
/* "2026-10" → "Tháng 10/2026"; danh sách 6 kỳ gần nhất để chọn */
const monthLabel = (m: string) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export function MonthTab({ setAction }: { setAction: (n: ReactNode) => void }) {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const { data: b, error, reload, setData } = useApi<TimesheetBoard>(`timesheets${month ? `?month=${month}` : ""}`, { tables: ["attendance_events", "requests", "approval_tasks"], tenantId: me.tenant.id });
  const [filter, setFilter] = useState<"all" | "short" | "late">("all");
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
  const rows = useMemo(() => (b?.rows ?? []).filter((r) => filter === "all" || (filter === "short" ? r.status === "short" : r.summary.lateDays > 0)), [b, filter]);
  const m = b?.metrics;
  const months = cur ? [0, -1, -2, -3, -4, -5].map((n) => shiftMonth(cur, n)) : [];
  const today = tenantToday(me.tenant.timezone);
  /* Các ngày của kỳ (đủ cho cả khi chưa có nhân viên nào) */
  const dates = b ? gridDates(b.period.start, b.period.end) : [];
  const all = b?.rows ?? [];
  const credited = all.reduce((n, r) => n + r.summary.credited, 0), standard = all.reduce((n, r) => n + r.summary.standard, 0);
  const leaveDays = all.reduce((n, r) => n + r.summary.leaveDays, 0);
  return (
    <>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics sm">
        <article className="card metric-card"><span className="metric-icon"><Icon name="clock" /></span><span className="metric-copy"><span>Công đã ghi nhận</span><strong>{b ? num(credited) : "—"}<small> ngày công</small></strong><small>{b && standard ? vs(`${Math.round((credited / standard) * 100)}% công chuẩn | ${num(all.length)} người`) : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Đi muộn</span><strong className={m?.lateTimes ? "tone-warn" : ""}>{m ? num(m.lateTimes) : "—"}<small> lượt</small></strong><small>{m ? `${num(m.lateEmployees)} nhân viên` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Thiếu công</span><strong className={m?.unexplained ? "tone-danger" : ""}>{m ? num(m.unexplained) : "—"}<small> ngày</small></strong><small>{m ? `${num(m.short)} nhân viên chưa giải trình` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="calendar" /></span><span className="metric-copy"><span>Nghỉ phép</span><strong>{b ? num(leaveDays) : "—"}<small> ngày</small></strong><small>Đã duyệt trong kỳ</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <div className="segmented">{([["all", "Tất cả"], ["short", "Có thiếu công"], ["late", "Có đi muộn"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
          <span className="toolbar-spacer" />
          <div className="legend">{([["ok", "Đủ công"], ["late", "Đi muộn"], ["miss", "Thiếu công"], ["leave", "Nghỉ phép"], ["exp", "Đã giải trình"]] as const).map(([k, l]) => <span key={k}><i className={`cell ${k}`} />{l}</span>)}</div>
          <Select className="select" value={cur ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Kỳ công">{months.map((x) => <option key={x} value={x}>{monthLabel(x)}</option>)}</Select>
        </div>
        {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="mx"><thead><tr><th className="n">Nhân viên</th>
            {dates.map((d) => <th key={d.date} className={`${d.weekday >= 6 ? "we" : ""} ${d.date === today ? "today" : ""}`}>{d.date.slice(8)}<br /><span style={{ fontWeight: 400 }}>{WD[d.weekday]}</span></th>)}
            <th className="s">Công / Thiếu</th></tr></thead><tbody>
            {!b && !error ? <SkeletonRows cols={3} rows={8} person /> : null}
            {rows.map((r) => (
              <tr key={r.employee.id} onClick={() => setOpen(r.employee.id)}>
                <td className="n"><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.department ?? r.employee.code} /></td>
                {r.cells.map((c) => <td key={c.date}><i className={`cell ${c.s === "off" ? "we" : c.s}${c.date === today ? " today" : ""}`} title={fmtDate(c.date).slice(0, 5)} /></td>)}
                <td className="s"><b>{num(r.summary.credited)}</b><span className="muted">/{num(r.summary.standard)}</span>{r.summary.missingDays ? <><i className="vs" /><b className="text-red">{num(r.summary.missingDays)}</b></> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <div className="tfoot"><span>Bấm vào một dòng để xem từng ngày và giải trình</span><span>Ô có viền xanh là hôm nay</span></div>
      </article>
      {open && b ? <EmployeeMonth id={open} month={b.period.month} onClose={() => setOpen(null)} onChanged={() => void reload()} /> : null}
      {locking && b ? <LockModal b={b} onClose={() => setLocking(false)} onDone={setData} onShowMissing={() => { setFilter("short"); setLocking(false); }} /> : null}
      {unlocking && b ? <ReasonModal title={`Mở lại kỳ công ${monthLabel(b.period.month)}?`} label="Lý do mở lại" ok="Đã mở lại kỳ công — nhân viên gửi được giải trình trong hạn"
        go={(reason) => call<TimesheetBoard>("POST", "timesheets/unlock", { month: b.period.month, reason }).then(setData)} onClose={() => setUnlocking(false)} onDone={() => {}} /> : null}
    </>
  );
}

/* Điều kiện khóa kỳ: kỳ đã kết thúc, hết ngày thiếu công, hết giải trình chờ duyệt, hết thiết bị chờ duyệt (OT chờ duyệt: cần API) */
function LockModal({ b, onClose, onDone, onShowMissing }: { b: TimesheetBoard; onClose: () => void; onDone: (b: TimesheetBoard) => void; onShowMissing: () => void }) {
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const router = useRouter();
  const m = b.metrics;
  const me = useMe();
  const { data: devs } = useApi<AdminDevice[]>("devices?status=pending", { tables: ["employee_devices"], tenantId: me.tenant.id });
  /* Theo ngày giờ công ty (không theo UTC của trình duyệt) */
  const today = tenantToday(me.tenant.timezone);
  const ended = b.period.end < today;
  const missEmps = b.rows.filter((r) => r.summary.missingDays > 0).length;
  const pend = devs?.length ?? null;
  const ok = ended && !m.unexplained && !m.pendingRequests && pend === 0;
  const Pt = ({ s }: { s: "done" | "now" | "bad" }) => <span className={`pt ${s}`}>{s === "done" ? <Icon name="check" size={12} /> : s === "bad" ? <Icon name="x" size={12} /> : null}</span>;
  return (
    <Modal title={`Khóa kỳ công ${monthLabel(b.period.month).toLowerCase()}?`} sub="Sau khi khóa, bảng công không sửa được và chuyển sang bước tính lương." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button><button className={`btn ${ok ? "primary" : "danger"}`} disabled={!!busy || !ended} onClick={() => run("lock", async () => { onDone(await call<TimesheetBoard>("POST", "timesheets/lock", { month: b.period.month, reason: note || null })); onClose(); }, "Kỳ công đã khóa")}><Icon name="lock" />{busy ? "Đang khóa…" : ok ? "Khóa kỳ công" : "Vẫn khóa kỳ"}</button></>}>
      <div className="tl lock-list">
        <div><Pt s={ended ? "done" : "now"} /><div><b>Kỳ đã kết thúc</b><p>Kỳ {fmtDate(b.period.start).slice(0, 5)} – {fmtDate(b.period.end).slice(0, 5)}.{ended ? "" : ` Hôm nay mới ${fmtDate(today).slice(0, 5)}, bạn chỉ khóa được sau ngày ${fmtDate(b.period.end).slice(0, 5)}.`}</p></div></div>
        <div><Pt s={m.unexplained ? "bad" : "done"} /><div><b>Không còn ngày thiếu công chưa giải trình</b>{m.unexplained ? <><p>Còn {num(m.unexplained)} ngày của {num(missEmps)} nhân viên.</p><button className="btn small" onClick={onShowMissing}>Xem các ngày thiếu</button></> : null}</div></div>
        <div><Pt s={m.pendingRequests ? "now" : "done"} /><div><b>Không còn đơn giải trình chờ duyệt</b>{m.pendingRequests ? <><p>Còn {num(m.pendingRequests)} đơn.</p><button className="btn small" onClick={() => router.push("/requests")}>Mở hộp duyệt</button></> : null}</div></div>
        <div><Pt s={pend ? "now" : pend === 0 ? "done" : "now"} /><div><b>Không có thiết bị chờ duyệt</b>{pend ? <><p>Còn {num(pend)} thiết bị.</p><button className="btn small" onClick={() => router.push("/attendance?tab=devices")}>Xem thiết bị</button></> : null}</div></div>
      </div>
      <Field label="Ghi chú khóa kỳ" full><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đã đối soát với quản lý các phòng ban" /></Field>
    </Modal>
  );
}

export function EmployeeMonth({ id, month, onClose, onChanged }: { id: string; month?: string; onClose: () => void; onChanged: () => void }) {
  const me = useMe();
  const { data: e, error, reload } = useApi<EmployeeTimesheet>(`timesheets/${id}${month ? `?month=${month}` : ""}`);
  const [req, setReq] = useState<RequestItem | null>(null);
  const tz = me.tenant.timezone;
  const missing = (e?.days ?? []).filter((d) => (d.issue === "missing_in" || d.issue === "missing_out" || d.issue === "absent") && (!d.request || d.request.status === "rejected" || d.request.status === "cancelled"));
  const days = (e?.days ?? []).filter((d) => d.kind !== "future" && d.kind !== "not_employed").slice().reverse();
  return (
    <Drawer onClose={onClose} head={<div><b>{e?.employee.fullName ?? "…"}</b><div className="muted" style={{ fontSize: 12 }}>{e ? vs(`${e.employee.code}${e.employee.department ? ` | ${e.employee.department}` : ""} | ${monthLabel(e.period.month)}`) : ""}</div></div>}>
      <LoadError error={error} retry={reload} />
      {e ? <>
        <div className="params">
          <div className="param"><b>{num(e.summary.credited)}/{num(e.summary.standard)}</b><span>Ngày công</span></div>
          <div className="param"><b style={e.summary.lateDays ? { color: "var(--amber)" } : undefined}>{num(e.summary.lateDays)}</b><span>Lần đi muộn{e.summary.lateMinutes ? ` · ${dur(e.summary.lateMinutes)}` : ""}</span></div>
          <div className="param"><b className={e.summary.missingDays ? "text-red" : ""}>{num(e.summary.missingDays)}</b><span>Thiếu công chưa giải trình</span></div>
        </div>
        {e.summary.overtimeApprovedMinutes ? <div className="card card-body" style={{ marginTop: 10, fontSize: 12 }}>
          Làm thêm được tính <b className={e.summary.overtimeShortDays ? "text-red" : ""}>{hrs(e.summary.overtimeMinutes)}/{hrs(e.summary.overtimeApprovedMinutes)} giờ</b> đã duyệt
          {e.summary.overtimeShortDays ? <b className="text-red"> · {num(e.summary.overtimeShortDays)} ngày giờ chấm công không phủ hết giờ làm thêm</b> : null}
          <div className="muted" style={{ fontSize: 12 }}>Chỉ tính phần trùng với giờ vào → ra đã ghi nhận; ngày chưa qua chưa tính.</div>
        </div> : null}
        <div className="drawer-section"><h4>Ngày cần xử lý</h4>
          {missing.length ? <div className="card detail-list">{missing.map((d) => (
            <div key={d.date} className="detail-row"><span><b>{WD[d.weekday]} {fmtDate(d.date).slice(0, 5)}</b><small style={{ display: "block" }}>{ISSUE[d.issue!]?.[0]}</small></span><b><Status v={["Chưa giải trình", "bad"]} /></b></div>
          ))}</div> : <p className="muted" style={{ fontSize: 13 }}>Không có ngày thiếu công. Bảng công của {e.employee.fullName} sẵn sàng để khóa kỳ.</p>}
        </div>
        <div className="drawer-section"><h4>Từng ngày</h4>
          <div className="card"><div className="table-wrap"><table className="data-table compact"><thead><tr><th>Ngày</th><th>Vào</th><th>Ra</th><th>Giờ làm</th><th>Ghi chú</th></tr></thead><tbody>
            {days.map((d) => <DayRow key={d.date} d={d} onRequest={() => { const r = e.requests.find((x) => x.id === d.request?.id); if (r) setReq(r); }} />)}
          </tbody></table></div></div>
        </div>
        <div className="drawer-section"><h4>Giải trình trong kỳ</h4>
          {e.requests.length ? <div className="card detail-list">{e.requests.map((r) => (
            <div key={r.id} className="detail-row clickable" style={{ cursor: "pointer" }} onClick={() => setReq(r)}><span>{r.no} · {vs(requestSummary(r))}<small style={{ display: "block" }}>{fmtDateTime(r.submittedAt, tz)}</small></span><b><Status v={REQUEST_STATUS[r.status]} /></b></div>
          ))}</div> : <p className="muted" style={{ fontSize: 12 }}>Chưa có giải trình nào.</p>}
        </div>
      </> : (error ? null : <SkeletonLines lines={6} avatar />)}
      {e ? <div className="drawer-section"><Link className="btn" href={`/employees/${id}`}>Mở hồ sơ</Link></div> : null}
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
      <td>{note}{d.overtime ? <OtTag ot={d.overtime} /> : null}</td>
    </tr>
  );
}

const hrs = (min: number) => (Math.round(min / 6) / 10).toLocaleString("vi-VN");
/* OT của ngày: được tính/đã duyệt; thiếu thì tô cảnh báo */
function OtTag({ ot }: { ot: NonNullable<TimesheetDay["overtime"]> }) {
  const short = ot.checked && ot.minutes < ot.approvedMinutes;
  const text = !ot.checked ? `OT ${hrs(ot.approvedMinutes)} giờ đã duyệt` : short ? `OT ${hrs(ot.minutes)}/${hrs(ot.approvedMinutes)} giờ` : `OT ${hrs(ot.minutes)} giờ`;
  return <span className={`source-tag${short ? " text-red" : ""}`} title={`${ot.requestNos.join(", ")}${short ? " · giờ chấm công không phủ hết giờ đã duyệt" : !ot.checked ? " · chưa đối chiếu chấm công" : ""}`}>{text} · {ot.ratePercent}%</span>;
}
