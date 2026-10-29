"use client";
/* Khôi phục quyền chủ sở hữu (ADR 0001 §1): form tạo yêu cầu và hộp xác nhận duyệt/từ chối, dùng ở trang Khôi phục và drawer tenant */
import { useState } from "react";
import type { ConsoleTenant, ConsoleTenantDetail, OwnerRecovery, RecoveryKind, RecoveryStatus } from "@kavor/contracts";
import { call, useApi } from "../_lib/client";
import { ErrorLine, Field, Modal, useAction } from "./kit";
import { Select } from "@kavor/web-ui";

export const KIND: Record<RecoveryKind, string> = { mfa_reset: "Đặt lại xác thực hai lớp", grant_admin: "Cấp quản trị viên công ty mới" };
export const RSTATUS: Record<RecoveryStatus, [string, string]> = {
  pending: ["Chờ người thứ hai duyệt", "warn"], approved: ["Đã duyệt", ""], rejected: ["Đã từ chối", "bad"], cancelled: ["Đã hủy", "muted"], expired: ["Quá hạn 24 giờ", "muted"],
};

export function RecoveryForm({ tenantId, kind: initialKind, targetEmployeeId, onClose, onSaved }: {
  tenantId?: string; kind?: RecoveryKind; targetEmployeeId?: string; onClose: () => void; onSaved: (r: OwnerRecovery) => void;
}) {
  const tenants = useApi<ConsoleTenant[]>(tenantId ? null : "tenants");
  const [f, setF] = useState({ tenantId: tenantId ?? "", kind: initialKind ?? ("mfa_reset" as RecoveryKind), targetEmployeeId: targetEmployeeId ?? "", newAdminName: "", newAdminEmail: "", verification: "", reason: "" });
  const detail = useApi<ConsoleTenantDetail>(f.tenantId ? `tenants/${f.tenantId}` : null);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value, ...(k === "tenantId" ? { targetEmployeeId: "" } : {}) }); setErr(null); };
  const admins = (detail.data?.tenantAdmins ?? []).filter((a) => a.mfaEnrolled);
  async function save() {
    if (!f.tenantId) { setErr("Chọn doanh nghiệp."); return; }
    if (f.kind === "mfa_reset" && !f.targetEmployeeId) { setErr("Chọn quản trị viên cần đặt lại."); return; }
    if (f.kind === "grant_admin" && (f.newAdminName.trim().length < 2 || !f.newAdminEmail.includes("@"))) { setErr("Nhập họ tên và email công việc của người nhận quyền."); return; }
    if (f.verification.trim().length < 10) { setErr("Ghi rõ đã xác minh người yêu cầu bằng cách nào (ít nhất 10 ký tự)."); return; }
    if (f.reason.trim().length < 10) { setErr("Ghi lý do (ít nhất 10 ký tự)."); return; }
    const body = f.kind === "mfa_reset"
      ? { tenantId: f.tenantId, kind: f.kind, targetEmployeeId: f.targetEmployeeId, verification: f.verification, reason: f.reason }
      : { tenantId: f.tenantId, kind: f.kind, newAdminName: f.newAdminName, newAdminEmail: f.newAdminEmail, verification: f.verification, reason: f.reason };
    await run("save", async () => onSaved(await call<OwnerRecovery>("POST", "recoveries", body)), "Đã tạo yêu cầu — cần một nhân viên Kavor khác duyệt");
  }
  return (
    <Modal wide title="Yêu cầu khôi phục quyền chủ sở hữu" sub="Yêu cầu có hiệu lực 24 giờ và chỉ được thực hiện khi một nhân viên Kavor khác duyệt." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang gửi…" : "Gửi để duyệt"}</button></>}>
      <div className="form-grid">
        {tenantId ? null : (
          <Field label="Doanh nghiệp" full><Select value={f.tenantId} onChange={set("tenantId")}><option value="">Chọn…</option>{(tenants.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}</Select></Field>
        )}
        <Field label="Loại" full><Select value={f.kind} onChange={set("kind")}><option value="mfa_reset">{KIND.mfa_reset} (quản trị viên mất điện thoại)</option><option value="grant_admin">{KIND.grant_admin} (công ty không còn ai quản trị)</option></Select></Field>
        {f.kind === "mfa_reset" ? (
          <Field label="Quản trị viên" full hint={f.tenantId && detail.data && !admins.length ? "Doanh nghiệp này chưa có quản trị viên nào đã liên kết ứng dụng xác thực." : undefined}>
            <Select value={f.targetEmployeeId} onChange={set("targetEmployeeId")}><option value="">Chọn…</option>{admins.map((a) => <option key={a.employeeId} value={a.employeeId}>{a.fullName} · {a.code} · {a.email}</option>)}</Select>
          </Field>
        ) : <>
          <Field label="Họ tên người nhận quyền"><input value={f.newAdminName} onChange={set("newAdminName")} /></Field>
          <Field label="Email công việc" hint="Trùng email hồ sơ có sẵn thì dùng hồ sơ đó"><input type="email" value={f.newAdminEmail} onChange={set("newAdminEmail")} /></Field>
        </>}
        <Field label="Đã xác minh bằng cách nào" full><textarea rows={3} value={f.verification} onChange={set("verification")} placeholder="Ví dụ: gọi lại số tổng đài trên giấy ĐKKD, đối chiếu CCCD qua video, công văn có dấu đỏ" /></Field>
        <Field label="Lý do / mã phiếu hỗ trợ" full><textarea rows={2} value={f.reason} onChange={set("reason")} /></Field>
      </div>
      <div className="note-amber" style={{ marginTop: 14 }}>
        Xác minh qua kênh độc lập với người yêu cầu (không dùng email/số điện thoại do chính họ gửi kèm). Mọi bước đều ghi nhật ký và công ty thấy trong nhật ký của mình.
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/* Duyệt / từ chối / hủy. Từ chối bắt buộc ghi lý do */
export function DecideModal({ r, action, onClose, onDone }: { r: OwnerRecovery; action: "approve" | "reject" | "cancel"; onClose: () => void; onDone: (r: OwnerRecovery) => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const title = action === "approve" ? `Duyệt: ${KIND[r.kind].toLowerCase()} cho ${r.tenant.name}?` : action === "reject" ? "Từ chối yêu cầu?" : "Hủy yêu cầu của bạn?";
  return (
    <Modal title={title} sub={action === "approve" ? `Thực hiện ngay sau khi duyệt. Người nhận: ${r.target.name}${r.target.email ? ` · ${r.target.email}` : ""}.` : undefined} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button>
        <button className={`btn ${action === "approve" ? "primary" : "danger"}`} disabled={!!busy} onClick={async () => {
          if (action === "reject" && note.trim().length < 5) { setErr("Ghi lý do từ chối (ít nhất 5 ký tự)."); return; }
          await run("go", async () => { onDone(await call<OwnerRecovery>("POST", `recoveries/${r.id}/${action}`, { note: note.trim() || null })); onClose(); },
            action === "approve" ? "Đã duyệt và thực hiện" : action === "reject" ? "Đã từ chối" : "Đã hủy yêu cầu");
        }}>{busy ? "Đang xử lý…" : action === "approve" ? "Duyệt và thực hiện" : action === "reject" ? "Từ chối" : "Hủy yêu cầu"}</button></>}>
      {action === "approve" ? <div className="card detail-list" style={{ marginBottom: 12 }}>
        <div className="detail-row"><span>Người tạo</span><b>{r.requestedBy}</b></div>
        <div className="detail-row"><span>Đã xác minh</span><b style={{ whiteSpace: "normal" }}>{r.verification}</b></div>
        <div className="detail-row"><span>Lý do</span><b style={{ whiteSpace: "normal" }}>{r.reason}</b></div>
      </div> : null}
      {action !== "cancel" ? <Field label={action === "reject" ? "Lý do từ chối" : "Ghi chú (không bắt buộc)"} full><textarea rows={3} value={note} onChange={(e) => { setNote(e.target.value); setErr(null); }} autoFocus /></Field> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}
