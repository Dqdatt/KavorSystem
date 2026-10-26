import assert from "node:assert/strict";
import test from "node:test";
import { LINK_TTL_SECONDS, checkLink, signLink, sniffFile } from "./files.js";

test("nhận dạng file đính kèm theo byte đầu, không theo tên", () => {
  assert.equal(sniffFile(Buffer.from("%PDF-1.7\n...")), "application/pdf");
  assert.equal(sniffFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
  assert.equal(sniffFile(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(sniffFile(Buffer.from("PK\x03\x04 docx")), null);
});

test("liên kết tải ký theo bài + nhân viên, hết hạn sau 5 phút", () => {
  const id = "a0000000-0000-4000-8000-000000000001", emp = "60000000-0000-4000-8000-000000000142", now = Date.now();
  const { exp, sig } = signLink(id, emp, now);
  assert.equal(exp, Math.floor(now / 1000) + LINK_TTL_SECONDS);
  assert.ok(checkLink(id, emp, exp, sig, now));
  assert.ok(!checkLink(id, "60000000-0000-4000-8000-000000000143", exp, sig, now), "đổi nhân viên");
  assert.ok(!checkLink("a0000000-0000-4000-8000-000000000002", emp, exp, sig, now), "đổi bài");
  assert.ok(!checkLink(id, emp, exp + 60, sig, now), "kéo dài hạn");
  assert.ok(!checkLink(id, emp, exp, sig, now + (LINK_TTL_SECONDS + 1) * 1000), "quá hạn");
  assert.ok(!checkLink(id, emp, exp, "x", now));
});
