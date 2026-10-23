import assert from "node:assert/strict";
import test from "node:test";
import { brandingVersion, sniffImage } from "./branding.js";

test("nhận dạng ảnh theo byte đầu file, không tin phần mở rộng", () => {
  assert.equal(sniffImage(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")), "image/png");
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "image/webp");
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')), null);
  assert.equal(sniffImage(Buffer.from("GIF89a")), null);
});

test("phiên bản ảnh lấy từ tên file, đổi mỗi lần thay ảnh", () => {
  assert.equal(brandingVersion("10000000-0000-4000-8000-000000000001/logo-ed7cad79-1111-4222-8333-444444444444.png"), "ed7cad79");
  assert.equal(brandingVersion(null), null);
  assert.equal(brandingVersion(undefined), null);
});
