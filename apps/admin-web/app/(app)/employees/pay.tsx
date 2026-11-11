"use client";
/* Mục "Lương" trong hồ sơ nhân viên (thiết kế bổ sung, prototype HR chưa có): dữ liệu lương đầu vào HCNS quản lý cho bảng lương.
   Chỉ người có compensation.read thấy (Nhân sự vận hành, Quản trị viên công ty, Kế toán); quản lý trực tiếp không thấy.
   Mức lương là phiên bản theo ngày hiệu lực (không sửa bản cũ); người phụ thuộc tính giảm trừ theo tháng bắt đầu/kết thúc.
   Lương cứng (thỏa thuận lúc phỏng vấn) = lương cơ bản (đóng BH) + các khoản phụ cấp/thưởng trong danh mục của công ty. */
import { useState } from "react";
import type { CompensationInput, CompensationVersion, DependentInput, EmployeeDependent, EmployeePay, EmploymentType, PayItemList, ProbationContract, TaxProfileInput } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { EMPLOYMENT, ErrorLine, Field, Modal, fmtDate, fmtDateTime, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { money } from "../../_ui/request";
import { Select, SkeletonLines } from "@kavor/web-ui";

const digits = (s: string) => s.replace(/\D/g, "");
const moneyInput = (s: string) => (s ? Number(digits(s)).toLocaleString("vi-VN") : "");
const monthText = (m: string | null) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : "nay");

export function EmployeePaySection({ employeeId, name }: { employeeId: string; name: string }) {
  const me = useMe();
  const { data: p, error, reload, setData } = useApi<EmployeePay>(`employees/${employeeId}/pay`);
  const [edit, setEdit] = useState<null | "salary" | "tax" | "dep">(null);
  const [dep, setDep] = useState<EmployeeDependent | null>(null);
  const [remove, setRemove] = useState<EmployeeDependent | null>(null);
  const [all, setAll] = useState(false);
  const c = p?.current;
  const type = (v: CompensationVersion | null | undefined) => EMPLOYMENT[v?.employmentType ?? p?.employmentType ?? "official"];
  return (
    <div className="drawer-section">
      <h4>Lương</h4>
      {error ? <p className="text-red" style={{ fontSize: 12.5 }}>{error.message}</p> : !p ? <SkeletonLines lines={4} /> : (
        <>
          <div className="card detail-list">
            <div className="detail-row"><span>Lương cứng</span><b>{c ? <>{money(c.baseSalary + c.allowance)} <span className="muted">· từ {fmtDate(c.effectiveFrom)}</span></> : <span className="text-red">Chưa nhập</span>}</b></div>
            <div className="detail-row"><span>Lương cơ bản</span><b>{c ? money(c.baseSalary) : "—"}</b></div>
            {c?.items.map((x) => <div key={x.itemId} className="detail-row"><span>{x.name}</span><b>{money(x.amount)}</b></div>)}
            {c && !c.items.length && c.allowance ? <div className="detail-row"><span>Phụ cấp</span><b>{money(c.allowance)}</b></div> : null}
            <div className="detail-row"><span>Lương đóng bảo hiểm</span><b>{c ? (c.insuranceSalary ? money(c.insuranceSalary) : "Lương cơ bản + các khoản có tính BH") : "—"}</b></div>
            <div className="detail-row"><span>Tình trạng lao động</span><b>{type(c)}</b></div>
            <div className="detail-row"><span>Mã số thuế cá nhân</span><b>{p.taxCode ?? <span className="muted">Chưa có</span>}</b></div>
            <div className="detail-row"><span>Đoàn viên công đoàn</span><b>{p.unionMember ? "Có" : "Không"}</b></div>
            {p.probationContract || type(c) === "Thử việc" ? <div className="detail-row"><span>Hình thức thử việc</span><b>{p.probationContract === "in_contract" ? "Trong HĐLĐ (đóng BH)" : p.probationContract === "separate" ? "Hợp đồng thử việc riêng" : "Theo quy chế công ty"}</b></div> : null}
            {p.commitment08 || p.withholdingRequested ? <div className="detail-row"><span>Khấu trừ thuế 10%</span><b>{p.commitment08 ? "Có cam kết 08/CK-TNCN — không khấu trừ" : "Khấu trừ cả khi dưới ngưỡng (theo yêu cầu)"}</b></div> : null}
            <div className="detail-row"><span>Người phụ thuộc</span><b>{p.activeDependents ? `${p.activeDependents} người đang giảm trừ` : "Không"}</b></div>
          </div>
          {p.dependents.length ? (
            <div className="card" style={{ marginTop: 10 }}><div className="table-wrap"><table className="data-table compact"><tbody>
              {p.dependents.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.fullName}</b><div className="muted" style={{ fontSize: 11 }}>{d.relation}{d.birthDate ? ` · sinh ${fmtDate(d.birthDate)}` : ""}{d.taxCode ? ` · MST ${d.taxCode}` : ""}</div></td>
                  <td className="nowrap">{monthText(d.fromMonth)} → {monthText(d.toMonth)}</td>
                  <td className="nowrap" style={{ textAlign: "right" }}>{p.canManage ? <>
                    <button className="btn small" onClick={() => { setDep(d); setEdit("dep"); }}>Sửa</button>{" "}
                    <button className="btn small" onClick={() => setRemove(d)}>Xóa</button>
                  </> : null}</td>
                </tr>
              ))}
            </tbody></table></div></div>
          ) : null}
          <div className="row-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 10 }}>
            {p.canManage ? <>
              <button className="btn small" onClick={() => setEdit("salary")}>{c ? "Đổi lương" : "Nhập lương"}</button>
              <button className="btn small" onClick={() => setEdit("tax")}>Thuế & công đoàn</button>
              <button className="btn small" onClick={() => { setDep(null); setEdit("dep"); }}>Thêm người phụ thuộc</button>
            </> : null}
            {p.history.length > 1 ? <button className="btn small" onClick={() => setAll(!all)}>{all ? "Ẩn lịch sử lương" : `Lịch sử lương (${p.history.length} bản)`}</button> : null}
          </div>
          {p.history.length > 1 && all ? (
            <div style={{ marginTop: 10 }}>
              <ul className="version-list">{p.history.map((h) => (
                <li key={h.effectiveFrom}>Từ {fmtDate(h.effectiveFrom)} · lương cứng {money(h.baseSalary + h.allowance)} (cơ bản {money(h.baseSalary)}{h.items.length ? h.items.map((x) => ` + ${x.name.toLowerCase()} ${money(x.amount)}`).join("") : h.allowance ? ` + phụ cấp ${money(h.allowance)}` : ""}){h.insuranceSalary ? ` · đóng BH ${money(h.insuranceSalary)}` : ""}
                  {h.employmentType ? ` · ${EMPLOYMENT[h.employmentType]}` : ""}{h.note ? ` — ${h.note}` : ""} <span className="muted">(nhập {fmtDateTime(h.createdAt, me.tenant.timezone)})</span></li>
              ))}</ul>
            </div>
          ) : null}
        </>
      )}
      {edit === "salary" && p ? <CompensationModal title={`${c ? "Đổi" : "Nhập"} lương · ${name}`} current={c ?? null} fallbackType={p.employmentType} onClose={() => setEdit(null)}
        save={async (b) => setData(await call<EmployeePay>("POST", `employees/${employeeId}/pay/compensation`, b))} /> : null}
      {edit === "tax" && p ? <TaxModal pay={p} name={name} onClose={() => setEdit(null)} save={async (b) => setData(await call<EmployeePay>("POST", `employees/${employeeId}/pay/tax`, b))} /> : null}
      {edit === "dep" ? <DependentModal dep={dep} name={name} onClose={() => setEdit(null)}
        save={async (b) => setData(await call<EmployeePay>("POST", `employees/${employeeId}/pay/dependents${dep ? `/${dep.id}` : ""}`, b))} /> : null}
      {remove ? <ReasonModal title={`Xóa người phụ thuộc ${remove.fullName}?`} label="Lý do (chỉ xóa khi nhập nhầm; hết giảm trừ thì sửa tháng kết thúc)" danger ok="Đã xóa người phụ thuộc"
        go={async (reason) => setData(await call<EmployeePay>("POST", `employees/${employeeId}/pay/dependents/${remove.id}/remove`, { reason }))} onClose={() => setRemove(null)} onDone={() => undefined} /> : null}
    </div>
  );
}

/* Tab Mức lương: danh sách tổng quan không kèm khoản phụ cấp → đọc bản hiện hành từ hồ sơ rồi mở form */
export function CompensationEditor({ employeeId, title, onClose, save }: { employeeId: string; title: string; onClose: () => void; save: (b: CompensationInput) => Promise<unknown> }) {
  const { data: p, error } = useApi<EmployeePay>(`employees/${employeeId}/pay`);
  if (error) return <Modal title={title} onClose={onClose}><p className="text-red">{error.message}</p></Modal>;
  if (!p) return <Modal title={title} onClose={onClose}><SkeletonLines lines={5} /></Modal>;
  return <CompensationModal title={title} current={p.current} fallbackType={p.employmentType} onClose={onClose} save={save} />;
}

/* Dùng chung cho hồ sơ nhân viên và tab Mức lương: mỗi lần lưu là một phiên bản mới từ ngày hiệu lực.
   HR nhập lương cơ bản + số tiền từng khoản (danh mục của công ty) → Kavor cộng ra lương cứng để đối chiếu con số đã thỏa thuận. */
export function CompensationModal({ title, current, fallbackType, onClose, save }: {
  title: string; current: CompensationVersion | null; fallbackType?: EmploymentType; onClose: () => void; save: (b: CompensationInput) => Promise<unknown>;
}) {
  const me = useMe();
  const { data: cat, error: catErr } = useApi<PayItemList>("payroll/pay-items");
  const [base, setBase] = useState(current ? String(current.baseSalary) : "");
  const [ins, setIns] = useState(current?.insuranceSalary ? String(current.insuranceSalary) : "");
  /* Số tiền theo id khoản; chưa có bản lương thì điền sẵn mức mặc định của khoản */
  const [amounts, setAmounts] = useState<Record<string, string> | null>(null);
  const [type, setType] = useState<string>(current?.employmentType ?? fallbackType ?? "");
  const [from, setFrom] = useState(tenantToday(me.tenant.timezone));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const active = (cat?.items ?? []).filter((x) => !x.archived);
  const vals = amounts ?? Object.fromEntries(active.map((x) => {
    const had = current?.items.find((i) => i.itemId === x.id)?.amount;
    return [x.id, had ? String(had) : !current && x.defaultAmount ? String(x.defaultAmount) : ""];
  }));
  const dropped = (current?.items ?? []).filter((i) => !active.some((x) => x.id === i.itemId));
  const legacy = current && !current.items.length && current.allowance > 0;
  const total = Number(digits(base) || 0) + active.reduce((n, x) => n + Number(digits(vals[x.id] ?? "") || 0), 0);
  async function go() {
    const n = Number(digits(base)), i = ins ? Number(digits(ins)) : null;
    if (!n || n < 1_000_000) { setErr("Nhập lương cơ bản (₫/tháng), tối thiểu 1.000.000."); return; }
    if (i !== null && i < 1_000_000) { setErr("Lương đóng bảo hiểm tối thiểu 1.000.000 (để trống nếu bằng lương cơ bản)."); return; }
    setErr(null);
    const items = active.map((x) => ({ itemId: x.id, amount: Number(digits(vals[x.id] ?? "") || 0) })).filter((x) => x.amount > 0);
    await run("save", async () => { await save({ baseSalary: n, insuranceSalary: i, items, employmentType: (type || null) as EmploymentType | null, effectiveFrom: from, note: note.trim() || null }); onClose(); }, "Đã lưu mức lương");
  }
  return (
    <Modal title={title} sub="Bản cũ giữ nguyên trong lịch sử. Đổi giữa kỳ (ví dụ thử việc → chính thức) thì bảng lương đầu vào tự tách hai đoạn." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy || !cat} onClick={() => void go()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Lương cơ bản (₫/tháng)" hint="Mức ghi trong hợp đồng, dùng đóng BHXH"><input inputMode="numeric" value={moneyInput(base)} onChange={(e) => setBase(digits(e.target.value))} placeholder="5.000.000" /></Field>
        <Field label="Hiệu lực từ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        {active.map((x) => (
          <Field key={x.id} label={`${x.name} (₫/tháng)`}>
            <input inputMode="numeric" value={moneyInput(vals[x.id] ?? "")} onChange={(e) => setAmounts({ ...vals, [x.id]: digits(e.target.value) })} placeholder={x.defaultAmount ? `Mặc định ${x.defaultAmount.toLocaleString("vi-VN")}` : "0"} />
          </Field>
        ))}
        <Field label="Lương đóng bảo hiểm (₫)" hint="Để trống nếu bằng lương cơ bản"><input inputMode="numeric" value={moneyInput(ins)} onChange={(e) => setIns(digits(e.target.value))} placeholder="Bằng lương cơ bản" /></Field>
        <Field label="Tình trạng lao động">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Theo hồ sơ</option>
            {(Object.keys(EMPLOYMENT) as EmploymentType[]).map((k) => <option key={k} value={k}>{EMPLOYMENT[k]}</option>)}
          </Select>
        </Field>
        <Field label="Ghi chú" full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Ký HĐ chính thức, phụ lục số …" /></Field>
      </div>
      {catErr ? <p className="text-red" style={{ fontSize: 12.5 }}>{catErr.message}</p> : cat && !active.length ? (
        <div className="note-soft" style={{ marginTop: 10 }}>Công ty chưa khai khoản phụ cấp nào — nhập ở <b>Lương &amp; tạm ứng → Khoản phụ cấp</b>. Hiện chỉ lưu lương cơ bản.</div>
      ) : null}
      {dropped.length || legacy ? <div className="note-amber" style={{ marginTop: 10 }}>
        {legacy ? `Bản hiện hành có phụ cấp ${money(current!.allowance)} nhập trước khi có danh mục — nhập lại vào khoản phù hợp. ` : ""}
        {dropped.length ? `Khoản đã ngừng dùng không chuyển sang bản mới: ${dropped.map((x) => `${x.name} ${money(x.amount)}`).join(", ")}.` : ""}
      </div> : null}
      <div className="detail-row" style={{ marginTop: 12, fontSize: 14 }}><span>Lương cứng (cơ bản + phụ cấp)</span><b>{total ? money(total) : "—"}</b></div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function TaxModal({ pay, name, onClose, save }: { pay: EmployeePay; name: string; onClose: () => void; save: (b: TaxProfileInput) => Promise<unknown> }) {
  const [tax, setTax] = useState(pay.taxCode ?? "");
  const [union, setUnion] = useState(pay.unionMember);
  const [contract, setContract] = useState<ProbationContract | "">(pay.probationContract ?? "");
  const [commit, setCommit] = useState(pay.commitment08);
  const [requested, setRequested] = useState(pay.withholdingRequested);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function go() {
    const t = tax.trim();
    if (t && !/^[0-9]{10}([0-9]{2}|-[0-9]{3})?$/.test(t)) { setErr("Mã số thuế gồm 10 hoặc 13 chữ số (0123456789 hoặc 0123456789-001)."); return; }
    if (commit && !t) { setErr("Cam kết 08/CK-TNCN cần có mã số thuế cá nhân."); return; }
    setErr(null);
    await run("save", async () => { await save({ taxCode: t || null, unionMember: union, probationContract: contract || null, commitment08: commit, withholdingRequested: requested }); onClose(); }, "Đã lưu thông tin thuế");
  }
  return (
    <Modal title={`Thuế & công đoàn · ${name}`} sub="Kế toán dùng để tính thuế TNCN, bảo hiểm khi thử việc và đoàn phí công đoàn." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void go()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Mã số thuế cá nhân"><input value={tax} onChange={(e) => setTax(e.target.value)} placeholder="8012345678" /></Field>
        <Field label="Đoàn viên công đoàn">
          <Select value={union ? "1" : "0"} onChange={(e) => setUnion(e.target.value === "1")}><option value="0">Không</option><option value="1">Có</option></Select>
        </Field>
        <Field label="Hình thức thử việc" full hint="Hợp đồng thử việc riêng: không đóng BH, khấu trừ 10%. Thử việc ghi trong HĐLĐ (từ 1 tháng): đóng BH ngay, thuế như chính thức.">
          <Select value={contract} onChange={(e) => setContract(e.target.value as ProbationContract | "")}>
            <option value="">Theo quy chế công ty</option><option value="separate">Hợp đồng thử việc riêng</option><option value="in_contract">Thử việc trong HĐLĐ</option>
          </Select>
        </Field>
        <Field label="Cam kết 08/CK-TNCN" hint="Người không ký HĐLĐ / HĐ dưới 3 tháng, tổng thu nhập cả năm chưa tới mức chịu thuế: không khấu trừ 10%.">
          <Select value={commit ? "1" : "0"} onChange={(e) => setCommit(e.target.value === "1")}><option value="0">Không có</option><option value="1">Đã nộp cam kết</option></Select>
        </Field>
        <Field label="Khấu trừ dưới ngưỡng" hint="Mặc định chỉ khấu trừ 10% khi chi từ ngưỡng luật quy định; chọn Có nếu người lao động yêu cầu khấu trừ.">
          <Select value={requested ? "1" : "0"} onChange={(e) => setRequested(e.target.value === "1")}><option value="0">Không</option><option value="1">Có, theo yêu cầu</option></Select>
        </Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function DependentModal({ dep, name, onClose, save }: { dep: EmployeeDependent | null; name: string; onClose: () => void; save: (b: DependentInput) => Promise<unknown> }) {
  const me = useMe();
  const [f, setF] = useState({ fullName: dep?.fullName ?? "", relation: dep?.relation ?? "", birthDate: dep?.birthDate ?? "", taxCode: dep?.taxCode ?? "",
    fromMonth: dep?.fromMonth ?? tenantToday(me.tenant.timezone).slice(0, 7), toMonth: dep?.toMonth ?? "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function go() {
    if (!f.fullName.trim() || !f.relation.trim()) { setErr("Nhập họ tên và quan hệ."); return; }
    if (f.toMonth && f.toMonth < f.fromMonth) { setErr("Tháng kết thúc phải từ tháng bắt đầu trở đi."); return; }
    setErr(null);
    await run("save", async () => {
      await save({ fullName: f.fullName.trim(), relation: f.relation.trim(), birthDate: f.birthDate || null, taxCode: f.taxCode.trim() || null, fromMonth: f.fromMonth, toMonth: f.toMonth || null });
      onClose();
    }, dep ? "Đã lưu người phụ thuộc" : "Đã thêm người phụ thuộc");
  }
  return (
    <Modal title={`${dep ? "Sửa" : "Thêm"} người phụ thuộc · ${name}`} sub="Tính giảm trừ gia cảnh từ tháng bắt đầu đến tháng kết thúc (để trống = đang tính)." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void go()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Họ tên"><input value={f.fullName} onChange={set("fullName")} placeholder="Nguyễn Minh Khang" /></Field>
        <Field label="Quan hệ"><input value={f.relation} onChange={set("relation")} placeholder="Con, Cha, Mẹ, Vợ/Chồng…" /></Field>
        <Field label="Ngày sinh"><input type="date" value={f.birthDate} onChange={set("birthDate")} /></Field>
        <Field label="Mã số thuế người phụ thuộc"><input value={f.taxCode} onChange={set("taxCode")} placeholder="Không bắt buộc" /></Field>
        <Field label="Giảm trừ từ tháng"><input type="month" value={f.fromMonth} onChange={set("fromMonth")} /></Field>
        <Field label="Đến tháng"><input type="month" value={f.toMonth} onChange={set("toMonth")} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}
