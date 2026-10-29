"use client";
/* Kho tài liệu nhân sự — bám page-documents của prototype HR (4 chỉ số, bảng Tài liệu/Nhân viên/Danh mục/Version/Hết hạn/Quyền,
   nút "Tải tài liệu"). "Tạo từ mẫu" chưa làm (để sau). Thiết kế bổ sung: chi tiết + lịch sử phiên bản, tải phiên bản mới,
   sửa thông tin, gỡ có lý do. Chỉ số "Thiếu hồ sơ" của prototype = nhân viên đang làm chưa có hợp đồng lao động còn hiệu lực. */
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DOCUMENT_CATEGORIES, type DocumentBoard, type DocumentCategory, type DocumentDetail, type DocumentExpiry, type DocumentMeta,
  type DocumentVisibility, type EmployeeDocument, type EmployeeListItem } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Drawer, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, fmtDate, fmtDateTime, num, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { Select } from "@kavor/web-ui";

const MAX = 5 * 1024 * 1024;
const VIS: Record<DocumentVisibility, [string, string]> = { hr_employee: ["HR + Nhân viên", ""], hr_only: ["Chỉ HR", "info"] };
const STATE: Record<"live" | "soon" | "expired" | "archived" | "all", string> = { all: "Mọi trạng thái", live: "Đang dùng", soon: "Sắp hết hạn", expired: "Đã hết hạn", archived: "Đã gỡ" };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function Expiry({ d }: { d: Pick<EmployeeDocument, "expiresOn" | "expiry"> }) {
  const tone: Record<DocumentExpiry, string> = { none: "", valid: "", soon: "warn", expired: "bad" };
  if (!d.expiresOn) return <span className="muted">Không thời hạn</span>;
  return d.expiry === "soon" || d.expiry === "expired" ? <Status v={[`Hết hạn ${fmtDate(d.expiresOn)}`, tone[d.expiry]]} /> : <>{fmtDate(d.expiresOn)}</>;
}
const toBase64 = (file: File) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file); });

function DocumentsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: b, error, reload } = useApi<DocumentBoard>("documents");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<DocumentCategory | "all">("all");
  const [state, setState] = useState<keyof typeof STATE>("live");
  const [uploading, setUploading] = useState(false);
  const openId = params.get("open");
  const open = (id: string | null) => router.replace(id ? `/documents?open=${id}` : "/documents", { scroll: false });
  const m = b?.metrics;
  const used = new Set((b?.items ?? []).filter((d) => !d.archivedAt).map((d) => d.category)).size;
  const rows = (b?.items ?? []).filter((d) =>
    (cat === "all" || d.category === cat)
    && (state === "all" || (state === "archived" ? !!d.archivedAt : !d.archivedAt && (state === "live" || d.expiry === state)))
    && (!q.trim() || `${d.title} ${d.current.fileName} ${d.employee.fullName} ${d.employee.code}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <section className="page active">
      <div className="page-head"><div><p>Lưu hồ sơ, phiên bản và ngày hết hạn; chữ ký số không thuộc phạm vi.</p></div>
        <div className="head-actions">{b?.canUpload ? <button className="btn primary" onClick={() => setUploading(true)}><Icon name="upload" /> Tải tài liệu</button> : null}</div></div>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="file" /></span><span className="metric-copy"><span>Tổng tài liệu</span><strong>{m ? num(m.total) : "—"}</strong><small>{num(used)} danh mục</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="alert" /></span><span className="metric-copy"><span>Sắp hết hạn</span><strong>{m ? num(m.expiringSoon) : "—"}</strong><small>Trong 30 ngày{m?.expired ? ` · ${num(m.expired)} đã hết hạn` : ""}</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Thiếu hồ sơ</span><strong>{m ? num(m.missingContract) : "—"}</strong><small>nhân viên chưa có hợp đồng</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="lock" /></span><span className="metric-copy"><span>Truy cập tuần này</span><strong>{m ? num(m.downloadsWeek) : "—"}</strong><small>Đã ghi nhật ký</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên tài liệu hoặc nhân viên…" /></label>
          <Select className="select" value={cat} onChange={(e) => setCat(e.target.value as DocumentCategory | "all")} aria-label="Danh mục">
            <option value="all">Tất cả danh mục</option>{(Object.keys(DOCUMENT_CATEGORIES) as DocumentCategory[]).map((k) => <option key={k} value={k}>{DOCUMENT_CATEGORIES[k]}</option>)}
          </Select>
          <span className="toolbar-spacer" />
          <Select className="select" value={state} onChange={(e) => setState(e.target.value as keyof typeof STATE)} aria-label="Trạng thái">
            {(Object.keys(STATE) as Array<keyof typeof STATE>).map((k) => <option key={k} value={k}>{STATE[k]}</option>)}
          </Select>
        </div>
        {b && !rows.length ? <Empty title={b.items.length ? "Không có tài liệu phù hợp" : "Chưa có tài liệu nào"} text={b.items.length ? undefined : "Bấm “Tải tài liệu” để lưu hợp đồng, quyết định hoặc hồ sơ của nhân viên."} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Tài liệu</th><th>Nhân viên</th><th>Danh mục</th><th>Version</th><th>Hết hạn</th><th>Quyền</th></tr></thead><tbody>
            {rows.map((d) => (
              <tr key={d.id} className="clickable" onClick={() => open(d.id)}>
                <td style={{ whiteSpace: "normal" }}><b>{d.title}</b><div className="muted" style={{ fontSize: 10.5 }}>{d.current.fileName}{d.docNo ? ` · ${d.docNo}` : ""}{d.archivedAt ? " · Đã gỡ" : ""}</div></td>
                <td><Person name={d.employee.fullName} seed={d.employee.code} sub={[d.employee.code, d.employee.department].filter(Boolean).join(" · ")} /></td>
                <td>{DOCUMENT_CATEGORIES[d.category]}</td>
                <td>v{d.current.versionNo}</td>
                <td className="nowrap"><Expiry d={d} /></td>
                <td><Status v={d.archivedAt ? ["Đã gỡ", "muted"] : VIS[d.visibility]} /></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {openId ? <DetailDrawer id={openId} onClose={() => open(null)} onChanged={() => void reload()} /> : null}
      {uploading ? <UploadModal onClose={() => setUploading(false)} onDone={(d) => { void reload(); open(d.item.id); }} /> : null}
    </section>
  );
}
export default function Page() { return <Suspense><DocumentsPage /></Suspense>; }

function DetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const { data: d, error, reload, setData } = useApi<DocumentDetail>(`documents/${id}`);
  const [modal, setModal] = useState<"version" | "edit" | "archive" | null>(null);
  const done = (x: DocumentDetail) => { setData(x); onChanged(); };
  const a = d?.item;
  return (
    <Drawer onClose={onClose} head={<><div><b>Chi tiết tài liệu</b><div className="muted" style={{ fontSize: 10 }}>{a ? `${DOCUMENT_CATEGORIES[a.category]} · v${a.current.versionNo}` : "Đang tải…"}</div></div>
      {a ? <span style={{ marginLeft: "auto" }}><Status v={a.archivedAt ? ["Đã gỡ", "muted"] : VIS[a.visibility]} /></span> : null}</>}>
      <LoadError error={error} retry={reload} />
      {!a || !d ? null : (
        <>
          <div className="row-actions" style={{ justifyContent: "flex-start", marginBottom: 14 }}>
            <a className="btn small" href={`/api/documents/${a.id}/file`} target="_blank" rel="noreferrer"><Icon name="download" /> Mở bản hiện hành</a>
            {d.canUpload ? <button className="btn small" onClick={() => setModal("version")}><Icon name="upload" /> Tải phiên bản mới</button> : null}
            {d.canManage ? <button className="btn small" onClick={() => setModal("edit")}>Sửa thông tin</button> : null}
            {d.canManage ? <button className="btn small danger" onClick={() => setModal("archive")}>Gỡ tài liệu</button> : null}
          </div>
          <div className="profile-hero" style={{ paddingBottom: 12 }}><div><h3>{a.title}</h3><p>{[a.docNo, a.employee.fullName, a.employee.code].filter(Boolean).join(" · ")}</p></div></div>
          <div className="card detail-list">
            <div className="detail-row"><span>Nhân viên</span><b>{a.employee.fullName} · {a.employee.department ?? a.employee.code}</b></div>
            <div className="detail-row"><span>Danh mục</span><b>{DOCUMENT_CATEGORIES[a.category]}</b></div>
            <div className="detail-row"><span>Ngày hiệu lực</span><b>{fmtDate(a.issuedOn)}</b></div>
            <div className="detail-row"><span>Hết hạn</span><b><Expiry d={a} /></b></div>
            <div className="detail-row"><span>Quyền xem</span><b>{VIS[a.visibility][0]}</b></div>
            <div className="detail-row"><span>Quét virus</span><b className="muted">{a.current.scanStatus === "not_scanned" ? "Chưa quét (chưa có dịch vụ)" : a.current.scanStatus === "clean" ? "Sạch" : "Có mã độc"}</b></div>
            {a.archivedAt ? <div className="detail-row"><span>Đã gỡ</span><b>{fmtDateTime(a.archivedAt, tz)}{a.archiveReason ? ` — ${a.archiveReason}` : ""}</b></div> : null}
          </div>
          <div className="drawer-section">
            <h4>Phiên bản ({num(d.versions.length)})</h4>
            <div className="table-wrap"><table className="data-table compact"><tbody>
              {d.versions.map((v) => (
                <tr key={v.id}>
                  <td style={{ whiteSpace: "normal" }}><b>v{v.versionNo}</b> · {v.fileName}<div className="muted" style={{ fontSize: 10.5 }}>{fmtDateTime(v.createdAt, tz)} · {kb(v.size)}{v.note ? ` · ${v.note}` : ""}</div></td>
                  <td style={{ textAlign: "right" }}><a className="btn small" href={`/api/documents/${a.id}/file?version=${v.id}`} target="_blank" rel="noreferrer">Mở</a></td>
                </tr>
              ))}
            </tbody></table></div>
            <p className="muted" style={{ fontSize: 11, margin: "8px 0 0" }}>Phiên bản cũ được giữ nguyên; mỗi lần mở file đều ghi nhật ký hoạt động.</p>
          </div>
        </>
      )}
      {modal === "version" && a ? <VersionModal id={a.id} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal === "edit" && a ? <EditModal d={a} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal === "archive" && a ? <ReasonModal title={`Gỡ “${a.title}”?`} label="Lý do gỡ (lưu cùng tài liệu)" danger ok="Đã gỡ tài liệu"
        go={async (reason) => done(await call<DocumentDetail>("POST", `documents/${a.id}/archive`, { reason }))} onClose={() => setModal(null)} onDone={() => undefined} /> : null}
    </Drawer>
  );
}

/* Trường thông tin dùng chung cho tải mới và sửa */
function MetaFields({ f, setF }: { f: DocumentMeta; setF: (f: DocumentMeta) => void }) {
  return (
    <>
      <Field label="Danh mục"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as DocumentCategory })}>
        {(Object.keys(DOCUMENT_CATEGORIES) as DocumentCategory[]).map((k) => <option key={k} value={k}>{DOCUMENT_CATEGORIES[k]}</option>)}</Select></Field>
      <Field label="Số văn bản (không bắt buộc)"><input value={f.docNo ?? ""} maxLength={80} onChange={(e) => setF({ ...f, docNo: e.target.value })} placeholder="Ví dụ: HĐLĐ-0142/2026" /></Field>
      <Field label="Tiêu đề" full><input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ví dụ: Hợp đồng lao động không xác định thời hạn" /></Field>
      <Field label="Ngày hiệu lực"><input type="date" value={f.issuedOn ?? ""} onChange={(e) => setF({ ...f, issuedOn: e.target.value || null })} /></Field>
      <Field label="Ngày hết hạn (để trống nếu không thời hạn)"><input type="date" value={f.expiresOn ?? ""} onChange={(e) => setF({ ...f, expiresOn: e.target.value || null })} /></Field>
      <Field label="Quyền xem" full>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <label className="check-row"><input type="radio" name="vis" checked={f.visibility === "hr_employee"} onChange={() => setF({ ...f, visibility: "hr_employee" })} /> HR + Nhân viên (nhân viên xem trên app)</label>
          <label className="check-row"><input type="radio" name="vis" checked={f.visibility === "hr_only"} onChange={() => setF({ ...f, visibility: "hr_only" })} /> Chỉ HR</label>
        </div>
      </Field>
    </>
  );
}
const metaError = (f: DocumentMeta) => (!f.title.trim() ? "Nhập tiêu đề tài liệu." : f.issuedOn && f.expiresOn && f.expiresOn < f.issuedOn ? "Ngày hết hạn phải sau ngày hiệu lực." : null);

function FilePick({ file, setFile }: { file: File | null; setFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label="File" full hint="PDF hoặc ảnh PNG, JPEG, WebP; tối đa 5 MB.">
      <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {file ? <span className="source-tag" style={{ marginLeft: 0 }}>{file.name} · {kb(file.size)}</span> : <span className="muted" style={{ fontSize: 12 }}>Chưa chọn file</span>}
        <button type="button" className="btn small" onClick={() => input.current?.click()}><Icon name="upload" /> {file ? "Chọn file khác" : "Chọn file"}</button>
      </div>
    </Field>
  );
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (d: DocumentDetail) => void }) {
  const me = useMe();
  const emps = useApi<EmployeeListItem[]>("employees");
  const [employeeId, setEmployeeId] = useState("");
  const [eq, setEq] = useState("");
  const [f, setF] = useState<DocumentMeta>({ category: "contract", title: "", docNo: "", issuedOn: null, expiresOn: null, visibility: "hr_employee" });
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const list = (emps.data ?? []).filter((x) => !eq.trim() || `${x.fullName} ${x.code}`.toLowerCase().includes(eq.trim().toLowerCase())).slice(0, 200);
  async function save() {
    const problem = !employeeId ? "Chọn nhân viên." : metaError(f) ?? (!file ? "Chọn file tài liệu." : file.size > MAX ? "File tối đa 5 MB." : null);
    if (problem) { setErr(problem); return; }
    setErr(null);
    await run("save", async () => {
      onDone(await call<DocumentDetail>("POST", "documents", { ...f, docNo: f.docNo?.trim() || null, employeeId, fileName: file!.name, dataBase64: await toBase64(file!), note: note.trim() || null }));
      onClose();
    }, "Đã tải tài liệu lên");
  }
  return (
    <Modal wide title="Tải tài liệu" sub={`Lưu vào hồ sơ nhân viên của ${me.tenant.name}; mỗi lần thay file là một phiên bản mới.`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang tải lên…" : "Tải lên"}</button></>}>
      <div className="form-grid">
        <Field label="Nhân viên" full>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 8 }}>
            <input value={eq} onChange={(e) => setEq(e.target.value)} placeholder="Lọc theo tên hoặc mã…" />
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">{emps.data ? "Chọn nhân viên" : "Đang tải…"}</option>
              {list.map((x) => <option key={x.id} value={x.id}>{x.fullName} · {x.code}</option>)}
            </Select>
          </div>
        </Field>
        <MetaFields f={f} setF={setF} />
        <FilePick file={file} setFile={setFile} />
        <Field label="Ghi chú phiên bản (không bắt buộc)" full><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Bản scan có chữ ký hai bên" /></Field>
      </div>
      <ErrorLine text={err ?? (emps.error ? emps.error.message : null)} />
    </Modal>
  );
}

function VersionModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (d: DocumentDetail) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (!file) { setErr("Chọn file phiên bản mới."); return; }
    if (file.size > MAX) { setErr("File tối đa 5 MB."); return; }
    setErr(null);
    await run("save", async () => { onDone(await call<DocumentDetail>("POST", `documents/${id}/versions`, { fileName: file.name, dataBase64: await toBase64(file), note: note.trim() || null })); onClose(); }, "Đã thêm phiên bản mới");
  }
  return (
    <Modal title="Tải phiên bản mới" sub="Bản cũ vẫn được giữ trong lịch sử; nhân viên thấy bản mới nhất." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang tải lên…" : "Tải lên"}</button></>}>
      <div className="form-grid">
        <FilePick file={file} setFile={setFile} />
        <Field label="Ghi chú phiên bản (không bắt buộc)" full><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Phụ lục điều chỉnh lương" /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function EditModal({ d, onClose, onDone }: { d: EmployeeDocument; onClose: () => void; onDone: (x: DocumentDetail) => void }) {
  const [f, setF] = useState<DocumentMeta>({ category: d.category, title: d.title, docNo: d.docNo ?? "", issuedOn: d.issuedOn, expiresOn: d.expiresOn, visibility: d.visibility });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    const problem = metaError(f);
    if (problem) { setErr(problem); return; }
    setErr(null);
    await run("save", async () => { onDone(await call<DocumentDetail>("PATCH", `documents/${d.id}`, { ...f, docNo: f.docNo?.trim() || null })); onClose(); }, "Đã lưu thông tin tài liệu");
  }
  return (
    <Modal wide title={`Sửa thông tin · ${d.employee.fullName}`} sub="Đổi sang “Chỉ HR” thì nhân viên không còn xem/tải được ngay." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid"><MetaFields f={f} setF={setF} /></div>
      <ErrorLine text={err} />
    </Modal>
  );
}
