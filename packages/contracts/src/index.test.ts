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
