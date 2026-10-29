"use client";
import Link from "next/link";
import type { AdminOverview, OverviewDay, SetupChecklist } from "@kavor/contracts";
import { useApi } from "../_lib/client";
import { ACCOUNT, Empty, Icon, LoadError, Person, Status, can, fmtDate, num, useMe } from "../_ui/kit";

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/* Biểu đồ cột có mặt + đường đi muộn 7 ngày, cùng kiểu vẽ với prototype (viewBox 720×240) */
function PresenceChart({ days }: { days: OverviewDay[] }) {
  /* Trục số nguyên: đỉnh là bội của 4 để 5 vạch chia đều */
  const top = Math.max(4, Math.ceil(Math.max(...days.map((d) => d.present), 1) / 4) * 4);
  const y = (v: number) => 198 - (v / top) * 168;
  const step = 650 / Math.max(1, days.length);
  const cx = (i: number) => 42 + step * i + step / 2;
  const ticks = [0, 1, 2, 3, 4].map((k) => (top / 4) * k);
  return (
    <svg className="chart-svg" viewBox="0 0 720 240" role="img" aria-label="Biểu đồ có mặt và đi muộn 7 ngày">
      <defs><pattern id="dotsHR" width="16" height="16" patternUnits="userSpaceOnUse"><circle className="dots" cx="1" cy="1" r="1" /></pattern></defs>
      <rect x="42" y="12" width="650" height="186" fill="url(#dotsHR)" />
      <g className="grid">{ticks.map((t) => <path key={t} d={`M42 ${y(t)}h650`} />)}</g>
      <g className="bars">{days.map((d, i) => <rect key={d.date} x={cx(i) - 23} y={y(d.present)} width="46" height={Math.max(0, 198 - y(d.present))} rx="5"><title>{`${fmtDate(d.date)}: có mặt ${d.present}, đi muộn ${d.late}, bị từ chối ${d.rejected}`}</title></rect>)}</g>
      <path d={days.map((d, i) => `${i ? "L" : "M"}${cx(i)} ${y(d.late)}`).join(" ")} className="line" strokeWidth="2.2" />
      <g className="points" strokeWidth="2">{days.map((d, i) => <circle key={d.date} cx={cx(i)} cy={y(d.late)} r="4" />)}</g>
      <g>
        {ticks.map((t) => <text key={t} x="10" y={y(t) + 4}>{t}</text>)}
        {days.map((d, i) => { const dt = new Date(`${d.date}T12:00:00Z`); return <text key={d.date} x={cx(i) - 16} y="222">{`${WD[dt.getUTCDay()]} ${dt.getUTCDate()}`}</text>; })}
      </g>
    </svg>
  );
}

export default function Overview() {
  const me = useMe();
  const { data: o, error, reload } = useApi<AdminOverview>("overview", { tables: ["attendance_events", "employee_devices", "employees"], tenantId: me.tenant.id });
  const att = can(me, "attendance.read");
  /* Checklist thiết lập ban đầu chỉ nhắc người cấu hình được công ty */
  const setup = useApi<SetupChecklist>(can(me, "tenant.settings.manage") ? "settings/checklist" : null).data;
  const pct = o && o.activeEmployees ? `${((o.presentToday / o.activeEmployees) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "—";

  return (
    <section className="page active">
      <LoadError error={error} retry={reload} />
      {me.tenantAdminCount < 2 && can(me, "role.read") ? (
        <div className="banner">
          <span className="banner-icon"><Icon name="shield" /></span>
          <span className="banner-copy"><b>Công ty chỉ có {me.tenantAdminCount} Tenant Admin</b><span>Nên có ít nhất 2 Tenant Admin để không mất quyền quản trị khi một người nghỉ hoặc mất tài khoản.</span></span>
        </div>
      ) : setup && setup.done < setup.total ? (
        <div className="banner">
          <span className="banner-icon"><Icon name="checks" /></span>
          <span className="banner-copy"><b>Thiết lập ban đầu: đã xong {setup.done}/{setup.total} bước</b><span>Còn: {setup.steps.filter((s) => s.state === "todo" || s.state === "warn").map((s) => s.title.toLowerCase()).slice(0, 3).join(", ")}.</span></span>
          <Link className="btn" href="/settings?tab=setup">Xem checklist <Icon name="arrow" /></Link>
        </div>
      ) : o && o.devicesPending > 0 ? (
        <div className="banner">
          <span className="banner-icon"><Icon name="phone" /></span>
          <span className="banner-copy"><b>{o.devicesPending} thiết bị đang chờ duyệt</b><span>Nhân viên chưa chấm công được trên máy mới cho tới khi HR duyệt.</span></span>
          <Link className="btn" href="/attendance?tab=devices">Duyệt thiết bị <Icon name="arrow" /></Link>
        </div>
      ) : null}

      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Nhân sự hoạt động</span><strong className="num">{o ? num(o.activeEmployees) : "—"}</strong><small>{o ? <><b className="delta down">{o.notActivated}</b> chưa kích hoạt</> : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="clock" /></span><span className="metric-copy"><span>Có mặt hôm nay</span><strong className="num">{o && att ? num(o.presentToday) : "—"}</strong><small>{att ? <><b className="delta">{pct}</b> tổng nhân sự</> : "Không có quyền xem chấm công"}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="alert" /></span><span className="metric-copy"><span>Đi muộn hôm nay</span><strong className="num">{o && att ? num(o.lateToday) : "—"}</strong><small>Theo ca và thời gian ân hạn</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="pin" /></span><span className="metric-copy"><span>Bị từ chối hôm nay</span><strong className="num">{o && att ? num(o.rejectedToday) : "—"}</strong><small>Ngoài vùng hoặc GPS kém</small></span></article>
      </div>

      {att ? (
        <div className="grid two-one">
          <article className="card chart-card">
            <div className="card-head no-line"><div><h3>Có mặt & đi muộn</h3><p>7 ngày gần nhất · trong phạm vi của bạn</p></div><div className="card-actions"><span className="chart-legend"><span><i className="green" />Có mặt</span><span><i className="dark" />Đi muộn</span></span></div></div>
            <div className="chart-wrap">{o ? <PresenceChart days={o.days} /> : null}</div>
          </article>
          <div className="mini-stack">
            <Link href="/attendance?tab=devices" className="card mini-stat" style={{ textDecoration: "none", color: "inherit" }}><span className="metric-icon amber"><Icon name="phone" /></span><span className="metric-copy"><span>Thiết bị chờ duyệt</span><strong className="num">{o?.devicesPending ?? "—"}</strong><small>Duyệt để nhân viên chấm công</small></span></Link>
            <Link href="/attendance?tab=rejected" className="card mini-stat" style={{ textDecoration: "none", color: "inherit" }}><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Bản ghi bị từ chối</span><strong className="num">{o?.rejectedToday ?? "—"}</strong><small>Hôm nay</small></span></Link>
            <Link href="/employees?account=pending" className="card mini-stat" style={{ textDecoration: "none", color: "inherit" }}><span className="metric-icon"><Icon name="mail" /></span><span className="metric-copy"><span>Chưa kích hoạt</span><strong className="num">{o?.notActivated ?? "—"}</strong><small>Gửi lại lời mời nếu cần</small></span></Link>
          </div>
        </div>
      ) : null}

      {can(me, "employee.read") ? (
        <article className="card">
          <div className="card-head"><div><h3>Nhân viên mới thêm</h3><p>5 hồ sơ gần nhất trong phạm vi của bạn</p></div><Link className="btn small" href="/employees">Xem tất cả</Link></div>
          {o && !o.recentEmployees.length ? <Empty title="Chưa có nhân viên" /> : (
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Ngày vào làm</th><th>Tài khoản</th></tr></thead><tbody>
              {(o?.recentEmployees ?? []).map((e) => (
                <tr key={e.id} className="clickable" onClick={() => { location.href = `/employees?id=${e.id}`; }}>
                  <td><Person name={e.fullName} sub={e.code} /></td><td>{e.department?.name ?? "—"}</td><td>{fmtDate(e.hireDate)}</td><td><Status v={ACCOUNT[e.account]} /></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </article>
      ) : null}
    </section>
  );
}
