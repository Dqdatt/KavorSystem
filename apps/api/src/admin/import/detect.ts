/* Nhận dạng file nhân viên bất kỳ (docs/plans/employee-import.md, giai đoạn 1): tìm dòng tiêu đề trong từng sheet, khớp cột bằng từ điển
   đồng nghĩa (bỏ dấu, Việt/Anh) + nội dung cả cột, chuẩn hóa giá trị (ngày, số, điện thoại, loại hợp đồng), ghép phòng ban/chức danh theo
   mã hoặc tên. Không đoán âm thầm: mọi suy luận trả về để web hiện và HR đổi được; cách khớp đã xác nhận được lưu theo công ty.
   Thuần (không DB) để kiểm thử trên nhiều kiểu file. */
import { IMPORT_SENSITIVE, inferTier, type EmploymentType, type ImportColumn, type ImportField, type ImportOptions, type ImportSheet, type ImportUnit, type ManagementTier } from "@kavor/contracts";
import type { Sheet } from "./spreadsheet.js";

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/* Từ điển tiêu đề: "=x" chỉ khớp nguyên văn (từ quá chung); số sau "|" là độ ưu tiên khi nhiều cột cùng khớp một trường */
const SYN: Record<ImportField, string[]> = {
  employee_code: ["ma nv", "ma nhan vien", "ma so nhan vien", "msnv", "mnv", "so hieu nhan vien", "employee code", "employee id", "emp code", "emp id", "staff id", "staff code", "=id", "=ma", "=code", "employee_code", "id nhan vien", "ma cham cong|1", "ma id cham cong|1", "ma cc|1", "=mcc|1", "ma nv cham cong|1", "ma may cham cong|1", "attendance code|1", "ma van tay|1"],
  full_name: ["ho va ten", "ho ten", "ten nhan vien", "ten nv", "full name", "fullname", "employee name", "staff name", "=name", "=nhan vien", "full_name", "ho ten nhan vien"],
  last_name: ["=ho", "last name", "surname", "family name", "=ho nhan vien"],
  middle_name: ["ten dem", "ten lot", "middle name"],
  first_name: ["=ten", "first name", "given name"],
  work_email: ["email cong ty", "work email", "email cong viec", "work_email", "=email", "=e mail", "=mail", "dia chi email", "thu dien tu", "email address", "email ca nhan|1", "personal email|1", "gmail|1"],
  phone: ["sdt", "so dien thoai", "dien thoai", "=dt", "dtdd", "di dong", "=phone", "phone number", "mobile", "so dt", "sdt lien he", "tel", "telephone", "cell phone"],
  hire_date: ["ngay vao lam", "ngay bat dau lam viec", "ngay bat dau", "ngay nhan viec", "ngay vao cong ty", "ngay vao", "ngay tuyen dung", "hire date", "start date", "joining date", "date of joining", "join date", "hire_date", "ngay lam viec dau tien", "ngay thu viec"],
  official_date: ["ngay chinh thuc", "ngay len chinh thuc", "ngay ky hd chinh thuc", "official date", "ngay ky hop dong chinh thuc", "probation end date"],
  employment_type: ["loai hd", "loai hop dong", "hinh thuc hop dong", "hinh thuc lam viec", "loai nhan vien", "loai lao dong", "employment type", "contract type", "employment_type", "=hop dong", "=hd", "tinh chat cong viec"],
  department: ["phong ban", "=phong", "bo phan", "department", "=dept", "department_code", "ma phong ban", "ten phong ban", "don vi", "phong ban bo phan", "=khoi|1", "=team|1", "=nhom|1", "division|1"],
  position: ["chuc vu", "chuc danh", "vi tri", "vi tri cong viec", "position", "=title", "job title", "position_code", "ma chuc danh", "ten chuc danh", "designation", "role|1"],
  manager: ["quan ly truc tiep", "ma quan ly", "nguoi quan ly", "manager", "manager code", "manager_code", "manager_employee_code", "line manager", "cap tren", "nguoi phu trach", "bao cao cho", "reports to"],
  status: ["trang thai", "tinh trang", "=status", "tinh trang lam viec", "employment status"],
  termination_date: ["ngay nghi viec", "ngay thoi viec", "ngay nghi", "termination date", "ngay ket thuc lam viec", "resign date", "last working day", "end date|1"],
  birth_date: ["ngay sinh", "ngay thang nam sinh", "sinh ngay", "dob", "date of birth", "birthday", "birth date", "=nam sinh|1"],
  gender: ["gioi tinh", "gender", "=sex", "=phai"],
  id_number: ["cccd", "so cccd", "cmnd", "so cmnd", "can cuoc", "can cuoc cong dan", "so can cuoc", "cmnd cccd", "id card", "national id", "id number", "so dinh danh"],
  id_issued_on: ["ngay cap", "ngay cap cccd", "ngay cap cmnd", "issue date", "date of issue"],
  id_issued_by: ["noi cap", "noi cap cccd", "noi cap cmnd", "place of issue", "issued by"],
  permanent_address: ["dia chi thuong tru", "thuong tru", "ho khau", "ho khau thuong tru", "permanent address", "que quan|1", "nguyen quan|1"],
  current_address: ["dia chi tam tru", "tam tru", "cho o hien tai", "dia chi hien tai", "dia chi lien he", "noi o hien tai", "current address", "=dia chi", "=address", "=noi o"],
  social_insurance_no: ["so bhxh", "so so bhxh", "ma so bhxh", "so so bao hiem xa hoi", "ma bhxh", "=bao hiem xa hoi", "=bhxh", "social insurance number", "si number"],
  tax_code: ["ma so thue", "mst", "ma so thue ca nhan", "mst ca nhan", "tax code", "tax id", "pit code"],
  bank_account: ["so tai khoan", "stk", "so tk", "tai khoan ngan hang", "so tai khoan ngan hang", "account number", "bank account", "account no"],
  bank_name: ["ten ngan hang", "=ngan hang", "ngan hang thu huong", "=bank", "bank name"],
  bank_holder: ["nguoi thu huong", "chu tai khoan", "ten chu tai khoan", "ten tai khoan", "account holder", "account name", "beneficiary"],
  base_salary: ["luong chinh thuc", "luong co ban", "muc luong", "=luong", "luong cb", "luong hop dong", "basic salary", "base salary", "=salary", "gross salary|1"],
  insurance_salary: ["muc dong bhxh", "luong dong bhxh", "luong dong bao hiem", "muc luong dong bhxh", "muc dong bao hiem", "luong bhxh", "insurance salary"],
};
/* Cột nhận ra nhưng Kavor chưa lưu ở giai đoạn này — hiện rõ để khách biết không bị mất mà là chưa nhập */
const LATER: Array<[string, string[]]> = [
  ["Lương thử việc", ["luong thu viec"]],
  ["Phụ cấp/thu nhập khác", ["phu cap", "thu nhap", "thuong", "kpi", "allowance"]],
  ["Bảo hiểm khác", ["bao hiem", "bhyt", "benh vien", "kcb", "thoi gian tham gia"]],
  ["Hợp đồng", ["so hd", "so hop dong", "thoi gian ky", "thoi gian kt", "lan ky", "ngay ky", "ngay het han hd", "contract no", "hop dong ctv"]],
  ["Ghi chú", ["ghi chu", "note", "notes"]],
]

type Syn = { s: string; exact: boolean; w: number };
const compile = (list: string[]): Syn[] => list.map((x) => { const [s, w] = x.split("|"); const exact = s!.startsWith("="); return { s: norm(exact ? s!.slice(1) : s!), exact, w: Number(w ?? 3) }; });
const SYNC = Object.fromEntries(Object.entries(SYN).map(([k, v]) => [k, compile(v)])) as Record<ImportField, Syn[]>;
const LATERC = LATER.map(([label, list]) => [label, compile(list)] as const);

function score(h: string, s: Syn): number {
  if (!h) return 0;
  if (h === s.s) return 1000 + s.w * 10 + s.s.length;
  if (s.exact) return 0;
  if (h.startsWith(`${s.s} `) || h.endsWith(` ${s.s}`) || h.includes(` ${s.s} `)) return 100 + s.w * 10 + s.s.length;
  return 0;
}
/* Trường khớp nhất với một tiêu đề (đã chuẩn hóa) */
export function matchHeader(h: string): { field: ImportField | null; later: string | null; score: number } {
  let best: { field: ImportField | null; later: string | null; score: number } = { field: null, later: null, score: 0 };
  for (const f of Object.keys(SYNC) as ImportField[]) for (const s of SYNC[f]) { const v = score(h, s); if (v > best.score) best = { field: f, later: null, score: v }; }
  for (const [label, list] of LATERC) for (const s of list) { const v = score(h, s); if (v > best.score) best = { field: null, later: label, score: v }; }
  return best;
}

/* ---------- Giá trị ---------- */
const EPOCH = Date.UTC(1899, 11, 30);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};
const year = (s: string) => (s.length === 2 ? (Number(s) < 50 ? 2000 : 1900) + Number(s) : Number(s));
const DMY = /^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)?$/i;
/* Ngày ở dạng ngày/tháng hay tháng/ngày: chỉ biết chắc khi một phần > 12 */
export function dateEvidence(raw: string): "dmy" | "mdy" | null {
  const m = DMY.exec(raw.trim());
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return a > 12 && b <= 12 ? "dmy" : b > 12 && a <= 12 ? "mdy" : null;
}
/* undefined = ô trống; null = có giá trị nhưng không phải ngày có thật */
export function parseDate(raw: string, order: "dmy" | "mdy"): string | null | undefined {
  const s = clean(raw).replace(/^ngay\s+/i, "");
  if (!s) return undefined;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    return n >= 10_000 && n <= 80_000 ? new Date(EPOCH + n * 86_400_000).toISOString().slice(0, 10) : null;
  }
  let m = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = DMY.exec(s);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = year(m[3]!);
    return order === "mdy" && a <= 12 ? iso(y, a, b) : iso(y, b, a);
  }
  m = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s,-]+(\d{4}|\d{2})$/i.exec(s) ?? null;
  if (m) { const mo = MONTHS.indexOf(m[2]!.toLowerCase()) + 1; return mo ? iso(year(m[3]!), mo, Number(m[1])) : null; }
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m) { const mo = MONTHS.indexOf(m[1]!.toLowerCase()) + 1; return mo ? iso(Number(m[3]), mo, Number(m[2])) : null; }
  m = /^(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})$/.exec(norm(s));
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/* Điện thoại VN: bỏ ký tự phân cách, +84/84 → 0, mất số 0 đầu (Excel lưu dạng số) → thêm lại */
export function normPhone(raw: string): string | null | undefined {
  const s = clean(raw);
  if (!s) return undefined;
  const first = /\+?\d[\d\s.()-]{6,}\d/.exec(s.replace(/^(\d+(\.\d+)?e\+?\d+)$/i, (x) => BigInt(Number(x)).toString()))?.[0];
  if (!first) return null;
  let d = first.replace(/[^\d+]/g, "");
  if (d.startsWith("+84")) d = `0${d.slice(3)}`;
  else if (d.startsWith("84") && d.length === 11) d = `0${d.slice(2)}`;
  else if (/^[1-9]\d{8}$/.test(d)) d = `0${d}`;
  if (/^0\d{9,10}$/.test(d) || /^\+\d{8,15}$/.test(d)) return d;
  return null;
}
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export const normEmail = (raw: string): string | null | undefined => {
  const s = raw.trim();
  if (!s) return undefined;
  const m = EMAIL_RE.exec(s);
  return m && m[0].length <= 200 ? m[0].toLowerCase() : null;
};
export function normType(raw: string): EmploymentType | null | undefined {
  const n = norm(raw);
  if (!n) return undefined;
  const has = (...xs: string[]) => xs.some((x) => n === x || n.includes(x));
  if (has("thu viec", "hdtv", "probation", "trial") || n === "tv") return "probation";
  if (has("thuc tap", "intern", "tts", "hoc viec", "apprentice")) return "intern";
  if (has("cong tac vien", "ctv", "contractor", "freelance", "thoi vu", "khoan viec", "dich vu", "part time", "parttime", "ban thoi gian", "seasonal")) return "contractor";
  if (has("chinh thuc", "official", "full time", "fulltime", "permanent", "hdld", "lao dong", "khong xac dinh", "xdth", "khong thoi han", "co thoi han", "nam", "thang", "indefinite", "fixed term", "ct")) return "official";
  return null;
}
const LEFT = ["nghi viec", "da nghi", "thoi viec", "nghi huu", "ngung lam", "cham dut", "resign", "terminat", "inactive", "former", "quit", "da roi"];
export const isLeft = (raw: string) => { const n = norm(raw); return !!n && !n.includes("tam nghi") && LEFT.some((x) => n.includes(x)); };
const LEFT_SHEET = /\b(nghi viec|da nghi|thoi viec|resigned|terminated|former|inactive)\b/;
export const CODE_RE = /^[A-Za-z0-9._-]{2,40}$/;
export const normCode = (raw: string) => {
  let s = raw.trim();
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s) || /^\d+\.0+$/.test(s)) s = BigInt(Math.round(Number(s))).toString();
  return s.replace(/\s+/g, "").toUpperCase();
};

/* Mã đơn vị mới từ tên: nhiều từ → chữ đầu (Kinh doanh → KD), một từ → cả từ; trùng thì thêm số */
export function unitCode(name: string, taken: Set<string>): string {
  const words = norm(name).split(" ").filter(Boolean);
  let base = (words.length > 1 ? words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join("") : (words[0] ?? "DV")).toUpperCase().slice(0, 16) || "DV";
  if (base.length < 2) base = `${base}X`;
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}${i}`;
  taken.add(code);
  return code;
}
/* a có phải viết tắt / tên ngắn của b: "gt" ↔ "kenh gt", "hcns" ↔ "hanh chinh nhan su", "mkt" ↔ "marketing" */
export function abbrev(a: string, b: string): boolean {
  if (!a || !b || a === b || a.length >= b.length) return false;
  const A = a.replace(/ /g, ""), words = b.split(" ");
  if (A.length < 2) return false;
  if (!a.includes(" ") && words.length > 1 && words.includes(a)) return true;
  if (words.length > 1 && words.map((w) => w[0]).join("") === A) return true;
  if (!a.includes(" ") && A.length <= 5 && words.length === 1 && A[0] === b[0] && b.length >= A.length + 3) {
    let i = 0;
    for (const ch of b) if (ch === A[i]) i++;
    return i === A.length;
  }
  return false;
}

/* Giấy tờ/tiền: Excel hay lưu thành số nên mất số 0 đầu → thêm lại theo độ dài chuẩn */
const sciDigits = (raw: string) => (/^\s*\d+(\.\d+)?e\+?\d+\s*$/i.test(raw) && Number(raw) < 1e16 ? BigInt(Math.round(Number(raw))).toString() : raw);
export function normIdNumber(raw0: string): string | null | undefined {
  const raw = sciDigits(raw0);
  const d = raw.replace(/[\s.-]/g, "");
  if (!d) return undefined;
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 11) return `0${d}`;
  if (d.length === 8) return `0${d}`;
  return d.length === 12 || d.length === 9 ? d : null;
}
export function normDigits(raw0: string, min: number, max: number, pad?: number): string | null | undefined {
  const d = sciDigits(raw0).replace(/[\s.-]/g, "");
  if (!d) return undefined;
  if (!/^\d+$/.test(d)) return null;
  const v = pad && d.length === pad - 1 ? `0${d}` : d;
  return v.length >= min && v.length <= max ? v : null;
}
export const normGender = (raw: string): "male" | "female" | "other" | null | undefined => {
  const n = norm(raw);
  if (!n) return undefined;
  if (["nam", "male", "m", "trai", "anh", "ong"].includes(n)) return "male";
  if (["nu", "female", "f", "gai", "chi", "ba", "nu gioi"].includes(n)) return "female";
  if (["khac", "other"].includes(n)) return "other";
  return null;
};
/* Tiền VND: "8,000,000" / "8.000.000" / "1.7E7" / "15tr" / "999k" / "Từ 1/11: LCB 12,000,000 + KPI (4tr)". Lấy mức đầu tiên ≥ 100.000 (bỏ ngày
   tháng); extra = ô có chữ khác; many = có nhiều mức (vd. lương đổi theo ngày) → HR kiểm lại */
export function parseMoney(raw: string): { value: number | null; extra: boolean; many: boolean } | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s)) return { value: Math.round(Number(s)), extra: false, many: false };
  const vals: number[] = [];
  for (const m of s.matchAll(/(\d[\d.,]*\d|\d)\s*(triệu|trieu|tr|nghìn|ngàn|nghin|k)?/gi)) {
    const before = s[m.index - 1], after = s[m.index + m[1]!.length];
    if (before === "/" || after === "/" || after === "-" && !m[2]) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const v = /^(triệu|trieu|tr)$/.test(unit) ? Number(m[1]!.replace(",", ".")) * 1_000_000
      : /^(nghìn|ngàn|nghin|k)$/.test(unit) ? Number(m[1]!.replace(/[.,]/g, "")) * 1000 : Number(m[1]!.replace(/[.,]/g, ""));
    if (Number.isFinite(v) && v >= 100_000) vals.push(Math.round(v));
  }
  return { value: vals[0] ?? null, extra: /[a-zA-ZÀ-ỹđĐ+(]/.test(s), many: new Set(vals).size > 1 && /\n|từ|tu ngay|đến|den/i.test(s) };
}
export type Details = {
  birth_date?: string; gender?: string; id_number?: string; id_issued_on?: string; id_issued_by?: string; permanent_address?: string; address?: string;
  social_insurance_no?: string; tax_code?: string; bank?: { account_no: string; bank_name: string; holder: string }; comp?: { base: number; insurance: number | null };
};

/* ---------- Ghép toàn bộ ---------- */
type Unit = { code: string; name: string; tier?: ManagementTier | null };
export type Catalog = {
  departments: Unit[]; positions: Unit[];
  /* Đơn vị đã ngừng: chỉ để khớp người đã nghỉ + tránh trùng mã khi tạo mới */
  endedDepartments?: Unit[]; endedPositions?: Unit[];
  employees: Array<{ code: string; name: string; status: string }>;
};
export type Saved = { columns: Record<string, ImportField | "">; department: Record<string, string>; position: Record<string, string> };
export type BuiltRow = {
  sheet: string; line: number; code: string; fullName: string; email: string | null; phone: string | null; hireDate: string | null;
  type: EmploymentType; dept: string | null; pos: string; managerRaw: string | null; managerCode: string | null;
  /* left: người đã nghỉ việc — nhập làm hồ sơ tra cứu (status terminated); termDate có thể trống */
  left: boolean; termDate: string | null; skip: string | null; exists: boolean; errors: string[]; warnings: string[];
  /* Hồ sơ chi tiết (giai đoạn 2); service lọc theo quyền trước khi ghi */ details: Details;
};
export type Built = {
  sheets: ImportSheet[]; columns: ImportColumn[]; dateOrder: { value: "dmy" | "mdy"; ambiguous: boolean };
  departments: ImportUnit[]; positions: ImportUnit[]; rows: BuiltRow[]; fileErrors: string[];
};
export const DEFAULT_POSITION = "Nhân viên";
const MAX_HEADER_SCAN = 25;

type ColMap = { idx: number; key: string; header: string; field: ImportField | null; later: string | null; source: ImportColumn["source"] };

function headerOf(rows: string[][], saved: Saved, manual: ImportOptions["columns"]): { row: number; cols: ColMap[] } | null {
  let best: { row: number; hits: number } | null = null;
  for (let r = 0; r < Math.min(rows.length, MAX_HEADER_SCAN); r++) {
    const cells = rows[r] ?? [];
    let hits = 0, name = false;
    for (const c of cells) {
      const k = norm(c);
      const m = manual?.[k] ?? saved.columns[k];
      const f = m !== undefined ? (m || null) : matchHeader(k).field;
      if (f || (m === undefined && matchHeader(k).later)) hits++;
      if (f === "full_name" || f === "first_name") name = true;
    }
    /* Chỉ nhận ra cột họ tên: vẫn là tiêu đề nếu cả dòng là chữ (≥3 ô, không ô số/ngày) — các cột khác đoán theo nội dung hoặc HR chọn */
    const textRow = cells.filter((c) => c.trim()).length >= 3 && cells.every((c) => !c.trim() || (/[a-zA-ZÀ-ỹ]/.test(c) && !/\d{3,}/.test(c)));
    if (name && (hits >= 2 || textRow) && (!best || hits > best.hits)) best = { row: r, hits };
  }
  if (!best) return null;
  const head = rows[best.row]!;
  type Cand = ColMap & { score: number };
  const cand = head.map((h, idx): Cand => {
    const key = norm(h);
    const man = manual?.[key], sav = saved.columns[key];
    const m = matchHeader(key);
    if (man !== undefined) return { idx, key, header: clean(h), field: man || null, later: man ? null : m.later, source: "manual", score: 1e6 };
    if (sav !== undefined) return { idx, key, header: clean(h), field: sav || null, later: sav ? null : m.later, source: "saved", score: 1e5 };
    return { idx, key, header: clean(h), field: m.field, later: m.later, source: m.field ? "header" : null, score: m.score };
  }).filter((c) => c.key);
  /* Mỗi trường một cột: cột điểm cao giữ, cột còn lại về "không dùng" */
  const used = new Set<ImportField>();
  for (const c of [...cand].sort((a, b) => b.score - a.score || a.idx - b.idx)) {
    if (!c.field) continue;
    if (used.has(c.field)) { c.field = null; c.source = null; } else used.add(c.field);
  }
  /* Tiêu đề lạ: đoán email/điện thoại theo nội dung cả cột */
  const body = rows.slice(best.row + 1, best.row + 201);
  for (const [field, test] of [["work_email", (v: string) => !!normEmail(v)], ["phone", (v: string) => !!normPhone(v) && !/[a-z]/i.test(v)]] as const) {
    if (used.has(field)) continue;
    for (const c of cand) {
      if (c.field || c.later || c.source === "manual" || c.source === "saved") continue;
      const vals = body.map((r) => (r[c.idx] ?? "").trim()).filter(Boolean);
      if (vals.length >= 2 && vals.filter(test).length / vals.length >= 0.8) { c.field = field; c.source = "content"; used.add(field); break; }
    }
  }
  return { row: best.row, cols: cand };
}

type Input = { sheets: Sheet[]; saved: Saved; options: ImportOptions; today: string; catalog: Catalog };

/* Chuẩn hóa hồ sơ chi tiết của một dòng; giá trị sai → bỏ trường đó + cảnh báo (không chặn dòng) */
function detailsOf(at: (f: ImportField) => string, order: "dmy" | "mdy", today: string, fullName: string, warnings: string[]): Details {
  const d: Details = {};
  const bad = (label: string) => warnings.push(`${label} không hợp lệ — bỏ trống`);
  const birth = parseDate(at("birth_date"), order);
  if (birth === null) bad("Ngày sinh");
  else if (birth) {
    const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
    if (age < 14 || age > 100) warnings.push(`Ngày sinh ${fmtDate(birth)} (tuổi ${age}) bất thường — bỏ trống`); else d.birth_date = birth;
  }
  const g = normGender(at("gender")); if (g === null) bad("Giới tính"); else if (g) d.gender = g;
  const id = normIdNumber(at("id_number")); if (id === null) bad("Số CCCD/CMND"); else if (id) d.id_number = id;
  const issued = parseDate(at("id_issued_on"), order); if (issued === null) bad("Ngày cấp CCCD"); else if (issued) d.id_issued_on = issued;
  const by = clean(at("id_issued_by")); if (by) d.id_issued_by = by.slice(0, 200);
  const pa = clean(at("permanent_address")); if (pa) d.permanent_address = pa.slice(0, 300);
  const ca = clean(at("current_address")); if (ca) d.address = ca.slice(0, 300);
  const si = normDigits(at("social_insurance_no"), 10, 10, 10); if (si === null) bad("Số sổ BHXH"); else if (si) d.social_insurance_no = si;
  const tax = at("tax_code").replace(/\s/g, "");
  if (tax) { if (/^[0-9]{10}([0-9]{2}|-[0-9]{3})?$/.test(tax)) d.tax_code = tax; else bad("Mã số thuế"); }
  const acc = normDigits(at("bank_account"), 6, 20);
  const bankName = clean(at("bank_name"));
  if (acc === null) bad("Số tài khoản");
  else if (acc) {
    if (!bankName) warnings.push("Có số tài khoản nhưng thiếu tên ngân hàng — bỏ trống tài khoản");
    else {
      d.bank = { account_no: acc, bank_name: bankName.slice(0, 100), holder: (clean(at("bank_holder")) || fullName).slice(0, 100) };
      if (acc.length >= 16) warnings.push("Số tài khoản 16+ chữ số: nếu file lưu dạng số, Excel có thể đã làm tròn — kiểm tra lại");
    }
  }
  const money = (f: ImportField, label: string) => {
    const m = parseMoney(at(f));
    if (!m) return null;
    if (m.value == null || m.value < 100_000 || m.value > 10_000_000_000) { bad(label); return null; }
    if (m.many) warnings.push(`${label} ghi nhiều mức (thay đổi theo ngày) — tạm lấy ${m.value.toLocaleString("vi-VN")} ₫, kiểm tra lại`);
    else if (m.extra) warnings.push(`${label} có thêm chữ — lấy ${m.value.toLocaleString("vi-VN")} ₫`);
    return m.value;
  };
  const base = money("base_salary", "Lương cơ bản"), ins = money("insurance_salary", "Lương đóng BHXH");
  if (base) d.comp = { base, insurance: ins };
  else if (ins) warnings.push("Có lương đóng BHXH nhưng thiếu lương cơ bản — chưa tạo phiên bản lương");
  return d;
}

export function buildImport({ sheets, saved, options, today, catalog }: Input): Built {
  const fileErrors: string[] = [];
  const outSheets: ImportSheet[] = [];
  const used: Array<{ sheet: Sheet; head: { row: number; cols: ColMap[] }; left: boolean }> = [];
  const lookups: Array<{ sheet: Sheet; head: { row: number; cols: ColMap[] } }> = [];
  for (const sheet of sheets) {
    const head = sheet.rows.length ? headerOf(sheet.rows, saved, options.columns) : null;
    const fields = new Set(head?.cols.map((c) => c.field).filter(Boolean));
    const dataRows = head ? sheet.rows.slice(head.row + 1).filter((r) => r.some((c) => c.trim())).length : 0;
    const looksList = fields.has("department") || fields.has("hire_date") || fields.has("official_date") || fields.has("work_email");
    let note: string | null = null;
    if (sheet.hidden) note = "Sheet đang ẩn";
    else if (!head) note = sheet.rows.some((r) => r.some((c) => c.trim())) ? "Không thấy dòng tiêu đề có cột họ tên" : "Sheet trống";
    else if (!dataRows) note = "Không có dòng dữ liệu";
    else if (!looksList) note = "Chỉ có tên/mã — dùng làm bảng tra mã nhân viên";
    const auto = !note;
    const included = head && dataRows ? options.sheets?.[sheet.name] ?? auto : false;
    const left = LEFT_SHEET.test(norm(sheet.name));
    if (included && left) note = options.includeLeft === false ? "Sheet nhân viên đã nghỉ — bỏ qua (đã tắt nhập người đã nghỉ)" : "Sheet nhân viên đã nghỉ — lưu hồ sơ để tra cứu";
    outSheets.push({ name: sheet.name, included: !!included, headerRow: head ? head.row + 1 : null, rows: dataRows, note, selectable: !!head && dataRows > 0 });
    if (head && included) used.push({ sheet, head, left });
    else if (head && fields.has("employee_code")) lookups.push({ sheet, head });
  }
  if (!used.length) fileErrors.push(sheets.some((s) => s.rows.length) ? "Không tìm thấy sheet danh sách nhân viên (cần dòng tiêu đề có cột họ tên). Chọn cột ở bảng bên dưới hoặc chọn sheet." : "File trống.");

  /* Cột hiển thị cho HR (gộp theo tiêu đề giữa các sheet) */
  const colMap = new Map<string, ImportColumn>();
  for (const { sheet, head } of used) for (const c of head.cols) {
    const cur = colMap.get(c.key);
    if (cur) { cur.sheets++; continue; }
    const samples = c.later || (c.field && IMPORT_SENSITIVE[c.field]) ? [] : sheet.rows.slice(head.row + 1).map((r) => clean(r[c.idx] ?? "")).filter(Boolean).slice(0, 2).map((s) => s.slice(0, 40));
    colMap.set(c.key, { key: c.key, header: c.header, field: c.field, source: c.source, later: c.later, samples, sheets: 1 });
  }

  /* Thứ tự ngày/tháng: bằng chứng trên mọi cột ngày của file */
  const dateFields: ImportField[] = ["hire_date", "official_date", "termination_date"];
  let dmy = 0, mdy = 0;
  for (const { sheet, head } of used) for (const c of head.cols) if (c.field && dateFields.includes(c.field))
    for (const r of sheet.rows.slice(head.row + 1)) { const e = dateEvidence(r[c.idx] ?? ""); if (e === "dmy") dmy++; else if (e === "mdy") mdy++; }
  const detected = dmy > 0 && mdy === 0 ? "dmy" : mdy > 0 && dmy === 0 ? "mdy" : dmy || mdy ? (dmy >= mdy ? "dmy" : "mdy") : null;
  const order = options.dateOrder ?? detected ?? "dmy";
  const ambiguous = !options.dateOrder && (!detected || (dmy > 0 && mdy > 0));

  /* Bảng tra mã (sheet chỉ có tên + mã): chỉ dùng khi mọi bảng tra cùng một mã cho tên đó */
  const lookup = new Map<string, Set<string>>();
  for (const { sheet, head } of lookups) {
    const name = head.cols.find((c) => c.field === "full_name"), code = head.cols.find((c) => c.field === "employee_code");
    if (!name || !code) continue;
    for (const r of sheet.rows.slice(head.row + 1)) {
      const n = norm(r[name.idx] ?? ""), k = normCode(r[code.idx] ?? "");
      if (n && CODE_RE.test(k)) { const s = lookup.get(n) ?? new Set(); s.add(k); lookup.set(n, s); }
    }
  }

  const existingCode = new Map(catalog.employees.map((e) => [e.code.toUpperCase(), e]));
  const existingName = new Map<string, string[]>();
  for (const e of catalog.employees) { const n = norm(e.name); existingName.set(n, [...(existingName.get(n) ?? []), e.code.toUpperCase()]); }

  const rows: BuiltRow[] = [];
  for (const { sheet, head, left } of used) {
    const idx = (f: ImportField) => head.cols.find((c) => c.field === f)?.idx;
    const at = (r: string[], f: ImportField) => { const i = idx(f); return i === undefined ? "" : (r[i] ?? "").trim(); };
    const nameSyn = new Set(head.cols.map((c) => c.key));
    sheet.rows.forEach((r, i) => {
      if (i <= head.row) return;
      let fullName = clean(at(r, "full_name"));
      if (!fullName) fullName = clean([at(r, "last_name"), at(r, "middle_name"), at(r, "first_name")].join(" "));
      const nn = norm(fullName);
      if (!nn || !/[a-z]/.test(nn) || nameSyn.has(nn) || /^(tong|cong|total|sum)\b/.test(nn)) return;
      const errors: string[] = [], warnings: string[] = [];
      const line = i + 1;
      /* Nghỉ việc: theo sheet, cột trạng thái hoặc ngày nghỉ đã qua */
      const term = parseDate(at(r, "termination_date"), order);
      const gone = left || isLeft(at(r, "status")) || (!!term && term <= today);
      const skip: string | null = gone && options.includeLeft === false ? "Đã nghỉ việc — không nhập (đã tắt nhập người đã nghỉ)" : null;
      if (gone && !skip) warnings.push(term ? `Đã nghỉ việc từ ${fmtDate(term)} — lưu hồ sơ để tra cứu` : "Đã nghỉ việc (không có ngày nghỉ) — lưu hồ sơ để tra cứu");
      else if (term && !gone) warnings.push(`Có ngày nghỉ việc ${fmtDate(term)} — cập nhật nghỉ việc trong hồ sơ khi tới ngày`);
      if (fullName.length > 120) errors.push("Họ tên quá 120 ký tự");
      /* Mã */
      let code = normCode(at(r, "employee_code"));
      let exists = false;
      if (code && !CODE_RE.test(code)) { errors.push(`Mã "${code.slice(0, 20)}" chỉ gồm chữ, số, . _ - (2–40 ký tự)`); }
      if (!code) {
        const fromLookup = lookup.get(nn);
        const same = existingName.get(nn) ?? [];
        if (fromLookup?.size === 1) { code = [...fromLookup][0]!; warnings.push(`Mã ${code} lấy từ bảng tra theo họ tên`); }
        else if (same.length === 1) { code = same[0]!; }
        else if (same.length > 1) errors.push(`Không có mã và trùng tên với ${same.length} hồ sơ có sẵn — thêm cột mã nhân viên`);
      }
      if (code && existingCode.has(code)) exists = true;
      /* Ngày vào làm: cột ngày vào làm, không có thì ngày chính thức */
      const rawHire = at(r, "hire_date"), rawOff = at(r, "official_date");
      const hire = parseDate(rawHire, order), off = parseDate(rawOff, order);
      let hireDate: string | null = hire ?? null;
      if (hire === null) errors.push(`Ngày vào làm "${rawHire.slice(0, 20)}" không phải ngày có thật`);
      else if (hire === undefined) {
        if (off) { hireDate = off; warnings.push("Không có ngày vào làm — dùng ngày chính thức"); }
        else errors.push("Thiếu ngày vào làm");
      }
      if (off === null) warnings.push(`Ngày chính thức "${rawOff.slice(0, 20)}" không đọc được — bỏ qua`);
      /* Loại hợp đồng: chữ trong file, ngày chính thức còn ở tương lai = thử việc */
      const rawType = at(r, "employment_type");
      let type = normType(rawType);
      if (type === null) { warnings.push(`Loại hợp đồng "${rawType.slice(0, 20)}" chưa rõ — tạm tính theo ngày chính thức`); }
      if (!type) type = off && off > today ? "probation" : "official";
      else if (type === "official" && off && off > today) type = "probation";
      /* Liên hệ: lỗi định dạng chỉ cảnh báo, không chặn nhập */
      const email = normEmail(at(r, "work_email"));
      if (email === null) warnings.push("Email không hợp lệ — bỏ trống, bổ sung sau để mời đăng nhập");
      else if (email === undefined) warnings.push("Chưa có email — nhập được hồ sơ, chưa mời đăng nhập");
      const phone = normPhone(at(r, "phone"));
      if (phone === null) warnings.push("Số điện thoại không hợp lệ — bỏ trống");
      const dept = clean(at(r, "department")) || null;
      if (!dept) errors.push("Thiếu phòng ban");
      let pos = clean(at(r, "position"));
      if (!pos) { pos = DEFAULT_POSITION; warnings.push(`Không có chức danh — dùng "${DEFAULT_POSITION}"`); }
      rows.push({ sheet: sheet.name, line, code, fullName, email: email ?? null, phone: phone ?? null, hireDate, type, dept, pos,
        managerRaw: clean(at(r, "manager")) || null, managerCode: null, left: gone, termDate: gone ? term ?? null : null, skip, exists, errors, warnings,
        details: detailsOf((f) => at(r, f), order, today, fullName, warnings) });
    });
  }

  /* Người đã nghỉ: thiếu dữ liệu thì bỏ qua (không chặn nhập người đang làm); trùng người đang làm (tái tuyển) thì giữ dòng đang làm */
  const liveNames = new Set(rows.filter((r) => !r.left && !r.skip).map((r) => norm(r.fullName)));
  const liveCodes = new Set(rows.filter((r) => !r.left && !r.skip && r.code).map((r) => r.code));
  for (const r of rows) if (r.left && !r.skip) {
    if ((r.code && liveCodes.has(r.code)) || (!r.code && liveNames.has(norm(r.fullName)))) r.skip = "Đã có ở danh sách đang làm (tái tuyển) — giữ dòng đang làm";
    else if (r.errors.length) { r.skip = `Người đã nghỉ thiếu dữ liệu: ${r.errors.join("; ")}`; r.errors = []; }
  }
  /* Trùng trong file + mã tự sinh */
  const live = rows.filter((r) => !r.skip);
  const seenCode = new Map<string, BuiltRow>(), seenEmail = new Map<string, BuiltRow>();
  for (const r of live) {
    if (r.code) {
      const o = seenCode.get(r.code);
      /* Người đã nghỉ trùng mã (máy chấm công dùng lại mã): cùng người thì bỏ dòng lặp, khác người thì đặt mã mới — không chặn file */
      if (o && r.left && norm(o.fullName) === norm(r.fullName)) { r.skip = `Trùng dòng ${o.line} (${o.sheet})`; continue; }
      if (o && r.left) { r.warnings.push(`Mã ${r.code} đã dùng cho ${o.fullName} (${o.sheet} dòng ${o.line}) — đặt mã mới`); r.code = ""; r.exists = false; }
      else if (o) r.errors.push(`Trùng mã ${r.code} với ${o.sheet} dòng ${o.line}`); else seenCode.set(r.code, r);
    }
    if (r.email) {
      const o = seenEmail.get(r.email);
      if (o) { r.warnings.push(`Email trùng với ${o.sheet} dòng ${o.line} — bỏ trống`); r.email = null; } else seenEmail.set(r.email, r);
    }
  }
  const kept = live.filter((r) => !r.skip);
  const taken = new Set([...existingCode.keys(), ...seenCode.keys()]);
  let maxNv = 0;
  for (const c of taken) { const m = /^NV(\d+)$/.exec(c); if (m) maxNv = Math.max(maxNv, Number(m[1])); }
  const autoNames = new Map<string, number>();
  for (const r of kept) if (!r.code && !r.errors.length) autoNames.set(norm(r.fullName), (autoNames.get(norm(r.fullName)) ?? 0) + 1);
  for (const r of kept) if (!r.skip && !r.code && !r.errors.some((e) => e.startsWith("Không có mã"))) {
    r.code = `NV${String(++maxNv).padStart(4, "0")}`;
    r.warnings.push(`Không có mã — Kavor đặt ${r.code}`);
    if ((autoNames.get(norm(r.fullName)) ?? 0) > 1) r.warnings.push("Trùng họ tên với dòng khác trong file — kiểm tra có nhập 2 lần không");
  }

  /* Quản lý: theo mã, không có thì theo họ tên duy nhất (trong Kavor hoặc trong file) */
  const nameToCode = new Map<string, string[]>();
  for (const [n, codes] of existingName) nameToCode.set(n, [...codes]);
  for (const r of kept) if (r.code && !r.exists) { const n = norm(r.fullName); nameToCode.set(n, [...(nameToCode.get(n) ?? []), r.code]); }
  const fileCodes = new Set(kept.map((r) => r.code).filter(Boolean));
  for (const r of kept) {
    if (!r.managerRaw) continue;
    const c = normCode(r.managerRaw);
    const byName = nameToCode.get(norm(r.managerRaw)) ?? [];
    const code = existingCode.has(c) || fileCodes.has(c) ? c : byName.length === 1 ? byName[0]! : null;
    if (!code) r.warnings.push(`Không xác định được quản lý "${r.managerRaw.slice(0, 30)}" — gán sau`);
    else if (code === r.code) r.warnings.push("Không tự làm quản lý của mình — bỏ quản lý");
    else r.managerCode = code;
  }

  const units = (kind: "department" | "position", values: Array<{ v: string; r: BuiltRow }>, cat: Unit[], ended: Unit[]): ImportUnit[] => {
    const byCode = new Map(cat.map((u) => [u.code.toUpperCase(), u])), byName = new Map(cat.map((u) => [norm(u.name), u]));
    const endedByName = new Map(ended.map((u) => [norm(u.name), u]));
    const groups = new Map<string, { value: string; rows: number; live: number }>();
    for (const { v, r } of values) {
      const k = norm(v); const g = groups.get(k) ?? { value: v, rows: 0, live: 0 };
      g.rows++; if (!r.left) g.live++; groups.set(k, g);
    }
    const codes = new Set([...cat, ...ended].map((u) => u.code.toUpperCase()));
    const tierOpt = kind === "position" ? options.tiers ?? {} : {};
    const list: ImportUnit[] = [...groups].sort((a, b) => b[1].live - a[1].live || b[1].rows - a[1].rows).map(([key, g]) => {
      /* Đơn vị chỉ có người đã nghỉ: được khớp cả đơn vị đã ngừng (nhập lại không tạo trùng) */
      const ex = byCode.get(normCode(g.value)) ?? byName.get(key) ?? (g.live ? null : endedByName.get(key)) ?? null;
      const inferred = kind === "position" ? (ex && ex.tier ? ex.tier : tierOpt[key] ?? inferTier(g.value)) : null;
      return { key, value: g.value, rows: g.rows, live: g.live, existing: ex ? { code: ex.code, name: ex.name, tier: ex.tier ?? null } : null, choice: "", suggested: false, newCode: "",
        tier: inferred, tierInferred: kind === "position" && !(ex && ex.tier) && tierOpt[key] === undefined };
    });
    for (const u of list) if (!u.existing) u.newCode = unitCode(u.value, codes);
    const manual = options.units?.[kind] ?? {}, remembered = kind === "department" ? saved.department : saved.position;
    const valid = (c: string | undefined) => !!c && (c.startsWith("code:") ? byCode.has(c.slice(5).toUpperCase()) : c.startsWith("new:") && list.some((x) => x.key === c.slice(4) && !x.existing));
    for (const u of list) {
      if (u.existing) { u.choice = `code:${u.existing.code}`; continue; }
      if (valid(manual[u.key])) { u.choice = manual[u.key]!; continue; }
      if (valid(remembered[u.key])) { u.choice = remembered[u.key]!; continue; }
      const sug = [...cat.filter((x) => abbrev(u.key, norm(x.name)) || abbrev(norm(x.name), u.key)).map((x) => `code:${x.code}`),
        ...list.filter((x) => x !== u && !x.existing && x.rows >= u.rows && (abbrev(u.key, x.key) || abbrev(x.key, u.key))).map((x) => `new:${x.key}`)];
      if (sug.length === 1 && sug[0] !== `new:${u.key}`) { u.choice = sug[0]!; u.suggested = true; } else u.choice = `new:${u.key}`;
    }
    /* Gộp vào nhóm mới khác: nhóm đích phải tự tạo mới (không chuỗi gộp) */
    for (const u of list) if (u.choice.startsWith("new:") && u.choice !== `new:${u.key}`) {
      const t = list.find((x) => x.key === u.choice.slice(4));
      if (!t || t.choice !== `new:${t.key}`) { u.choice = t && t.choice.startsWith("code:") ? t.choice : `new:${u.key}`; }
    }
    return list;
  };
  const departments = units("department", kept.filter((r) => r.dept).map((r) => ({ v: r.dept!, r })), catalog.departments, catalog.endedDepartments ?? []);
  const positions = units("position", kept.map((r) => ({ v: r.pos, r })), catalog.positions, catalog.endedPositions ?? []);

  return { sheets: outSheets, columns: [...colMap.values()], dateOrder: { value: order, ambiguous }, departments, positions, rows, fileErrors };
}
