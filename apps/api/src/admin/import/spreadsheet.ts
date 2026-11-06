/* Đọc file bảng tính khách đưa thành các sheet dạng ô chữ: .xlsx (Excel, Google Sheets, Numbers xuất ra) và .csv/.tsv/.txt
   (UTF-8 có/không BOM, UTF-16, Windows-1258/1252; dấu phân cách , ; tab). Không phụ thuộc thư viện ngoài: xlsx là file zip chứa XML.
   .xls (Excel 97–2003, nhị phân) không đọc — báo khách lưu lại thành .xlsx. */
import { inflateRawSync } from "node:zlib";

export type Sheet = { name: string; hidden: boolean; rows: string[][] };
export class SpreadsheetError extends Error {}

const MAX_UNZIPPED = 60_000_000;

function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new SpreadsheetError("File không phải .xlsx hợp lệ.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16), total = 0;
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new SpreadsheetError("File .xlsx bị hỏng.");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    total += usize;
    if (total > MAX_UNZIPPED) throw new SpreadsheetError("File quá lớn sau khi giải nén.");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }));
    else throw new SpreadsheetError("File .xlsx nén theo kiểu chưa hỗ trợ.");
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);
const attr = (tag: string, k: string) => { const m = new RegExp(`\\b${k}="([^"]*)"`).exec(tag); return m ? unescape(m[1]!) : null; };
const texts = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)].map((m) => unescape(m[1] ?? "")).join("");

/* Ô số: 2027 → "2027", 8.960427184E9 → "8960427184" (số nguyên không còn đuôi .0/E); số lẻ giữ nguyên */
export function numText(v: string): string {
  const t = v.trim();
  if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(t)) return v;
  const n = Number(t);
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return BigInt(n).toString();
  return String(n);
}

const colIndex = (ref: string) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? "") n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

function readXlsx(buf: Buffer): Sheet[] {
  const files = unzip(buf);
  const wb = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!wb || !rels) throw new SpreadsheetError("File .xlsx thiếu danh sách sheet.");
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const sst = files.get("xl/sharedStrings.xml")?.toString("utf8");
  const shared = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => texts(m[1] ?? "")) : [];
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map(({ 0: tag }) => {
    const t = (target.get(attr(tag, "r:id")) ?? "").replace(/^\/?(xl\/)?/, "");
    const xml = files.get(`xl/${t}`)?.toString("utf8") ?? "";
    const rows: string[][] = [];
    let next = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attr(rm[1]!, "r") ?? next + 1) - 1;
      next = r + 1;
      if (!rm[2] || r > 100_000) continue;
      const cells: string[] = [];
      let ci = 0;
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cm[1]!, "r");
        const c = ref ? colIndex(ref) : ci;
        ci = c + 1;
        if (!cm[2] || c > 500) continue;
        const type = attr(cm[1]!, "t");
        const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];
        let val = type === "inlineStr" ? texts(cm[2]) : v === undefined ? "" : unescape(v);
        if (type === "s") val = shared[Number(val)] ?? "";
        else if (type === "b") val = val === "1" ? "TRUE" : "FALSE";
        else if (!type || type === "n") val = numText(val);
        while (cells.length < c) cells.push("");
        cells[c] = val;
      }
      while (rows.length < r) rows.push([]);
      rows[r] = cells;
    }
    return { name: attr(tag, "name") ?? "Sheet", hidden: (attr(tag, "state") ?? "visible") !== "visible", rows };
  });
}

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); } catch { /* không phải UTF-8 */ }
  /* Excel Windows tiếng Việt lưu CSV theo Windows-1258; có chữ ghép (dấu tách) → NFC */
  return new TextDecoder("windows-1258").decode(buf).normalize("NFC");
}

/* CSV/TSV: dấu phân cách đoán theo 5 dòng đầu (ngoài quote); ô có quote, "" và xuống dòng trong ô */
export function readDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const head = src.slice(0, 20_000);
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let q = false, lines = 0;
  for (const c of head) {
    if (c === '"') q = !q;
    else if (!q && c === "\n" && ++lines >= 5) break;
    else if (!q && c in counts) counts[c]!++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  const sep = best[1] ? best[0] : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      row.push(cell); rows.push(row); row = []; cell = "";
      if (c === "\r" && src[i + 1] === "\n") i++;
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function readSpreadsheet(fileName: string, buf: Buffer): Sheet[] {
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (isZip) return readXlsx(buf);
  if (buf.length > 8 && buf.readUInt32LE(0) === 0xe011cfd0) throw new SpreadsheetError("File .xls (Excel 97–2003) chưa đọc được: mở bằng Excel/Google Sheets rồi lưu thành .xlsx.");
  if (/\.(xlsx|xlsm|ods|numbers|pdf|docx?)$/i.test(fileName)) throw new SpreadsheetError("Chỉ nhận file .xlsx hoặc .csv. Mở file rồi lưu/xuất thành .xlsx.");
  return [{ name: fileName.replace(/\.[^.]+$/, "") || "CSV", hidden: false, rows: readDelimited(decodeText(buf)) }];
}
