import assert from "node:assert/strict";
import test from "node:test";
import { refreshFailure } from "./auth.service.js";

test("làm mới phiên: 4xx của Supabase = hết hạn thật (401, client đăng xuất)", () => {
  for (const status of [400, 401, 403, 404]) {
    const e = refreshFailure({ status });
    assert.deepEqual([e.status, e.code, e.retryable], [401, "AUTH_SESSION_EXPIRED", false], `status ${status}`);
  }
  /* Không có lỗi nhưng thiếu phiên/người dùng: coi như hết hạn */
  assert.equal(refreshFailure(null).status, 401);
});

test("làm mới phiên: lỗi mạng hoặc 5xx = lỗi tạm thời (503 thử lại, client giữ phiên)", () => {
  for (const status of [0, undefined, 500, 502, 503, 504]) {
    const e = refreshFailure({ status });
    assert.deepEqual([e.status, e.code, e.retryable], [503, "AUTH_UNAVAILABLE", true], `status ${status}`);
  }
});
