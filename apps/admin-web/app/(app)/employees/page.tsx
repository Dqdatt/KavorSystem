"use client";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BulkInviteResult, ChecklistGaps, EmployeeListItem, OrgOptions } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { PageActions, PageSub, ACCOUNT, EMP_STATUS, EMPLOYMENT, Empty, Icon, LoadError, Modal, Person, Status, can, fmtDate, tenantToday, tenure, useAction, useMe } from "../../_ui/kit";
import { ImportModal } from "../../_ui/employee-import";
import { Select, SkeletonRows } from "@kavor/web-ui";
import { EmployeeForm } from "./profile";

/* Chip lọc nhanh có số đếm: trên danh sách đã tải (đã lọc phòng ban/trạng thái), không tính ô tìm */
type Quick = "all" | "noacct" | "docs" | "probation";

function EmployeesPage() {
  const me = useMe();
  const today = tenantToday(me.tenant.timezone);
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("working");
  const [quick, setQuick] = useState<Quick>(params.get("papers") === "missing" ? "docs" : params.get("account") === "pending" ? "noacct" : "all");
  const [group, setGroup] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulk, setBulk] = useState<EmployeeListItem[] | null>(null);
  const openId = params.get("id");
  /* /employees?new=1 (nút "Thêm nhân viên" ở Tổng quan) mở form thêm */
  const wantNew = params.get("new") === "1" && can(me, "employee.create");
  useEffect(() => { if (wantNew) { setAdding(true); router.replace("/employees", { scroll: false }); } }, [wantNew, router]);

  useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);
  /* Link cũ /employees?id=X → trang hồ sơ */
  useEffect(() => { if (openId) router.replace(`/employees/${openId}`); }, [openId, router]);
  const query = useMemo(() => new URLSearchParams({ status, account: "all", ...(dept ? { departmentId: dept } : {}) }).toString(), [status, dept]);
  const list = useApi<EmployeeListItem[]>(`employees?${query}`, { tables: ["employees", "employee_devices"], tenantId: me.tenant.id });
  const org = useApi<OrgOptions>("org");
  /* Giấy tờ bắt buộc còn thiếu (danh mục công ty tự khai) — chỉ người xem được tài liệu */
  const gaps = useApi<ChecklistGaps>(can(me, "document.read") ? "checklist/gaps" : null);
  const missing = useMemo(() => new Map((gaps.data?.rows ?? []).map((r) => [r.employeeId, r])), [gaps.data]);
  const hasDocs = !!gaps.data?.itemCount;
  const QUICK: Array<[Quick, string, (e: EmployeeListItem) => boolean]> = [
    ["all", "Tất cả", () => true],
    ["noacct", "Chưa kích hoạt app", (e) => e.account !== "active"],
    ...(hasDocs ? [["docs", "Thiếu giấy tờ", (e: EmployeeListItem) => missing.has(e.id)] as [Quick, string, (e: EmployeeListItem) => boolean]] : []),
    ["probation", "Thử việc", (e) => e.employmentType === "probation"],
  ];
  const all = list.data ?? [];
  /* Nhóm theo phòng ban (A–Z), trong phòng theo tên rồi họ — cách đọc danh sách quen thuộc ở VN */
  const rows = useMemo(() => {
    const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    const k = fold(q.trim());
    const pass = (QUICK.find((c) => c[0] === quick) ?? QUICK[0]!)[2];
    const base = (list.data ?? []).filter(pass);
    const hit = k ? base.filter((e) => fold(`${e.fullName} ${e.code} ${e.email ?? ""}`).includes(k)) : base;
    const given = (n: string) => n.trim().split(/\s+/).at(-1) ?? n;
    return [...hit].sort((a, b) => (a.department ? 0 : 1) - (b.department ? 0 : 1) || (a.department?.name ?? "").localeCompare(b.department?.name ?? "", "vi")
      || given(a.fullName).localeCompare(given(b.fullName), "vi") || a.fullName.localeCompare(b.fullName, "vi"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, q, quick, missing, hasDocs]);
  const grouped = group && !q.trim();
  const groupSize = useMemo(() => { const m = new Map<string, number>(); for (const e of rows) m.set(e.department?.name ?? "", (m.get(e.department?.name ?? "") ?? 0) + 1); return m; }, [rows]);
  const picked = rows.filter((e) => sel.has(e.id));
  const allPicked = rows.length > 0 && picked.length === rows.length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="page active">
      <PageSub text={list.data && status === "working" && !dept ? `${list.data.length} hồ sơ đang làm việc tại ${me.tenant.name}.` : null} />
      <PageActions>{can(me, "employee.create") ? <><button className="btn" onClick={() => setImporting(true)}><Icon name="upload" /> Nhập từ file</button><button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Thêm nhân viên</button></> : null}</PageActions>
      <LoadError error={list.error} retry={list.reload} />
      <article className="card">
        <div className="toolbar">
          {QUICK.map(([id, label, f]) => <button key={id} className={`filter-chip ${quick === id ? "active" : ""}`} onClick={() => setQuick(id)}>{label}<span className="n">{all.filter(f).length}</span></button>)}
          <span className="toolbar-spacer" />
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, mã hoặc email…" aria-label="Tìm nhân viên" /></label>
          <Select className="select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Phòng ban">
            <option value="">Tất cả phòng ban</option>{org.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái"><option value="working">Đang làm việc</option><option value="terminated">Đã nghỉ việc</option><option value="all">Tất cả trạng thái</option></Select>
          <button className={`tog ${group ? "on" : ""}`} aria-pressed={group} aria-label="Nhóm theo phòng ban" title="Nhóm theo phòng ban" onClick={() => setGroup(!group)}><Icon name="org" /></button>
        </div>
        {picked.length ? (
          <div className="bulk"><span>{picked.length} người đã chọn</span><span className="toolbar-spacer" />
            {can(me, "membership.invite") ? <button className="btn small primary" onClick={() => setBulk(picked)}><Icon name="mail" /> Gửi lời mời</button> : null}
            <button className="btn small ghost" onClick={() => setSel(new Set())}>Bỏ chọn</button></div>
        ) : null}
        {list.data && !rows.length ? <Empty title="Không có nhân viên phù hợp" text="Thử bỏ bớt bộ lọc hoặc tìm theo mã nhân viên." /> : (
          <div className="table-wrap"><table className="data-table emp-table" style={{ minWidth: 900 }}><thead><tr>
            <th className="cbx"><input type="checkbox" className="cb" aria-label="Chọn tất cả" checked={allPicked} onChange={() => setSel(allPicked ? new Set() : new Set(rows.map((e) => e.id)))} /></th>
            <th>Nhân viên</th><th>Chức danh / phòng ban</th><th>Vào làm</th><th>Hợp đồng</th><th>Giấy tờ bắt buộc</th><th>Tài khoản app</th><th /></tr></thead><tbody>
            {!list.data && !list.error ? <SkeletonRows cols={8} rows={8} person /> : null}
            {rows.map((e, i) => (<Fragment key={e.id}>
              {grouped && (i === 0 || rows[i - 1]!.department?.name !== e.department?.name) ? <tr className="group-row"><td colSpan={8}>{e.department?.name ?? "Chưa có phòng ban"} <span className="muted">· {groupSize.get(e.department?.name ?? "")} người</span></td></tr> : null}
              <tr className={`clickable ${sel.has(e.id) ? "sel" : ""}`} onClick={() => router.push(`/employees/${e.id}`)}>
                <td className="cbx" onClick={(ev) => ev.stopPropagation()}><input type="checkbox" className="cb" aria-label={`Chọn ${e.fullName}`} checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                <td><Person name={e.fullName} sub={e.code} seed={e.code} badge={e.status !== "active" ? <Status v={EMP_STATUS[e.status]} /> : undefined} /></td>
                <td className="wrap"><b style={{ fontWeight: 500, display: "block" }}>{e.position?.name ?? "—"}</b><span className="muted" style={{ fontSize: 12 }}>{e.department?.name ?? "—"}</span></td>
                <td>{fmtDate(e.hireDate)}<span className="muted" style={{ display: "block", fontSize: 12 }}>{tenure(e.hireDate, today)}</span></td>
                <td>{e.employmentType === "probation" ? <Status v={["Thử việc", "violet"]} /> : <span style={{ color: "var(--ink-2)" }}>{EMPLOYMENT[e.employmentType]}</span>}</td>
                <td>{!hasDocs || !gaps.data?.requiredCount ? "—" : <DocTicks gap={missing.get(e.id)} all={gaps.data.requiredCount} />}</td>
                <td><span className="cell-stack">{e.account === "not_invited" ? <span className="muted">Chưa mời</span> : <Status v={ACCOUNT[e.account]} />}{e.devicePending ? <span className="source-tag" title="Có thiết bị chờ duyệt">Máy chờ duyệt</span> : null}</span></td>
                <td className="muted"><Icon name="chevR" size={16} className="icon" /></td>
              </tr>
            </Fragment>))}
          </tbody></table></div>
        )}
        {list.data ? <div className="tfoot"><span>Hiển thị {rows.length} / {all.length} hồ sơ</span></div> : null}
      </article>
      {adding && org.data ? <EmployeeForm org={org.data} employee={null} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/employees/${id}`)} /> : null}
      {bulk ? <BulkInvite rows={bulk} onClose={() => setBulk(null)} onDone={() => { void list.reload(); setSel(new Set()); }} /> : null}
      {importing ? <ImportModal onClose={() => setImporting(false)} onDone={() => { void list.reload(); void org.reload(); }} /> : null}
    </section>
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

/* Giấy tờ bắt buộc theo prototype: vạch + "đã nộp/cần nộp" hoặc "Đủ".
   shortcut: người đã đủ vẽ theo tổng mục bắt buộc của công ty (API chỉ trả số mục áp dụng cho người còn thiếu), đổi khi gaps trả mọi người */
function DocTicks({ gap, all }: { gap?: { missing: string[]; required: number }; all: number }) {
  const total = gap?.required ?? all, done = total - (gap?.missing.length ?? 0);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }} title={gap ? `Thiếu: ${gap.missing.join(", ")}` : undefined}>
      <span className="ticks sm" aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} className={!gap ? "m" : i < done ? "a" : ""} />)}</span>
      {gap ? <span className="small-note num">{done}/{total}</span> : <span className="small-note num" style={{ color: "var(--ok)", fontWeight: 700 }}>Đủ</span>}
    </span>
  );
}
