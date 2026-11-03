import assert from "node:assert/strict";
import test from "node:test";
import type { ShiftInfo } from "@kavor/contracts";
import { overtimeAttendanceText } from "@kavor/contracts";
import { computeDay, explainDeadline, isoWeekday, monthOf, overtimeAttendance, periodOf, summarize } from "./compute.js";

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
  const pm = day("2026-10-20", [["in", "08:00"], ["out", "12:00"]], { leave: { ...al, half: "pm" } });
  assert.equal(pm.kind, "work");
  assert.equal(pm.credit, 1);
  assert.equal(pm.issue, null);
  assert.equal(day("2026-10-20", [], { leave: { ...al, half: "am" } }).issue, "absent");
  /* Nửa ngày: muộn/sớm theo nửa ca còn làm (nghỉ trưa 12:00–13:00), ân hạn muộn 5 phút như ngày thường */
  const pmLate = day("2026-10-20", [["in", "08:30"], ["out", "11:40"]], { leave: { ...al, half: "pm" } });
  assert.deepEqual([pmLate.lateMinutes, pmLate.earlyMinutes, pmLate.issue, pmLate.credit], [30, 20, "late_early", 1]);
  const am = day("2026-10-20", [["in", "13:04"], ["out", "17:00"]], { leave: { ...al, half: "am" } });
  assert.deepEqual([am.lateMinutes, am.issue], [0, null]);
  assert.deepEqual([day("2026-10-20", [["in", "13:20"], ["out", "17:00"]], { leave: { ...al, half: "am" } }).lateMinutes], [20]);
  /* Ca không nghỉ trưa: chia giữa ca (08:00–16:00 → 12:00) */
  const noBreak = { ...HC, end: "16:00", breakStart: null, breakEnd: null };
  assert.equal(day("2026-10-20", [["in", "12:15"], ["out", "16:00"]], { shift: noBreak, leave: { ...al, half: "am" } }).lateMinutes, 15);
  /* Hôm nay nghỉ sáng, vào 13:30: báo muộn theo nửa chiều */
  assert.equal(day("2026-10-23", [["in", "13:30"]], { today: "2026-10-23", leave: { ...al, half: "am" } }).issue, "late");
  /* Ngày nghỉ theo ca thì đơn nghỉ không có tác dụng */
  assert.equal(day("2026-10-18", [], { leave: { ...al, half: "full" } }).kind, "off");
});

test("công chuẩn chỉ đếm ngày làm việc, kể cả ngày chưa tới (không đếm cuối tuần tương lai)", () => {
  const days = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"].map((d) => ({ ...day(d, [["in", "08:00"], ["out", "17:00"]], { today: "2026-10-23" }), canExplain: false, explainDeadline: null }));
  const s = summarize(days);
  assert.deepEqual(days.map((d) => d.kind), ["today", "future", "future", "future"]);
  assert.equal(s.standard, 2); // T6 23 + T2 26; T7, CN không tính
});

test("làm thêm giờ: chỉ tính phần trùng với giờ vào → ra của ngày đã qua, không quá giờ đã duyệt", () => {
  const ot = (start: string, end: string, minutes: number, ratePercent = 150, requestNo = "OT-0001") => ({ start, end, minutes, ratePercent, requestNo });
  const full = day("2026-10-20", [["in", "08:00"], ["out", "19:40"]], { overtime: [ot("17:30", "19:30", 120)] });
  assert.deepEqual(full.overtime, { minutes: 120, approvedMinutes: 120, checked: true, ratePercent: 150, requestNos: ["OT-0001"] });
  /* Về 18:47 → trùng 77 phút, làm tròn xuống bước 5 phút */
  assert.equal(day("2026-10-20", [["in", "08:00"], ["out", "18:47"]], { overtime: [ot("17:30", "19:30", 120)] }).overtime?.minutes, 75);
  /* Không chấm ra → không tính; điều chỉnh đã duyệt (giải trình quên chấm ra) thì tính lại */
  assert.equal(day("2026-10-20", [["in", "08:00"]], { overtime: [ot("17:30", "19:30", 120)] }).overtime?.minutes, 0);
  assert.equal(day("2026-10-20", [["in", "08:00"]], { overtime: [ot("17:30", "19:30", 120)], adjustment: { clockIn: null, clockOut: "19:30" } }).overtime?.minutes, 120);
  /* OT trước ca dùng giờ vào */
  assert.equal(day("2026-10-20", [["in", "06:30"], ["out", "17:00"]], { overtime: [ot("06:00", "08:00", 120)] }).overtime?.minutes, 90);
  /* Ngày nghỉ, hai đơn: hệ số lấy cao nhất */
  const off = day("2026-10-18", [["in", "08:00"], ["out", "10:00"]], { overtime: [ot("08:00", "10:00", 120, 200), ot("14:00", "16:00", 120, 200, "OT-0002")] });
  assert.equal(off.kind, "off");
  assert.deepEqual(off.overtime, { minutes: 120, approvedMinutes: 240, checked: true, ratePercent: 200, requestNos: ["OT-0001", "OT-0002"] });
  /* Hôm nay và ngày tới chưa đối chiếu */
  const today = day("2026-10-23", [["in", "08:00"], ["out", "19:30"]], { today: "2026-10-23", overtime: [ot("17:30", "19:30", 120)] });
  assert.deepEqual([today.overtime?.minutes, today.overtime?.checked], [0, false]);
  assert.equal(day("2026-10-20", []).overtime, null);
  const s = summarize([full, off, today].map((d) => ({ ...d, canExplain: false, explainDeadline: null })));
  assert.deepEqual([s.overtimeMinutes, s.overtimeApprovedMinutes, s.overtimeShortDays], [240, 480, 1]);
});

test("đơn OT: chấm công thực tế để đối chiếu — ngày tới null, hôm nay chưa đối chiếu, không chấm công vẫn trả về (công tác)", () => {
  const ev = (xs: Array<["in" | "out", string]>) => xs.map(([kind, t]) => ({ kind, minute: Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) }));
  assert.equal(overtimeAttendance("2026-10-25", "2026-10-24", "17:30", "19:30", [], null), null);
  const ok = overtimeAttendance("2026-10-20", "2026-10-24", "17:30", "20:30", ev([["in", "07:54"], ["out", "20:36"]]), null)!;
  assert.deepEqual(ok, { clockIn: "07:54", clockOut: "20:36", adjusted: false, checked: true, matchedMinutes: 180, minutes: 180 });
  assert.equal(overtimeAttendanceText(ok), "Vào 07:54 · Ra 20:36 · khớp 3/3 giờ OT");
  const short = overtimeAttendance("2026-10-20", "2026-10-24", "17:30", "19:30", ev([["in", "08:00"], ["out", "18:47"]]), null)!;
  assert.equal(overtimeAttendanceText(short), "Vào 08:00 · Ra 18:47 · khớp 1,3/2 giờ OT");
  const trip = overtimeAttendance("2026-10-20", "2026-10-24", "17:30", "19:30", [], null)!;
  assert.equal(overtimeAttendanceText(trip), "Không có chấm công · khớp 0/2 giờ OT");
  const adj = overtimeAttendance("2026-10-20", "2026-10-24", "17:30", "19:30", ev([["in", "08:00"]]), { clockIn: null, clockOut: "19:30" })!;
  assert.deepEqual([adj.clockOut, adj.adjusted, adj.matchedMinutes], ["19:30", true, 120]);
  const today = overtimeAttendance("2026-10-24", "2026-10-24", "17:30", "19:30", ev([["in", "07:58"]]), null)!;
  assert.equal(overtimeAttendanceText(today), "Vào 07:58 · Ra --:-- · chưa đối chiếu (hôm nay)");
});
