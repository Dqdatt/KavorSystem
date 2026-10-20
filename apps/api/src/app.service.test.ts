import assert from "node:assert/strict";
import test from "node:test";
import { AppService } from "./app.service.js";

test("sample tenant is explicitly not a business registration service", () => {
  const tenant = new AppService().sampleTenant();
  assert.equal(tenant.isBusinessRegistrationService, false);
});

test("API advertises both iOS and Android", () => {
  const surfaces = new AppService().productMeta().surfaces;
  assert.ok(surfaces.includes("mobile-ios"));
  assert.ok(surfaces.includes("mobile-android"));
});
