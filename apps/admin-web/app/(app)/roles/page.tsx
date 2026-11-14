"use client";
/* Vai trò & phân quyền: bám page-roles của Kavor HR Admin Prototype.html (bảng Vai trò / Người dùng / Phạm vi mặc định / Dữ liệu lương /
   Lần cập nhật / Trạng thái), dữ liệu thật. Khác prototype: nút "Tạo vai trò" thành "Gán vai trò" (chưa có vai trò tùy chỉnh — docs/plans/org-roles.md);
   thêm drawer chi tiết vai trò (quyền, người được gán, thu hồi) và form gán theo phạm vi + ngày hiệu lực (PERMISSION_MATRIX §11). */
import { useState } from "react";
import type { OrgOptions, RoleAssignmentRow, RoleInfo, RolesBoard, ScopeType } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { PageActions, ACCOUNT, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, fmtDate, num, useAction, useMe } from "../../_ui/kit";
import { Hint, Select, Skeleton } from "@kavor/web-ui";

const SCOPE: Record<string, string> = { tenant: "Toàn công ty", legal_entity: "Pháp nhân", branch: "Chi nhánh", department: "Phòng ban", direct_reports: "Nhân viên trực tiếp", self: "Bản thân" };
const STATE: Record<RoleAssignmentRow["state"], [string, string]> = { active: ["Đang hiệu lực", ""], future: ["Sắp hiệu lực", "info"], ended: ["Đã kết thúc", "muted"] };

/* Mã quyền -> (phân hệ, mức) cho ma trận; mã chưa map rơi vào "Khác". v = Xem, s = Tạo/sửa, a = Duyệt/khóa. Chỉ để hiển thị, không quyết định quyền. */
const PMODS: Array<[string, string]> = [["nv", "Nhân viên & hồ sơ"], ["cc", "Chấm công & thiết bị"], ["np", "Nghỉ phép"], ["don", "Đơn từ"], ["luong", "Lương & tạm ứng"], ["tl", "Tài liệu"], ["bt", "Bản tin"], ["ch", "Cấu hình doanh nghiệp"], ["nk", "Nhật ký hệ thống"]];
const PERM_MAP: Record<string, string> = {
  "employee.read": "nv.v", "employee.self.read": "nv.v", "employee.sensitive.read": "nv.v", "employee.create": "nv.s", "employee.update": "nv.s",
  "attendance.read": "cc.v", "schedule.read": "cc.v", "overtime.read": "cc.v", "attendance.self.clock": "cc.s", "attendance.device.manage": "cc.s", "schedule.manage": "cc.s", "timesheet.lock": "cc.a", "timesheet.unlock": "cc.a",
  "leave.read": "np.v", "leave.manage": "np.s",
  "request.read": "don.v", "request.self.create": "don.s", "request.hr_review": "don.a", "approval.pending": "don.v",
  "compensation.read": "luong.v", "payroll.read": "luong.v", "payroll.self.read": "luong.v", "compensation.manage": "luong.s", "payroll.import": "luong.s", "payroll.config.manage": "luong.s",
  "payroll.approve": "luong.a", "payroll.publish": "luong.a", "payroll.cycle.reopen": "luong.a", "salary_advance.process": "luong.a",
  "document.read": "tl.v", "document.self.read": "tl.v", "document.upload": "tl.s", "document.manage": "tl.s",
  "announcement.read": "bt.v", "announcement.publish": "bt.s",
  "tenant.read": "ch.v", "organization.read": "ch.v", "policy.read": "ch.v", "role.read": "ch.v", "privacy.read": "ch.v",
  "tenant.settings.manage": "ch.s", "organization.manage": "ch.s", "policy.manage": "ch.s", "role.assign": "ch.s", "membership.invite": "ch.s", "membership.disable": "ch.s", "workflow.manage": "ch.s", "support_access.approve": "ch.a",
  "audit.read": "nk.v",
};
const LEVELS: Array<[string, string]> = [["v", "Xem"], ["s", "Tạo, sửa"], ["a", "Duyệt, khóa"]];

export default function RolesPage() {
  const me = useMe();
  const { data: b, error, reload, setData } = useApi<RolesBoard>("roles");
  const [open, setOpen] = useState<string | null>(null);
  const [assign, setAssign] = useState<string | "any" | null>(null);
  const role = b?.roles.find((r) => r.code === open) ?? b?.roles[0] ?? null;
  const idle = (b?.roles ?? []).filter((r) => !r.members).map((r) => r.name);
  return (
    <section className="page active">
      <PageActions>{b?.canAssign ? <button className="btn primary" onClick={() => setAssign("any")}><Icon name="plus" /> Gán vai trò</button> : null}</PageActions>
      <LoadError error={error} retry={reload} />
      {idle.length ? <div className="note-amber note-icon" style={{ marginBottom: 16 }}><Icon name="alert" /><span><b>{idle.length} vai trò chưa có ai giữ:</b> {idle.join(", ")}. Đơn đến bước duyệt của các vai trò này sẽ dừng lại.</span></div> : null}
      {b && !b.roles.length ? <article className="card"><Empty title="Chưa có vai trò" /></article> : (
        <div className="grid roles-grid">
          <section className="card roles-list">
            {!b && !error ? <Skeleton w="100%" h={260} /> : null}
            {(b?.roles ?? []).map((r) => (
              <button key={r.code} type="button" className={`rolebtn ${r.code === role?.code ? "on" : ""}`} onClick={() => setOpen(r.code)}>
                <span className="rl-spread"><b>{r.name}</b><Status v={r.sensitive ? ["Nhạy cảm", "warn"] : r.code === "auditor" ? ["Giới hạn", "info"] : ["Hệ thống", ""]} /></span>
                <span className="muted rb-desc">{r.description}</span>
                <span className="rl-spread"><span className="muted">{r.defaultScope}</span>{r.members ? <b>{num(r.members)} người</b> : <b className="rb-idle">Chưa gán cho ai</b>}</span>
              </button>
            ))}
          </section>
          {role && b ? <RoleDetail r={role} canAssign={b.canAssign} hint={me.permissions.includes("role.assign")} onAssign={() => setAssign(role.code)} onDone={setData} /> : null}
        </div>
      )}
      {assign && b ? <AssignModal board={b} roleCode={assign === "any" ? null : assign} onClose={() => setAssign(null)} onDone={setData} /> : null}
    </section>
  );
}

function RoleDetail({ r, canAssign, hint, onAssign, onDone }: { r: RoleInfo; canAssign: boolean; hint: boolean; onAssign: () => void; onDone: (b: RolesBoard) => void }) {
  const [revoking, setRevoking] = useState<RoleAssignmentRow | null>(null);
  const [ended, setEnded] = useState(false);
  const rows = r.assignments.filter((a) => ended || a.state !== "ended");
  const cells = new Map<string, string[]>();
  const other: Array<{ code: string; description: string }> = [];
  for (const p of r.permissions) {
    const m = PERM_MAP[p.code];
    if (m) cells.set(m, [...(cells.get(m) ?? []), p.code]); else other.push(p);
  }
  return (
    <div className="rl-stack">
      <section className="card">
        <div className="card-head"><div style={{ minWidth: 0 }}><h3>{r.name}<Hint text={`Một người giữ được nhiều vai trò, quyền cộng dồn (ví dụ Quản trị viên công ty kiêm Nhân sự vận hành): gán vai trò mới không thay vai trò đang có. Vai trò Nhân viên được gán tự động khi kích hoạt tài khoản. Quyền thay đổi có hiệu lực ngay ở thao tác kế tiếp của người đó.${hint ? "" : " Chỉ quản trị viên công ty được gán hoặc thu hồi vai trò."}`} /></h3>
          <span className="muted" style={{ display: "block", fontSize: 12 }}>Phạm vi mặc định: {r.defaultScope} · Dữ liệu lương: {r.payrollData} · Gán theo: {r.allowedScopes.map((s) => SCOPE[s]).join(", ")}</span></div>
          {canAssign ? <button className="btn small" onClick={onAssign}><Icon name="plus" /> Gán cho nhân viên</button> : null}</div>
        <div className="card-body">
          <div className="table-wrap"><table className="pm"><thead><tr><th>Phân hệ</th>{LEVELS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead><tbody>
            {PMODS.map(([k, l]) => { const any = LEVELS.some(([c]) => cells.has(`${k}.${c}`)); return (
              <tr key={k}><td className={any ? "rl-strong" : "muted"}>{l}</td>{LEVELS.map(([c, cl]) => { const codes = cells.get(`${k}.${c}`); return (
                <td key={c}><span className={`pcb ${codes ? "on" : ""}`} title={codes?.join(", ")} role="img" aria-label={`${l}: ${cl}: ${codes ? "có" : "không"}`}>{codes ? <Icon name="check" size={16} /> : null}</span></td>); })}</tr>); })}
            {other.length ? <tr><td className="rl-strong">Khác</td><td colSpan={3} style={{ textAlign: "left" }}>{other.map((p) => <span key={p.code} className="tag" title={p.description} style={{ marginRight: 6 }}>{p.code}</span>)}</td></tr> : null}
          </tbody></table></div>
          <details style={{ marginTop: 12 }}><summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>Danh sách mã quyền ({r.permissions.length})</summary>
            <div className="card detail-list" style={{ marginTop: 8 }}>{r.permissions.map((p) => <div key={p.code} className="detail-row"><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{p.code}</span><b style={{ whiteSpace: "normal", fontWeight: 500 }}>{p.description}</b></div>)}</div>
          </details>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h3>Người đang giữ vai trò</h3>
          <label className="check-row" style={{ fontSize: 12.5, margin: 0 }}><input type="checkbox" checked={ended} onChange={(e) => setEnded(e.target.checked)} /> Hiện cả bản gán đã kết thúc</label></div>
        {rows.length ? <div className="card-body"><div className="card detail-list">
          {rows.map((a) => (
            <div key={a.id} className="detail-row" style={{ gridTemplateColumns: "1fr auto", minHeight: 56 }}>
              <span style={{ color: "var(--ink)" }}><Person name={a.employee.fullName} seed={a.employee.code} sub={`${a.employee.code} · ${a.scopeName} · từ ${fmtDate(a.effectiveFrom)}${a.effectiveTo ? ` đến ${fmtDate(a.effectiveTo)}` : ""}`} /></span>
              <span className="row-actions"><Status v={STATE[a.state]} />{a.state !== "active" ? null : <Status v={ACCOUNT[a.account]} />}
                {canAssign && a.state !== "ended" ? <button className="btn small danger" onClick={() => setRevoking(a)}>Thu hồi</button> : null}</span>
            </div>
          ))}
        </div></div> : <Empty title="Chưa ai giữ vai trò này" text={r.code === "auditor" ? "Gán khi cần người chỉ xem dữ liệu, ví dụ kiểm toán nội bộ." : "Gán cho ít nhất một người để luồng duyệt không bị dừng."} />}
      </section>
      {revoking ? <RevokeModal r={r} a={revoking} onClose={() => setRevoking(null)} onDone={onDone} /> : null}
    </div>
  );
}

function AssignModal({ board, roleCode, onClose, onDone }: { board: RolesBoard; roleCode: string | null; onClose: () => void; onDone: (b: RolesBoard) => void }) {
  const org = useApi<OrgOptions>("org").data;
  const [f, setF] = useState({ employeeId: "", roleCode: roleCode ?? "hr_ops", scopeType: "" as ScopeType | "", scopeId: "", effectiveFrom: board.today, effectiveTo: "", q: "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const role = board.roles.find((r) => r.code === f.roleCode)!;
  const scopeType = (f.scopeType && role.allowedScopes.includes(f.scopeType) ? f.scopeType : role.allowedScopes[0]) as ScopeType;
  const units = scopeType === "legal_entity" ? org?.legalEntities : scopeType === "branch" ? org?.branches : scopeType === "department" ? org?.departments : null;
  /* Vai trò người được chọn đang giữ (còn hiệu lực): gán thêm, không thay */
  const held = f.employeeId ? board.roles.filter((r) => r.assignments.some((a) => a.employee.id === f.employeeId && a.state === "active")).map((r) => r.name) : [];
  const emps = (org?.employees ?? []).filter((e) => !f.q.trim() || `${e.name} ${e.code}`.toLowerCase().includes(f.q.trim().toLowerCase()));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value, ...(k === "roleCode" || k === "scopeType" ? { scopeId: "" } : {}) }); setErr(null); };
  async function save() {
    if (!f.employeeId) { setErr("Chọn nhân viên."); return; }
    if (units && !f.scopeId) { setErr(`Chọn ${SCOPE[scopeType]!.toLowerCase()}.`); return; }
    await run("assign", async () => {
      onDone(await call<RolesBoard>("POST", "roles/assignments", { employeeId: f.employeeId, roleCode: f.roleCode, scopeType, scopeId: units ? f.scopeId : null, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || null }));
      onClose();
    }, `Đã gán ${role.name}`);
  }
  return (
    <Modal title="Gán vai trò" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Gán vai trò"}</button></>}>
      <div className="form-grid">
        <Field label="Tìm nhân viên" full><input value={f.q} onChange={set("q")} placeholder="Lọc theo tên hoặc mã…" /></Field>
        <Field label="Nhân viên" full><Select value={f.employeeId} onChange={set("employeeId")}><option value="">Chọn…</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.code}</option>)}</Select></Field>
        <Field label="Vai trò"><Select value={f.roleCode} onChange={set("roleCode")}>{board.roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</Select></Field>
        <Field label="Phạm vi"><Select value={scopeType} onChange={set("scopeType")}>{role.allowedScopes.map((s) => <option key={s} value={s}>{SCOPE[s]}</option>)}</Select></Field>
        {units ? <Field label={SCOPE[scopeType]!} full><Select value={f.scopeId} onChange={set("scopeId")}><option value="">Chọn…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field> : null}
        <Field label="Hiệu lực từ"><input type="date" min={board.today} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field>
        <Field label="Đến (không bắt buộc)"><input type="date" min={f.effectiveFrom} value={f.effectiveTo} onChange={set("effectiveTo")} /></Field>
      </div>
      {held.length ? <p className="muted" style={{ fontSize: 12, margin: "12px 0 0" }}>
        Đang giữ: <b>{held.join(", ")}</b>. {role.name} sẽ được thêm, các vai trò đang giữ vẫn giữ nguyên.</p> : null}
      {role.sensitive ? <div className="note-amber" style={{ marginTop: 14 }}>
        {role.name} có quyền nhạy cảm ({role.code === "payroll" ? "lương, tạm ứng, tài khoản ngân hàng" : role.code === "hr_ops" ? "mức lương, người phụ thuộc, tài khoản ngân hàng của nhân viên" : "toàn quyền quản trị công ty, gán vai trò, mức lương"}). Chỉ gán cho người đã được công ty chấp thuận.</div> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}

function RevokeModal({ r, a, onClose, onDone }: { r: RoleInfo; a: RoleAssignmentRow; onClose: () => void; onDone: (b: RolesBoard) => void }) {
  const [reason, setReason] = useState("");
  const { busy, run } = useAction();
  return (
    <Modal title={`Thu hồi ${r.name} của ${a.employee.fullName}?`} sub={`Phạm vi ${a.scopeName}. Có hiệu lực ngay ở thao tác kế tiếp của người đó.`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn danger" disabled={!!busy} onClick={() => run("revoke", async () => { onDone(await call<RolesBoard>("POST", `roles/assignments/${a.id}/revoke`, { reason: reason.trim() || null })); onClose(); }, "Đã thu hồi vai trò")}>{busy ? "Đang xử lý…" : "Thu hồi"}</button></>}>
      <Field label="Lý do (không bắt buộc)" full><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Hết kiêm nhiệm" /></Field>
    </Modal>
  );
}
