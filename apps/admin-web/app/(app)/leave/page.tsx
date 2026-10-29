"use client";
/* Nghỉ phép: bám page-leave của Kavor HR Admin Prototype.html (4 chỉ số, bảng). Bảng số dư theo nhân viên, drawer sổ phép
   (biến động + điều chỉnh/nhập phép tồn) và danh sách loại nghỉ là thiết kế bổ sung; quy định phép năm sửa ở Cài đặt → Quy định. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { LEAVE_TX_KINDS, type EmployeeLeave, type LeaveBalance, type LeaveBoard, type RequestItem } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Drawer, Empty, ErrorLine, Field, Icon, LoadError, Person, Status, fmtDate, fmtDateTime, useAction, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, RequestModal, requestSummary } from "../../_ui/request";
import { Select } from "@kavor/web-ui";

const d1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? "+" : ""}${d1(n)}`;

export default function LeavePage() {
  const me = useMe();
  const thisYear = Number(new Date().getFullYear());
  const [year, setYear] = useState(thisYear);
  const { data: b, error, reload } = useApi<LeaveBoard>(`leave?year=${year}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (b?.rows ?? []).filter((r) => !q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase())), [b, q]);
  const m = b?.metrics;
  const granted = (b?.rows ?? []).reduce((n, r) => n + (r.balance ? r.balance.granted + r.balance.carry + r.balance.adjusted : 0), 0);
  return (
    <section className="page active">
      <div className="page-head"><div><h2>Quản lý nghỉ phép</h2><p>Theo dõi số dư và biến động phép năm {year}.</p></div>
        <div className="head-actions"><Link className="btn" href="/settings?tab=rules"><Icon name="settings" /> Quy định phép năm</Link></div></div>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="plane" /></span><span className="metric-copy"><span>Phép khả dụng</span><strong>{m ? d1(m.available) : "—"}</strong><small>ngày toàn công ty</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="checks" /></span><span className="metric-copy"><span>Đã sử dụng</span><strong>{m ? d1(m.used) : "—"}</strong><small>{m && granted ? `${((m.used / granted) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% đã cấp` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Đang giữ chỗ</span><strong>{m ? d1(m.pending) : "—"}</strong><small>ngày trong đơn chờ duyệt</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Sắp hết hạn</span><strong>{m ? d1(m.expiringCarry) : "—"}</strong><small>{m?.expiringOn ? `phép tồn đến ${fmtDate(m.expiringOn).slice(0, 5)}` : "không có phép tồn"}</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" /></label>
          <span className="toolbar-spacer" />
          <Select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm">{[thisYear, thisYear - 1].map((y) => <option key={y} value={y}>Năm {y}</option>)}</Select>
        </div>
        {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Được cấp</th><th>Tồn năm trước</th><th>Đã nghỉ</th><th>Đang chờ</th><th>Còn lại</th><th /></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.employee.id} className="clickable" onClick={() => setOpen(r.employee.id)}>
                <td><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.code} /></td>
                <td>{r.employee.department || "—"}</td>
                {r.balance ? <>
                  <td className="num">{d1(r.balance.granted + r.balance.adjusted)}<span className="muted">/{d1(r.balance.yearEntitlement)}</span></td>
                  <td className="num">{r.balance.carry ? `${d1(r.balance.carry - r.balance.expired)}${r.balance.carryExpiresOn ? ` · đến ${fmtDate(r.balance.carryExpiresOn).slice(0, 5)}` : ""}` : "—"}</td>
                  <td className="num">{d1(r.balance.used)}</td>
                  <td className="num">{r.balance.pending ? d1(r.balance.pending) : "—"}</td>
                  <td className={`num ${r.balance.available < 0 ? "text-red" : ""}`}><b>{d1(r.balance.available)}</b></td>
                </> : <td colSpan={5} className="muted">Chưa áp dụng quy định phép năm</td>}
                <td><button className="btn small" onClick={(e) => { e.stopPropagation(); setOpen(r.employee.id); }}>Sổ phép</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Loại nghỉ đang áp dụng</h3><p>Nhân viên chọn khi tạo đơn trên app. Mẫu theo Bộ luật Lao động — cần chuyên gia xác nhận trước khi dùng chính thức.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã</th><th>Loại nghỉ</th><th>Hưởng lương</th><th>Trừ phép năm</th><th>Tối đa mỗi đơn</th><th>Ghi chú</th></tr></thead><tbody>
          {(b?.types ?? []).map((t) => (
            <tr key={t.id}><td><b>{t.code}</b></td><td>{t.name}</td><td>{t.paid ? "Có" : "Không"}</td><td>{t.deductsBalance ? <Status v={["Trừ phép", ""]} /> : "—"}</td>
              <td className="num">{t.maxDays ? `${d1(t.maxDays)} ngày` : "—"}</td><td className="muted" style={{ whiteSpace: "normal" }}>{[t.description, t.attachmentFromDays ? `Từ ${d1(t.attachmentFromDays)} ngày cần minh chứng (nộp cho HR).` : null].filter(Boolean).join(" ") || "—"}</td></tr>
          ))}
        </tbody></table></div>
      </article>
      {open && b ? <LeaveDrawer id={open} year={b.year} canManage={b.canManage} onClose={() => setOpen(null)} onChanged={() => void reload()} /> : null}
    </section>
  );
}

function LeaveDrawer({ id, year, canManage, onClose, onChanged }: { id: string; year: number; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const me = useMe();
  const { data: e, error, reload, setData } = useApi<EmployeeLeave>(`leave/${id}?year=${year}`);
  const [req, setReq] = useState<RequestItem | null>(null);
  const tz = me.tenant.timezone;
  return (
    <Drawer onClose={onClose} head={<div><b>{e?.employee.fullName ?? "…"}</b><div className="muted" style={{ fontSize: 10 }}>{e ? `${e.employee.code} · vào làm ${fmtDate(e.employee.hireDate)} · sổ phép ${year}` : ""}</div></div>}>
      <LoadError error={error} retry={reload} />
      {e ? (!e.balance ? <Empty title="Chưa có sổ phép" text="Nhân viên chưa được áp dụng quy định phép năm, hoặc chưa vào làm trong năm này." /> : <>
        <div className="grid three" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="card card-body"><b className={e.balance.available < 0 ? "text-red" : ""}>{d1(e.balance.available)} ngày</b><div className="muted" style={{ fontSize: 10 }}>Còn lại</div></div>
          <div className="card card-body"><b>{d1(e.balance.used)} ngày</b><div className="muted" style={{ fontSize: 10 }}>Đã nghỉ</div></div>
          <div className="card card-body"><b>{d1(e.balance.pending)} ngày</b><div className="muted" style={{ fontSize: 10 }}>Đang chờ duyệt</div></div>
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
      </>) : null}
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
    <div className="drawer-section"><h4>Điều chỉnh</h4>
      <div className="card card-body">
        <div className="form-grid">
          <Field label="Số ngày (+/−)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ví dụ 1 hoặc -0,5" /></Field>
          <Field label="Loại"><Select value={carry ? "carry" : "adjust"} onChange={(e) => setCarry(e.target.value === "carry")}><option value="adjust">Điều chỉnh</option><option value="carry">Phép tồn năm trước</option></Select></Field>
          {carry ? <Field label="Dùng đến ngày"><input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={expires} onChange={(e) => setExpires(e.target.value)} /></Field> : null}
          <Field label="Lý do" full><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Thưởng phép dự án, nhập số dư từ bảng tính" /></Field>
        </div>
        <ErrorLine text={err} />
        <button className="btn primary small" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu điều chỉnh"}</button>
      </div>
    </div>
  );
}
