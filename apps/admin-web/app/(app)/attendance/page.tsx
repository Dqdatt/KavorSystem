"use client";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminAttendanceEvent, AdminDevice, AttendanceBoard, TodayRow } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { DEVICE, Empty, Icon, LoadError, Person, REJECT_REASON, Status, can, dur, fmtDate, fmtDateTime, fmtTime, longDate, meters, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { MonthTab } from "./month";
import { OvertimeTab } from "./overtime";

type Tab = "month" | "today" | "rejected" | "devices" | "overtime";
const TABS: Array<[Tab, string, string?]> = [["month", "Bảng công"], ["today", "Hôm nay"], ["overtime", "Làm thêm giờ", "overtime.read"], ["rejected", "Bị từ chối"], ["devices", "Thiết bị"]];

function AttendancePage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "today";
  const [action, setAction] = useState<ReactNode>(null);
  const go = (t: Tab) => router.replace(`/attendance?tab=${t}`, { scroll: false });
  return (
    <section className="page active">
      <div className="page-head">
        <div><p>{tab === "month" ? "Tổng hợp bản ghi, bất thường và điều chỉnh trước khi khóa kỳ." : tab === "overtime" ? "Giờ làm thêm theo tháng, hệ số theo loại ngày và mức dùng so với giới hạn luật/công ty." : tab === "today" ? "Giờ vào/ra hợp lệ theo ca áp dụng cho từng người; cập nhật trực tiếp khi nhân viên chấm công." : tab === "rejected" ? "Lần chấm công bị máy chủ từ chối: ngoài vùng, GPS kém chính xác." : "Mỗi nhân viên chấm công trên một máy; máy mới chờ HR duyệt."}</p></div>
        <div className="head-actions">{tab === "month" ? action : null}
          <div className="segmented" role="tablist">{TABS.filter(([, , perm]) => !perm || can(me, perm)).map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => go(k)}>{label}</button>)}</div></div>
      </div>
      {tab === "month" ? <MonthTab setAction={setAction} /> : tab === "overtime" ? <OvertimeTab /> : tab === "today" ? <Today tz={me.tenant.timezone} tenantId={me.tenant.id} /> : tab === "rejected" ? <Rejected tz={me.tenant.timezone} tenantId={me.tenant.id} /> : <Devices tz={me.tenant.timezone} tenantId={me.tenant.id} />}
    </section>
  );
}

const STATE: Record<TodayRow["state"], [string, string]> = { working: ["Đang trong ca", ""], done: ["Đã xong ca", "info"], not_started: ["Chưa vào ca", "muted"], absent: ["Vắng / thiếu công", "bad"], no_shift: ["Chưa có ca", "warn"] };

function Today({ tz, tenantId }: { tz: string; tenantId: string }) {
  const [date, setDate] = useState(tenantToday(tz));
  const [filter, setFilter] = useState<"all" | "late" | "not_started" | "rejected">("all");
  const [q, setQ] = useState("");
  const { data: b, error, reload } = useApi<AttendanceBoard>(`attendance/board?date=${date}`, { tables: ["attendance_events", "employee_devices"], tenantId });
  const rows = useMemo(() => (b?.rows ?? []).filter((r) =>
    (filter === "all" || (filter === "late" ? r.late : filter === "not_started" ? r.state === "not_started" || r.state === "absent" : r.rejectedCount > 0))
    && (!q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()))), [b, filter, q]);
  const s = b?.summary;
  return (
    <>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Đã vào ca</span><strong>{s ? `${s.present}/${s.inScope}` : "—"}</strong><small>{longDate(date)}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Đi muộn</span><strong>{s?.late ?? "—"}</strong><small>Sau giờ vào ca + ân hạn</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="calendar" /></span><span className="metric-copy"><span>Chưa vào ca</span><strong>{s?.notYet ?? "—"}</strong><small>Có ca, chưa có giờ vào</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Bị từ chối</span><strong>{s?.rejected ?? "—"}</strong><small>{s?.devicesPending ? `${s.devicesPending} thiết bị chờ duyệt` : "Không có thiết bị chờ duyệt"}</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" /></label>
          {([["all", `Tất cả ${b?.rows.length ?? ""}`], ["late", `Đi muộn ${s?.late ?? ""}`], ["not_started", "Chưa vào ca"], ["rejected", "Có bản ghi bị từ chối"]] as const).map(([k, l]) => (
            <button key={k} className={`filter-chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <span className="toolbar-spacer" />
          <input className="select" type="date" value={date} max={tenantToday(tz)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Ngày" />
        </div>
        {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Ca</th><th>Giờ vào</th><th>Giờ ra</th><th>Trạng thái</th></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.employee.id}>
                <td><Person name={r.employee.fullName} sub={r.employee.code} seed={r.employee.code} /></td>
                <td>{r.employee.department ?? "—"}</td>
                <td>{r.shift ? <>{r.shift.name}<br /><small className="muted">{r.shift.start}–{r.shift.end}</small></> : <span className="muted">—</span>}</td>
                <td>{r.clockIn ? <><b className={r.late ? "text-red" : ""}>{fmtTime(r.clockIn.at, tz)}</b>{r.late ? <small className="text-red"> · muộn {dur(r.clockIn.lateMinutes)}</small> : null}{r.clockIn.offline ? <span className="source-tag">offline</span> : null}<br /><small className="muted">{r.clockIn.location ?? ""}</small></> : "—"}</td>
                <td>{r.clockOut ? <><b className={r.early ? "text-red" : ""}>{fmtTime(r.clockOut.at, tz)}</b>{r.early ? <small className="text-red"> · sớm {dur(r.clockOut.earlyMinutes)}</small> : null}{r.clockOut.offline ? <span className="source-tag">offline</span> : null}</> : "—"}</td>
                <td><Status v={STATE[r.state]} />{r.rejectedCount ? <span className="source-tag" title="Số lần bị từ chối">{r.rejectedCount} bị từ chối</span> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
    </>
  );
}

function Rejected({ tz, tenantId }: { tz: string; tenantId: string }) {
  const to = tenantToday(tz);
  const [from, setFrom] = useState(() => new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400_000).toISOString().slice(0, 10));
  const { data, error, reload } = useApi<AdminAttendanceEvent[]>(`attendance/rejected?from=${from}&to=${to}`, { tables: ["attendance_events"], tenantId });
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar"><span className="muted" style={{ fontSize: 12.5 }}>Từ ngày</span><input className="select" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /><span className="muted" style={{ fontSize: 12.5 }}>đến {fmtDate(to)}</span></div>
        {data && !data.length ? <Empty title="Không có bản ghi bị từ chối" text="Mọi lần chấm công trong khoảng này đều hợp lệ." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Thời gian</th><th>Nhân viên</th><th>Loại</th><th>Lý do</th><th>Khoảng cách · sai số GPS</th><th>Địa điểm gần nhất</th><th>Thiết bị</th></tr></thead><tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{fmtDateTime(e.occurredAt, tz)}{e.offline ? <span className="source-tag">offline</span> : null}</td>
                <td><Person name={e.employee.fullName} sub={`${e.employee.code} · ${e.employee.department ?? "—"}`} seed={e.employee.code} /></td>
                <td>{e.kind === "in" ? "Vào ca" : "Ra ca"}</td>
                <td><span className="status bad">{REJECT_REASON[e.rejectReason ?? ""] ?? "Bị từ chối"}</span></td>
                <td>{e.distanceM != null ? meters(e.distanceM) : "—"} · ±{e.accuracyM != null ? Math.round(e.accuracyM) : "—"} m</td>
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
  const [status, setStatus] = useState("pending");
  const { data, error, reload } = useApi<AdminDevice[]>(`devices?status=${status}`, { tables: ["employee_devices"], tenantId });
  const { busy, run } = useAction();
  const [ask, setAsk] = useState<null | { d: AdminDevice; action: "reject" | "revoke" }>(null);
  const manage = can(me, "attendance.device.manage");
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar">{([["pending", "Chờ duyệt"], ["active", "Đang dùng"], ["all", "Tất cả"]] as const).map(([k, l]) => <button key={k} className={`filter-chip ${status === k ? "active" : ""}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
        {data && !data.length ? <Empty title={status === "pending" ? "Không có thiết bị chờ duyệt" : "Chưa có thiết bị"} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Thiết bị</th><th>Đăng ký</th><th>Dùng gần nhất</th><th>Trạng thái</th><th /></tr></thead><tbody>
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
