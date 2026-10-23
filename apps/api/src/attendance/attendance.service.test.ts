import assert from "node:assert/strict";
import test from "node:test";
import { judgeLocation, localParts } from "./attendance.service.js";

const office = { id: "l1", name: "VP", address: null, latitude: 10.77439, longitude: 106.70394, radiusM: 50, maxAccuracyM: 60 };

test("trong vùng khi khoảng cách ≤ bán kính và GPS đủ chính xác", () => {
  const v = judgeLocation(10.7745, 106.70394, 12, [office]);
  assert.equal(v?.reason, null);
  assert.ok((v?.distance ?? 99) < 50);
});

test("ngoài vùng khi xa hơn bán kính", () => {
  assert.equal(judgeLocation(10.7754, 106.70394, 10, [office])?.reason, "out_of_range");
});

test("GPS kém chính xác bị từ chối kể cả khi tọa độ rơi vào vùng", () => {
  assert.equal(judgeLocation(10.77439, 106.70394, 120, [office])?.reason, "low_accuracy");
});

test("chọn địa điểm gần nhất; không có địa điểm thì null", () => {
  const far = { ...office, id: "l2", latitude: 21.0285, longitude: 105.8542 };
  assert.equal(judgeLocation(21.0286, 105.8542, 10, [office, far])?.location.id, "l2");
  assert.equal(judgeLocation(1, 1, 1, []), null);
});

test("ngày và phút theo múi giờ công ty", () => {
  /* 01:30 UTC = 08:30 giờ Việt Nam */
  assert.deepEqual(localParts("2026-10-16T01:30:00Z", "Asia/Ho_Chi_Minh"), { date: "2026-10-16", minutes: 510 });
  /* 17:30 UTC ngày 15 = 00:30 ngày 16 giờ Việt Nam */
  assert.equal(localParts("2026-10-15T17:30:00Z", "Asia/Ho_Chi_Minh").date, "2026-10-16");
});
