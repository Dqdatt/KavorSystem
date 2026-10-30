"use client";
/* Tạm ứng lương (Kế toán) — thiết kế bổ sung, prototype HR chưa có trang này: danh sách đơn theo tháng khấu trừ, duyệt bước Kế toán,
   xác nhận đã chi (ghi chú chuyển khoản → nhân viên nhận thông báo). Tab Lương cơ bản: chỉ người có compensation.read thấy;
   đổi lương = phiên bản mới từ ngày hiệu lực. Chuyển nguyên từ trang /advances cũ. */
import { useState } from "react";
import type { AdvanceBoard, CompensationBoard, CompensationRow, RequestItem } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, fmtDate, fmtDateTime, tenantToday, useAction, useMe } from "../../_ui/kit";
import { REQUEST_STATUS, RequestModal, money } from "../../_ui/request";
import { Select, SkeletonRows } from "@kavor/web-ui";

const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

function state(r: RequestItem): [string, string] {
  if (r.type === "salary_advance" && r.payout) return ["Đã chi", ""];
  if (r.status === "approved") return ["Chờ chi", "warn"];
  return REQUEST_STATUS[r.status];
}

export function Advances() {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const { data: b, error, reload } = useApi<AdvanceBoard>(`advances${month ? `?month=${month}` : ""}`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const [open, setOpen] = useState<RequestItem | null>(null);
  const [paying, setPaying] = useState<RequestItem | null>(null);
  const cur = b?.month ?? month;
  const m = b?.metrics;
  return (
    <>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Đang duyệt</span><strong>{m?.pending ?? "—"}</strong><small>đơn</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="pay" /></span><span className="metric-copy"><span>Chờ chi</span><strong>{m?.toPay ?? "—"}</strong><small>đơn đã duyệt</small></span></article>
        <article className="card metric-card"><span className="metric-icon"><Icon name="checks" /></span><span className="metric-copy"><span>Đã chi</span><strong>{m?.paidCount ?? "—"}</strong><small>đơn trong tháng</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="chart" /></span><span className="metric-copy"><span>Tổng đã chi</span><strong>{m ? money(m.paidAmount) : "—"}</strong><small>trừ vào lương tháng</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <b style={{ fontSize: 12 }}>Đơn trừ vào lương tháng</b>
          <span className="toolbar-spacer" />
          <Select className="select" value={cur ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng khấu trừ">
            {cur ? [1, 0, -1, -2, -3, -4, -5].map((n) => shift(cur === b?.month && !month ? cur : cur, n)).map((x) => <option key={x} value={x}>Tháng {Number(x.slice(5))}/{x.slice(0, 4)}</option>) : null}
          </Select>
        </div>
        {b && !b.rows.length ? <Empty title="Chưa có đơn tạm ứng nào" text="Nhân viên gửi đơn trên app; đơn qua Quản lý (và HR khi vượt ngưỡng) rồi tới Kế toán." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Mã đơn</th><th>Nhân viên</th><th>Số tiền</th><th>Gửi lúc</th><th>Trạng thái</th><th>Đã chi</th><th /></tr></thead><tbody>
            {!b && !error ? <SkeletonRows cols={7} rows={6} /> : null}
            {(b?.rows ?? []).map(({ request: r, employee: e }) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td><b>{r.no}</b></td>
                <td><Person name={e.fullName} seed={e.code} sub={e.department ?? e.code} /></td>
                <td className="num"><b>{r.type === "salary_advance" ? money(r.payload.amount) : "—"}</b></td>
                <td className="nowrap">{fmtDateTime(r.submittedAt, me.tenant.timezone)}</td>
                <td><Status v={state(r)} /></td>
                <td className="muted" style={{ whiteSpace: "normal" }}>{r.type === "salary_advance" && r.payout ? `${fmtDateTime(r.payout.paidAt, me.tenant.timezone)}${r.payout.note ? ` · ${r.payout.note}` : ""}` : "—"}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  {r.myTaskId ? <button className="btn small primary" onClick={() => setOpen(r)}>Xem & duyệt</button>
                    : r.type === "salary_advance" && r.status === "approved" && !r.payout ? <button className="btn small primary" onClick={() => setPaying(r)}>Xác nhận đã chi</button>
                    : <button className="btn small" onClick={() => setOpen(r)}>Xem</button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {open ? <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => void reload()} /> : null}
      {paying ? <PayModal r={paying} onClose={() => setPaying(null)} onDone={() => void reload()} /> : null}
    </>
  );
}

function PayModal({ r, onClose, onDone }: { r: RequestItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  return (
    <Modal title={`Xác nhận đã chi ${r.no}?`} sub="Nhân viên sẽ nhận thông báo đã chi. Không hoàn tác được." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Để sau</button><button className="btn primary" disabled={!!busy}
        onClick={() => run("pay", async () => { await call("POST", `advances/${r.id}/paid`, { note: note.trim() || null }); onDone(); onClose(); }, "Đã xác nhận chi tạm ứng")}>{busy ? "Đang lưu…" : "Xác nhận đã chi"}</button></>}>
      <div className="card detail-list">
        <div className="detail-row"><span>Nhân viên</span><b>{r.requester.fullName} · {r.requester.code}</b></div>
        <div className="detail-row"><span>Số tiền</span><b>{r.type === "salary_advance" ? money(r.payload.amount) : "—"}</b></div>
        <div className="detail-row"><span>Trừ vào lương</span><b>{r.type === "salary_advance" ? `Tháng ${r.payload.month.slice(5)}/${r.payload.month.slice(0, 4)}` : "—"}</b></div>
      </div>
      <Field label="Ghi chú chuyển khoản (không bắt buộc)" full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: CK Vietcombank 25/10, mã GD 123456" /></Field>
    </Modal>
  );
}

export function Salary() {
  const me = useMe();
  const { data: b, error, reload, setData } = useApi<CompensationBoard>("compensations");
  const [edit, setEdit] = useState<CompensationRow | null>(null);
  const [q, setQ] = useState("");
  const rows = (b?.rows ?? []).filter((r) => !q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar"><label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" /></label></div>
        {b && !rows.length ? <Empty title="Không có nhân viên phù hợp" /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Lương cơ bản</th><th>Hiệu lực từ</th><th>Lịch sử</th><th>Tài khoản ngân hàng</th><th /></tr></thead><tbody>
            {!b && !error ? <SkeletonRows cols={7} rows={6} person /> : null}
            {rows.map((r) => (
              <tr key={r.employee.id}>
                <td><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.code} /></td>
                <td>{r.employee.department ?? "—"}</td>
                <td className="num">{r.baseSalary ? <b>{money(r.baseSalary)}</b> : <span className="muted">Chưa nhập</span>}</td>
                <td>{fmtDate(r.effectiveFrom)}</td>
                <td className="muted" style={{ whiteSpace: "normal", fontSize: 11 }}>{r.history.slice(1, 3).map((h) => `${money(h.baseSalary)} từ ${fmtDate(h.effectiveFrom)}`).join(" · ") || "—"}</td>
                {/* Tài khoản HR đã duyệt từ đề nghị sửa hồ sơ (Kế toán chỉ đọc) */}
                <td style={{ whiteSpace: "normal", fontSize: 11 }}>{r.bank ? <><b>{r.bank.accountNo ?? `•••• ${r.bank.last4}`}</b><div className="muted">{r.bank.bankName} · {r.bank.holder}</div></> : <span className="muted">Chưa có</span>}</td>
                <td>{b?.canManage ? <button className="btn small" onClick={() => setEdit(r)}>{r.baseSalary ? "Đổi lương" : "Nhập lương"}</button> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {edit ? <SalaryModal r={edit} tz={me.tenant.timezone} onClose={() => setEdit(null)} onDone={setData} /> : null}
    </>
  );
}

function SalaryModal({ r, tz, onClose, onDone }: { r: CompensationRow; tz: string; onClose: () => void; onDone: (b: CompensationBoard) => void }) {
  const [amount, setAmount] = useState(r.baseSalary ? String(r.baseSalary) : "");
  const [from, setFrom] = useState(tenantToday(tz));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    const n = Number(amount.replace(/\D/g, ""));
    if (!n || n < 1_000_000) { setErr("Nhập lương cơ bản (₫/tháng), tối thiểu 1.000.000."); return; }
    setErr(null);
    await run("save", async () => { onDone(await call<CompensationBoard>("POST", `compensations/${r.employee.id}`, { baseSalary: n, effectiveFrom: from, note: note.trim() || null })); onClose(); }, "Đã lưu lương cơ bản");
  }
  return (
    <Modal title={`${r.baseSalary ? "Đổi" : "Nhập"} lương cơ bản · ${r.employee.fullName}`} sub="Bản cũ giữ nguyên trong lịch sử; tạm ứng tính theo bản đang hiệu lực." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Lương cơ bản (₫/tháng)"><input inputMode="numeric" value={amount ? Number(amount.replace(/\D/g, "")).toLocaleString("vi-VN") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="15.000.000" /></Field>
        <Field label="Hiệu lực từ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Ghi chú" full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Tăng lương định kỳ, phụ lục HĐ số …" /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}
