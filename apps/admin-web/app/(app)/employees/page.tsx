"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminDevice, BulkInviteResult, EmployeeDetail, EmployeeListItem, EmployeeStatus, EmploymentType, OrgOptions } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import {
  ACCOUNT, Avatar, DEVICE, EMP_STATUS, EMPLOYMENT, Drawer, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, REJECT_REASON, Status, scopeText,
  ago, can, fmtDate, fmtDateTime, tenantToday, useAction, useMe,
} from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { ImportModal } from "../../_ui/employee-import";
import { Select } from "@kavor/web-ui";

const AUDIT: Record<string, string> = {
  "employee.created": "Tạo hồ sơ", "employee.updated": "Sửa hồ sơ", "employee.invited": "Gửi lời mời kích hoạt", "account.locked": "Khóa tài khoản", "account.unlocked": "Mở khóa tài khoản",
  "auth.activated": "Nhân viên kích hoạt tài khoản", "auth.activation.otp_sent": "Gửi OTP kích hoạt", "auth.login": "Đăng nhập", "auth.login_failed": "Đăng nhập sai mật khẩu", "auth.password_reset": "Đặt lại mật khẩu",
  "auth.mfa_enrolled": "Bật xác thực hai lớp", "auth.mfa_verified": "Xác thực hai lớp khi đăng nhập web", "auth.mfa_reset": "Đặt lại xác thực hai lớp",
  "privacy.consented": "Đồng ý điều khoản dữ liệu cá nhân",
  "request.submitted": "Gửi đơn", "request.cancelled": "Hủy đơn", "approval.approved": "Duyệt đơn", "approval.rejected": "Từ chối đơn",
  "leave.adjusted": "Điều chỉnh sổ phép", "leave.carry_imported": "Nhập phép tồn", "compensation.changed": "Đổi lương cơ bản", "salary_advance.paid": "Chi tạm ứng",
  "device.registered": "Đăng ký thiết bị", "device.change_requested": "Yêu cầu dùng máy mới", "device.approved": "Duyệt thiết bị", "device.rejected": "Từ chối thiết bị", "device.revoked": "Thu hồi thiết bị",
};

function EmployeesPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("working");
  const [account, setAccount] = useState(params.get("account") ?? "all");
  const [editing, setEditing] = useState<EmployeeDetail | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [bulk, setBulk] = useState(false);
  const openId = params.get("id");

  useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);
  const query = useMemo(() => new URLSearchParams({ status, account, ...(dept ? { departmentId: dept } : {}) }).toString(), [status, account, dept]);
  const list = useApi<EmployeeListItem[]>(`employees?${query}`, { tables: ["employees", "employee_devices"], tenantId: me.tenant.id });
  const org = useApi<OrgOptions>("org");
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    if (!k) return list.data ?? [];
    return (list.data ?? []).filter((e) => `${e.fullName} ${e.code} ${e.email ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").includes(k));
  }, [list.data, q]);
  const uninvited = rows.filter((e) => e.account === "not_invited" && e.email && e.status !== "terminated");
  const open = (id: string | null) => { const p = new URLSearchParams(params.toString()); if (id) p.set("id", id); else p.delete("id"); router.replace(`/employees?${p.toString()}`, { scroll: false }); };

  return (
    <section className="page active">
      <div className="page-head">
        <div><p>{list.data ? `${rows.length} hồ sơ trong phạm vi của bạn` : "Đang tải…"} · trạng thái tài khoản và thiết bị chấm công.</p></div>
        <div className="head-actions">{can(me, "employee.create") ? <><button className="btn" onClick={() => setImporting(true)}><Icon name="upload" /> Nhập từ file</button><button className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" /> Thêm nhân viên</button></> : null}</div>
      </div>
      <LoadError error={list.error} retry={list.reload} />
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên, mã hoặc email…" /></label>
          <Select className="select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Phòng ban">
            <option value="">Tất cả phòng ban</option>{org.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái"><option value="working">Đang làm việc</option><option value="terminated">Đã nghỉ việc</option><option value="all">Tất cả trạng thái</option></Select>
          <Select className="select" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Tài khoản"><option value="all">Mọi tài khoản</option><option value="pending">Chưa kích hoạt</option><option value="active">Đã kích hoạt</option><option value="locked">Đã khóa</option></Select>
          <span className="toolbar-spacer" />
          {/* Gửi lời mời cho người chưa mời lần nào trong danh sách đang lọc (thường sau khi nhập từ file) */}
          {can(me, "membership.invite") && uninvited.length ? <button className="btn small" onClick={() => setBulk(true)}><Icon name="mail" /> Gửi lời mời ({uninvited.length})</button> : null}
        </div>
        {list.data && !rows.length ? <Empty title="Không có nhân viên phù hợp" text="Thử bỏ bớt bộ lọc." /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Chức danh</th><th>Ngày vào làm</th><th>Loại HĐ</th><th>Tài khoản</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {rows.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => open(e.id)}>
                <td><Person name={e.fullName} sub={`${e.email ?? "chưa có email"} · ${e.code}`} seed={e.code} /></td>
                <td className="wrap">{e.department?.name ?? "—"}</td><td className="wrap">{e.position?.name ?? "—"}</td><td>{fmtDate(e.hireDate)}</td><td>{EMPLOYMENT[e.employmentType]}</td>
                <td><Status v={ACCOUNT[e.account]} />{e.devicePending ? <span className="source-tag" title="Có thiết bị chờ duyệt">Máy chờ duyệt</span> : null}</td>
                <td><Status v={EMP_STATUS[e.status]} /></td>
                <td><Icon name="arrow" size={16} className="icon" /></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {openId ? <EmployeeDrawer id={openId} onClose={() => open(null)} onEdit={setEditing} onChanged={list.reload} /> : null}
      {editing && org.data ? <EmployeeForm org={org.data} employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); void list.reload(); open(id); }} /> : null}
      {bulk ? <BulkInvite rows={uninvited} onClose={() => setBulk(false)} onDone={() => void list.reload()} /> : null}
      {importing ? <ImportModal onClose={() => setImporting(false)} onDone={() => void list.reload()} /> : null}
    </section>
  );
}

function EmployeeDrawer({ id, onClose, onEdit, onChanged }: { id: string; onClose: () => void; onEdit: (e: EmployeeDetail) => void; onChanged: () => void }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const { data: e, error, reload } = useApi<EmployeeDetail>(`employees/${id}`, { tables: ["employees", "employee_devices", "attendance_events"], tenantId: me.tenant.id });
  const { busy, run } = useAction();
  const [ask, setAsk] = useState<null | { title: string; label: string; danger?: boolean; go: (reason: string) => Promise<unknown>; ok: string }>(null);
  const after = () => { void reload(); onChanged(); };

  const deviceAct = (d: AdminDevice, action: "approve" | "reject" | "revoke") =>
    action === "approve"
      ? run(`dev-${d.id}`, () => call("POST", `devices/${d.id}/approve`, {}), `Đã duyệt ${d.deviceModel ?? "thiết bị"}`).then(after)
      : setAsk({ title: action === "reject" ? "Từ chối thiết bị" : "Thu hồi thiết bị", label: "Lý do (nhân viên sẽ thấy)", danger: true, ok: action === "reject" ? "Đã từ chối thiết bị" : "Đã thu hồi thiết bị",
        go: (reason) => call("POST", `devices/${d.id}/${action}`, { reason }) });

  return (
    <Drawer onClose={onClose} head={<><div><b>Hồ sơ nhân viên</b><div className="muted" style={{ fontSize: 10 }}>{e ? `Mã ${e.code}` : "Đang tải…"}</div></div>
      {e && can(me, "employee.update") ? <button className="btn small" style={{ marginLeft: "auto" }} onClick={() => onEdit(e)}>Sửa hồ sơ</button> : null}</>}>
      <LoadError error={error} retry={reload} />
      {!e ? null : (
        <>
          <div className="profile-hero"><Avatar name={e.fullName} seed={e.code} /><div><h3>{e.fullName}</h3><p>{[e.position?.name, e.department?.name, e.code].filter(Boolean).join(" · ")}</p></div><div style={{ marginLeft: "auto" }}><Status v={EMP_STATUS[e.status]} /></div></div>
          <div className="card detail-list">
            <div className="detail-row"><span>Phòng ban</span><b>{e.department?.name ?? "—"}</b></div>
            <div className="detail-row"><span>Chức danh</span><b>{e.position?.name ?? "—"}</b></div>
            <div className="detail-row"><span>Chi nhánh · pháp nhân</span><b>{e.branch?.name ?? "—"} · {e.legalEntity?.name ?? "—"}</b></div>
            <div className="detail-row"><span>Quản lý trực tiếp</span><b>{e.manager?.name ?? "—"}</b></div>
            <div className="detail-row"><span>Email công ty</span><b>{e.email ?? "—"}</b></div>
            <div className="detail-row"><span>Điện thoại</span><b>{e.phone ?? "—"}</b></div>
            <div className="detail-row"><span>Ngày vào làm · loại HĐ</span><b>{fmtDate(e.hireDate)} · {EMPLOYMENT[e.employmentType]}</b></div>
            {e.terminationDate ? <div className="detail-row"><span>Ngày nghỉ việc</span><b>{fmtDate(e.terminationDate)}</b></div> : null}
          </div>

          {/* Thông tin cá nhân do nhân viên đề nghị sửa trên app, HR duyệt (Đơn & phê duyệt); số tài khoản đầy đủ chỉ khi có quyền */}
          <div className="drawer-section">
            <h4>Thông tin cá nhân</h4>
            <div className="card detail-list">
              <div className="detail-row"><span>Email cá nhân</span><b>{e.personal.personalEmail ?? "—"}</b></div>
              <div className="detail-row"><span>Địa chỉ</span><b style={{ whiteSpace: "normal" }}>{e.personal.address ?? "—"}</b></div>
              <div className="detail-row"><span>Liên hệ khẩn cấp</span><b>{e.personal.emergency ? `${e.personal.emergency.name} · ${e.personal.emergency.relation} · ${e.personal.emergency.phone}` : "—"}</b></div>
              <div className="detail-row"><span>Tài khoản ngân hàng</span><b>{e.personal.bank ? `${e.personal.bank.bankName} · ${e.personal.bank.accountNo ?? `•••• ${e.personal.bank.last4}`} · ${e.personal.bank.holder}` : "—"}</b></div>
            </div>
          </div>

          <div className="drawer-section">
            <h4>Tài khoản Kavor</h4>
            <div className="card detail-list">
              <div className="detail-row"><span>Trạng thái</span><b><Status v={ACCOUNT[e.account]} /></b></div>
              {e.invitedAt ? <div className="detail-row"><span>Lời mời gần nhất</span><b>{fmtDateTime(e.invitedAt, tz)}</b></div> : null}
              {e.lastLoginAt ? <div className="detail-row"><span>Đăng nhập gần nhất</span><b>{ago(e.lastLoginAt)}</b></div> : null}
            </div>
            <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              {(e.account === "invited" || e.account === "not_invited") && can(me, "membership.invite") ? (
                <button className="btn small" disabled={!!busy || !e.email} onClick={() => run("invite", () => call("POST", `employees/${e.id}/invite`, {}), `Đã gửi lời mời tới ${e.email}`).then(after)}>
                  <Icon name="mail" /> {busy === "invite" ? "Đang gửi…" : e.account === "invited" ? "Gửi lại lời mời" : "Gửi lời mời"}
                </button>
              ) : null}
              {e.account === "active" && can(me, "membership.disable") && e.id !== me.employeeId ? (
                <button className="btn small danger" onClick={() => setAsk({ title: `Khóa tài khoản ${e.fullName}?`, label: "Lý do khóa", danger: true, ok: "Đã khóa tài khoản — mọi phiên đăng nhập bị chặn ngay", go: (reason) => call("POST", `employees/${e.id}/lock`, { reason }) })}>
                  <Icon name="lock" /> Khóa tài khoản
                </button>
              ) : null}
              {e.account === "active" && can(me, "membership.disable") && e.id !== me.employeeId ? (
                <button className="btn small" onClick={() => setAsk({ title: `Đặt lại xác thực hai lớp của ${e.fullName}?`, label: "Lý do (ví dụ: mất điện thoại)", ok: "Đã đặt lại — lần đăng nhập web sau phải liên kết lại ứng dụng xác thực", go: (reason) => call("POST", `employees/${e.id}/mfa-reset`, { reason }) })}>
                  <Icon name="shield" /> Đặt lại xác thực hai lớp
                </button>
              ) : null}
              {e.account === "locked" && can(me, "membership.disable") ? (
                <button className="btn small" disabled={!!busy} onClick={() => run("unlock", () => call("POST", `employees/${e.id}/unlock`, {}), "Đã mở khóa tài khoản").then(after)}>Mở khóa</button>
              ) : null}
            </div>
          </div>

          <div className="drawer-section">
            <h4>Ca và địa điểm đang áp dụng</h4>
            <div className="card detail-list">
              <div className="detail-row"><span>Ca làm</span><b>{e.policies.shift ? <>{e.policies.shift.name} · {e.policies.shift.start}–{e.policies.shift.end}<span className="source-tag" title="Tầng áp dụng">{scopeText(e.policies.shift.source)}</span></> : <span className="text-red">Chưa áp dụng ca nào</span>}</b></div>
              <div className="detail-row"><span>Địa điểm chấm công</span><b>{e.policies.locations.length ? <>{e.policies.locations.map((l) => `${l.name} (${l.radiusM} m)`).join(", ")}{e.policies.locationSource ? <span className="source-tag">{scopeText(e.policies.locationSource)}</span> : null}</> : <span className="text-red">Chưa có địa điểm</span>}</b></div>
            </div>
          </div>

          {can(me, "attendance.read") ? (
            <>
              <div className="drawer-section">
                <h4>Thiết bị chấm công</h4>
                {!e.devices.length ? <p className="muted" style={{ fontSize: 12.5 }}>Chưa đăng ký thiết bị.</p> : (
                  <div className="card detail-list">
                    {e.devices.map((d) => (
                      <div key={d.id} className="detail-row" style={{ gridTemplateColumns: "1fr auto" }}>
                        <span><b style={{ color: "var(--ink)" }}>{d.deviceModel ?? d.platform}</b> · {d.osVersion ?? d.platform}<br /><small className="muted">Đăng ký {fmtDateTime(d.registeredAt, tz)}{d.decisionReason ? ` · ${d.decisionReason}` : ""}</small></span>
                        <span className="row-actions"><Status v={DEVICE[d.status]} />
                          {can(me, "attendance.device.manage") && d.status === "pending" ? <><button className="btn small primary" disabled={!!busy} onClick={() => deviceAct(d, "approve")}>Duyệt</button><button className="btn small" onClick={() => deviceAct(d, "reject")}>Từ chối</button></> : null}
                          {can(me, "attendance.device.manage") && d.status === "active" ? <button className="btn small" onClick={() => deviceAct(d, "revoke")}>Thu hồi</button> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="drawer-section">
                <h4>Chấm công 14 ngày gần nhất</h4>
                {!e.recentEvents.length ? <p className="muted" style={{ fontSize: 12.5 }}>Chưa có bản ghi.</p> : (
                  <div className="card detail-list">
                    {e.recentEvents.slice(0, 12).map((ev) => (
                      <div key={ev.id} className="detail-row">
                        <span>{fmtDateTime(ev.occurredAt, tz)} · {ev.kind === "in" ? "Vào ca" : "Ra ca"}{ev.offline ? " · offline" : ""}</span>
                        <b>{ev.status === "accepted" ? (ev.deviationMinutes > 0 ? <span className="text-red">{ev.kind === "in" ? "Muộn" : "Sớm"} {ev.deviationMinutes} phút</span> : <span className="text-green">Hợp lệ</span>) : <span className="text-red">{REJECT_REASON[ev.rejectReason ?? ""] ?? "Bị từ chối"}</span>}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {can(me, "audit.read") && e.audit.length ? (
            <div className="drawer-section">
              <h4>Lịch sử thay đổi</h4>
              <ul className="version-list">{e.audit.slice(0, 15).map((a) => <li key={a.id}>{fmtDateTime(a.createdAt, tz)} · {AUDIT[a.action] ?? a.action} · {a.actor}{a.reason ? ` — ${a.reason}` : ""}</li>)}</ul>
            </div>
          ) : null}
        </>
      )}
      {ask ? <ReasonModal {...ask} onClose={() => setAsk(null)} onDone={after} /> : null}
    </Drawer>
  );
}

function EmployeeForm({ org, employee, onClose, onSaved }: { org: OrgOptions; employee: EmployeeDetail | null; onClose: () => void; onSaved: (id: string) => void }) {
  const me = useMe();
  const today = tenantToday(me.tenant.timezone);
  const [f, setF] = useState({
    employeeCode: employee?.code ?? "", fullName: employee?.fullName ?? "", workEmail: employee?.email ?? "", phone: employee?.phone ?? "",
    hireDate: employee?.hireDate ?? today, employmentType: (employee?.employmentType ?? "probation") as EmploymentType, status: (employee?.status ?? "active") as EmployeeStatus,
    departmentId: employee?.department?.id ?? "", positionId: employee?.position?.id ?? "", managerEmployeeId: employee?.manager?.id ?? "",
    effectiveFrom: today, sendInvite: true,
  });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr(null); };
  const placementChanged = !!employee && (f.departmentId !== (employee.department?.id ?? "") || f.positionId !== (employee.position?.id ?? "") || f.managerEmployeeId !== (employee.manager?.id ?? ""));

  async function save() {
    if (!f.fullName.trim() || !f.employeeCode.trim() || !f.workEmail.trim() || !f.departmentId || !f.positionId) { setErr("Điền đủ họ tên, mã, email công ty, phòng ban và chức danh."); return; }
    const body: Record<string, unknown> = { ...f, phone: f.phone || null, managerEmployeeId: f.managerEmployeeId || null };
    if (employee) { delete body.sendInvite; if (!placementChanged) { delete body.departmentId; delete body.positionId; delete body.managerEmployeeId; delete body.effectiveFrom; } }
    else delete body.status;
    let id = employee?.id ?? "";
    const ok = await run("save", async () => {
      const r = employee ? await call<EmployeeDetail>("PATCH", `employees/${employee.id}`, body) : await call<EmployeeDetail>("POST", "employees", body);
      id = r.id;
    }, employee ? "Đã lưu hồ sơ" : f.sendInvite ? "Đã tạo hồ sơ và gửi lời mời kích hoạt" : "Đã tạo hồ sơ");
    if (ok) onSaved(id);
  }

  return (
    <Modal wide title={employee ? `Sửa hồ sơ ${employee.fullName}` : "Thêm nhân viên"} sub={employee ? "Đổi phòng ban/chức danh/quản lý sẽ tạo phân công mới từ ngày hiệu lực, giữ lịch sử cũ." : undefined} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : employee ? "Lưu thay đổi" : "Tạo hồ sơ"}</button></>}>
      <div className="form-grid">
        <Field label="Họ và tên"><input value={f.fullName} onChange={set("fullName")} placeholder="Nguyễn Văn A" /></Field>
        <Field label="Mã nhân viên"><input value={f.employeeCode} onChange={set("employeeCode")} placeholder="HD0301" /></Field>
        <Field label="Email công ty" hint={employee?.account === "active" || employee?.account === "locked" ? "Đã kích hoạt: không đổi được email đăng nhập" : undefined}>
          <input type="email" value={f.workEmail} onChange={set("workEmail")} disabled={employee?.account === "active" || employee?.account === "locked"} />
        </Field>
        <Field label="Điện thoại"><input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Phòng ban"><Select value={f.departmentId} onChange={set("departmentId")}><option value="">Chọn phòng ban</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Chức danh"><Select value={f.positionId} onChange={set("positionId")}><option value="">Chọn chức danh</option>{org.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Quản lý trực tiếp"><Select value={f.managerEmployeeId} onChange={set("managerEmployeeId")}><option value="">Không có</option>{org.employees.filter((x) => x.id !== employee?.id).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}</option>)}</Select></Field>
        <Field label="Ngày vào làm"><input type="date" value={f.hireDate} onChange={set("hireDate")} /></Field>
        <Field label="Loại hợp đồng"><Select value={f.employmentType} onChange={set("employmentType")}>{Object.entries(EMPLOYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {employee ? <Field label="Trạng thái làm việc"><Select value={f.status} onChange={set("status")}>{Object.entries(EMP_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select></Field> : null}
        {placementChanged ? <Field label="Hiệu lực thay đổi phòng ban/chức danh từ"><input type="date" value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field> : null}
        {!employee ? <label className="check-row" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={f.sendInvite} onChange={(e) => setF({ ...f, sendInvite: e.target.checked })} /> Gửi email mời kích hoạt ngay</label> : null}
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function BulkInvite({ rows, onClose, onDone }: { rows: EmployeeListItem[]; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [r, setR] = useState<BulkInviteResult | null>(null);
  return (
    <Modal title={`Gửi lời mời kích hoạt cho ${rows.length} người?`} sub="Mỗi người nhận một email hướng dẫn kích hoạt Kavor bằng mã nhân viên và email công ty. Người không đủ điều kiện sẽ được bỏ qua." onClose={onClose}
      foot={r ? <button className="btn primary" onClick={onClose}>Xong</button> : <><button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={!!busy} onClick={() => run("bulk", async () => { const x = await call<BulkInviteResult>("POST", "employees/invite", { employeeIds: rows.map((e) => e.id) }); setR(x); onDone(); }, "Đã gửi lời mời")}>{busy ? "Đang gửi…" : "Gửi lời mời"}</button></>}>
      {r ? <div className="card detail-list">
        <div className="detail-row"><span>Đã gửi</span><b>{r.sent}</b></div>
        {r.skipped.map((x, i) => <div key={i} className="detail-row"><span>{x.code}</span><b style={{ whiteSpace: "normal" }}>{x.reason}</b></div>)}
      </div> : <p className="muted" style={{ fontSize: 12, margin: 0 }}>{rows.slice(0, 8).map((e) => `${e.fullName} (${e.code})`).join(", ")}{rows.length > 8 ? ` và ${rows.length - 8} người khác` : ""}.</p>}
    </Modal>
  );
}

export default function Page() { return <Suspense><EmployeesPage /></Suspense>; }
