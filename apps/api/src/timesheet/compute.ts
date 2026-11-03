/* Tính bảng công theo ngày (hàm thuần, không đọc DB): kỳ công, ngày làm việc theo ca + lịch lễ, giờ vào/ra sau điều chỉnh,
   đi muộn/về sớm theo ân hạn của ca, thiếu giờ, ngày công, hạn giải trình. Event gốc không bị sửa: điều chỉnh đã duyệt
   ghi đè giờ vào/ra khi hiển thị và tính công. OT đã duyệt chỉ được tính phần trùng với giờ có mặt (vào → ra) của ngày đã qua.
   Ca qua đêm chưa hỗ trợ (giống module ca). */
import type { DayIssue, LeaveHalf, OvertimeAttendance, RequestStatus, ShiftInfo, TimesheetDay, TimesheetPeriod, TimesheetSummary } from "@kavor/contracts";
import { addDays } from "../admin/validate.js";
import { minutesOf } from "../attendance/policy.js";

/* ---------- Kỳ công ---------- */
/* Kỳ gọi theo tháng kết thúc. startDay 26 → "2026-10" = 26/09 … 25/10; startDay 1 → tháng dương lịch. */
export function periodOf(month: string, startDay: number): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  if (startDay <= 1) return { start: `${month}-01`, end: addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`, -1) };
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  return { start: `${prev}-${pad(startDay)}`, end: `${month}-${pad(startDay - 1)}` };
}
/* Tháng (kỳ) chứa một ngày */
export function monthOf(date: string, startDay: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (startDay > 1 && d >= startDay) return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  return `${y}-${pad(m)}`;
}
const pad = (n: number) => String(n).padStart(2, "0");
/* ISO weekday: 1 = Thứ Hai … 7 = Chủ Nhật */
export const isoWeekday = (date: string) => { const w = new Date(`${date}T12:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
export const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/* ---------- Ngày ---------- */
export type DayEvent = { kind: "in" | "out"; minute: number };
export type DayAdjustment = { clockIn: string | null; clockOut: string | null };
export type DayRequest = { id: string; no: string; status: RequestStatus };
/* Nghỉ phép đã duyệt của ngày */
export type DayLeave = { typeName: string; half: LeaveHalf; paid: boolean; requestNo: string };
/* Một đơn làm thêm giờ đã duyệt của ngày (giờ HH:MM công ty) */
export type DayOvertimeEntry = { start: string; end: string; minutes: number; ratePercent: number; requestNo: string };
/* Bước tính giờ OT, trùng bước đăng ký đơn OT */
export const OT_STEP_MIN = 5;
export type DayInput = {
  date: string;
  today: string;
  employed: boolean;
  holiday: string | null;
  shift: (ShiftInfo & { workDays: number[] }) | null;
  events: DayEvent[];
  adjustment: DayAdjustment | null;
  request: DayRequest | null;
  leave?: DayLeave | null;
  overtime?: DayOvertimeEntry[];
};

/* OT của ngày: đã qua thì chỉ tính phần trùng giữa khung đơn và giờ có mặt (làm tròn xuống theo bước đăng ký), không quá giờ đã duyệt.
   Hôm nay/ngày tới chưa đối chiếu: minutes = 0, checked = false. */
export function overtimeOf(entries: DayOvertimeEntry[] | undefined, inMin: number | null, outMin: number | null, past: boolean): TimesheetDay["overtime"] {
  if (!entries?.length) return null;
  const approvedMinutes = entries.reduce((n, e) => n + e.minutes, 0);
  let minutes = 0;
  if (past && inMin != null && outMin != null && outMin > inMin) {
    for (const e of entries) {
      const overlap = Math.max(0, Math.min(minutesOf(e.end), outMin) - Math.max(minutesOf(e.start), inMin));
      minutes += Math.min(e.minutes, overlap - (overlap % OT_STEP_MIN));
    }
  }
  return { minutes, approvedMinutes, checked: past, ratePercent: Math.max(...entries.map((e) => e.ratePercent)), requestNos: entries.map((e) => e.requestNo) };
}

/* Giờ có mặt của ngày: vào sớm nhất, ra muộn nhất; điều chỉnh đã duyệt ghi đè */
export function presenceOf(events: DayEvent[], adjustment: DayAdjustment | null) {
  const ins = events.filter((e) => e.kind === "in").map((e) => e.minute);
  const outs = events.filter((e) => e.kind === "out").map((e) => e.minute);
  const rawIn = ins.length ? Math.min(...ins) : null;
  const rawOut = outs.length ? Math.max(...outs) : null;
  const inMin = adjustment?.clockIn ? minutesOf(adjustment.clockIn) : rawIn;
  const outMin = adjustment?.clockOut ? minutesOf(adjustment.clockOut) : rawOut;
  return { rawIn, rawOut, inMin, outMin };
}

/* Chấm công của ngày làm thêm cho một đơn OT (đơn đang chờ cũng xem được): giờ có mặt + số phút của đơn khớp chấm công,
   cùng cách tính với bảng công (overtimeOf). Ngày tới: null; hôm nay: chưa đối chiếu. */
export function overtimeAttendance(date: string, today: string, start: string, end: string, events: DayEvent[], adjustment: DayAdjustment | null): OvertimeAttendance | null {
  if (date > today) return null;
  const { inMin, outMin } = presenceOf(events, adjustment);
  const minutes = minutesOf(end) - minutesOf(start);
  const ot = overtimeOf([{ start, end, minutes, ratePercent: 0, requestNo: "" }], inMin, outMin, date < today)!;
  return { clockIn: inMin == null ? null : hm(inMin), clockOut: outMin == null ? null : hm(outMin), adjusted: !!adjustment, checked: ot.checked, matchedMinutes: ot.minutes, minutes };
}

export function computeDay(i: DayInput): Omit<TimesheetDay, "canExplain" | "explainDeadline"> {
  const weekday = isoWeekday(i.date);
  const { rawIn, rawOut, inMin, outMin } = presenceOf(i.events, i.adjustment);
  const shift = i.shift;
  const base = {
    date: i.date, weekday, holidayName: i.holiday, shift: shift ? { name: shift.name, start: shift.start, end: shift.end } : null,
    clockIn: inMin == null ? null : hm(inMin), clockOut: outMin == null ? null : hm(outMin),
    rawIn: rawIn == null ? null : hm(rawIn), rawOut: rawOut == null ? null : hm(rawOut), adjusted: !!i.adjustment,
    request: i.request, overtime: overtimeOf(i.overtime, inMin, outMin, i.date < i.today),
  };
  const workday = !!shift && shift.workDays.includes(weekday) && !i.holiday;
  const leave = workday ? i.leave ?? null : null;
  const empty = { lateMinutes: 0, earlyMinutes: 0, workedMinutes: 0, credit: 0, issue: null, workday, leave };
  if (!i.employed) return { ...base, kind: "not_employed", ...empty, workday: false };
  if (leave?.half === "full") {
    /* Nghỉ cả ngày: không cần chấm công; có lương thì tính 1 công (kể cả ngày tương lai đã được duyệt) */
    return { ...base, kind: "leave", ...empty, credit: leave.paid && i.date <= i.today ? 1 : 0 };
  }
  if (i.date > i.today) return { ...base, kind: "future", ...empty };
  if (!workday) {
    /* Đi làm ngày nghỉ vẫn hiện giờ, không tính công thường (OT xử lý ở module OT). Hôm nay là ngày nghỉ thì vẫn là "off". */
    return { ...base, kind: i.holiday ? "holiday" : "off", ...empty };
  }
  const s = minutesOf(shift!.start), e = minutesOf(shift!.end);
  /* Nghỉ nửa ngày: muộn/sớm xét theo nửa ca còn phải làm (chia ở nghỉ trưa; ca không nghỉ trưa chia giữa ca) */
  const mid = Math.round((s + e) / 2);
  const ws = leave?.half === "am" ? (shift!.breakEnd ? minutesOf(shift!.breakEnd) : mid) : s;
  const we = leave?.half === "pm" ? (shift!.breakStart ? minutesOf(shift!.breakStart) : mid) : e;
  const late = inMin != null && inMin > ws + shift!.lateGraceMinutes ? inMin - ws : 0;
  const early = outMin != null && outMin < we - shift!.earlyGraceMinutes ? we - outMin : 0;
  let worked = 0;
  if (inMin != null && outMin != null && outMin > inMin) {
    worked = Math.max(0, Math.min(outMin, e) - Math.max(inMin, s));
    if (shift!.breakStart && shift!.breakEnd) {
      const bs = minutesOf(shift!.breakStart), be = minutesOf(shift!.breakEnd);
      worked -= Math.max(0, Math.min(outMin, e, be) - Math.max(inMin, s, bs));
    }
  }
  if (i.date === i.today) {
    /* Hôm nay chưa kết thúc: chỉ báo đi muộn, chưa coi là thiếu */
    return { ...base, kind: "today", lateMinutes: late, earlyMinutes: 0, workedMinutes: worked, credit: 0, issue: late ? "late" : null, workday, leave };
  }
  const issue: DayIssue | null = inMin == null && outMin == null ? "absent" : inMin == null ? "missing_in" : outMin == null ? "missing_out"
    : late && early ? "late_early" : late ? "late" : early ? "early" : null;
  /* Nghỉ nửa ngày: nửa nghỉ có lương 0,5 công, nửa còn lại phải chấm đủ vào/ra */
  const credit = leave ? (leave.paid ? 0.5 : 0) + (inMin != null && outMin != null ? 0.5 : 0) : inMin != null && outMin != null ? 1 : 0;
  return { ...base, kind: "work", lateMinutes: late, earlyMinutes: early, workedMinutes: worked, credit, issue, workday, leave };
}

/* Hạn giải trình: ngày làm việc thứ N sau ngày phát sinh (bỏ ngày nghỉ theo ca và ngày lễ) */
export function explainDeadline(date: string, deadlineDays: number, isWorkday: (d: string) => boolean): string {
  let d = date, n = 0;
  for (let guard = 0; n < deadlineDays && guard < 60; guard++) { d = addDays(d, 1); if (isWorkday(d)) n++; }
  return d;
}

export function summarize(days: TimesheetDay[]): TimesheetSummary {
  const work = days.filter((d) => d.kind === "work" || d.kind === "today");
  const open = (d: TimesheetDay) => !d.request || d.request.status === "rejected" || d.request.status === "cancelled";
  return {
    credited: days.reduce((n, d) => n + d.credit, 0),
    /* Ngày làm việc theo ca trong kỳ (không gồm ngày nghỉ/lễ, kể cả ngày chưa tới) */
    standard: days.filter((d) => d.workday).length,
    lateDays: work.filter((d) => d.lateMinutes > 0).length,
    lateMinutes: work.reduce((n, d) => n + d.lateMinutes, 0),
    earlyDays: work.filter((d) => d.earlyMinutes > 0).length,
    missingDays: work.filter((d) => (d.issue === "missing_in" || d.issue === "missing_out" || d.issue === "absent") && open(d)).length,
    pendingRequests: days.filter((d) => d.request?.status === "pending").length,
    leaveDays: days.reduce((n, d) => n + (d.leave ? (d.leave.half === "full" ? 1 : 0.5) : 0), 0),
    overtimeMinutes: days.reduce((n, d) => n + (d.overtime?.minutes ?? 0), 0),
    overtimeApprovedMinutes: days.reduce((n, d) => n + (d.overtime?.approvedMinutes ?? 0), 0),
    overtimeShortDays: days.filter((d) => overtimeShort(d)).length,
  };
}

/* Ngày đã qua có OT đã duyệt nhưng giờ chấm công không phủ hết */
export const overtimeShort = (d: Pick<TimesheetDay, "overtime">) => !!d.overtime?.checked && d.overtime.minutes < d.overtime.approvedMinutes;

export const periodView = (month: string, startDay: number, lock: { locked_at: string } | null): TimesheetPeriod =>
  ({ month, ...periodOf(month, startDay), locked: !!lock, lockedAt: lock?.locked_at ?? null });
