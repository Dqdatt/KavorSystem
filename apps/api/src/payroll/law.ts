/* Tham số luật tính lương: kiểm cấu trúc (Console ghi) + tra phiên bản theo ngày. Bộ tính ở calc.ts. */
import type { PayrollLawParams, PayrollLawVersion } from "@kavor/contracts";

const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const rate = (v: unknown) => num(v, 0, 1);
/* Trả lỗi đầu tiên (chuỗi tiếng Việt) hoặc null nếu hợp lệ */
export function checkLawParams(p: unknown): string | null {
  const x = p as PayrollLawParams;
  if (!x || typeof x !== "object") return "Tham số phải là đối tượng JSON.";
  if (!num(x.baseSalary, 100_000, 100_000_000)) return "Lương cơ sở không hợp lệ.";
  for (const r of ["1", "2", "3", "4"] as const) if (!num(x.regionMinWage?.[r], 100_000, 100_000_000)) return `Lương tối thiểu vùng ${r} không hợp lệ.`;
  for (const k of ["si", "hi", "ui"] as const) if (!rate(x.employee?.[k]) || !rate(x.employer?.[k])) return "Tỷ lệ bảo hiểm phải từ 0 đến 1 (vd. 0.08).";
  if (!num(x.capMultiplier?.siHi, 1, 100) || !num(x.capMultiplier?.ui, 1, 100)) return "Hệ số trần đóng không hợp lệ.";
  if (!num(x.deduction?.self, 0, 1e9) || !num(x.deduction?.dependent, 0, 1e9)) return "Giảm trừ gia cảnh không hợp lệ.";
  if (!Array.isArray(x.pit) || x.pit.length < 1 || x.pit.length > 10) return "Biểu thuế cần 1–10 bậc.";
  let prev = 0;
  for (const [i, b] of x.pit.entries()) {
    if (!rate(b?.rate)) return `Bậc thuế ${i + 1}: thuế suất 0–1.`;
    const last = i === x.pit.length - 1;
    if (last ? b.upTo !== null : !num(b.upTo, prev + 1, 1e12)) return last ? "Bậc thuế cuối phải không có mức trên (upTo: null)." : `Bậc thuế ${i + 1}: mức trên phải tăng dần.`;
    prev = b.upTo ?? prev;
  }
  if (!rate(x.casual?.rate) || !num(x.casual?.threshold, 0, 1e9)) return "Khấu trừ thuế thời vụ không hợp lệ.";
  if (!rate(x.union?.employee) || !rate(x.union?.employeeCapOfBase) || !rate(x.union?.employer)) return "Tỷ lệ đoàn phí không hợp lệ.";
  if (!num(x.taxFree?.meal, 0, 1e9)) return "Mức miễn thuế tiền ăn trưa, ăn ca không hợp lệ (taxFree.meal).";
  if (x.overtimeTaxFree !== "full" && x.overtimeTaxFree !== "premium") return "overtimeTaxFree phải là \"full\" hoặc \"premium\".";
  return null;
}

type Row = { id: string; effective_from: string; params: PayrollLawParams; sources: PayrollLawVersion["sources"]; note: string | null };
export const lawView = (r: Row, today: string, all: Row[]): PayrollLawVersion => {
  const active = all.filter((x) => x.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  const state = r.effective_from > today ? "future" : active?.id === r.id ? "active" : "past";
  return { id: r.id, effectiveFrom: r.effective_from, params: r.params, sources: r.sources ?? [], note: r.note, state, editable: state === "future" };
};
/* Phiên bản hiệu lực vào ngày `date` */
export const lawAt = <T extends { effective_from: string }>(rows: T[], date: string): T | null =>
  rows.filter((r) => r.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
