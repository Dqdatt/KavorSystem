"use client";
/* Chế độ hỗ trợ (thiết kế bổ sung — prototype không có màn này): banner đếm ngược suốt phiên, chỉ đọc theo phạm vi tenant đã duyệt.
   Mỗi lần mở một phạm vi là một lần ghi audit tenant thấy; hết hạn/thu hồi thì API từ chối ngay và màn này ẩn dữ liệu. */
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { REQUEST_TYPES, STEP_RESOLVERS, SUPPORT_SCOPES, type RequestType, type StepResolver, type SupportScope, type SupportSession, type SupportView } from "@kavor/contracts";
import { ApiFailure, call } from "../../../_lib/client";
import { ACCOUNT, Empty, Icon, Status, fmtDate, fmtDateTime, num, useAction } from "../../../_ui/kit";
import { ACTION } from "../../../_ui/labels";

const EMP: Record<string, [string, string]> = { preboarding: ["Chờ nhận việc", "info"], active: ["Đang làm", ""], suspended: ["Tạm ngưng", "warn"], on_leave: ["Nghỉ dài hạn", "info"], leaving: ["Sắp nghỉ", "warn"], terminated: ["Đã nghỉ", "muted"] };
const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const left = (iso: string) => { const s = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export default function SupportMode({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<SupportSession | null>(null);
  const [scope, setScope] = useState<SupportScope | null>(null);
  const [view, setView] = useState<SupportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const { busy, run } = useAction();

  const load = useCallback(async (s?: SupportScope) => {
    try {
      const first = s ?? (await call<SupportSession[]>("GET", "support")).find((x) => x.id === id)?.scopes[0];
      if (!first) { setError("Không tìm thấy phiên hỗ trợ."); return; }
      const v = await call<SupportView>("GET", `support/${id}/view/${first}`);
      setScope(first); setView(v); setSession(v.session); setError(null);
    } catch (e) { setView(null); setError(e instanceof ApiFailure ? e.message : "Hệ thống đang gặp sự cố."); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  /* Đếm ngược; hết giờ thì ẩn dữ liệu ngay (API cũng từ chối các lần xem sau) */
  useEffect(() => {
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (session?.expiresAt && Date.parse(session.expiresAt) <= Date.now()) { setView(null); setError("Phiên hỗ trợ đã hết thời hạn."); }
    }, 1000);
    return () => clearInterval(t);
  }, [session?.expiresAt]);

  const end = () => run("end", async () => { await call("POST", `support/${id}/close`); setView(null); setError("Bạn đã kết thúc phiên hỗ trợ."); }, "Đã kết thúc phiên hỗ trợ");
  const tz = "Asia/Ho_Chi_Minh";
  return (
    <section className="page active">
      {session && !error ? (
        <div className="banner bad"><span className="banner-icon"><Icon name="lock" /></span>
          <span className="banner-copy"><b>Chế độ hỗ trợ · {session.tenant.name} · còn {session.expiresAt ? left(session.expiresAt) : "—"}</b>
            <span>{session.ticket} · chỉ đọc · mọi lần xem đều ghi vào nhật ký của khách · hết hạn {fmtDateTime(session.expiresAt, tz)}</span></span>
          <button className="btn" disabled={!!busy} onClick={() => void end()}>Kết thúc phiên</button></div>
      ) : null}
      {error ? <article className="card"><Empty title={error} text="Muốn xem tiếp thì tạo yêu cầu mới để tenant duyệt." /><div className="card-body"><Link className="btn" href="/support">Về Support access</Link></div></article> : null}
      {session && !error ? (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          {session.scopes.map((s) => <button key={s} className={`filter-chip ${scope === s ? "active" : ""}`} onClick={() => void load(s)}>{SUPPORT_SCOPES[s].label}</button>)}
        </div>
      ) : null}
      {view && !error ? <ScopeView v={view} tz={tz} /> : null}
    </section>
  );
}

function ScopeView({ v, tz }: { v: SupportView; tz: string }) {
  if (v.scope === "directory") return (
    <article className="card"><div className="card-head"><div><h3>Danh sách nhân sự</h3><p>{num(v.data.length)} hồ sơ · không có liên hệ, lương</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã</th><th>Họ tên</th><th>Phòng ban</th><th>Chức danh</th><th>Hồ sơ</th><th>Tài khoản</th></tr></thead><tbody>
        {v.data.map((e) => <tr key={e.code}><td><b>{e.code}</b></td><td>{e.fullName}</td><td>{e.department ?? "—"}</td><td>{e.position ?? "—"}</td><td><Status v={EMP[e.status] ?? [e.status, ""]} /></td><td><Status v={ACCOUNT[e.account]} /></td></tr>)}
      </tbody></table></div></article>
  );
  if (v.scope === "audit") return (
    <article className="card"><div className="card-head"><div><h3>Nhật ký hoạt động 30 ngày</h3><p>Không có dữ liệu trước/sau</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Thời gian</th><th>Người làm</th><th>Hành động</th><th>Đối tượng</th></tr></thead><tbody>
        {v.data.map((a, i) => <tr key={i}><td className="nowrap">{fmtDateTime(a.at, tz)}</td><td>{a.actor}</td><td>{ACTION[a.action] ?? a.action}</td><td className="muted">{a.resourceType}</td></tr>)}
      </tbody></table></div></article>
  );
  const d = v.data;
  return (
    <div className="grid" style={{ gap: 14 }}>
      <article className="card"><div className="card-head"><h3>Công ty</h3></div><div className="detail-list">
        <div className="detail-row"><span>Mã · tên</span><b>{d.tenant.code} · {d.tenant.name}</b></div>
        <div className="detail-row"><span>Gói</span><b>{d.tenant.plan} · {num(d.tenant.employees)}/{num(d.tenant.employeeLimit)} nhân sự</b></div>
        <div className="detail-row"><span>Múi giờ</span><b>{d.tenant.timezone}</b></div>
      </div></article>
      <article className="card"><div className="card-head"><h3>Quy định đang hiệu lực</h3></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Quy định</th><th>Phiên bản</th><th>Từ ngày</th><th>Cấu hình</th></tr></thead><tbody>
          {d.rules.map((r, i) => <tr key={i}><td><b>{r.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{r.kind}</div></td><td>v{r.versionNo}</td><td>{fmtDate(r.effectiveFrom)}</td><td style={{ whiteSpace: "normal", overflowWrap: "anywhere", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{JSON.stringify(r.config)}</td></tr>)}
        </tbody></table></div></article>
      <article className="card"><div className="card-head"><h3>Luồng duyệt</h3></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Loại đơn</th><th>Phiên bản</th><th>Các bước</th></tr></thead><tbody>
          {d.workflows.map((w, i) => <tr key={i}><td><b>{REQUEST_TYPES[w.requestType as RequestType] ?? w.name}</b></td><td>v{w.versionNo} · từ {fmtDate(w.effectiveFrom)}</td>
            <td style={{ whiteSpace: "normal" }}>{(Array.isArray(w.steps) ? (w.steps as Array<{ resolver: StepResolver; slaHours?: number }>) : []).map((s) => `${STEP_RESOLVERS[s.resolver] ?? s.resolver}${s.slaHours ? ` (${s.slaHours} giờ)` : ""}`).join(" → ")}</td></tr>)}
        </tbody></table></div></article>
      <div className="grid two-one" style={{ gap: 14 }}>
        <article className="card"><div className="card-head"><h3>Ca làm việc và địa điểm</h3></div><div className="detail-list">
          {d.shifts.map((s) => <div key={s.code} className="detail-row"><span>{s.name}</span><b>{s.start}–{s.end}{s.workDays ? ` · ${s.workDays.map((x) => WD[x]).join(", ")}` : ""}</b></div>)}
          {d.locations.map((l) => <div key={l.code} className="detail-row"><span>{l.name}</span><b>Bán kính {l.radiusM} m{l.active ? "" : " · ngưng dùng"}</b></div>)}
        </div></article>
        <article className="card"><div className="card-head"><h3>Ngày lễ {new Date().getFullYear()}</h3></div><div className="detail-list">
          {d.holidays.map((h) => <div key={h.date + h.name} className="detail-row"><span>{fmtDate(h.date)}</span><b>{h.name}{h.scope === "company" ? " · riêng công ty" : ""}</b></div>)}
        </div></article>
      </div>
      <article className="card"><div className="card-head"><div><h3>Vai trò và quyền</h3><p>Chỉ số người được gán, không có tên</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Vai trò</th><th>Người được gán</th><th>Quyền</th></tr></thead><tbody>
          {d.roles.map((r) => <tr key={r.code}><td><b>{r.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{r.code}{r.system ? " · hệ thống" : ""}</div></td><td className="num">{num(r.members)}</td>
            <td style={{ whiteSpace: "normal", fontSize: 11 }}>{r.permissions.join(", ")}</td></tr>)}
        </tbody></table></div></article>
    </div>
  );
}
