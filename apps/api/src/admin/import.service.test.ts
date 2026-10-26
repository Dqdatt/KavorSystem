import assert from "node:assert/strict";
import test from "node:test";
import { importDate, parseEmployeeCsv } from "./import.service.js";

const H = "employee_code,full_name,work_email,phone,hire_date,employment_type,department_code,position_code,manager_code";

test("ngày vào làm: hai định dạng, chặn ngày không có thật", () => {
  assert.equal(importDate("2026-01-05"), "2026-01-05");
  assert.equal(importDate("5/1/2026"), "2026-01-05");
  assert.equal(importDate("31/02/2026"), null);
  assert.equal(importDate("2026/01/05"), null);
});

test("đọc CSV nhân viên: chuẩn hóa, lỗi từng dòng, trùng trong file", () => {
  const csv = `﻿${H}\r\nnv01,Lê Văn A,A@Cty.vn,0901 234 567,05/01/2026,Chính thức,mkt,ae,\r\nNV02,B,b@cty.vn,,2026-13-01,abc,MKT,,NV01\r\nNV01,Lê C,a@cty.vn,,2026-01-05,official,MKT,AE,NV01\r\n`;
  const { rows, fileErrors } = parseEmployeeCsv(csv);
  assert.deepEqual(fileErrors, []);
  assert.deepEqual([rows[0]!.code, rows[0]!.email, rows[0]!.hireDate, rows[0]!.type, rows[0]!.deptCode, rows[0]!.errors], ["NV01", "a@cty.vn", "2026-01-05", "official", "MKT", []]);
  assert.ok(rows[1]!.errors.some((e) => e.includes("Họ tên")) && rows[1]!.errors.some((e) => e.includes("Ngày vào làm")) && rows[1]!.errors.some((e) => e.includes("Loại hợp đồng")) && rows[1]!.errors.some((e) => e.includes("chức danh")));
  assert.ok(rows[2]!.errors.some((e) => e.includes("Trùng mã với dòng 2")) && rows[2]!.errors.some((e) => e.includes("Trùng email")) && rows[2]!.errors.some((e) => e.includes("Không tự làm quản lý")));
});

test("thiếu cột bắt buộc hoặc quá số dòng → lỗi cả file", () => {
  assert.match(parseEmployeeCsv("employee_code,full_name\nNV1,A").fileErrors.join(" "), /Thiếu cột bắt buộc: work_email/);
  assert.match(parseEmployeeCsv(`${H}\n` + Array.from({ length: 1001 }, (_, i) => `N${i},A B,a${i}@x.vn,,2026-01-01,official,D,P,`).join("\n")).fileErrors.join(" "), /Tối đa 1000 dòng/);
});
