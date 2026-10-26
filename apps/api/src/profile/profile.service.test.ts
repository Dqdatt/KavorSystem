import assert from "node:assert/strict";
import test from "node:test";
import { bankView, parseChange } from "./profile.service.js";

test("đề nghị sửa hồ sơ: chuẩn hóa và kiểm tra đầu vào", () => {
  const { values, reason } = parseChange({ phone: "0911 222.333", personalEmail: "A@B.VN", address: "  Quận 1 ", bank: { bankName: "VCB", accountNo: "1901 2345", holder: "tran thu ha" } });
  assert.deepEqual(values, { phone: "0911222333", personalEmail: "a@b.vn", address: "Quận 1", bank: { bankName: "VCB", accountNo: "19012345", holder: "TRAN THU HA" } });
  assert.equal(reason, null);
  assert.deepEqual(parseChange({ address: "" }).values, { address: null }, "chuỗi rỗng = xóa trường");
  assert.deepEqual(parseChange({}).values, {}, "không gửi trường nào = không đổi");
  assert.throws(() => parseChange({ phone: "12" }), /8–15 chữ số/);
  assert.throws(() => parseChange({ personalEmail: "abc" }), /Email/);
  assert.throws(() => parseChange({ bank: { bankName: "VCB", accountNo: "12ab", holder: "A" } }), /6–20 chữ số/);
  assert.throws(() => parseChange({ emergency: { name: "Bình", phone: "0909123456" } }), /họ tên, điện thoại và quan hệ/);
});

test("tài khoản ngân hàng chỉ lộ số đầy đủ khi được phép", () => {
  const row = { bank_name: "VCB", account_no: "190123456789", holder: "A" };
  assert.deepEqual(bankView(row, false), { bankName: "VCB", holder: "A", last4: "6789" });
  assert.equal(bankView(row, true).accountNo, "190123456789");
});
