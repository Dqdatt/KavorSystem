"use client";
/* Làm thêm giờ (thiết kế bổ sung — prototype HR chưa có trang OT): tổng hợp theo tháng dương lịch trong phạm vi overtime.read,
   giờ đã duyệt theo loại ngày, mức dùng so với giới hạn tháng, danh sách đơn OT của tháng (bấm để xem/duyệt). */
import { useState } from "react";
import type { OvertimeBoard, RequestItem } from "@kavor/contracts";
import { useApi } from "../../_lib/client";
import { Empty, Icon, LoadError, Person, Status, fmtDateTime, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, RequestModal, requestSummary } from "../../_ui/request";
import { Select } from "@kavor/web-ui";

const h = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export function OvertimeTab() {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const { data: b, error, reload } = useApi<OvertimeBoard>(`overtime${month ? `?month=${month}` : ""}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const [open, setOpen] = useState<RequestItem | null>(null);
  const cur = b?.month ?? month;
  const m = b?.metrics;
  return (
    <>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="clock" /></span><span className="metric-copy"><span>Giờ OT đã duyệt</span><strong>{m ? h(m.approvedHours) : "—"}</strong><small>trong tháng</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="checks" /></span><span className="metric-copy"><span>Đang chờ duyệt</span><strong>{m ? h(m.pendingHours) : "—"}</strong><small>giờ</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="users" /></span><span className="metric-copy"><span>Nhân viên có OT</span><strong>{m ? m.employees : "—"}</strong><small>trong tháng</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Gần giới hạn</span><strong>{m ? m.nearLimit : "—"}</strong><small>từ 80% giới hạn tháng</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <b style={{ fontSize: 12 }}>Tổng hợp theo nhân viên</b>
          <span className="toolbar-spacer" />
          <Select className="select" value={cur ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng">
            {cur ? [0, -1, -2, -3, -4, -5].map((n) => shift(cur === b?.month && !month ? cur : cur, n)).map((x) => <option key={x} value={x}>Tháng {Number(x.slice(5))}/{x.slice(0, 4)}</option>) : null}
          </Select>
        </div>
        {b && !b.rows.length ? <Empty title="Chưa có ai đăng ký làm thêm" text="Nhân viên đăng ký OT trên app; đơn đi qua luồng Quản lý → HR." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Đã duyệt</th><th>Ngày thường</th><th>Ngày nghỉ</th><th>Ngày lễ</th><th>Đang chờ</th><th>So với giới hạn tháng</th><th>Cả năm</th></tr></thead><tbody>
            {(b?.rows ?? []).map((r) => {
              const used = r.approvedHours + r.pendingHours, pct = r.monthLimit ? Math.round((used / r.monthLimit) * 100) : null;
              return (
                <tr key={r.employee.id}>
                  <td><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.code} /></td>
                  <td>{r.employee.department ?? "—"}</td>
                  <td className="num"><b>{h(r.approvedHours)} giờ</b></td>
                  <td className="num">{h(r.byKind.workday)}</td><td className="num">{h(r.byKind.weekend)}</td><td className="num">{h(r.byKind.holiday)}</td>
                  <td className="num">{r.pendingHours ? h(r.pendingHours) : "—"}</td>
                  <td>{pct == null ? "—" : <Status v={[`${h(used)}/${h(r.monthLimit!)} giờ · ${pct}%`, pct >= 100 ? "bad" : pct >= 80 ? "warn" : ""]} />}</td>
                  <td className="num">{h(r.yearHours)}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Đơn làm thêm trong tháng</h3><p>Hệ số chụp lại theo quy định lúc gửi; OT đã duyệt là đầu vào bảng lương.</p></div></div>
        {b && !b.requests.length ? <Empty title="Không có đơn nào" /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã đơn</th><th>Người gửi</th><th>Nội dung</th><th>Gửi lúc</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {(b?.requests ?? []).map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td><b>{r.no}</b></td><td>{r.requester.fullName}</td><td>{requestSummary(r)}</td><td className="nowrap">{fmtDateTime(r.submittedAt, me.tenant.timezone)}</td>
                <td><Status v={REQUEST_STATUS[r.status]} /></td>
                <td><button className={`btn small ${r.myTaskId ? "primary" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.myTaskId ? "Xem & duyệt" : "Xem"}</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {open ? <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => void reload()} /> : null}
    </>
  );
}
