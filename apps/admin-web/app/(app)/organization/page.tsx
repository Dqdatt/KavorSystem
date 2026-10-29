"use client";
/* Cơ cấu tổ chức: bám page-organization của Kavor HR Admin Prototype.html (chỉ số + sơ đồ khối + nút "Danh sách"), dữ liệu thật.
   Thêm (thiết kế bổ sung): danh sách cây pháp nhân → chi nhánh → phòng ban, danh mục chức danh, thêm/sửa/ngừng đơn vị (docs/plans/org-roles.md).
   Chưa có: Import (nút của prototype), khối nhiều chi nhánh, vị trí định biên. */
import { useMemo, useState } from "react";
import { ORG_UNIT_KINDS, type OrgTree, type OrgUnit, type OrgUnitKind } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Status, fmtDate, num, useAction, useMe } from "../../_ui/kit";
import { Select } from "@kavor/web-ui";

type Edit = { mode: "create"; kind: OrgUnitKind; parent?: OrgUnit } | { mode: "edit"; unit: OrgUnit };

export default function OrganizationPage() {
  const me = useMe();
  const { data: t, error, reload, setData } = useApi<OrgTree>("organization", { tables: ["employees"], tenantId: me.tenant.id });
  const [list, setList] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [ending, setEnding] = useState<OrgUnit | null>(null);
  const units = useMemo(() => (t?.units ?? []).filter((u) => showEnded || u.active), [t, showEnded]);
  const depts = units.filter((u) => u.kind === "department");
  /* Nhân sự của phòng ban gồm cả phòng con */
  const total = (d: OrgUnit): number => d.employees + depts.filter((c) => c.parentId === d.id).reduce((n, c) => n + total(c), 0);
  const tops = depts.filter((d) => !d.parentId);
  const m = t?.metrics;
  return (
    <section className="page active">
      <div className="page-head"><div><p>Cấu trúc có ngày hiệu lực; đơn vị ngừng hoạt động vẫn giữ lịch sử.</p></div>
        <div className="head-actions">{t?.canManage ? <button className="btn primary" onClick={() => setEdit({ mode: "create", kind: "department" })}><Icon name="plus" /> Thêm đơn vị</button> : null}</div></div>
      <LoadError error={error} retry={reload} />
      <div className="grid three">
        <article className="card metric-card"><span className="metric-icon"><Icon name="brief" /></span><span className="metric-copy"><span>Pháp nhân</span><strong>{m ? num(m.legalEntities) : "—"}</strong><small>{m ? `${num(m.branches)} chi nhánh` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="org" /></span><span className="metric-copy"><span>Phòng ban</span><strong>{m ? num(m.departments) : "—"}</strong><small>{m ? `${num(m.positions)} chức danh` : " "}</small></span></article>
        <article className="card metric-card"><span className="metric-icon violet"><Icon name="users" /></span><span className="metric-copy"><span>Quản lý</span><strong>{m ? num(m.managers) : "—"}</strong><small>{m ? `${num(m.employees)} nhân sự đang làm` : " "}</small></span></article>
      </div>
      <article className="card">
        <div className="card-head"><div><h3>{me.tenant.name}</h3><p>Hiệu lực tại {t ? fmtDate(t.today) : "—"}</p></div>
          <div className="head-actions">
            {list ? <label className="check-row" style={{ fontSize: 11.5 }}><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> Hiện đơn vị đã ngừng</label> : null}
            <button className="btn small" onClick={() => setList(!list)}>{list ? "Sơ đồ" : "Danh sách"}</button>
          </div></div>
        {!t ? null : list ? <UnitList t={t} units={units} total={total} onEdit={setEdit} onEnd={setEnding} /> : (
          <div className="card-body" style={{ overflow: "auto" }}><div style={{ minWidth: 760, textAlign: "center", padding: "8px 0 22px" }}>
            <div className="org-root">{me.tenant.name}
              <small style={{ display: "block", color: "var(--muted)", fontWeight: 500 }}>{num(m?.employees ?? 0)} nhân sự</small></div>
            {tops.length ? <>
              <div style={{ width: 1, height: 28, background: "var(--line-strong)", margin: "auto" }} /><div style={{ height: 1, background: "var(--line-strong)", width: "70%", margin: "auto" }} />
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(tops.length, 4)},1fr)`, gap: 14, width: "88%", margin: "auto" }}>
                {tops.map((d) => {
                  const kids = depts.filter((c) => c.parentId === d.id).length;
                  const br = units.find((u) => u.id === d.branchId);
                  return (
                    <div key={d.id} style={{ paddingTop: 20 }}><div className="card card-body"><b>{d.name}</b><p className="muted">{num(total(d))} nhân sự{br ? ` · ${br.name}` : ""}</p>
                      <span className="status">{kids ? `${kids} phòng ban` : d.code}</span></div></div>
                  );
                })}
              </div>
            </> : <Empty title="Chưa có phòng ban" text="Thêm pháp nhân, chi nhánh rồi phòng ban để xếp nhân viên." />}
          </div></div>
        )}
      </article>
      {list && t ? <Positions t={t} units={units} onEdit={setEdit} onEnd={setEnding} /> : null}
      {edit && t ? <UnitModal t={t} edit={edit} onClose={() => setEdit(null)} onDone={setData} /> : null}
      {ending ? <EndModal u={ending} onClose={() => setEnding(null)} onDone={setData} /> : null}
    </section>
  );
}

function UnitList({ t, units, total, onEdit, onEnd }: { t: OrgTree; units: OrgUnit[]; total: (d: OrgUnit) => number; onEdit: (e: Edit) => void; onEnd: (u: OrgUnit) => void }) {
  /* Cây: pháp nhân → chi nhánh → phòng ban (phòng ban con thụt vào) */
  const rows: Array<{ u: OrgUnit; depth: number }> = [];
  const deptTree = (parent: string | null, branchId: string, depth: number) => units.filter((d) => d.kind === "department" && d.branchId === branchId && d.parentId === parent)
    .forEach((d) => { rows.push({ u: d, depth }); deptTree(d.id, branchId, depth + 1); });
  for (const le of units.filter((u) => u.kind === "legal_entity")) {
    rows.push({ u: le, depth: 0 });
    for (const br of units.filter((u) => u.kind === "branch" && u.parentId === le.id)) { rows.push({ u: br, depth: 1 }); deptTree(null, br.id, 2); }
  }
  const child: Partial<Record<OrgUnitKind, OrgUnitKind>> = { legal_entity: "branch", branch: "department", department: "department" };
  return (
    <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Đơn vị</th><th>Mã</th><th>Nhân sự</th><th>Hiệu lực</th><th>Trạng thái</th><th /></tr></thead><tbody>
      {rows.map(({ u, depth }) => (
        <tr key={u.id}>
          <td style={{ paddingLeft: 14 + depth * 22 }}><b>{u.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{ORG_UNIT_KINDS[u.kind]}{u.taxCode ? ` · MST ${u.taxCode}` : ""}</div></td>
          <td>{u.code}</td>
          <td className="num">{num(u.kind === "department" ? total(u) : u.employees)}</td>
          <td className="nowrap">{fmtDate(u.effectiveFrom)}{u.effectiveTo ? ` – ${fmtDate(u.effectiveTo)}` : ""}</td>
          <td><Status v={u.active ? (u.effectiveFrom > t.today ? ["Sắp hiệu lực", "info"] : ["Hoạt động", ""]) : ["Đã ngừng", "muted"]} /></td>
          <td>{t.canManage && u.active ? <span className="row-actions">
            {child[u.kind] ? <button className="btn small" onClick={() => onEdit({ mode: "create", kind: child[u.kind]!, parent: u })}><Icon name="plus" /> {ORG_UNIT_KINDS[child[u.kind]!]}</button> : null}
            <button className="btn small" onClick={() => onEdit({ mode: "edit", unit: u })}>Sửa</button>
            <button className="btn small" onClick={() => onEnd(u)}>Ngừng</button>
          </span> : null}</td>
        </tr>
      ))}
    </tbody></table></div>
  );
}

function Positions({ t, units, onEdit, onEnd }: { t: OrgTree; units: OrgUnit[]; onEdit: (e: Edit) => void; onEnd: (u: OrgUnit) => void }) {
  const ps = units.filter((u) => u.kind === "position");
  return (
    <article className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><div><h3>Chức danh</h3><p>Dùng khi thêm và chuyển công tác nhân viên</p></div>
        {t.canManage ? <button className="btn small" onClick={() => onEdit({ mode: "create", kind: "position" })}><Icon name="plus" /> Chức danh</button> : null}</div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Chức danh</th><th>Mã</th><th>Cấp bậc</th><th>Nhân sự</th><th>Trạng thái</th><th /></tr></thead><tbody>
        {ps.map((p) => (
          <tr key={p.id}><td><b>{p.name}</b></td><td>{p.code}</td><td>{p.jobLevel ?? "—"}</td><td className="num">{num(p.employees)}</td>
            <td><Status v={p.active ? ["Hoạt động", ""] : ["Đã ngừng", "muted"]} /></td>
            <td>{t.canManage && p.active ? <span className="row-actions"><button className="btn small" onClick={() => onEdit({ mode: "edit", unit: p })}>Sửa</button><button className="btn small" onClick={() => onEnd(p)}>Ngừng</button></span> : null}</td></tr>
        ))}
      </tbody></table></div>
    </article>
  );
}

function UnitModal({ t, edit, onClose, onDone }: { t: OrgTree; edit: Edit; onClose: () => void; onDone: (t: OrgTree) => void }) {
  const u = edit.mode === "edit" ? edit.unit : null;
  const [kind, setKind] = useState<OrgUnitKind>(u?.kind ?? (edit.mode === "create" ? edit.kind : "department"));
  const parent0 = edit.mode === "create" ? edit.parent : undefined;
  const [f, setF] = useState({
    code: u?.code ?? "", name: u?.name ?? "", taxCode: u?.taxCode ?? "", jobLevel: u?.jobLevel ?? "", effectiveFrom: t.today,
    legalEntityId: parent0?.kind === "legal_entity" ? parent0.id : "",
    branchId: parent0?.kind === "branch" ? parent0.id : parent0?.kind === "department" ? parent0.branchId ?? "" : "",
    parentId: parent0?.kind === "department" ? parent0.id : "",
  });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value, ...(k === "branchId" ? { parentId: "" } : {}) }); setErr(null); };
  const live = t.units.filter((x) => x.active);
  async function save() {
    if (!f.code.trim() || f.name.trim().length < 2) { setErr("Nhập mã và tên đơn vị."); return; }
    if (!u && kind === "branch" && !f.legalEntityId) { setErr("Chọn pháp nhân."); return; }
    if (!u && kind === "department" && !f.branchId) { setErr("Chọn chi nhánh."); return; }
    await run("save", async () => {
      const r = u
        ? await call<OrgTree>("PATCH", `organization/units/${u.kind}/${u.id}`, { code: f.code, name: f.name, ...(u.kind === "legal_entity" ? { taxCode: f.taxCode || null } : {}), ...(u.kind === "position" ? { jobLevel: f.jobLevel || null } : {}) })
        : await call<OrgTree>("POST", "organization/units", { kind, code: f.code, name: f.name, effectiveFrom: f.effectiveFrom, taxCode: f.taxCode || null, jobLevel: f.jobLevel || null,
            parentId: kind === "branch" ? f.legalEntityId : kind === "department" ? f.parentId || null : null, branchId: kind === "department" ? f.branchId : null });
      onDone(r); onClose();
    }, u ? "Đã lưu đơn vị" : `Đã thêm ${ORG_UNIT_KINDS[kind].toLowerCase()}`);
  }
  return (
    <Modal title={u ? `Sửa ${ORG_UNIT_KINDS[u.kind].toLowerCase()} ${u.name}` : "Thêm đơn vị"} sub={u ? "Đổi tên/mã được ghi vào nhật ký hoạt động." : "Đơn vị có hiệu lực từ ngày chọn; không thêm lùi về quá khứ."} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        {!u ? <Field label="Loại đơn vị"><Select value={kind} onChange={(e) => { setKind(e.target.value as OrgUnitKind); setErr(null); }}>{(Object.keys(ORG_UNIT_KINDS) as OrgUnitKind[]).map((k) => <option key={k} value={k}>{ORG_UNIT_KINDS[k]}</option>)}</Select></Field> : null}
        {!u ? <Field label="Hiệu lực từ"><input type="date" min={t.today} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field> : null}
        <Field label="Mã"><input value={f.code} onChange={set("code")} placeholder="MKT-DIG" /></Field>
        <Field label="Tên"><input value={f.name} onChange={set("name")} placeholder={kind === "position" ? "Chuyên viên dữ liệu" : "Digital Marketing"} /></Field>
        {!u && kind === "branch" ? <Field label="Thuộc pháp nhân" full><Select value={f.legalEntityId} onChange={set("legalEntityId")}><option value="">Chọn…</option>{live.filter((x) => x.kind === "legal_entity").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field> : null}
        {!u && kind === "department" ? <>
          <Field label="Chi nhánh"><Select value={f.branchId} onChange={set("branchId")}><option value="">Chọn…</option>{live.filter((x) => x.kind === "branch").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Phòng ban cha (không bắt buộc)"><Select value={f.parentId} onChange={set("parentId")} disabled={!f.branchId}><option value="">— Cấp cao nhất —</option>{live.filter((x) => x.kind === "department" && x.branchId === f.branchId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        </> : null}
        {(u?.kind ?? kind) === "legal_entity" ? <Field label="Mã số thuế"><input value={f.taxCode} onChange={set("taxCode")} inputMode="numeric" /></Field> : null}
        {(u?.kind ?? kind) === "position" ? <Field label="Cấp bậc (không bắt buộc)"><input value={f.jobLevel} onChange={set("jobLevel")} placeholder="L2" /></Field> : null}
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function EndModal({ u, onClose, onDone }: { u: OrgUnit; onClose: () => void; onDone: (t: OrgTree) => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (reason.trim().length < 5) { setErr("Ghi lý do (ít nhất 5 ký tự)."); return; }
    await run("end", async () => { onDone(await call<OrgTree>("POST", `organization/units/${u.kind}/${u.id}/end`, { reason })); onClose(); }, `Đã ngừng ${u.name}`);
  }
  return (
    <Modal title={`Ngừng ${ORG_UNIT_KINDS[u.kind].toLowerCase()} ${u.name}?`} sub="Hết hiệu lực từ hôm nay và không còn trong danh sách chọn. Cần chuyển hết nhân viên, đơn vị con, vai trò và quy định gắn với đơn vị này trước." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn danger" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Ngừng đơn vị"}</button></>}>
      <Field label="Lý do" full><input value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="Ví dụ: Sáp nhập vào phòng Marketing" autoFocus /></Field>
      <ErrorLine text={err} />
    </Modal>
  );
}
