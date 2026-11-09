/* Tính một dòng kỳ lương từ bảng lương đầu vào đã chốt + danh mục khoản của công ty + cài đặt lương công ty + tham số luật (thuần, có test).
   Lương theo công = lương cơ bản × công hưởng lương ÷ công chuẩn (từng đoạn nếu đổi lương giữa kỳ). Khoản theo danh mục: by_workdays theo công,
   fixed trả đủ khi có công, conditional (chuyên cần) chỉ khi đủ công + không trễ + không thiếu chấm công + không nghỉ không lương. Làm thêm giờ =
   lương giờ (lương cơ bản ÷ công chuẩn ÷ 8) × giờ × hệ số; phần cao hơn giờ thường miễn thuế. Rồi bộ tính luật (calc.ts). */
import type { PayCalcResult, PayrollComputeLine, PayrollConfig, PayrollInputRow, PayrollLawParams } from "@kavor/contracts";
import { computePay } from "./calc.js";

export type PayItemMeta = { id: string; name: string; payMode: "by_workdays" | "fixed" | "conditional"; insurable: boolean; taxMode: "taxable" | "exempt" | "partial"; taxFreeCap: number | null };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;
const d = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const cut = (s: string) => (s.length > 200 ? `${s.slice(0, 197)}…` : s);

export type CycleRowResult = { gross: number; deduction: number; net: number; lines: PayrollComputeLine[]; warnings: string[]; calc: PayCalcResult };

export function computeCycleRow(row: PayrollInputRow, items: Map<string, PayItemMeta>, config: PayrollConfig, law: PayrollLawParams, lawFrom: string): CycleRowResult | { skip: string } {
  const std = row.standard;
  if (!(std > 0)) return { skip: "Kỳ công không có công chuẩn" };
  const segs = row.segments.length ? row.segments : [{ from: "", to: "", baseSalary: row.baseSalary, insuranceSalary: row.insuranceSalary, allowance: row.allowance, items: row.items, employmentType: row.employmentType, credited: row.credited }];
  if (segs.some((g) => g.baseSalary == null)) return { skip: "Chưa có mức lương" };
  const lines: PayrollComputeLine[] = [], warnings: string[] = [];
  /* 1. Lương theo công */
  let base = 0;
  const parts = segs.map((g) => { const v = (g.baseSalary! * g.credited) / std; base += v; return `${vnd(g.baseSalary!)} × ${d(g.credited)}/${d(std)} công`; });
  base = Math.round(base);
  lines.push({ code: "BASE", name: "Lương theo công", kind: "earning", amount: base, formula: cut(parts.join(" + ")) });
  /* 2. Khoản theo danh mục công ty */
  let taxFree = 0, insurableItems = 0;
  const full = row.missingDays === 0 && row.lateMinutes === 0 && row.unpaidLeaveDays === 0 && row.credited >= std;
  for (const it of row.items ?? []) {
    const m = items.get(it.itemId);
    if (!m) { warnings.push(`Khoản "${it.name}" không còn trong danh mục — bỏ qua`); continue; }
    let amt = 0, f = "";
    if (m.payMode === "by_workdays") { amt = Math.round((it.amount * row.credited) / std); f = `${vnd(it.amount)} × ${d(row.credited)}/${d(std)} công`; }
    else if (m.payMode === "fixed") { amt = row.credited > 0 ? it.amount : 0; f = row.credited > 0 ? "Cố định theo tháng" : "Không có công trong kỳ"; }
    else { amt = full ? it.amount : 0; f = full ? "Đủ điều kiện (đủ công, không trễ, không thiếu chấm công)" : `Không đủ điều kiện${row.lateMinutes ? ` · trễ ${row.lateMinutes} phút` : ""}${row.missingDays ? ` · thiếu ${row.missingDays} ngày chấm công` : ""}${row.unpaidLeaveDays ? ` · nghỉ không lương ${d(row.unpaidLeaveDays)} ngày` : ""}`; }
    if (m.insurable) insurableItems += it.amount;
    const free = m.taxMode === "exempt" ? amt : m.taxMode === "partial" ? Math.min(amt, m.taxFreeCap ?? 0) : 0;
    taxFree += free;
    if (amt || m.payMode === "conditional") lines.push({ code: `ITEM_${m.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`, name: m.name, kind: "earning", amount: amt,
      formula: cut(`${f}${free ? ` · miễn thuế ${vnd(free)}` : ""}`) });
  }
  /* 3. Làm thêm giờ */
  const lastBase = segs[segs.length - 1]!.baseSalary!, hourly = lastBase / std / 8;
  let ot = 0;
  const otParts: string[] = [];
  for (const [coef, minutes] of Object.entries(row.overtime ?? {})) {
    const c = Number(coef), h = minutes / 60;
    if (!h || !c) continue;
    const v = Math.round(h * hourly * c / 100);
    ot += v; taxFree += Math.round(v * (c - 100) / c);
    otParts.push(`${d(h)} giờ × ${vnd(hourly)} × ${c}%`);
  }
  if (ot) lines.push({ code: "OT_PAY", name: "Làm thêm giờ", kind: "earning", amount: ot, formula: cut(`${otParts.join(" + ")} · phần trên giờ thường miễn thuế`) });
  const gross = lines.reduce((n, l) => n + l.amount, 0);
  /* 4. Luật: BH, đoàn phí, thuế, tạm ứng */
  const type = segs[segs.length - 1]!.employmentType;
  const casual = type === "contractor" || type === "intern" || (type === "probation" && config.probation === "withholding");
  const insuranceSalary = row.insuranceSalary ?? (lastBase + insurableItems);
  /* Luật BHXH: tháng không làm việc và không hưởng lương từ 14 ngày làm việc trở lên thì không đóng BHXH/BHYT/BHTN */
  const unpaid = std - row.credited, insured = unpaid < 14;
  if (!casual && !insured) warnings.push(`Không hưởng lương ${d(unpaid)} ngày (từ 14 ngày làm việc) — tháng này không đóng BH`);
  const calc = computePay({ date: lawFrom, gross, taxFree, insuranceSalary, region: config.region, dependents: row.dependents, unionMember: row.unionMember,
    contract: casual ? "casual" : "labor", advance: row.advance, insured }, law, lawFrom, []);
  const MAP: Record<string, [string, string]> = { si: ["INS_SI", "BHXH"], hi: ["INS_HI", "BHYT"], ui: ["INS_UI", "BHTN"], union: ["UNION_FEE", "Đoàn phí"], pit: ["PIT", "Thuế TNCN"], advance: ["ADVANCE", "Tạm ứng"] };
  for (const l of calc.employee) if (l.amount && MAP[l.key]) lines.push({ code: MAP[l.key]![0], name: MAP[l.key]![1], kind: "deduction", amount: l.amount, formula: cut(l.formula) });
  if (casual) warnings.push(type === "probation" ? "Thử việc: không đóng BH, khấu trừ 10% (theo cài đặt công ty)" : "Hợp đồng không đóng BH: khấu trừ 10%");
  warnings.push(...calc.unverified, ...row.warnings);
  const deduction = lines.filter((l) => l.kind === "deduction").reduce((n, l) => n + l.amount, 0);
  if (gross - deduction < 0) warnings.push("Thực nhận âm (tạm ứng/khấu trừ lớn hơn thu nhập)");
  return { gross, deduction, net: gross - deduction, lines, warnings, calc };
}
