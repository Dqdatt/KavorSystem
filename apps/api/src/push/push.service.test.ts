import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import type { SupabaseGateway } from "../auth/supabase.js";
import type { EmployeeRow } from "../auth/auth.service.js";
import { parseSubscription, PushService } from "./push.service.js";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const keys = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
const emp = { id: "e1", tenant_id: "t1" } as EmployeeRow;

test("chỉ nhận endpoint https của máy chủ push thật (chặn SSRF)", () => {
  for (const endpoint of ["https://web.push.apple.com/QAbc", "https://fcm.googleapis.com/fcm/send/x:y", "https://updates.push.services.mozilla.com/wpush/v2/z", "https://wns2-par02p.notify.windows.com/w/?token=1"]) {
    assert.equal(parseSubscription({ endpoint, keys }).endpoint, endpoint);
  }
  for (const endpoint of ["http://web.push.apple.com/x", "https://127.0.0.1/x", "https://metadata.google.internal/x", "https://evil.com/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.com/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "javascript:alert(1)", ""]) {
    assert.throws(() => parseSubscription({ endpoint, keys }), /không/, endpoint);
  }
});

test("khóa trình duyệt phải đúng độ dài P-256/auth; bỏ dấu = ở cuối", () => {
  const ok = parseSubscription({ endpoint: "https://web.push.apple.com/x", keys: { p256dh: keys.p256dh + "=", auth: keys.auth + "==" } });
  assert.deepEqual(ok.keys, keys);
  assert.throws(() => parseSubscription({ endpoint: "https://web.push.apple.com/x", keys: { ...keys, p256dh: keys.p256dh.slice(4) } }), /Khóa/);
  assert.throws(() => parseSubscription({ endpoint: "https://web.push.apple.com/x", keys: { ...keys, auth: "abc" } }), /Khóa/);
  assert.throws(() => parseSubscription({ endpoint: "https://web.push.apple.com/x", keys: { ...keys, p256dh: Buffer.alloc(65, 1).toString("base64url") } }), /Khóa/);
  assert.throws(() => parseSubscription({ endpoint: "https://web.push.apple.com/x" }), /Khóa/);
});

/* Supabase giả: ghi lại rpc và các lệnh xóa */
function fakeSb(claim: unknown[]) {
  const calls: string[] = [];
  const sb = {
    admin: {
      rpc: async (fn: string, args: Record<string, unknown>) => { calls.push(`rpc ${fn} ${JSON.stringify(args)}`); return { data: fn === "push_claim" ? claim : null, error: null }; },
      from: (t: string) => ({ delete: () => { const q = { eq: (c: string, v: string) => { calls.push(`delete ${t} ${c}=${v}`); return q; }, then: (r: (x: unknown) => void) => r({ error: null }) }; return q; } }),
    },
  } as unknown as SupabaseGateway;
  return { sb, calls };
}
const row = (n: number) => ({ notification_id: `n${n}`, endpoint: `https://web.push.apple.com/e${n}`, p256dh: keys.p256dh, auth: keys.auth, kind: "announcement.published",
  title: `Bản tin ${n}`, body: "Mở để xem", link_type: "announcement", link_id: `a${n}`, link_no: null });

test("gửi từng thông báo; 410/404 thì xóa đăng ký, lỗi khác giữ lại", async () => {
  const { sb, calls } = fakeSb([row(1), row(2), row(3)]);
  const sent: Array<{ endpoint: string; payload: unknown }> = [];
  const svc = new PushService(sb, null, async (s, p) => {
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(p) });
    if (s.endpoint.endsWith("e2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    if (s.endpoint.endsWith("e3")) throw Object.assign(new Error("server"), { statusCode: 500 });
  });
  const err = console.error;
  console.error = () => {};
  try { assert.equal(await svc.drain(), 1); } finally { console.error = err; }
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[0]!.payload, { title: "📢 Bản tin 1", body: "Mở để xem", tag: "n1", data: { id: "n1", kind: "announcement.published", link: { type: "announcement", id: "a1", no: null } } });
  assert.deepEqual(calls.filter((c) => c.startsWith("delete")), ["delete push_subscriptions endpoint=https://web.push.apple.com/e2"]);
});

test("chưa cấu hình VAPID: không gửi, không lưu đăng ký", async () => {
  const { sb, calls } = fakeSb([row(1)]);
  const svc = new PushService(sb, null);
  assert.equal(svc.enabled, false);
  assert.equal(await svc.drain(), 0);
  assert.deepEqual(await svc.subscribe(emp, { endpoint: "https://web.push.apple.com/x", keys }), { enabled: false });
  assert.deepEqual(calls, []);
});

test("đăng ký lưu cho đúng nhân viên; hủy chỉ xóa endpoint của chính người đó", async () => {
  const { sb, calls } = fakeSb([]);
  const svc = new PushService(sb, null, async () => {});
  await svc.subscribe(emp, { endpoint: "https://web.push.apple.com/x", keys });
  await svc.unsubscribe(emp, { endpoint: "https://web.push.apple.com/x" });
  assert.deepEqual(calls, [
    `rpc push_subscribe ${JSON.stringify({ p_tenant: "t1", p_employee: "e1", p_endpoint: "https://web.push.apple.com/x", p_p256dh: keys.p256dh, p_auth: keys.auth })}`,
    "delete push_subscriptions endpoint=https://web.push.apple.com/x",
    "delete push_subscriptions employee_id=e1",
  ]);
});

test("thêm icon đầu tiêu đề push theo loại thông báo", async () => {
  const r1 = { ...row(1), kind: "request.approved", title: "Đơn đã duyệt" };
  const r2 = { ...row(2), kind: "announcement.published", title: "❗ Nghỉ lễ" };
  const r3 = { ...row(3), kind: "x.y", title: "Tiêu đề lạ" };
  const r4 = { ...row(4), kind: "constructor", title: "Tiêu đề kế thừa" };
  const { sb } = fakeSb([r1, r2, r3, r4]);
  const sent: Array<{ payload: { title: string } }> = [];
  const svc = new PushService(sb, null, async (_s, p) => { sent.push({ payload: JSON.parse(p) }); });
  await svc.drain();
  assert.equal(sent[0]?.payload.title, "✅ Đơn đã duyệt");
  assert.equal(sent[1]?.payload.title, "❗ Nghỉ lễ");
  assert.equal(sent[2]?.payload.title, "Tiêu đề lạ");
  assert.equal(sent[3]?.payload.title, "Tiêu đề kế thừa");
});

