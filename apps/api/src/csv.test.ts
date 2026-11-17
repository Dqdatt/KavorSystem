import assert from "node:assert/strict";
import test from "node:test";
import { csvCell } from "./csv.js";

test("csvCell chặn công thức, giữ số và escape đúng", () => {
  const cases: Array<[unknown, string]> = [
    ["=1+1", "'=1+1"], ["@SUM(A1)", "'@SUM(A1)"], ["+84901234567", "'+84901234567"],
    ["-500000", "-500000"], ["-1.5", "-1.5"], ["-1+1", "'-1+1"],
    ["=a,b", "\"'=a,b\""], ['a"b', '"a""b"'], [null, ""], [0, "0"],
  ];
  for (const [input, want] of cases) assert.equal(csvCell(input), want);
});
