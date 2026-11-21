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

test("link cài app: không đặt thì null, hợp lệ thì đọc được", () => {
  assert.deepEqual(loadConfig({ NODE_ENV: "development" }).appLinks, { ios: null, android: null });
  const c = loadConfig({ NODE_ENV: "development", MOBILE_IOS_URL: " https://apps.apple.com/app/x ", MOBILE_ANDROID_URL: "" });
  assert.deepEqual(c.appLinks, { ios: "https://apps.apple.com/app/x", android: null });
});

test("link cài app sai URL hoặc http ở production thì báo lỗi", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "development", MOBILE_IOS_URL: "không phải url" }), (e: unknown) => e instanceof ConfigError && e.problems.some((p) => p.includes("MOBILE_IOS_URL")));
  assert.throws(() => loadConfig({ NODE_ENV: "development", MOBILE_IOS_URL: "javascript:alert(1)" }), (e: unknown) => e instanceof ConfigError && e.problems.some((p) => p.includes("http(s)")));
  assert.throws(() => loadConfig({ NODE_ENV: "production", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", API_CORS_ORIGINS: "https://admin.kavor.vn", MOBILE_ANDROID_URL: "http://play.test/x" }),
    (e: unknown) => e instanceof ConfigError && e.problems.some((p) => p.includes("MOBILE_ANDROID_URL") && p.includes("https")));
});

test("Web Push: không đặt khóa VAPID thì tắt; đặt thiếu/sai thì báo lỗi, không in khóa bí mật", () => {
  assert.equal(loadConfig({ NODE_ENV: "development" }).webPush, null);
  const pub = "B".repeat(87), priv = "p".repeat(43);
  assert.deepEqual(loadConfig({ NODE_ENV: "development", API_VAPID_PUBLIC_KEY: pub, API_VAPID_PRIVATE_KEY: priv, API_VAPID_SUBJECT: "mailto:ops@kavor.vn" }).webPush,
    { publicKey: pub, privateKey: priv, subject: "mailto:ops@kavor.vn" });
  assert.throws(() => loadConfig({ NODE_ENV: "development", API_VAPID_PUBLIC_KEY: pub, API_VAPID_PRIVATE_KEY: "bi-mat-sai", API_VAPID_SUBJECT: "ops" }), (e: unknown) => {
    assert.ok(e instanceof ConfigError);
    assert.ok(e.problems.some((p) => p.includes("API_VAPID_PRIVATE_KEY")));
    assert.ok(e.problems.some((p) => p.includes("API_VAPID_SUBJECT")));
    assert.ok(!e.message.includes("bi-mat-sai"));
    return true;
  });
  for (const s of ["mailto:dev@kavor.test", "https://localhost:3000", "mailto:a@b.local"]) {
    assert.throws(() => loadConfig({ NODE_ENV: "development", API_VAPID_PUBLIC_KEY: pub, API_VAPID_PRIVATE_KEY: priv, API_VAPID_SUBJECT: s }),
      (e: unknown) => e instanceof ConfigError && e.problems.some((p) => p.includes("tên miền thật")), s);
  }
  assert.ok(loadConfig({ NODE_ENV: "development", API_VAPID_PUBLIC_KEY: pub, API_VAPID_PRIVATE_KEY: priv, API_VAPID_SUBJECT: "https://kavor-app.vercel.app" }).webPush);
});
