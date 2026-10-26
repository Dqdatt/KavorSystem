"use client";
/* Tổng quan nền tảng: bám page-overview của Kavor Console Prototype.html với số liệu thật hiện có (tenant, nhân sự,
   chống mất quyền). Biểu đồ API traffic, uptime, MRR của prototype chưa có nguồn dữ liệu nên chưa hiển thị. */
import Link from "next/link";
import type { ConsoleOverview, ConsoleTenant } from "@kavor/contracts";
import { useApi } from "../_lib/client";
import { Empty, Icon, LoadError, Person, Status, fmtDate, num } from "../_ui/kit";
import { PLAN, TSTATUS, adminHealth } from "../_ui/labels";
import { nearLimit, usageTone } from "../_ui/tenant-ops";

export default function Overview() {
  const { data: o, error, reload } = useApi<ConsoleOverview>("overview");
  const tenants = useApi<ConsoleTenant[]>("tenants").data;
  /* Cần chú ý: chống mất quyền (dưới 2 Tenant Admin), gần giới hạn nhân sự, đang tạm khóa */
  const attention = (tenants ?? []).filter((t) => t.status !== "closed" && (t.admins.active < 2 || nearLimit(t) || t.status === "suspended"));
  const issue = (t: ConsoleTenant): [string, string] => (t.status === "suspended" ? TSTATUS.suspended : t.admins.active < 2 ? adminHealth(t) : ["Gần giới hạn nhân sự", "warn"]);
  return (
    <section className="page active">
      <LoadError error={error} retry={reload} />
      {o && o.pendingRecoveries > 0 ? (
        <div className="banner"><span className="banner-icon"><Icon name="key" /></span>
          <span className="banner-copy"><b>{o.pendingRecoveries} yêu cầu khôi phục chủ sở hữu đang chờ duyệt</b><span>Cần một nhân viên Kavor khác người tạo duyệt trong 24 giờ.</span></span>
          <Link className="btn" href="/recoveries">Xem yêu cầu <Icon name="arrow" /></Link></div>
      ) : o && o.noActiveAdminTenants > 0 ? (
        <div className="banner"><span className="banner-icon"><Icon name="alert" /></span>
          <span className="banner-copy"><b>{o.noActiveAdminTenants} tenant chưa có Tenant Admin hoạt động</b><span>Khách chưa kích hoạt lời mời hoặc không còn ai quản trị.</span></span>
          <Link className="btn" href="/tenants">Xem tenant <Icon name="arrow" /></Link></div>
      ) : null}
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="building" /></span><span className="metric-copy"><span>Tenant hoạt động</span><strong>{o ? num(o.tenants.active) : "—"}</strong><small>{o ? `${num(o.tenants.trial)} trial · ${num(o.tenants.suspended)} tạm khóa` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="user" /></span><span className="metric-copy"><span>Nhân sự trên Kavor</span><strong>{o ? num(o.employees) : "—"}</strong><small>{o ? `${num(o.accounts)} đã kích hoạt · ${num(o.nearLimitTenants)} tenant gần giới hạn` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="shield" /></span><span className="metric-copy"><span>Chỉ 1 Tenant Admin</span><strong>{o ? num(o.singleAdminTenants) : "—"}</strong><small>Nên có ít nhất 2</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="key" /></span><span className="metric-copy"><span>Khôi phục chờ duyệt</span><strong>{o ? num(o.pendingRecoveries) : "—"}</strong><small>Hai nhân viên Kavor</small></span></article>
      </div>
      <div className="grid two-one">
        <article className="card"><div className="card-head"><div><h3>Tenant cần chú ý</h3><p>Dưới 2 Tenant Admin, gần giới hạn nhân sự hoặc đang tạm khóa</p></div><Link className="btn small" href="/tenants">Xem tất cả</Link></div>
          {tenants && !attention.length ? <Empty title="Không có tenant cần chú ý" /> : (
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Doanh nghiệp</th><th>Gói</th><th>Nhân sự</th><th>Tình trạng</th></tr></thead><tbody>
              {attention.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => { location.href = `/tenants?id=${t.id}`; }}>
                  <td><Person name={t.name} seed={t.code} sub={t.code} /></td><td>{PLAN[t.plan]}</td><td className={`num ${usageTone(t)}`}>{num(t.employees)}/{num(t.employeeLimit)}</td><td><Status v={issue(t)} /></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </article>
        <article className="card"><div className="card-head"><div><h3>Tenant mới tạo</h3><p>Gần nhất</p></div></div>
          <div className="notification-list">
            {(o?.recentTenants ?? []).map((t) => (
              <div key={t.id} className="notification"><span className="metric-icon"><Icon name="building" /></span>
                <span className="notification-copy"><b>{t.name}</b><span>{t.code} · {PLAN[t.plan]} · {adminHealth(t)[0]}</span></span><time>{fmtDate(t.createdAt)}</time></div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
