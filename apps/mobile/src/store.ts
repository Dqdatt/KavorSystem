/* State + router + actions: port 1:1 từ phần script của Kavor HRM Prototype.html.
   Màn hình đọc trực tiếp từ S; mọi thay đổi gọi emit()/render() để App vẽ lại. */
import { Vibration } from "react-native";
import {
  ADV_DAY, LV_DAYS, advLimit, dec, dur, hm, lvKey, pad, toMin, vnd, wdOct, WD,
  type Approval, type MyReq, type OctDay,
} from "./data";
import type { IllusKind } from "./illus";
import { api, type Snapshot } from "./api";
import { authenticate, biometricLabel, clearSession, loadBioPrefs, loadSession, quickLoginEmployee, saveBioPrefs, saveSession, type BioPrefs } from "./auth";

export type Anim = "push" | "pop" | "fade";
export type Route =
  | "login" | "forgot" | "forgotOtp" | "resetPassword" | "activate" | "otp" | "device"
  | "home" | "attendance" | "requests" | "news" | "clock" | "explain" | "leave" | "leaveNew"
  | "payslips" | "payslip" | "advance" | "advanceNew" | "advanceDetail" | "reqDetail" | "approvalDetail"
  | "ot" | "newsDetail" | "profile" | "security" | "notifications" | "widgetGuide" | "springHome" | "springLock" | "done" | "err";
export type ErrKind = "offline" | "server" | "maintenance" | "session" | "disabled" | "device" | "devicePending" | "locPerm" | "gpsOff" | "update";
export type SheetKind =
  | "pin" | "face" | "receipt" | "help" | "netSend" | "netPunch" | "earlyOut" | "slowCheck" | "blocked" | "day"
  | "askPay" | "advExplain" | "advReview" | "advCancel" | "cancelAsk" | "rejectAsk" | "bulkResult" | "editProfile" | "logoutAsk";

type Done = { illus: IllusKind; title: string; text: string; rows?: Array<[string, string]>; primary: [string, Route] };

/* Đồng hồ mô phỏng: bắt đầu 07:58 như prototype */
export const SIM = { base: 478 * 60, start: Date.now() };
export const simNow = () => SIM.base + Math.floor((Date.now() - SIM.start) / 1000);

const freshForms = () => ({
  lgPw: "demo-pass", lgPwShow: false,
  fgId: "thao.ha@haidang.vn", fgErr: false,
  otp: ["4", "8", "", "", "", ""],
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

/* Gửi thay đổi lên lớp dữ liệu; giao diện đã cập nhật lạc quan nên chỉ báo khi lỗi */
function sync(p: Promise<void>) {
  p.catch(() => toast("Chưa đồng bộ được với máy chủ. Kavor sẽ thử lại khi có mạng."));
}

const makeState = () => ({
  role: "staff" as "staff" | "manager", inRange: true, shift: "fixed" as "fixed" | "flex", contract: "official" as "official" | "probation" | "leaving",
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
export const shiftLabel = () => (S.shift === "fixed" ? "Ca hành chính" : "Ca linh hoạt");
export const shiftTime = () => (S.shift === "fixed" ? "08:00 – 17:00" : "8 giờ, 07:00 – 19:00");
export const phase = () => (!S.clockIn ? "in" : !S.clockOut ? "out" : "done");
export const worked = () => (S.clockIn ? Math.max(0, Math.floor(((S.clockOut || simNow()) - S.clockIn) / 60)) : null);
export function verdict(kind: "in" | "out", t: number): [string, "ok" | "warn"] {
  const m = Math.floor(t / 60);
  if (S.shift === "flex") { if (kind === "in") return ["Đã ghi nhận", "ok"]; const w = worked() ?? 0; return w >= 480 ? ["Đủ 8 giờ", "ok"] : [`Thiếu ${dur(480 - w)}`, "warn"]; }
  if (kind === "in") { const l = m - 480; return l > 0 ? [`Muộn ${dur(l)}`, "warn"] : ["Đúng giờ", "ok"]; }
  const e = 1020 - m; return e > 0 ? [`Về sớm ${dur(e)}`, "warn"] : ["Đủ giờ", "ok"];
}
export const explainLeft = () => S.explainLimit - S.explainUsed;
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
    return { leave: false, in: o.in ?? null, out: o.out || (o.explained ? o.fix! : null), hrs: o.explained ? toMin(o.fix!) - toMin(o.in!) - 60 : null, note,
      issue: !o.explained && !o.pendingEx, inOk: !!o.in, outOk: !!o.out || !!o.explained, flagIn: !o.in, flagOut: !o.out && !o.explained };
  }
  const l = toMin(o.in) - 480, e = 1020 - toMin(o.out), hrs = toMin(o.out) - toMin(o.in) - 60;
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
/* Lưu phiên vào Keychain; thiết bị đã đăng ký thì vào thẳng trang chủ, chưa thì sang bước đăng ký */
async function signIn(employeeId: string) {
  const session = await saveSession({ employeeId });
  S.stack = [session.deviceRegistered ? "home" : "device"];
  render(session.deviceRegistered ? "fade" : "push");
}

/* Bật/tắt Face ID: bật lại cần xác thực sinh trắc học một lần để chắc chắn đúng chủ máy */
export async function setBioPref(key: keyof BioPrefs, on: boolean) {
  if (on) {
    const r = await authenticate(`Bật ${S.bioLabel} cho Kavor`);
    if (!r.ok) { if (r.reason !== "cancelled") toast(r.message); return; }
  }
  S.bio = { ...S.bio, [key]: on }; emit();
  await saveBioPrefs(S.bio);
  toast(`Đã ${on ? "bật" : "tắt"} ${key === "login" ? "đăng nhập" : "mở khóa lương/tạm ứng"} bằng ${S.bioLabel}`);
}

/* Mở app: còn phiên hợp lệ thì bỏ qua màn đăng nhập */
export async function restoreSession() {
  S.bio = await loadBioPrefs();
  S.bioLabel = await biometricLabel().then((l) => (l === "vân tay" ? "vân tay" : l === "Face ID" ? "Face ID" : "sinh trắc học"));
  const session = await loadSession();
  if (!session) return;
  Object.assign(S, fromSnapshot(await api.refresh().catch(() => api.cached())));
  S.stack = [session.deviceRegistered ? "home" : "device"]; render();
}

function pinSuccess() { S.pinUntil = Date.now() + 5 * 60 * 1000; const f = S.pinOk; S.pinOk = null; closeSheet(); f && f(); }

export function quickOpen() { S.quickOpen = true; emit(); }
export function quickClose() { if (!S.quickOpen) return; S.quickOpen = false; emit(); }

export function showErr(kind: ErrKind) {
  closeSheet(true); quickClose(); S.err = { kind };
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
  if (phase() === "out" && S.shift === "fixed") {
    const m = Math.floor(simNow() / 60);
    if (m < 1020) { openSheet("earlyOut"); return; }
  }
  ACT.punchGo();
}

/* ---------- actions (tên giữ như data-act của prototype) ---------- */
export const ACT = {
  toast: (a: string) => toast(a),
  retrySend: () => spin("retrySend", 900, () => { if (S.net === "offline") { shake("sheet"); toast("Vẫn chưa có mạng"); return; } closeSheet(true); const f = S.retry; S.retry = null; f && f(); }),
  retryPunch: () => spin("retryPunch", 900, () => { if (S.net === "offline") { shake("sheet"); toast("Vẫn chưa có mạng"); return; } closeSheet(true); holdDone(); }),
  errRetry: () => spin("errRetry", 900, () => {
    const k = S.err?.kind;
    if (k === "offline" && S.net === "offline") { shake("err"); toast("Vẫn chưa có mạng"); return; }
    const target = S.err?.retry; S.err = null;
    if (target) { S.stack.pop(); go(target); return; }
    S.stack = ["home"]; render("fade"); toast(k === "gpsOff" ? "Đã lấy được vị trí · ±2 m" : k === "server" ? "Hệ thống đã hoạt động lại" : "Đã kết nối lại");
  }),
  errClose: () => { S.err = null; if (S.stack.length > 1) { S.stack.pop(); render("pop"); } else { S.stack = ["home"]; render("fade"); } },
  errHR: () => toast("Phòng Nhân sự: 028 3822 0142 · hr@haidang.vn"),
  errLogin: () => { void clearSession(); S.err = null; S.stack = ["login"]; render("fade"); },
  errReset: () => spin("errReset", 800, () => { S.err = { kind: "devicePending" }; render("fade"); toast("Đã gửi yêu cầu chuyển thiết bị"); }),
  errPending: () => spin("errPending", 800, () => toast("Chưa có thay đổi. HR sẽ xử lý trong giờ hành chính.")),
  errSettings: () => { toast("Mô phỏng: đã bật quyền vị trí trong Cài đặt"); setTimeout(() => ACT.errClose(), 900); },
  errUpdate: () => spin("errUpdate", 1200, () => { S.err = null; S.stack = ["home"]; render("fade"); toast("Đã cập nhật lên phiên bản 2.4.0"); }),
  errExplain: () => { S.err = null; S.stack = ["home"]; render("fade"); go("explain"); },
  help: () => openSheet("help", cur()),
  login: () => spin("login", 700, () => { void signIn("HD0142"); }),
  /* Face ID ở màn đăng nhập: dùng thông tin đăng nhập nhanh đã lưu từ lần đăng nhập mật khẩu trước */
  faceLogin: async () => {
    const employeeId = await quickLoginEmployee();
    if (!S.bio.login) { toast(`Đăng nhập bằng ${S.bioLabel} đang tắt. Bật lại trong Hồ sơ → Bảo mật và thiết bị.`); return; }
    if (!employeeId) { toast("Đăng nhập bằng mật khẩu một lần để bật đăng nhập nhanh bằng Face ID"); return; }
    const r = await authenticate("Đăng nhập Kavor");
    if (!r.ok) { if (r.reason !== "cancelled") toast(r.message); return; }
    await signIn(employeeId);
  },
  ssoLogin: () => { toast("Mở trang đăng nhập một lần (SSO) của công ty · mô phỏng"); setTimeout(() => { void signIn("HD0142"); }, 1000); },
  toActivate: () => { S.stack = ["login", "activate"]; render("push"); },
  toLogin: () => { S.stack = ["login"]; render("pop"); },
  sendResetOtp: () => { if (!S.f.fgId.trim()) { S.f.fgErr = true; shake("fgErr"); return; } spin("sendResetOtp", 700, () => { S.stack.push("forgotOtp"); render("push"); toast("Đã gửi mã OTP · hiệu lực trong 5 phút"); }); },
  verifyResetOtp: () => { if (S.f.otp.join("").length < 6) { toast("Vui lòng nhập đủ 6 số OTP"); return; } spin("verifyResetOtp", 700, () => { S.stack.push("resetPassword"); render("push"); }); },
  resetPassword: () => {
    const p = S.f.newPw, c = S.f.confirmPw; let e = "";
    if (p.length < 8) e = "Mật khẩu cần có ít nhất 8 ký tự."; else if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) e = "Mật khẩu cần có cả chữ và số."; else if (p !== c) e = "Hai mật khẩu chưa khớp.";
    if (e) { S.f.resetErr = e; shake("resetErr"); return; }
    spin("resetPassword", 800, () => { S.f = freshForms(); S.stack = ["login"]; render("fade"); toast("Đã đặt lại mật khẩu. Bạn có thể đăng nhập ngay."); });
  },
  activate: () => { if (!S.f.agree) { S.f.agreeErr = true; shake("agreeErr"); return; } spin("activate", 700, () => { S.stack.push("otp"); render("push"); }); },
  verifyOtp: () => { if (S.f.otp.join("").length < 6) { toast("Vui lòng nhập đủ 6 số OTP"); return; } spin("verifyOtp", 800, () => { toast("Đã kích hoạt tài khoản HD0142"); void signIn("HD0142"); }); },
  resendOtp: () => toast("Đã gửi lại mã OTP mới · hiệu lực trong 5 phút"),
  registerDevice: () => { sync(api.registerDevice()); void saveSession({ employeeId: "HD0142", deviceRegistered: true }); S.stack = ["home"]; render("fade"); toast("Đã đăng ký iPhone 15 làm thiết bị chấm công"); },
  quick: () => { S.quickOpen ? quickClose() : quickOpen(); },
  qgo: (a: string) => { quickClose(); if (a === "_edit") { setTimeout(() => ACT.editProfile(), 160); return; } setTimeout(() => go(a as Route), 110); },
  blockedTap: () => openSheet("blocked"),
  punchGo: () => {
    closeSheet(true);
    if (S.net === "slow" && !S.slowOk) { const e = epoch; openSheet("slowCheck"); setTimeout(() => { if (e !== epoch) return; S.slowOk = true; ACT.punchGo(); S.slowOk = false; }, 2400); return; }
    const kind = S.clockIn ? "out" : "in", t = simNow();
    if (kind === "in") S.clockIn = t; else S.clockOut = t;
    sync(api.recordPunch({ kind, at: t }));
    Vibration.vibrate(30);
    S.justPunched = true; emit(); openSheet("receipt", `${kind}:${t}`);
    setTimeout(() => { S.justPunched = false; }, 900);
  },
  relocate: () => { S.spin = "relocate"; emit(); setTimeout(() => { S.spin = null; closeSheet(); toast("Vẫn ngoài vùng (±2 m). Đổi “Vị trí” ở bảng bên phải để thử trong vùng."); }, 800); },
  day: (a: string) => openSheet("day", a),
  exFromDay: (a: string) => { closeSheet(true); S.ex.date = +a; const o = day(+a)!; const late = !!o.in && toMin(o.in) > 480; S.ex.type = (!o.in || late) ? "in" : "out"; S.ex.time = late ? 480 : !o.in ? 478 : 1020; go("explain"); },
  attFilter: (a: "all" | "late" | "miss") => { S.attFilter = a; emit(); },
  exDate: (a: number) => { S.ex.date = a; const o = day(a)!; if (!o.in) { S.ex.type = "in"; S.ex.time = 478; } emit(); },
  exType: (a: string) => { S.ex.type = a; S.ex.time = a === "out" ? 1020 : 478; emit(); },
  exTime: (a: number) => { S.ex.time = Math.max(360, Math.min(1320, S.ex.time + a)); emit(); },
  exFile: () => { S.ex.file = S.ex.file ? null : "Xac-nhan-bao-ve-15-10.jpg · 1,2 MB"; emit(); },
  exSubmit: () => {
    if (!S.ex.reason.trim()) { S.ex.err = true; emit(); return; }
    if (!needNet(() => ACT.exSubmit())) return;
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
    const r = S.myReq.find((x) => x.id === a)!; r.status = "cancelled"; sync(api.cancelRequest(a));
    if (r.title === "Nghỉ phép năm") { const m = r.sub.match(/([\d,]+) ngày/); if (m) S.leave.pending = Math.max(0, S.leave.pending - parseFloat((m[1] ?? "0").replace(",", "."))); }
    if (r.adv) S.advance = null; closeSheet(); emit(); toast("Đã hủy đơn " + a);
  },
  selMode: () => { S.selectMode = !S.selectMode; S.sel.clear(); emit(); },
  selToggle: (a: string) => { S.sel.has(a) ? S.sel.delete(a) : S.sel.add(a); emit(); },
  approve: (a: string, fromCard = false) => {
    if (!needNet(() => ACT.approve(a, fromCard))) return;
    sync(api.decide({ ids: [a], approve: true }));
    const finish = () => { S.leavingCard = null; S.approvals = S.approvals.filter((x) => x.id !== a); if (cur() === "approvalDetail") { S.stack.pop(); render("pop"); } else emit(); toast("Đã duyệt đơn " + a); };
    if (fromCard) { S.leavingCard = a; emit(); setTimeout(finish, 260); } else finish();
  },
  rejectAsk: (a: string) => { S.f.rej = ""; S.f.rejErr = false; openSheet("rejectAsk", a); },
  rejectGo: (a: string) => {
    if (!S.f.rej.trim()) { S.f.rejErr = true; emit(); return; }
    if (!needNet(() => ACT.rejectGo(a))) return;
    sync(api.decide({ ids: [a], approve: false, reason: S.f.rej.trim() }));
    S.approvals = S.approvals.filter((x) => x.id !== a); closeSheet(); if (cur() === "approvalDetail") { S.stack.pop(); render("pop"); } else emit(); toast("Đã từ chối đơn " + a);
  },
  bulkApprove: () => {
    if (!needNet(() => ACT.bulkApprove())) return;
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
  logoutGo: () => { void clearSession(); S.pinUntil = 0; closeSheet(); S.stack = ["login"]; render("fade"); },
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
    ["explain", "clock", "Giải trình công", `Còn ${explainLeft()}/3 lượt · hạn 22/10`],
    ["ot", "moon", "Làm thêm giờ", "Đăng ký OT"],
    ["advance", "cash", "Tạm ứng lương", advEligible() ? "Chưa áp dụng" : S.advance ? "Đã dùng lượt tháng này" : "Hạn mức 4,5 triệu"],
    ["payslips", "receipt", "Phiếu lương", "Tháng 09/2026"],
    ["_edit", "user", "Sửa hồ sơ", "Gửi HR duyệt"],
  ];
}

export const ADV_STEPS = ["Đã gửi", "Quản lý duyệt", "HR duyệt", "Kế toán duyệt", "Đã chi", "Đã khấu trừ"];
export { ADV_DAY };
