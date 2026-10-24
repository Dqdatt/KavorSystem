import assert from "node:assert/strict";
import test from "node:test";
import type { ShiftInfo } from "@kavor/contracts";
import { computeDay, explainDeadline, isoWeekday, monthOf, periodOf, summarize } from "./compute.js";

const HC: ShiftInfo & { workDays: number[] } = {
  id: "s", code: "HC", name: "Ca hành chính", versionNo: 1, start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00",
  lateGraceMinutes: 5, earlyGraceMinutes: 0, workDays: [1, 2, 3, 4, 5],
};
const day = (date: string, events: Array<["in" | "out", string]>, extra: Partial<Parameters<typeof computeDay>[0]> = {}) => computeDay({
  date, today: "2026-10-24", employed: true, holiday: null, shift: HC, adjustment: null, request: null,
  events: events.map(([kind, t]) => ({ kind, minute: Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) })), ...extra,
});

test("kỳ công 26→25 và tháng dương lịch", () => {
  assert.deepEqual(periodOf("2026-10", 26), { start: "2026-09-26", end: "2026-10-25" });
  assert.deepEqual(periodOf("2026-01", 26), { start: "2025-12-26", end: "2026-01-25" });
  assert.deepEqual(periodOf("2026-02", 1), { start: "2026-02-01", end: "2026-02-28" });
  assert.equal(monthOf("2026-10-26", 26), "2026-11");
  assert.equal(monthOf("2026-12-30", 26), "2027-01");
  assert.equal(monthOf("2026-10-25", 26), "2026-10");
  assert.equal(isoWeekday("2026-10-25"), 7);
});

test("đủ giờ, đi muộn quá ân hạn, thiếu giờ ra, vắng", () => {
  const ok = day("2026-10-20", [["in", "08:04"], ["out", "17:10"]]);
  assert.equal(ok.issue, null);
  assert.equal(ok.credit, 1);
  assert.equal(ok.workedMinutes, 8 * 60 - 4);
  assert.equal(day("2026-10-20", [["in", "08:14"], ["out", "17:00"]]).lateMinutes, 14);
  assert.equal(day("2026-10-20", [["in", "08:00"]]).issue, "missing_out");
  assert.equal(day("2026-10-20", []).issue, "absent");
  assert.equal(day("2026-10-23", [], { today: "2026-10-23" }).kind, "today");
  assert.equal(day("2026-10-24", []).kind, "off"); // hôm nay là Thứ Bảy
  assert.equal(day("2026-10-18", []).kind, "off");
  assert.equal(day("2026-10-20", [], { holiday: "Lễ" }).kind, "holiday");
});

test("điều chỉnh đã duyệt ghi đè giờ khi tính, giữ giờ gốc", () => {
  const d = day("2026-10-20", [["in", "08:00"]], { adjustment: { clockIn: null, clockOut: "17:00" } });
  assert.equal(d.issue, null);
  assert.equal(d.credit, 1);
  assert.equal(d.rawOut, null);
  assert.equal(d.clockOut, "17:00");
});

test("hạn giải trình tính theo ngày làm việc", () => {
  const isWork = (d: string) => isoWeekday(d) <= 5;
  assert.equal(explainDeadline("2026-10-22", 3, isWork), "2026-10-27"); // T5 → T2 tuần sau là ngày làm việc thứ 3
});

test("tổng hợp: ngày thiếu đã có giải trình đang chờ không tính là thiếu", () => {
  const days = [
    { ...day("2026-10-19", [["in", "08:00"], ["out", "17:00"]]), canExplain: false, explainDeadline: null },
    { ...day("2026-10-20", [["in", "08:00"]], { request: { id: "r", no: "GT-0001", status: "pending" } }), canExplain: false, explainDeadline: null },
    { ...day("2026-10-21", []), canExplain: true, explainDeadline: null },
  ];
  const s = summarize(days);
  assert.equal(s.credited, 1);
  assert.equal(s.missingDays, 1);
  assert.equal(s.pendingRequests, 1);
});

test("nghỉ phép: cả ngày có lương = 1 công, không cần chấm công; nửa ngày còn nửa phải chấm", () => {
  const al = { typeName: "Phép năm", paid: true, requestNo: "NP-0001" };
  const full = day("2026-10-20", [], { leave: { ...al, half: "full" } });
  assert.equal(full.kind, "leave");
  assert.equal(full.credit, 1);
  assert.equal(full.issue, null);
  assert.equal(day("2026-10-20", [], { leave: { ...al, paid: false, half: "full" } }).credit, 0);
  const pm = day("2026-10-20", [["in", "08:30"], ["out", "12:00"]], { leave: { ...al, half: "pm" } });
  assert.equal(pm.kind, "work");
  assert.equal(pm.credit, 1);
  assert.equal(pm.lateMinutes, 0);
  assert.equal(day("2026-10-20", [], { leave: { ...al, half: "am" } }).issue, "absent");
  /* Ngày nghỉ theo ca thì đơn nghỉ không có tác dụng */
  assert.equal(day("2026-10-18", [], { leave: { ...al, half: "full" } }).kind, "off");
});

test("công chuẩn chỉ đếm ngày làm việc, kể cả ngày chưa tới (không đếm cuối tuần tương lai)", () => {
  const days = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"].map((d) => ({ ...day(d, [["in", "08:00"], ["out", "17:00"]], { today: "2026-10-23" }), canExplain: false, explainDeadline: null }));
  const s = summarize(days);
  assert.deepEqual(days.map((d) => d.kind), ["today", "future", "future", "future"]);
  assert.equal(s.standard, 2); // T6 23 + T2 26; T7, CN không tính
});

test("làm thêm giờ đã duyệt: hiện trên ngày (kể cả ngày nghỉ) và cộng vào tổng kỳ", () => {
  const ot = { minutes: 120, ratePercent: 200, requestNos: ["OT-0001"] };
  const off = day("2026-10-18", [["in", "08:00"], ["out", "10:00"]], { overtime: ot });
  assert.equal(off.kind, "off");
  assert.deepEqual(off.overtime, ot);
  const s = summarize([{ ...off, canExplain: false, explainDeadline: null }, { ...day("2026-10-19", [["in", "08:00"], ["out", "17:00"]], { overtime: { ...ot, minutes: 90, ratePercent: 150 } }), canExplain: false, explainDeadline: null }]);
  assert.equal(s.overtimeMinutes, 210);
});
