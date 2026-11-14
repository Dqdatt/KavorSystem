"use client";
/* Làm thêm giờ (tab ot của PAGES['cham-cong'] v2: 4 chỉ số, tổng hợp theo người bằng vạch giờ, đơn trong tháng; chọn tháng là thêm): tổng hợp theo tháng dương lịch trong phạm vi overtime.read,
   giờ đã duyệt theo loại ngày, mức dùng so với giới hạn tháng, danh sách đơn OT của tháng (bấm để xem/duyệt). */
import { useState } from "react";
import { overtimeAttendanceShort, overtimeAttendanceText, type OvertimeBoard, type RequestItem } from "@kavor/contracts";
import { useApi } from "../../_lib/client";
import { vs, PageActions, Empty, Icon, LoadError, Person, Status, fmtDateTime, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, RequestModal, requestSummary } from "../../_ui/request";
import { Select, SkeletonRows, Hint } from "@kavor/web-ui";

const h = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/* Vạch giờ như prototype: a = đã duyệt, w = đang chờ, còn lại để trống (tối đa n vạch) */
function Ticks({ n, a, w }: { n: number; a: number; w: number }) {
  return <span className="ticks" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < a ? "a" : i < a + w ? "w" : undefined} />)}</span>;
}

export function OvertimeTab() {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const { data: b, error, reload } = useApi<OvertimeBoard>(`overtime${month ? `?month=${month}` : ""}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const [open, setOpen] = useState<RequestItem | null>(null);
  const cur = b?.month ?? month;
  const m = b?.metrics;
  const pend = (b?.requests ?? []).filter((r) => r.status === "pending");
  const limit = b?.rows.find((r) => r.monthLimit)?.monthLimit ?? null;
  return (
    <>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="checks" /></span><span className="metric-copy"><span>Giờ OT đã duyệt</span><strong>{m ? h(m.approvedHours) : "—"}<small> giờ</small></strong><small>{cur ? `Trong tháng ${Number(cur.slice(5))}` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="checks" /></span><span className="metric-copy"><span>Đang chờ duyệt</span><strong className={m?.pendingHours ? "tone-warn" : ""}>{m ? h(m.pendingHours) : "—"}<small> giờ</small></strong><small>{m ? vs(`${pend.length} đơn${pend.length === 1 ? ` | ${pend[0]!.no}` : ""}`) : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="clock" /></span><span className="metric-copy"><span>Nhân viên có OT</span><strong>{m ? m.employees : "—"}</strong><small>{b && m?.employees === 1 ? b.rows[0]?.employee.fullName : "Trong tháng"}</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Gần giới hạn</span><strong>{m ? m.nearLimit : "—"}</strong><small>{limit ? `Từ 80% của ${h(limit)} giờ/tháng` : "Từ 80% giới hạn tháng"}</small></span></article>
      </div>
      <div className="grid one-two">
        <article className="card">
          <PageActions><Select className="select" value={cur ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng">
              {cur ? [0, -1, -2, -3, -4, -5].map((n) => shift(cur, n)).map((x) => <option key={x} value={x}>Tháng {Number(x.slice(5))}/{x.slice(0, 4)}</option>) : null}
            </Select></PageActions>
          <div className="card-head"><div><h3>Tổng hợp theo nhân viên</h3></div></div>
          {b && !b.rows.length ? <Empty title="Chưa có ai đăng ký làm thêm" text="Nhân viên đăng ký OT trên app; đơn đi qua luồng Quản lý → HR." /> : (
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!b && !error ? <SkeletonRows cols={1} rows={3} /> : null}
              {(b?.rows ?? []).map((r) => {
                const cap = r.monthLimit ?? 0;
                return (
                  <div key={r.employee.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="rsp"><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.department ?? r.employee.code} /><b className="num">{cap ? `${h(r.approvedHours)} / ${h(cap)} giờ` : `${h(r.approvedHours)} giờ`}</b></div>
                    {cap ? <Ticks n={Math.round(cap)} a={Math.round(r.approvedHours)} w={Math.round(r.pendingHours)} /> : null}
                    <span className="muted" style={{ fontSize: 12.5 }}>{r.pendingHours ? <>{h(r.pendingHours)} giờ đang chờ duyệt<i className="vs" /></> : ""}Ngày thường {h(r.byKind.workday)} giờ<i className="vs" />nghỉ {h(r.byKind.weekend)}<i className="vs" />lễ {h(r.byKind.holiday)}<i className="vs" />cả năm {h(r.yearHours)} giờ</span>
                  </div>
                );
              })}
            </div>
          )}
        </article>
        <article className="card">
          <div className="card-head"><div><h3>Đơn làm thêm trong tháng<Hint text="Hệ số chụp lại theo quy định lúc gửi; OT đã duyệt là đầu vào bảng lương." /></h3></div></div>
          {b && !b.requests.length ? <Empty title="Không có đơn nào" /> : (
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã đơn</th><th>Người gửi</th><th>Nội dung</th><th>Chấm công thực tế</th><th>Trạng thái</th></tr></thead><tbody>
              {!b && !error ? <SkeletonRows cols={5} rows={4} /> : null}
              {(b?.requests ?? []).map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td><b className="num">{r.no}</b></td><td>{r.requester.fullName}</td><td>{vs(requestSummary(r))}</td>
                  <td>{r.type !== "overtime" || !r.attendance ? <span className="muted">—</span>
                    : <Status v={[overtimeAttendanceText(r.attendance).replace(/ giờ OT$/, " giờ"), overtimeAttendanceShort(r.attendance) ? "bad" : r.attendance.checked ? "" : "muted"]} />}</td>
                  <td><Status v={REQUEST_STATUS[r.status]} />{r.myTaskId ? <span className="source-tag">cần bạn duyệt</span> : null}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </article>
      </div>
      {open ? <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => void reload()} /> : null}
    </>
  );
}
