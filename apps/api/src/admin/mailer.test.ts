import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ERRORS } from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import { Mailer } from "./mailer.js";

const mail = { to: "nv@cty.vn", fullName: "Nguyễn A", employeeCode: "NV01", companyName: "Cty", invitedBy: "HR" };
const relay = new Mailer({ kind: "relay", url: "http://relay.test/api/internal/mail", secret: "s".repeat(32) });

async function withFetch(res: () => Promise<Response>, fn: () => Promise<void>) {
  const orig = globalThis.fetch, origErr = console.error;
  globalThis.fetch = res as typeof fetch;
  console.error = () => {};
  try { await fn(); } finally { globalThis.fetch = orig; console.error = origErr; }
}
const fails = (code: string, retryable: boolean) => (e: unknown) => e instanceof AuthError && e.code === code && e.retryable === retryable;

test("trạm gửi thư sai khóa/thiếu cấu hình (401, 404): báo chưa cấu hình, không bảo thử lại", async () => {
  for (const status of [401, 404]) {
    await withFetch(async () => new Response("{}", { status }), () => assert.rejects(relay.sendInvite(mail), fails(ADMIN_ERRORS.emailNotConfigured, false)));
  }
});

test("trạm gửi thư lỗi tạm (502) hoặc mất kết nối: báo chưa gửi được, cho thử lại", async () => {
  await withFetch(async () => new Response("{}", { status: 502 }), () => assert.rejects(relay.sendInvite(mail), fails("EMAIL_SEND_FAILED", true)));
  await withFetch(async () => { throw new TypeError("fetch failed"); }, () => assert.rejects(relay.sendInvite(mail), fails("EMAIL_SEND_FAILED", true)));
});

test("trạm gửi thư nhận (200): không lỗi", async () => {
  await withFetch(async () => new Response("{}", { status: 200 }), () => relay.sendInvite(mail));
});

test("chưa cấu hình gửi thư: báo rõ, không giả vờ đã gửi", async () => {
  await assert.rejects(new Mailer(null).sendInvite(mail), fails(ADMIN_ERRORS.emailNotConfigured, true));
});
