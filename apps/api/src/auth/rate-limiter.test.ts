import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, RateLimiter, ilikeExact, limitAuth } from "./auth.service.js";

const fail = () => Promise.reject(new AuthError("AUTH_INVALID_CREDENTIALS", "sai", 401));

test("khóa sau số lần thất bại tối đa, thành công thì xóa bộ đếm", async () => {
  const rl = new RateLimiter(2, 60_000);
  await assert.rejects(rl.guard("k", fail));
  assert.equal(await rl.guard("k", async () => "ok"), "ok");
  await assert.rejects(rl.guard("k", fail));
  await assert.rejects(rl.guard("k", fail));
  await assert.rejects(rl.guard("k", async () => "ok"), (e: unknown) => e instanceof AuthError && e.code === "AUTH_RATE_LIMITED");
  assert.equal(await rl.guard("khac", async () => 1), 1);
});

test("lỗi máy chủ không bị tính là lần thử sai", async () => {
  const rl = new RateLimiter(1, 60_000);
  await assert.rejects(rl.guard("k", () => Promise.reject(new AuthError("X", "x", 502))));
  assert.equal(await rl.guard("k", async () => "ok"), "ok");
});

test("đổi IP liên tục vẫn bị chặn theo tài khoản; tài khoản khác không bị ảnh hưởng", async () => {
  const perIp = new RateLimiter(5, 60_000), account = new RateLimiter(3, 60_000);
  for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) await assert.rejects(limitAuth(perIp, "login", ip, "HD0007", fail, account));
  await assert.rejects(limitAuth(perIp, "login", "4.4.4.4", " hd0007 ", async () => "ok", account),
    (e: unknown) => e instanceof AuthError && e.code === "AUTH_RATE_LIMITED");
  assert.equal(await limitAuth(perIp, "login", "4.4.4.4", "HD0008", async () => "ok", account), "ok");
});

test("ilikeExact thoát ký tự mẫu, từ chối *", () => {
  assert.equal(ilikeExact(" HD0007 "), "HD0007");
  assert.equal(ilikeExact("HD_0%7\\"), "HD\\_0\\%7\\\\");
  assert.equal(ilikeExact("HD*"), null);
});
