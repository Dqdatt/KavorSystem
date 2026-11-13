"use client";
/* Nghỉ phép (prototype v2 PAGES['nghi-phep']): tab Tổng quan · Lịch nghỉ · Số dư phép. Lịch nghỉ đọc từ GET admin/leave/calendar?month=
   (leave_days của đơn đã duyệt + đang chờ, trong phạm vi quyền xem phép); số dư từ GET admin/leave. Quy định phép năm sửa ở Cài đặt → Quy định. */
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LEAVE_TX_KINDS, type EmployeeLeave, type LeaveBalance, type LeaveBoard, type LeaveMonth, type LeaveMonthEntry, type RequestItem } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { PageActions, Avatar, Drawer, Empty, ErrorLine, Field, Icon, LoadError, Person, Status, fmtDate, fmtDateTime, tenantToday, useAction, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, RequestModal, requestSummary } from "../../_ui/request";
import { Select, SkeletonLines, SkeletonRows, Hint } from "@kavor/web-ui";

type Tab = "ov" | "cal" | "bal";
const d1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? "+" : ""}${d1(n)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WD_LONG = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const dowOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; /* 0 = T2 */
const daysIn = (mo: string) => new Date(Date.UTC(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0)).getUTCDate();
const leadOf = (mo: string) => dowOf(`${mo}-01`);
const shiftMo = (mo: string, by: number) => { const d = new Date(Date.UTC(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)) - 1 + by, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const given = (n: string) => n.trim().split(/\s+/).pop()!;
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/* Người nghỉ trong một ngày (gộp buổi sáng + chiều của cùng người): a = đã duyệt, p = chờ duyệt, past = đã qua */
type DayPerson = { e: LeaveMonthEntry["employee"]; st: "a" | "p" | "past"; typeName: string; requestId: string };
function byDay(entries: LeaveMonthEntry[], today: string, dept: string) {
  const out = new Map<string, DayPerson[]>();
  for (const x of entries) {
    if (dept && x.employee.department !== dept) continue;
    const list = out.get(x.date) ?? [];
    const st = x.status === "pending" ? "p" : x.date < today ? "past" : "a";
    const at = list.findIndex((p) => p.e.id === x.employee.id);
    if (at < 0) list.push({ e: x.employee, st, typeName: x.typeName, requestId: x.requestId });
    else if (list[at]!.st === "p" && st !== "p") list[at] = { ...list[at]!, st };
    out.set(x.date, list);
  }
  return out;
}

/* Lượt nghỉ = các ngày của cùng một đơn trong tháng */
type Range = { requestId: string; no: string; e: LeaveMonthEntry["employee"]; from: string; to: string; n: number; typeName: string; reason: string | null; state: "pend" | "past" | "now" | "soon" };
function rangesOf(entries: LeaveMonthEntry[], today: string): Range[] {
  const m = new Map<string, Range>();
  for (const x of entries) {
    const r = m.get(x.requestNo);
    if (r) { r.from = x.date < r.from ? x.date : r.from; r.to = x.date > r.to ? x.date : r.to; r.n += x.portion; }
    else m.set(x.requestNo, { requestId: x.requestId, no: x.requestNo, e: x.employee, from: x.date, to: x.date, n: x.portion, typeName: x.typeName, reason: x.reason, state: "soon" });
    if (x.status === "pending") m.get(x.requestNo)!.state = "pend";
  }
  return [...m.values()].map((r) => ({ ...r, state: r.state === "pend" ? "pend" as const : r.to < today ? "past" as const : r.from <= today ? "now" as const : "soon" as const })).sort((a, b) => a.from.localeCompare(b.from));
}
const RSTAT: Record<Range["state"], [string, string]> = { pend: ["Chờ duyệt", "warn"], past: ["Đã nghỉ", "muted"], now: ["Đang nghỉ", ""], soon: ["Đã duyệt", ""] };
const PER = 8;

function LeavePage() {
  const me = useMe();
  const router = useRouter();
  const tab = (useSearchParams().get("tab") as Tab | null) ?? "ov";
  const today = tenantToday(me.tenant.timezone);
  const cur = today.slice(0, 7);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [mo, setMo] = useState(cur);
  const [day, setDay] = useState(today);
  const [dept, setDept] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const live = { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id };
  const board = useApi<LeaveBoard>(`leave?year=${year}`, live);
  const cal = useApi<LeaveMonth>(`leave/calendar?month=${mo}`, live);
  const b = board.data, m = b?.metrics;
  const curCal = useApi<LeaveMonth>(`leave/calendar?month=${cur}`, live);
  const entries = cal.data?.month === mo ? cal.data.entries : null;
  const curEntries = curCal.data?.month === cur ? curCal.data.entries : null;
  const days = useMemo(() => byDay(entries ?? [], today, dept), [entries, today, dept]);
  const curDays = useMemo(() => byDay(curEntries ?? [], today, ""), [curEntries, today]);
  const go = (t: Tab) => { setMo(cur); setDay(today); router.replace(`/leave?tab=${t}`, { scroll: false }); };
  const pick = (d: string) => setDay(d);
  const tabs: Array<[Tab, string, number | undefined]> = [["ov", "Tổng quan", undefined], ["cal", "Lịch nghỉ", undefined], ["bal", "Số dư phép", b?.rows.length]];
  return (
    <section className="page active">
      <PageActions><Link className="btn" href="/settings?tab=rules"><Icon name="settings" /> Quy định phép năm</Link></PageActions>
      <div className="page-head"><div><div className="segmented" role="tablist">{tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => go(k)}>{l}{n != null ? <span className="n">{n}</span> : null}</button>)}</div></div></div>
      <LoadError error={board.error ?? cal.error ?? curCal.error} retry={() => { void board.reload(); void cal.reload(); void curCal.reload(); }} />
      <Tiles b={b} loaded={!!curEntries} now={(curDays.get(today) ?? []).filter((p) => p.st !== "p")} />
      {tab === "ov" ? <Overview b={b} entries={curEntries} days={curDays} mo={cur} today={today} day={day} pick={pick} onFull={() => go("cal")} onOpen={setOpen} /> : null}
      {tab === "cal" ? <Calendar entries={entries} days={days} mo={mo} setMo={(v) => { setMo(v); setDay(v === cur ? today : `${v}-01`); }} cur={cur} today={today} day={day} pick={pick} dept={dept} setDept={setDept} onOpen={setOpen} /> : null}
      {tab === "bal" ? <Balances b={b} error={board.error} year={year} setYear={setYear} thisYear={thisYear} onOpen={setOpen} /> : null}
      {open && b ? <LeaveDrawer id={open} year={b.year} canManage={b.canManage} onClose={() => setOpen(null)} onChanged={() => void board.reload()} /> : null}
    </section>
  );
}

type Dp = Map<string, DayPerson[]>;

function Overview({ b, entries, days, mo, today, day, pick, onFull, onOpen }: { b: LeaveBoard | null; entries: LeaveMonthEntry[] | null; days: Dp; mo: string; today: string; day: string; pick: (d: string) => void; onFull: () => void; onOpen: (id: string) => void }) {
  const m = b?.metrics;
  const granted = (b?.rows ?? []).reduce((n, r) => n + (r.balance ? r.balance.granted + r.balance.carry + r.balance.adjusted : 0), 0);
  const left = m?.available ?? 0, used = m?.used ?? 0, pend = m?.pending ?? 0;
  const [f, setF] = useState<"all" | "now" | "soon" | "pend">("all");
  const [pg, setPg] = useState(1);
  const all = useMemo(() => rangesOf(entries ?? [], today), [entries, today]);
  const rows = all.filter((r) => f === "all" || (f === "now" && r.state === "now") || (f === "soon" && (r.state === "soon" || r.state === "pend")) || (f === "pend" && r.state === "pend"));
  const np = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(pg, np), shown = rows.slice((page - 1) * PER, page * PER);
  const pct = (v: number) => granted ? `${((v / granted) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "—";
  const n = daysIn(mo), cnt = Array.from({ length: n }, (_, k) => days.get(`${mo}-${pad(k + 1)}`)?.length ?? 0), mx = Math.max(4, ...cnt) + (Math.max(4, ...cnt) % 2);
  return (
    <>
      <div className="grid lgrid">
        <article className="card"><div className="card-head"><h3>Số người nghỉ mỗi ngày</h3><span className="small muted">Tháng {Number(mo.slice(5, 7))}/{mo.slice(0, 4)}</span></div>
          <div className="card-body">
            <div className="lbars" role="img" aria-label={`Số người nghỉ mỗi ngày trong tháng ${mo.slice(5, 7)}`}><div className="yax">{[mx, mx / 2, 0].map((v) => <span key={v}>{v}</span>)}</div>
              <div className="cols">{cnt.map((c, i) => { const d = `${mo}-${pad(i + 1)}`, p = (days.get(d) ?? []).some((x) => x.st === "p"), cls = d === today ? "now" : d > today ? (p ? "pend" : "soon") : "past";
                return <button key={d} className={`lbc ${cls} ${dowOf(d) >= 5 ? "we" : ""}`} onClick={() => pick(d)} title={`Ngày ${dm(d)}: ${c} người nghỉ`}><span className="bar" style={{ height: `${c ? Math.max(8, (c / mx) * 100) : 0}%` }} /><span className={`dl ${[1, 5, 10, 15, 20, 25, 30].includes(i + 1) ? "" : "h"}`}>{i + 1}</span></button>; })}</div></div>
            <div className="lgd"><span><i style={{ background: "var(--brand-soft)" }} />Đã qua</span><span><i style={{ background: "var(--primary)" }} />Hôm nay</span><span><i style={{ background: "var(--accent)" }} />Đã duyệt</span><span><i style={{ background: "var(--warn-fill)" }} />Chờ duyệt</span></div>
          </div></article>
        <article className="card"><div className="card-head"><h3>Lịch tháng {Number(mo.slice(5, 7))}</h3><button className="btn small ghost" onClick={onFull}>Xem đầy đủ</button></div>
          <div className="card-body"><MiniCal mo={mo} days={days} today={today} day={day} pick={pick} onOpen={onOpen} /></div></article>
        <article className="card"><div className="card-head"><h3>Phép năm {b?.year ?? ""}</h3><span className="small muted">{m ? `${d1(granted)} ngày đã cấp` : ""}</span></div>
          <div className="card-body"><div className="dn-w"><Donut segs={[[used, "var(--t-np-fill)"], [pend, "var(--warn-fill)"], [Math.max(0, left), "var(--accent)"]]} size={168} /><span className="dn-c"><b>{m ? d1(left) : "—"}</b><span>ngày còn lại</span></span></div>
            <div className="dleg">{([["Còn lại", left, "var(--accent)"], ["Đã nghỉ", used, "var(--t-np-fill)"], ["Chờ duyệt", pend, "var(--warn-fill)"]] as const).map(([l, v, c]) => <div key={l}><span className="sq" style={{ background: c }} /><span className="lb">{l}</span><b className="num">{d1(v)} ngày</b><span className="pc num">{pct(v)}</span></div>)}</div></div></article>
      </div>
      <article className="card">
        <div className="card-head"><h3>Hoạt động nghỉ phép</h3><div className="row-actions">{([["all", "Tất cả"], ["now", "Đang nghỉ"], ["soon", "Sắp tới"], ["pend", "Chờ duyệt"]] as const).map(([k, l]) => <button key={k} className={`filter-chip ${f === k ? "active" : ""}`} onClick={() => { setF(k); setPg(1); }}>{l}</button>)}</div></div>
        <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Loại</th><th>Thời gian</th><th className="r">Số ngày</th><th>Lý do</th><th>Trạng thái</th><th /></tr></thead><tbody>
          {!entries ? <SkeletonRows cols={8} rows={4} person /> : null}
          {shown.map((r) => (
            <tr key={r.no} className="clickable" onClick={() => onOpen(r.e.id)}>
              <td><Person name={r.e.fullName} seed={r.e.code} sub={r.e.code} /></td>
              <td className="sub">{r.e.department || "—"}</td>
              <td>{r.typeName}</td>
              <td className="num nowrap">{r.from === r.to ? dm(r.from) : `${dm(r.from)} – ${dm(r.to)}`}</td>
              <td className="r num"><b>{d1(r.n)}</b></td>
              <td className="sub wrap">{r.reason ?? "—"}</td>
              <td><Status v={RSTAT[r.state]} /></td>
              <td>{r.state === "pend" ? <Link className="btn small" href={`/requests?open=${r.requestId}`} onClick={(e) => e.stopPropagation()}>Xem và duyệt</Link> : <span className="muted"><Icon name="chevR" size={16} /></span>}</td>
            </tr>
          ))}
        </tbody></table></div>
        {entries && !rows.length ? <Empty title="Chưa có lịch nghỉ phù hợp" /> : null}
        {rows.length > PER ? <div className="tfoot"><span>{(page - 1) * PER + 1} đến {Math.min(page * PER, rows.length)} trên {rows.length} lượt nghỉ</span>
          <span className="pager"><button disabled={page <= 1} aria-label="Trang trước" onClick={() => setPg(page - 1)}><Icon name="chevL" size={16} /></button>{Array.from({ length: np }, (_, i) => <button key={i} className={i + 1 === page ? "on" : ""} onClick={() => setPg(i + 1)}>{i + 1}</button>)}<button disabled={page >= np} aria-label="Trang sau" onClick={() => setPg(page + 1)}><Icon name="chevR" size={16} /></button></span></div> : null}
      </article>
      <article className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><div><h3>Loại nghỉ đang áp dụng<Hint text="Nhân viên chọn khi tạo đơn trên app. Mẫu theo Bộ luật Lao động — cần chuyên gia xác nhận trước khi dùng chính thức." /></h3></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã</th><th>Loại nghỉ</th><th>Hưởng lương</th><th>Trừ phép năm</th><th>Tối đa mỗi đơn</th><th>Ghi chú</th></tr></thead><tbody>
          {!b ? <SkeletonRows cols={6} rows={4} /> : null}
          {(b?.types ?? []).map((t) => (
            <tr key={t.id}><td><b>{t.code}</b></td><td>{t.name}</td><td>{t.paid ? "Có" : "Không"}</td><td>{t.deductsBalance ? <Status v={["Trừ phép", ""]} /> : "—"}</td>
              <td className="num">{t.maxDays ? `${d1(t.maxDays)} ngày` : "—"}</td><td className="muted" style={{ whiteSpace: "normal" }}>{[t.description, t.attachmentFromDays ? `Từ ${d1(t.attachmentFromDays)} ngày cần minh chứng (nộp cho HR).` : null].filter(Boolean).join(" ") || "—"}</td></tr>
          ))}
        </tbody></table></div>
      </article>
    </>
  );
}

function Tiles({ b, loaded, now }: { b: LeaveBoard | null; loaded: boolean; now: DayPerson[] }) {
  const m = b?.metrics;
  const granted = (b?.rows ?? []).reduce((n, r) => n + (r.balance ? r.balance.granted + r.balance.carry + r.balance.adjusted : 0), 0);
  const expiring = m && m.expiringCarry > 0 && m.expiringOn ? ` · ${d1(m.expiringCarry)} ngày phép tồn đến ${fmtDate(m.expiringOn).slice(0, 5)}` : "";
  return (
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="plane" /></span><span className="metric-copy"><span>Đang nghỉ hôm nay</span><strong>{loaded ? now.length : "—"}<small> người</small></strong><small>{loaded ? now.map((p) => given(p.e.fullName)).join(", ") || "Không ai nghỉ" : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="calendar" /></span><span className="metric-copy"><span>Phép còn lại toàn công ty</span><strong>{m ? d1(m.available) : "—"}<small> ngày</small></strong><small>{m ? `Đã cấp ${d1(granted)} ngày${expiring}` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="checks" /></span><span className="metric-copy"><span>Đã sử dụng</span><strong>{m ? d1(m.used) : "—"}<small> ngày</small></strong><small>{m && granted ? `${((m.used / granted) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% số phép đã cấp` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="clock" /></span><span className="metric-copy"><span>Đang chờ duyệt</span><strong>{m ? d1(m.pending) : "—"}<small> ngày</small></strong><small>đang giữ chỗ phép</small></span></article>
      </div>
  );
}

function Donut({ segs, size }: { segs: Array<[number, string]>; size: number }) {
  const r = size / 2 - 11, c = 2 * Math.PI * r, tot = segs.reduce((a, x) => a + x[0], 0) || 1;
  let off = 0;
  return <span className="ringw"><svg width={size} height={size}>{segs.map(([v, col], i) => { const len = (v / tot) * c, o = off; off += len; return v ? <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={20} strokeDasharray={`${Math.max(len - 3, 1)} ${c}`} strokeDashoffset={-o} /> : null; })}</svg></span>;
}

function MiniCal({ mo, days, today, day, pick, onOpen }: { mo: string; days: Dp; today: string; day: string; pick: (d: string) => void; onOpen: (id: string) => void }) {
  const sel = days.get(day) ?? [];
  return (
    <>
      <div className="mcal">{WD.map((x, i) => <b key={x} className={i >= 5 ? "we" : ""}>{x}</b>)}{Array.from({ length: leadOf(mo) }, (_, i) => <span key={`l${i}`} />)}
        {Array.from({ length: daysIn(mo) }, (_, k) => { const d = `${mo}-${pad(k + 1)}`, l = days.get(d) ?? [], p = l.some((x) => x.st === "p");
          return <button key={d} className={`mc ${dowOf(d) >= 5 ? "we" : ""} ${d === today ? "today" : ""} ${d === day ? "sel" : ""} ${l.length ? (p ? "has pend" : "has") : ""}`} onClick={() => pick(d)} aria-label={`Ngày ${dm(d)}, ${l.length} người nghỉ`}>{k + 1}{l.length ? <i>{l.length}</i> : null}</button>; })}</div>
      <div className="mday"><span className="cap">{day === today ? "Hôm nay" : `Ngày ${dm(day)}`}</span>
        {sel.length ? <div className="mnames">{sel.slice(0, 4).map((x) => <button key={x.e.id} onClick={() => onOpen(x.e.id)}><Avatar name={x.e.fullName} seed={x.e.code} /><span>{given(x.e.fullName)}</span></button>)}{sel.length > 4 ? <span className="more">+{sel.length - 4}</span> : null}</div>
          : <span className="sub small">{dowOf(day) >= 5 ? "Ngày nghỉ hằng tuần" : "Không ai nghỉ"}</span>}</div>
    </>
  );
}

function Calendar({ entries, days, mo, setMo, cur, today, day, pick, dept, setDept, onOpen }: { entries: LeaveMonthEntry[] | null; days: Dp; mo: string; setMo: (m: string) => void; cur: string; today: string; day: string; pick: (d: string) => void; dept: string; setDept: (d: string) => void; onOpen: (id: string) => void }) {
  const depts = [...new Set((entries ?? []).map((x) => x.employee.department).filter((x): x is string => !!x))].sort();
  const sel = days.get(day) ?? [];
  const up = [...days.entries()].filter(([d]) => d > today).sort(([a], [b]) => a.localeCompare(b)).flatMap(([d, l]) => l.map((x) => ({ d, ...x })));
  const lead = leadOf(mo), pn = daysIn(shiftMo(mo, -1));
  const dn = dowOf(day);
  return (
    <div className="grid cal-grid top">
      <article className="card">
        <div className="card-head"><div className="rw"><button className="iconbtn bare" aria-label="Tháng trước" onClick={() => setMo(shiftMo(mo, -1))}><Icon name="chevL" /></button><h3 style={{ fontSize: 18 }}>Tháng {Number(mo.slice(5, 7))}, {mo.slice(0, 4)}</h3><button className="iconbtn bare" aria-label="Tháng sau" onClick={() => setMo(shiftMo(mo, 1))}><Icon name="chevR" /></button>{mo !== cur ? <button className="btn small" onClick={() => setMo(cur)}>Về tháng {Number(cur.slice(5, 7))}</button> : null}</div>
          <div className="row-actions"><span className="legend"><span><i style={{ background: "var(--t-np-bg)" }} />Đã duyệt</span><span><i style={{ boxShadow: "inset 0 0 0 1.5px var(--t-np-fill)" }} />Chờ duyệt</span><span><i style={{ background: "var(--surface-3)" }} />Đã qua</span></span>
            <Select className="select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Lọc phòng ban"><option value="">Mọi phòng ban</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</Select></div></div>
        <div className="card-body"><div className="lcal">{WD.map((x) => <b key={x}>{x}</b>)}
          {Array.from({ length: lead }, (_, k) => <span key={`l${k}`} className="lday x"><span className="dn">{pn - lead + k + 1}</span></span>)}
          {Array.from({ length: daysIn(mo) }, (_, k) => { const d = `${mo}-${pad(k + 1)}`, l = days.get(d) ?? [];
            return <button key={d} className={`lday ${dowOf(d) >= 5 ? "we" : ""} ${d === today ? "today" : ""} ${d === day ? "sel" : ""}`} onClick={() => pick(d)} aria-label={`Ngày ${dm(d)}, ${l.length} người nghỉ`}>
              <span className="dn">{k + 1}</span>
              {l.slice(0, 3).map((x) => <span key={x.e.id} className={`lv ${x.st === "a" ? "" : x.st}`}><Avatar name={x.e.fullName} seed={x.e.code} /><span className="nm trunc">{given(x.e.fullName)}</span></span>)}
              {l.length > 3 ? <span className="lv more">+{l.length - 3} người</span> : null}</button>; })}</div>
          {!entries ? <SkeletonLines lines={2} /> : null}</div>
      </article>
      <div className="col-stack">
        <article className="card tint"><div className="card-head"><div><span className="cap">{day === today ? "Hôm nay" : "Ngày đang chọn"}</span><h3 style={{ fontSize: 20, marginTop: 2 }}>{WD_LONG[dn]}, {dm(day)}</h3></div><b className="num day-count">{sel.length}<span className="sub"> người nghỉ</span></b></div>
          <div className="card-body col">{sel.length ? sel.map((x) => <button key={x.e.id} className="spread person-btn" onClick={() => onOpen(x.e.id)}><Person name={x.e.fullName} seed={x.e.code} sub={<>{x.e.department ?? x.e.code}<i className="vs" />{x.typeName}</>} />{x.st === "p" ? <Status v={["Chờ duyệt", "warn"]} /> : <Status v={["Đã duyệt", ""]} />}</button>)
            : <span className="sub">{dowOf(day) >= 5 ? "Ngày nghỉ hằng tuần." : "Không ai nghỉ phép ngày này."}</span>}</div></article>
        <article className="card"><div className="card-head"><h3>Sắp tới</h3><span className="small muted">đến hết tháng {Number(mo.slice(5, 7))}</span></div>
          <div className="check-list">{up.map((x) => <button key={`${x.d}${x.e.id}`} onClick={() => pick(x.d)}><span className="tag num" style={{ minWidth: 52, textAlign: "center" }}>{WD[dowOf(x.d)]} {dm(x.d)}</span><Avatar name={x.e.fullName} seed={x.e.code} /><span className="grow trunc"><b>{x.e.fullName}</b></span>{x.st === "p" ? <Status v={["Chờ duyệt", "warn"]} /> : null}</button>)}
            {!up.length ? <div className="sub">Chưa có lịch nghỉ nào.</div> : null}</div></article>
      </div>
    </div>
  );
}

function Balances({ b, error, year, setYear, thisYear, onOpen }: { b: LeaveBoard | null; error: { message: string } | null; year: number; setYear: (y: number) => void; thisYear: number; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "pend" | "zero">("all");
  const all = b?.rows ?? [];
  const cnt = { all: all.length, pend: all.filter((r) => r.balance?.pending).length, zero: all.filter((r) => r.balance && !r.balance.used).length };
  const rows = all.filter((r) => (f === "all" || (f === "pend" && r.balance?.pending) || (f === "zero" && r.balance && !r.balance.used)) && (!q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase())));
  const ent = Math.max(0, ...all.map((r) => r.balance?.yearEntitlement ?? 0));
  return (
    <article className="card">
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" aria-label="Tìm nhân viên" /></label>
        {([["all", "Tất cả"], ["pend", "Có đơn chờ duyệt"], ["zero", "Chưa nghỉ ngày nào"]] as const).map(([k, l]) => <button key={k} className={`filter-chip ${f === k ? "active" : ""}`} onClick={() => setF(k)}>{l}<span className="n">{cnt[k]}</span></button>)}
        <span className="toolbar-spacer" />
        <span className="legend"><span><i style={{ background: "var(--t-np-fill)" }} />Đã nghỉ</span><span><i style={{ background: "var(--warn-fill)" }} />Chờ duyệt</span><span><i style={{ background: "var(--accent)" }} />Còn lại</span></span>
        <Select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm">{[thisYear, thisYear - 1].map((y) => <option key={y} value={y}>Năm {y}</option>)}</Select>
      </div>
      {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
        <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>{ent ? `${ent} ngày phép năm ${year}` : `Phép năm ${year}`}</th><th className="r">Còn lại</th><th className="r">Đã nghỉ</th><th className="r">Chờ duyệt</th><th /></tr></thead><tbody>
          {!b && !error ? <SkeletonRows cols={7} rows={8} person /> : null}
          {rows.map((r) => { const x = r.balance; return (
            <tr key={r.employee.id} className="clickable" onClick={() => onOpen(r.employee.id)}>
              <td><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.code} /></td>
              <td className="sub">{r.employee.department || "—"}</td>
              {x ? <>
                <td><Ticks b={x} /></td>
                <td className={`r num ${x.available < 0 ? "text-red" : ""}`}><b>{d1(x.available)}</b></td>
                <td className="r num">{x.used ? d1(x.used) : <span className="muted">0</span>}</td>
                <td className="r num">{x.pending ? <b style={{ color: "var(--amber)" }}>{d1(x.pending)}</b> : <span className="muted">0</span>}</td>
              </> : <td colSpan={4} className="muted">Chưa áp dụng quy định phép năm</td>}
              <td className="muted"><Icon name="chevR" size={16} /></td>
            </tr>); })}
        </tbody></table></div>
      )}
      <div className="tfoot"><span>Mỗi vạch là một ngày phép. Vạch xám là phần chưa tích lũy tới.</span></div>
    </article>
  );
}

/* Mỗi vạch một ngày phép: đã nghỉ · chờ duyệt · còn lại, phần còn trống của định mức năm là chưa tích lũy */
function Ticks({ b }: { b: LeaveBalance }) {
  const u = Math.round(b.used), w = Math.round(b.pending), a = Math.max(0, Math.round(b.available)), n = Math.max(b.yearEntitlement, u + w + a);
  return <span className="ticks" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < u ? "i" : i < u + w ? "w" : i < u + w + a ? "m" : undefined} />)}</span>;
}

export default function Page() { return <Suspense><LeavePage /></Suspense>; }

function LeaveDrawer({ id, year, canManage, onClose, onChanged }: { id: string; year: number; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const me = useMe();
  const { data: e, error, reload, setData } = useApi<EmployeeLeave>(`leave/${id}?year=${year}`);
  const [req, setReq] = useState<RequestItem | null>(null);
  const tz = me.tenant.timezone;
  return (
    <Drawer onClose={onClose} head={<div><b>{e?.employee.fullName ?? "…"}</b><div className="muted" style={{ fontSize: 12 }}>{e ? `${e.employee.code} · vào làm ${fmtDate(e.employee.hireDate)} · sổ phép ${year}` : ""}</div></div>}>
      <LoadError error={error} retry={reload} />
      {e ? (!e.balance ? <Empty title="Chưa có sổ phép" text="Nhân viên chưa được áp dụng quy định phép năm, hoặc chưa vào làm trong năm này." /> : <>
        <div className="params">
          <div className="param"><b className={`num ${e.balance.available < 0 ? "text-red" : ""}`}>{d1(e.balance.available)}</b><span>Ngày còn lại</span></div>
          <div className="param"><b className="num">{d1(e.balance.used)}</b><span>Đã nghỉ</span></div>
          <div className="param"><b className="num">{d1(e.balance.pending)}</b><span>Đang chờ duyệt</span></div>
        </div>
        <BalanceDetail b={e.balance} />
        {canManage ? <AdjustForm id={id} year={year} onDone={(x) => { setData(x); onChanged(); }} /> : null}
        <div className="drawer-section"><h4>Biến động</h4>
          <div className="card"><div className="table-wrap"><table className="data-table compact"><thead><tr><th>Ngày</th><th>Loại</th><th>Số ngày</th><th>Nội dung</th></tr></thead><tbody>
            {e.ledger.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{fmtDate(t.effectiveOn).slice(0, 5)}</td>
                <td className="nowrap">{LEAVE_TX_KINDS[t.kind]}</td>
                <td className={`num ${t.amount < 0 ? "text-red" : ""}`}>{signed(t.amount)}</td>
                <td style={{ whiteSpace: "normal" }}>{t.reason ?? "—"}{t.expiresOn ? ` · dùng đến ${fmtDate(t.expiresOn)}` : ""}{t.createdBy ? <small className="muted" style={{ display: "block" }}>{t.createdBy} · {fmtDateTime(t.createdAt, tz)}</small> : null}</td>
              </tr>
            ))}
          </tbody></table></div></div>
        </div>
      </>) : (error ? null : <SkeletonLines lines={6} avatar />)}
      {e ? <div className="drawer-section"><h4>Đơn nghỉ năm {year}</h4>
        {e.requests.length ? <div className="card detail-list">{e.requests.map((r) => (
          <div key={r.id} className="detail-row clickable" style={{ cursor: "pointer" }} onClick={() => setReq(r)}><span>{r.no} · {requestSummary(r)}<small style={{ display: "block" }}>{fmtDateTime(r.submittedAt, tz)}</small></span><b><Status v={REQUEST_STATUS[r.status]} /></b></div>
        ))}</div> : <p className="muted" style={{ fontSize: 12 }}>Chưa có đơn nghỉ nào.</p>}
      </div> : null}
      {req ? <RequestModal r={req} onClose={() => setReq(null)} onDone={() => { void reload(); onChanged(); }} /> : null}
    </Drawer>
  );
}

function BalanceDetail({ b }: { b: LeaveBalance }) {
  return (
    <div className="drawer-section"><h4>Số dư</h4>
      <div className="card detail-list">
        <div className="detail-row"><span>{b.accrualMonthly ? "Đã tích lũy" : "Được cấp"}</span><b>{d1(b.granted)}/{d1(b.yearEntitlement)} ngày{b.accrualMonthly ? " · tích lũy đầu mỗi tháng" : ""}</b></div>
        {b.carry ? <div className="detail-row"><span>Phép tồn năm trước</span><b>{d1(b.carry)} ngày{b.carryExpiresOn ? ` · dùng đến ${fmtDate(b.carryExpiresOn)}` : ""}{b.expired ? ` · đã hết hạn ${d1(b.expired)}` : ""}</b></div> : null}
        {b.adjusted ? <div className="detail-row"><span>Điều chỉnh</span><b>{signed(b.adjusted)} ngày</b></div> : null}
        <div className="detail-row"><span>Được nghỉ trước (âm)</span><b>{b.allowNegative ? `tối đa ${d1(b.allowNegative)} ngày, cần HR duyệt` : "Không"}</b></div>
        <div className="detail-row"><span>Quy định áp dụng</span><b>{b.policy ? `${b.policy.name} · v${b.policy.versionNo}` : "—"}</b></div>
      </div>
    </div>
  );
}

/* HR cộng/trừ phép (bước 0,5 ngày) hoặc nhập phép tồn năm trước kèm hạn dùng — luôn có lý do, ghi nhật ký */
function AdjustForm({ id, year, onDone }: { id: string; year: number; onDone: (e: EmployeeLeave) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [carry, setCarry] = useState(false);
  const [show, setShow] = useState(false);
  const [expires, setExpires] = useState(`${year}-03-31`);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    const n = Number(amount.replace(",", "."));
    if (!n || Math.round(n * 2) !== n * 2) { setErr("Số ngày khác 0, theo bước 0,5 (ví dụ 1 hoặc -0,5)."); return; }
    if (carry && n <= 0) { setErr("Phép tồn phải là số ngày dương."); return; }
    if (reason.trim().length < 5) { setErr("Ghi lý do (ít nhất 5 ký tự)."); return; }
    setErr(null);
    const ok = await run("adjust", async () => onDone(await call<EmployeeLeave>("POST", `leave/${id}/adjust`, { year, amount: n, reason: reason.trim(), carry, expiresOn: carry ? expires : null })), carry ? "Đã nhập phép tồn" : "Đã điều chỉnh sổ phép");
    if (ok) { setAmount(""); setReason(""); }
  }
  return (
    <div className="drawer-section">
      <button className="btn" aria-expanded={show} onClick={() => setShow(!show)}><Icon name={show ? "x" : "plus"} /> Điều chỉnh số dư</button>
      {show ? <div className="card card-body" style={{ marginTop: 10 }}>
        <div className="form-grid">
          <Field label="Số ngày (+/−)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ví dụ 1 hoặc -0,5" /></Field>
          <Field label="Loại"><Select value={carry ? "carry" : "adjust"} onChange={(e) => setCarry(e.target.value === "carry")}><option value="adjust">Điều chỉnh</option><option value="carry">Phép tồn năm trước</option></Select></Field>
          {carry ? <Field label="Dùng đến ngày"><input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={expires} onChange={(e) => setExpires(e.target.value)} /></Field> : null}
          <Field label="Lý do" full><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Thưởng phép dự án, nhập số dư từ bảng tính" /></Field>
        </div>
        <ErrorLine text={err} />
        <button className="btn primary small" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu điều chỉnh"}</button>
      </div> : null}
    </div>
  );
}
