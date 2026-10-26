/* Trạng thái QA dùng để chụp so sánh với prototype: kavor://qa/<state>
   Cùng tên và cùng kịch bản với tools/ui-compare/states.mjs. Chỉ bật khi EXPO_PUBLIC_KAVOR_QA=1. */
import { ACT, S, go, holdDone, jump, openSheet, render, resetAll, scrollRequests, setNet, showErr, simNow } from "./store";
import type { MyPayslip, PayrollCycle } from "@kavor/contracts";

declare const process: { env: Record<string, string | undefined> };
export const QA_ENABLED = process.env.EXPO_PUBLIC_KAVOR_QA === "1";

const unlock = () => { S.pinUntil = Date.now() + 3e5; };
const later = (ms: number, f: () => void) => setTimeout(f, ms);

/* Dữ liệu của prototype, đặt vào contract API để chụp riêng nhánh màn lương thật.
   Không gắn tài khoản/token thật và không chạy trên bản QA tắt. */
function payrollFixture(index: number): MyPayslip {
  const p = S.payslips[index]!;
  const month = p.k.slice(3) + "-" + p.k.slice(0, 2);
  const date = (d: string) => `${month.slice(0, 4)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
  const at = `${date(p.pub)}T12:00:00Z`;
  const cycle: PayrollCycle = { id: `qa-${index}`, month, periodStart:`${month}-01`, periodEnd:`${month}-30`, payDate:date(p.paid), status:"paid",
    latestBatchId:"qa-batch", importedBy:null, importedAt:null, approvedBy:null, approvedAt:null, publishedAt:at, paidAt:`${date(p.paid)}T12:00:00Z`, closedAt:null };
  const gross = p.income.reduce((n, i) => n + i[1], 0), deduction = p.deduct.reduce((n, i) => n + i[1], 0);
  const items = [...p.income.map((i, n) => ({id:`earning-${n}`,code:`E${n}`,name:i[0],kind:"earning" as const,displayOrder:n,amount:i[1],label:null})),
    ...p.deduct.map((i, n) => ({id:`deduction-${n}`,code:`D${n}`,name:i[0],kind:"deduction" as const,displayOrder:n,amount:i[1],label:null}))];
  return { cycle, result:{id:"qa-result",employee:{id:"qa-employee",code:"HD0142",fullName:"Trần Thu Hà"},batchId:"qa-batch",gross,deduction,net:gross-deduction,workDays:parseFloat(String(p.work)),note:null,items},viewedAt:at };
}

export const QA_STATES: Record<string, () => void> = {
  "faceid-scanning": () => { jump("home"); openSheet("face"); },
  login: () => jump("login"),
  activate: () => { jump("login"); S.stack = ["login", "activate"]; render(); },
  "otp-activate": () => { jump("login"); S.stack = ["login", "activate", "otp"]; render(); },
  forgot: () => { jump("login"); S.stack = ["login", "forgot"]; render(); },
  "otp-reset": () => { jump("login"); S.stack = ["login", "forgot", "forgotOtp"]; render(); },
  "reset-password": () => { jump("login"); S.stack = ["login", "forgot", "forgotOtp", "resetPassword"]; render(); },
  device: () => { S.stack = ["device"]; render("fade"); },
  home: () => jump("home"),
  "home-manager": () => { S.role = "manager"; jump("home"); },
  "home-checked-in": () => { S.clockIn = simNow() - 1200; jump("home"); },
  "home-scrolled": () => { jump("home"); later(700, () => scrollRequests.forEach((f) => f(420))); later(900, () => scrollRequests.forEach((f) => f(430))); },
  "quick-menu": () => { jump("home"); ACT.quick(); },
  pin: () => { jump("home"); later(450, () => go("payslips")); },
  clock: () => { S.stack = ["home", "clock"]; render("fade"); },
  "help-sheet": () => { S.stack = ["home", "clock"]; render("fade"); ACT.help(); },
  "punch-receipt": () => { S.stack = ["home", "clock"]; render("fade"); ACT.punchGo(); },
  "early-clockout-sheet": () => { S.clockIn = simNow() - 1200; S.stack = ["home", "clock"]; render("fade"); holdDone(); },
  "punch-offline-sheet": () => { setNet("offline"); S.stack = ["home", "clock"]; render("fade"); holdDone(); },
  "punch-outside-range": () => { S.inRange = false; S.stack = ["home", "clock"]; render("fade"); ACT.blockedTap(); },
  "error-e26-slow-network": () => { setNet("slow"); S.stack = ["home", "clock"]; render(); ACT.punchGo(); },
  attendance: () => jump("attendance"),
  "attendance-miss": () => { jump("attendance"); ACT.attFilter("miss"); },
  "attendance-day-sheet": () => { jump("attendance"); ACT.day("15"); },
  explain: () => jump("explain"),
  "done-explain": () => { jump("explain"); S.ex.reason = "Điện thoại hết pin lúc đến công ty"; ACT.exSubmit(); },
  leave: () => jump("leave"),
  "leave-new": () => { jump("home"); go("leaveNew"); },
  "leave-new-range": () => { jump("home"); go("leaveNew"); ACT.lvPick(1020); ACT.lvPick(1022); },
  "done-leave": () => { jump("home"); go("leaveNew"); ACT.lvPick(1020); ACT.lvPick(1021); ACT.lvSubmit(); },
  ot: () => { jump("home"); go("ot"); },
  "done-ot": () => { jump("home"); go("ot"); ACT.otSubmit(); },
  payslips: () => { unlock(); jump("payslips"); },
  "payslip-detail": () => { unlock(); jump("payslips"); S.param = "0"; go("payslip"); },
  "payroll-api-list": () => {
    unlock(); S.payrollData = { items:S.payslips.map((_, i) => { const d=payrollFixture(i);return {cycle:d.cycle,net:d.result.net,workDays:d.result.workDays,viewedAt:d.viewedAt}; }) };
    jump("payslips");
  },
  "payroll-api-detail": () => { unlock(); S.payslipData=payrollFixture(0); S.param=S.payslipData.cycle.month; S.stack=["home","payslip"]; render(); },
  "salary-question-sheet": () => { unlock(); jump("payslips"); S.param = "0"; go("payslip"); ACT.askPay("09/2026"); },
  advance: () => { unlock(); jump("advance"); },
  "advance-limit-sheet": () => { unlock(); jump("advance"); ACT.advExplain(); },
  "advance-probation": () => { S.contract = "probation"; unlock(); jump("advance"); },
  "advance-new": () => { unlock(); S.stack = ["home", "advance"]; render(); go("advanceNew"); },
  "advance-review-sheet": () => { unlock(); S.stack = ["home", "advance"]; render(); go("advanceNew"); ACT.advReview(); },
  "advance-pin": () => { unlock(); S.stack = ["home", "advance"]; render(); go("advanceNew"); ACT.advReview(); ACT.advConfirm(); },
  "done-advance": () => { unlock(); S.advance = { id: "TU-1016", amount: 2000000, step: 1, created: "16/10 07:58", reason: "" }; S.stack = ["home", "advance", "advanceDetail"]; render("fade"); },
  "advance-cancel-sheet": () => { unlock(); S.advance = { id: "TU-1016", amount: 2000000, step: 1, created: "16/10 07:58", reason: "" }; S.stack = ["home", "advance", "advanceDetail"]; render("fade"); ACT.advCancel(); },
  requests: () => jump("requests"),
  "request-detail": () => { jump("requests"); S.param = "NP-1031"; go("reqDetail"); },
  "request-cancel-sheet": () => { jump("requests"); S.param = "NP-1031"; go("reqDetail"); ACT.cancelAsk("NP-1031"); },
  approvals: () => jump("approve"),
  "approval-detail": () => { jump("approve"); S.param = "TU-1007"; go("approvalDetail"); },
  "approval-reject-sheet": () => { jump("approve"); ACT.rejectAsk("NP-1035"); },
  "approval-bulk-select": () => { jump("approve"); ACT.selMode(); ACT.selToggle("NP-1035"); ACT.selToggle("TU-1007"); },
  "approval-bulk-result-sheet": () => { jump("approve"); ACT.selMode(); ACT.selToggle("NP-1035"); ACT.selToggle("TU-1007"); ACT.bulkApprove(); },
  news: () => jump("news"),
  "news-detail": () => { jump("news"); S.param = "6"; go("newsDetail"); },
  profile: () => jump("profile"),
  security: () => { jump("profile"); go("security"); },
  "profile-edit-sheet": () => { jump("profile"); ACT.editProfile(); },
  "logout-sheet": () => { jump("profile"); ACT.logoutAsk(); },
  notifications: () => { jump("home"); go("notifications"); },
  "widget-guide": () => { jump("home"); go("widgetGuide"); },
  "spring-home": () => jump("springHome"),
  "spring-lock": () => jump("springLock"),
  "offline-netbar": () => { jump("home"); setNet("offline"); },
  "error-e01": () => showErr("offline"),
  "error-e04": () => showErr("server"),
  "error-e05": () => showErr("maintenance"),
  "error-e15": () => showErr("session"),
  "error-e16": () => showErr("disabled"),
  "error-e18": () => showErr("device"),
  "error-e19-device-pending": () => showErr("devicePending"),
  "error-e20": () => showErr("locPerm"),
  "error-e21": () => showErr("gpsOff"),
  "error-e31": () => showErr("update"),
};

export function runQA(name: string) {
  const f = QA_STATES[name];
  if (!f) return false;
  resetAll();
  f();
  return true;
}
