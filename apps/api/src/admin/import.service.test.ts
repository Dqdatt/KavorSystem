import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { abbrev, buildImport, normPhone, normType, parseDate, type Catalog, type Saved } from "./import/detect.js";
import { readDelimited, readSpreadsheet, SpreadsheetError, type Sheet } from "./import/spreadsheet.js";
import { importOptions } from "./import.service.js";

/* Bộ file mẫu nhiều kiểu (mỗi công ty quản trị một kiểu) — nhận dạng phải đúng hết, không dựa vào một mẫu cố định */
const CAT: Catalog = {
  departments: [{ code: "MKT", name: "Marketing" }, { code: "KD", name: "Kinh doanh" }],
  positions: [{ code: "AE", name: "Account Executive" }, { code: "NV", name: "Nhân viên" }],
  employees: [{ code: "HD0001", name: "Nguyễn Văn Cũ", status: "active" }],
};
const NONE: Saved = { columns: {}, department: {}, position: {} };
const TODAY = "2026-11-06";
const csv = (name: string, text: string): Sheet[] => [{ name, hidden: false, rows: readDelimited(text) }];
const run = (sheets: Sheet[], opts: Parameters<typeof buildImport>[0]["options"] = {}, saved = NONE) => buildImport({ sheets, saved, options: opts, today: TODAY, catalog: CAT });
const fieldOf = (b: ReturnType<typeof run>) => Object.fromEntries(b.columns.filter((c) => c.field).map((c) => [c.header, c.field]));

test("giá trị: ngày nhiều dạng, điện thoại mất số 0, loại hợp đồng tự do", () => {
  assert.equal(parseDate("05/01/2026", "dmy"), "2026-01-05");
  assert.equal(parseDate("05/01/2026", "mdy"), "2026-05-01");
  assert.equal(parseDate("2026-01-05", "mdy"), "2026-01-05");
  assert.equal(parseDate("44934", "dmy"), "2023-01-08");
  assert.equal(parseDate("5-Jan-24", "dmy"), "2024-01-05");
  assert.equal(parseDate("Jan 5, 2024", "dmy"), "2024-01-05");
  assert.equal(parseDate("31/09/2023", "dmy"), null);
  assert.equal(parseDate("16/07/19885", "dmy"), null);
  assert.equal(parseDate("  ", "dmy"), undefined);
  assert.deepEqual(["901234567", "+84 901 234 567", "0901.234.567", "84901234567", "abc", "0901 234 567 / 0902"].map(normPhone),
    ["0901234567", "0901234567", "0901234567", "0901234567", null, "0901234567"]);
  assert.deepEqual(["1 năm", "HĐ không XĐTH", "HĐTV", "Thử việc", "CTV", "Intern", "Full-time", "abc"].map(normType),
    ["official", "official", "probation", "probation", "contractor", "intern", "official", null]);
  assert.ok(abbrev("mkt", "marketing") && abbrev("gt", "kenh gt") && abbrev("hcns", "hanh chinh nhan su") && !abbrev("kd", "ke toan"));
});

test("mẫu Kavor cũ (mã phòng ban/chức danh) vẫn nhận", () => {
  const b = run(csv("x", "employee_code,full_name,work_email,phone,hire_date,employment_type,department_code,position_code,manager_code\nnv01,Lê Văn A,A@Cty.vn,0901 234 567,05/01/2026,Chính thức,mkt,ae,\nNV02,Trần B,b@cty.vn,,2026-01-05,Thử việc,MKT,AE,NV01\n"));
  assert.deepEqual(b.fileErrors, []);
  assert.deepEqual(b.rows.map((r) => [r.code, r.email, r.hireDate, r.type, r.managerCode, r.errors]), [["NV01", "a@cty.vn", "2026-01-05", "official", null, []], ["NV02", "b@cty.vn", "2026-01-05", "probation", "NV01", []]]);
  assert.deepEqual([b.departments[0]!.choice, b.positions[0]!.choice], ["code:MKT", "code:AE"]);
});

test("tiêu đề tiếng Anh, tab, ngày ISO, chức danh theo tên", () => {
  const b = run(csv("Staff", "Employee ID\tFull Name\tEmail Address\tDepartment\tJob Title\tStart Date\tMobile\nE-01\tAnna Tran\tanna@x.com\tMarketing\tAccount Executive\t2025-03-01\t0912345678\n"));
  assert.deepEqual(fieldOf(b), { "Employee ID": "employee_code", "Full Name": "full_name", "Email Address": "work_email", Department: "department", "Job Title": "position", "Start Date": "hire_date", Mobile: "phone" });
  assert.deepEqual([b.rows[0]!.code, b.departments[0]!.choice, b.positions[0]!.choice, b.rows[0]!.errors], ["E-01", "code:MKT", "code:AE", []]);
});

test("tiêu đề ở dòng 4, có dòng tên công ty, STT, dòng tổng cộng; họ tên tách 3 cột", () => {
  const b = run(csv("DS", "CÔNG TY TNHH ABC,,,,,\nDANH SÁCH NHÂN SỰ THÁNG 10,,,,,\n,,,,,\nSTT,Họ,Tên đệm,Tên,Bộ phận,Ngày vào làm\n1,Nguyễn,Thị,Hoa,Kinh doanh,01/02/2024\n2,Lê,,Nam,Kinh doanh,15/03/2024\n,Tổng cộng,,,,\n"));
  assert.equal(b.sheets[0]!.headerRow, 4);
  assert.deepEqual(b.rows.map((r) => [r.fullName, r.hireDate]), [["Nguyễn Thị Hoa", "2024-02-01"], ["Lê Nam", "2024-03-15"]]);
  assert.deepEqual(b.rows.map((r) => r.code), ["NV0001", "NV0002"]);
  assert.ok(b.rows[0]!.warnings.some((w) => w.includes("Kavor đặt NV0001")) && b.rows[0]!.warnings.some((w) => w.includes("Chức danh") || w.includes("chức danh")));
});

test("thứ tự ngày: tự nhận tháng/ngày kiểu Mỹ; không phân biệt được thì hỏi, HR chọn thì theo HR", () => {
  const us = run(csv("x", "Name,Department,Hire Date\nA B,Marketing,03/25/2024\nC D,Marketing,04/01/2024\n"));
  assert.deepEqual([us.dateOrder, us.rows[1]!.hireDate], [{ value: "mdy", ambiguous: false }, "2024-04-01"]);
  const amb = run(csv("x", "Name,Department,Hire Date\nA B,Marketing,03/04/2024\n"));
  assert.deepEqual([amb.dateOrder, amb.rows[0]!.hireDate], [{ value: "dmy", ambiguous: true }, "2024-04-03"]);
  const set = run(csv("x", "Name,Department,Hire Date\nA B,Marketing,03/04/2024\n"), { dateOrder: "mdy" });
  assert.deepEqual([set.dateOrder.ambiguous, set.rows[0]!.hireDate], [false, "2024-03-04"]);
});

test("dữ liệu kiểu Excel: số ngày, mã 2027.0, điện thoại mất số 0, dấu cách thừa, email lẫn chữ", () => {
  const b = run(csv("x", "MÃ CHẤM CÔNG,HỌ VÀ TÊN,PHÒNG/ BAN,CHỨC VỤ,NGÀY BẮT ĐẦU LÀM VIỆC,SĐT,E MAIL,LOẠI HĐ\n2027.0,  Phạm  Sỹ Hùng ,Kinh doanh ,Nhân viên CSKH,44934,396012176,Email: hung@gmail.com; khac@x.vn,1 năm \n"));
  const r = b.rows[0]!;
  assert.deepEqual([r.code, r.fullName, r.hireDate, r.phone, r.email, r.type, r.dept], ["2027", "Phạm Sỹ Hùng", "2023-01-08", "0396012176", "hung@gmail.com", "official", "Kinh doanh"]);
  assert.deepEqual(b.positions.map((u) => [u.value, u.choice, u.newCode]), [["Nhân viên CSKH", "new:nhan vien cskh", "NVC"]]);
});

test("nghỉ việc: theo trạng thái, ngày nghỉ đã qua, sheet nhân viên đã nghỉ; chính thức trong tương lai = thử việc", () => {
  const b = run([
    ...csv("Đang làm", "Họ tên,Phòng ban,Ngày vào làm,Ngày chính thức,Trạng thái,Ngày nghỉ việc\nA Một,Marketing,01/10/2026,01/12/2026,Đang làm việc,\nB Hai,Marketing,01/01/2020,,Đã nghỉ việc,\nC Ba,Marketing,01/01/2020,,,31/10/2026\nD Bốn,Marketing,01/01/2020,,Tạm nghỉ việc,\n"),
    ...csv("Nhân Viên Đã Nghỉ Việc ", "Họ tên,Phòng ban,Ngày vào làm\nE Năm,Marketing,01/01/2020\n"),
  ]);
  assert.deepEqual(b.rows.map((r) => [r.fullName, r.skip ? "skip" : r.type]), [["A Một", "probation"], ["B Hai", "skip"], ["C Ba", "skip"], ["D Bốn", "official"], ["E Năm", "skip"]]);
});

test("không có mã: khớp hồ sơ có sẵn theo tên, lấy mã từ bảng tra, còn lại tự đặt; trùng tên nhiều hồ sơ thì báo", () => {
  const b = run([
    ...csv("NV", "Họ và tên,Phòng ban,Ngày vào làm\nNguyễn Văn Cũ,Marketing,01/01/2024\nVõ Thanh Thuận,Kinh doanh,01/07/2025\nMới Tinh,Kinh doanh,01/07/2025\n"),
    ...csv("MCC", "Chức vụ,Họ và tên,Mã chấm công\nGiám đốc,Võ Thanh Thuận,2401\n"),
  ]);
  assert.deepEqual(b.sheets.map((s) => [s.name, s.included]), [["NV", true], ["MCC", false]]);
  assert.deepEqual(b.rows.map((r) => [r.code, r.exists]), [["HD0001", true], ["2401", false], ["NV0001", false]]);
});

test("phòng ban viết tắt / viết khác: khớp mã, khớp tên, gộp viết tắt vào tên đầy đủ (đổi được)", () => {
  const b = run(csv("x", "Họ tên,Phòng ban,Ngày vào làm\nA A,Mkt,01/01/2024\nB B,marketing,01/01/2024\nC C,Kênh GT,01/01/2024\nD D,Kênh GT,01/01/2024\nE E,GT,01/01/2024\nF F,Hành chính nhân sự,01/01/2024\nG G,HCNS,01/01/2024\nH H,Hành chính nhân sự,01/01/2024\n"));
  const ch = Object.fromEntries(b.departments.map((u) => [u.value, u.choice]));
  assert.deepEqual(ch, { Mkt: "code:MKT", marketing: "code:MKT", "Kênh GT": "new:kenh gt", GT: "new:kenh gt", "Hành chính nhân sự": "new:hanh chinh nhan su", HCNS: "new:hanh chinh nhan su" });
  const keep = run(csv("x", "Họ tên,Phòng ban,Ngày vào làm\nC C,Kênh GT,01/01/2024\nE E,GT,01/01/2024\n"), { units: { department: { gt: "new:gt" } } });
  assert.equal(keep.departments.find((u) => u.value === "GT")!.choice, "new:gt");
});

test("tiêu đề lạ: đoán email/điện thoại theo nội dung cột; HR chọn tay và cách khớp đã lưu được ưu tiên", () => {
  const t = "Họ tên,Hộp thư,Liên lạc,Nơi làm,Vào ngày\nA A,a@x.vn,0901234567,Marketing,01/01/2024\nB B,b@x.vn,0912345678,Marketing,02/01/2024\n";
  const b = run(csv("x", t));
  assert.deepEqual([b.columns.find((c) => c.header === "Hộp thư")!.source, b.columns.find((c) => c.header === "Liên lạc")!.field], ["content", "phone"]);
  assert.ok(b.rows[0]!.errors.includes("Thiếu phòng ban") && b.rows[0]!.errors.includes("Thiếu ngày vào làm"));
  const fixed = run(csv("x", t), { columns: { "noi lam": "department" } }, { columns: { "vao ngay": "hire_date" }, department: {}, position: {} });
  assert.deepEqual([fixed.rows[0]!.dept, fixed.rows[0]!.hireDate, fixed.rows[0]!.errors], ["Marketing", "2024-01-01", []]);
  assert.equal(fixed.columns.find((c) => c.header === "Nơi làm")!.source, "manual");
});

test("trùng trong file, quản lý theo tên, cột chưa hỗ trợ được nhận ra", () => {
  const b = run(csv("x", "Mã NV,Họ tên,Phòng ban,Ngày vào làm,Quản lý trực tiếp,Email,CCCD,Lương cơ bản\nA1,Trưởng Phòng,Marketing,01/01/2024,,tp@x.vn,0123,10000000\nA2,Nhân Viên,Marketing,01/01/2024,Trưởng Phòng,tp@x.vn,0456,8000000\nA2,Lặp Lại,Marketing,01/01/2024,ZZZ,,,\n"));
  assert.deepEqual(b.rows.map((r) => [r.managerCode, r.email, r.errors.length]), [[null, "tp@x.vn", 0], ["A1", null, 0], [null, null, 1]]);
  assert.ok(b.rows[2]!.warnings.some((w) => w.includes("Không xác định được quản lý")));
  assert.deepEqual(b.columns.filter((c) => c.later).map((c) => [c.header, c.later, c.samples]), [["CCCD", "CCCD/CMND", []], ["Lương cơ bản", "Lương", []]]);
});

/* .xlsx tối thiểu dựng tay: shared string, inline string, số, sheet ẩn */
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, body] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(body)), n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(body.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(body.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, n, data); central.push(ch, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

test("đọc .xlsx: shared/inline string, số dạng E, sheet ẩn; từ chối .xls", () => {
  const buf = zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="OFFICE" sheetId="1" r:id="rId1"/><sheet name="Ẩn" state="hidden" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>HỌ VÀ TÊN</t></si><si><r><t>PHÒNG</t></r><r><t xml:space="preserve">/ BAN</t></r></si><si><t>Ngày vào làm</t></si><si><t>Lê &amp; Lý</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row><row r="2"/><row r="3"><c r="A3" t="inlineStr"><is><t>Lê Văn A</t></is></c><c r="B3"><v>8.960427184E9</v></c><c r="C3" t="s"><v>3</v></c><c r="D3" s="2"><v>45658</v></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>`,
  });
  const sheets = readSpreadsheet("a.xlsx", buf);
  assert.deepEqual(sheets.map((s) => [s.name, s.hidden]), [["OFFICE", false], ["Ẩn", true]]);
  assert.deepEqual(sheets[0]!.rows[2], ["Lê Văn A", "8960427184", "Lê & Lý", "45658"]);
  const b = run(sheets);
  assert.deepEqual([b.rows[0]!.dept, b.rows[0]!.hireDate, b.sheets[1]!.included], ["Lê & Lý", "2025-01-01", false]);
  const xls = Buffer.alloc(16); xls.writeUInt32LE(0xe011cfd0, 0);
  assert.throws(() => readSpreadsheet("a.xls", xls), SpreadsheetError);
  assert.deepEqual(readSpreadsheet("a.csv", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Họ tên;Phòng\r\nA;B\r\n", "utf16le")]))[0]!.rows, [["Họ tên", "Phòng"], ["A", "B"]]);
});

test("tùy chọn từ web: bỏ giá trị lạ", () => {
  assert.deepEqual(importOptions({ columns: { a: "phone", b: "hack", c: "" }, units: { department: { x: "code:MKT", y: "drop table" } }, dateOrder: "ymd", branchId: "x", sheets: { S: true, T: "yes" } }),
    { sheets: { S: true }, columns: { a: "phone", c: "" }, units: { department: { x: "code:MKT" }, position: {} }, dateOrder: undefined, branchId: undefined });
});

test("viết tắt hay gặp: Mã CC / MCC là mã nhân viên", () => {
  const b = run(csv("x", "STT,Mã CC,Họ và tên,Bộ phận,Ngày vào làm\n1,2001,A B,Marketing,01/01/2024\n"));
  assert.deepEqual([b.columns.find((c) => c.header === "Mã CC")!.field, b.rows[0]!.code], ["employee_code", "2001"]);
});
