"use client";
/* Danh mục giấy tờ hồ sơ (thiết kế bổ sung, prototype HR chưa có — docs/plans/payroll-tenant-rules.md mục 4). Công ty tự khai danh mục; HR tích
   nhân viên đã nộp gì. Không có lựa chọn "giữ bản chính" (BLLĐ 2019 Điều 17 cấm) — chỉ "nộp bản sao" hoặc "đã đối chiếu bản chính". */
import { useState } from "react";
import type { ChecklistEntry, ChecklistEntryInput, ChecklistForm, ChecklistItem, ChecklistItemInput, ChecklistItemList, EmployeeChecklist, EmploymentType } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { EMPLOYMENT, Empty, ErrorLine, Field, Icon, LoadError, Modal, Status, fmtDate, tenantToday, useAction, useMe } from "../../_ui/kit";
import { Select, SkeletonLines, SkeletonRows } from "@kavor/web-ui";

const FORM: Record<ChecklistForm, string> = { copy: "Nộp bản sao", original_checked: "Đã đối chiếu bản chính" };
const TYPES = Object.keys(EMPLOYMENT) as EmploymentType[];
const typesText = (t: EmploymentType[] | null) => (t ? t.map((x) => EMPLOYMENT[x]).join(", ") : "Mọi người");

/* ---------- Danh mục của công ty (mở từ trang Tài liệu) ---------- */
export function ChecklistCatalog({ onClose }: { onClose: () => void }) {
  const { data: l, error, reload, setData } = useApi<ChecklistItemList>("checklist/items");
  const [edit, setEdit] = useState<ChecklistItem | "new" | null>(null);
  const { busy, run } = useAction();
  return (
    <Modal wide title="Danh mục giấy tờ hồ sơ" sub="Công ty tự quyết cần những giấy tờ gì. HR tích từng người ở hồ sơ nhân viên → tab Giấy tờ. Không giữ bản chính của người lao động (Bộ luật Lao động, Điều 17)."
      onClose={onClose} foot={<>
        {l?.canManage ? <>
          <button className="btn" disabled={!!busy} onClick={() => void run("tpl", async () => setData(await call<ChecklistItemList>("POST", "checklist/items/templates", {})), "Đã thêm giấy tờ mẫu")}><Icon name="plus" /> Thêm mẫu phổ biến</button>
          <button className="btn primary" onClick={() => setEdit("new")}><Icon name="plus" /> Thêm giấy tờ</button>
        </> : null}
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <LoadError error={error} retry={reload} />
      {l && !l.items.length ? (
        <Empty title="Chưa có giấy tờ nào" text={l.canManage ? "Bấm “Thêm mẫu phổ biến” để có sẵn CCCD, sơ yếu lý lịch, giấy khám sức khỏe… rồi sửa theo công ty." : "Quản trị viên công ty hoặc HCNS khai danh mục này."} />
      ) : (
        <div className="table-wrap"><table className="data-table compact"><thead><tr><th>Giấy tờ</th><th>Bắt buộc</th><th>Áp dụng cho</th><th>Trạng thái</th><th /></tr></thead><tbody>
          {!l && !error ? <SkeletonRows cols={5} rows={6} /> : null}
          {(l?.items ?? []).map((x) => (
            <tr key={x.id} className={x.archived ? "muted" : undefined}>
              <td className="wrap"><b>{x.name}</b>{x.purpose ? <div className="muted" style={{ fontSize: 12 }}>Mục đích: {x.purpose}</div> : null}</td>
              <td>{x.required ? "Bắt buộc" : "Không bắt buộc"}</td>
              <td className="wrap">{typesText(x.employmentTypes)}</td>
              <td><Status v={x.archived ? ["Ngừng dùng", "muted"] : ["Đang dùng", ""]} /></td>
              <td className="nowrap" style={{ textAlign: "right" }}>{l?.canManage ? <>
                {!x.archived ? <button className="btn small" onClick={() => setEdit(x)}>Sửa</button> : null}{" "}
                <button className="btn small" disabled={!!busy} onClick={() => void run(x.id, async () => setData(await call<ChecklistItemList>("POST", `checklist/items/${x.id}/archive`, { archived: !x.archived })),
                  x.archived ? "Đã dùng lại giấy tờ" : "Đã ngừng dùng giấy tờ")}>{x.archived ? "Dùng lại" : "Ngừng dùng"}</button>
              </> : null}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {edit ? <ItemForm item={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={setData} /> : null}
    </Modal>
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
  return (
    <div className="drawer-section">
      <h4>Giấy tờ hồ sơ</h4>
      {error ? <LoadError error={error} retry={reload} /> : !c ? <SkeletonLines lines={5} /> : !c.entries.length ? (
        <Empty title="Công ty chưa khai danh mục giấy tờ" text="Khai ở Tài liệu → Danh mục giấy tờ." />
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: "0 0 8px" }}>
            {c.missingRequired ? <span className="text-amber">Còn thiếu {c.missingRequired} giấy tờ bắt buộc.</span> : "Đã đủ giấy tờ bắt buộc."}
            {hidden ? ` ${hidden} mục không áp dụng cho ${EMPLOYMENT[c.employmentType].toLowerCase()}.` : ""}
          </p>
          <div className="card"><div className="table-wrap"><table className="data-table compact"><tbody>
            {shown.map((e) => (
              <tr key={e.item.id}>
                <td className="wrap"><b>{e.item.name}</b>{e.item.required && e.applies ? <span className="source-tag">Bắt buộc</span> : null}{e.item.archived ? <span className="source-tag">Ngừng dùng</span> : null}
                  {e.note ? <div className="muted" style={{ fontSize: 12 }}>{e.note}</div> : null}</td>
                <td className="wrap">{e.status === "submitted" ? <><Status v={["Đã nộp", ""]} /> <span className="muted" style={{ fontSize: 12 }}>{FORM[e.form!]} · {fmtDate(e.submittedOn)}</span></>
                  : e.status === "waived" ? <Status v={["Không áp dụng", "muted"]} /> : <Status v={e.item.required ? ["Chưa nộp", "warn"] : ["Chưa nộp", "muted"]} />}</td>
                <td className="nowrap" style={{ textAlign: "right" }}>{c.canEdit ? <>
                  {!e.status ? <button className="btn small" disabled={!!busy} onClick={() => void run(e.item.id, async () =>
                    setData(await call<EmployeeChecklist>("POST", `employees/${employeeId}/checklist/${e.item.id}`, { status: "submitted", form: "copy" } satisfies ChecklistEntryInput)), `Đã ghi nhận ${e.item.name}`)}>Đã nộp</button> : null}{" "}
                  <button className="btn small" onClick={() => setEdit(e)}>{e.status ? "Sửa" : "Khác…"}</button>
                </> : null}</td>
              </tr>
            ))}
          </tbody></table></div></div>
        </>
      )}
      {edit ? <EntryForm employeeId={employeeId} entry={edit} onClose={() => setEdit(null)} onSaved={setData} /> : null}
    </div>
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
