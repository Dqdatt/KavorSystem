"use client";
/* Vai trò & phân quyền: bám page-roles của Kavor HR Admin Prototype.html (bảng Vai trò / Người dùng / Phạm vi mặc định / Dữ liệu lương /
   Lần cập nhật / Trạng thái), dữ liệu thật. Khác prototype: nút "Tạo vai trò" thành "Gán vai trò" (chưa có vai trò tùy chỉnh — docs/plans/org-roles.md);
   thêm drawer chi tiết vai trò (quyền, người được gán, thu hồi) và form gán theo phạm vi + ngày hiệu lực (PERMISSION_MATRIX §11). */
import { useState } from "react";
import type { OrgOptions, RoleAssignmentRow, RoleInfo, RolesBoard, ScopeType } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { ACCOUNT, Drawer, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, fmtDate, num, useAction, useMe } from "../../_ui/kit";
import { Select } from "@kavor/web-ui";

const SCOPE: Record<string, string> = { tenant: "Toàn công ty", legal_entity: "Pháp nhân", branch: "Chi nhánh", department: "Phòng ban", direct_reports: "Nhân viên trực tiếp", self: "Bản thân" };
const STATE: Record<RoleAssignmentRow["state"], [string, string]> = { active: ["Đang hiệu lực", ""], future: ["Sắp hiệu lực", "info"], ended: ["Đã kết thúc", "muted"] };

export default function RolesPage() {
  const me = useMe();
  const { data: b, error, reload, setData } = useApi<RolesBoard>("roles");
  const [open, setOpen] = useState<string | null>(null);
  const [assign, setAssign] = useState<string | "any" | null>(null);
  const role = b?.roles.find((r) => r.code === open) ?? null;
  return (
    <section className="page active">
      <div className="page-head"><div><p>Quyền được áp dụng theo vai trò và phạm vi pháp nhân/chi nhánh/phòng ban.</p></div>
        {b?.canAssign ? <button className="btn primary" onClick={() => setAssign("any")}><Icon name="plus" /> Gán vai trò</button> : null}</div>
      <LoadError error={error} retry={reload} />
      <article className="card">
        {b && !b.roles.length ? <Empty title="Chưa có vai trò" /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Vai trò</th><th>Người dùng</th><th>Phạm vi mặc định</th><th>Dữ liệu lương</th><th>Lần cập nhật</th><th>Trạng thái</th></tr></thead><tbody>
            {(b?.roles ?? []).map((r) => (
              <tr key={r.code} className="clickable" onClick={() => setOpen(r.code)}>
                <td><b>{r.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{r.description}</div></td>
                <td className="num">{num(r.members)}</td><td>{r.defaultScope}</td><td>{r.payrollData}</td>
                <td>{r.updatedAt ? fmtDate(r.updatedAt) : "—"}</td>
                <td><Status v={r.sensitive ? ["Nhạy cảm", "warn"] : r.code === "auditor" ? ["Giới hạn", "info"] : ["Hệ thống", ""]} /></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Vai trò Nhân viên được gán tự động khi kích hoạt tài khoản. Quyền thay đổi có hiệu lực ngay ở thao tác kế tiếp của người đó. {me.permissions.includes("role.assign") ? "" : "Chỉ Tenant Admin được gán hoặc thu hồi vai trò."}</p>
      {role && b ? <RoleDrawer r={role} canAssign={b.canAssign} onClose={() => setOpen(null)} onAssign={() => setAssign(role.code)} onDone={setData} /> : null}
      {assign && b ? <AssignModal board={b} roleCode={assign === "any" ? null : assign} onClose={() => setAssign(null)} onDone={setData} /> : null}
    </section>
  );
}

function RoleDrawer({ r, canAssign, onClose, onAssign, onDone }: { r: RoleInfo; canAssign: boolean; onClose: () => void; onAssign: () => void; onDone: (b: RolesBoard) => void }) {
  const [revoking, setRevoking] = useState<RoleAssignmentRow | null>(null);
  const [ended, setEnded] = useState(false);
  const rows = r.assignments.filter((a) => ended || a.state !== "ended");
  return (
    <Drawer onClose={onClose} head={<><div><b>{r.name}</b><div className="muted" style={{ fontSize: 10 }}>{r.code}</div></div>{canAssign ? <button className="btn small primary" style={{ marginLeft: "auto" }} onClick={onAssign}><Icon name="plus" /> Gán vai trò này</button> : null}</>}>
      <div className="card detail-list">
        <div className="detail-row"><span>Mô tả</span><b style={{ whiteSpace: "normal" }}>{r.description}</b></div>
        <div className="detail-row"><span>Phạm vi được gán</span><b>{r.allowedScopes.map((s) => SCOPE[s]).join(", ")}</b></div>
        <div className="detail-row"><span>Dữ liệu lương</span><b>{r.payrollData}</b></div>
      </div>
      <div className="drawer-section"><h4>Người được gán</h4>
        <label className="check-row" style={{ fontSize: 11.5, marginBottom: 8 }}><input type="checkbox" checked={ended} onChange={(e) => setEnded(e.target.checked)} /> Hiện cả bản gán đã kết thúc</label>
        {rows.length ? <div className="card detail-list">
          {rows.map((a) => (
            <div key={a.id} className="detail-row" style={{ gridTemplateColumns: "1fr auto", minHeight: 56 }}>
              <span style={{ color: "var(--ink)" }}><Person name={a.employee.fullName} seed={a.employee.code} sub={`${a.employee.code} · ${a.scopeName} · từ ${fmtDate(a.effectiveFrom)}${a.effectiveTo ? ` đến ${fmtDate(a.effectiveTo)}` : ""}`} /></span>
              <span className="row-actions"><Status v={STATE[a.state]} />{a.state !== "active" ? null : <Status v={ACCOUNT[a.account]} />}
                {canAssign && a.state !== "ended" ? <button className="btn small danger" onClick={() => setRevoking(a)}>Thu hồi</button> : null}</span>
            </div>
          ))}
        </div> : <p className="muted" style={{ fontSize: 12 }}>Chưa có ai.</p>}
      </div>
      <div className="drawer-section"><h4>Quyền ({r.permissions.length})</h4>
        <div className="card detail-list">{r.permissions.map((p) => <div key={p.code} className="detail-row"><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{p.code}</span><b style={{ whiteSpace: "normal", fontWeight: 500 }}>{p.description}</b></div>)}</div>
      </div>
      {revoking ? <RevokeModal r={r} a={revoking} onClose={() => setRevoking(null)} onDone={onDone} /> : null}
    </Drawer>
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
      {role.sensitive ? <div className="note-amber" style={{ marginTop: 14 }}>
        {role.name} có quyền nhạy cảm ({role.code === "payroll" ? "lương, tạm ứng, tài khoản ngân hàng" : "toàn quyền quản trị công ty, gán vai trò"}). Chỉ gán cho người đã được công ty chấp thuận.</div> : null}
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
