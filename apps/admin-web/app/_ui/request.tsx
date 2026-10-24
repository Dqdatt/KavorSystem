"use client";
/* Đơn từ trên web HR: nhãn, tóm tắt nội dung, các bước duyệt và modal "Chi tiết đơn" (bám modal approve của prototype HR) */
import { useState } from "react";
import { EXPLANATION_KINDS, OVERTIME_DAY_KINDS, REQUEST_TYPES, STEP_RESOLVERS, type RequestItem, type RequestStatus, type StepStatus } from "@kavor/contracts";
import { call } from "../_lib/client";
import { ErrorLine, Field, Modal, Person, Status, fmtDate, fmtDateTime, useAction, useMe } from "./kit";

export const REQUEST_TYPE = REQUEST_TYPES;
export const REQUEST_STATUS: Record<RequestStatus, [string, string]> = { pending: ["Chờ duyệt", "warn"], approved: ["Đã duyệt", ""], rejected: ["Từ chối", "bad"], cancelled: ["Đã hủy", "muted"] };
const STEP_STATUS: Record<StepStatus, [string, string]> = { waiting: ["Chưa tới lượt", "muted"], pending: ["Đang chờ", "warn"], approved: ["Đã duyệt", ""], rejected: ["Từ chối", "bad"], skipped: ["Bỏ qua", "muted"], cancelled: ["Đã hủy", "muted"] };
const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const wd = (date: string) => { const w = new Date(`${date}T12:00:00Z`).getUTCDay(); return WD[w === 0 ? 7 : w]; };

const HALF = { full: "", am: " (sáng)", pm: " (chiều)" } as const;
export const days = (n: number) => `${n.toLocaleString("vi-VN")} ngày`;
/* Khoảng nghỉ: "T2 26/10–T4 28/10" / "T2 26/10 (chiều)" */
export function leaveRange(p: Extract<RequestItem, { type: "leave" }>["payload"]) {
  return `${wd(p.from)} ${fmtDate(p.from).slice(0, 5)}${p.to !== p.from ? `–${wd(p.to)} ${fmtDate(p.to).slice(0, 5)}` : ""}${HALF[p.half]}`;
}

/* "T5 22/10 · Quên chấm ra · ra 17:00" / "Phép năm · T2 26/10–T4 28/10 · 3 ngày" */
export function requestSummary(r: RequestItem) {
  if (r.type === "leave") return `${r.payload.leaveTypeName} · ${leaveRange(r.payload)} · ${days(r.payload.days)}`;
  if (r.type === "overtime") return `${wd(r.payload.date)} ${fmtDate(r.payload.date).slice(0, 5)} · ${r.payload.start}–${r.payload.end} · ${r.payload.hours.toLocaleString("vi-VN")} giờ (${r.payload.ratePercent}%)`;
  const p = r.payload;
  const times = [p.clockIn ? `vào ${p.clockIn}` : null, p.clockOut ? `ra ${p.clockOut}` : null].filter(Boolean).join(", ");
  return `${r.workDate ? `${wd(r.workDate)} ${fmtDate(r.workDate).slice(0, 5)} · ` : ""}${EXPLANATION_KINDS[p.kind]}${times ? ` · ${times}` : ""}`;
}

/* Hạn SLA của bước đang chờ: "Còn 5 giờ" / "Quá 38 giờ" */
export function slaLabel(dueAt: string | null): [string, string] {
  if (!dueAt) return ["—", "muted"];
  const h = Math.round((Date.parse(dueAt) - Date.now()) / 3_600_000);
  if (h < 0) return [-h >= 48 ? `Quá ${Math.round(-h / 24)} ngày` : `Quá ${-h} giờ`, "bad"];
  return [h >= 48 ? `Còn ${Math.round(h / 24)} ngày` : `Còn ${Math.max(h, 1)} giờ`, h <= 4 ? "warn" : ""];
}

export function Steps({ r, tz }: { r: RequestItem; tz: string }) {
  return (
    <div className="card detail-list">
      {r.steps.map((s) => (
        <div key={s.taskId} className="detail-row" style={{ gridTemplateColumns: "1fr auto", minHeight: 48 }}>
          <span style={{ color: "var(--ink)", fontSize: 11.5 }}>Bước {s.stepNo} · {STEP_RESOLVERS[s.resolver]}{s.assignee && s.resolver === "direct_manager" ? `: ${s.assignee}` : ""}
            <small style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>
              {s.actedAt ? `${s.actedBy ?? "—"} · ${fmtDateTime(s.actedAt, tz)}${s.comment ? ` · “${s.comment}”` : ""}` : s.status === "pending" && s.dueAt ? `Hạn ${fmtDateTime(s.dueAt, tz)}` : s.status === "skipped" ? "Không có người duyệt ở bước này" : "—"}
            </small></span>
          <Status v={STEP_STATUS[s.status]} />
        </div>
      ))}
    </div>
  );
}

/* Chi tiết + duyệt/từ chối (nếu người xem là người duyệt bước đang chờ) */
export function RequestModal({ r, onClose, onDone }: { r: RequestItem; onClose: () => void; onDone: (r: RequestItem) => void }) {
  const me = useMe();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const tz = me.tenant.timezone;
  const act = async (approve: boolean) => {
    if (!r.myTaskId) return;
    if (!approve && note.trim().length < 5) { setErr("Ghi lý do từ chối (ít nhất 5 ký tự) để nhân viên biết cần bổ sung gì."); return; }
    await run(approve ? "ok" : "no", async () => { onDone(await call<RequestItem>("POST", `approvals/${r.myTaskId}/${approve ? "approve" : "reject"}`, { comment: note.trim() || null })); onClose(); }, approve ? "Đã duyệt đơn" : "Đã từ chối đơn");
  };
  return (
    <Modal wide title={`Chi tiết đơn ${r.no}`} sub={r.myTaskId ? "Kiểm tra thông tin trước khi phê duyệt." : "Bạn không phải người duyệt bước đang chờ của đơn này."} onClose={onClose}
      foot={r.myTaskId ? <><button className="btn danger" disabled={!!busy} onClick={() => void act(false)}>Từ chối</button><button className="btn primary" disabled={!!busy} onClick={() => void act(true)}>{busy === "ok" ? "Đang duyệt…" : "Duyệt đơn"}</button></>
        : <button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="profile-hero" style={{ paddingBottom: 12 }}><Person name={r.requester.fullName} seed={r.requester.code} sub={`${r.requester.department ?? "—"} · ${r.requester.code} · gửi từ Mobile App`} /></div>
      <div className="card detail-list">
        <div className="detail-row"><span>Loại đơn</span><b>{REQUEST_TYPE[r.type]}</b></div>
        {r.type === "leave" ? <>
          <div className="detail-row"><span>Loại nghỉ</span><b>{r.payload.leaveTypeName}</b></div>
          <div className="detail-row"><span>Thời gian</span><b>{leaveRange(r.payload)} · {days(r.payload.days)} làm việc</b></div>
        </> : r.type === "overtime" ? <>
          <div className="detail-row"><span>Ngày</span><b>{wd(r.payload.date)} {fmtDate(r.payload.date)} · {OVERTIME_DAY_KINDS[r.payload.dayKind]}</b></div>
          <div className="detail-row"><span>Giờ làm thêm</span><b>{r.payload.start}–{r.payload.end} · {r.payload.hours.toLocaleString("vi-VN")} giờ</b></div>
          <div className="detail-row"><span>Hệ số</span><b>{r.payload.ratePercent}%</b></div>
        </> : <div className="detail-row"><span>Nội dung</span><b>{requestSummary(r)}</b></div>}
        {r.type === "explanation" && r.day ? <div className="detail-row"><span>Chấm công gốc</span><b>{r.day.shift ?? "—"} · vào {r.day.rawIn ?? "--:--"} · ra {r.day.rawOut ?? "--:--"}</b></div> : null}
        <div className="detail-row"><span>Lý do</span><b style={{ whiteSpace: "normal", maxWidth: 420 }}>{r.payload.reason}</b></div>
        <div className="detail-row"><span>Gửi lúc</span><b>{fmtDateTime(r.submittedAt, tz)}</b></div>
        <div className="detail-row"><span>Trạng thái</span><b><Status v={REQUEST_STATUS[r.status]} /></b></div>
      </div>
      <h4 style={{ margin: "14px 0 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>Luồng duyệt</h4>
      <Steps r={r} tz={tz} />
      {r.myTaskId ? <Field label="Ghi chú nội bộ (bắt buộc khi từ chối)" full><textarea rows={3} value={note} onChange={(e) => { setNote(e.target.value); setErr(null); }} placeholder="Không bắt buộc khi duyệt" /></Field> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}
