/* Kiểm hàm tính điểm khớp cuộn (shims/scroll-snap.ts). Chạy: node --test tools/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapTarget } from "../shims/scroll-snap.ts";

test("snapTarget với interval 34", () => {
  assert.equal(snapTarget(50, 34), 34);
  assert.equal(snapTarget(52, 34), 68);
  assert.equal(snapTarget(0, 34), 0);
  assert.equal(snapTarget(-10, 34), 0);
});

test("snapTarget với offsets [0, 120, 240]", () => {
  assert.equal(snapTarget(170, undefined, [0, 120, 240]), 120);
  assert.equal(snapTarget(190, undefined, [0, 120, 240]), 240);
  assert.equal(snapTarget(-20, undefined, [0, 120, 240]), 0);
});

test("snapTarget không có interval hoặc offsets -> null", () => {
  assert.equal(snapTarget(50), null);
  assert.equal(snapTarget(50, 0), null);
  assert.equal(snapTarget(50, undefined, []), null);
});
