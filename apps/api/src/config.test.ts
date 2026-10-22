import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, loadConfig } from "./config.js";

test("development chạy được không cần Supabase", () => {
  const c = loadConfig({ NODE_ENV: "development" });
  assert.equal(c.port, 4000);
  assert.equal(c.supabase, null);
  assert.deepEqual(c.corsOrigins, ["http://localhost:3000", "http://localhost:3001"]);
});

test("giá trị mẫu của service role key không được coi là cấu hình thật", () => {
  const c = loadConfig({ NODE_ENV: "development", SUPABASE_SERVICE_ROLE_KEY: "replace-with-local-service-role-key" });
  assert.equal(c.supabase, null);
});

test("staging bắt buộc Supabase https và không cho origin localhost", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "staging" }), (e: unknown) => {
    assert.ok(e instanceof ConfigError);
    assert.ok(e.problems.some((p) => p.includes("bắt buộc")));
    assert.ok(e.problems.some((p) => p.includes("localhost")));
    return true;
  });
  const ok = loadConfig({ NODE_ENV: "staging", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", API_CORS_ORIGINS: "https://admin.kavor.vn" });
  assert.equal(ok.supabase?.url, "https://x.supabase.co");
});

test("báo lỗi cổng, NODE_ENV và URL sai; không lộ giá trị khóa", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "prod", API_PORT: "99999", SUPABASE_URL: "not a url", SUPABASE_SERVICE_ROLE_KEY: "secret-value" }), (e: unknown) => {
    assert.ok(e instanceof ConfigError);
    assert.equal(e.problems.length, 3);
    assert.ok(!e.message.includes("secret-value"));
    return true;
  });
});
