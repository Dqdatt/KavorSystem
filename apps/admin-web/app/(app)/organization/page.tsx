"use client";
/* Cơ cấu tổ chức: bám PAGES['co-cau'] của Kavor HR Admin Prototype v2.html (3 tab Sơ đồ · Đơn vị · Chức danh), dữ liệu thật.
   Chưa có: Import, vị trí định biên. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MANAGEMENT_TIERS, ORG_UNIT_KINDS, type EmployeeListItem, type ManagementTier, type OrgOptions, type OrgTree, type OrgUnit, type OrgUnitKind } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { PageActions, Avatar, Empty, ErrorLine, Field, Icon, LoadError, Modal, MoreMenu, Person, Status, can, fmtDate, num, useAction, useMe } from "../../_ui/kit";
import { StructureModal } from "../../_ui/structure-plan";
import { Select, Skeleton, SkeletonLines } from "@kavor/web-ui";

type Edit = { mode: "create"; kind: OrgUnitKind; parent?: OrgUnit } | { mode: "edit"; unit: OrgUnit };
type Tab = "tree" | "unit" | "title";

export default function OrganizationPage() {
  const me = useMe();
  const router = useRouter();
  const tab = (useSearchParams().get("tab") as Tab | null) ?? "tree";
  const { data: t, error, reload, setData } = useApi<OrgTree>("organization", { tables: ["employees"], tenantId: me.tenant.id });
  const staff = useApi<EmployeeListItem[]>(can(me, "employee.read") ? "employees?status=working&account=all" : null, { tables: ["employees"], tenantId: me.tenant.id });
  const [showEnded, setShowEnded] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [ending, setEnding] = useState<OrgUnit | null>(null);
  const [arranging, setArranging] = useState(false);
  const [open, setOpen] = useState<OrgUnit | null>(null);
  const units = useMemo(() => (t?.units ?? []).filter((u) => showEnded || u.active), [t, showEnded]);
  const depts = units.filter((u) => u.kind === "department");
  /* Nhân sự của phòng ban gồm cả phòng con */
  const total = (d: OrgUnit): number => d.employees + depts.filter((c) => c.parentId === d.id).reduce((n, c) => n + total(c), 0);
  const ids = (d: OrgUnit): string[] => [d.id, ...depts.filter((c) => c.parentId === d.id).flatMap(ids)];
  const members = (d: OrgUnit) => { const s = new Set(ids(d)); return (staff.data ?? []).filter((e) => e.department && s.has(e.department.id)); };
  const m = t?.metrics;
  const go = (k: Tab) => router.replace(`/organization?tab=${k}`, { scroll: false });
  const tabs: Array<[Tab, string, number | undefined]> = [["tree", "Sơ đồ", undefined], ["unit", "Đơn vị", units.filter((u) => u.kind !== "position").length || undefined], ["title", "Chức danh", m?.positions]];
  return (
    <section className="page active">
      <PageActions>{t?.canManage ? <>{can(me, "employee.update") ? <button className="btn" onClick={() => setArranging(true)}><Icon name="org" /> Sắp xếp tự động</button> : null}
          <button className="btn primary" onClick={() => setEdit({ mode: "create", kind: tab === "title" ? "position" : "department" })}><Icon name="plus" /> {tab === "title" ? "Thêm chức danh" : "Thêm đơn vị"}</button></> : null}</PageActions>
      <div className="page-head"><div><div className="segmented" role="tablist">{tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => go(k)}>{l}{n != null ? <span className="n">{n}</span> : null}</button>)}</div></div>
        <span className="muted" style={{ fontSize: 13 }}>{m ? `${num(m.legalEntities)} pháp nhân · ${num(m.branches)} chi nhánh · ${num(m.departments)} phòng ban, ${num(m.positions)} chức danh. Hiệu lực tại ${fmtDate(t?.today)}.` : <Skeleton w={260} h={14} />}</span></div>
      <LoadError error={error} retry={reload} />
      {arranging ? <StructureModal onClose={() => setArranging(false)} onDone={() => void reload()} /> : null}
      {!t ? (error ? null : <article className="card"><SkeletonLines lines={5} /></article>) : tab === "tree" ? <Tree t={t} units={units} name={me.tenant.name} total={total} members={members} onOpen={setOpen} />
        : tab === "unit" ? <UnitList t={t} units={units} total={total} showEnded={showEnded} setShowEnded={setShowEnded} onOpen={setOpen} onEdit={setEdit} onEnd={setEnding} />
        : <Positions t={t} units={units} showEnded={showEnded} setShowEnded={setShowEnded} onEdit={setEdit} onEnd={setEnding} />}
      {open && t ? <UnitDetail u={open} t={t} members={members(open)} total={total(open)} loaded={!!staff.data || !can(me, "employee.read")} onClose={() => setOpen(null)}
        onEdit={() => { setEdit({ mode: "edit", unit: open }); setOpen(null); }} onEnd={() => { setEnding(open); setOpen(null); }} /> : null}
      {edit && t ? <UnitModal t={t} edit={edit} onClose={() => setEdit(null)} onDone={setData} /> : null}
      {ending ? <EndModal u={ending} onClose={() => setEnding(null)} onDone={setData} /> : null}
    </section>
  );
}

function Tree({ t, units, name, total, members, onOpen }: { t: OrgTree; units: OrgUnit[]; name: string; total: (d: OrgUnit) => number; members: (d: OrgUnit) => EmployeeListItem[]; onOpen: (u: OrgUnit) => void }) {
  const branches = units.filter((u) => u.kind === "branch");
  const le = units.find((u) => u.kind === "legal_entity");
  if (!units.some((u) => u.kind === "department")) return <article className="card"><Empty title="Chưa có phòng ban" text="Thêm pháp nhân, chi nhánh rồi phòng ban để xếp nhân viên." /></article>;
  return (
    <section className="card"><div className="card-body"><div className="orgtree">
      <div className="orgroot">{le?.name ?? name}<div style={{ opacity: .85, fontWeight: 400, fontSize: 12.5 }}>Pháp nhân · {num(t.metrics.employees)} nhân sự</div></div>
      {branches.map((br) => {
        const tops = units.filter((d) => d.kind === "department" && d.branchId === br.id && !d.parentId);
        return (
          <div key={br.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <div className="orgline" /><span className="tag" style={{ padding: "6px 14px", borderRadius: 10 }}>{br.name} · chi nhánh</span>{tops.length ? <div className="orgline" /> : null}
            {tops.length ? <div className="orgkids">{tops.map((d) => {
              const ms = members(d), kids = units.filter((c) => c.kind === "department" && c.parentId === d.id).length;
              return (
                <button key={d.id} className="orgnode" onClick={() => onOpen(d)}>
                  <div className="spread"><b>{d.name}</b><span className="tag">{d.code}</span></div>
                  <div className="muted" style={{ fontSize: 12.5, margin: "2px 0 12px" }}>{d.head ? <>Trưởng đơn vị: {d.head.name}</> : "Chưa có trưởng đơn vị"}{kids ? ` · ${kids} phòng con` : ""}</div>
                  <div className="spread"><span className="stackav">{ms.slice(0, 4).map((e) => <Avatar key={e.id} name={e.fullName} seed={e.id} />)}{ms.length > 4 ? <span className="avatar rest">+{ms.length - 4}</span> : null}</span>
                    <span className="num" style={{ fontSize: 12.5 }}>{num(total(d))} người</span></div>
                </button>
              );
            })}</div> : null}
          </div>
        );
      })}
    </div></div></section>
  );
}

function UnitDetail({ u, t, members, total, loaded, onClose, onEdit, onEnd }: { u: OrgUnit; t: OrgTree; members: EmployeeListItem[]; total: number; loaded: boolean; onClose: () => void; onEdit: () => void; onEnd: () => void }) {
  const br = t.units.find((x) => x.id === u.branchId);
  const titles = new Set(members.map((e) => e.position?.name).filter(Boolean)).size;
  return (
    <Modal title={u.name} sub={`${ORG_UNIT_KINDS[u.kind]} · mã ${u.code}${br ? ` · thuộc ${br.name}` : ""}`} onClose={onClose}
      foot={t.canManage && u.active ? <><button className="btn danger" onClick={onEnd}>Ngừng đơn vị</button><button className="btn" onClick={onEdit}>Sửa đơn vị</button></> : undefined}>
      <div className="params" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 14 }}>
        <div className="param"><b className="num">{num(total)}</b><span>Nhân sự</span></div>
        <div className="param"><b className="num">{members.length ? titles : "—"}</b><span>Chức danh</span></div>
      </div>
      {u.head ? <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>Trưởng đơn vị: <b style={{ color: "var(--ink-2)" }}>{u.head.name}</b></p> : null}
      {!loaded ? <SkeletonLines lines={3} /> : members.length ? <div className="card"><div className="check-list">{members.map((e) => (
        <Link key={e.id} href={`/employees/${e.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textDecoration: "none", color: "inherit" }}>
          <Person name={e.fullName} sub={e.position?.name} seed={e.id} /><span style={{ flex: 1 }} /><Icon name="chevR" size={16} /></Link>))}</div></div>
        : <Empty title="Phòng chưa có nhân sự" text="Thêm nhân viên mới hoặc chuyển người từ phòng khác sang." />}
    </Modal>
  );
}

function UnitList({ t, units, total, showEnded, setShowEnded, onOpen, onEdit, onEnd }: { t: OrgTree; units: OrgUnit[]; total: (d: OrgUnit) => number; showEnded: boolean; setShowEnded: (v: boolean) => void; onOpen: (u: OrgUnit) => void; onEdit: (e: Edit) => void; onEnd: (u: OrgUnit) => void }) {
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
    <section className="card"><div className="table-wrap"><table className="data-table" style={{ minWidth: 760 }}><thead><tr><th>Đơn vị</th><th>Loại</th><th>Mã</th><th>Nhân sự</th><th>Hiệu lực từ</th><th>Trạng thái</th><th /></tr></thead><tbody>
      {rows.map(({ u, depth }) => {
        const dept = u.kind === "department";
        const items = [
          ...(dept ? [{ label: "Xem nhân sự", icon: "users", onClick: () => onOpen(u) }] : []),
          ...(t.canManage && u.active ? [
            ...(child[u.kind] ? [{ label: `Thêm ${ORG_UNIT_KINDS[child[u.kind]!].toLowerCase()}`, icon: "plus", onClick: () => onEdit({ mode: "create", kind: child[u.kind]!, parent: u }) }] : []),
            { label: `Sửa ${ORG_UNIT_KINDS[u.kind].toLowerCase()}`, icon: "edit", onClick: () => onEdit({ mode: "edit", unit: u }) },
            { label: `Ngừng ${ORG_UNIT_KINDS[u.kind].toLowerCase()}`, icon: "x", danger: true, onClick: () => onEnd(u) }] : []),
        ];
        return (
          <tr key={u.id} className={dept ? "clickable" : ""} onClick={dept ? () => onOpen(u) : undefined}>
            <td style={{ paddingLeft: 14 + depth * 22 }}><b style={{ fontWeight: dept ? 500 : 600 }}>{u.name}</b>{u.taxCode ? <div className="muted" style={{ fontSize: 12 }}>MST {u.taxCode}</div> : null}</td>
            <td>{dept ? <span className="muted">{ORG_UNIT_KINDS[u.kind]}</span> : <span className="tag">{ORG_UNIT_KINDS[u.kind]}</span>}</td>
            <td>{u.code}</td>
            <td className="num">{num(dept ? total(u) : u.employees)}</td>
            <td className="nowrap">{fmtDate(u.effectiveFrom)}{u.effectiveTo ? ` – ${fmtDate(u.effectiveTo)}` : ""}</td>
            <td><Status v={u.active ? (u.effectiveFrom > t.today ? ["Sắp hiệu lực", "info"] : ["Hoạt động", ""]) : ["Đã ngừng", "muted"]} /></td>
            <td className="act" onClick={(e) => e.stopPropagation()}>{items.length ? <MoreMenu bare items={items} /> : null}</td>
          </tr>
        );
      })}
    </tbody></table></div>
    <div className="tfoot"><label className="check-row"><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> Hiện đơn vị đã ngừng</label><span>Sửa và Ngừng nằm trong menu ⋯ cuối mỗi dòng</span></div></section>
  );
}

function Positions({ t, units, showEnded, setShowEnded, onEdit, onEnd }: { t: OrgTree; units: OrgUnit[]; showEnded: boolean; setShowEnded: (v: boolean) => void; onEdit: (e: Edit) => void; onEnd: (u: OrgUnit) => void }) {
  const ps = units.filter((u) => u.kind === "position");
  return (
    <section className="card">
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Chức danh</th><th>Mã</th><th>Cấp quản lý</th><th>Ngạch</th><th>Nhân sự</th><th>Trạng thái</th><th /></tr></thead><tbody>
        {ps.map((p) => (
          <tr key={p.id}><td><b style={{ fontWeight: 600 }}>{p.name}</b></td><td>{p.code}</td><td>{p.tier ? MANAGEMENT_TIERS[p.tier] : <span className="muted">Chưa đặt</span>}</td><td>{p.jobLevel ?? "—"}</td><td className="num">{num(p.employees)}</td>
            <td><Status v={p.active ? ["Hoạt động", ""] : ["Đã ngừng", "muted"]} /></td>
            <td className="act">{t.canManage && p.active ? <MoreMenu bare items={[{ label: "Sửa chức danh", icon: "edit", onClick: () => onEdit({ mode: "edit", unit: p }) }, { label: "Ngừng dùng", icon: "x", danger: true, onClick: () => onEnd(p) }]} /> : null}</td></tr>
        ))}
      </tbody></table></div>
      <div className="tfoot"><label className="check-row"><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> Hiện chức danh đã ngừng</label><span>Sửa và Ngừng nằm trong menu ⋯ cuối mỗi dòng</span></div>
    </section>
  );
}

function UnitModal({ t, edit, onClose, onDone }: { t: OrgTree; edit: Edit; onClose: () => void; onDone: (t: OrgTree) => void }) {
  const u = edit.mode === "edit" ? edit.unit : null;
  const [kind, setKind] = useState<OrgUnitKind>(u?.kind ?? (edit.mode === "create" ? edit.kind : "department"));
  const parent0 = edit.mode === "create" ? edit.parent : undefined;
  const [f, setF] = useState({
    headEmployeeId: u?.head?.id ?? "",
    code: u?.code ?? "", name: u?.name ?? "", taxCode: u?.taxCode ?? "", jobLevel: u?.jobLevel ?? "", tier: u?.tier ? String(u.tier) : "", effectiveFrom: t.today,
    legalEntityId: parent0?.kind === "legal_entity" ? parent0.id : "",
    branchId: parent0?.kind === "branch" ? parent0.id : parent0?.kind === "department" ? parent0.branchId ?? "" : "",
    parentId: parent0?.kind === "department" ? parent0.id : "",
  });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value, ...(k === "branchId" ? { parentId: "" } : {}) }); setErr(null); };
  const live = t.units.filter((x) => x.active);
  const people = useApi<OrgOptions>(u?.kind === "department" ? "org" : null);
  async function save() {
    if (!f.code.trim() || f.name.trim().length < 2) { setErr("Nhập mã và tên đơn vị."); return; }
    if (!u && kind === "branch" && !f.legalEntityId) { setErr("Chọn pháp nhân."); return; }
    if (!u && kind === "department" && !f.branchId) { setErr("Chọn chi nhánh."); return; }
    await run("save", async () => {
      const r = u
        ? await call<OrgTree>("PATCH", `organization/units/${u.kind}/${u.id}`, { code: f.code, name: f.name, ...(u.kind === "legal_entity" ? { taxCode: f.taxCode || null } : {}), ...(u.kind === "position" ? { jobLevel: f.jobLevel || null, tier: f.tier ? Number(f.tier) : null } : {}), ...(u.kind === "department" ? { headEmployeeId: f.headEmployeeId || null } : {}) })
        : await call<OrgTree>("POST", "organization/units", { kind, code: f.code, name: f.name, effectiveFrom: f.effectiveFrom, taxCode: f.taxCode || null, jobLevel: f.jobLevel || null, tier: f.tier ? Number(f.tier) : null,
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
        {u?.kind === "department" ? <Field label="Trưởng đơn vị (không bắt buộc)" full>
          <Select value={f.headEmployeeId} onChange={set("headEmployeeId")} disabled={!people.data}><option value="">Chưa có</option>
            {(people.data?.employees ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}{x.position ? ` · ${x.position}` : ""}{x.department && x.department !== u.name ? ` (${x.department})` : ""}</option>)}</Select>
          <small className="muted" style={{ display: "block", marginTop: 6 }}>Người phụ trách phòng, có thể thuộc phòng khác (vd. Giám đốc kiêm nhiệm). Khi phòng không có ai cấp cao hơn, Kavor gán người này làm quản lý trực tiếp (Sắp xếp tự động, nhập file).</small>
        </Field> : null}
        {(u?.kind ?? kind) === "legal_entity" ? <Field label="Mã số thuế"><input value={f.taxCode} onChange={set("taxCode")} inputMode="numeric" /></Field> : null}
        {(u?.kind ?? kind) === "position" ? <>
          <Field label="Cấp quản lý"><Select value={f.tier} onChange={set("tier")}><option value="">Chưa đặt</option>
            {([1, 2, 3, 4] as ManagementTier[]).map((n) => <option key={n} value={String(n)}>{MANAGEMENT_TIERS[n]}</option>)}</Select>
            <small className="muted" style={{ display: "block", marginTop: 6 }}>Quản lý trực tiếp phải có cấp cao hơn (Ban Giám đốc quản lý được Ban Giám đốc).</small></Field>
          <Field label="Ngạch (không bắt buộc)"><input value={f.jobLevel} onChange={set("jobLevel")} placeholder="L2" /></Field>
        </> : null}
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
