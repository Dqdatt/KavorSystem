import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SURFACES, SAMPLE_TENANT } from "./index.js";

test("Kavor exposes both mobile platforms", () => {
  assert.ok(PRODUCT_SURFACES.includes("mobile-ios"));
  assert.ok(PRODUCT_SURFACES.includes("mobile-android"));
});

test("sample tenant stays inside its seat limit", () => {
  assert.ok(SAMPLE_TENANT.activeEmployees <= SAMPLE_TENANT.employeeLimit);
});

import { maskEmail, passwordProblems } from "./index.js";

test("chính sách mật khẩu", () => {
  assert.deepEqual(passwordProblems("Kavor2026A", "HD0142"), []);
  assert.equal(passwordProblems("abc").length, 3);
  assert.ok(passwordProblems("Hd0142abcX", "HD0142").some((p) => p.includes("mã nhân viên")));
});

test("che email", () => {
  assert.equal(maskEmail("thao.ha@haidang.vn"), "th*****@haidang.vn");
  assert.equal(maskEmail("a@x.vn"), "a***@x.vn");
});

import { distanceMeters } from "./index.js";

test("khoảng cách haversine", () => {
  assert.equal(Math.round(distanceMeters(10.77439, 106.70394, 10.77439, 106.70394)), 0);
  /* 0,001 độ vĩ ≈ 111 m */
  assert.ok(Math.abs(distanceMeters(10.77439, 106.70394, 10.77539, 106.70394) - 111) < 1);
});

import { checkRuleConfig } from "./index.js";

test("rule config keeps declared fields and rejects bad values", () => {
  const ok = checkRuleConfig("explanation", { monthlyLimit: 3, deadlineDays: 3, extra: "x" });
  assert.deepEqual(ok, { config: { monthlyLimit: 3, deadlineDays: 3 }, problems: [] });
  const bad = checkRuleConfig("salary_advance", { enabled: "yes", maxPercent: 120, excludeProbation: true, excludeNoticePeriod: false, deadlineDay: 20, minAmount: 500000 });
  assert.equal(bad.problems.length, 2);
  assert.equal(checkRuleConfig("reminder", null).problems.length, 3);
  assert.equal(checkRuleConfig("explanation", { monthlyLimit: 2.5, deadlineDays: 3 }).problems.length, 1);
});

import { announcementBlocks, announcementReadMinutes } from "./index.js";

test("tách nội dung bản tin thành đoạn và danh sách", () => {
  assert.deepEqual(announcementBlocks("Đoạn 1\r\n\r\n- Ý a\n- Ý b\n\n  \nĐoạn 2\ndòng 2"), ["Đoạn 1", ["Ý a", "Ý b"], "Đoạn 2\ndòng 2"]);
  assert.deepEqual(announcementBlocks("- chỉ một dòng gạch\nkhông gạch"), ["- chỉ một dòng gạch\nkhông gạch"]);
  assert.deepEqual(announcementBlocks("   "), []);
  assert.equal(announcementReadMinutes("ngắn"), 1);
  assert.equal(announcementReadMinutes(Array(600).fill("từ").join(" ")), 3);
});
