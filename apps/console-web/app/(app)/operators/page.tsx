"use client";
/* Nhân viên Kavor (thiết kế bổ sung theo phong cách prototype — prototype Console không có màn này): chỉ quản trị viên Console.
   Mời bằng email (người được mời tự đặt mật khẩu bằng OTP + liên kết ứng dụng xác thực), đổi vai trò, khóa / mở khóa,
   đặt lại xác thực hai lớp khi mất điện thoại. Không tự thao tác lên chính mình; luôn còn ít nhất một quản trị viên. */
import { useState } from "react";
import { OPERATOR_ROLES, type ConsoleOperator, type ConsoleOperators, type OperatorInviteResult, type OperatorRole } from "@kavor/contracts";
import { Select, SkeletonRows } from "@kavor/web-ui";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, ago, fmtDateTime, num, useAction, useMe, useToast } from "../../_ui/kit";
import { ISTATUS } from "../../_ui/labels";

const TZ = "Asia/Ho_Chi_Minh";
const ROLES = Object.keys(OPERATOR_ROLES) as OperatorRole[];
type Edit = { op: ConsoleOperator; kind: "role" | "disable" | "enable" | "mfa" };

export default function Operators() {
  const me = useMe();
  const { data, error, reload, setData } = useApi<ConsoleOperators>(me.role === "platform_admin" ? "operators" : null);
  const [inviting, setInviting] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const { busy, run } = useAction();
  if (me.role !== "platform_admin") return <section className="page active"><Empty title="Chỉ quản trị viên Kavor Console" text="Nhờ quản trị viên Console mời người mới hoặc đổi vai trò." /></section>;
  const ops = data?.operators ?? [], invites = data?.invites ?? [];
  const pending = invites.filter((i) => i.status === "pending" || i.status === "expired");
  const inviteAction = (id: string, action: "resend" | "revoke") =>
    run(`${action}${id}`, async () => setData(await call<ConsoleOperators>("POST", `operators/invites/${id}/${action}`)), action === "resend" ? "Đã gửi lại thư mời" : "Đã thu hồi lời mời");
  return (
    <section className="page active">
      <div className="page-head"><div><p>Tài khoản đăng nhập Kavor Console. Người được mời tự đặt mật khẩu bằng mã OTP gửi về email và bắt buộc bật xác thực hai lớp.</p></div>
        <button className="btn primary" onClick={() => setInviting(true)}><Icon name="plus" /> Mời nhân viên Kavor</button></div>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        {ROLES.map((r) => (
          <article key={r} className="card metric-card"><span className={`metric-icon ${r === "platform_admin" ? "violet" : r === "platform_support" ? "blue" : ""}`}><Icon name={r === "platform_admin" ? "shield" : r === "platform_support" ? "lock" : "users"} /></span>
            <span className="metric-copy"><span>{OPERATOR_ROLES[r].label}</span><strong>{num(ops.filter((o) => o.role === r && o.status === "active").length)}</strong><small>đang hoạt động</small></span></article>
        ))}
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="clock" /></span><span className="metric-copy"><span>Lời mời chờ kích hoạt</span><strong>{num(pending.filter((i) => i.status === "pending").length)}</strong><small>Hết hạn sau 7 ngày</small></span></article>
      </div>

      <article className="card">
        <div className="card-head"><div><h3>Nhân viên Kavor</h3><p>Không đổi vai trò, khóa hay đặt lại xác thực của chính mình — nhờ một quản trị viên khác.</p></div></div>
        {data && !ops.length ? <Empty title="Chưa có nhân viên Kavor" /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Họ tên</th><th>Vai trò</th><th>Xác thực hai lớp</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {!data && !error ? <SkeletonRows cols={6} rows={4} /> : null}
            {ops.map((o) => (
              <tr key={o.userId}>
                <td><Person name={o.fullName} sub={o.email} seed={o.userId} /></td>
                <td>{OPERATOR_ROLES[o.role].label}{o.self ? <span className="muted"> · bạn</span> : null}</td>
                <td><Status v={o.mfa ? ["Đã bật", ""] : ["Chưa liên kết", "warn"]} /></td>
                <td className="nowrap">{o.lastSignInAt ? ago(o.lastSignInAt) : "Chưa đăng nhập"}</td>
                <td><Status v={o.status === "active" ? ["Hoạt động", ""] : ["Đã khóa", "bad"]} /></td>
                <td>{o.self ? null : <span className="row-actions">
                  <button className="btn small" onClick={() => setEdit({ op: o, kind: "role" })}>Đổi vai trò</button>
                  {o.mfa ? <button className="btn small" onClick={() => setEdit({ op: o, kind: "mfa" })}>Đặt lại xác thực</button> : null}
                  {o.status === "active"
                    ? <button className="btn small danger" onClick={() => setEdit({ op: o, kind: "disable" })}>Khóa</button>
                    : <button className="btn small" onClick={() => setEdit({ op: o, kind: "enable" })}>Mở khóa</button>}
                </span>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>

      <article className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Lời mời</h3><p>Thư mời gửi tới email; người nhận vào trang đăng nhập Console → "Kích hoạt tài khoản / Quên mật khẩu".</p></div></div>
        {data && !invites.length ? <Empty title="Chưa có lời mời nào" /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Người được mời</th><th>Vai trò</th><th>Người mời</th><th>Gửi thư</th><th>Hết hạn</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {!data && !error ? <SkeletonRows cols={7} rows={3} /> : null}
            {invites.map((i) => (
              <tr key={i.id}>
                <td><Person name={i.fullName} sub={i.email} seed={i.email} /></td>
                <td>{OPERATOR_ROLES[i.role].label}</td>
                <td>{i.invitedBy}</td>
                <td className="nowrap">{i.sentAt ? fmtDateTime(i.sentAt, TZ) : <span className="text-red">Chưa gửi được</span>}</td>
                <td className="nowrap">{fmtDateTime(i.expiresAt, TZ)}</td>
                <td><Status v={ISTATUS[i.status]} /></td>
                <td><span className="row-actions">
                  {i.status === "pending" ? <button className="btn small" disabled={!!busy} onClick={() => void inviteAction(i.id, "resend")}>Gửi lại thư</button> : null}
                  {i.status === "pending" || i.status === "expired" ? <button className="btn small danger" disabled={!!busy} onClick={() => void inviteAction(i.id, "revoke")}>Thu hồi</button> : null}
                </span></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>

      {inviting ? <InviteModal onClose={() => setInviting(false)} onSaved={() => { setInviting(false); reload(); }} /> : null}
      {edit ? <EditModal edit={edit} onClose={() => setEdit(null)} onSaved={(d) => { setData(d); setEdit(null); }} /> : null}
    </section>
  );
}

function InviteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ fullName: "", email: "", role: "platform_operator" as OperatorRole });
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const { busy, run } = useAction();
  async function save() {
    if (f.fullName.trim().length < 2) { setErr("Nhập họ tên."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr("Email không hợp lệ."); return; }
    await run("save", async () => {
      const r = await call<OperatorInviteResult>("POST", "operators/invites", { ...f, email: f.email.trim() });
      toast(r.mail.sent ? `Đã gửi thư mời tới ${r.invite.email}` : `Đã tạo lời mời nhưng chưa gửi được thư: ${r.mail.error}`, r.mail.sent ? undefined : "error");
      onSaved();
    });
  }
  return (
    <Modal title="Mời nhân viên Kavor" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang gửi…" : "Gửi lời mời"}</button></>}>
      <div className="form-grid">
        <Field label="Họ tên"><input value={f.fullName} onChange={(e) => { setF({ ...f, fullName: e.target.value }); setErr(null); }} placeholder="Nguyễn Văn A" /></Field>
        <Field label="Email Kavor"><input type="email" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setErr(null); }} placeholder="ten@kavor.vn" /></Field>
        <Field label="Vai trò" full hint={OPERATOR_ROLES[f.role].detail}>
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as OperatorRole })}>{ROLES.map((r) => <option key={r} value={r}>{OPERATOR_ROLES[r].label}</option>)}</Select>
        </Field>
      </div>
      <div className="note-amber" style={{ marginTop: 14 }}>Dùng email riêng của Kavor, không dùng email đang là tài khoản nhân viên của doanh nghiệp khách hàng. Lời mời hết hạn sau 7 ngày.</div>
      <ErrorLine text={err} />
    </Modal>
  );
}

const EDIT_TEXT: Record<Edit["kind"], { title: string; button: string; ok: string }> = {
  role: { title: "Đổi vai trò", button: "Lưu vai trò", ok: "Đã đổi vai trò" },
  disable: { title: "Khóa nhân viên Kavor", button: "Khóa tài khoản", ok: "Đã khóa — phiên đang mở bị chặn ngay" },
  enable: { title: "Mở khóa nhân viên Kavor", button: "Mở khóa", ok: "Đã mở khóa" },
  mfa: { title: "Đặt lại xác thực hai lớp", button: "Đặt lại", ok: "Đã đặt lại — lần đăng nhập sau phải liên kết ứng dụng xác thực mới" },
};

function EditModal({ edit, onClose, onSaved }: { edit: Edit; onClose: () => void; onSaved: (d: ConsoleOperators) => void }) {
  const { op, kind } = edit;
  const [role, setRole] = useState<OperatorRole>(op.role);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const t = EDIT_TEXT[kind];
  async function save() {
    if (kind === "role" && role === op.role) { setErr("Chọn vai trò khác vai trò hiện tại."); return; }
    if (reason.trim().length < 5) { setErr("Ghi lý do (ít nhất 5 ký tự) — lưu vào nhật ký hoạt động."); return; }
    const body = kind === "role" ? { role, reason } : kind === "mfa" ? { reason } : { status: kind === "disable" ? "disabled" : "active", reason };
    await run("save", async () => onSaved(await call<ConsoleOperators>("POST", kind === "mfa" ? `operators/${op.userId}/reset-mfa` : `operators/${op.userId}`, body)), t.ok);
  }
  return (
    <Modal title={t.title} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className={`btn ${kind === "disable" ? "danger" : "primary"}`} disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : t.button}</button></>}>
      <div className="note-amber" style={{ marginBottom: 14 }}><b>{op.fullName}</b> · {op.email} · {OPERATOR_ROLES[op.role].label}</div>
      <div className="form-grid">
        {kind === "role" ? (
          <Field label="Vai trò mới" full hint={OPERATOR_ROLES[role].detail}>
            <Select value={role} onChange={(e) => { setRole(e.target.value as OperatorRole); setErr(null); }}>{ROLES.map((r) => <option key={r} value={r}>{OPERATOR_ROLES[r].label}</option>)}</Select>
          </Field>
        ) : null}
        <Field label="Lý do" full><textarea value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }}
          placeholder={kind === "mfa" ? "Ví dụ: mất điện thoại, đã gọi video xác minh" : kind === "disable" ? "Ví dụ: nghỉ việc ở Kavor" : "Ghi lý do"} /></Field>
      </div>
      {kind === "mfa" ? <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Chỉ làm sau khi đã xác minh đúng người (gọi video, gặp trực tiếp). Người này đăng nhập bằng mật khẩu rồi quét mã QR mới.</p> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}
