"use client";
/* Tab Kỳ lương — bám page-payroll + modal payrollImport của prototype HR (banner, 4 chỉ số, "Danh sách lỗi cần xử lý", "Quy trình kỳ lương").
   Thiết kế bổ sung: chọn/mở kỳ, bảng kết quả, lịch sử nhập, nhật ký. Chế độ final_result_import: công ty tính lương ngoài Kavor,
   Kavor nhập CSV (khóa employee_code), kiểm tra, duyệt (người duyệt ≠ người nhập lần cuối), công bố phiếu lương. */
import { useRef, useState, type ReactNode } from "react";
import type { PayComponent, PayrollAction, PayrollBoard, PayrollCycle, PayrollDetail, PayrollImportOutcome, PayrollIssue, PayrollResult, PayrollStatus, PayrollTransition } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, can, fmtDate, fmtDateTime, num, tenantToday, useAction, useMe, useToast } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { money } from "../../_ui/request";
import { Select } from "@kavor/web-ui";

const ORDER: PayrollStatus[] = ["open", "prepared", "under_review", "approved", "published", "paid", "closed"];
const STATUS: Record<PayrollStatus, [string, string]> = {
  open: ["Mới mở", "muted"], prepared: ["Đã nhập", "info"], under_review: ["Đang kiểm tra", "warn"], approved: ["Đã duyệt", "info"],
  published: ["Đã công bố", ""], paid: ["Đã trả lương", ""], closed: ["Đã đóng", "muted"],
};
const ACTION: Record<PayrollAction, { label: string; sub: string; ok: string }> = {
  submit: { label: "Gửi kiểm tra", sub: "Kế toán khác với người nhập lần cuối sẽ duyệt. Nhập lại file sau khi gửi sẽ đưa kỳ về bước Đã nhập.", ok: "Đã gửi kiểm tra kỳ lương" },
  approve: { label: "Duyệt kỳ lương", sub: "Sau khi duyệt, kết quả bị khóa; muốn sửa phải mở lại (quyền riêng, có lý do).", ok: "Đã duyệt kỳ lương" },
  publish: { label: "Công bố phiếu lương", sub: "Nhân viên nhận thông báo (không kèm số tiền) và xem phiếu trên app; tạm ứng khớp được ghi nhận đã khấu trừ. Không hoàn tác được.", ok: "Đã công bố phiếu lương" },
  paid: { label: "Đánh dấu đã trả lương", sub: "Ghi nhận công ty đã chuyển lương kỳ này. Không hoàn tác được.", ok: "Đã đánh dấu đã trả lương" },
  close: { label: "Đóng kỳ lương", sub: "Kết thúc kỳ; nhân viên vẫn xem được phiếu lương.", ok: "Đã đóng kỳ lương" },
  reopen: { label: "Mở lại", sub: "", ok: "Đã mở lại kỳ lương" },
};
const EVENT: Record<string, string> = {
  created: "Mở kỳ lương", import_recorded: "Nhập file", replaced: "Áp kết quả mới", submit: "Gửi kiểm tra", approve: "Duyệt", publish: "Công bố phiếu lương",
  paid: "Đã trả lương", close: "Đóng kỳ", reopen: "Mở lại", advance_mismatch: "Tạm ứng chưa khớp",
};
/* Nhóm lỗi theo mã chẩn đoán của API (apps/api/src/payroll/csv.ts + đối chiếu trong payroll.service.ts) */
const GROUP: Array<[RegExp, string]> = [
  [/^(CSV_|ROW_WIDTH)/, "Định dạng file"], [/^HEADER_/, "Thành phần"], [/^EMPLOYEE_/, "Nhân viên"], [/^(MONEY_|TOTAL_|NET_)/, "Số tiền"],
  [/^(WORK_DAYS_|TIMESHEET_)/, "Ngày công"], [/^NOTE_/, "Ghi chú"], [/^ADVANCE_/, "Tạm ứng"], [/^OT_/, "Làm thêm giờ"],
];
const group = (code: string) => GROUP.find(([re]) => re.test(code))?.[1] ?? "Khác";
const mm = (month: string) => `${month.slice(5)}/${month.slice(0, 4)}`;
const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number) as [number, number]; return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
/* "3,42 tỷ" / "512,5 triệu" như prototype; số đầy đủ ở bảng kết quả */
const short = (n: number) => Math.abs(n) >= 1e9 ? `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`
  : Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu` : money(n);
const cell = (v: string | number | null) => { const s = v === null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function download(name: string, lines: Array<Array<string | number | null>>) {
  const url = URL.createObjectURL(new Blob([`﻿${lines.map((l) => l.map(cell).join(",")).join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* File mẫu chỉ có header: employee_code, mã thành phần theo thứ tự hiển thị, work_days, note */
const template = (month: string, components: PayComponent[]) => download(`payroll-${month}-mau.csv`, [["employee_code", ...components.map((c) => c.code), "work_days", "note"]]);

export function Cycles({ tabs }: { tabs: ReactNode }) {
  const me = useMe();
  const { data: board, error, reload } = useApi<PayrollBoard>("payroll/cycles");
  const [month, setMonth] = useState<string | null>(null);
  const cur = board?.cycles.find((c) => c.month === month)?.month ?? board?.cycles[0]?.month ?? null;
  const { data: raw, error: detailError, reload: reloadDetail } = useApi<PayrollDetail>(cur ? `payroll/cycles/${cur}` : null);
  const d = raw && raw.cycle.month === cur ? raw : null;
  const c = d?.cycle;
  const [modal, setModal] = useState<"create" | "import" | PayrollAction | null>(null);
  const refresh = () => { void reload(); void reloadDetail(); };
  const next = d?.actions.find((a) => a !== "reopen");

  return (
    <>
      <div className="page-head">
        <div><p>{c ? `Kỳ công ${fmtDate(c.periodStart).slice(0, 5)}–${fmtDate(c.periodEnd)} · ngày trả lương ${fmtDate(c.payDate)}.` : "Nhập kết quả lương từ file CSV, kiểm tra, duyệt và công bố phiếu lương."}</p></div>
        <div className="head-actions">
          {tabs}
          {board?.cycles.length ? (
            <Select className="select" value={cur ?? ""} onChange={(e) => setMonth(e.target.value)} aria-label="Kỳ lương">
              {board.cycles.map((x) => <option key={x.id} value={x.month}>Kỳ {mm(x.month)} · {STATUS[x.status][0]}</option>)}
            </Select>
          ) : null}
          {board?.canCreate ? <button className="btn" onClick={() => setModal("create")}><Icon name="plus" /> Mở kỳ lương</button> : null}
          {d?.canImport ? <button className="btn" onClick={() => setModal("import")}><Icon name="upload" /> Nhập kết quả</button> : null}
          {d?.actions.includes("reopen") ? <button className="btn" onClick={() => setModal("reopen")}>Mở lại</button> : null}
          {next ? <button className="btn primary" onClick={() => setModal(next)}>{ACTION[next].label}</button> : null}
        </div>
      </div>
      <LoadError error={error ?? detailError} retry={refresh} />
      {board && !board.cycles.length ? (
        <article className="card"><Empty title="Chưa có kỳ lương nào" text={board.canCreate ? "Bấm “Mở kỳ lương” để tạo kỳ theo tháng, rồi nhập file kết quả CSV." : "Kế toán có quyền toàn công ty sẽ mở kỳ lương theo tháng."} /></article>
      ) : d ? <Detail d={d} onTemplate={() => template(d.cycle.month, d.components)} /> : null}

      {modal === "create" && board ? <CreateModal cycles={board.cycles} tz={me.tenant.timezone} onClose={() => setModal(null)} onDone={(m) => { setMonth(m); void reload(); }} /> : null}
      {modal === "import" && d ? <ImportModal d={d} onClose={() => setModal(null)} onDone={refresh} /> : null}
      {modal === "reopen" && d ? <ReasonModal title={`Mở lại kỳ lương ${mm(d.cycle.month)}?`} label="Lý do mở lại (lưu trong nhật ký kỳ lương)" ok={ACTION.reopen.ok}
        go={(reason) => call<PayrollTransition>("POST", `payroll/cycles/${d.cycle.month}/reopen`, { reason })} onClose={() => setModal(null)} onDone={refresh} /> : null}
      {modal && modal !== "create" && modal !== "import" && modal !== "reopen" && d ? <ActionModal d={d} action={modal} onClose={() => setModal(null)} onDone={refresh} /> : null}
    </>
  );
}

function Detail({ d, onTemplate }: { d: PayrollDetail; onTemplate: () => void }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const c = d.cycle;
  const idx = ORDER.indexOf(c.status);
  const [open, setOpen] = useState<PayrollResult | null>(null);
  const [q, setQ] = useState("");
  const names = new Map(d.results.map((r) => [r.employee.code, r.employee.fullName]));
  const byId = new Map(d.results.map((r) => [r.employee.id, r.employee]));
  const issues = [...d.errors, ...d.warnings];
  const latest = d.batches.find((b) => b.id === c.latestBatchId) ?? null;
  const applied = d.batches.find((b) => b.id === d.results[0]?.batchId) ?? null;
  const net = d.results.reduce((n, r) => n + r.net, 0);
  const rows = d.results.filter((r) => !q.trim() || `${r.employee.fullName} ${r.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const waitingOther = c.status === "under_review" && !d.actions.includes("approve") && c.importedBy === me.userId && can(me, "payroll.approve");
  const step = (i: number, done: ReactNode, current: ReactNode, later: ReactNode = <b className="muted">Chưa bắt đầu</b>) => idx >= i ? done : idx === i - 1 ? current : later;
  const doing = (text: string) => <b style={{ color: "var(--amber)" }}>{text}</b>;
  const doneAt = (iso: string | null) => <b className="text-green">{iso ? fmtDate(iso.slice(0, 10)) : "Hoàn tất"}</b>;

  return (
    <>
      <div className="banner"><span className="banner-icon"><Icon name="pay" /></span>
        <span className="banner-copy"><b>Lương được cấu hình riêng cho {me.tenant.name}</b><span>Kỳ này lấy công từ Kavor và kết quả lương từ file CSV xuất từ Google Sheets (khóa employee_code, cột theo mã thành phần).</span></span>
        <button className="btn" onClick={onTemplate}><Icon name="download" /> Tải file mẫu</button>
      </div>
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="users" /></span><span className="metric-copy"><span>Nhân viên</span><strong>{num(d.results.length)}</strong><small>{latest ? `${num(latest.totalRows - latest.errorRows)}/${num(latest.totalRows)} dòng hợp lệ` : "Chưa nhập kết quả"}</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Lỗi dữ liệu</span><strong>{num(d.errors.length)}</strong><small>{num(d.warnings.length)} cảnh báo đối chiếu</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="pay" /></span><span className="metric-copy"><span>Tổng thực lĩnh</span><strong style={{ fontSize: 19 }}>{d.results.length ? short(net) : "—"}</strong><small>{idx >= ORDER.indexOf("approved") ? "Đã khóa sau duyệt" : "Dữ liệu tạm tính"}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="clock" /></span><span className="metric-copy"><span>Tiến độ</span><strong>{Math.round((idx / (ORDER.length - 1)) * 100)}%</strong><small>{STATUS[c.status][0]}</small></span></article>
      </div>

      <div className="grid two-one">
        <article className="card">
          <div className="card-head"><div><h3>Danh sách lỗi cần xử lý</h3><p>{idx >= ORDER.indexOf("approved") ? "Kết quả đã khóa sau duyệt · cảnh báo chỉ để đối chiếu" : "Phải về 0 trước khi duyệt payroll · cảnh báo đối chiếu không chặn"}</p></div>
            {issues.length ? <button className="btn small" onClick={() => download(`payroll-${c.month}-loi.csv`, [["muc_do", "ma", "dong", "cot", "employee_code", "chi_tiet"], ...issues.map((i) => [i.severity === "error" ? "Lỗi" : "Cảnh báo", i.code, i.row, i.column, i.employeeCode, i.message])])}>Tải file lỗi</button> : null}
          </div>
          {!issues.length ? <Empty title={latest ? "Không có lỗi hay cảnh báo" : "Chưa nhập file kết quả"} text={latest ? `Lần nhập ${fmtDateTime(latest.createdAt, tz)} · ${latest.fileName}` : "Bấm “Import kết quả” và chọn file CSV; hệ thống kiểm tra trước khi cập nhật kỳ lương."} /> : (
            <div className="table-wrap" style={{ maxHeight: 360 }}><table className="data-table"><thead><tr><th>Nhân viên</th><th>Nhóm lỗi</th><th>Chi tiết</th><th>Nguồn</th></tr></thead><tbody>
              {issues.map((i, n) => <IssueRow key={n} i={i} name={i.employeeCode ? names.get(i.employeeCode) : undefined} />)}
            </tbody></table></div>
          )}
        </article>
        <article className="card">
          <div className="card-head"><h3>Quy trình kỳ lương</h3></div>
          <div className="detail-list">
            <div className="detail-row"><span>1. Nhập kết quả</span>{step(1, doneAt(c.importedAt), doing("Đang thực hiện"))}</div>
            <div className="detail-row"><span>2. Kiểm tra dữ liệu</span>{step(2, doneAt(null), d.errors.length ? <b className="text-red">Còn {num(d.errors.length)} lỗi</b> : doing("Đang thực hiện"))}</div>
            <div className="detail-row"><span>3. Kế toán duyệt</span>{step(3, doneAt(c.approvedAt), doing(waitingOther ? "Chờ Kế toán khác duyệt" : "Đang thực hiện"))}</div>
            <div className="detail-row"><span>4. Công bố phiếu lương</span>{step(4, doneAt(c.publishedAt), doing("Chờ công bố"))}</div>
            <div className="detail-row"><span>5. Trả lương</span>{step(5, doneAt(c.paidAt), doing(`Dự kiến ${fmtDate(c.payDate)}`), <b className="muted">{fmtDate(c.payDate)}</b>)}</div>
            <div className="detail-row"><span>6. Đóng kỳ</span>{step(6, doneAt(c.closedAt), doing("Chờ đóng kỳ"))}</div>
          </div>
          {waitingOther ? <p className="muted" style={{ margin: "10px 0 0", fontSize: 11 }}>Bạn là người nhập kết quả lần cuối nên không tự duyệt được kỳ này.</p> : null}
          {d.events.length ? (
            <>
              <div className="card-head no-line" style={{ marginTop: 10 }}><h3>Nhật ký</h3></div>
              <div className="detail-list" style={{ maxHeight: 220, overflow: "auto" }}>
                {[...d.events].reverse().map((e) => (
                  <div key={e.id} className="detail-row" style={{ gridTemplateColumns: "1fr auto" }}>
                    <span style={{ whiteSpace: "normal" }}><b style={{ color: "var(--ink)", textAlign: "left" }}>{EVENT[e.action] ?? e.action}</b>
                      {e.employeeId ? ` · ${byId.get(e.employeeId)?.fullName ?? "nhân viên"}` : ""}{e.actorUserId === me.userId ? " · bạn" : ""}{e.reason ? ` — ${e.reason}` : ""}</span>
                    <span className="nowrap">{fmtDateTime(e.createdAt, tz)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </article>
      </div>

      <article className="card">
        <div className="toolbar">
          <b style={{ fontSize: 12 }}>Kết quả lương</b>
          {applied ? <span className="muted" style={{ fontSize: 11 }}>Lần nhập {fmtDateTime(applied.createdAt, tz)} · {applied.fileName}</span> : null}
          <span className="toolbar-spacer" />
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên…" /></label>
        </div>
        {!rows.length ? <Empty title={d.results.length ? "Không có nhân viên phù hợp" : "Chưa có kết quả lương"} text={d.results.length ? undefined : "Kết quả chỉ được áp khi cả file không còn lỗi."} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 820 }}><thead><tr><th>Nhân viên</th><th>Ngày công</th><th>Tổng thu nhập</th><th>Khấu trừ</th><th>Thực lĩnh</th><th>Ghi chú</th></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td><Person name={r.employee.fullName} seed={r.employee.code} sub={r.employee.code} /></td>
                <td className="num">{r.workDays === null ? "—" : r.workDays.toLocaleString("vi-VN")}</td>
                <td className="num">{money(r.gross)}</td>
                <td className="num">{money(r.deduction)}</td>
                <td className="num"><b>{money(r.net)}</b></td>
                <td className="muted" style={{ whiteSpace: "normal", fontSize: 11 }}>{r.note ?? "—"}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>

      {d.batches.length ? (
        <article className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><div><h3>Lịch sử nhập file</h3><p>Mọi lần nhập đều được lưu, kể cả file lỗi; chỉ file không lỗi mới được áp.</p></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Thời gian</th><th>File</th><th>Số dòng</th><th>Dòng lỗi</th><th>Cảnh báo</th><th>Kết quả</th></tr></thead><tbody>
            {d.batches.map((b) => (
              <tr key={b.id}>
                <td className="nowrap">{fmtDateTime(b.createdAt, tz)}</td>
                <td style={{ whiteSpace: "normal" }}>{b.fileName}{b.createdBy === me.userId ? <span className="muted"> · bạn</span> : null}</td>
                <td className="num">{num(b.totalRows)}</td>
                <td className="num">{num(b.errorRows)}</td>
                <td className="num">{num(b.warnings.length)}</td>
                <td><Status v={b.applied ? (b.id === applied?.id ? ["Đang áp dụng", ""] : ["Đã áp, đã thay", "muted"]) : ["Có lỗi · không áp", "bad"]} /></td>
              </tr>
            ))}
          </tbody></table></div>
        </article>
      ) : null}
      {open ? <ResultModal r={open} month={c.month} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function IssueRow({ i, name }: { i: PayrollIssue; name: string | undefined }) {
  // "cột employee_code" của cảnh báo thiếu nhân viên (không có dòng) chỉ lặp lại cột Nhân viên
  const where = [i.row ? `dòng ${i.row}` : null, i.column && (i.row || i.column !== "employee_code") ? `cột ${i.column}` : null].filter(Boolean).join(" · ");
  return (
    <tr>
      <td>{i.employeeCode ? (name ? <Person name={name} seed={i.employeeCode} sub={i.employeeCode} /> : <b>{i.employeeCode}</b>) : <span className="muted">Cả file</span>}</td>
      <td><Status v={[group(i.code), i.severity === "error" ? "bad" : "warn"]} /></td>
      <td style={{ whiteSpace: "normal" }}>{i.message}</td>
      <td className="muted" style={{ whiteSpace: "normal" }}>{i.severity === "error" ? "File CSV" : "Kavor"}{where ? ` · ${where}` : ""}</td>
    </tr>
  );
}

function ResultModal({ r, month, onClose }: { r: PayrollResult; month: string; onClose: () => void }) {
  const part = (kind: "earning" | "deduction") => r.items.filter((i) => i.kind === kind && (i.amount !== 0 || i.label));
  const list = (title: string, items: PayrollResult["items"], total: number) => (
    <>
      <div className="card-head no-line" style={{ padding: "10px 0 2px" }}><h3>{title}</h3></div>
      <div className="card detail-list">
        {items.map((i) => <div key={i.id} className="detail-row"><span>{i.label ?? i.name} <span className="muted">· {i.code}</span></span><b>{money(i.amount)}</b></div>)}
        <div className="detail-row"><span><b style={{ color: "var(--ink)" }}>Tổng</b></span><b>{money(total)}</b></div>
      </div>
    </>
  );
  return (
    <Modal title={`Phiếu lương ${mm(month)} · ${r.employee.fullName}`} sub={`${r.employee.code}${r.workDays === null ? "" : ` · ${r.workDays.toLocaleString("vi-VN")} ngày công`}`} onClose={onClose}
      foot={<button className="btn" onClick={onClose}>Đóng</button>}>
      {list("Thu nhập", part("earning"), r.gross)}
      {list("Khấu trừ", part("deduction"), r.deduction)}
      <div className="card detail-list" style={{ marginTop: 12 }}><div className="detail-row"><span><b style={{ color: "var(--ink)" }}>Thực lĩnh</b></span><b style={{ fontSize: 14 }}>{money(r.net)}</b></div></div>
      {r.note ? <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>Ghi chú: {r.note}</p> : null}
    </Modal>
  );
}

function CreateModal({ cycles, tz, onClose, onDone }: { cycles: PayrollCycle[]; tz: string; onClose: () => void; onDone: (month: string) => void }) {
  const [month, setMonth] = useState(cycles[0] ? nextMonth(cycles[0].month) : tenantToday(tz).slice(0, 7));
  const [payDate, setPayDate] = useState(`${nextMonth(month)}-05`);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (!/^\d{4}-\d{2}$/.test(month)) { setErr("Chọn tháng của kỳ lương."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) { setErr("Chọn ngày trả lương."); return; }
    setErr(null);
    await run("create", async () => { await call<PayrollTransition>("POST", "payroll/cycles", { month, payDate }); onDone(month); onClose(); }, `Đã mở kỳ lương ${mm(month)}`);
  }
  return (
    <Modal title="Mở kỳ lương" sub="Kỳ công lấy theo ngày chốt công trong cài đặt chấm công của công ty." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang tạo…" : "Mở kỳ lương"}</button></>}>
      <div className="form-grid">
        <Field label="Tháng lương"><input type="month" value={month} onChange={(e) => { setMonth(e.target.value); if (/^\d{4}-\d{2}$/.test(e.target.value)) setPayDate(`${nextMonth(e.target.value)}-05`); }} /></Field>
        <Field label="Ngày trả lương (dự kiến)"><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function ImportModal({ d, onClose, onDone }: { d: PayrollDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function start() {
    if (!file) { setErr("Chọn file CSV kết quả lương."); return; }
    const csv = await file.text();
    if (csv.length > 3_000_000) { setErr("File quá lớn (tối đa khoảng 3 MB)."); return; }
    setErr(null);
    await run("import", async () => {
      const { batch } = await call<PayrollImportOutcome>("POST", `payroll/cycles/${d.cycle.month}/import`, { fileName: file.name, csv });
      toast(batch.applied ? `Đã nhập ${num(batch.totalRows)} dòng${batch.warnings.length ? ` · ${num(batch.warnings.length)} cảnh báo` : ""}`
        : `File có ${num(batch.errors.length)} lỗi — chưa cập nhật kết quả, xem danh sách lỗi`);
      onDone(); onClose();
    });
  }
  return (
    <Modal title="Nhập kết quả lương" sub={`Kỳ ${mm(d.cycle.month)} · ${d.components.length} thành phần lương của công ty.`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy || !file} onClick={() => void start()}>{busy ? "Đang kiểm tra…" : "Bắt đầu kiểm tra"}</button></>}>
      <div className="detail-list card">
        <div className="detail-row"><span>Nguồn</span><b>File CSV (UTF-8) xuất từ Google Sheets</b></div>
        <div className="detail-row"><span>Mapping</span><b>{d.components.map((c) => c.code).join(", ")}</b></div>
        <div className="detail-row"><span>Khóa nhân viên</span><b>employee_code</b></div>
      </div>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} style={{ display: "block", width: "100%", marginTop: 12, padding: 14, border: "1px dashed var(--line-strong)", borderRadius: 11, textAlign: "center", color: "var(--muted)", background: "transparent", cursor: "pointer", font: "inherit" }}>
        <Icon name="upload" size={24} />
        <b style={{ display: "block", color: "var(--ink)", margin: "7px 0 3px" }}>{file ? file.name : "Chọn file CSV kết quả lương"}</b>
        <span>{file ? `${num(Math.ceil(file.size / 1024))} KB · bấm để chọn file khác` : "Hệ thống sẽ validate trước khi cập nhật kỳ lương."}</span>
      </button>
      {d.cycle.status === "under_review" ? <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>Kỳ đang chờ duyệt: nhập lại thành công sẽ đưa kỳ về bước Đã nhập và cần gửi kiểm tra lại.</p> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}

function ActionModal({ d, action, onClose, onDone }: { d: PayrollDetail; action: Exclude<PayrollAction, "reopen">; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const a = ACTION[action];
  const net = d.results.reduce((n, r) => n + r.net, 0);
  return (
    <Modal title={`${a.label} ${mm(d.cycle.month)}?`} sub={a.sub} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Để sau</button><button className="btn primary" disabled={!!busy}
        onClick={() => run(action, async () => { await call<PayrollTransition>("POST", `payroll/cycles/${d.cycle.month}/${action}`, {}); onDone(); onClose(); }, a.ok)}>{busy ? "Đang xử lý…" : a.label}</button></>}>
      <div className="card detail-list">
        <div className="detail-row"><span>Kỳ công</span><b>{fmtDate(d.cycle.periodStart)} – {fmtDate(d.cycle.periodEnd)}</b></div>
        <div className="detail-row"><span>Nhân viên có phiếu</span><b>{num(d.results.length)}</b></div>
        <div className="detail-row"><span>Tổng thực lĩnh</span><b>{money(net)}</b></div>
        <div className="detail-row"><span>Cảnh báo đối chiếu</span><b>{num(d.warnings.length)}</b></div>
        <div className="detail-row"><span>Ngày trả lương</span><b>{fmtDate(d.cycle.payDate)}</b></div>
      </div>
    </Modal>
  );
}
