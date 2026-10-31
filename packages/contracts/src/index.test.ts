import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SURFACES, SAMPLE_TENANT } from "./index.js";

test("Kavor exposes both mobile platforms", () => {
  assert.ok(PRODUCT_SURFACES.includes("mobile-ios"));
  assert.ok(PRODUCT_SURFACES.includes("mobile-android"));
});

test("sample tenant stays inside its seat limit", () => {
  assert.ok(SAMPLE_TENANT.activeEmployees <= SAMPLE_TENANT.employeeLimit);
});

import { maskEmail, passwordProblems } from "./index.js";

test("chính sách mật khẩu", () => {
  assert.deepEqual(passwordProblems("Kavor2026A", "HD0142"), []);
  assert.equal(passwordProblems("abc").length, 3);
  assert.ok(passwordProblems("Hd0142abcX", "HD0142").some((p) => p.includes("mã nhân viên")));
});

test("che email", () => {
  assert.equal(maskEmail("thao.ha@haidang.vn"), "th*****@haidang.vn");
  assert.equal(maskEmail("a@x.vn"), "a***@x.vn");
});

import { distanceMeters } from "./index.js";

test("khoảng cách haversine", () => {
  assert.equal(Math.round(distanceMeters(10.77439, 106.70394, 10.77439, 106.70394)), 0);
  /* 0,001 độ vĩ ≈ 111 m */
  assert.ok(Math.abs(distanceMeters(10.77439, 106.70394, 10.77539, 106.70394) - 111) < 1);
});

import { checkRuleConfig } from "./index.js";

test("rule config keeps declared fields and rejects bad values", () => {
  const ok = checkRuleConfig("explanation", { monthlyLimit: 3, deadlineDays: 3, extra: "x" });
  assert.deepEqual(ok, { config: { monthlyLimit: 3, deadlineDays: 3 }, problems: [] });
  const bad = checkRuleConfig("salary_advance", { enabled: "yes", maxPercent: 120, excludeProbation: true, excludeNoticePeriod: false, deadlineDay: 20, minAmount: 500000 });
  assert.equal(bad.problems.length, 2);
  assert.equal(checkRuleConfig("reminder", null).problems.length, 3);
  assert.equal(checkRuleConfig("explanation", { monthlyLimit: 2.5, deadlineDays: 3 }).problems.length, 1);
});

import { announcementExcerpt, announcementListMarkers, announcementPlainText, announcementReadMinutes, parseAnnouncement, parseAnnouncementInline } from "./index.js";

test("bản tin: bài chữ thuần cũ vẫn tách đúng đoạn, xuống dòng và gạch đầu dòng", () => {
  assert.deepEqual(parseAnnouncement("Đoạn 1\r\n\r\n- Ý a\n- Ý b\n\n  \nĐoạn 2\ndòng 2"), [
    { kind: "p", indent: 0, lines: [[{ text: "Đoạn 1" }]] },
    { kind: "list", items: [{ ordered: false, level: 0, content: [{ text: "Ý a" }] }, { ordered: false, level: 0, content: [{ text: "Ý b" }] }] },
    { kind: "p", indent: 0, lines: [[{ text: "Đoạn 2" }], [{ text: "dòng 2" }]] },
  ]);
  /* Dòng "- " xen giữa đoạn (như bài HR gõ tay) thành mục danh sách */
  assert.deepEqual(parseAnnouncement("Vì vậy:\n- Ý 1\nCảm ơn").map((b) => b.kind), ["p", "list", "p"]);
  assert.deepEqual(parseAnnouncement("   "), []);
});

test("bản tin: tiêu đề, danh sách số nhiều cấp, thụt lề, đường kẻ", () => {
  const b = parseAnnouncement("## Mục 1\n1. Một\n  - con\n2. Hai\n\n> thụt 1\n>> thụt 2\n---");
  assert.deepEqual(b.map((x) => x.kind), ["h", "list", "p", "p", "hr"]);
  assert.deepEqual(b[1], { kind: "list", items: [
    { ordered: true, level: 0, content: [{ text: "Một" }] }, { ordered: false, level: 1, content: [{ text: "con" }] }, { ordered: true, level: 0, content: [{ text: "Hai" }] },
  ] });
  assert.deepEqual([b[2], b[3]].map((x) => (x?.kind === "p" ? x.indent : -1)), [1, 2]);
  const l = parseAnnouncement("1. a\n2. b\n  1. b1\n  2. b2\n3. c\n  - c1");
  assert.deepEqual(l[0]?.kind === "list" ? announcementListMarkers(l[0].items) : [], ["1.", "2.", "1.", "2.", "3.", "◦"]);
});

test("bản tin: đậm, nghiêng, gạch chân, ký tự thoát và ký hiệu lẻ", () => {
  assert.deepEqual(parseAnnouncementInline("a **đậm *cả nghiêng*** ++gạch++ b"), [
    { text: "a " }, { text: "đậm ", b: true }, { text: "cả nghiêng", b: true, i: true }, { text: " " }, { text: "gạch", u: true }, { text: " b" },
  ]);
  assert.deepEqual(parseAnnouncementInline("5 \\* 3 = 15, giá *chưa đóng"), [{ text: "5 * 3 = 15, giá *chưa đóng" }]);
  assert.equal(announcementPlainText("## Tiêu đề\n**Đậm** và *nghiêng*\n\n- ý"), "Tiêu đề\n\nĐậm và nghiêng\n\ný");
  assert.equal(announcementExcerpt("**Mở đầu** bài\n\nĐoạn 2"), "Mở đầu bài");
  assert.equal(announcementReadMinutes("ngắn"), 1);
  assert.equal(announcementReadMinutes(Array(600).fill("**từ**").join(" ")), 3);
});
