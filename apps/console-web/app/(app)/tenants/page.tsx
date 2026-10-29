"use client";
/* Doanh nghiệp: bám page-tenants + modal createTenant + drawer chi tiết của Kavor Console Prototype.html, dữ liệu thật.
   Thêm (thiết kế bổ sung): họ tên + tên pháp lý khi tạo, danh sách Tenant Admin, khôi phục chủ sở hữu, audit Kavor trên tenant. */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { canOperate, type ConsoleTenant, type ConsoleTenantDetail, type PlanCode, type RecoveryKind, type TenantCreateResult, type TenantStatusAction } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { ACCOUNT, Drawer, Empty, ErrorLine, Field, Icon, LoadError, Modal, Person, Status, ago, fmtDate, fmtDateTime, num, useAction, useMe, useToast } from "../../_ui/kit";
import { DecideModal, KIND, RSTATUS, RecoveryForm } from "../../_ui/recovery";
import { ACTION, PLAN, TSTATUS, adminHealth } from "../../_ui/labels";
import { DeleteTenantModal, PlanModal, StatusModal, usageTone } from "../../_ui/tenant-ops";
import { Select } from "@kavor/web-ui";

function TenantsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("id");
  const { data, error, reload } = useApi<ConsoleTenant[]>("tenants");
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const rows = (data ?? []).filter((t) => (plan === "all" || t.plan === plan) && `${t.name} ${t.code} ${t.legalName ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const all = data ?? [];
  const show = (id: string | null) => router.replace(id ? `/tenants?id=${id}` : "/tenants", { scroll: false });
  return (
    <section className="page active">
      <div className="page-head"><div><p>Mỗi doanh nghiệp là một không gian dữ liệu và cấu hình riêng trên Kavor.</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Tạo doanh nghiệp</button></div>
      <LoadError error={error} retry={reload} />
      <div className="grid metrics">
        <article className="card metric-card"><span className="metric-icon"><Icon name="building" /></span><span className="metric-copy"><span>Hoạt động</span><strong>{num(all.filter((t) => t.status === "active").length)}</strong><small>{num(all.length)} doanh nghiệp trên Kavor</small></span></article>
        <article className="card metric-card"><span className="metric-icon amber"><Icon name="card" /></span><span className="metric-copy"><span>Dùng thử</span><strong>{num(all.filter((t) => t.plan === "trial").length)}</strong><small>Gói dùng thử</small></span></article>
        <article className="card metric-card"><span className="metric-icon blue"><Icon name="user" /></span><span className="metric-copy"><span>Quản trị viên chưa kích hoạt</span><strong>{num(all.filter((t) => t.admins.active === 0 && t.admins.invited > 0).length)}</strong><small>Đang chờ khách kích hoạt</small></span></article>
        <article className="card metric-card"><span className="metric-icon red"><Icon name="alert" /></span><span className="metric-copy"><span>Chỉ 1 quản trị viên</span><strong>{num(all.filter((t) => t.admins.active === 1).length)}</strong><small>Nên có ít nhất 2 để không mất quyền</small></span></article>
      </div>
      <article className="card">
        <div className="toolbar">
          <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên, mã doanh nghiệp hoặc tên pháp lý…" /></label>
          <Select className="select" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Gói"><option value="all">Tất cả gói</option>{(Object.keys(PLAN) as PlanCode[]).map((p) => <option key={p} value={p}>{PLAN[p]}</option>)}</Select>
          <span className="toolbar-spacer" />
        </div>
        {data && !rows.length ? <Empty title="Không có doanh nghiệp phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 960 }}><thead><tr><th>Doanh nghiệp</th><th>Gói</th><th>Nhân sự</th><th>Đã kích hoạt</th><th>Quản trị viên</th><th>Trạng thái</th><th>Tạo ngày</th><th /></tr></thead><tbody>
            {rows.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => show(t.id)}>
                <td><Person name={t.name} seed={t.code} sub={t.code} /></td>
                <td>{PLAN[t.plan]}</td>
                <td className={`num ${usageTone(t)}`}>{num(t.employees)}/{num(t.employeeLimit)}</td>
                <td className="num">{num(t.accounts)}</td>
                <td><Status v={adminHealth(t)} /></td>
                <td><Status v={TSTATUS[t.status]} /></td>
                <td className="nowrap">{fmtDate(t.createdAt)}</td>
                <td><button className="btn small" onClick={(e) => { e.stopPropagation(); show(t.id); }}>Mở</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {creating ? <CreateTenant onClose={() => setCreating(false)} onSaved={(r) => { setCreating(false); void reload(); show(r.tenant.id); }} /> : null}
      {open ? <TenantDrawer id={open} onClose={() => show(null)} onChanged={() => void reload()} /> : null}
    </section>
  );
}

function CreateTenant({ onClose, onSaved }: { onClose: () => void; onSaved: (r: TenantCreateResult) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", legalName: "", code: "", plan: "trial" as PlanCode, employeeLimit: "50", adminName: "", adminEmail: "", adminCode: "ADMIN01" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: k === "code" || k === "adminCode" ? e.target.value.toUpperCase() : e.target.value }); setErr(null); };
  async function save() {
    if (f.name.trim().length < 2) { setErr("Nhập tên doanh nghiệp."); return; }
    if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(f.code)) { setErr("Mã doanh nghiệp 3–20 ký tự: chữ in hoa, số, dấu gạch (ví dụ ANP-002)."); return; }
    if (f.adminName.trim().length < 2 || !f.adminEmail.includes("@")) { setErr("Nhập họ tên và email của quản trị viên công ty."); return; }
    if (!/^[A-Z0-9._-]{2,40}$/.test(f.adminCode.trim())) { setErr("Mã nhân viên của quản trị viên 2–40 ký tự: chữ không dấu, số, . _ - (ví dụ ADMIN01, NV0001)."); return; }
    await run("save", async () => {
      const r = await call<TenantCreateResult>("POST", "tenants", { ...f, legalName: f.legalName || null, employeeLimit: Number(f.employeeLimit) });
      toast(r.invite.sent ? `Đã tạo ${r.tenant.code} và gửi lời mời tới ${f.adminEmail} (mã nhân viên ${f.adminCode.trim()})` : `Đã tạo ${r.tenant.code} nhưng chưa gửi được thư mời: ${r.invite.error}`);
      onSaved(r);
    });
  }
  return (
    <Modal title="Tạo doanh nghiệp mới" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang tạo…" : "Tạo & gửi lời mời"}</button></>}>
      <div className="form-grid">
        <Field label="Tên doanh nghiệp" full><input value={f.name} onChange={set("name")} placeholder="An Phú Retail" autoFocus /></Field>
        <Field label="Tên pháp lý" full><input value={f.legalName} onChange={set("legalName")} placeholder="Công ty Cổ phần…" /></Field>
        <Field label="Mã doanh nghiệp"><input value={f.code} onChange={set("code")} placeholder="ANP-002" /></Field>
        <Field label="Gói dịch vụ"><Select value={f.plan} onChange={set("plan")}>{(Object.keys(PLAN) as PlanCode[]).map((p) => <option key={p} value={p}>{PLAN[p]}</option>)}</Select></Field>
        <Field label="Vùng lưu trữ"><Select disabled><option>Singapore</option></Select></Field>
        <Field label="Giới hạn nhân sự"><input type="number" min={1} value={f.employeeLimit} onChange={set("employeeLimit")} /></Field>
        <Field label="Họ tên quản trị viên công ty"><input value={f.adminName} onChange={set("adminName")} /></Field>
        <Field label="Email quản trị viên công ty"><input type="email" value={f.adminEmail} onChange={set("adminEmail")} placeholder="admin@company.vn" /></Field>
        <Field label="Mã nhân viên của quản trị viên" hint="Dùng để kích hoạt web HR; đổi lại được trong hồ sơ nhân viên"><input value={f.adminCode} onChange={set("adminCode")} placeholder="ADMIN01" /></Field>
      </div>
      <div style={{ marginTop: 14, padding: 11, borderRadius: 10, background: "var(--surface-2)", fontSize: 11, color: "var(--muted)" }}>
        Thao tác này chỉ tạo doanh nghiệp trên Kavor, không thực hiện đăng ký kinh doanh hay thủ tục pháp lý. Doanh nghiệp nhận sẵn bộ mẫu theo luật Việt Nam (cơ cấu tổ chức, ca hành chính, quy định, điều khoản dữ liệu cá nhân); quản trị viên công ty kích hoạt trên web HR và bắt buộc bật xác thực hai lớp.
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function TenantDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const me = useMe();
  const toast = useToast();
  const { data: t, error, reload, setData } = useApi<ConsoleTenantDetail>(`tenants/${id}`);
  const [planning, setPlanning] = useState(false);
  const [statusAct, setStatusAct] = useState<TenantStatusAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recovery, setRecovery] = useState<{ kind: RecoveryKind; target?: string } | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; action: "approve" | "reject" | "cancel" } | null>(null);
  const { busy, run } = useAction();
  const refresh = () => { void reload(); onChanged(); };
  const decidingRow = t?.recoveries.find((r) => r.id === deciding?.id);
  return (
    <Drawer onClose={onClose} head={<><div><b>Chi tiết doanh nghiệp</b><div className="muted" style={{ fontSize: 10 }}>{t?.code ?? "…"}</div></div></>}>
      <LoadError error={error} retry={reload} />
      {t ? <>
        <div className="profile-hero"><span className="avatar purple">{t.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span><div><h3>{t.name}</h3><p>{PLAN[t.plan]} · {t.legalName ?? "Chưa có tên pháp lý"}</p></div></div>
        <div className="grid three" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="card card-body"><b className={usageTone(t)}>{num(t.employees)}/{num(t.employeeLimit)}</b><div className="muted" style={{ fontSize: 10 }}>Nhân sự</div></div>
          <div className="card card-body"><b>{num(t.accounts)}</b><div className="muted" style={{ fontSize: 10 }}>Đã kích hoạt</div></div>
          <div className="card card-body"><b><Status v={TSTATUS[t.status]} /></b><div className="muted" style={{ fontSize: 10 }}>Trạng thái</div></div>
        </div>
        {t.status !== "active" && t.statusReason ? (
          <div className="banner bad" style={{ marginTop: 14 }}><span className="banner-icon"><Icon name="alert" /></span>
            <span className="banner-copy"><b>{TSTATUS[t.status][0]} từ {fmtDateTime(t.statusChangedAt, t.timezone)}</b><span>{t.statusReason}</span></span></div>
        ) : null}
        <div className="card" style={{ marginTop: 14 }}><div className="card-head"><div><h3>Gói dịch vụ và trạng thái</h3><p>{canOperate(me.role) ? "Mọi thay đổi cần lý do và công ty thấy trong nhật ký" : "Chỉ nhân viên vận hành nền tảng được thay đổi"}</p></div></div>
          <div className="detail-list">
            <div className="detail-row"><span>Gói</span><b>{PLAN[t.plan]} · tối đa {num(t.employeeLimit)} nhân sự</b></div>
            <div className="detail-row"><span>Trạng thái</span><b><Status v={TSTATUS[t.status]} /></b></div>
          </div>
          {me.role === "platform_admin" && t.status !== "active" && t.status !== "provisioning" ? (
            <div className="card-body row-actions" style={{ justifyContent: "flex-start", paddingTop: 0 }}>
              <button className="btn small danger" onClick={() => setDeleting(true)}><Icon name="alert" /> Xóa vĩnh viễn</button>
              <span className="muted" style={{ fontSize: 11 }}>Xóa mọi dữ liệu, tài khoản và file của doanh nghiệp</span>
            </div>
          ) : null}
          {canOperate(me.role) && t.status !== "closed" ? (
            <div className="card-body row-actions" style={{ justifyContent: "flex-start", paddingTop: 0 }}>
              <button className="btn small" onClick={() => setPlanning(true)}><Icon name="card" /> Đổi gói</button>
              {t.status === "suspended"
                ? <><button className="btn small primary" onClick={() => setStatusAct("reactivate")}>Mở lại</button><button className="btn small danger" onClick={() => setStatusAct("close")}>Đóng doanh nghiệp</button></>
                : <button className="btn small danger" onClick={() => setStatusAct("suspend")}>Tạm khóa</button>}
            </div>
          ) : null}
        </div>
        <div className="card" style={{ marginTop: 14 }}><div className="card-head"><h3>Cấu hình</h3></div><div className="detail-list">
          <div className="detail-row"><span>Vùng lưu trữ</span><b>Singapore</b></div>
          <div className="detail-row"><span>Cách lưu dữ liệu</span><b>Dùng chung, tách theo doanh nghiệp (RLS)</b></div>
          <div className="detail-row"><span>Đăng nhập</span><b>Mật khẩu + xác thực hai lớp</b></div>
          <div className="detail-row"><span>Múi giờ</span><b>{t.timezone}</b></div>
          <div className="detail-row"><span>Mã số thuế</span><b>{t.taxCode ?? "—"}</b></div>
          <div className="detail-row"><span>Tạo ngày</span><b>{fmtDate(t.createdAt)}</b></div>
        </div></div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><div><h3>Quản trị viên công ty</h3><p>{adminHealth(t)[0]}. Kavor không tự thêm/bớt quản trị viên; khi khách mất quyền thì dùng khôi phục bên dưới.</p></div></div>
          <div className="detail-list">
            {t.tenantAdmins.length ? t.tenantAdmins.map((a) => (
              <div key={a.employeeId} className="detail-row" style={{ gridTemplateColumns: "1fr auto", minHeight: 56 }}>
                <span style={{ color: "var(--ink)", fontSize: 12 }}><b style={{ fontSize: 12 }}>{a.fullName}</b> <span className="muted">· {a.code}</span>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>{a.email ?? "—"} · {a.mfaEnrolled ? "đã bật xác thực hai lớp" : "chưa bật xác thực hai lớp"} · {a.lastLoginAt ? `đăng nhập ${ago(a.lastLoginAt)}` : a.invitedAt ? `mời ${ago(a.invitedAt)}` : "chưa mời"}</small></span>
                <span className="row-actions">
                  <Status v={ACCOUNT[a.account]} />
                  {a.account === "invited" || a.account === "not_invited" ? <button className="btn small" disabled={!!busy} onClick={() => run("inv", async () => setData(await call<ConsoleTenantDetail>("POST", `tenants/${t.id}/admins/${a.employeeId}/invite`)), `Đã gửi lại lời mời tới ${a.email}`)}>Gửi lại lời mời</button> : null}
                  {a.mfaEnrolled ? <button className="btn small" onClick={() => setRecovery({ kind: "mfa_reset", target: a.employeeId })}>Đặt lại xác thực hai lớp</button> : null}
                </span>
              </div>
            )) : <p className="muted" style={{ fontSize: 12, padding: "10px 0" }}>Không còn quản trị viên nào.</p>}
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}><button className="btn small" onClick={() => setRecovery({ kind: "grant_admin" })}><Icon name="key" /> Cấp quản trị viên mới (khôi phục)</button></div>
        </div>

        <div className="card" style={{ marginTop: 14 }}><div className="card-head"><h3>Khôi phục chủ sở hữu</h3></div><div className="detail-list">
          {t.recoveries.length ? t.recoveries.map((r) => (
            <div key={r.id} className="detail-row" style={{ gridTemplateColumns: "1fr auto", minHeight: 52 }}>
              <span style={{ color: "var(--ink)", fontSize: 12 }}><b style={{ fontSize: 12 }}>{KIND[r.kind]}</b> · {r.target.name}
                <small style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>{r.requestedBy} tạo {fmtDateTime(r.requestedAt, t.timezone)}{r.decidedBy ? ` · ${r.decidedBy} xử lý` : ""}</small></span>
              <span className="row-actions"><Status v={RSTATUS[r.status]} />
                {r.status === "pending" && !r.mine ? <><button className="btn small primary" onClick={() => setDeciding({ id: r.id, action: "approve" })}>Duyệt</button><button className="btn small" onClick={() => setDeciding({ id: r.id, action: "reject" })}>Từ chối</button></> : null}
                {r.status === "pending" && r.mine ? <button className="btn small" onClick={() => setDeciding({ id: r.id, action: "cancel" })}>Hủy</button> : null}
              </span>
            </div>
          )) : <p className="muted" style={{ fontSize: 12, padding: "10px 0" }}>Chưa có yêu cầu nào.</p>}
        </div></div>

        <div className="card" style={{ marginTop: 14 }}><div className="card-head"><h3>Thao tác của Kavor trên doanh nghiệp</h3><p>Doanh nghiệp cũng thấy các dòng này trong nhật ký của mình</p></div><div className="detail-list">
          {t.audit.length ? t.audit.map((a) => <div key={a.id} className="detail-row"><span>{fmtDateTime(a.createdAt, t.timezone)} · {a.actor}</span><b>{ACTION[a.action] ?? a.action}</b></div>) : <p className="muted" style={{ fontSize: 12 }}>—</p>}
        </div></div>
      </> : null}
      {planning && t ? <PlanModal t={t} onClose={() => setPlanning(false)} onDone={(d) => { setData(d); onChanged(); }} /> : null}
      {deleting && t ? <DeleteTenantModal t={t} onClose={() => setDeleting(false)} onDone={(r) => {
        toast(r.warnings.length ? `Đã xóa ${r.code}; còn sót: ${r.warnings.join(", ")}` : `Đã xóa vĩnh viễn ${r.code}: ${num(r.rows)} dòng dữ liệu, ${num(r.accounts)} tài khoản, ${num(r.files)} file`, r.warnings.length ? "error" : undefined);
        onChanged(); onClose();
      }} /> : null}
      {statusAct && t ? <StatusModal t={t} action={statusAct} onClose={() => setStatusAct(null)} onDone={(d) => { setData(d); onChanged(); }} /> : null}
      {recovery && t ? <RecoveryForm tenantId={t.id} kind={recovery.kind} targetEmployeeId={recovery.target} onClose={() => setRecovery(null)} onSaved={() => { setRecovery(null); refresh(); }} /> : null}
      {deciding && decidingRow ? <DecideModal r={decidingRow} action={deciding.action} onClose={() => setDeciding(null)} onDone={() => refresh()} /> : null}
    </Drawer>
  );
}

export default function Page() { return <Suspense><TenantsPage /></Suspense>; }
