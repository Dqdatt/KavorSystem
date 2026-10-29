"use client";
/* Bản tin nội bộ — bám page-announcements của prototype HR ("Bài đang xuất bản", "Lịch xuất bản", nút "Tạo bài viết").
   Thiết kế bổ sung: bảng tất cả bài, soạn/sửa bài, xuất bản/hẹn giờ, chi tiết + danh sách đã đọc. Mở bài trên app = đã đọc
   (không có nút xác nhận). Nội dung chữ thuần: dòng trống tách đoạn, dòng "- " thành gạch đầu dòng (announcementBlocks). */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_MAX_BYTES, announcementBlocks, type AnnouncementAdmin, type AnnouncementBoard, type AnnouncementCategory,
  type AnnouncementDetail, type AnnouncementInput, type AnnouncementStatus, type AnnouncementUnit } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Drawer, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, fmtDateTime, num, useAction, useMe } from "../../_ui/kit";
import { Select } from "@kavor/web-ui";

const STATUS: Record<AnnouncementStatus, [string, string]> = { draft: ["Nháp", "muted"], scheduled: ["Hẹn giờ", "info"], published: ["Đang hiện", ""], archived: ["Đã gỡ", "muted"] };
const FILTERS: Array<[AnnouncementStatus | "all", string]> = [["all", "Tất cả"], ["published", "Đang hiện"], ["scheduled", "Hẹn giờ"], ["draft", "Nháp"], ["archived", "Đã gỡ"]];
const ICON: Record<AnnouncementCategory, [string, string]> = { notice: ["news", ""], policy: ["file", "blue"], event: ["calendar", "violet"] };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const pct = (a: AnnouncementAdmin) => (a.recipients ? Math.round((a.reads / a.recipients) * 100) : 0);
const audienceText = (a: Pick<AnnouncementAdmin, "audience" | "units">) =>
  a.audience === "tenant" ? "Toàn công ty" : `${a.units.slice(0, 2).map((u) => u.name).join(", ")}${a.units.length > 2 ? ` +${a.units.length - 2}` : ""}`;

/* "YYYY-MM-DDTHH:mm" theo giờ công ty ↔ ISO UTC (trình duyệt có thể ở múi giờ khác) */
function zonedToIso(local: string, tz: string) {
  const [y, m, d, h, mi] = local.split(/[-T:]/).map(Number) as [number, number, number, number, number];
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  return new Date(guess - (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - guess)).toISOString();
}
function zonedLocal(iso: number | string, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function AnnouncementsPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const { data: b, error, reload } = useApi<AnnouncementBoard>("announcements");
  const [filter, setFilter] = useState<AnnouncementStatus | "all">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AnnouncementAdmin | "new" | null>(null);
  const [publishing, setPublishing] = useState<AnnouncementAdmin | null>(null);
  const all = useRef<HTMLElement>(null);
  const openId = params.get("open");
  const open = (id: string | null) => router.replace(id ? `/announcements?open=${id}` : "/announcements", { scroll: false });
  const items = b?.items ?? [];
  const live = items.filter((a) => a.status === "published").slice(0, 5);
  const scheduled = items.filter((a) => a.status === "scheduled").sort((x, y) => (x.publishAt ?? "").localeCompare(y.publishAt ?? ""));
  const rows = items.filter((a) => (filter === "all" || a.status === filter) && (!q.trim() || a.title.toLowerCase().includes(q.trim().toLowerCase())));
  const tz = me.tenant.timezone;
  const saved = (a: AnnouncementAdmin, publish: boolean) => { void reload(); if (publish) setPublishing(a); else open(a.id); };

  return (
    <section className="page active">
      <div className="page-head"><div><h2>Bản tin nội bộ</h2><p>Lên lịch, chọn nhóm người nhận và theo dõi đã đọc.</p></div>
        <button className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" /> Tạo bài viết</button></div>
      <LoadError error={error} retry={reload} />
      <div className="grid two-one">
        <article className="card"><div className="card-head"><h3>Bài đang xuất bản</h3><button className="btn small" onClick={() => { setFilter("all"); all.current?.scrollIntoView({ behavior: "smooth" }); }}>Tất cả bài</button></div>
          {b && !live.length ? <Empty title="Chưa có bài đang hiện" text="Bấm “Tạo bài viết” để soạn bài đầu tiên." /> : (
            <div className="quick-list">{live.map((a) => (
              <button key={a.id} className="quick-item" style={{ font: "inherit", textAlign: "left", width: "100%" }} onClick={() => open(a.id)}>
                <span className={`metric-icon ${a.important ? "red" : ICON[a.category][1]}`}><Icon name={a.important ? "alert" : ICON[a.category][0]} /></span>
                <span className="quick-copy"><b>{a.title}</b><span>{audienceText(a)} · {[a.important ? "quan trọng" : null, a.pinned ? "đã ghim" : null, ANNOUNCEMENT_CATEGORIES[a.category].toLowerCase()].filter(Boolean).join(" · ")}</span></span>
                <Status v={[`${pct(a)}% đã đọc`, pct(a) >= 80 ? "" : "warn"]} />
              </button>
            ))}</div>
          )}
        </article>
        <article className="card"><div className="card-head"><h3>Lịch xuất bản</h3></div>
          {b && !scheduled.length ? <Empty title="Chưa có bài hẹn giờ" text="Khi xuất bản, chọn “Hẹn giờ” để bài tự hiện đúng lúc." /> : (
            <div className="detail-list">{scheduled.map((a) => (
              <button key={a.id} className="detail-row" style={{ font: "inherit", width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--line-soft)", cursor: "pointer", textAlign: "left" }} onClick={() => open(a.id)}>
                <span>{fmtDateTime(a.publishAt, tz).slice(0, 5)} · {a.title}</span><b>{fmtDateTime(a.publishAt, tz).slice(-5)}</b>
              </button>
            ))}</div>
          )}
        </article>
      </div>

      <article className="card" ref={all}>
        <div className="toolbar">
          <div className="segmented" role="tablist">{FILTERS.map(([k, label]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{label}</button>)}</div>
          <span className="toolbar-spacer" />
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tiêu đề…" /></label>
        </div>
        {b && !rows.length ? <Empty title="Không có bài phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Bài viết</th><th>Danh mục</th><th>Người nhận</th><th>Trạng thái</th><th>Xuất bản</th><th>Đã đọc</th></tr></thead><tbody>
            {rows.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => open(a.id)}>
                <td style={{ whiteSpace: "normal" }}><b>{a.title}</b><div className="muted" style={{ fontSize: 10.5 }}>{[a.authorLabel, a.important ? "Quan trọng" : null, a.pinned ? "Đã ghim" : null, a.attachment ? "Có file đính kèm" : null].filter(Boolean).join(" · ")}</div></td>
                <td>{ANNOUNCEMENT_CATEGORIES[a.category]}</td>
                <td style={{ whiteSpace: "normal" }}>{audienceText(a)}</td>
                <td><Status v={STATUS[a.status]} /></td>
                <td className="nowrap">{a.publishAt ? fmtDateTime(a.publishAt, tz) : "—"}</td>
                <td className="num">{a.status === "draft" || a.status === "scheduled" ? <span className="muted">{num(a.recipients)} người nhận</span> : `${num(a.reads)}/${num(a.recipients)} · ${pct(a)}%`}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>

      {openId ? <DetailDrawer id={openId} onClose={() => open(null)} onEdit={setEditing} onPublish={setPublishing} onChanged={() => void reload()} /> : null}
      {editing && b ? <Editor a={editing === "new" ? null : editing} units={b.units} onClose={() => setEditing(null)} onSaved={saved} /> : null}
      {publishing ? <PublishModal a={publishing} onClose={() => setPublishing(null)} onDone={(a) => { void reload(); open(a.id); }} /> : null}
    </section>
  );
}
export default function Page() { return <Suspense><AnnouncementsPage /></Suspense>; }

function Body({ text }: { text: string }) {
  const blocks = announcementBlocks(text);
  if (!blocks.length) return <p className="muted" style={{ margin: 0 }}>Chưa có nội dung.</p>;
  return <>{blocks.map((x, i) => Array.isArray(x)
    ? <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 20 }}>{x.map((l, j) => <li key={j} style={{ margin: "3px 0" }}>{l}</li>)}</ul>
    : <p key={i} style={{ margin: "0 0 10px", whiteSpace: "pre-line" }}>{x}</p>)}</>;
}

function DetailDrawer({ id, onClose, onEdit, onPublish, onChanged }: { id: string; onClose: () => void; onEdit: (a: AnnouncementAdmin) => void; onPublish: (a: AnnouncementAdmin) => void; onChanged: () => void }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const { data: d, error, reload } = useApi<AnnouncementDetail>(`announcements/${id}`);
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState<"archive" | "remove" | null>(null);
  const [rq, setRq] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const a = d?.item;
  const readers = (d?.readers ?? []).filter((r) => (!onlyUnread || !r.readAt) && (!rq.trim() || `${r.fullName} ${r.code}`.toLowerCase().includes(rq.trim().toLowerCase())));
  const act = (key: string, path: string, ok: string, after?: () => void) =>
    run(key, async () => { await call("POST", `announcements/${id}/${path}`, {}); onChanged(); if (after) after(); else void reload(); }, ok);

  return (
    <Drawer onClose={onClose} head={<><div><b>Chi tiết bài viết</b><div className="muted" style={{ fontSize: 10 }}>{a ? `${ANNOUNCEMENT_CATEGORIES[a.category]} · ${a.authorLabel}` : "Đang tải…"}</div></div>
      {a ? <span style={{ marginLeft: "auto" }}><Status v={STATUS[a.status]} /></span> : null}</>}>
      <LoadError error={error} retry={reload} />
      {!a ? null : (
        <>
          <div className="row-actions" style={{ justifyContent: "flex-start", marginBottom: 14 }}>
            {a.status !== "archived" ? <button className="btn small" onClick={() => onEdit(a)}>Sửa bài</button> : null}
            {a.status === "draft" ? <button className="btn small primary" onClick={() => onPublish(a)}>Xuất bản…</button> : null}
            {a.status === "scheduled" ? <button className="btn small" onClick={() => onPublish(a)}>Đổi giờ hẹn</button> : null}
            {a.status === "scheduled" ? <button className="btn small" disabled={!!busy} onClick={() => void act("unschedule", "unschedule", "Đã hủy hẹn, bài về nháp")}>Hủy hẹn</button> : null}
            {a.status === "published" ? <button className="btn small danger" onClick={() => setConfirm("archive")}>Gỡ bài</button> : null}
            {a.status === "draft" || a.status === "scheduled" ? <button className="btn small danger" onClick={() => setConfirm("remove")}>Xóa</button> : null}
          </div>
          <article className="card" style={{ padding: 16 }}>
            <div className="muted" style={{ fontSize: 10.5 }}>{a.publishAt ? `${a.status === "scheduled" ? "Hẹn xuất bản" : "Xuất bản"} ${fmtDateTime(a.publishAt, tz)}` : "Chưa xuất bản"}{a.important ? " · Quan trọng" : ""}{a.pinned ? " · Đã ghim" : ""}</div>
            <h3 style={{ margin: "6px 0 12px", fontSize: 16 }}>{a.title}</h3>
            <div style={{ fontSize: 12.5, lineHeight: 1.6 }}><Body text={a.body} /></div>
            {a.attachment ? <a className="btn small" href={`/api/announcements/${a.id}/attachment`} target="_blank" rel="noreferrer"><Icon name="file" /> {a.attachment.name} · {kb(a.attachment.size)}</a> : null}
          </article>
          <div className="card detail-list" style={{ marginTop: 12 }}>
            <div className="detail-row"><span>Người nhận</span><b>{audienceText(a)} · {num(a.recipients)} người</b></div>
            <div className="detail-row"><span>Đã đọc</span><b>{a.status === "draft" || a.status === "scheduled" ? "—" : `${num(a.reads)}/${num(a.recipients)} (${pct(a)}%)`}</b></div>
            <div className="detail-row"><span>Thông báo trong app</span><b>{!a.notify ? "Không gửi" : a.notifiedAt ? `Đã gửi ${fmtDateTime(a.notifiedAt, tz)}` : "Gửi khi xuất bản"}</b></div>
            {a.archivedAt ? <div className="detail-row"><span>Đã gỡ</span><b>{fmtDateTime(a.archivedAt, tz)}</b></div> : null}
          </div>
          <div className="drawer-section">
            <h4>Người nhận ({num(d.readers.length)})</h4>
            <div className="toolbar" style={{ padding: "0 0 8px" }}>
              <label className="search" style={{ flex: 1 }}><Icon name="search" /><input value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Tìm người nhận…" /></label>
              <label className="check-row"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Chỉ người chưa đọc</label>
            </div>
            {!readers.length ? <Empty title={onlyUnread ? "Mọi người đã đọc" : "Không có người nhận phù hợp"} /> : (
              <div className="table-wrap" style={{ maxHeight: 360 }}><table className="data-table compact"><tbody>
                {readers.map((r) => (
                  <tr key={r.id}><td><Person name={r.fullName} seed={r.code} sub={[r.code, r.department].filter(Boolean).join(" · ")} /></td>
                    <td className="nowrap" style={{ textAlign: "right" }}>{r.readAt ? <span className="muted">{fmtDateTime(r.readAt, tz)}</span> : <Status v={["Chưa đọc", "warn"]} />}</td></tr>
                ))}
              </tbody></table></div>
            )}
          </div>
        </>
      )}
      {confirm && a ? (
        <Modal title={confirm === "archive" ? `Gỡ bài “${a.title}”?` : `Xóa bài “${a.title}”?`} onClose={() => setConfirm(null)}
          foot={<><button className="btn" onClick={() => setConfirm(null)}>Hủy</button><button className="btn danger" disabled={!!busy}
            onClick={() => void act(confirm, confirm, confirm === "archive" ? "Đã gỡ bài" : "Đã xóa bài", confirm === "remove" ? onClose : undefined).then(() => setConfirm(null))}>{busy ? "Đang xử lý…" : confirm === "archive" ? "Gỡ bài" : "Xóa"}</button></>}>
          <p style={{ margin: 0, fontSize: 12.5 }}>{confirm === "archive" ? "Nhân viên không còn thấy bài; thống kê đã đọc vẫn được giữ. Không hoàn tác được." : "Bài chưa ai thấy nên được xóa hẳn, kể cả file đính kèm."}</p>
        </Modal>
      ) : null}
    </Drawer>
  );
}

function Editor({ a, units, onClose, onSaved }: { a: AnnouncementAdmin | null; units: AnnouncementUnit[]; onClose: () => void; onSaved: (a: AnnouncementAdmin, publish: boolean) => void }) {
  const [f, setF] = useState<AnnouncementInput>(() => ({
    category: a?.category ?? "notice", title: a?.title ?? "", body: a?.body ?? "", authorLabel: a?.authorLabel ?? "Phòng Nhân sự",
    important: a?.important ?? false, pinned: a?.pinned ?? false, notify: a?.notify ?? false, audience: a?.audience ?? "tenant",
    units: (a?.units ?? []).map((u) => ({ type: u.type, id: u.id })),
  }));
  const [file, setFile] = useState<File | null>(null);
  const [dropFile, setDropFile] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const draftish = !a || a.status === "draft";
  const has = (u: AnnouncementUnit) => f.units.some((x) => x.type === u.type && x.id === u.id);
  const toggle = (u: AnnouncementUnit, on: boolean) => setF({ ...f, units: on ? [...f.units, { type: u.type, id: u.id }] : f.units.filter((x) => !(x.type === u.type && x.id === u.id)) });

  async function save(publish: boolean) {
    if (!f.title.trim()) { setErr("Nhập tiêu đề bài viết."); return; }
    if (f.audience === "units" && !f.units.length) { setErr("Chọn ít nhất một chi nhánh hoặc phòng ban nhận bài."); return; }
    if (file && file.size > ANNOUNCEMENT_MAX_BYTES) { setErr("File đính kèm tối đa 5 MB."); return; }
    setErr(null);
    await run("save", async () => {
      let item = a ? await call<AnnouncementAdmin>("PATCH", `announcements/${a.id}`, f) : await call<AnnouncementAdmin>("POST", "announcements", f);
      if (file) {
        const dataBase64 = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file); });
        item = await call<AnnouncementAdmin>("POST", `announcements/${item.id}/attachment`, { fileName: file.name, dataBase64 });
      } else if (dropFile && item.attachment) item = await call<AnnouncementAdmin>("POST", `announcements/${item.id}/attachment/remove`, {});
      onClose(); onSaved(item, publish);
    }, publish ? undefined : a ? "Đã lưu bài viết" : "Đã lưu nháp");
  }

  const current = !dropFile && !file ? a?.attachment : null;
  return (
    <Modal wide title={a ? "Sửa bài viết" : "Tạo bài viết"} sub={a && a.status === "published" ? "Bài đang hiện: nội dung sửa xong hiện ngay cho người nhận." : "Lưu nháp để xem lại, hoặc xuất bản ngay/hẹn giờ."} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button>
        <button className={`btn ${draftish ? "" : "primary"}`} disabled={!!busy} onClick={() => void save(false)}>{busy ? "Đang lưu…" : draftish ? "Lưu nháp" : "Lưu thay đổi"}</button>
        {draftish ? <button className="btn primary" disabled={!!busy} onClick={() => void save(true)}>Lưu & xuất bản…</button> : null}</>}>
      <div className="form-grid">
        <Field label="Tiêu đề" full><input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ví dụ: Lịch nghỉ Tết Dương lịch 2027" autoFocus /></Field>
        <Field label="Danh mục"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as AnnouncementCategory })}>
          {(Object.keys(ANNOUNCEMENT_CATEGORIES) as AnnouncementCategory[]).map((k) => <option key={k} value={k}>{ANNOUNCEMENT_CATEGORIES[k]}</option>)}</Select></Field>
        <Field label="Người/bộ phận đăng"><input value={f.authorLabel} maxLength={80} onChange={(e) => setF({ ...f, authorLabel: e.target.value })} /></Field>
        <Field label="Người nhận" full>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label className="check-row"><input type="radio" name="aud" checked={f.audience === "tenant"} onChange={() => setF({ ...f, audience: "tenant" })} /> Toàn công ty</label>
            <label className="check-row"><input type="radio" name="aud" checked={f.audience === "units"} onChange={() => setF({ ...f, audience: "units" })} /> Chọn chi nhánh, phòng ban</label>
          </div>
          {f.audience === "units" ? (
            <div className="card" style={{ padding: 12, marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
              {(["branch", "department"] as const).map((t) => (
                <div key={t} style={{ display: "contents" }}>
                  <b style={{ gridColumn: "1 / -1", fontSize: 10.5, color: "var(--muted)" }}>{t === "branch" ? "Chi nhánh" : "Phòng ban (gồm cả phòng con)"}</b>
                  {units.filter((u) => u.type === t).map((u) => <label key={u.id} className="check-row"><input type="checkbox" checked={has(u)} onChange={(e) => toggle(u, e.target.checked)} /> {u.name}</label>)}
                </div>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label="Nội dung" full hint="Dòng trống tách đoạn; các dòng bắt đầu bằng “- ” thành danh sách gạch đầu dòng.">
          <textarea rows={9} value={f.body} maxLength={20000} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={"Đoạn mở đầu…\n\n- Ý thứ nhất\n- Ý thứ hai"} />
        </Field>
        <Field label="File đính kèm (không bắt buộc)" full hint="PDF hoặc ảnh PNG, JPEG, WebP; tối đa 5 MB. Nhân viên mở được trên app.">
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDropFile(false); e.target.value = ""; }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {file ? <span className="source-tag" style={{ marginLeft: 0 }}>{file.name} · {kb(file.size)}</span> : current ? <span className="source-tag" style={{ marginLeft: 0 }}>{current.name} · {kb(current.size)}</span> : <span className="muted" style={{ fontSize: 12 }}>Chưa có file</span>}
            <button type="button" className="btn small" onClick={() => input.current?.click()}><Icon name="upload" /> {file || current ? "Chọn file khác" : "Chọn file"}</button>
            {file || current ? <button type="button" className="btn small" onClick={() => { setFile(null); setDropFile(true); }}>Bỏ file</button> : null}
          </div>
        </Field>
        <div className="field full" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <label className="check-row"><input type="checkbox" checked={f.important} onChange={(e) => setF({ ...f, important: e.target.checked })} /> Đánh dấu quan trọng</label>
          <label className="check-row"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Ghim lên đầu bản tin</label>
          <label className="check-row" title={a?.notifiedAt ? "Thông báo đã gửi khi xuất bản" : undefined}><input type="checkbox" checked={f.notify} disabled={!!a?.notifiedAt} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Gửi thông báo trong app khi xuất bản</label>
        </div>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function PublishModal({ a, onClose, onDone }: { a: AnnouncementAdmin; onClose: () => void; onDone: (a: AnnouncementAdmin) => void }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const [mode, setMode] = useState<"now" | "later">(a.status === "scheduled" ? "later" : "now");
  const [at, setAt] = useState(() => (a.status === "scheduled" && a.publishAt ? zonedLocal(a.publishAt, tz) : zonedLocal(Date.now() + 3600_000, tz)));
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const [min, setMin] = useState("");
  useEffect(() => { setMin(zonedLocal(Date.now(), tz)); }, [tz]);
  async function go() {
    if (mode === "later" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) || Date.parse(zonedToIso(at, tz)) < Date.now())) { setErr("Chọn giờ hẹn sau thời điểm hiện tại."); return; }
    setErr(null);
    await run("publish", async () => {
      const item = await call<AnnouncementAdmin>("POST", `announcements/${a.id}/publish`, mode === "later" ? { publishAt: zonedToIso(at, tz) } : {});
      onClose(); onDone(item);
    }, mode === "later" ? "Đã hẹn giờ xuất bản" : "Đã xuất bản bài viết");
  }
  return (
    <Modal title={`Xuất bản “${a.title}”`} sub={`${audienceText(a)} · ${num(a.recipients)} người nhận${a.notify ? " · gửi thông báo trong app" : ""}`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Để sau</button><button className="btn primary" disabled={!!busy} onClick={() => void go()}>{busy ? "Đang xử lý…" : mode === "later" ? "Hẹn giờ" : "Xuất bản ngay"}</button></>}>
      <div style={{ display: "grid", gap: 10 }}>
        <label className="check-row"><input type="radio" name="when" checked={mode === "now"} onChange={() => setMode("now")} /> Xuất bản ngay</label>
        <label className="check-row"><input type="radio" name="when" checked={mode === "later"} onChange={() => setMode("later")} /> Hẹn giờ (giờ công ty)</label>
        {mode === "later" ? <Field label="Thời điểm xuất bản"><input type="datetime-local" value={at} min={min} onChange={(e) => setAt(e.target.value)} /></Field> : null}
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Bài hiện trên tab Bản tin của người nhận; mở bài được tính là đã đọc.{a.notify ? " Thông báo không kèm nội dung bài." : ""}</p>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}
