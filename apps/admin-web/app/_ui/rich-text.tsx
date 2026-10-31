"use client";
/* Soạn và hiển thị nội dung bản tin có định dạng (đậm, nghiêng, gạch chân, tiêu đề mục, danh sách chấm/số, thụt lề, đường kẻ).
   Trình soạn trực quan dùng TipTap nhưng lưu ở dạng chữ có ký hiệu của @kavor/contracts (parseAnnouncement) — không lưu HTML,
   bài cũ chữ thuần mở ra vẫn đúng; dán từ Word chỉ giữ các định dạng ở trên. */
import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ANNOUNCEMENT_MAX_LEVEL, announcementListMarkers, parseAnnouncement, type AnnouncementInline, type AnnouncementListItem } from "@kavor/contracts";

/* ---------- Chữ có ký hiệu → HTML (nạp vào trình soạn) ---------- */
const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inlineHtml = (c: AnnouncementInline[]) => c.map((x) => {
  let h = html(x.text);
  if (x.u) h = `<u>${h}</u>`;
  if (x.i) h = `<em>${h}</em>`;
  if (x.b) h = `<strong>${h}</strong>`;
  return h;
}).join("");
function listHtml(items: AnnouncementListItem[]) {
  let h = "";
  const open: string[] = [];
  for (const it of items) {
    const tag = it.ordered ? "ol" : "ul";
    const lv = Math.min(it.level, open.length); /* không nhảy quá một cấp */
    while (open.length > lv + 1) h += `</li></${open.pop()}>`;
    if (open.length === lv + 1) {
      if (open[lv] === tag) h += "</li>";
      else { h += `</li></${open.pop()}><${tag}>`; open.push(tag); }
    } else { h += `<${tag}>`; open.push(tag); }
    h += `<li><p>${inlineHtml(it.content)}</p>`;
  }
  while (open.length) h += `</li></${open.pop()}>`;
  return h;
}
export function bodyToHtml(body: string) {
  return parseAnnouncement(body).map((b) =>
    b.kind === "p" ? `<p${b.indent ? ` data-indent="${b.indent}"` : ""}>${b.lines.map(inlineHtml).join("<br>")}</p>`
      : b.kind === "h" ? `<h2>${inlineHtml(b.content)}</h2>`
        : b.kind === "list" ? listHtml(b.items) : "<hr>").join("");
}

/* ---------- Tài liệu TipTap → chữ có ký hiệu ---------- */
const escText = (t: string) => t.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/\+{2,}/g, (m) => "\\+".repeat(m.length));
/* Dòng chữ thường mà trông như ký hiệu đầu dòng ("- ", "1. ", "## ", ">", "---") thì thêm "\" để giữ nguyên */
const escLineStart = (l: string) => (/^([-•*+]\s|\d{1,3}[.)]\s|#{1,6}\s|>|-{3,}$|_{3,}$)/.test(l) ? `\\${l}` : l);
const SYM = { b: "**", i: "*", u: "++" } as const;
function inlineLines(nodes: JSONContent[] = []): string[] {
  const lines: string[] = [];
  let out = "";
  const on = { b: false, i: false, u: false };
  const set = (want: typeof on) => {
    for (const k of ["u", "i", "b"] as const) if (on[k] && !want[k]) { out += SYM[k]; on[k] = false; }
    for (const k of ["b", "i", "u"] as const) if (!on[k] && want[k]) { out += SYM[k]; on[k] = true; }
  };
  for (const n of nodes) {
    if (n.type === "hardBreak") { set({ b: false, i: false, u: false }); lines.push(out); out = ""; continue; }
    if (n.type !== "text" || !n.text) continue;
    const m = new Set((n.marks ?? []).map((x) => x.type));
    set({ b: m.has("bold"), i: m.has("italic"), u: m.has("underline") });
    out += escText(n.text);
  }
  set({ b: false, i: false, u: false });
  lines.push(out);
  return lines;
}
function listLines(list: JSONContent, level: number): string[] {
  const out: string[] = [];
  for (const item of list.content ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "bulletList" || c.type === "orderedList") out.push(...listLines(c, Math.min(level + 1, ANNOUNCEMENT_MAX_LEVEL)));
      else out.push(`${"  ".repeat(level)}${list.type === "orderedList" ? "1." : "-"} ${inlineLines(c.content).join(" ").trim()}`);
    }
  }
  return out;
}
export function docToBody(doc: JSONContent) {
  return (doc.content ?? []).map((b) => {
    if (b.type === "horizontalRule") return "---";
    if (b.type === "heading") return `## ${inlineLines(b.content).join(" ").trim()}`;
    if (b.type === "bulletList" || b.type === "orderedList") return listLines(b, 0).join("\n");
    const indent = Math.min(ANNOUNCEMENT_MAX_LEVEL, Number(b.attrs?.indent) || 0);
    const lines = inlineLines(b.content);
    return lines.map((l) => (indent ? `${">".repeat(indent)} ${l}` : escLineStart(l))).join("\n");
  }).filter((x) => x.trim()).join("\n\n");
}

/* ---------- Thụt lề đoạn văn (Tab/Shift+Tab; trong danh sách thì lùi/nâng cấp mục) ---------- */
function shiftIndent(editor: Editor, d: 1 | -1) {
  if (editor.isActive("listItem")) return d > 0 ? editor.chain().focus().sinkListItem("listItem").run() : editor.chain().focus().liftListItem("listItem").run();
  const cur = Number(editor.getAttributes("paragraph").indent) || 0;
  return editor.chain().focus().updateAttributes("paragraph", { indent: Math.max(0, Math.min(ANNOUNCEMENT_MAX_LEVEL, cur + d)) }).run();
}
const Indent = Extension.create({
  name: "kavorIndent",
  priority: 1000,
  addGlobalAttributes() {
    return [{ types: ["paragraph"], attributes: { indent: {
      default: 0,
      parseHTML: (el) => Math.min(ANNOUNCEMENT_MAX_LEVEL, Number(el.getAttribute("data-indent")) || 0),
      renderHTML: (a) => (a.indent ? { "data-indent": String(a.indent) } : {}),
    } } }];
  },
  addKeyboardShortcuts() {
    return { Tab: () => { shiftIndent(this.editor, 1); return true; }, "Shift-Tab": () => { shiftIndent(this.editor, -1); return true; } };
  },
});

const B = ({ on, label, title, onClick, disabled }: { on?: boolean; label: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) => (
  <button type="button" className={`rte-btn${on ? " on" : ""}`} title={title} aria-label={title} aria-pressed={on} disabled={disabled}
    onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</button>
);
const svg = (d: string) => <svg viewBox="0 0 24 24" aria-hidden="true">{d.split("|").map((p, i) => <path key={i} d={p} />)}</svg>;

export function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (body: string) => void; placeholder?: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2] }, blockquote: false, code: false, codeBlock: false, strike: false, link: false }),
      Indent,
    ],
    content: bodyToHtml(value),
    editorProps: { attributes: { class: "rte-area", "aria-label": "Nội dung", ...(placeholder ? { "data-placeholder": placeholder } : {}) } },
    onUpdate: ({ editor: e }) => onChange(docToBody(e.getJSON())),
  });
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      b: e.isActive("bold"), i: e.isActive("italic"), u: e.isActive("underline"), h: e.isActive("heading"),
      ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), empty: e.isEmpty, undo: e.can().undo(), redo: e.can().redo(),
    } : null),
  });
  const c = () => editor!.chain().focus();
  return (
    <div className={`rte${s?.empty ? " empty" : ""}`}>
      <div className="rte-bar" role="toolbar" aria-label="Định dạng">
        <B on={s?.b} title="Đậm (Ctrl/⌘+B)" label={<b>B</b>} onClick={() => c().toggleBold().run()} />
        <B on={s?.i} title="Nghiêng (Ctrl/⌘+I)" label={<i style={{ fontFamily: "Georgia, serif" }}>I</i>} onClick={() => c().toggleItalic().run()} />
        <B on={s?.u} title="Gạch chân (Ctrl/⌘+U)" label={<u>U</u>} onClick={() => c().toggleUnderline().run()} />
        <span className="rte-sep" />
        <B on={s?.h} title="Tiêu đề mục" label={<b style={{ fontSize: 12 }}>H</b>} onClick={() => c().toggleHeading({ level: 2 }).run()} />
        <B on={s?.ul} title="Danh sách chấm" label={svg("M9 6h11|M9 12h11|M9 18h11|M4.5 6h.01|M4.5 12h.01|M4.5 18h.01")} onClick={() => c().toggleBulletList().run()} />
        <B on={s?.ol} title="Danh sách số" label={svg("M10 6h10|M10 12h10|M10 18h10|M4 4.5h1.5V9|M3.5 14.5c.4-.6 1-.9 1.6-.9.9 0 1.5.6 1.5 1.3 0 1.2-3 2.3-3 3.6h3")} onClick={() => c().toggleOrderedList().run()} />
        <span className="rte-sep" />
        <B title="Giảm thụt lề (Shift+Tab)" label={svg("M11 6h9|M11 12h9|M4 18h16|M4 6h3|M7 9.5 4 12l3 2.5")} onClick={() => editor && shiftIndent(editor, -1)} />
        <B title="Thụt lề (Tab)" label={svg("M11 6h9|M11 12h9|M4 18h16|M4 9.5 7 12l-3 2.5")} onClick={() => editor && shiftIndent(editor, 1)} />
        <B title="Đường kẻ ngang" label={svg("M4 12h16")} onClick={() => c().setHorizontalRule().run()} />
        <span className="rte-sep" />
        <B title="Hoàn tác (Ctrl/⌘+Z)" disabled={!s?.undo} label={svg("M9 14 4 9l5-5|M4 9h10.5a5.5 5.5 0 0 1 0 11H11")} onClick={() => c().undo().run()} />
        <B title="Làm lại (Ctrl/⌘+Shift+Z)" disabled={!s?.redo} label={svg("m15 14 5-5-5-5|M20 9H9.5a5.5 5.5 0 0 0 0 11H13")} onClick={() => c().redo().run()} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/* ---------- Hiển thị (drawer chi tiết trên web) ---------- */
const Inl = ({ c }: { c: AnnouncementInline[] }) => <>{c.map((x, i) => {
  let n: React.ReactNode = x.text;
  if (x.u) n = <u>{n}</u>;
  if (x.i) n = <em>{n}</em>;
  if (x.b) n = <strong>{n}</strong>;
  return <span key={i}>{n}</span>;
})}</>;
export function RichText({ body }: { body: string }) {
  const blocks = parseAnnouncement(body);
  if (!blocks.length) return <p className="muted" style={{ margin: 0 }}>Chưa có nội dung.</p>;
  return (
    <div className="rich-text">
      {blocks.map((b, i) => {
        if (b.kind === "hr") return <hr key={i} />;
        if (b.kind === "h") return <h4 key={i}><Inl c={b.content} /></h4>;
        if (b.kind === "p") return <p key={i} data-indent={b.indent || undefined}>{b.lines.map((l, j) => <span key={j}>{j ? <br /> : null}<Inl c={l} /></span>)}</p>;
        const marks = announcementListMarkers(b.items);
        return <div key={i} className="rt-list">{b.items.map((it, j) => (
          <div key={j} className="rt-item" style={{ paddingLeft: 22 + it.level * 20 }}><span className="rt-mark" style={{ left: it.level * 20 }}>{marks[j]}</span><Inl c={it.content} /></div>
        ))}</div>;
      })}
    </div>
  );
}
