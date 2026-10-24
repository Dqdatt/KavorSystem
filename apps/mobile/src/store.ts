/* State + router + actions: port 1:1 từ phần script của Kavor HRM Prototype.html.
   Màn hình đọc trực tiếp từ S; mọi thay đổi gọi emit()/render() để App vẽ lại. */
import { AppState, Linking, Vibration } from "react-native";
import appJson from "../app.json";
import {
  ADV_DAY, LV_DAYS, advLimit, dec, dur, hm, lvKey, pad, toMin, vnd, wdOct, WD,
  type Approval, type MyReq, type OctDay,
} from "./data";
import type { IllusKind } from "./illus";
import { api, type Snapshot } from "./api";
import { authenticate, biometricLabel, clearQuickLogin, clearSession, loadBioPrefs, loadSession, loadSupport, quickLoginEmployee, quickRefreshToken, saveBioPrefs, saveSession, saveSupport, type BioPrefs } from "./auth";
import { ApiError, REMOTE, attendanceApi, authApi, companyApi, isNetworkError, setTokenSource, timesheetApi } from "./api/http";
import { MY_REQ_INIT, SUPPORT_SAMPLE } from "./api/mock-data";
import {
  EXPLANATION_KINDS, distanceMeters, passwordProblems,
  type AttendanceEvent, type AttendanceToday, type AuthResult, type ExplanationKind, type MyCompany, type MyTimesheet, type RequestItem, type SupportContact, type TimesheetDay, type WorkLocation,
} from "@kavor/contracts";
import { currentFix, deviceRegistration, deviceSummary, enqueue, flushQueue, installationId, LocationError, newEventId, quietFix, readQueue, type Fix } from "./attendance";

export type Anim = "push" | "pop" | "fade";
export type Route =
  | "login" | "forgot" | "forgotOtp" | "resetPassword" | "activate" | "otp" | "device"
  | "home" | "attendance" | "requests" | "news" | "clock" | "explain" | "leave" | "leaveNew"
  | "payslips" | "payslip" | "advance" | "advanceNew" | "advanceDetail" | "reqDetail" | "approvalDetail"
  | "ot" | "newsDetail" | "profile" | "security" | "notifications" | "widgetGuide" | "springHome" | "springLock" | "done" | "err" | "consent";
export type ErrKind = "offline" | "server" | "maintenance" | "session" | "disabled" | "device" | "devicePending" | "locPerm" | "gpsOff" | "update";
export type SheetKind =
  | "pin" | "face" | "receipt" | "help" | "netSend" | "netPunch" | "earlyOut" | "slowCheck" | "blocked" | "day"
  | "askPay" | "advExplain" | "advReview" | "advCancel" | "cancelAsk" | "rejectAsk" | "bulkResult" | "editProfile" | "logoutAsk" | "queued";

type Done = { illus: IllusKind; title: string; text: string; rows?: Array<[string, string]>; primary: [string, Route] };

/* Đồng hồ mô phỏng: bắt đầu 07:58 như prototype */
export const SIM = { base: 478 * 60, start: Date.now() };
/* Bản dùng API thật: giờ thực của máy (giây tính từ 0h); máy chủ mới là nguồn giờ chấm công */
const secOfDay = (d: Date) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
export const simNow = () => (REMOTE ? secOfDay(new Date()) : SIM.base + Math.floor((Date.now() - SIM.start) / 1000));

const freshForms = () => ({
  lgId: "HD0142", lgPw: REMOTE ? "" : "demo-pass", lgPwShow: false,
  fgId: "thao.ha@haidang.vn", fgErr: false,
  otp: REMOTE ? ["", "", "", "", "", ""] : ["4", "8", "", "", "", ""],
  /* Email nhận OTP do API trả về; destination là bản đã che để hiển thị */
  otpEmail: "thao.ha@haidang.vn", otpDest: "thao.ha@haidang.vn", otpCode: "",
  newPw: "", confirmPw: "", newPwShow: false, confirmPwShow: false, resetErr: "",
  acId: "HD0142", acMail: "thao.ha@haidang.vn", acPw: "", agree: false, agreeErr: false,
  rej: "", rejErr: false, payQ: "", payChip: 1, pfPhone: "0912 345 468", pfAddr: "Tân Định, TP.HCM",
});

const fromSnapshot = (d: Snapshot) => ({
  myReq: d.myRequests as MyReq[],
  approvals: d.approvals as Approval[],
  oct: d.timesheet as OctDay[],
  payslips: d.payslips,
  news: d.news,
});

/* Gửi giải trình thật: loại theo bất thường của ngày, giờ đề nghị gắn vào giờ vào hoặc giờ ra tương ứng */
function exSubmitRemote() {
  const date = S.exDay, d = date ? tsDay(date) : undefined;
  if (!date || !d) { toast("Chọn ngày cần giải trình"); return; }
  const t = S.ex.type;
  const kind: ExplanationKind = t === "in" ? (d.issue === "late" || d.issue === "late_early" ? "late" : "missing_in") : t === "out" ? (d.issue === "early" || d.issue === "late_early" ? "early" : "missing_out") : (t as ExplanationKind);
  const time = hm(S.ex.time * 60);
  const outSide = t === "out" || (t !== "in" && (d.issue === "missing_out" || d.issue === "early"));
  const both = t !== "in" && t !== "out" && d.issue === "absent" && d.shift;
  const body = { workDate: date, kind, reason: S.ex.reason.trim(),
    clockIn: both ? d.shift!.start : outSide ? null : time, clockOut: both ? d.shift!.end : outSide ? time : null };
  remote("exSubmit", async () => {
    const r = await timesheetApi.explain(body);
    const step = r.steps.find((x) => x.status === "pending");
    S.ex = { ...S.ex, reason: "", file: null, err: false }; S.exDay = null;
    await Promise.all([loadTimesheet(S.ts?.period.month), loadRequests()]);
    S.done = { illus: "explain", title: "Đã gửi yêu cầu giải trình", text: `${step?.resolver === "hr" ? "Phòng Nhân sự" : step?.assignee ?? "Người duyệt"} sẽ nhận thông báo để duyệt. Bạn còn ${explainLeft()}/${S.explainLimit} lượt trong kỳ này.`,
      rows: [["Mã đơn", r.no], ["Hạn duyệt", step?.dueAt ? stamp(step.dueAt) : "—"]], primary: ["Xem đơn của tôi", "requests"] };
    S.stack = ["done"]; render("push");
  });
}

/* Gửi thay đổi lên lớp dữ liệu; giao diện đã cập nhật lạc quan nên chỉ báo khi lỗi */
function sync(p: Promise<void>) {
  p.catch(() => toast("Chưa đồng bộ được với máy chủ. Kavor sẽ thử lại khi có mạng."));
}

const makeState = () => ({
  role: "staff" as "staff" | "manager", inRange: true, shift: "fixed" as "fixed" | "flex", contract: "official" as "official" | "probation" | "leaving",
  /* Ca áp dụng (phút trong ngày). Bản dùng API lấy từ /me/attendance/today — HR cấu hình theo tầng trên web;
     bản mẫu giữ ca của prototype. assigned=false: nhân viên chưa được áp dụng ca nào. */
  sh: { name: "Ca hành chính", start: 480, end: 1020, breakMin: 60, lateGrace: 0, earlyGrace: 0, assigned: true },
  clockIn: null as number | null, clockOut: null as number | null,
  stack: ["login"] as Route[], param: null as string | null, pinUntil: 0, pin: "", pinOk: null as null | (() => void),
  quickOpen: false,
  explainUsed: 1, explainLimit: 3,
  ex: { date: 15, type: "in", time: 478, reason: "", file: null as string | null, err: false },
  lv: { type: "annual", from: null as number | null, to: null as number | null, half: "full", reason: "", err: "" },
  ot: { date: 16, from: 1050, to: 1170, reason: "" },
  leave: { granted: 12, carry: 2, used: 4, pending: 0.5 },
  advance: null as null | { id: string; amount: number; step: number; created: string; reason: string },
  advAmt: 2000000, advReason: "",
  reqTab: "mine" as "mine" | "approve", reqFilter: "all", selectMode: false, sel: new Set<string>(),
  net: "online" as "online" | "offline" | "slow", netWas: "online", err: null as null | { kind: ErrKind; retry?: Route; over?: { t: string; p: string } },
  retry: null as null | (() => void), slowOk: false, newsCat: "all", hideMoney: false, widgetState: "idle" as "idle" | "busy" | "ok",
  done: null as Done | null, justPunched: false, attFilter: "all" as "all" | "late" | "miss", ncIdx: 0,
  ...fromSnapshot(api.cached()),
  /* Thông tin công ty (bản dùng API): thương hiệu, liên hệ HR, điều khoản dữ liệu cá nhân. coverSrc: ảnh bìa kèm header đăng nhập */
  company: null as MyCompany | null,
  supportCache: null as SupportContact | null,
  coverSrc: null as null | { uri: string; headers: Record<string, string> },
  afterConsent: null as Route | null,
  /* Bảng công + đơn giải trình (bản dùng API). reqItems: đơn thật theo số đơn (GT-0001) để màn chi tiết/duyệt dùng */
  ts: null as MyTimesheet | null,
  reqItems: new Map<string, RequestItem>(),
  exDay: null as string | null,
  f: freshForms(),
  /* UI */
  nav: { seq: 0, anim: null as Anim | null },
  sheet: null as null | { kind: SheetKind; arg?: string; id: number },
  sheetShow: false, sheetTok: 0,
  toast: null as null | { msg: string; id: number },
  spin: null as string | null,
  shake: { key: "", n: 0 },
  leavingCard: null as string | null,
  notifShow: false,
  bio: { login: true, unlock: true } as BioPrefs,
  bioLabel: "Face ID",
  /* Chấm công: giá trị mặc định là dữ liệu mẫu của prototype; bản API thật ghi đè bằng địa điểm/khoảng cách thật */
  att: {
    loc: { id: "", name: "Văn phòng Quận 1", address: "12 Nguyễn Huệ", latitude: 0, longitude: 0, radiusM: 3, maxAccuracyM: 60 } as WorkLocation,
    distM: null as number | null, accM: null as number | null,
    device: "iPhone 15", last: null as AttendanceEvent | null, queued: 0,
  },
});
export const S = makeState();

/* Đưa toàn bộ dữ liệu mẫu về trạng thái ban đầu (dùng cho QA/chụp so sánh) */
/* Tăng mỗi lần reset để các hẹn giờ của trạng thái cũ tự hủy */
let epoch = 0;
export function resetAll() {
  epoch++;
  const seq = S.nav.seq;
  Object.assign(S, makeState());
  S.nav = { seq, anim: null };
  SIM.base = 478 * 60; SIM.start = Date.now();
}
export const scrollRequests = new Set<(y: number) => void>();

/* ---------- pub/sub ---------- */
const listeners = new Set<() => void>();
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
let version = 0;
export const getVersion = () => version;
export function emit() { version++; listeners.forEach((l) => l()); }

/* ---------- derived ---------- */
export const day = (d: number) => S.oct.find((o) => o.d === d);
export const shiftLabel = () => (!S.sh.assigned ? "Chưa được xếp ca" : S.shift === "fixed" ? S.sh.name : "Ca linh hoạt");
export const shiftTime = () => (!S.sh.assigned ? "Liên hệ phòng Nhân sự" : S.shift === "fixed" ? `${hm(S.sh.start * 60)} – ${hm(S.sh.end * 60)}` : "8 giờ, 07:00 – 19:00");
/* Số phút làm việc của ca (trừ nghỉ giữa ca) */
export const shiftMinutes = () => Math.max(0, S.sh.end - S.sh.start - S.sh.breakMin);
/* Khoảng cách kiểu Việt: 1,8 m · 126 m · 1,2 km */
export const fmtM = (m: number) => (m >= 1000 ? `${dec(Math.round(m / 100) / 10)}\u00A0km` : m >= 100 ? `${Math.round(m)}\u00A0m` : `${dec(Math.round(m * 10) / 10)}\u00A0m`);
export const phase = () => (!S.clockIn ? "in" : !S.clockOut ? "out" : "done");
export const worked = () => (S.clockIn ? Math.max(0, Math.floor(((S.clockOut || simNow()) - S.clockIn) / 60)) : null);
export function verdict(kind: "in" | "out", t: number): [string, "ok" | "warn"] {
  const m = Math.floor(t / 60);
  if (!S.sh.assigned) return ["Đã ghi nhận", "ok"];
  if (S.shift === "flex") { if (kind === "in") return ["Đã ghi nhận", "ok"]; const w = worked() ?? 0, need = shiftMinutes(); return w >= need ? [`Đủ ${dur(need)}`, "ok"] : [`Thiếu ${dur(need - w)}`, "warn"]; }
  if (kind === "in") { const l = m - S.sh.start; return l > S.sh.lateGrace ? [`Muộn ${dur(l)}`, "warn"] : ["Đúng giờ", "ok"]; }
  const e = S.sh.end - m; return e > S.sh.earlyGrace ? [`Về sớm ${dur(e)}`, "warn"] : ["Đủ giờ", "ok"];
}
export const explainLeft = () => S.explainLimit - S.explainUsed;

/* Bản dùng API: chọn ngày theo bất thường thật; vắng cả ngày chỉ giải trình theo lý do (ghi nhận giờ ca), giờ đề nghị mặc định là giờ ca */
export function exPick(date: string) {
  const d = tsDay(date); S.exDay = date;
  const out = d?.issue === "missing_out" || d?.issue === "early";
  S.ex.type = d?.issue === "absent" ? "other" : out ? "out" : "in";
  S.ex.time = d?.shift ? toMin(out ? d.shift.end : d.shift.start) : out ? S.sh.end : S.sh.start;
}

/* ---------- bảng công + giải trình thật (REMOTE) ---------- */
export const WD_ISO = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
export const WD_ISO_FULL = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
export const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export const issueText = (d: TimesheetDay) => d.issue === "missing_in" ? "thiếu giờ vào" : d.issue === "missing_out" ? "thiếu giờ ra" : d.issue === "absent" ? "không chấm công"
  : d.issue === "late" ? `muộn ${d.lateMinutes} phút` : d.issue === "early" ? `về sớm ${d.earlyMinutes} phút` : d.issue === "late_early" ? `muộn ${d.lateMinutes}, sớm ${d.earlyMinutes} phút` : "";
const isoWeekday = (date: string) => { const w = new Date(`${date}T12:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
export const stamp = (iso: string) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const initialsOf = (name: string) => { const p = name.trim().split(/\s+/); return ((p.length > 1 ? p[0]![0]! : "") + p[p.length - 1]![0]!).toUpperCase(); };
export const reqSub = (r: RequestItem) => `${r.workDate ? `${WD_ISO[isoWeekday(r.workDate)]} ${ddmm(r.workDate)} · ` : ""}${EXPLANATION_KINDS[r.payload.kind].toLowerCase()}`;
export const tsDay = (date: string) => S.ts?.days.find((d) => d.date === date);
/* Ngày còn giải trình được có hạn gần nhất (bản dùng API) — cho thông báo ở Trang chủ và menu tạo đơn */
export function explainDue(): { date: string; deadline: string; daysLeft: number; issue: string } | null {
  const t = S.ts; if (!t?.explanation || t.period.locked) return null;
  const d = t.days.filter((x) => x.canExplain && x.explainDeadline).sort((a, b) => a.explainDeadline!.localeCompare(b.explainDeadline!))[0];
  if (!d) return null;
  const now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return { date: d.date, deadline: d.explainDeadline!, daysLeft: Math.max(0, Math.round((Date.parse(`${d.explainDeadline}T00:00:00Z`) - today) / 86_400_000)), issue: issueText(d) };
}
/* Tháng kỳ công: "2026-10" → "Tháng 10, 2026" */
export const monthTitle = (m: string) => `Tháng ${Number(m.slice(5))}, ${m.slice(0, 4)}`;
const MOCK_REQ_IDS = new Set(MY_REQ_INIT.map((r) => r.id));

export async function loadTimesheet(month?: string, manual = false) {
  if (!REMOTE || !isLoggedIn() || S.stack[0] === "consent") return;
  try {
    const t = await timesheetApi.get(month);
    S.ts = t;
    if (t.explanation) { S.explainLimit = t.explanation.limit; S.explainUsed = t.explanation.used; }
    emit();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) showErr("session");
    else if (manual) toast(e instanceof ApiError ? e.message : "Chưa tải được bảng công.");
  }
}

/* Đơn của tôi + đơn cần tôi duyệt. Đơn nghỉ/OT/tạm ứng của prototype chưa có máy chủ: giữ đơn tạo trong phiên, bỏ đơn mẫu. */
export async function loadRequests() {
  if (!REMOTE || !isLoggedIn() || S.stack[0] === "consent") return;
  try {
    const [mine, ap] = await Promise.all([timesheetApi.mine(), timesheetApi.approvals()]);
    S.reqItems = new Map([...mine, ...ap.items].map((r) => [r.no, r]));
    const local = S.myReq.filter((r) => r.type !== "explain" && !MOCK_REQ_IDS.has(r.id));
    S.myReq = [...mine.map((r) => ({
      id: r.no, type: "explain" as const, title: "Giải trình công", sub: reqSub(r), status: r.status, created: stamp(r.submittedAt), reason: r.payload.reason,
      note: r.steps.find((x) => x.status === "rejected")?.comment ?? undefined,
    })), ...local];
    S.approvals = ap.items.map((r) => ({
      id: r.no, who: r.requester.fullName, ini: initialsOf(r.requester.fullName), role: r.requester.department ?? "", type: "explain" as const, title: "Giải trình công",
      sub: reqSub(r), reason: r.payload.reason, created: stamp(r.submittedAt),
      ctx: r.day ? `Chấm công gốc: vào ${r.day.rawIn ?? "--:--"} · ra ${r.day.rawOut ?? "--:--"}` : "",
    }));
    S.role = ap.canApprove ? "manager" : "staff";
    emit();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) showErr("session");
  }
}
const refreshWork = () => { void loadTimesheet(S.ts?.period.month); void loadRequests(); };
export const lvAvail = () => S.leave.granted + S.leave.carry - S.leave.used - S.leave.pending;
export const pendingCount = () => (S.role === "manager" ? S.approvals.length : 0);
export function advEligible(): [string, string] | null {
  if (S.contract === "probation") return ["Chưa áp dụng cho nhân viên thử việc", "Bạn có thể tạm ứng sau khi ký hợp đồng chính thức."];
  if (S.contract === "leaving") return ["Không áp dụng trong thời gian báo trước nghỉ việc", "Lương cuối được thanh toán đủ theo quy trình nghỉ việc."];
  return null;
}
export const money = (n: number) => (S.hideMoney ? "••••••• ₫" : vnd(n));
export function lvCount() {
  const v = S.lv; if (v.from == null) return 0; const to = v.to ?? v.from; let n = 0;
  LV_DAYS.forEach((x) => { const k = lvKey(x); if (k >= v.from! && k <= to && x.wd !== 0 && x.wd !== 6) n++; });
  return n === 1 && v.half !== "full" ? 0.5 : n;
}
export function dayInfo(o: OctDay) {
  const fixed = S.shift === "fixed";
  if (o.today) return { in: S.clockIn ? hm(S.clockIn) : null, out: S.clockOut ? hm(S.clockOut) : null, hrs: worked(),
    note: (S.clockIn ? (S.clockOut ? ["Đã xong ca", "ok"] : ["Đang trong ca", "ok"]) : ["Chưa chấm công hôm nay", "mute"]) as [string, string], inOk: true, outOk: true, flagIn: false, flagOut: false, issue: false, leave: false };
  if (o.leave) return { leave: true, in: null, out: null, hrs: null, note: null, inOk: true, outOk: true, flagIn: false, flagOut: false, issue: false };
  if (!o.in || !o.out) {
    const note: [string, string] = o.explained ? [`Đã điều chỉnh theo ${o.explained}`, "ok"] : o.pendingEx ? ["Giải trình đang chờ duyệt", "warn"] : [!o.in ? "Thiếu giờ vào" : "Thiếu giờ ra", "bad"];
    return { leave: false, in: o.in ?? null, out: o.out || (o.explained ? o.fix! : null), hrs: o.explained ? toMin(o.fix!) - toMin(o.in!) - S.sh.breakMin : null, note,
      issue: !o.explained && !o.pendingEx, inOk: !!o.in, outOk: !!o.out || !!o.explained, flagIn: !o.in, flagOut: !o.out && !o.explained };
  }
  const l = toMin(o.in) - S.sh.start, e = S.sh.end - toMin(o.out), hrs = toMin(o.out) - toMin(o.in) - S.sh.breakMin;
  return { leave: false, in: o.in, out: o.out, hrs, inOk: !(fixed && l > 0), outOk: !(fixed && e > 0), flagIn: fixed && l > 0, flagOut: false, issue: false,
    note: (o.ot ? [o.ot, "mute"] : fixed && l > 0 ? [`Muộn ${l} phút`, "bad"] : fixed && e > 0 ? [`Về sớm ${e} phút`, "bad"] : null) as [string, string] | null };
}

/* ---------- router ---------- */
export const TABS: Route[] = ["home", "attendance", "requests", "news"];
const GATED: Partial<Record<Route, 1>> = { payslips: 1, payslip: 1, advance: 1, advanceNew: 1, advanceDetail: 1 };
const NEEDNET = GATED;
export const SKEL: Route[] = ["home", "attendance", "requests", "news", "payslips", "leave", "advance", "notifications"];
export const cur = (): Route => S.stack[S.stack.length - 1] ?? "home";

export function render(anim?: Anim) {
  if (anim) S.nav = { seq: S.nav.seq + 1, anim };
  S.justPunched = S.justPunched && !anim;
  emit();
}

export function go(r: Route) {
  closeSheet();
  if (S.net === "offline" && NEEDNET[r]) { S.err = { kind: "offline", retry: r, over: { t: "Cần kết nối để xem", p: "Phiếu lương và tạm ứng không lưu trên máy vì lý do bảo mật. Kết nối mạng rồi thử lại." } }; S.stack.push("err"); render("push"); return; }
  if (GATED[r] && Date.now() > S.pinUntil) { openPin(() => { S.stack.push(r); render("push"); }); return; }
  S.stack.push(r); render("push");
}
export function back() { closeSheet(); if (S.stack.length > 1) { S.stack.pop(); render("pop"); } }
export const scrollTopRequests = new Set<() => void>();
export function tab(r: Route) {
  closeSheet(); S.selectMode = false; S.sel.clear();
  if (cur() === r && S.stack.length === 1) { scrollTopRequests.forEach((f) => f()); return; }
  S.stack = [r]; render("fade");
  if (r === "attendance") void loadTimesheet(S.ts?.period.month);
  if (r === "requests") void loadRequests();
}
export function jump(r: string) {
  closeSheet(true); quickClose();
  if (r === "login") { S.stack = ["login"]; render("fade"); return; }
  if (r === "approve") { S.role = "manager"; S.reqTab = "approve"; S.stack = ["requests"]; render("fade"); return; }
  if (r === "requests") S.reqTab = "mine";
  if (TABS.includes(r as Route)) { S.stack = [r as Route]; render("fade"); return; }
  if (r === "springHome" || r === "springLock") { S.widgetState = "idle"; S.stack = ["home", r]; render("fade"); return; }
  S.stack = ["home"]; render("fade"); go(r as Route);
}

/* ---------- sheet / toast / spin / shake ---------- */
let sheetSeq = 0;
export function openSheet(kind: SheetKind, arg?: string) { S.sheetTok++; S.sheet = { kind, arg, id: ++sheetSeq }; S.sheetShow = true; emit(); }
export function closeSheet(instant?: boolean) {
  if (!S.sheet) return;
  S.sheetShow = false; const t = ++S.sheetTok;
  if (instant) { S.sheet = null; emit(); return; }
  emit();
  setTimeout(() => { if (t === S.sheetTok) { S.sheet = null; emit(); } }, 360);
}
let toastSeq = 0;
export function toast(msg: string) { S.toast = { msg, id: ++toastSeq }; emit(); }
export function spin(key: string, ms: number, done: () => void) {
  S.spin = key; emit();
  setTimeout(() => { if (S.spin === key) S.spin = null; done(); emit(); }, ms);
}
export function shake(key: string) { S.shake = { key, n: S.shake.n + 1 }; emit(); }

export function openPin(ok: () => void) { S.pin = ""; S.pinOk = ok; openSheet("pin"); }
/* Lưu phiên vào Keychain; thiết bị đã đăng ký thì vào thẳng trang chủ, chưa thì sang bước đăng ký.
   Công ty có điều khoản dữ liệu cá nhân mới chưa đồng ý thì hỏi trước (ADR 0001 §5). */
async function signIn(employeeId: string, result?: AuthResult) {
  const session = await saveSession({ employeeId, ...(result ? { auth: result.session, me: result.me } : {}) });
  const target: Route = session.deviceRegistered ? "home" : "device";
  if ((await loadCompany())?.privacy.required) { askConsent(target); return; }
  S.stack = [target];
  render(session.deviceRegistered ? "fade" : "push");
  if (session.deviceRegistered) { void loadToday(); refreshWork(); }
}

/* ---------- thông tin công ty (chỉ khi REMOTE; bản mẫu dùng liên hệ mẫu và ảnh bìa mặc định) ---------- */
export const support = (): SupportContact | null => (REMOTE ? S.company?.support ?? S.supportCache : SUPPORT_SAMPLE);
export async function loadCompany(): Promise<MyCompany | null> {
  if (!REMOTE) return null;
  try {
    const c = await companyApi.get();
    S.company = c; S.supportCache = c.support;
    void saveSupport(c.support);
    S.coverSrc = c.branding.coverVersion ? await companyApi.brandingSource("cover", c.branding.coverVersion) : null;
    emit();
    return c;
  } catch { return S.company; }
}
function askConsent(next: Route) {
  if (cur() === "consent") return;
  S.afterConsent = next; S.stack = ["consent"]; render("fade");
}

/* ---------- chấm công thật (chỉ chạy khi REMOTE) ---------- */
/* Access token cho API chấm công: hết hạn thì làm mới bằng refresh token rồi lưu lại */
setTokenSource(async () => {
  const sess = await loadSession();
  if (!sess?.auth) return null;
  if (sess.auth.expiresAt - 60 > Date.now() / 1000) return sess.auth.accessToken;
  const r = await authApi.refresh({ refreshToken: sess.auth.refreshToken });
  await saveSession({ employeeId: r.me.employeeCode, auth: r.session, me: r.me });
  return r.session.accessToken;
});

let locations: WorkLocation[] = [];
const accepted = (e: AttendanceEvent | null) => (e && e.status === "accepted" ? secOfDay(new Date(e.occurredAt)) : null);
/* Chọn địa điểm gần nhất và tính khoảng cách giống cách máy chủ xét (bán kính, không cộng sai số) */
function applyFix(f: Fix) {
  const near = locations.map((l) => ({ l, d: distanceMeters(f.latitude, f.longitude, l.latitude, l.longitude) })).sort((a, b) => a.d - b.d)[0];
  if (!near) return;
  S.att.loc = near.l; S.att.distM = Math.round(near.d * 10) / 10; S.att.accM = f.accuracyM;
  S.inRange = near.d <= near.l.radiusM; emit();
}
function applyToday(t: AttendanceToday) {
  locations = t.locations;
  const sh = t.shift;
  if (sh) {
    const br = sh.breakStart && sh.breakEnd ? toMin(sh.breakEnd) - toMin(sh.breakStart) : 0;
    S.sh = { name: sh.name, start: toMin(sh.start), end: toMin(sh.end), breakMin: br, lateGrace: sh.lateGraceMinutes, earlyGrace: sh.earlyGraceMinutes, assigned: true };
  } else S.sh = { ...S.sh, assigned: false };
  if (t.locations[0] && !t.locations.some((l) => l.id === S.att.loc.id)) S.att.loc = t.locations[0];
  S.clockIn = accepted(t.clockIn); S.clockOut = accepted(t.clockOut);
  S.att.device = t.device?.deviceModel ?? deviceSummary().model;
  emit();
}
const isLoggedIn = () => !["login", "forgot", "forgotOtp", "resetPassword", "activate", "otp"].includes(S.stack[0] ?? "login");

/* Lỗi chấm công → màn lỗi tương ứng của prototype (E19 chờ duyệt, E20 quyền vị trí, E21 GPS, phiên hết hạn) */
function attError(e: unknown) {
  closeSheet(true);
  if (e instanceof LocationError) { showErr(e.kind); return; }
  if (e instanceof ApiError) {
    if (e.status === 401) { showErr("session"); return; }
    if (e.code === "ATT_DEVICE_PENDING") { showErr("devicePending"); return; }
    if (e.code === "ATT_DEVICE_NOT_REGISTERED") { S.stack = ["device"]; render("fade"); toast(e.message); return; }
    if (e.code === "ATT_INVALID_SEQUENCE") void loadToday();
    toast(e.message); return;
  }
  toast("Đã có lỗi xảy ra. Vui lòng thử lại.");
}

/* Gửi các lần chấm công lưu trên máy lúc mất mạng; lỗi mạng hoặc phiên hết hạn thì giữ lại lần sau */
async function flushPunches() {
  const r = await flushQueue((p) => attendanceApi.record(p), (e) => isNetworkError(e) || (e instanceof ApiError && e.status === 401));
  S.att.queued = r.remaining;
  const ok = r.sent.length, bad = r.failed.length;
  if (ok || bad) toast(bad ? `Có ${bad} lần chấm công lưu trên máy bị từ chối: ${(r.failed[0]!.error as Error).message}` : `Đã gửi ${ok} lần chấm công lưu trên máy`);
}

/* Tải trạng thái hôm nay từ máy chủ: giờ vào/ra, địa điểm, thiết bị */
export async function loadToday() {
  if (!REMOTE || !isLoggedIn() || S.stack[0] === "consent") return;
  try {
    await flushPunches().catch(() => {});
    const t = await attendanceApi.today(await installationId());
    applyToday(t);
    if (t.device?.status === "pending") { showErr("devicePending"); return; }
    if (!t.device || t.device.status === "revoked" || t.device.status === "rejected") { await deviceLost(t.device); return; }
    const f = await quietFix();
    if (f) applyFix(f);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) showErr("session");
    else if (e instanceof ApiError && e.code === "AUTH_ACCOUNT_DISABLED") lockedErr((await loadSession())?.me?.employeeCode ?? "");
  }
}
/* HR khóa đăng nhập (bản dùng API): màn E16 với mã nhân viên thật; "Liên hệ HR" dùng liên hệ công ty đã lưu */
function lockedErr(code: string) {
  showErr("disabled", { t: "Tài khoản đang bị khóa", p: `Tài khoản${code ? ` ${code.toUpperCase()}` : ""} tạm thời bị khóa. Liên hệ phòng Nhân sự để được hỗ trợ.` });
}
/* Máy bị HR thu hồi/từ chối (hoặc chưa đăng ký): về màn đăng ký thiết bị, báo lý do HR ghi */
async function deviceLost(d: AttendanceToday["device"]) {
  const sess = await loadSession();
  if (sess) await saveSession({ employeeId: sess.employeeId, deviceRegistered: false });
  S.err = null; S.stack = ["device"]; render("fade");
  if (d && (d.status === "rejected" || d.status === "revoked")) toast(`HR đã ${d.status === "rejected" ? "từ chối" : "thu hồi"} thiết bị này${d.decisionReason ? `: ${d.decisionReason}` : ""}`);
}

/* E19 (chờ HR duyệt máy): hỏi lại máy chủ mỗi 8 giây khi app đang mở; duyệt xong tự vào trang chủ */
let pendingTimer: ReturnType<typeof setInterval> | null = null;
function stopPendingWatch() { if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; } }
function watchPending() {
  if (!REMOTE || pendingTimer) return;
  pendingTimer = setInterval(() => { void checkPending(false); }, 8000);
}
async function checkPending(manual: boolean) {
  if (S.err?.kind !== "devicePending") { stopPendingWatch(); return; }
  if (!manual && AppState.currentState !== "active") return;
  try {
    const t = await attendanceApi.today(await installationId());
    if (S.err?.kind !== "devicePending") return;
    const st = t.device?.status;
    if (st === "active") {
      stopPendingWatch(); applyToday(t);
      const sess = await loadSession();
      if (sess) await saveSession({ employeeId: sess.employeeId, deviceRegistered: true });
      S.err = null; S.stack = ["home"]; render("fade"); toast("HR đã duyệt thiết bị này · bạn có thể chấm công");
      void loadToday();
    } else if (st !== "pending") { stopPendingWatch(); await deviceLost(t.device); }
    else if (manual) toast("Chưa có thay đổi. HR sẽ xử lý trong giờ hành chính.");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { stopPendingWatch(); showErr("session"); }
    else if (manual) toast(e instanceof ApiError ? e.message : "Chưa kiểm tra được. Thử lại sau.");
  }
}

/* Mở lại app từ nền: đồng bộ hàng đợi và trạng thái hôm nay */
if (REMOTE) AppState.addEventListener("change", (st) => {
  if (st !== "active") return;
  void loadToday();
  if (isLoggedIn()) refreshWork();
  /* HR công bố điều khoản mới trong lúc app chạy nền → hỏi đồng ý ở lần mở kế tiếp */
  if (isLoggedIn()) void loadCompany().then((c) => { if (c?.privacy.required) askConsent(cur() === "device" ? "device" : "home"); });
});

async function punchRemote(kind: "in" | "out") {
  const e0 = epoch;
  S.spin = "punch"; emit();
  /* Chờ lâu (GPS hoặc mạng chậm) thì hiện bảng "Đang gửi…" để người dùng không bấm lại */
  let slow: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await currentFix(true);
    applyFix(fix);
    slow = setTimeout(() => { if (e0 === epoch) openSheet("slowCheck"); }, 1500);
    const req = { clientEventId: newEventId(), kind, installationId: await installationId(), latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM };
    let ev: AttendanceEvent;
    try {
      ev = await attendanceApi.record(req);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      /* Mất mạng: lưu kèm giờ trên máy, máy chủ kiểm tra lại khi gửi (quá 24 giờ sẽ bị từ chối) */
      await enqueue({ ...req, offline: true, occurredAt: new Date().toISOString() });
      S.att.queued = (await readQueue()).length;
      const t = simNow();
      if (kind === "in") S.clockIn = t; else S.clockOut = t;
      closeSheet(true); openSheet("queued", `${kind}:${t}`); return;
    }
    S.att.last = ev; closeSheet(true);
    if (ev.status === "rejected") {
      if (ev.rejectReason === "out_of_range") { S.inRange = false; if (ev.distanceM != null) S.att.distM = ev.distanceM; openSheet("blocked"); }
      else toast(`GPS chưa đủ chính xác (±${Math.round(ev.accuracyM ?? fix.accuracyM)} m, cần ≤ ${S.att.loc.maxAccuracyM} m). Ra chỗ thoáng rồi thử lại.`);
      emit(); return;
    }
    const t = secOfDay(new Date(ev.occurredAt));
    if (kind === "in") S.clockIn = t; else S.clockOut = t;
    S.inRange = true;
    Vibration.vibrate(30);
    S.justPunched = true; emit(); openSheet("receipt", `${kind}:${t}`);
    setTimeout(() => { S.justPunched = false; }, 900);
  } catch (e) {
    attError(e);
  } finally {
    clearTimeout(slow);
    if (S.spin === "punch") S.spin = null;
    emit();
  }
}

/* Chạy thao tác gọi API với spinner trên nút `key`; lỗi hiển thị bằng toast (onError trả true nếu đã tự xử lý) */
function remote(key: string, fn: () => Promise<void>, onError?: (e: ApiError) => boolean) {
  S.spin = key; emit();
  fn().catch((e: unknown) => {
    const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Đã có lỗi xảy ra. Vui lòng thử lại.", 0);
    if (!onError?.(err)) toast(err.message);
  }).finally(() => { if (S.spin === key) S.spin = null; emit(); });
}

/* Bật/tắt Face ID: bật lại cần xác thực sinh trắc học một lần để chắc chắn đúng chủ máy */
export async function setBioPref(key: keyof BioPrefs, on: boolean) {
  if (on) {
    const r = await authenticate(`Bật ${S.bioLabel} cho Kavor`);
    if (!r.ok) { if (r.reason !== "cancelled") toast(r.message); return; }
  }
  S.bio = { ...S.bio, [key]: on }; emit();
  await saveBioPrefs(S.bio);
  if (key === "login" && !on) await clearQuickLogin();
  toast(`Đã ${on ? "bật" : "tắt"} ${key === "login" ? "đăng nhập" : "mở khóa lương/tạm ứng"} bằng ${S.bioLabel}`);
}

/* Mở app: còn phiên hợp lệ thì bỏ qua màn đăng nhập */
export async function restoreSession() {
  S.bio = await loadBioPrefs();
  if (REMOTE) S.supportCache = await loadSupport();
  S.bioLabel = await biometricLabel().then((l) => (l === "vân tay" ? "vân tay" : l === "Face ID" ? "Face ID" : "sinh trắc học"));
  const session = await loadSession();
  if (!session) return;
  if (REMOTE) {
    /* Access token hết hạn thì làm mới bằng refresh token; không làm mới được thì quay về đăng nhập */
    if (!session.auth) { await clearSession(); return; }
    if (session.auth.expiresAt - 60 < Date.now() / 1000) {
      try {
        const r = await authApi.refresh({ refreshToken: session.auth.refreshToken });
        await saveSession({ employeeId: r.me.employeeCode, auth: r.session, me: r.me });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { await clearSession(); toast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."); return; }
        /* Mất mạng: vẫn vào app bằng phiên cũ, các thao tác cần mạng sẽ báo lỗi riêng */
      }
    }
  }
  Object.assign(S, fromSnapshot(await api.refresh().catch(() => api.cached())));
  const target: Route = session.deviceRegistered ? "home" : "device";
  if ((await loadCompany())?.privacy.required) { askConsent(target); return; }
  S.stack = [target]; render();
  if (session.deviceRegistered) { void loadToday(); refreshWork(); }
}

function pinSuccess() { S.pinUntil = Date.now() + 5 * 60 * 1000; const f = S.pinOk; S.pinOk = null; closeSheet(); f && f(); }

export function quickOpen() { S.quickOpen = true; emit(); }
export function quickClose() { if (!S.quickOpen) return; S.quickOpen = false; emit(); }

export function showErr(kind: ErrKind, over?: { t: string; p: string }) {
  closeSheet(true); quickClose(); S.err = { kind, ...(over ? { over } : {}) };
  if (kind === "devicePending") watchPending();
  S.stack = ["maintenance", "session", "disabled", "update"].includes(kind) ? ["err"] : ["home", "err"]; render("fade");
}

function needNet(retry: () => void) {
  if (S.net !== "offline") return true;
  S.retry = retry; openSheet("netSend"); return false;
}
export function setNet(v: "online" | "offline" | "slow") {
  const was = S.net; S.net = v; S.netWas = was;
  if (v === "online" && was !== "online") toast(was === "offline" ? "Đã kết nối lại · dữ liệu đã cập nhật" : "Mạng ổn định");
  emit();
}

/* ---------- hold-to-punch ---------- */
export function holdDone() {
  if (S.net === "offline") { openSheet("netPunch"); return; }
  if (phase() === "out" && S.shift === "fixed" && S.sh.assigned) {
    const m = Math.floor(simNow() / 60);
    if (S.sh.end - m > S.sh.earlyGrace) { openSheet("earlyOut"); return; }
  }
  ACT.punchGo();
}

/* ---------- actions (tên giữ như data-act của prototype) ---------- */
export const ACT = {
  toast: (a: string) => toast(a),
  retrySend: () => spin("retrySend", 900, () => { if (S.net === "offline") { shake("sheet"); toast("Vẫn chưa có mạng"); return; } closeSheet(true); const f = S.retry; S.retry = null; f && f(); }),
  retryPunch: () => spin("retryPunch", 900, () => { if (S.net === "offline") { shake("sheet"); toast("Vẫn chưa có mạng"); return; } closeSheet(true); holdDone(); }),
  errRetry: () => {
    const k = S.err?.kind;
    /* Bản thật: lấy lại vị trí; được thì về màn chấm công */
    if (REMOTE && (k === "gpsOff" || k === "locPerm")) {
      remote("errRetry", async () => { const f = await currentFix(true); applyFix(f); S.err = null; S.stack = ["home", "clock"]; render("fade"); toast(`Đã lấy được vị trí · ±${Math.round(f.accuracyM)} m`); },
        () => { shake("err"); toast("Vẫn chưa lấy được vị trí"); return true; });
      return;
    }
    ACT._errRetry();
  },
  _errRetry: () => spin("errRetry", 900, () => {
    const k = S.err?.kind;
    if (k === "offline" && S.net === "offline") { shake("err"); toast("Vẫn chưa có mạng"); return; }
    const target = S.err?.retry; S.err = null;
    if (target) { S.stack.pop(); go(target); return; }
    S.stack = ["home"]; render("fade"); toast(k === "gpsOff" ? "Đã lấy được vị trí · ±2 m" : k === "server" ? "Hệ thống đã hoạt động lại" : "Đã kết nối lại");
  }),
  errClose: () => { S.err = null; if (S.stack.length > 1) { S.stack.pop(); render("pop"); } else { S.stack = ["home"]; render("fade"); } },
  errHR: () => {
    const s = support();
    /* Mỗi ý một dòng ngắn để toast không ngắt giữa cụm từ; số điện thoại dùng khoảng trắng không ngắt */
    const keep = (t: string) => t.replace(/ /g, "\u00A0");
    const lines = s ? [s.phone ? `Phòng Nhân sự: ${keep(s.phone)}` : "Phòng Nhân sự", s.email, s.hours ? `Giờ hỗ trợ: ${s.hours}` : null].filter(Boolean) : [];
    toast(s && (s.phone || s.email) ? lines.join("\n") : "Liên hệ phòng Nhân sự của công ty để được hỗ trợ.");
  },
  /* Đồng ý điều khoản dữ liệu cá nhân mới (thiết kế bổ sung, prototype không có màn này) */
  acceptPrivacy: () => {
    const terms = S.company?.privacy.terms;
    if (!terms) return;
    remote("acceptPrivacy", async () => {
      await companyApi.consent({ termsId: terms.id, installationId: await installationId() });
      if (S.company) S.company = { ...S.company, privacy: { ...S.company.privacy, required: false, acceptedVersionNo: terms.versionNo } };
      const next = S.afterConsent ?? "home"; S.afterConsent = null;
      S.stack = [next]; render("fade"); toast(`Đã đồng ý điều khoản phiên bản ${terms.versionNo}`);
      if (next === "home") { void loadToday(); refreshWork(); }
    }, (e) => { if (e.code === "PRIVACY_TERMS_CHANGED") { toast(e.message); void loadCompany(); return true; } return false; });
  },
  errLogin: () => { void clearSession(); S.err = null; S.stack = ["login"]; render("fade"); },
  errReset: () => spin("errReset", 800, () => { S.err = { kind: "devicePending" }; render("fade"); toast("Đã gửi yêu cầu chuyển thiết bị"); }),
  errPending: () => {
    if (!REMOTE) { spin("errPending", 800, () => toast("Chưa có thay đổi. HR sẽ xử lý trong giờ hành chính.")); return; }
    remote("errPending", () => checkPending(true));
  },
  errSettings: () => {
    if (REMOTE) { void Linking.openSettings(); return; }
    toast("Mô phỏng: đã bật quyền vị trí trong Cài đặt"); setTimeout(() => ACT.errClose(), 900);
  },
  errUpdate: () => spin("errUpdate", 1200, () => { S.err = null; S.stack = ["home"]; render("fade"); toast("Đã cập nhật lên phiên bản 2.4.0"); }),
  errExplain: () => { S.err = null; S.stack = ["home"]; render("fade"); go("explain"); },
  help: () => openSheet("help", cur()),
  login: () => {
    if (!REMOTE) { spin("login", 700, () => { void signIn("HD0142"); }); return; }
    if (!S.f.lgId.trim() || !S.f.lgPw) { toast("Nhập mã nhân viên hoặc email và mật khẩu"); return; }
    remote("login", async () => { const r = await authApi.login({ identifier: S.f.lgId.trim(), password: S.f.lgPw }); S.f.lgPw = ""; await signIn(r.me.employeeCode, r); },
      (e) => { if (e.code === "AUTH_ACCOUNT_DISABLED") { S.f.lgPw = ""; lockedErr(S.f.lgId.trim()); return true; } return false; });
  },
  /* Face ID ở màn đăng nhập: dùng thông tin đăng nhập nhanh đã lưu từ lần đăng nhập mật khẩu trước */
  faceLogin: async () => {
    const employeeId = await quickLoginEmployee();
    if (!S.bio.login) { toast(`Đăng nhập bằng ${S.bioLabel} đang tắt. Bật lại trong Hồ sơ → Bảo mật và thiết bị.`); return; }
    if (!employeeId) { toast("Đăng nhập bằng mật khẩu một lần để bật đăng nhập nhanh bằng Face ID"); return; }
    const refreshToken = REMOTE ? await quickRefreshToken() : null;
    if (REMOTE && !refreshToken) { toast("Đăng nhập bằng mật khẩu một lần để bật đăng nhập nhanh bằng Face ID"); return; }
    const r = await authenticate("Đăng nhập Kavor");
    if (!r.ok) { if (r.reason !== "cancelled") toast(r.message); return; }
    if (!REMOTE) { await signIn(employeeId); return; }
    remote("login", async () => {
      try {
        const res = await authApi.refresh({ refreshToken: refreshToken! });
        await signIn(res.me.employeeCode, res);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { await clearQuickLogin(); throw new ApiError(e.code, "Phiên đăng nhập nhanh đã hết hạn. Đăng nhập bằng mật khẩu để bật lại Face ID.", 401); }
        throw e;
      }
    });
  },
  ssoLogin: () => { toast("Mở trang đăng nhập một lần (SSO) của công ty · mô phỏng"); setTimeout(() => { void signIn("HD0142"); }, 1000); },
  toActivate: () => { S.stack = ["login", "activate"]; render("push"); },
  toLogin: () => { S.stack = ["login"]; render("pop"); },
  sendResetOtp: () => {
    if (!S.f.fgId.trim()) { S.f.fgErr = true; shake("fgErr"); return; }
    if (REMOTE) {
      remote("sendResetOtp", async () => {
        const r = await authApi.forgot({ identifier: S.f.fgId.trim() });
        S.f.otpEmail = r.email ?? S.f.fgId.trim(); S.f.otpDest = r.destination ?? S.f.otpEmail; S.f.otp = ["", "", "", "", "", ""];
        S.stack.push("forgotOtp"); render("push"); toast("Đã gửi mã OTP · hiệu lực trong 5 phút");
      });
      return;
    }
    spin("sendResetOtp", 700, () => { S.stack.push("forgotOtp"); render("push"); toast("Đã gửi mã OTP · hiệu lực trong 5 phút"); });
  },
  verifyResetOtp: () => { if (S.f.otp.join("").length < 6) { toast("Vui lòng nhập đủ 6 số OTP"); return; } S.f.otpCode = S.f.otp.join(""); spin("verifyResetOtp", REMOTE ? 200 : 700, () => { S.stack.push("resetPassword"); render("push"); }); },
  resetPassword: () => {
    const p = S.f.newPw, c = S.f.confirmPw;
    const e = (REMOTE ? passwordProblems(p, S.f.lgId)[0] : p.length < 8 ? "Mật khẩu cần có ít nhất 8 ký tự." : !/[A-Za-z]/.test(p) || !/[0-9]/.test(p) ? "Mật khẩu cần có cả chữ và số." : "") || (p !== c ? "Hai mật khẩu chưa khớp." : "");
    if (e) { S.f.resetErr = e; shake("resetErr"); return; }
    if (REMOTE) {
      remote("resetPassword", async () => {
        await authApi.reset({ email: S.f.otpEmail, code: S.f.otpCode, newPassword: p });
        S.f = freshForms(); S.stack = ["login"]; render("fade"); toast("Đã đặt lại mật khẩu. Bạn có thể đăng nhập ngay.");
      }, (err) => { if (err.code === "AUTH_OTP_INVALID") { S.f.resetErr = err.message + " Quay lại để nhập mã khác."; shake("resetErr"); return true; } return false; });
      return;
    }
    spin("resetPassword", 800, () => { S.f = freshForms(); S.stack = ["login"]; render("fade"); toast("Đã đặt lại mật khẩu. Bạn có thể đăng nhập ngay."); });
  },
  activate: () => {
    if (!S.f.agree) { S.f.agreeErr = true; shake("agreeErr"); return; }
    if (REMOTE) {
      const pw = passwordProblems(S.f.acPw, S.f.acId)[0];
      if (pw) { toast(pw); return; }
      remote("activate", async () => {
        const r = await authApi.activateStart({ employeeCode: S.f.acId.trim(), email: S.f.acMail.trim() });
        S.f.otpEmail = r.email ?? S.f.acMail.trim(); S.f.otpDest = r.destination ?? S.f.otpEmail; S.f.otp = ["", "", "", "", "", ""];
        S.stack.push("otp"); render("push"); toast("Đã gửi mã OTP tới email công ty");
      });
      return;
    }
    spin("activate", 700, () => { S.stack.push("otp"); render("push"); });
  },
  verifyOtp: () => {
    if (S.f.otp.join("").length < 6) { toast("Vui lòng nhập đủ 6 số OTP"); return; }
    if (REMOTE) {
      remote("verifyOtp", async () => {
        /* Ô "Tôi đồng ý…" đã tích ở bước trước: máy chủ ghi nhận đồng ý điều khoản hiện hành của công ty */
        const r = await authApi.activateVerify({ email: S.f.otpEmail, code: S.f.otp.join(""), password: S.f.acPw, privacyAccepted: S.f.agree, installationId: await installationId() });
        toast(`Đã kích hoạt tài khoản ${r.me.employeeCode}`); S.f.acPw = "";
        await signIn(r.me.employeeCode, r);
      }, (err) => { if (err.code === "AUTH_OTP_INVALID") { S.f.otp = ["", "", "", "", "", ""]; emit(); } return false; });
      return;
    }
    spin("verifyOtp", 800, () => { toast("Đã kích hoạt tài khoản HD0142"); void signIn("HD0142"); });
  },
  resendOtp: () => {
    if (!REMOTE) { toast("Đã gửi lại mã OTP mới · hiệu lực trong 5 phút"); return; }
    const resetFlow = cur() === "forgotOtp";
    remote("resendOtp", async () => {
      if (resetFlow) await authApi.forgot({ identifier: S.f.otpEmail });
      else await authApi.activateStart({ employeeCode: S.f.acId.trim(), email: S.f.otpEmail });
      S.f.otp = ["", "", "", "", "", ""]; emit(); toast("Đã gửi lại mã OTP mới · hiệu lực trong 5 phút");
    });
  },
  registerDevice: () => {
    if (REMOTE) {
      remote("registerDevice", async () => {
        const d = await attendanceApi.registerDevice(await deviceRegistration(appJson.expo.version));
        if (d.status === "pending") { showErr("devicePending"); return; }
        const sess = await loadSession();
        if (sess) await saveSession({ employeeId: sess.employeeId, deviceRegistered: true });
        S.att.device = d.deviceModel ?? deviceSummary().model;
        S.stack = ["home"]; render("fade"); toast(`Đã đăng ký ${S.att.device} làm thiết bị chấm công`);
        void loadToday();
      }, (e) => { attError(e); return true; });
      return;
    }
    sync(api.registerDevice()); void loadSession().then((sess) => saveSession({ employeeId: sess?.employeeId ?? "HD0142", deviceRegistered: true })); S.stack = ["home"]; render("fade"); toast("Đã đăng ký iPhone 15 làm thiết bị chấm công");
  },
  quick: () => { S.quickOpen ? quickClose() : quickOpen(); },
  qgo: (a: string) => { quickClose(); if (a === "_edit") { setTimeout(() => ACT.editProfile(), 160); return; } setTimeout(() => go(a as Route), 110); },
  blockedTap: () => openSheet("blocked"),
  punchGo: () => {
    closeSheet(true);
    if (S.net === "slow" && !S.slowOk) { const e = epoch; openSheet("slowCheck"); setTimeout(() => { if (e !== epoch) return; S.slowOk = true; ACT.punchGo(); S.slowOk = false; }, 2400); return; }
    if (REMOTE) { if (S.spin !== "punch") void punchRemote(S.clockIn ? "out" : "in"); return; }
    const kind = S.clockIn ? "out" : "in", t = simNow();
    if (kind === "in") S.clockIn = t; else S.clockOut = t;
    sync(api.recordPunch({ kind, at: t }));
    Vibration.vibrate(30);
    S.justPunched = true; emit(); openSheet("receipt", `${kind}:${t}`);
    setTimeout(() => { S.justPunched = false; }, 900);
  },
  relocate: () => {
    if (REMOTE) {
      remote("relocate", async () => {
        const f = await currentFix(true); applyFix(f); closeSheet();
        const d = S.att.distM == null ? "" : ` · cách ${fmtM(S.att.distM)}`;
        toast(S.inRange ? `Đã vào vùng chấm công${d}` : `Vẫn ngoài vùng${d} (±${Math.round(f.accuracyM)} m)`);
      }, (e) => { attError(e); return true; });
      return;
    }
    S.spin = "relocate"; emit(); setTimeout(() => { S.spin = null; closeSheet(); toast("Vẫn ngoài vùng (±2 m). Đổi “Vị trí” ở bảng bên phải để thử trong vùng."); }, 800);
  },
  day: (a: string) => openSheet("day", a),
  exFromDay: (a: string) => {
    if (REMOTE) { closeSheet(true); ACT.exDate(a); go("explain"); return; }
    closeSheet(true); S.ex.date = +a; const o = day(+a)!; const late = !!o.in && toMin(o.in) > S.sh.start; S.ex.type = (!o.in || late) ? "in" : "out"; S.ex.time = late ? S.sh.start : !o.in ? S.sh.start - 2 : S.sh.end; go("explain"); },
  attFilter: (a: "all" | "late" | "miss") => { S.attFilter = a; emit(); },
  /* Chuyển kỳ công (bản dùng API) */
  tsMonth: (delta: number) => {
    const m = S.ts?.period.month; if (!m) return;
    const [y, mo] = m.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
    remote("tsMonth", () => loadTimesheet(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, true));
  },
  exDate: (a: number | string) => {
    if (typeof a === "string") {
      exPick(a); emit(); return;
    }
    S.ex.date = a; const o = day(a)!; if (!o.in) { S.ex.type = "in"; S.ex.time = S.sh.start - 2; } emit();
  },
  exType: (a: string) => {
    if (REMOTE) {
      const d = S.exDay ? tsDay(S.exDay) : undefined;
      const out = a === "out" || (a !== "in" && (d?.issue === "missing_out" || d?.issue === "early"));
      S.ex.type = a; S.ex.time = d?.shift ? toMin(out ? d.shift.end : d.shift.start) : out ? S.sh.end : S.sh.start; emit(); return;
    }
    S.ex.type = a; S.ex.time = a === "out" ? S.sh.end : S.sh.start - 2; emit();
  },
  exTime: (a: number) => { S.ex.time = Math.max(360, Math.min(1320, S.ex.time + a)); emit(); },
  exFile: () => { S.ex.file = S.ex.file ? null : "Xac-nhan-bao-ve-15-10.jpg · 1,2 MB"; emit(); },
  exSubmit: () => {
    if (!S.ex.reason.trim()) { S.ex.err = true; emit(); return; }
    if (!needNet(() => ACT.exSubmit())) return;
    if (REMOTE) { exSubmitRemote(); return; }
    const o = day(S.ex.date)!; o.pendingEx = true; S.explainUsed++;
    const id = "GT-" + pad(S.ex.date) + "10";
    const tn = ({ in: "quên chấm vào", out: "quên chấm ra", trip: "đi công tác", device: "lỗi thiết bị/GPS", other: "khác" } as Record<string, string>)[S.ex.type];
    const req: MyReq = { id, type: "explain", title: "Giải trình công", sub: `${WD[wdOct(S.ex.date)]} ${pad(S.ex.date)}/10 · ${tn}`, status: "pending", created: "16/10 " + hm(simNow()), reason: S.ex.reason };
    S.myReq.unshift(req); sync(api.submitRequest(req));
    S.ex = { date: 12, type: "in", time: 478, reason: "", file: null, err: false };
    S.done = { illus: "explain", title: "Đã gửi yêu cầu giải trình", text: `Lê Quang Huy sẽ nhận thông báo để duyệt. Bạn còn ${explainLeft()}/3 lượt trong tháng 10.`, rows: [["Mã đơn", id], ["Hạn duyệt", "22/10"]], primary: ["Xem đơn của tôi", "requests"] };
    S.stack = ["done"]; render("push");
  },
  lvType: (a: string) => { S.lv.type = a; emit(); },
  lvPick: (k: number) => {
    const v = S.lv;
    if (v.from == null || (v.to != null && v.to !== v.from)) { v.from = k; v.to = null; }
    else if (k > v.from) v.to = k; else if (k === v.from) { v.from = null; v.to = null; } else { v.from = k; v.to = null; }
    if (!(v.from != null && (v.to == null || v.to === v.from))) v.half = "full";
    v.err = ""; emit();
  },
  lvHalf: (a: string) => { S.lv.half = a; emit(); },
  lvSubmit: () => {
    const v = S.lv, n = lvCount(); if (!n) { v.err = "Chọn ít nhất một ngày nghỉ."; emit(); return; }
    if (!needNet(() => ACT.lvSubmit())) return;
    const fd = v.from! % 100, fm = Math.floor(v.from! / 100), to = v.to ?? v.from!, td = to % 100, tm = Math.floor(to / 100);
    const half = n === 0.5 ? (v.half === "am" ? " · buổi sáng" : " · buổi chiều") : "";
    const tname = ({ annual: "Nghỉ phép năm", unpaid: "Nghỉ không lương", wedding: "Nghỉ kết hôn", bereave: "Nghỉ tang chế", sick: "Nghỉ ốm (BHXH)" } as Record<string, string>)[v.type] ?? "Nghỉ phép năm";
    if (v.type === "annual") S.leave.pending += n;
    const id = "NP-" + pad(fd) + pad(fm);
    const req: MyReq = { id, type: "leave", title: tname, sub: `${pad(fd)}/${pad(fm)}${to !== v.from ? "–" + pad(td) + "/" + pad(tm) : ""}${half} · ${dec(n)} ngày`, status: "pending", created: "16/10 " + hm(simNow()), reason: v.reason || "—" };
    S.myReq.unshift(req); sync(api.submitRequest(req));
    S.lv = { type: "annual", from: null, to: null, half: "full", reason: "", err: "" };
    S.done = { illus: "leave", title: "Đã gửi đơn nghỉ", text: v.type === "annual" ? `${dec(n)} ngày phép được giữ chỗ đến khi đơn được duyệt.` : "Loại nghỉ này không trừ phép năm.", rows: [["Mã đơn", id], ["Người duyệt", "Lê Quang Huy"]], primary: ["Xem đơn của tôi", "requests"] };
    S.stack = ["done"]; render("push");
  },
  hideMoney: () => { S.hideMoney = !S.hideMoney; emit(); },
  askPay: (a: string) => { S.f.payQ = ""; S.f.payChip = 1; openSheet("askPay", a); },
  payQSend: () => { if (!needNet(() => ACT.payQSend())) return; sync(api.askPayroll(S.sheet?.arg ?? "", String(S.f.payChip), S.f.payQ)); closeSheet(); toast("Đã gửi. Bạn sẽ nhận thông báo khi HR trả lời."); },
  advExplain: () => openSheet("advExplain"),
  advQuick: (a: number) => { S.advAmt = a; emit(); },
  advReview: () => { if (advError()) return; openSheet("advReview"); },
  advConfirm: () => {
    if (!needNet(() => ACT.advConfirm())) return; closeSheet(true);
    openPin(() => {
      S.advance = { id: "TU-1016", amount: S.advAmt, step: 1, created: "16/10 " + hm(simNow()), reason: S.advReason };
      const req: MyReq = { id: "TU-1016", type: "advance", title: "Tạm ứng lương", sub: vnd(S.advAmt) + " · trừ kỳ 10/2026", status: "pending", created: S.advance.created, reason: S.advReason || "—", adv: true };
      S.myReq.unshift(req); sync(api.submitRequest(req));
      S.stack = ["home", "advance", "advanceDetail"]; render("push"); toast("Đã gửi đề nghị tạm ứng TU-1016");
    });
  },
  advStep: () => { const a = S.advance!; a.step = Math.min(5, a.step + 1); if (a.step >= 4) { const r = S.myReq.find((x) => x.id === a.id); if (r) r.status = "approved"; } emit(); },
  advCancel: () => openSheet("advCancel"),
  advCancelGo: () => { const r = S.myReq.find((x) => x.id === S.advance!.id); if (r) { r.status = "cancelled"; sync(api.cancelRequest(r.id)); } S.advance = null; closeSheet(); S.stack = ["home", "advance"]; render("pop"); toast("Đã hủy đề nghị tạm ứng"); },
  reqTab: (a: "mine" | "approve") => { S.reqTab = a; S.selectMode = false; S.sel.clear(); emit(); },
  reqFilter: (a: string) => { S.reqFilter = a; emit(); },
  newsCat: (a: string) => { S.newsCat = a; emit(); },
  cancelAsk: (a: string) => openSheet("cancelAsk", a),
  cancelGo: (a: string) => {
    const item = REMOTE ? S.reqItems.get(a) : undefined;
    if (item) {
      remote("cancelGo", async () => { await timesheetApi.cancel(item.id); closeSheet(); toast("Đã hủy đơn " + a); refreshWork(); });
      return;
    }
    const r = S.myReq.find((x) => x.id === a)!; r.status = "cancelled"; sync(api.cancelRequest(a));
    if (r.title === "Nghỉ phép năm") { const m = r.sub.match(/([\d,]+) ngày/); if (m) S.leave.pending = Math.max(0, S.leave.pending - parseFloat((m[1] ?? "0").replace(",", "."))); }
    if (r.adv) S.advance = null; closeSheet(); emit(); toast("Đã hủy đơn " + a);
  },
  selMode: () => { S.selectMode = !S.selectMode; S.sel.clear(); emit(); },
  selToggle: (a: string) => { S.sel.has(a) ? S.sel.delete(a) : S.sel.add(a); emit(); },
  approve: (a: string, fromCard = false) => {
    if (!needNet(() => ACT.approve(a, fromCard))) return;
    const item = REMOTE ? S.reqItems.get(a) : undefined;
    if (item?.myTaskId) {
      remote(fromCard ? `approve:${a}` : "approve", async () => {
        await timesheetApi.decide(item.myTaskId!, true);
        const finish = () => { S.leavingCard = null; S.approvals = S.approvals.filter((x) => x.id !== a); if (cur() === "approvalDetail") { S.stack.pop(); render("pop"); } else emit(); toast("Đã duyệt đơn " + a); void loadRequests(); };
        if (fromCard) { S.leavingCard = a; emit(); setTimeout(finish, 260); } else finish();
      }, (e) => { toast(e.message); void loadRequests(); return true; });
      return;
    }
    sync(api.decide({ ids: [a], approve: true }));
    const finish = () => { S.leavingCard = null; S.approvals = S.approvals.filter((x) => x.id !== a); if (cur() === "approvalDetail") { S.stack.pop(); render("pop"); } else emit(); toast("Đã duyệt đơn " + a); };
    if (fromCard) { S.leavingCard = a; emit(); setTimeout(finish, 260); } else finish();
  },
  rejectAsk: (a: string) => { S.f.rej = ""; S.f.rejErr = false; openSheet("rejectAsk", a); },
  rejectGo: (a: string) => {
    if (!S.f.rej.trim()) { S.f.rejErr = true; emit(); return; }
    if (!needNet(() => ACT.rejectGo(a))) return;
    const item = REMOTE ? S.reqItems.get(a) : undefined;
    if (item?.myTaskId) {
      if (S.f.rej.trim().length < 5) { S.f.rejErr = true; emit(); return; }
      remote("rejectGo", async () => {
        await timesheetApi.decide(item.myTaskId!, false, S.f.rej.trim());
        S.approvals = S.approvals.filter((x) => x.id !== a); closeSheet(); if (cur() === "approvalDetail") { S.stack.pop(); render("pop"); } else emit(); toast("Đã từ chối đơn " + a); void loadRequests();
      });
      return;
    }
    sync(api.decide({ ids: [a], approve: false, reason: S.f.rej.trim() }));
    S.approvals = S.approvals.filter((x) => x.id !== a); closeSheet(); if (cur() === "approvalDetail") { S.stack.pop(); render("pop"); } else emit(); toast("Đã từ chối đơn " + a);
  },
  bulkApprove: () => {
    if (!needNet(() => ACT.bulkApprove())) return;
    if (REMOTE) {
      remote("bulkApprove", async () => {
        const res: Array<{ id: string; who: string; fail: boolean }> = [];
        for (const id of S.sel) {
          const item = S.reqItems.get(id), who = S.approvals.find((x) => x.id === id)?.who ?? "";
          try { if (!item?.myTaskId) throw new Error(); await timesheetApi.decide(item.myTaskId, true); res.push({ id, who, fail: false }); } catch { res.push({ id, who, fail: true }); }
        }
        S.sel.clear(); S.selectMode = false; await loadRequests();
        openSheet("bulkResult", JSON.stringify(res));
      });
      return;
    }
    const res = [...S.sel].map((id) => { const r = S.approvals.find((x) => x.id === id)!; return { r, fail: r.type === "advance" }; });
    sync(api.decide({ ids: res.filter((z) => !z.fail).map((z) => z.r.id), approve: true }));
    S.approvals = S.approvals.filter((x) => !res.some((z) => z.r.id === x.id && !z.fail));
    S.sel.clear(); S.selectMode = false; emit();
    openSheet("bulkResult", JSON.stringify(res.map((z) => ({ id: z.r.id, who: z.r.who, fail: z.fail }))));
  },
  bulkReject: () => { if (S.sel.size === 1) { ACT.rejectAsk([...S.sel][0]!); return; } toast("Từ chối hàng loạt cần một lý do chung (R08) · chưa dựng trong prototype"); },
  otDate: (a: number) => { S.ot.date = a; emit(); },
  otT: (k: "from" | "to", v: number) => { S.ot[k] = Math.max(0, Math.min(1440, S.ot[k] + v)); emit(); },
  otSubmit: () => {
    if (!needNet(() => ACT.otSubmit())) return; const o = S.ot, h = (o.to - o.from) / 60;
    const req: MyReq = { id: "OT-" + pad(o.date) + "10", type: "ot", title: "Làm thêm giờ", sub: `${WD[wdOct(o.date)]} ${pad(o.date)}/10 · ${hm(o.from * 60)}–${hm(o.to * 60)} · ${dec(h)} giờ`, status: "pending", created: "16/10 " + hm(simNow()), reason: o.reason || "—" };
    S.myReq.unshift(req); sync(api.submitRequest(req));
    S.done = { illus: "ot", title: "Đã gửi đăng ký làm thêm", text: `${dec(h)} giờ ngày ${pad(o.date)}/10 đang chờ quản lý duyệt.`, primary: ["Xem đơn của tôi", "requests"] };
    S.stack = ["done"]; render("push");
  },
  doneGo: (a: Route) => { S.reqTab = "mine"; S.reqFilter = "all"; S.stack = [a]; render("fade"); },
  editProfile: () => openSheet("editProfile"),
  pfSend: () => { if (!needNet(() => ACT.pfSend())) return; sync(api.requestProfileChange({ phone: S.f.pfPhone, address: S.f.pfAddr })); closeSheet(); toast("Đã gửi. Thông tin cũ vẫn hiệu lực đến khi HR duyệt."); },
  logoutAsk: () => openSheet("logoutAsk"),
  logoutGo: () => {
    /* Còn bật đăng nhập bằng Face ID thì giữ refresh token cho lần sau; tắt thì thu hồi phiên trên máy chủ */
    if (REMOTE) void loadSession().then(async (sess) => {
      if (!S.bio.login && sess?.auth) { await authApi.logout(sess.auth.accessToken).catch(() => undefined); await clearQuickLogin(); }
    });
    void clearSession(); S.pinUntil = 0; S.f = freshForms(); closeSheet(); S.stack = ["login"]; render("fade");
  },
  pinkey: (a: string) => {
    if (a === "del") S.pin = S.pin.slice(0, -1); else if (S.pin.length < 6) S.pin += a;
    emit();
    if (S.pin.length === 6) setTimeout(pinSuccess, 240);
  },
  /* Face ID thật trong sheet PIN; hủy hoặc không khớp thì quay lại bàn phím PIN */
  faceid: async () => {
    if (!S.bio.unlock) { toast(`Mở khóa bằng ${S.bioLabel} đang tắt. Nhập PIN hoặc bật lại trong Bảo mật và thiết bị.`); return; }
    if (S.sheet) { S.sheet = { ...S.sheet, kind: "face" }; emit(); }
    const r = await authenticate("Xác thực để xem lương và tạm ứng");
    if (r.ok) { pinSuccess(); return; }
    if (S.sheet) { S.sheet = { ...S.sheet, kind: "pin" }; emit(); }
    if (r.reason !== "cancelled") toast(r.message);
  },
  wpunch: () => {
    if (phase() === "done" || S.widgetState !== "idle") return;
    if (S.net === "offline") { toast("Widget: không có mạng, chưa chấm công"); return; }
    if (!S.inRange) { toast("Widget: bạn đang ngoài vùng chấm công 3 m"); return; }
    S.widgetState = "busy"; emit();
    setTimeout(() => {
      const kind = S.clockIn ? "out" : "in", t = simNow();
      if (kind === "in") S.clockIn = t; else S.clockOut = t;
      sync(api.recordPunch({ kind, at: t }));
      S.widgetState = "ok"; S.notifShow = false; emit();
      setTimeout(() => { S.widgetState = "idle"; emit(); }, 2600);
    }, 1200);
  },
  notifTap: () => { S.stack = ["home", "clock"]; render("fade"); },
  lockTap: () => { if (phase() === "done") { toast("Bạn đã xong ca hôm nay"); return; } toast("Face ID: đã mở khóa"); setTimeout(() => { S.stack = ["home", "clock"]; render("fade"); }, 700); },
  openApp: () => { S.stack = ["home"]; render("fade"); },
  resetDay: () => { S.clockIn = null; S.clockOut = null; S.widgetState = "idle"; emit(); toast("Đã xóa chấm công hôm nay"); },
};

export function advError() {
  const lim = advLimit(), v = S.advAmt;
  return v > lim ? `Vượt hạn mức. Tối đa ${vnd(lim)}.` : v < 500000 ? "Tối thiểu 500.000 ₫." : "";
}

export function quickItems(): Array<[string, "tap" | "plane" | "clock" | "moon" | "cash" | "receipt" | "user", string, string]> {
  return [
    ["clock", "tap", "Chấm công", phase() === "out" ? "Giữ để ra ca" : phase() === "done" ? "Đã xong ca hôm nay" : "Giữ để vào ca"],
    ["leaveNew", "plane", "Xin nghỉ phép", `Còn ${dec(lvAvail())} ngày phép`],
    ["explain", "clock", "Giải trình công", REMOTE ? (S.ts?.explanation ? `Còn ${explainLeft()}/${S.explainLimit} lượt${explainDue() ? ` · hạn ${ddmm(explainDue()!.deadline)}` : ""}` : "Theo bảng công") : `Còn ${explainLeft()}/3 lượt · hạn 22/10`],
    ["ot", "moon", "Làm thêm giờ", "Đăng ký OT"],
    ["advance", "cash", "Tạm ứng lương", advEligible() ? "Chưa áp dụng" : S.advance ? "Đã dùng lượt tháng này" : "Hạn mức 4,5 triệu"],
    ["payslips", "receipt", "Phiếu lương", "Tháng 09/2026"],
    ["_edit", "user", "Sửa hồ sơ", "Gửi HR duyệt"],
  ];
}

export const ADV_STEPS = ["Đã gửi", "Quản lý duyệt", "HR duyệt", "Kế toán duyệt", "Đã chi", "Đã khấu trừ"];
export { ADV_DAY };
