/* Bộ tính lương một người một tháng (thuần, tất định): gross → BH người lao động (có trần) → đoàn phí → thu nhập chịu thuế → giảm trừ →
   thuế TNCN lũy tiến (hoặc khấu trừ 10% với hợp đồng dưới 3 tháng) → tạm ứng → thực nhận; kèm chi phí công ty. Mỗi dòng có công thức để
   phiếu lương giải thích được. Làm tròn từng khoản về đồng. Đoàn phí không trừ khi tính thuế (chưa đưa vào giảm trừ). */
import type { PayCalcInput, PayCalcLine, PayCalcResult, PayrollLawParams } from "@kavor/contracts";

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;
const pct = (r: number) => `${(r * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

export function computePay(input: PayCalcInput, law: PayrollLawParams, lawFrom: string, unverified: string[] = []): PayCalcResult {
  const gross = Math.max(0, Math.round(input.gross));
  const taxFree = Math.min(gross, Math.max(0, Math.round(input.taxFree ?? 0)));
  const advance = Math.max(0, Math.round(input.advance ?? 0));
  const deps = Math.max(0, Math.floor(input.dependents ?? 0));
  const casual = input.contract === "casual";
  const emp: PayCalcLine[] = [], er: PayCalcLine[] = [];
  let insurance = 0, union = 0, employerCost = 0;
  if (!casual && input.insured !== false) {
    const sal = Math.max(0, Math.round(input.insuranceSalary ?? gross));
    const regionMin = law.regionMinWage[String(input.region) as "1"];
    const capSiHi = law.baseSalary * law.capMultiplier.siHi, capUi = regionMin * law.capMultiplier.ui;
    const siHi = Math.min(sal, capSiHi), ui = Math.min(sal, capUi);
    const capNote = (base: number, cap: number, what: string) => (sal > cap ? `${vnd(base)} (trần ${what})` : vnd(base));
    const part = (list: PayCalcLine[], key: string, label: string, base: number, r: number, baseText: string) => {
      const v = Math.round(base * r);
      list.push({ key, label, amount: v, formula: `${baseText} × ${pct(r)}` });
      return v;
    };
    const siText = capNote(siHi, capSiHi, `${law.capMultiplier.siHi} × lương cơ sở ${vnd(law.baseSalary)}`);
    const uiText = capNote(ui, capUi, `${law.capMultiplier.ui} × lương tối thiểu vùng ${input.region} ${vnd(regionMin)}`);
    insurance += part(emp, "si", "BHXH", siHi, law.employee.si, siText);
    insurance += part(emp, "hi", "BHYT", siHi, law.employee.hi, siText);
    insurance += part(emp, "ui", "BHTN", ui, law.employee.ui, uiText);
    employerCost += part(er, "si", "BHXH (công ty)", siHi, law.employer.si, siText);
    employerCost += part(er, "hi", "BHYT (công ty)", siHi, law.employer.hi, siText);
    employerCost += part(er, "ui", "BHTN (công ty)", ui, law.employer.ui, uiText);
    employerCost += part(er, "union", "Kinh phí công đoàn (công ty)", siHi, law.union.employer, siText);
    if (input.unionMember) {
      const cap = Math.round(law.baseSalary * law.union.employeeCapOfBase), raw = Math.round(siHi * law.union.employee);
      union = Math.min(raw, cap);
      emp.push({ key: "union", label: "Đoàn phí", amount: union, formula: raw > cap ? `${pct(law.union.employee)} × ${vnd(siHi)}, tối đa ${pct(law.union.employeeCapOfBase)} lương cơ sở = ${vnd(cap)}` : `${vnd(siHi)} × ${pct(law.union.employee)}` });
    }
    if (sal < regionMin) unverified.push(`Lương đóng BH ${vnd(sal)} thấp hơn lương tối thiểu vùng ${input.region} (${vnd(regionMin)})`);
  }
  const taxable = gross - taxFree;
  let assessable = 0, pit = 0;
  if (casual) {
    /* Không HĐ / HĐ dưới 3 tháng: khấu trừ khi từ ngưỡng, hoặc dưới ngưỡng nếu cá nhân yêu cầu; có cam kết 08/CK-TNCN thì không khấu trừ */
    const withhold = !input.commitment08 && taxable > 0 && (taxable >= law.casual.threshold || !!input.withholdingRequested);
    pit = withhold ? Math.round(taxable * law.casual.rate) : 0;
    emp.push({ key: "pit", label: "Thuế TNCN (khấu trừ)", amount: pit, formula: input.commitment08 ? "Có cam kết 08/CK-TNCN — không khấu trừ"
      : withhold ? `${vnd(taxable)} × ${pct(law.casual.rate)}${taxable < law.casual.threshold ? " (cá nhân yêu cầu khấu trừ)" : ""}` : `Dưới ${vnd(law.casual.threshold)} — không khấu trừ` });
  } else {
    const ded = law.deduction.self + deps * law.deduction.dependent;
    assessable = Math.max(0, taxable - insurance - ded);
    let left = assessable, lower = 0;
    const parts: string[] = [];
    for (const b of law.pit) {
      if (left <= 0) break;
      const width = b.upTo === null ? left : Math.min(left, b.upTo - lower);
      const t = width * b.rate;
      pit += t; parts.push(`${vnd(width)} × ${pct(b.rate)}`);
      left -= width; lower = b.upTo ?? lower;
    }
    pit = Math.round(pit);
    emp.push({ key: "pit", label: "Thuế TNCN", amount: pit,
      formula: `Thu nhập tính thuế ${vnd(assessable)} = ${vnd(taxable)} − BH ${vnd(insurance)} − giảm trừ ${vnd(ded)} (bản thân${deps ? ` + ${deps} người phụ thuộc` : ""})${parts.length ? `; ${parts.join(" + ")}` : ""}` });
  }
  if (advance) emp.push({ key: "advance", label: "Tạm ứng", amount: advance, formula: "Đã ứng trong kỳ" });
  const net = gross - insurance - union - pit - advance;
  return {
    lawFrom, unverified,
    employee: emp, employer: er,
    totals: { gross, insurance, union, taxable, assessable, pit, advance, net, employerCost: employerCost + gross },
  };
}
