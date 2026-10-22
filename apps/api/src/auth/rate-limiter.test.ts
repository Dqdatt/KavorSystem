import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, RateLimiter } from "./auth.service.js";

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
