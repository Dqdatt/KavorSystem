"use client";
/* Danh mục giấy tờ hồ sơ (thiết kế bổ sung, prototype HR chưa có — docs/plans/payroll-tenant-rules.md mục 4). Công ty tự khai danh mục; HR tích
   nhân viên đã nộp gì. Không có lựa chọn "giữ bản chính" (BLLĐ 2019 Điều 17 cấm) — chỉ "nộp bản sao" hoặc "đã đối chiếu bản chính". */
import { useState } from "react";
import type { ChecklistEntry, ChecklistEntryInput, ChecklistForm, ChecklistItem, ChecklistItemInput, ChecklistItemList, EmployeeChecklist, EmploymentType } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { vs, EMPLOYMENT, Empty, ErrorLine, Field, Icon, LoadError, Modal, MoreMenu, Status, fmtDate, tenantToday, useAction, useMe } from "../../_ui/kit";
import { Select, SkeletonLines, SkeletonRows } from "@kavor/web-ui";

const FORM: Record<ChecklistForm, string> = { copy: "Nộp bản sao", original_checked: "Đã đối chiếu bản chính" };
const TYPES = Object.keys(EMPLOYMENT) as EmploymentType[];
const typesText = (t: EmploymentType[] | null) => (t ? t.map((x) => EMPLOYMENT[x]).join(", ") : "Mọi người");

/* ---------- Danh mục của công ty (tab "Danh mục giấy tờ" của trang Tài liệu) ---------- */
export function ChecklistCatalog() {
  const { data: l, error, reload, setData } = useApi<ChecklistItemList>("checklist/items");
  const [edit, setEdit] = useState<ChecklistItem | "new" | null>(null);
  const { busy, run } = useAction();
  return (
    <section className="card">
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 13, flex: "1 1 320px" }}>Công ty quyết định cần những giấy tờ gì. HR tích từng người ở hồ sơ nhân viên, tab Giấy tờ. Không giữ bản chính của người lao động (Bộ luật Lao động, Điều 17).</span>
        {l?.canManage ? <>
          <button className="btn small" disabled={!!busy} onClick={() => void run("tpl", async () => setData(await call<ChecklistItemList>("POST", "checklist/items/templates", {})), "Đã thêm giấy tờ mẫu")}><Icon name="plus" /> Thêm mẫu phổ biến</button>
          <button className="btn small primary" onClick={() => setEdit("new")}><Icon name="plus" /> Thêm giấy tờ</button>
        </> : null}
      </div>
      <LoadError error={error} retry={reload} />
      {l && !l.items.length ? (
        <Empty title="Chưa có giấy tờ nào" text={l.canManage ? "Bấm “Thêm mẫu phổ biến” để có sẵn CCCD, sơ yếu lý lịch, giấy khám sức khỏe… rồi sửa theo công ty." : "Quản trị viên công ty hoặc HCNS khai danh mục này."} />
      ) : (
        <div className="table-wrap"><table className="data-table" style={{ minWidth: 720 }}><thead><tr><th>Giấy tờ</th><th>Mục đích</th><th>Bắt buộc</th><th>Áp dụng cho</th><th>Trạng thái</th><th /></tr></thead><tbody>
          {!l && !error ? <SkeletonRows cols={6} rows={6} /> : null}
          {(l?.items ?? []).map((x) => (
            <tr key={x.id} className={x.archived ? "muted" : undefined}>
              <td className="wrap"><b style={{ fontWeight: 600 }}>{x.name}</b></td>
              <td className="wrap muted">{x.purpose ?? "—"}</td>
              <td>{x.required ? <Status v={["Bắt buộc", "info"]} /> : <span className="muted">Không</span>}</td>
              <td className="wrap">{typesText(x.employmentTypes)}</td>
              <td><Status v={x.archived ? ["Ngừng dùng", "muted"] : ["Đang dùng", "ok"]} /></td>
              <td className="act">{l?.canManage ? <MoreMenu bare items={[
                ...(!x.archived ? [{ label: "Sửa giấy tờ", icon: "edit", onClick: () => setEdit(x) }] : []),
                { label: x.archived ? "Dùng lại" : "Ngừng dùng", icon: x.archived ? "check" : "x", danger: !x.archived, onClick: () => void run(x.id, async () => setData(await call<ChecklistItemList>("POST", `checklist/items/${x.id}/archive`, { archived: !x.archived })),
                  x.archived ? "Đã dùng lại giấy tờ" : "Đã ngừng dùng giấy tờ") },
              ]} /> : null}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {edit ? <ItemForm item={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={setData} /> : null}
    </section>
  );
}

function ItemForm({ item, onClose, onSaved }: { item: ChecklistItem | null; onClose: () => void; onSaved: (l: ChecklistItemList) => void }) {
  const [f, setF] = useState({ name: item?.name ?? "", required: item?.required ?? true, types: item?.employmentTypes ?? null as EmploymentType[] | null, purpose: item?.purpose ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const toggle = (t: EmploymentType) => {
    const cur = f.types ?? TYPES;
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    setF({ ...f, types: next.length === TYPES.length ? null : next });
  };
  async function save() {
    if (!f.name.trim()) { setErr("Nhập tên giấy tờ."); return; }
    if (f.types && !f.types.length) { setErr("Chọn ít nhất một tình trạng lao động."); return; }
    const body: ChecklistItemInput = { name: f.name.trim(), required: f.required, employmentTypes: f.types, purpose: f.purpose.trim() || null };
    await run("save", async () => { onSaved(await call<ChecklistItemList>(item ? "PATCH" : "POST", item ? `checklist/items/${item.id}` : "checklist/items", body)); onClose(); },
      item ? "Đã lưu giấy tờ" : "Đã thêm giấy tờ");
  }
  return (
    <Modal title={item ? `Sửa · ${item.name}` : "Thêm giấy tờ"} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Tên giấy tờ" full><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ví dụ: CCCD (bản sao)" /></Field>
        <Field label="Bắt buộc">
          <Select value={f.required ? "1" : "0"} onChange={(e) => setF({ ...f, required: e.target.value === "1" })}><option value="1">Bắt buộc</option><option value="0">Không bắt buộc</option></Select>
        </Field>
        <Field label="Mục đích thu thập" hint="Luật Bảo vệ dữ liệu cá nhân: chỉ thu giấy tờ cần cho mục đích rõ ràng"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="Ví dụ: Khai BHXH" /></Field>
        <Field label="Áp dụng cho" full>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{TYPES.map((t) => (
            <label key={t} className="check-row" style={{ fontSize: 13 }}><input type="checkbox" checked={(f.types ?? TYPES).includes(t)} onChange={() => toggle(t)} /> {EMPLOYMENT[t]}</label>
          ))}</div>
        </Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/* ---------- Tab "Giấy tờ" trong hồ sơ nhân viên ---------- */
export function EmployeeChecklistSection({ employeeId }: { employeeId: string }) {
  const { data: c, error, reload, setData } = useApi<EmployeeChecklist>(`employees/${employeeId}/checklist`);
  const [edit, setEdit] = useState<ChecklistEntry | null>(null);
  const { busy, run } = useAction();
  const shown = (c?.entries ?? []).filter((e) => e.applies || e.status);
  const hidden = (c?.entries.length ?? 0) - shown.length;
  const required = shown.filter((e) => e.item.required && e.applies).length;
  return (
    <section className="card">
      {error ? <div className="card-body"><LoadError error={error} retry={reload} /></div> : !c ? <div className="card-body"><SkeletonLines lines={5} /></div> : !c.entries.length ? (
        <Empty title="Công ty chưa khai danh mục giấy tờ" text="Khai ở Tài liệu → Danh mục giấy tờ." />
      ) : (
        <>
          <div className="card-head">
            <div><h3>Giấy tờ hồ sơ</h3>
              <span style={{ fontSize: 12.5 }} className={c.missingRequired ? "text-amber" : "muted"}>{c.missingRequired ? `Còn thiếu ${c.missingRequired} giấy tờ bắt buộc` : "Đã đủ giấy tờ bắt buộc"}
                {hidden ? <span className="muted"> · {hidden} mục không áp dụng cho {EMPLOYMENT[c.employmentType].toLowerCase()}</span> : null}</span></div>
            {required ? <span className="row-actions"><span className="ticks" aria-hidden="true">{Array.from({ length: required }, (_, i) => <i key={i} className={i < required - c.missingRequired ? "a" : ""} />)}</span><b className="num">{required - c.missingRequired}/{required}</b></span> : null}
          </div>
          <div className="check-list">
            {shown.map((e) => (
              <div key={e.item.id}>
                <span className={`tile s ${e.status ? "ok" : e.item.required && e.applies ? "warn" : ""}`}><Icon name={e.status ? "check" : "file"} size={15} /></span>
                <span className="grow"><b>{e.item.name}</b>{e.item.required && e.applies ? <span className="source-tag">Bắt buộc</span> : null}{e.item.archived ? <span className="source-tag">Ngừng dùng</span> : null}
                  <span className="muted sub">{e.status === "submitted" ? vs(`Đã nộp | ${FORM[e.form!]} | ${fmtDate(e.submittedOn)}`) : e.status === "waived" ? "Không áp dụng" : "Chưa nộp"}{e.note ? <><i className="vs" />{e.note}</> : null}</span></span>
                {c.canEdit ? <span className="row-actions">
                  {!e.status ? <button className="btn small" disabled={!!busy} onClick={() => void run(e.item.id, async () =>
                    setData(await call<EmployeeChecklist>("POST", `employees/${employeeId}/checklist/${e.item.id}`, { status: "submitted", form: "copy" } satisfies ChecklistEntryInput)), `Đã ghi nhận ${e.item.name}`)}>Đánh dấu đã nộp</button> : null}
                  <button className="btn small ghost" onClick={() => setEdit(e)}>{e.status ? "Sửa" : "Khác…"}</button>
                </span> : null}
              </div>
            ))}
          </div>
        </>
      )}
      {edit ? <EntryForm employeeId={employeeId} entry={edit} onClose={() => setEdit(null)} onSaved={setData} /> : null}
    </section>
  );
}

function EntryForm({ employeeId, entry, onClose, onSaved }: { employeeId: string; entry: ChecklistEntry; onClose: () => void; onSaved: (c: EmployeeChecklist) => void }) {
  const me = useMe();
  const [status, setStatus] = useState<"submitted" | "waived" | "none">(entry.status ?? "submitted");
  const [form, setForm] = useState<ChecklistForm>(entry.form ?? "copy");
  const [on, setOn] = useState(entry.submittedOn ?? tenantToday(me.tenant.timezone));
  const [note, setNote] = useState(entry.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (status === "waived" && !note.trim()) { setErr("Ghi lý do không áp dụng."); return; }
    const body: ChecklistEntryInput = status === "none" ? { status: null } : status === "submitted" ? { status, form, submittedOn: on, note: note.trim() || null } : { status, note: note.trim() };
    await run("save", async () => { onSaved(await call<EmployeeChecklist>("POST", `employees/${employeeId}/checklist/${entry.item.id}`, body)); onClose(); }, "Đã lưu");
  }
  return (
    <Modal title={entry.item.name} sub={entry.item.purpose ? `Mục đích: ${entry.item.purpose}` : undefined} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Tình trạng">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="submitted">Đã nộp</option><option value="waived">Không áp dụng</option><option value="none">Chưa nộp</option>
          </Select>
        </Field>
        {status === "submitted" ? <>
          <Field label="Hình thức" hint="Không giữ bản chính — đối chiếu xong trả lại người lao động">
            <Select value={form} onChange={(e) => setForm(e.target.value as ChecklistForm)}>{(Object.keys(FORM) as ChecklistForm[]).map((k) => <option key={k} value={k}>{FORM[k]}</option>)}</Select>
          </Field>
          <Field label="Ngày nộp"><input type="date" value={on} max={tenantToday(me.tenant.timezone)} onChange={(e) => setOn(e.target.value)} /></Field>
        </> : null}
        {status !== "none" ? <Field label={status === "waived" ? "Lý do" : "Ghi chú"} full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === "waived" ? "Ví dụ: Chưa có người phụ thuộc" : "Không bắt buộc"} /></Field> : null}
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}
