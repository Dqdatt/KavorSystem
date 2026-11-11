/* Tính một dòng kỳ lương từ bảng lương đầu vào đã chốt + danh mục khoản của công ty + quy chế lương công ty + tham số luật (thuần, có test).
   - Lương theo công = lương cơ bản × công hưởng lương ÷ công chuẩn, từng đoạn nếu đổi lương/tình trạng giữa kỳ.
   - Thử việc (BLLĐ 2019 Điều 26): lương = tỷ lệ quy chế (≥ 85%) × lương cứng. Quy chế "không phụ cấp" → gộp thành một dòng "Lương thử việc";
     có phụ cấp → lương và từng khoản đều nhân tỷ lệ.
   - Khoản theo danh mục: by_workdays theo công, fixed trả đủ khi có công, conditional (chuyên cần) chỉ khi đủ công + không trễ + không thiếu chấm công
     + không nghỉ không lương. Quy chế "chia trên tổng": (lương + khoản theo công) ÷ công chuẩn × công thực tế làm tròn một lần, dòng cuối nhận phần lẻ.
   - Làm thêm giờ = lương giờ (lương cơ bản ÷ công chuẩn ÷ 8) × giờ × hệ số; miễn thuế theo tham số luật. Ăn giữa ca miễn đến mức luật.
   - BH/thuế: HĐ thử việc riêng, thực tập, cộng tác viên = không BH + khấu trừ 10% (từ ngưỡng, cam kết 08); thử việc trong HĐLĐ = như chính thức.
     Đoàn phí theo quy chế (có thu không, tỷ lệ riêng hoặc theo luật). Rồi bộ tính luật (calc.ts). */
import type { PayCalcResult, PayrollComputeLine, PayrollConfig, PayrollInputRow, PayrollInputSegment, PayrollLawParams } from "@kavor/contracts";
import { computePay } from "./calc.js";

export type PayItemMeta = { id: string; name: string; payMode: "by_workdays" | "fixed" | "conditional"; insurable: boolean; taxMode: "taxable" | "exempt" | "partial" | "meal"; taxFreeCap: number | null };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;
const d = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (r: number) => `${(r * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const cut = (s: string) => (s.length > 200 ? `${s.slice(0, 197)}…` : s);
const code = (id: string) => `ITEM_${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

export type CycleRowResult = { gross: number; deduction: number; net: number; lines: PayrollComputeLine[]; warnings: string[]; calc: PayCalcResult };
type Seg = PayrollInputSegment & { factor: number; probation: boolean; lump: boolean };
/* Dòng chờ làm tròn: raw = số chưa làm tròn, prorated = phần chia theo công (để "chia trên tổng") */
type Draft = { code: string; name: string; raw: number; prorated: boolean; formula: string; free: (amt: number) => number; keep?: boolean };

export function computeCycleRow(row: PayrollInputRow, items: Map<string, PayItemMeta>, config: PayrollConfig, law: PayrollLawParams, lawFrom: string): CycleRowResult | { skip: string } {
  const std = row.standard;
  if (!(std > 0)) return { skip: "Kỳ công không có công chuẩn" };
  const raw = row.segments.length ? row.segments : [{ from: "", to: "", baseSalary: row.baseSalary, insuranceSalary: row.insuranceSalary, allowance: row.allowance, items: row.items, employmentType: row.employmentType, credited: row.credited }];
  if (raw.some((g) => g.baseSalary == null)) return { skip: "Chưa có mức lương" };
  const rate = config.probationRate;
  const segs: Seg[] = raw.map((g) => {
    const probation = g.employmentType === "probation";
    return { ...g, items: g.items ?? row.items, probation, factor: probation ? rate : 1, lump: probation && !config.probationAllowances };
  });
  const lines: PayrollComputeLine[] = [], warnings: string[] = [], drafts: Draft[] = [];
  const none = () => 0;
  /* 1. Lương theo công (thử việc không phụ cấp: gộp lương cứng × tỷ lệ) */
  const allProbationLump = segs.every((g) => g.lump);
  let baseRaw = 0;
  const parts = segs.map((g) => {
    const money = g.lump ? g.baseSalary! + g.allowance : g.baseSalary!;
    baseRaw += (money * g.factor * g.credited) / std;
    const what = g.lump ? `${pct(g.factor)} × lương cứng ${vnd(money)}` : g.probation ? `${pct(g.factor)} × ${vnd(money)}` : vnd(money);
    return `${what} × ${d(g.credited)}/${d(std)} công`;
  });
  drafts.push({ code: "BASE", name: allProbationLump ? "Lương thử việc" : "Lương theo công", raw: baseRaw, prorated: true, formula: parts.join(" + "), free: none, keep: true });
  /* 2. Khoản theo danh mục (bỏ đoạn thử việc gộp) */
  const paid = segs.filter((g) => !g.lump);
  const paidCredited = paid.reduce((n, g) => n + g.credited, 0);
  const full = row.missingDays === 0 && row.lateMinutes === 0 && row.unpaidLeaveDays === 0 && row.credited >= std;
  let insurableItems = 0;
  const last = segs[segs.length - 1]!;
  for (const it of (paid.length ? paid[paid.length - 1]!.items : last.items) ?? []) {
    const m = items.get(it.itemId);
    if (!m) { warnings.push(`Khoản "${it.name}" không còn trong danh mục — bỏ qua`); continue; }
    const amountIn = (g: Seg) => g.items?.find((x) => x.itemId === it.itemId)?.amount ?? 0;
    let amt = 0, f = "", prorated = false;
    if (m.payMode === "by_workdays") {
      amt = paid.reduce((n, g) => n + (amountIn(g) * g.factor * g.credited) / std, 0); prorated = true;
      f = paid.map((g) => `${g.probation ? `${pct(g.factor)} × ` : ""}${vnd(amountIn(g))} × ${d(g.credited)}/${d(std)} công`).join(" + ");
    } else if (m.payMode === "fixed") {
      const g = paid[paid.length - 1];
      amt = g && paidCredited > 0 ? amountIn(g) * g.factor : 0; f = amt ? "Cố định theo tháng" : "Không có công trong kỳ";
    } else {
      const g = paid[paid.length - 1];
      amt = full && g ? amountIn(g) * g.factor : 0;
      f = amt ? "Đủ điều kiện (đủ công, không trễ, không thiếu chấm công)" : `Không đủ điều kiện${row.lateMinutes ? ` · trễ ${row.lateMinutes} phút` : ""}${row.missingDays ? ` · thiếu ${row.missingDays} ngày chấm công` : ""}${row.unpaidLeaveDays ? ` · nghỉ không lương ${d(row.unpaidLeaveDays)} ngày` : ""}`;
    }
    if (m.insurable) insurableItems += amountIn(last) * last.factor;
    const free = (v: number) => (m.taxMode === "exempt" ? v : m.taxMode === "partial" ? Math.min(v, m.taxFreeCap ?? 0) : m.taxMode === "meal" ? Math.min(v, law.taxFree.meal) : 0);
    drafts.push({ code: code(m.id), name: m.name, raw: amt, prorated, formula: f, free, keep: m.payMode === "conditional" });
  }
  /* Làm tròn: chia trên tổng (một đoạn lương) → làm tròn tổng phần theo công một lần, dòng cuối nhận phần lẻ; còn lại làm tròn từng dòng */
  const pro = drafts.filter((x) => x.prorated && x.raw > 0);
  const amounts = new Map<Draft, number>(drafts.map((x) => [x, Math.round(x.raw)]));
  if (config.prorate === "total" && pro.length > 1) {
    const total = Math.round(pro.reduce((n, x) => n + x.raw, 0));
    let used = 0;
    pro.forEach((x, i) => { const v = i === pro.length - 1 ? total - used : Math.round(x.raw); used += v; amounts.set(x, v); });
  }
  let taxFree = 0;
  for (const x of drafts) {
    const amt = amounts.get(x)!;
    const free = x.free(amt);
    taxFree += free;
    if (amt || x.keep) lines.push({ code: x.code, name: x.name, kind: "earning", amount: amt, formula: cut(`${x.formula}${free ? ` · miễn thuế ${vnd(free)}` : ""}`) });
  }
  /* 3. Làm thêm giờ */
  const lastBase = last.baseSalary! * last.factor, hourly = lastBase / std / 8;
  let ot = 0;
  const otParts: string[] = [];
  for (const [coef, minutes] of Object.entries(row.overtime ?? {})) {
    const c = Number(coef), h = minutes / 60;
    if (!h || !c) continue;
    const v = Math.round(h * hourly * c / 100);
    ot += v; taxFree += law.overtimeTaxFree === "full" ? v : Math.round(v * (c - 100) / c);
    otParts.push(`${d(h)} giờ × ${vnd(hourly)} × ${c}%`);
  }
  if (ot) lines.push({ code: "OT_PAY", name: "Làm thêm giờ", kind: "earning", amount: ot, formula: cut(`${otParts.join(" + ")} · ${law.overtimeTaxFree === "full" ? "miễn thuế (trong giới hạn giờ luật lao động)" : "phần trên giờ thường miễn thuế"}`) });
  const gross = lines.reduce((n, l) => n + l.amount, 0);
  /* 4. Luật: BH, đoàn phí, thuế, tạm ứng */
  const type = last.employmentType;
  const probationContract = row.probationContract ?? config.probationContract;
  const casual = type === "contractor" || type === "intern" || (type === "probation" && probationContract === "separate");
  const insuranceSalary = row.insuranceSalary != null && !last.probation ? row.insuranceSalary
    : Math.round(last.lump ? (last.baseSalary! + last.allowance) * last.factor : last.baseSalary! * last.factor + insurableItems);
  /* Luật BHXH: tháng không làm việc và không hưởng lương từ 14 ngày làm việc trở lên thì không đóng BHXH/BHYT/BHTN */
  const unpaid = std - row.credited, insured = unpaid < 14;
  if (!casual && !insured) warnings.push(`Không hưởng lương ${d(unpaid)} ngày (từ 14 ngày làm việc) — tháng này không đóng BH`);
  const lawUsed = config.unionFee.rate === null ? law : { ...law, union: { ...law.union, employee: config.unionFee.rate } };
  const calc = computePay({ date: lawFrom, gross, taxFree, insuranceSalary, region: config.region, dependents: row.dependents, unionMember: row.unionMember && config.unionFee.collect,
    contract: casual ? "casual" : "labor", advance: row.advance, insured, commitment08: row.commitment08, withholdingRequested: row.withholdingRequested }, lawUsed, lawFrom, []);
  const MAP: Record<string, [string, string]> = { si: ["INS_SI", "BHXH"], hi: ["INS_HI", "BHYT"], ui: ["INS_UI", "BHTN"], union: ["UNION_FEE", "Đoàn phí"], pit: ["PIT", "Thuế TNCN"], advance: ["ADVANCE", "Tạm ứng"] };
  for (const l of calc.employee) if (l.amount && MAP[l.key]) lines.push({ code: MAP[l.key]![0], name: MAP[l.key]![1], kind: "deduction", amount: l.amount, formula: cut(l.formula) });
  if (segs.some((g) => g.probation)) warnings.push(`Thử việc: ${pct(rate)} lương cứng${config.probationAllowances ? "" : ", không có dòng phụ cấp"} — mức lương nhập phải là mức chính thức`);
  if (casual) warnings.push(type === "probation" ? "Hợp đồng thử việc riêng: không đóng BH, khấu trừ 10%" : "Hợp đồng không đóng BH: khấu trừ 10%");
  if (row.commitment08 && casual) warnings.push("Có cam kết 08/CK-TNCN: không khấu trừ 10%");
  warnings.push(...calc.unverified, ...row.warnings);
  const deduction = lines.filter((l) => l.kind === "deduction").reduce((n, l) => n + l.amount, 0);
  if (gross - deduction < 0) warnings.push("Thực nhận âm (tạm ứng/khấu trừ lớn hơn thu nhập)");
  return { gross, deduction, net: gross - deduction, lines, warnings, calc };
}
