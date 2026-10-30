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

test("gửi thư: trạm HTTPS được ưu tiên hơn SMTP; khóa trạm ngắn hoặc http ở staging bị chặn, không lộ khóa", () => {
  const base = { NODE_ENV: "staging", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", API_CORS_ORIGINS: "https://admin.kavor.vn" };
  const secret = "s".repeat(40);
  const c = loadConfig({ ...base, SMTP_URL: "smtp://u:p@smtp.gmail.com:587", MAIL_RELAY_URL: "https://hr.example.app/api/internal/mail", MAIL_RELAY_SECRET: secret });
  assert.deepEqual(c.mail, { kind: "relay", url: "https://hr.example.app/api/internal/mail", secret });
  assert.equal(loadConfig({ NODE_ENV: "development", SMTP_URL: "smtp://127.0.0.1:55325" }).mail?.kind, "smtp");
  assert.throws(() => loadConfig({ ...base, MAIL_RELAY_URL: "http://hr.example.app/api/internal/mail", MAIL_RELAY_SECRET: "ngan-qua" }), (e: unknown) => {
    assert.ok(e instanceof ConfigError);
    assert.ok(e.problems.some((p) => p.includes("https")));
    assert.ok(e.problems.some((p) => p.includes("32 ký tự")));
    assert.ok(!e.message.includes("ngan-qua"));
    return true;
  });
});
