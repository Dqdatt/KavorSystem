import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ERRORS } from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import { Mailer, inviteContent } from "./mailer.js";

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

test("thư mời nhân viên chèn link cài app, escape ký tự đặc biệt; không link thì giữ câu cũ", () => {
  const withLinks = inviteContent(mail, { ios: "https://x.test/a?b=1&c=\"2\"", android: null });
  assert.ok(withLinks.text.includes('iPhone https://x.test/a?b=1&c="2"'));
  assert.ok(!withLinks.text.includes("Android"));
  assert.ok(withLinks.html.includes('<a href="https://x.test/a?b=1&amp;c=&quot;2&quot;">'));
  assert.ok(inviteContent(mail).text.includes("1. Cài ứng dụng Kavor trên điện thoại.\n"));
  const both = inviteContent(mail, { ios: "https://a.test", android: "https://b.test" }).text;
  assert.ok(both.includes("điện thoại: iPhone https://a.test · Android https://b.test\n"));
  const same = inviteContent(mail, { ios: "https://app.test", android: "https://app.test" }).text;
  assert.ok(same.includes("1. Cài ứng dụng Kavor trên điện thoại: https://app.test\n"));
});
