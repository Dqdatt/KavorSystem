import assert from "node:assert/strict";
import test from "node:test";
import type { PayrollInputRow, PayrollLawParams } from "@kavor/contracts";
import { computeCycleRow, type PayItemMeta } from "./cycle-calc.js";

const LAW: PayrollLawParams = {
  baseSalary: 2_340_000, regionMinWage: { 1: 5_310_000, 2: 4_730_000, 3: 4_140_000, 4: 3_700_000 },
  employee: { si: 0.08, hi: 0.015, ui: 0.01 }, employer: { si: 0.175, hi: 0.03, ui: 0.01 }, capMultiplier: { siHi: 20, ui: 20 },
  deduction: { self: 15_500_000, dependent: 6_200_000 },
  pit: [{ upTo: 10e6, rate: 0.05 }, { upTo: 30e6, rate: 0.1 }, { upTo: 60e6, rate: 0.2 }, { upTo: 100e6, rate: 0.3 }, { upTo: null, rate: 0.35 }],
  casual: { rate: 0.1, threshold: 2_000_000 }, union: { employee: 0.01, employeeCapOfBase: 0.1, employer: 0.02 },
};
const ITEMS = new Map<string, PayItemMeta>([
  ["lunch", { id: "11111111-aaaa", name: "Ăn trưa", payMode: "by_workdays", insurable: false, taxMode: "partial", taxFreeCap: 730_000 }],
  ["cc", { id: "22222222-bbbb", name: "Chuyên cần", payMode: "conditional", insurable: false, taxMode: "taxable", taxFreeCap: null }],
  ["resp", { id: "33333333-cccc", name: "Trách nhiệm", payMode: "fixed", insurable: true, taxMode: "taxable", taxFreeCap: null }],
]);
const row = (o: Partial<PayrollInputRow>): PayrollInputRow => ({
  employee: { id: "e1", code: "NV1", fullName: "A", department: null, position: null, email: null, hireDate: "2025-01-01", terminationDate: null },
  employmentType: "official", baseSalary: 26_000_000, insuranceSalary: null, allowance: 0, segments: [], standard: 26, credited: 26, paidLeaveDays: 0, unpaidLeaveDays: 0,
  holidays: 0, lateMinutes: 0, missingDays: 0, overtime: {}, dependents: 0, taxCode: null, unionMember: false, advance: 0, bank: null, warnings: [], ...o,
} as PayrollInputRow);
const cfg = { region: 1 as const, probation: "withholding" as const };

test("đủ công: lương + khoản theo danh mục (theo công, chuyên cần, cố định có BH) + OT; ăn trưa miễn đến mức; BH tính cả khoản có BH", () => {
  const r = computeCycleRow(row({ items: [{ itemId: "lunch", name: "Ăn trưa", amount: 1_040_000 }, { itemId: "cc", name: "Chuyên cần", amount: 500_000 }, { itemId: "resp", name: "Trách nhiệm", amount: 2_000_000 }],
    overtime: { "150": 120 } }), ITEMS, cfg, LAW, "2026-01-01");
  assert.ok(!("skip" in r));
  if ("skip" in r) return;
  const at = (c: string) => r.lines.find((l) => l.code === c || l.code.startsWith(c));
  assert.equal(at("BASE")!.amount, 26_000_000);
  assert.equal(at("OT_PAY")!.amount, Math.round(2 * (26_000_000 / 26 / 8) * 1.5));
  assert.equal(r.gross, 26_000_000 + 1_040_000 + 500_000 + 2_000_000 + 375_000);
  assert.equal(at("INS_SI")!.amount, Math.round(28_000_000 * 0.08), "lương đóng BH = cơ bản + khoản có BH");
  const ins = Math.round(28e6 * 0.08) + Math.round(28e6 * 0.015) + Math.round(28e6 * 0.01);
  const taxFree = 730_000 + 125_000;
  assert.equal(r.calc.totals.assessable, r.gross - taxFree - ins - 15_500_000);
  assert.equal(r.net, r.gross - r.deduction);
});

test("thiếu công: lương và khoản theo công tỷ lệ; chuyên cần mất kèm lý do; tạm ứng trừ; đổi lương giữa kỳ tính từng đoạn", () => {
  const r = computeCycleRow(row({ credited: 20, lateMinutes: 15, advance: 3_000_000, items: [{ itemId: "cc", name: "Chuyên cần", amount: 500_000 }],
    segments: [{ from: "a", to: "b", baseSalary: 20_000_000, insuranceSalary: null, allowance: 0, employmentType: "official", credited: 10 }, { from: "c", to: "d", baseSalary: 26_000_000, insuranceSalary: null, allowance: 0, employmentType: "official", credited: 10 }] }),
    ITEMS, cfg, LAW, "2026-01-01");
  if ("skip" in r) return assert.fail(r.skip);
  assert.equal(r.lines.find((l) => l.code === "BASE")!.amount, Math.round(20e6 * 10 / 26 + 26e6 * 10 / 26));
  const cc = r.lines.find((l) => l.name === "Chuyên cần")!;
  assert.deepEqual([cc.amount, /trễ 15 phút/.test(cc.formula)], [0, true]);
  assert.equal(r.lines.find((l) => l.code === "ADVANCE")!.amount, 3_000_000);
});

test("thử việc theo cài đặt công ty: khấu trừ 10% không BH, hoặc đóng BH như chính thức; thiếu lương thì bỏ qua", () => {
  const p = row({ employmentType: "probation", baseSalary: 8_000_000 });
  const w = computeCycleRow(p, ITEMS, cfg, LAW, "x"), i = computeCycleRow(p, ITEMS, { ...cfg, probation: "insured" }, LAW, "x");
  if ("skip" in w || "skip" in i) return assert.fail();
  assert.deepEqual([w.lines.filter((l) => l.code.startsWith("INS")).length, w.lines.find((l) => l.code === "PIT")!.amount], [0, 800_000]);
  assert.deepEqual([i.lines.filter((l) => l.code.startsWith("INS")).length, i.lines.find((l) => l.code === "PIT")], [3, undefined]);
  assert.deepEqual(computeCycleRow(row({ baseSalary: null }), ITEMS, cfg, LAW, "x"), { skip: "Chưa có mức lương" });
});

test("không hưởng lương từ 14 ngày làm việc: không đóng BH, không ra thực nhận âm vì BH", () => {
  const r = computeCycleRow(row({ credited: 0 }), ITEMS, cfg, LAW, "x"), r2 = computeCycleRow(row({ credited: 13 }), ITEMS, cfg, LAW, "x");
  if ("skip" in r || "skip" in r2) return assert.fail();
  assert.deepEqual([r.gross, r.deduction, r.net, r.lines.some((l) => l.code.startsWith("INS")), r.warnings.some((w) => /không đóng BH/.test(w))], [0, 0, 0, false, true]);
  assert.equal(r2.lines.some((l) => l.code.startsWith("INS")), true, "thiếu 13 ngày (< 14) vẫn đóng BH");
});
