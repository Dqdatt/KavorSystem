/* Kiểm proxy giữ refresh token trong cookie HttpOnly (api/proxy.mjs). Chạy: node --test tools/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { forward, HELD } from "../api/proxy.mjs";

const API = "https://api.test/api/v1";
const ok = (data, status = 200) => new Response(JSON.stringify({ data, meta: { correlationId: "x" }, error: null }), { status, headers: { "content-type": "application/json" } });
const stub = (res) => { const calls = []; return { calls, fetchImpl: async (url, init) => { calls.push({ url, init }); return typeof res === "function" ? res() : res; } }; };
const req = (path, body, headers = {}) => new Request(`https://pwa.test/api/v1/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const session = (rt) => ({ session: { accessToken: "at", refreshToken: rt, expiresAt: 1 }, me: { employeeCode: "NV1" } });

test("đăng nhập: refresh token vào cookie HttpOnly, body chỉ còn chữ giữ chỗ", async () => {
  const s = stub(ok(session("rt-1")));
  const r = await forward(req("auth/login", { identifier: "a", password: "b" }), { api: API, fetchImpl: s.fetchImpl });
  assert.equal(r.status, 200);
  const c = r.headers.get("set-cookie");
  assert.match(c, /^kv_rt=rt-1; Path=\/api\/v1\/auth; HttpOnly; SameSite=Strict; Max-Age=2592000; Secure$/);
  const j = await r.json();
  assert.equal(j.data.session.refreshToken, HELD);
  assert.equal(j.data.session.accessToken, "at");
  assert.equal(s.calls[0].url, `${API}/auth/login`);
});

test("làm mới: lắp refresh token từ cookie, không gửi cookie lên API", async () => {
  const s = stub(ok(session("rt-2")));
  const r = await forward(req("auth/refresh", { refreshToken: HELD }, { cookie: "x=1; kv_rt=rt-1" }), { api: API, fetchImpl: s.fetchImpl });
  assert.equal(JSON.parse(s.calls[0].init.body).refreshToken, "rt-1");
  assert.equal(s.calls[0].init.headers.get("cookie"), null);
  assert.match(r.headers.get("set-cookie"), /^kv_rt=rt-2;/);
});

test("làm mới không có cookie: 401, không gọi API", async () => {
  const s = stub(ok(session("x")));
  const r = await forward(req("auth/refresh", { refreshToken: HELD }), { api: API, fetchImpl: s.fetchImpl });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.code, "AUTH_SESSION_EXPIRED");
  assert.equal(s.calls.length, 0);
});

test("refresh token bị API từ chối hoặc đăng xuất: xóa cookie", async () => {
  const denied = stub(() => new Response(JSON.stringify({ data: null, error: { code: "AUTH_SESSION_EXPIRED", message: "x" } }), { status: 401 }));
  const r1 = await forward(req("auth/refresh", { refreshToken: HELD }, { cookie: "kv_rt=old" }), { api: API, fetchImpl: denied.fetchImpl });
  assert.match(r1.headers.get("set-cookie"), /^kv_rt=; .*Max-Age=0/);
  const out = stub(ok({ ok: true }));
  const r2 = await forward(req("auth/logout", {}, { authorization: "Bearer at" }), { api: API, fetchImpl: out.fetchImpl });
  assert.match(r2.headers.get("set-cookie"), /^kv_rt=; .*Max-Age=0/);
  assert.equal(out.calls[0].init.headers.get("authorization"), "Bearer at");
});

test("API khác: chuyển nguyên, giữ query; đường dẫn ?__p= của Vercel; chặn ..", async () => {
  const s = stub(ok({ month: "2026-11" }));
  const r = await forward(new Request("https://pwa.test/api/proxy?__p=me/timesheet&month=2026-11"), { api: API, fetchImpl: s.fetchImpl });
  assert.equal(s.calls[0].url, `${API}/me/timesheet?month=2026-11`);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.equal((await r.json()).data.month, "2026-11");
  const bad = await forward(new Request("https://pwa.test/api/proxy?__p=../health"), { api: API, fetchImpl: s.fetchImpl });
  assert.equal(bad.status, 404);
});

test("http (localhost) thì cookie không gắn Secure", async () => {
  const s = stub(ok(session("rt-1")));
  const r = await forward(new Request("http://localhost:8090/api/v1/auth/login", { method: "POST", body: "{}" }), { api: API, fetchImpl: s.fetchImpl });
  assert.doesNotMatch(r.headers.get("set-cookie"), /Secure/);
});
