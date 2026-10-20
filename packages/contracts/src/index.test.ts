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
