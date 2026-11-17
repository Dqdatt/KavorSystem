import assert from "node:assert/strict";
import test from "node:test";
import { all, allIn } from "./rows.js";

/* Bảng giả: PostgREST trả tối đa 1.000 dòng mỗi lần dù range rộng hơn */
const table = Array.from({ length: 2500 }, (_, i) => ({ id: i, emp: `e${i % 250}` }));
const page = (rows: typeof table, from: number, to: number) => Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });

test("all đọc hết qua nhiều trang, kể cả số dòng chia hết cho 1.000", async () => {
  assert.equal((await all((a, b) => page(table, a, b))).length, 2500);
  assert.equal((await all((a, b) => page(table.slice(0, 2000), a, b))).length, 2000);
  assert.deepEqual(await all((a, b) => page([], a, b)), []);
});

test("all ném lỗi của PostgREST, không trả thiếu", async () => {
  const err = { message: "boom" };
  await assert.rejects(all(() => Promise.resolve({ data: null, error: err })), (e) => e === err);
});

test("allIn chia lô ≤ 100 id (bỏ trùng), mỗi lô đọc theo trang", async () => {
  const lots: number[] = [];
  const ids = [...Array.from({ length: 250 }, (_, i) => `e${i}`), "e0"];
  const rows = await allIn<{ id: number }>(ids, (lot, a, b) => {
    if (a === 0) lots.push(lot.length);
    return page(table.filter((r) => lot.includes(r.emp)), a, b);
  });
  assert.deepEqual(lots, [100, 100, 50]);
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2500);
  assert.deepEqual(await allIn([], () => { throw new Error("không được gọi"); }), []);
});
