import assert from "node:assert/strict";
import test from "node:test";
import type { PayrollLawParams } from "@kavor/contracts";
import { computePay } from "./calc.js";
import { checkLawParams, lawAt } from "./law.js";

const LAW: PayrollLawParams = {
  baseSalary: 2_340_000, regionMinWage: { 1: 5_310_000, 2: 4_730_000, 3: 4_140_000, 4: 3_700_000 },
  employee: { si: 0.08, hi: 0.015, ui: 0.01 }, employer: { si: 0.175, hi: 0.03, ui: 0.01 }, capMultiplier: { siHi: 20, ui: 20 },
  deduction: { self: 15_500_000, dependent: 6_200_000 },
  pit: [{ upTo: 10e6, rate: 0.05 }, { upTo: 30e6, rate: 0.1 }, { upTo: 60e6, rate: 0.2 }, { upTo: 100e6, rate: 0.3 }, { upTo: null, rate: 0.35 }],
  casual: { rate: 0.1, threshold: 2_000_000 }, union: { employee: 0.01, employeeCapOfBase: 0.1, employer: 0.02 },
};
const base = { date: "2026-03-31", region: 1 as const };

test("lương 20 triệu, không người phụ thuộc: BH 10,5%, thuế 5% phần trên giảm trừ", () => {
  const r = computePay({ ...base, gross: 20_000_000 }, LAW, "2026-01-01");
  assert.deepEqual(r.employee.map((l) => [l.key, l.amount]), [["si", 1_600_000], ["hi", 300_000], ["ui", 200_000], ["pit", 120_000]]);
  assert.deepEqual([r.totals.assessable, r.totals.net], [2_400_000, 17_780_000]);
  assert.equal(r.totals.employerCost, 20_000_000 + 3_500_000 + 600_000 + 200_000 + 400_000);
});

test("lương 50 triệu, 2 người phụ thuộc: BHXH/BHYT chạm trần 20 × lương cơ sở, BHTN theo vùng; thuế 2 bậc; đoàn phí có trần", () => {
  const r = computePay({ ...base, gross: 50_000_000, dependents: 2, unionMember: true }, LAW, "2026-01-01");
  const at = (k: string) => r.employee.find((l) => l.key === k)!;
  assert.deepEqual([at("si").amount, at("hi").amount, at("ui").amount], [3_744_000, 702_000, 500_000]);
  assert.match(at("si").formula, /trần 20 × lương cơ sở/);
  assert.equal(at("union").amount, 234_000, "1% × 46,8 tr = 468.000 > trần 10% × 2,34 tr");
  assert.equal(r.totals.assessable, 50_000_000 - 4_946_000 - 15_500_000 - 12_400_000);
  assert.equal(at("pit").amount, 500_000 + Math.round((17_154_000 - 10_000_000) * 0.1));
  assert.equal(r.totals.net, 50_000_000 - 4_946_000 - 234_000 - 1_215_400);
});

test("thu nhập miễn thuế, tạm ứng, dưới mức giảm trừ: không thuế; lương đóng BH riêng", () => {
  const r = computePay({ ...base, gross: 15_000_000, taxFree: 1_000_000, insuranceSalary: 8_000_000, advance: 3_000_000 }, LAW, "2026-01-01");
  assert.deepEqual([r.totals.insurance, r.totals.pit, r.totals.taxable, r.totals.net], [840_000, 0, 14_000_000, 15_000_000 - 840_000 - 3_000_000]);
});

test("hợp đồng dưới 3 tháng: không BH, khấu trừ 10% từ 2 triệu; thu nhập rất cao chạm bậc 35%", () => {
  assert.deepEqual([computePay({ ...base, gross: 5_000_000, contract: "casual" }, LAW, "x").totals.pit, computePay({ ...base, gross: 1_500_000, contract: "casual" }, LAW, "x").totals.pit], [500_000, 0]);
  const hi = computePay({ ...base, gross: 200_000_000, insuranceSalary: 50_000_000 }, LAW, "x");
  const a = hi.totals.assessable;
  assert.equal(hi.totals.pit, Math.round(10e6 * 0.05 + 20e6 * 0.1 + 30e6 * 0.2 + 40e6 * 0.3 + (a - 100e6) * 0.35));
});

test("kiểm tham số luật + tra phiên bản theo ngày", () => {
  assert.equal(checkLawParams(LAW), null);
  assert.match(checkLawParams({ ...LAW, pit: [{ upTo: 10, rate: 0.05 }] }) ?? "", /bậc thuế cuối/i);
  assert.match(checkLawParams({ ...LAW, employee: { ...LAW.employee, si: 8 } }) ?? "", /Tỷ lệ bảo hiểm/);
  const rows = [{ effective_from: "2026-01-01", v: 1 }, { effective_from: "2026-07-01", v: 2 }];
  assert.deepEqual([lawAt(rows, "2026-06-30")?.v, lawAt(rows, "2026-07-01")?.v, lawAt(rows, "2025-12-31")], [1, 2, null]);
});
