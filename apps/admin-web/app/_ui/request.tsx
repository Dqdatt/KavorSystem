"use client";
/* Đơn từ trên web HR: nhãn, tóm tắt nội dung, các bước duyệt và modal "Chi tiết đơn" (bám modal approve của prototype HR) */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { EXPLANATION_KINDS, OVERTIME_DAY_KINDS, PROFILE_FIELDS, REQUEST_TYPES, overtimeAttendanceShort, overtimeAttendanceText, STEP_RESOLVERS, type AdminMe, type ProfileField, type ProfileValues, type RequestItem, type RequestStatus, type RequestType, type StepStatus } from "@kavor/contracts";
import { call } from "../_lib/client";
import { Dl, vs, ErrorLine, Field, Icon, Modal, Person, Status, can, fmtDate, fmtDateTime, useAction, useMe } from "./kit";

export const REQUEST_TYPE = REQUEST_TYPES;
export const REQUEST_STATUS: Record<RequestStatus, [string, string]> = { pending: ["Chờ duyệt", "warn"], approved: ["Đã duyệt", ""], rejected: ["Từ chối", "bad"], cancelled: ["Đã hủy", "muted"] };
const STEP_STATUS: Record<StepStatus, [string, string]> = { waiting: ["Chưa tới lượt", "muted"], pending: ["Đang chờ", "warn"], approved: ["Đã duyệt", ""], rejected: ["Từ chối", "bad"], skipped: ["Bỏ qua", "muted"], cancelled: ["Đã hủy", "muted"] };
const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const wd = (date: string) => { const w = new Date(`${date}T12:00:00Z`).getUTCDay(); return WD[w === 0 ? 7 : w]; };

const HALF = { full: "", am: " (sáng)", pm: " (chiều)" } as const;
export const days = (n: number) => `${n.toLocaleString("vi-VN")} ngày`;
export const money = (n: number) => `${n.toLocaleString("vi-VN")}\u00a0₫`;
/* Khoảng nghỉ: "T2 26/10–T4 28/10" / "T2 26/10 (chiều)" */
export function leaveRange(p: Extract<RequestItem, { type: "leave" }>["payload"]) {
  return `${wd(p.from)} ${fmtDate(p.from).slice(0, 5)}${p.to !== p.from ? `–${wd(p.to)} ${fmtDate(p.to).slice(0, 5)}` : ""}${HALF[p.half]}`;
}

/* Giá trị một trường hồ sơ để so sánh trước/sau; số tài khoản đầy đủ chỉ có khi người xem được phép (API đã lọc) */
export function profileValue(f: ProfileField, v: ProfileValues) {
  if (f === "emergency") return v.emergency ? `${v.emergency.name} · ${v.emergency.phone} · ${v.emergency.relation}` : "—";
  if (f === "bank") return v.bank ? `${v.bank.bankName} · ${v.bank.accountNo ?? `•••• ${v.bank.last4}`} · ${v.bank.holder}` : "—";
  return (v[f] as string | null | undefined) || "—";
}

/* "T5 22/10 | Quên chấm ra | ra 17:00" / "Phép năm | T2 26/10–T4 28/10 | 3 ngày" (hiển thị qua vs()) / "Sửa điện thoại, tài khoản ngân hàng" */
export function requestSummary(r: RequestItem) {
  if (r.type === "leave") return `${r.payload.leaveTypeName} | ${leaveRange(r.payload)} | ${days(r.payload.days)}`;
  if (r.type === "salary_advance") return `${money(r.payload.amount)} | trừ lương ${r.payload.month.slice(5)}/${r.payload.month.slice(0, 4)}`;
  if (r.type === "profile_change") return `Sửa ${r.payload.fields.map((f) => PROFILE_FIELDS[f].toLowerCase()).join(", ")}`;
  if (r.type === "overtime") return `${wd(r.payload.date)} ${fmtDate(r.payload.date).slice(0, 5)} | ${r.payload.start}–${r.payload.end} | ${r.payload.hours.toLocaleString("vi-VN")} giờ (${r.payload.ratePercent}%)`;
  const p = r.payload;
  const times = [p.clockIn ? `vào ${p.clockIn}` : null, p.clockOut ? `ra ${p.clockOut}` : null].filter(Boolean).join(", ");
  return `${r.workDate ? `${wd(r.workDate)} ${fmtDate(r.workDate).slice(0, 5)} | ` : ""}${EXPLANATION_KINDS[p.kind]}${times ? ` | ${times}` : ""}`;
}

/* Hạn SLA của bước đang chờ: "Còn 5 giờ" / "Quá 38 giờ" */
export function slaLabel(dueAt: string | null): [string, string] {
  if (!dueAt) return ["—", "muted"];
  const h = Math.round((Date.parse(dueAt) - Date.now()) / 3_600_000);
  if (h < 0) return [-h >= 48 ? `Quá ${Math.round(-h / 24)} ngày` : `Quá ${-h} giờ`, "bad"];
  return [h >= 48 ? `Còn ${Math.round(h / 24)} ngày` : `Còn ${Math.max(h, 1)} giờ`, h <= 4 ? "warn" : ""];
}

/* Phần chi tiết + duyệt/từ chối dùng chung cho hộp thư (/requests) và modal. body = nội dung cuộn, bar = nội dung thanh hành động (null nếu đơn đã xử lý) */
const TYPE_CLS: Record<RequestType, string> = { explanation: "t-gt", leave: "t-np", overtime: "t-ot", salary_advance: "t-tu", profile_change: "t-hs" };
export const TypeBadge = ({ type }: { type: RequestType }) => <span className={`status t ${TYPE_CLS[type]}`}><i />{REQUEST_TYPE[type]}</span>;
const pendingDue = (r: RequestItem) => r.steps.find((s) => s.status === "pending")?.dueAt ?? null;

function useRequestDetail(r: RequestItem, onDone: (r: RequestItem) => void, onClose?: () => void) {
  const me = useMe();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const tz = me.tenant.timezone;
  const act = async (approve: boolean) => {
    if (!r.myTaskId) return;
    if (!approve && note.trim().length < 5) { setErr("Ghi lý do từ chối (ít nhất 5 ký tự) để nhân viên biết cần bổ sung gì."); return; }
    await run(approve ? "ok" : "no", async () => { onDone(await call<RequestItem>("POST", `approvals/${r.myTaskId}/${approve ? "approve" : "reject"}`, { comment: note.trim() || null })); onClose?.(); }, approve ? `Đã duyệt ${r.no} · đơn chuyển sang mục Đã duyệt` : `Đã từ chối ${r.no} · đơn chuyển sang mục Từ chối/Hủy`);
  };
  const pending = r.status === "pending";
  const sla = slaLabel(pendingDue(r));
  const cur = r.steps.find((s) => s.status === "pending");
  const next = cur ? r.steps.find((s) => s.stepNo > cur.stepNo && s.status === "waiting") : undefined;
  const why = notMineReason(r, me);
  const rows: Array<[string, ReactNode]> = r.type === "leave" ? [
    ["Loại nghỉ", r.payload.leaveTypeName],
    ["Thời gian", `${leaveRange(r.payload)} · ${days(r.payload.days)} làm việc`],
  ] : r.type === "salary_advance" ? [
    ["Số tiền", money(r.payload.amount)],
    ["Trừ vào lương", `Tháng ${r.payload.month.slice(5)}/${r.payload.month.slice(0, 4)}`],
    ...(r.payout ? [["Đã chi", `${fmtDateTime(r.payout.paidAt, tz)}${r.payout.paidBy ? ` · ${r.payout.paidBy}` : ""}${r.payout.note ? ` · ${r.payout.note}` : ""}`] as [string, ReactNode]] : []),
  ] : r.type === "overtime" ? [
    ["Ngày", `${wd(r.payload.date)} ${fmtDate(r.payload.date)} · ${OVERTIME_DAY_KINDS[r.payload.dayKind]}`],
    ["Giờ làm thêm", `${r.payload.start}–${r.payload.end} · ${r.payload.hours.toLocaleString("vi-VN")} giờ`],
    ["Hệ số", `${r.payload.ratePercent}%`],
    ...(r.attendance ? [["Chấm công thực tế", overtimeAttendanceShort(r.attendance) ? <Status v={[overtimeAttendanceText(r.attendance), "bad"]} /> : overtimeAttendanceText(r.attendance)] as [string, ReactNode]] : []),
  ] : r.type === "profile_change" ? r.payload.fields.map((f): [string, ReactNode] => [PROFILE_FIELDS[f],
    <><span className="muted" style={{ textDecoration: "line-through", fontWeight: 500 }}>{profileValue(f, r.payload.before)}</span> → {profileValue(f, r.payload.after)}</>])
    : r.workDate ? [["Ngày áp dụng", fmtDate(r.workDate)]] : [];
  if (r.type === "explanation" && r.day) rows.push(["Chấm công gốc", `${r.day.shift ?? "—"} | vào ${r.day.rawIn ?? "--:--"} | ra ${r.day.rawOut ?? "--:--"}`]);
  rows.push(["Lý do", r.payload.reason || "—"]);
  if (r.attachments.length || r.attachmentRequired) rows.push(["Minh chứng", r.attachments.length ? r.attachments.map((a) => (
    <a key={a.id} className="btn small" style={{ margin: "0 0 4px 6px" }} href={`/api/requests/${r.id}/attachments/${a.id}`} target="_blank" rel="noreferrer"><Icon name="download" /> {a.name} · {kb(a.size)}</a>
  )) : <Status v={["Bắt buộc · nhân viên chưa đính kèm", "bad"]} />]);
  const body = (
    <div className="sc">
      <div className="rsp" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="rw small"><TypeBadge type={r.type} /><span className="muted">{r.no}</span><span className="muted">gửi {fmtDateTime(r.submittedAt, tz)} từ app</span></div>
          <h2 style={{ fontSize: 19, margin: "8px 0 0" }}>{vs(requestSummary(r))}</h2>
        </div>
        {pending ? <Status v={sla} /> : <Status v={REQUEST_STATUS[r.status]} />}
      </div>
      {pending && sla[1] === "bad" ? <div className="note"><Icon name="alert" /><span><b>Đơn đã quá hạn xử lý {sla[0].replace(/^Quá /, "")}.</b>{cur?.dueAt ? ` Hạn của bước này là ${fmtDateTime(cur.dueAt, tz)}.` : ""} Nhân viên vẫn đang chờ kết quả.</span></div> : null}
      <Link className="inset rsp" href={`/employees/${r.requester.id}`}>
        <Person name={r.requester.fullName} seed={r.requester.code} sub={`${r.requester.department ?? "—"} | ${r.requester.code}`} />
        <span className="rw small sub">Xem hồ sơ<Icon name="chevR" size={14} /></span>
      </Link>
      <div className="rd-grid">
        <div><div className="cap" style={{ marginBottom: 6 }}>Nội dung đơn</div><Dl rows={rows} /></div>
        <div><div className="cap" style={{ marginBottom: 12 }}>Luồng duyệt</div>
          <div className="tl">{r.steps.map((s) => (
            <div key={s.taskId}>
              <span className={`pt ${s.status === "approved" ? "done" : s.status === "rejected" ? "bad" : s.status === "pending" ? "now" : ""}`}>{s.status === "approved" ? <Icon name="check" size={12} /> : s.status === "rejected" ? <Icon name="x" size={12} /> : null}</span>
              <div><b style={{ fontWeight: 600 }}>Bước {s.stepNo}: {STEP_RESOLVERS[s.resolver]}</b>
                <span className={`small ${s.status === "pending" ? "now-t" : "muted"}`} style={{ display: "block" }}>
                  {vs(s.actedAt ? `${s.actedBy ?? "—"} | ${fmtDateTime(s.actedAt, tz)}${s.comment ? ` | “${s.comment}”` : ""}` : s.status === "pending" ? `${s.assignee ?? "Chưa có người duyệt"}${s.dueAt ? ` | Hạn ${fmtDateTime(s.dueAt, tz)}` : ""}` : s.status === "skipped" ? "Không có người duyệt ở bước này" : s.assignee ?? STEP_STATUS[s.status][0])}
                </span></div>
            </div>
          ))}</div></div>
      </div>
      {r.type === "overtime" && overtimeAttendanceShort(r.attendance) ? <div className="muted small">
        Chấm công không phủ hết giờ trên đơn. Duyệt vẫn được (công tác, quên chấm…), nhưng bảng công chỉ tính phần khớp với giờ vào/ra — cần thì điều chỉnh chấm công ngày đó.</div> : null}
      {r.myTaskId && r.attachmentRequired && !r.attachments.length ? <div className="muted small">
        Đơn cần minh chứng: bước duyệt cuối chỉ duyệt được sau khi nhân viên đính kèm trên app. Có thể từ chối nếu không có minh chứng.</div> : null}
      {r.myTaskId ? <Field label="Ghi chú cho nhân viên" full><textarea rows={3} style={{ minHeight: 64 }} value={note} onChange={(e) => { setNote(e.target.value); setErr(null); }} placeholder="Không bắt buộc khi duyệt. Bắt buộc khi từ chối." /></Field> : null}
      <ErrorLine text={err} />
    </div>
  );
  const bar = r.myTaskId ? <>
    <span className="sub small grow">Bạn duyệt ở vai trò {cur ? STEP_RESOLVERS[cur.resolver] : "người duyệt"}. {next ? `Sau bạn là bước ${STEP_RESOLVERS[next.resolver]}.` : "Đây là bước cuối."}</span>
    <button className="btn danger" disabled={!!busy} onClick={() => void act(false)}><Icon name="x" /> Từ chối</button>
    <button className="btn primary" disabled={!!busy} onClick={() => void act(true)}><Icon name="check" /> {busy === "ok" ? "Đang duyệt…" : "Duyệt đơn"}</button>
  </> : why ? <>
    <span className="rw sub small grow"><Icon name="help" size={16} />{why.text}</span>
    {why.needRole && can(me, "role.assign") ? <Link className="btn primary" href="/roles">Gán vai trò</Link> : null}
  </> : null;
  return { body, bar, why };
}

export function RequestDetail({ r, onDone, onClose }: { r: RequestItem; onDone: (r: RequestItem) => void; onClose?: () => void }) {
  const { body, bar } = useRequestDetail(r, onDone, onClose);
  return <>{body}{bar ? <div className="actbar">{bar}</div> : null}</>;
}

/* Modal "Chi tiết đơn" cho các trang khác: thanh hành động nằm ở chân modal */
export function RequestModal({ r, onClose, onDone }: { r: RequestItem; onClose: () => void; onDone: (r: RequestItem) => void }) {
  const { body, bar, why } = useRequestDetail(r, onDone, onClose);
  return (
    <Modal wide title={`Chi tiết đơn ${r.no}`} sub={r.myTaskId ? undefined : why?.text} onClose={onClose}
      foot={<>{r.myTaskId ? bar : <button className="btn" onClick={onClose}>Đóng</button>}</>}>
      {body}
    </Modal>
  );
}

const kb = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/* Vì sao người xem không duyệt được: chỉ ra ai/vai trò nào duyệt bước đang chờ để HR biết cần gán gì (một người giữ được nhiều vai trò) */
function notMineReason(r: RequestItem, me: AdminMe): { text: string; needRole?: boolean } | undefined {
  if (r.status !== "pending") return undefined;
  const cur = r.steps.find((s) => s.status === "pending");
  if (!cur) return undefined;
  if (r.requester.id === me.employeeId) return { text: "Đây là đơn của bạn: không ai tự duyệt đơn của chính mình." };
  if (cur.resolver === "direct_manager") return { text: `Đang chờ quản lý trực tiếp${cur.assignee ? ` ${cur.assignee}` : ""} duyệt. Người duyệt bước này lấy theo Quản lý trực tiếp trong hồ sơ nhân viên.` };
  const [perm, roles] = cur.resolver === "hr" ? ["request.hr_review", "Nhân sự vận hành hoặc Quản trị viên công ty"] : ["salary_advance.process", "Kế toán"];
  if (can(me, perm)) return { text: `Bước ${STEP_RESOLVERS[cur.resolver]} đang chờ, nhưng nhân viên này nằm ngoài phạm vi vai trò của bạn.` };
  return { text: `Bước ${STEP_RESOLVERS[cur.resolver]} cần vai trò ${roles}. Gán thêm vai trò ở Vai trò & phân quyền (một người giữ được nhiều vai trò).`, needRole: true };
}
