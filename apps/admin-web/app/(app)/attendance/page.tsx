"use client";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminAttendanceEvent, AdminDevice, AttendanceBoard, TimesheetBoard, TodayRow } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { PageActions, DEVICE, Empty, Icon, LoadError, Person, REJECT_REASON, Status, can, dur, fmtDate, fmtDateTime, fmtTime, longDate, meters, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { EmployeeMonth, MonthTab } from "./month";
import { OvertimeTab } from "./overtime";
import { SkeletonRows } from "@kavor/web-ui";

type Tab = "month" | "today" | "rejected" | "devices" | "overtime";
const TABS: Array<[Tab, string, string?]> = [["today", "Hôm nay"], ["month", "Bảng công tháng"], ["overtime", "Làm thêm giờ", "overtime.read"], ["rejected", "Bản ghi bị từ chối"], ["devices", "Thiết bị"]];

function AttendancePage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "today";
  const [action, setAction] = useState<ReactNode>(null);
  /* Số đếm trên tab: người thiếu công của kỳ hiện tại, bản ghi bị từ chối hôm nay, thiết bị chờ duyệt (dữ liệu có sẵn, không thêm API) */
  /* Không nghe realtime ở đây (đã thấy vòng tải lại liên tục) — số đếm làm mới khi vào lại trang */
  const { data: ts } = useApi<TimesheetBoard>("timesheets");
  const { data: bd } = useApi<AttendanceBoard>("attendance/board");
  const badge: Partial<Record<Tab, [number | undefined, boolean]>> = { month: [ts?.metrics.short, true], rejected: [bd?.summary.rejected, false], devices: [bd?.summary.devicesPending, false] };
  const go = (t: Tab) => router.replace(`/attendance?tab=${t}`, { scroll: false });
  return (
    <section className="page active">
      <div className="page-head">
        <div><div className="segmented" role="tablist">{TABS.filter(([, , perm]) => !perm || can(me, perm)).map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => go(k)}>{label}{badge[k]?.[0] != null && (badge[k]![0]! > 0 || !badge[k]![1]) ? <span className={`n ${badge[k]![1] ? "hot" : ""}`}>{badge[k]![0]}</span> : null}</button>)}</div></div>
      </div>
      {tab === "month" ? <PageActions>{action}</PageActions> : null}
      {tab === "month" ? <MonthTab setAction={setAction} /> : tab === "overtime" ? <OvertimeTab /> : tab === "today" ? <Today tz={me.tenant.timezone} tenantId={me.tenant.id} /> : tab === "rejected" ? <Rejected tz={me.tenant.timezone} tenantId={me.tenant.id} /> : <Devices tz={me.tenant.timezone} tenantId={me.tenant.id} />}
    </section>
  );
}

/* Nhóm trạng thái hôm nay như prototype: chưa vào ca → đi muộn → nghỉ phép → đúng giờ → còn lại (chưa có ca) */
type Key = "none" | "late" | "leave" | "ok" | "other";
const ORDER: Record<Key, number> = { none: 0, late: 1, leave: 2, ok: 3, other: 4 };
const keyOf = (r: TodayRow): Key => r.leave?.half === "full" ? "leave" : r.clockIn ? (r.late ? "late" : "ok") : r.state === "not_started" || r.state === "absent" ? "none" : "other";
const stateOf = (r: TodayRow): [string, string] => {
  const k = keyOf(r);
  return k === "leave" ? ["Nghỉ phép", "info"] : k === "late" ? [`Đi muộn ${dur(r.clockIn!.lateMinutes)}`, "warn"] : k === "ok" ? [r.state === "done" ? "Đã xong ca" : "Đúng giờ", ""]
    : r.state === "absent" ? ["Vắng / thiếu công", "bad"] : r.state === "no_shift" ? ["Chưa có ca", "warn"] : ["Chưa vào ca", "bad"];
};

function Today({ tz, tenantId }: { tz: string; tenantId: string }) {
  const [date, setDate] = useState(tenantToday(tz));
  /* ?filter= từ Tổng quan (việc cần xử lý) */
  const initial = useSearchParams().get("filter");
  const [filter, setFilter] = useState<"all" | Key>(initial && initial in ORDER ? (initial as Key) : "all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: b, error, reload } = useApi<AttendanceBoard>(`attendance/board?date=${date}`, { tables: ["attendance_events", "employee_devices", "leave_days"], tenantId });
  const all = b?.rows ?? [];
  const count = (k: Key) => all.filter((r) => keyOf(r) === k).length;
  const rows = useMemo(() => all.filter((r) =>
    (filter === "all" || keyOf(r) === filter)
    && (!q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((x, y) => ORDER[keyOf(x)] - ORDER[keyOf(y)]), [b, filter, q]);
  const s = b?.summary;
  return (
    <>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Đã vào ca</span><strong>{s ? <>{s.present}<small>/{s.inScope}</small></> : "—"}</strong><small>{longDate(date)}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Đi muộn</span><strong className={s?.late ? "tone-warn" : ""}>{s?.late ?? "—"}</strong><small>Sau giờ vào ca + ân hạn</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="calendar" /></span><span className="metric-copy"><span>Nghỉ phép</span><strong>{s?.onLeave ?? "—"}</strong><small>Đã có đơn được duyệt</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Chưa vào ca</span><strong className={s?.notYet ? "tone-danger" : ""}>{s?.notYet ?? "—"}</strong><small>Chưa có giờ vào, chưa có đơn</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <div className="segmented">{([["all", "Tất cả", all.length], ["none", "Chưa vào ca", count("none")], ["late", "Đi muộn", count("late")], ["leave", "Nghỉ phép", count("leave")], ["ok", "Đúng giờ", count("ok")]] as const).map(([k, l, n]) => (
            <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}<span className="n num">{n}</span></button>
          ))}</div>
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" /></label>
          <span className="toolbar-spacer" />
          <input className="select" type="date" value={date} max={tenantToday(tz)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Chọn ngày" />
        </div>
        {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Ca</th><th>Giờ vào</th><th>Giờ ra</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {!b && !error ? <SkeletonRows cols={7} rows={8} person /> : null}
            {rows.map((r) => (
              <tr key={r.employee.id} className="clickable" onClick={() => setOpen(r.employee.id)}>
                <td><Person name={r.employee.fullName} sub={r.employee.code} seed={r.employee.code} /></td>
                <td className="muted">{r.employee.department ?? "—"}</td>
                <td className="muted num" title={r.shift?.name}>{r.shift ? `${r.shift.start}–${r.shift.end}` : "—"}</td>
                <td className="num">{r.clockIn ? <><b>{fmtTime(r.clockIn.at, tz)}</b>{r.clockIn.offline ? <span className="source-tag">offline</span> : null}</> : "—"}</td>
                <td className="num muted">{r.clockOut ? <>{fmtTime(r.clockOut.at, tz)}{r.early ? <small className="text-red"> · sớm {dur(r.clockOut.earlyMinutes)}</small> : null}{r.clockOut.offline ? <span className="source-tag">offline</span> : null}</> : "—"}</td>
                <td><Status v={stateOf(r)} />{r.rejectedCount ? <span className="source-tag" title="Số lần bị từ chối">{r.rejectedCount} bị từ chối</span> : null}</td>
                <td><Icon name="arrow" size={16} /></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {open ? <EmployeeMonth id={open} onClose={() => setOpen(null)} onChanged={() => void reload()} /> : null}
    </>
  );
}

function Rejected({ tz, tenantId }: { tz: string; tenantId: string }) {
  const today = tenantToday(tz);
  const [to, setTo] = useState(today);
  /* Chỉ cộng/trừ ngày trên chuỗi ngày của công ty, không lấy "hôm nay" từ UTC */
  const [from, setFrom] = useState(() => new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400_000).toISOString().slice(0, 10));
  const { data, error, reload } = useApi<AdminAttendanceEvent[]>(`attendance/rejected?from=${from}&to=${to}`, { tables: ["attendance_events"], tenantId });
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar"><span className="muted">Từ</span><input className="select" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Từ ngày" /><span className="muted">đến</span><input className="select" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Đến ngày" /></div>
        {data && !data.length ? <Empty title="Không có bản ghi bị từ chối" text={`Mọi lần chấm công từ ${fmtDate(from).slice(0, 5)} đến ${fmtDate(to).slice(0, 5)} đều hợp lệ. Lần chấm ngoài vùng, GPS kém hoặc sai thiết bị sẽ hiện ở đây.`} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Thời gian</th><th>Nhân viên</th><th>Loại</th><th>Lý do</th><th>Khoảng cách · sai số GPS</th><th>Địa điểm gần nhất</th><th>Thiết bị</th></tr></thead><tbody>
            {!data && !error ? <SkeletonRows cols={7} rows={6} /> : null}
            {(data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{fmtDateTime(e.occurredAt, tz)}{e.offline ? <span className="source-tag">offline</span> : null}</td>
                <td><Person name={e.employee.fullName} sub={`${e.employee.code} · ${e.employee.department ?? "—"}`} seed={e.employee.code} /></td>
                <td>{e.kind === "in" ? "Vào ca" : "Ra ca"}</td>
                <td><span className="status bad">{REJECT_REASON[e.rejectReason ?? ""] ?? "Bị từ chối"}</span></td>
                <td>{e.distanceM != null ? meters(e.distanceM) : "—"} · ±{e.accuracyM != null ? Math.round(e.accuracyM) : "—"}{"\u00a0"}m</td>
                <td>{e.locationName ?? "—"}</td>
                <td>{e.deviceModel ?? "—"}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
    </>
  );
}

function Devices({ tz, tenantId }: { tz: string; tenantId: string }) {
  const me = useMe();
  const [status, setStatus] = useState<"pending" | "active" | "all">("pending");
  const { data: every, error, reload } = useApi<AdminDevice[]>("devices?status=all", { tables: ["employee_devices"], tenantId });
  const count = (k: typeof status) => (every ?? []).filter((d) => k === "all" || d.status === k).length;
  const data = every ? every.filter((d) => status === "all" || d.status === status) : null;
  const { busy, run } = useAction();
  const [ask, setAsk] = useState<null | { d: AdminDevice; action: "reject" | "revoke" }>(null);
  const manage = can(me, "attendance.device.manage");
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar"><div className="segmented">{([["pending", "Chờ duyệt"], ["active", "Đang dùng"], ["all", "Tất cả"]] as const).map(([k, l]) => <button key={k} className={status === k ? "active" : ""} onClick={() => setStatus(k)}>{l}<span className="n">{count(k)}</span></button>)}</div></div>
        {data && !data.length ? <Empty title={status === "pending" ? "Không có thiết bị chờ duyệt" : "Chưa có thiết bị"} text={status === "pending" ? "Khi nhân viên đổi điện thoại, yêu cầu đổi thiết bị chấm công sẽ chờ bạn duyệt ở đây." : undefined} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Thiết bị</th><th>Đăng ký</th><th>Dùng gần nhất</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {!data && !error ? <SkeletonRows cols={6} rows={6} person /> : null}
            {(data ?? []).map((d) => (
              <tr key={d.id}>
                <td><Person name={d.employee.fullName} sub={d.employee.code} seed={d.employee.code} /></td>
                <td>{d.deviceModel ?? "—"}<br /><small className="muted">{d.platform === "ios" ? "iOS" : "Android"} {d.osVersion ?? ""} · app {d.appVersion ?? "—"}</small></td>
                <td>{fmtDateTime(d.registeredAt, tz)}</td>
                <td>{fmtDateTime(d.lastSeenAt, tz)}</td>
                <td><Status v={DEVICE[d.status]} />{d.decisionReason ? <><br /><small className="muted">{d.decisionReason}{d.decidedBy ? ` · ${d.decidedBy}` : ""}</small></> : null}</td>
                <td>{manage ? <span className="row-actions">
                  {d.status === "pending" ? <><button className="btn small primary" disabled={!!busy} onClick={() => run(d.id, () => call("POST", `devices/${d.id}/approve`, {}), `Đã duyệt ${d.deviceModel ?? "thiết bị"} cho ${d.employee.fullName}`).then(() => reload())}>{busy === d.id ? "Đang duyệt…" : "Duyệt"}</button><button className="btn small" onClick={() => setAsk({ d, action: "reject" })}>Từ chối</button></> : null}
                  {d.status === "active" ? <button className="btn small" onClick={() => setAsk({ d, action: "revoke" })}>Thu hồi</button> : null}
                </span> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {ask ? <ReasonModal title={`${ask.action === "reject" ? "Từ chối" : "Thu hồi"} ${ask.d.deviceModel ?? "thiết bị"} của ${ask.d.employee.fullName}`} label="Lý do (nhân viên sẽ thấy trên app)" danger
        ok={ask.action === "reject" ? "Đã từ chối thiết bị" : "Đã thu hồi thiết bị"} go={(reason) => call("POST", `devices/${ask.d.id}/${ask.action}`, { reason })} onClose={() => setAsk(null)} onDone={reload} /> : null}
    </>
  );
}

export default function Page() { return <Suspense><AttendancePage /></Suspense>; }
