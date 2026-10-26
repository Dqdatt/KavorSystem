import assert from "node:assert/strict";
import test from "node:test";
import type { PayComponent } from "@kavor/contracts";
import { readCsv, validateCsv } from "./csv.js";

const comps: PayComponent[] = [
  { id: "base", code: "BASE", name: "Lương", kind: "earning", displayOrder: 1 },
  { id: "adv", code: "ADVANCE", name: "Tạm ứng", kind: "deduction", displayOrder: 2 },
  { id: "net", code: "NET", name: "Thực lĩnh", kind: "net", displayOrder: 3 },
];
const parse = (csv: string) => validateCsv(readCsv(csv), comps, new Map([["NV1", "e1"], ["NV2", "e2"]]));

test("CSV Sheets: BOM, CRLF, quote, dấu phẩy/xuống dòng trong ghi chú, vị trí dòng", () => {
  const r = parse('\uFEFFemployee_code,BASE,ADVANCE,NET,work_days,note\r\nNV1,15.000.000,2000000,13000000,20.5,"Có dấu phẩy,\r\nvà ""quote"""\r\nNV2,1,,1,,\r\n');
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows[0]!.note, 'Có dấu phẩy,\r\nvà "quote"');
  assert.equal(r.rows[0]!.workDays, 20.5);
  assert.equal(r.rows[0]!.net, 13_000_000);
  assert.equal(r.rows[1]!.line, 4);
  assert.equal(r.rows[1]!.workDays, null);
});

test("NET âm hợp lệ; earning/deduction âm, số lẻ, dấu phân nhóm sai và overflow bị chặn", () => {
  assert.equal(parse("employee_code,BASE,ADVANCE,NET\nNV1,0,100,-100").errors.length, 0);
  for (const v of ["-1", "1.50", "1e6", "NaN", "9007199254740992", "1 000", "1.0000"]) {
    const r = parse(`employee_code,BASE,NET\nNV1,${v},0`);
    assert.ok(r.errors.some((e) => e.code === "MONEY_INVALID"), v);
    assert.ok(!JSON.stringify(r.errors).includes(v), "không chép ô tiền vào chẩn đoán");
  }
  assert.ok(parse("employee_code,BASE,NET\nNV1,1,").errors.some((e) => e.code === "MONEY_INVALID"));
});

test("Chặn lỗi header/file, độ rộng dòng, nhân viên lạ/trùng, work_days/note", () => {
  for (const [csv, code] of [
    ["", "CSV_EMPTY"], ["employee_code,NET", "CSV_NO_ROWS"],
    ["employee_code,BASE\nNV1,0", "HEADER_REQUIRED"],
    ["employee_code,NET,NET\nNV1,0,0", "HEADER_DUPLICATE"],
    ["employee_code,NET,OTHER\nNV1,0,0", "HEADER_UNKNOWN"],
    ["employee_code,NET\nNV1,0,x", "ROW_WIDTH"],
    ["employee_code,NET\nUNKNOWN,0", "EMPLOYEE_UNKNOWN"],
    ["employee_code,NET\nNV1,0\nNV1,0", "EMPLOYEE_DUPLICATE"],
    ["employee_code,BASE,NET\nNV1,10,9", "NET_MISMATCH"],
    ["employee_code,NET,work_days\nNV1,0,32", "WORK_DAYS_INVALID"],
    [`employee_code,NET,note\nNV1,0,${"a".repeat(1001)}`, "NOTE_TOO_LONG"],
    ['employee_code,NET,note\nNV1,0,"chưa đóng', "CSV_SYNTAX"],
    ['employee_code,NET,note\nNV1,0,"đã đóng"x', "CSV_SYNTAX"],
  ]) assert.ok(parse(csv!).errors.some((e) => e.code === code), code);
  const r = parse("employee_code,NET\nNV1,0\nNV2,x");
  assert.equal(r.totalRows, 2);
  assert.equal(r.errorRows, 1);
});
