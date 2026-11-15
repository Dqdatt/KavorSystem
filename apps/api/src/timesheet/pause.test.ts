import assert from "node:assert/strict";
import test from "node:test";
import { pauseExcludedMonths } from "./pause.js";

test("tháng không tính phép năm theo lý do tạm nghỉ (NĐ 145/2020 Điều 65–66)", () => {
  const today = "2026-12-15";
  /* Thai sản cả năm: vẫn tính đủ */
  assert.deepEqual(pauseExcludedMonths([{ start_date: "2026-01-01", end_date: null, reason: "maternity" }], 2026, today), []);
  /* Không lương 01/03–31/05: 30 ngày đầu được tính (hết 30/03) → tháng 4, 5 không tính; tháng 3 chỉ 1 ngày không tính */
  assert.deepEqual(pauseExcludedMonths([{ start_date: "2026-03-01", end_date: "2026-05-31", reason: "unpaid" }], 2026, today), [4, 5]);
  /* Ốm: 60 ngày đầu tính (01/02–01/04), phần còn lại tháng 4 = 29 ngày > nửa tháng */
  assert.deepEqual(pauseExcludedMonths([{ start_date: "2026-02-01", end_date: "2026-04-30", reason: "sick_long" }], 2026, today), [4]);
  /* Khác: 16/31 ngày tháng 7 → không tính; 15/31 ngày tháng 8 → vẫn tính */
  assert.deepEqual(pauseExcludedMonths([{ start_date: "2026-07-16", end_date: "2026-07-31", reason: "other" }, { start_date: "2026-08-17", end_date: "2026-08-31", reason: "other" }], 2026, today), [7]);
  /* Tháng chưa qua hết (12) chưa xét; khoảng bắt đầu năm trước tính từ 01/01 */
  assert.deepEqual(pauseExcludedMonths([{ start_date: "2025-10-01", end_date: null, reason: "other" }], 2026, today), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  /* Hạn cộng dồn tính riêng cho từng năm */
  assert.deepEqual(pauseExcludedMonths([{ start_date: "2025-12-01", end_date: "2026-01-31", reason: "unpaid" }], 2026, today), []);
});
