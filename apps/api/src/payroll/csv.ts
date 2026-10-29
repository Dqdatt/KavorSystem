/* CSV xuất từ Sheets/Excel: dấu phẩy, hoặc dấu chấm phẩy (Excel cài vùng Việt Nam), UTF-8/BOM, CRLF, ô có quote và xuống dòng.
   Không chép ô tiền/note vào chẩn đoán; kết quả chỉ được áp khi toàn file không có lỗi. */
import type { PayComponent, PayrollIssue } from "@kavor/contracts";

export type CsvRecord = { line: number; cells: string[] };
export type ImportRow = {
  employeeId: string; employeeCode: string; line: number; gross: number; deduction: number; net: number;
  workDays: number | null; note: string | null; items: Array<{ componentId: string; amount: number }>;
};
export const issue = (severity: PayrollIssue["severity"], code: string, message: string, row: number | null = null, column: string | null = null, employeeCode: string | null = null): PayrollIssue =>
  ({ severity, code, message, row, column, employeeCode });

/* Dấu phân cách đoán theo dòng tiêu đề (ngoài quote): nhiều ";" hơn "," thì là file Excel vùng Việt Nam */
export function csvDelimiter(csv: string): "," | ";" {
  let commas = 0, semis = 0, quoted = false;
  for (const c of csv) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && c === ",") commas++;
    else if (!quoted && c === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

export function readCsv(source: string): { records: CsvRecord[]; errors: PayrollIssue[] } {
  const csv = source.replace(/^\uFEFF/, "");
  const sep = csvDelimiter(csv);
  const records: CsvRecord[] = [], errors: PayrollIssue[] = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false, line = 1, start = 1;
  const finish = () => {
    cells.push(cell);
    // Bỏ dòng trắng thực sự; không bỏ các bản ghi chỉ có dấu phẩy hoặc ô quote rỗng.
    if (cells.length > 1 || cells[0]!.trim() || closed) records.push({ line: start, cells });
    cells = []; cell = ""; closed = false;
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        cell += c;
        if (c === "\n" || (c === "\r" && csv[i + 1] !== "\n")) line++;
      }
    } else if (c === sep) { cells.push(cell); cell = ""; closed = false; }
    else if (c === "\r" || c === "\n") {
      finish();
      if (c === "\r" && csv[i + 1] === "\n") i++;
      line++; start = line;
    } else if (c === '"' && cell === "" && !closed) quoted = true;
    else {
      if (c === '"' || closed) errors.push(issue("error", "CSV_SYNTAX", "Quote hoặc ký tự sau quote không hợp lệ.", start));
      cell += c;
    }
  }
  if (quoted) errors.push(issue("error", "CSV_SYNTAX", "Ô có quote chưa được đóng.", start));
  if (cell || cells.length || closed || quoted) finish();
  return { records, errors };
}

function money(s: string, net: boolean): number | null {
  if (!s && !net) return 0;
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(s)) return null;
  const n = Number(s.replace(/\./g, ""));
  return Number.isSafeInteger(n) && (net || n >= 0) ? n : null;
}

export function validateCsv(parsed: ReturnType<typeof readCsv>, components: PayComponent[], employees: Map<string, string>) {
  const errors = [...parsed.errors];
  const [head, ...records] = parsed.records;
  const rows: ImportRow[] = [];
  const add = (code: string, message: string, row: number | null = null, column: string | null = null, employee: string | null = null) => errors.push(issue("error", code, message, row, column, employee));
  if (!head) { add("CSV_EMPTY", "File CSV trống."); return { rows, errors, totalRows: 0, errorRows: 0 }; }
  const headers = head.cells.map((v) => v.trim());
  const byCode = new Map(components.map((c) => [c.code, c]));
  const seenHeaders = new Set<string>();
  for (const h of headers) {
    if (seenHeaders.has(h)) add("HEADER_DUPLICATE", "Header bị trùng.", null, h);
    seenHeaders.add(h);
    if (!["employee_code", "work_days", "note"].includes(h) && !byCode.has(h)) add("HEADER_UNKNOWN", "Cột không thuộc danh mục thành phần lương của công ty.", null, h);
  }
  for (const h of ["employee_code", "NET"]) if (!headers.includes(h)) add("HEADER_REQUIRED", "Thiếu cột bắt buộc.", null, h);
  if (!records.length) add("CSV_NO_ROWS", "File không có dòng dữ liệu.");
  if (errors.some((e) => e.row === null || e.row === head.line)) return { rows, errors, totalRows: records.length, errorRows: records.length };
  const seen = new Set<string>();
  for (const rec of records) {
    const before = errors.length;
    const get = (k: string) => (rec.cells[headers.indexOf(k)] ?? "").trim();
    const code = get("employee_code"), id = employees.get(code);
    const safeCode = code.length <= 50 ? code : null;
    if (rec.cells.length !== headers.length) add("ROW_WIDTH", "Số ô không khớp header.", rec.line);
    if (!id) add("EMPLOYEE_UNKNOWN", "Mã nhân viên trống hoặc không thuộc công ty.", rec.line, "employee_code", safeCode);
    if (seen.has(code)) add("EMPLOYEE_DUPLICATE", "Nhân viên bị trùng dòng.", rec.line, "employee_code", safeCode);
    seen.add(code);
    let gross = 0, deduction = 0, net = 0;
    const items: ImportRow["items"] = [];
    for (const h of headers) {
      const comp = byCode.get(h);
      if (!comp) continue;
      const amount = money(get(h), comp.kind === "net");
      if (amount === null) { add("MONEY_INVALID", "Số tiền phải là VND nguyên, đúng định dạng và trong giới hạn chính xác; thu nhập/khấu trừ không âm.", rec.line, h, safeCode); continue; }
      items.push({ componentId: comp.id, amount });
      if (comp.kind === "earning") gross += amount;
      else if (comp.kind === "deduction") deduction += amount;
      else net = amount;
    }
    if (![gross, deduction, gross - deduction].every(Number.isSafeInteger)) add("TOTAL_OVERFLOW", "Tổng tiền vượt giới hạn biểu diễn chính xác.", rec.line, null, safeCode);
    else if (net !== gross - deduction) add("NET_MISMATCH", "NET không bằng tổng thu nhập trừ tổng khấu trừ.", rec.line, "NET", safeCode);
    const wd = get("work_days");
    const workDays = wd ? Number(wd) : null;
    if (wd && (!/^\d+(?:\.\d+)?$/.test(wd) || !Number.isFinite(workDays) || workDays! < 0 || workDays! > 31)) add("WORK_DAYS_INVALID", "Ngày công phải là số từ 0 đến 31, phần lẻ dùng dấu chấm.", rec.line, "work_days", safeCode);
    const note = get("note") || null;
    if (note && note.length > 1000) add("NOTE_TOO_LONG", "Ghi chú tối đa 1.000 ký tự.", rec.line, "note", safeCode);
    if (errors.length === before && id) rows.push({ employeeId: id, employeeCode: code, line: rec.line, gross, deduction, net, workDays, note, items });
  }
  const badLines = new Set(errors.filter((e) => e.row !== null).map((e) => e.row));
  return { rows, errors, totalRows: records.length, errorRows: records.filter((r) => badLines.has(r.line)).length };
}
