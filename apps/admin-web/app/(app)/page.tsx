"use client";
import Link from "next/link";
import type { AdminOverview, AttendanceBoard, ChecklistGaps, LeaveMonth, LeaveMonthEntry, OverviewDay, RequestQueue, RulePolicy, SetupChecklist, TimesheetBoard, TodayRow } from "@kavor/contracts";
import { useApi } from "../_lib/client";
import { Empty, Icon, LoadError, PageActions, PageSub, Person, Status, can, dur, fmtDate, num, useMe } from "../_ui/kit";
import { Skeleton } from "@kavor/web-ui";

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/* Cột chồng đúng giờ + đi muộn 7 ngày như prototype (viewBox 560×190); hôm nay tô đậm. API: present gồm cả người đi muộn */
function PresenceChart({ days }: { days: OverviewDay[] }) {
  const W = 560, bw = 38, x0 = 34;
  const top = Math.max(4, Math.ceil(Math.max(...days.map((d) => d.present), 1) / 4) * 4);
  const y = (v: number) => 150 - (v / top) * 130;
  const gap = (W - x0 - 34 - bw * days.length) / Math.max(1, days.length - 1);
  const ticks = [0, 1, 2, 3, 4].map((k) => (top / 4) * k);
  return (
    <svg className="chart-svg flow" viewBox={`0 0 ${W} 190`} role="img" aria-label="Số người có mặt và đi muộn 7 ngày gần nhất">
      {ticks.map((t) => <g key={t}><line x1={x0} x2={W - 6} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? "3 4" : undefined} /><text x={x0 - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
      {days.map((d, i) => {
        const x = x0 + 8 + i * (bw + gap), dt = new Date(`${d.date}T12:00:00Z`), last = i === days.length - 1;
        const ok = Math.max(0, d.present - d.late), weekend = [0, 6].includes(dt.getUTCDay());
        return (
          <g key={d.date}>
            <title>{`${fmtDate(d.date)}: có mặt ${d.present}, đi muộn ${d.late}, bị từ chối ${d.rejected}`}</title>
            {d.present ? <>
              <rect x={x} y={y(ok)} width={bw} height={150 - y(ok)} rx="6" fill={last ? "var(--primary)" : "var(--accent)"} />
              {d.late ? <rect x={x} y={y(d.present)} width={bw} height={Math.max(0, y(ok) - y(d.present) - 2)} rx="4" fill="var(--warn-fill)" /> : null}
              <text x={x + bw / 2} y={y(d.present) - 6} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>{d.present}</text>
            </> : weekend ? <text x={x + bw / 2} y="142" textAnchor="middle">nghỉ</text> : null}
            <text x={x + bw / 2} y="168" textAnchor="middle" style={last ? { fill: "var(--brand-ink)", fontWeight: 700 } : undefined}>{WD[dt.getUTCDay()]}</text>
            <text x={x + bw / 2} y="182" textAnchor="middle">{last ? "Hôm nay" : `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* Nhóm trạng thái hôm nay giống tab Hôm nay của Chấm công */
type Kind = "ok" | "late" | "leave" | "none" | "other";
const kindOf = (r: TodayRow): Kind => r.leave?.half === "full" ? "leave" : r.clockIn ? (r.late ? "late" : "ok") : r.state === "not_started" || r.state === "absent" ? "none" : "other";
const KIND_ORDER: Record<Kind, number> = { ok: 0, late: 1, leave: 2, none: 3, other: 4 };
const KINDS: Array<[Kind, string]> = [["ok", "Đúng giờ"], ["late", "Đi muộn"], ["leave", "Nghỉ phép"], ["none", "Chưa vào ca"]];

type Todo = { tone: "danger" | "warn" | "info"; icon: string; title: string; text: string; cta: string; href: string };

export default function Overview() {
  const me = useMe();
  const t = { tenantId: me.tenant.id };
  const { data: o, error, reload } = useApi<AdminOverview>("overview", { tables: ["attendance_events", "employee_devices", "employees"], ...t });
  const att = can(me, "attendance.read");
  const { data: bd } = useApi<AttendanceBoard>(att ? "attendance/board" : null, { tables: ["attendance_events", "employee_devices"], ...t });
  const { data: ts } = useApi<TimesheetBoard>(att ? "timesheets" : null);
  const { data: rq } = useApi<RequestQueue>(can(me, "request.read") ? "requests?status=pending&pageSize=1" : null, { tables: ["requests", "approval_tasks"], ...t });
  const { data: gaps } = useApi<ChecklistGaps>(can(me, "document.read") ? "checklist/gaps" : null);
  const { data: setup } = useApi<SetupChecklist>(can(me, "tenant.settings.manage") ? "settings/checklist" : null);
  const wait = !o && !error ? <Skeleton w={56} h={24} /> : "—";
  const s = bd?.summary;

  /* Việc cần xử lý: chỉ việc có số > 0 và người xem có quyền; dữ liệu từ các endpoint sẵn có, xếp theo mức gấp */
  const overdue = rq?.counts.overdue ?? 0, mine = rq?.counts.mine ?? 0, unexplained = ts?.metrics.unexplained ?? 0;
  const all: Array<Todo | false | null | undefined> = [
    overdue > 0 && { tone: "danger", icon: "checks", title: `${overdue} đơn quá hạn duyệt`, text: "Đã quá thời hạn xử lý của bước duyệt, nhân viên đang chờ.", cta: "Xem và duyệt", href: "/requests" },
    mine > 0 && { tone: "warn", icon: "checks", title: `${mine} đơn đang chờ bạn duyệt`, text: "Nghỉ phép, làm thêm giờ, giải trình và các đơn khác.", cta: "Mở hộp duyệt", href: "/requests" },
    (s?.notYet ?? 0) > 0 && { tone: "warn", icon: "clock", title: `${s!.notYet} người chưa vào ca hôm nay`, text: "Chưa có giờ vào và chưa có đơn nghỉ được duyệt.", cta: "Xem danh sách", href: "/attendance?tab=today&filter=none" },
    unexplained > 0 && ts && { tone: "warn", icon: "calendar", title: `${num(unexplained)} ngày thiếu công chưa giải trình`, text: `Kỳ công ${ts.period.month.slice(5)}/${ts.period.month.slice(0, 4)} cần xử lý hết trước khi khóa kỳ.`, cta: "Mở bảng công", href: "/attendance?tab=month" },
    (o?.devicesPending ?? 0) > 0 && att && { tone: "warn", icon: "phone", title: `${o!.devicesPending} thiết bị đang chờ duyệt`, text: "Nhân viên chưa chấm công được trên máy mới cho tới khi HR duyệt.", cta: "Duyệt thiết bị", href: "/attendance?tab=devices" },
    (o?.notActivated ?? 0) > 0 && can(me, "employee.read") && { tone: "info", icon: "mail", title: `${o!.notActivated} nhân viên chưa kích hoạt tài khoản`, text: "Chưa kích hoạt thì chưa chấm công và gửi đơn trên điện thoại được.", cta: "Gửi lời mời", href: "/employees?account=pending" },
    (gaps?.rows.length ?? 0) > 0 && { tone: "info", icon: "file", title: `${gaps!.rows.length} hồ sơ thiếu giấy tờ bắt buộc`, text: "Theo danh mục giấy tờ của công ty.", cta: "Xem hồ sơ thiếu", href: "/documents?tab=miss" },
    setup && setup.done < setup.total && { tone: "info", icon: "settings", title: `Thiết lập ban đầu còn ${setup.total - setup.done} bước`, text: setup.steps.filter((x) => x.state === "todo" || x.state === "warn").map((x) => x.title.toLowerCase()).slice(0, 3).join(", ") + ".", cta: "Xem các bước", href: "/settings?tab=setup" },
  ];
  const todos = all.filter((x): x is Todo => !!x);
  const todoLoading = !error && (!o || (att && (!bd || !ts)) || (can(me, "request.read") && !rq));

  const rows = [...(bd?.rows ?? [])].sort((a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)]);
  const count = (k: Kind) => rows.filter((r) => kindOf(r) === k).length;
  const attn = rows.filter((r) => ["late", "none"].includes(kindOf(r))).sort((a, b) => (kindOf(a) === "none" ? -1 : 1) - (kindOf(b) === "none" ? -1 : 1));
  const DOT: Record<Kind, string> = { ok: "var(--accent)", late: "var(--warn-fill)", leave: "var(--t-np-fill)", none: "var(--red)", other: "var(--track)" };

  return (
    <section className="page active">
      <PageSub text={todoLoading ? null : ["Chào " + (me.fullName.trim().split(/\s+/).at(-1) ?? ""), todos.length ? `${todos.length} việc cần xử lý` : "Không có việc cần xử lý", ts ? `kỳ công ${ts.period.month.slice(5)}/${ts.period.month.slice(0, 4)} chốt ngày ${fmtDate(ts.period.end).slice(0, 5)}` : ""].filter(Boolean).join(" | ")} />
      <PageActions>
        {can(me, "announcement.publish") ? <Link className="btn" href="/announcements?new=1"><Icon name="news" /> Tạo bài viết</Link> : null}
        {can(me, "employee.create") ? <Link className="btn primary" href="/employees?new=1"><Icon name="plus" /> Thêm nhân viên</Link> : null}
      </PageActions>
      <LoadError error={error} retry={reload} />
      {me.tenantAdminCount < 2 && can(me, "role.read") ? (
        <div className="banner soft-warn">
          <span className="banner-icon"><Icon name="shield" /></span>
          <span className="banner-copy"><b>Công ty chỉ có {me.tenantAdminCount} quản trị viên</b><span>Nên có ít nhất 2 quản trị viên công ty để không mất quyền quản trị khi một người nghỉ hoặc mất tài khoản.</span></span>
        </div>
      ) : null}

      <div className="grid metrics">
        <Link href="/employees" className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Nhân sự đang làm việc</span><strong className="num">{o ? num(o.activeEmployees) : wait}</strong><small>{o ? `${num(o.notActivated)} chưa kích hoạt app` : " "}</small></span></Link>
        {att ? <Link href="/attendance?tab=today" className="card metric-card"><span className="metric-icon"><Icon name="clock" /></span><span className="metric-copy"><span>Có mặt hôm nay</span><strong className="num">{s ? <>{num(s.present)}<small>/{num(s.inScope)}</small></> : wait}</strong><small>{s ? <>{num(s.onLeave)} nghỉ phép<i className="vs" />{num(s.notYet)} chưa vào ca</> : " "}</small></span></Link> : null}
        {att ? <Link href="/attendance?tab=today&filter=late" className="card metric-card"><span className="metric-icon"><Icon name="alert" /></span><span className="metric-copy"><span>Đi muộn hôm nay</span><strong className={`num ${o?.lateToday ? "tone-warn" : ""}`}>{o ? num(o.lateToday) : wait}</strong><small>Sau giờ vào ca + ân hạn</small></span></Link> : null}
        {rq ? <Link href="/requests" className="card metric-card"><span className="metric-icon"><Icon name="checks" /></span><span className="metric-copy"><span>Đơn chờ bạn duyệt</span><strong className={`num ${overdue ? "tone-danger" : ""}`}>{num(mine)}</strong><small>{overdue ? `${num(overdue)} đơn đã quá hạn` : "Không có đơn quá hạn"}</small></span></Link> : null}
      </div>

      <div className="grid two-one">
        <article className="card">
          <div className="card-head"><h3>Việc cần xử lý</h3><span className="muted small-note">Sắp theo mức độ gấp</span></div>
          {todoLoading ? <div className="card-body"><Skeleton w="100%" h={140} /></div>
            : todos.length ? <div className="todo-list">{todos.map((x) => (
              <Link key={x.title} href={x.href} className="todo-row">
                <span className={`tile ${x.tone}`}><Icon name={x.icon} /></span>
                <span className="todo-text"><b>{x.title}</b><span>{x.text}</span></span>
                <span className={`btn small ${x.tone === "danger" ? "primary" : ""}`}>{x.cta}</span>
              </Link>
            ))}</div>
              : <Empty title="Không có việc cần xử lý" text="Mọi thứ trong phạm vi của bạn đều ổn." />}
        </article>
        {att ? (
          <article className="card">
            <div className="card-head"><h3>Chấm công hôm nay</h3><span className="muted small-note">{bd ? fmtDate(bd.date) : ""}</span></div>
            <div className="card-body att-today">
              {bd ? <>
                <div className="att-dots" role="img" aria-label="Mỗi ô là một nhân viên">{rows.map((r) => <i key={r.employee.id} title={r.employee.fullName} style={{ background: DOT[kindOf(r)] }} />)}</div>
                <div className="att-legend">{KINDS.map(([k, label]) => <div key={k} className="spread"><span className="att-key"><i style={{ background: DOT[k] }} />{label}</span><b className="num">{count(k)}</b></div>)}</div>
                <div className="att-attn">
                  <span className="cap">Cần chú ý</span>
                  {attn.length ? attn.slice(0, 6).map((r) => (
                    <Link key={r.employee.id} href={`/employees/${r.employee.id}`} className="spread att-person">
                      <Person name={r.employee.fullName} sub={r.employee.department ?? r.employee.code} seed={r.employee.code} />
                      {kindOf(r) === "late" ? <Status v={[`Đi muộn ${dur(r.clockIn!.lateMinutes)}`, "warn"]} /> : <Status v={["Chưa vào ca", "bad"]} />}
                    </Link>
                  )) : <span className="muted small-note">Không có ai cần chú ý.</span>}
                  {attn.length > 6 ? <Link className="btn small" href="/attendance?tab=today">Xem tất cả {attn.length} người</Link> : null}
                </div>
              </> : <Skeleton w="100%" h={220} />}
            </div>
          </article>
        ) : null}
      </div>

      <div className="grid two-one">
        {att ? (
          <article className="card">
            <div className="card-head"><div><h3>Có mặt và đi muộn</h3><p>7 ngày gần nhất<i className="vs" />trong phạm vi của bạn</p></div>
              <span className="legend"><span><i style={{ background: "var(--accent)" }} />Đúng giờ</span><span><i style={{ background: "var(--warn-fill)" }} />Đi muộn</span></span></div>
            <div className="card-body">{o ? <PresenceChart days={o.days} /> : !error ? <Skeleton w="100%" h={190} /> : null}</div>
          </article>
        ) : null}
        {o ? <Upcoming today={o.date} ts={ts ?? null} /> : null}
      </div>
    </section>
  );
}

/* Ngày dạng YYYY-MM-DD, cộng ngày/tháng theo UTC (không lệch múi giờ) */
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const nextMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 7);
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const span = (a: string, b: string) => a === b ? dm(a) : a.slice(5, 7) === b.slice(5, 7) ? `${a.slice(8, 10)}–${dm(b)}` : `${dm(a)}–${dm(b)}`;

/* Sắp tới (30 ngày) theo prototype: lịch nghỉ (leave/calendar), hạn nhận đơn tạm ứng (quy định áp dụng toàn công ty), ngày chốt kỳ công chưa khóa.
   Chưa có "hết thử việc" vì hồ sơ chưa lưu thời hạn thử việc. */
function Upcoming({ today, ts }: { today: string; ts: TimesheetBoard | null }) {
  const me = useMe();
  const cur = today.slice(0, 7), nxt = nextMonth(cur), until = addDays(today, 30);
  const lv = can(me, "leave.read");
  const a = useApi<LeaveMonth>(lv ? `leave/calendar?month=${cur}` : null);
  const b = useApi<LeaveMonth>(lv ? `leave/calendar?month=${nxt}` : null);
  const rules = useApi<RulePolicy[]>(can(me, "policy.read") ? "rules" : null);
  const items: Array<{ from: string; to: string; title: string; sub: string }> = [];
  const byReq = new Map<string, LeaveMonthEntry[]>();
  for (const e of [...(a.data?.entries ?? []), ...(b.data?.entries ?? [])]) if (e.date >= today && e.date <= until) byReq.set(e.requestId, [...(byReq.get(e.requestId) ?? []), e]);
  for (const g of byReq.values()) {
    const e = g[0]!, days = g.reduce((t, x) => t + x.portion, 0);
    items.push({ from: g.at(0)!.date, to: g.at(-1)!.date, title: `${e.employee.fullName} nghỉ ${e.typeName.toLowerCase()} ${num(days)} ngày`, sub: `Đơn ${e.requestNo} ${e.status === "pending" ? "đang chờ duyệt" : "đã duyệt"}` });
  }
  const adv = (rules.data ?? []).find((r) => r.kind === "salary_advance" && r.active && r.current && r.current.config.enabled !== false
    && r.assignments.some((x) => x.scopeType === "tenant" && x.state === "active"));
  if (adv?.current) {
    const day = Number(adv.current.config.deadlineDay ?? 20);
    let m = cur, d = `${m}-${String(Math.min(day, lastDay(m))).padStart(2, "0")}`;
    if (d < today) { m = nxt; d = `${m}-${String(Math.min(day, lastDay(m))).padStart(2, "0")}`; }
    if (d <= until) items.push({ from: d, to: d, title: `Hạn nhận đơn tạm ứng kỳ ${Number(m.slice(5, 7))}`, sub: `Theo quy định ${adv.code}` });
  }
  const p = ts?.period;
  if (p && !p.locked && p.end >= today && p.end <= until) items.push({ from: p.end, to: p.end, title: `Chốt kỳ công ${p.month.slice(5)}/${p.month.slice(0, 4)}`, sub: "Khóa bảng công để tính lương" });
  items.sort((x, y) => x.from.localeCompare(y.from));
  return (
    <article className="card">
      <div className="card-head"><h3>Sắp tới</h3><span className="muted small-note">30 ngày</span></div>
      {items.length ? (
        <div className="check-list" style={{ marginTop: 8 }}>{items.map((x, i) => (
          <div key={i}><span className="tag num" style={{ minWidth: 66, justifyContent: "center", textAlign: "center" }}>{span(x.from, x.to)}</span>
            <span className="grow"><b style={{ display: "block" }}>{x.title}</b><span className="sub">{x.sub}</span></span></div>
        ))}</div>
      ) : <div className="card-body"><span className="sub">Không có lịch nào trong 30 ngày tới.</span></div>}
    </article>
  );
}
