"use client";
/* Cài đặt doanh nghiệp. Tab "Doanh nghiệp" bám prototype (Thông tin tenant + Chính sách nền tảng); thương hiệu, liên hệ HR
   và các tab Thiết lập ban đầu / Quy định / Ngày lễ / Dữ liệu cá nhân là thiết kế bổ sung cùng bộ class của prototype. */
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RULE_KINDS, checkRuleConfig,
  type BrandingKind, type CompanySettings, type HolidayYear, type OrgOptions, type PolicyAssignment, type PolicyScopeType, type PrivacyOverview,
  type RuleConfig, type RuleKind, type RulePolicy, type RuleVersion, type SetupChecklist, type SetupStepState,
} from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, SCOPE, Status, can, fmtDate, fmtDateTime, num, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";

type Tab = "company" | "setup" | "rules" | "holidays" | "privacy";
const TABS: Array<[Tab, string, string | null]> = [
  ["company", "Doanh nghiệp", null], ["setup", "Thiết lập ban đầu", null], ["rules", "Quy định", "policy.read"], ["holidays", "Ngày lễ", "policy.read"], ["privacy", "Dữ liệu cá nhân", "privacy.read"],
];
const HEAD: Record<Tab, [string, string]> = {
  company: ["Thiết lập doanh nghiệp", "Đây là cấu hình tenant trên Kavor, không phải đăng ký kinh doanh."],
  setup: ["Thiết lập ban đầu", "Trạng thái tính từ dữ liệu thật của công ty; mỗi bước xong khi dữ liệu đã đủ."],
  rules: ["Quy định nghiệp vụ", "Mỗi quy định có phiên bản theo ngày hiệu lực và áp dụng theo tầng: cá nhân > phòng ban > chi nhánh > pháp nhân > công ty."],
  holidays: ["Ngày nghỉ lễ", "Lịch quốc gia do Kavor duy trì cho mọi công ty; công ty thêm ngày nghỉ riêng hoặc nghỉ bù."],
  privacy: ["Dữ liệu cá nhân", "Điều khoản có phiên bản theo Nghị định 13/2023/NĐ-CP; đổi điều khoản thì nhân viên phải đồng ý lại trên app."],
};

function SettingsPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tabs = TABS.filter(([, , perm]) => !perm || can(me, perm));
  const tab = tabs.find(([k]) => k === params.get("tab"))?.[0] ?? "company";
  const [action, setAction] = useState<ReactNode>(null);
  return (
    <section className="page active">
      <div className="page-head">
        <div><h2>{HEAD[tab][0]}</h2><p>{HEAD[tab][1]}</p></div>
        <div className="head-actions">
          {action}
          <div className="segmented" role="tablist">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => { setAction(null); router.replace(`/settings?tab=${k}`, { scroll: false }); }}>{l}</button>)}</div>
        </div>
      </div>
      {tab === "company" ? <Company setAction={setAction} /> : tab === "setup" ? <Setup /> : tab === "rules" ? <Rules setAction={setAction} /> : tab === "holidays" ? <Holidays setAction={setAction} /> : <Privacy setAction={setAction} />}
    </section>
  );
}

type SetAction = (n: ReactNode) => void;

/* ---------- Doanh nghiệp ---------- */
function Company({ setAction }: { setAction: SetAction }) {
  const { data, error, reload, setData } = useApi<CompanySettings>("settings");
  const [f, setF] = useState<{ displayName: string; legalName: string; taxCode: string; phone: string; email: string; hours: string; note: string; newsReadReceipt: boolean; periodStartDay: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (!data || f) return;
    setF({ displayName: data.tenant.displayName, legalName: data.tenant.legalName ?? "", taxCode: data.tenant.taxCode ?? "", phone: data.support.phone ?? "", email: data.support.email ?? "",
      hours: data.support.hours ?? "", note: data.support.note ?? "", newsReadReceipt: data.platform.newsReadReceipt, periodStartDay: String(data.attendance.periodStartDay) });
  }, [data, f]);
  const manage = !!data?.canManage;
  const save = async () => {
    if (!f) return;
    if (f.displayName.trim().length < 2) { setErr("Tên hiển thị cần ít nhất 2 ký tự."); return; }
    const day = Number(f.periodStartDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) { setErr("Ngày bắt đầu kỳ công từ 1 đến 28."); return; }
    const ok = await run("save", async () => {
      const d = await call<CompanySettings>("PATCH", "settings", {
        displayName: f.displayName, legalName: f.legalName || null, taxCode: f.taxCode || null,
        support: { phone: f.phone || null, email: f.email || null, hours: f.hours || null, note: f.note || null }, platform: { newsReadReceipt: f.newsReadReceipt },
        attendance: { periodStartDay: day },
      });
      setData(d);
    }, "Đã lưu cấu hình doanh nghiệp");
    if (ok) setErr(null);
  };
  useEffect(() => {
    setAction(manage ? <button className="btn primary" disabled={!!busy || !f} onClick={() => void save()}>{busy === "save" ? "Đang lưu…" : "Lưu thay đổi"}</button> : null);
    return () => setAction(null);
  }, [manage, busy, f]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data || !f) return null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr(null); };
  const p = data.platform;
  return (
    <>
      {err ? <ErrorLine text={err} /> : null}
      <div className="split-panel">
        <article className="card"><div className="card-head"><h3>Thông tin tenant</h3></div><div className="card-body"><div className="form-grid">
          <Field label="Tên hiển thị"><input value={f.displayName} onChange={set("displayName")} disabled={!manage} /></Field>
          <Field label="Mã tenant"><input value={data.tenant.code} disabled /></Field>
          <Field label="Tên pháp lý"><input value={f.legalName} onChange={set("legalName")} disabled={!manage} placeholder="Công ty Cổ phần …" /></Field>
          <Field label="Mã số thuế"><input value={f.taxCode} onChange={set("taxCode")} disabled={!manage} inputMode="numeric" placeholder="10 chữ số" /></Field>
          <Field label="Múi giờ"><select disabled value={data.tenant.timezone}><option>{data.tenant.timezone}</option></select></Field>
          <Field label="Tiền tệ"><select disabled value={data.tenant.currency}><option value={data.tenant.currency}>{data.tenant.currency === "VND" ? "VND — Việt Nam đồng" : data.tenant.currency}</option></select></Field>
        </div></div></article>
        <article className="card"><div className="card-head"><h3>Chính sách nền tảng</h3></div><div className="detail-list">
          <SwitchRow label="Cho phép Employee Web" note="Theo gói dịch vụ · chưa mở" checked={p.employeeWeb} locked />
          <SwitchRow label="Yêu cầu MFA cho admin" note="Luôn bật với mọi tài khoản HR/Admin" checked={p.mfaRequired} locked />
          <SwitchRow label="Google Sheets auto sync" note="Có khi bật module Tích hợp dữ liệu" checked={p.sheetsAutoSync} locked />
          <SwitchRow label="Xác nhận đã đọc bản tin quan trọng" note="Áp dụng khi bật module Bản tin" checked={f.newsReadReceipt} locked={!manage} onChange={(v) => setF({ ...f, newsReadReceipt: v })} />
        </div>
        <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h3>Kỳ công</h3></div>
        <div className="card-body"><Field label="Kỳ công bắt đầu ngày" hint={(() => { const d = Number(f.periodStartDay); return d > 1 && d <= 28 ? `Ví dụ kỳ tháng 10: ${d}/09 – ${d - 1}/10. Kỳ đã khóa giữ nguyên.` : d === 1 ? "Theo tháng dương lịch." : "Từ 1 đến 28."; })()}>
          <input type="number" min={1} max={28} value={f.periodStartDay} onChange={set("periodStartDay")} disabled={!manage} />
        </Field></div></article>
      </div>
      <div className="split-panel" style={{ marginTop: 14 }}>
        <article className="card"><div className="card-head"><div><h3>Thương hiệu</h3><p>Hiển thị trên app nhân viên. PNG, JPEG hoặc WebP, tối đa 2 MB.</p></div></div><div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, alignItems: "start" }}>
            <BrandImage kind="logo" version={data.branding.logoVersion} manage={manage} onSaved={setData} />
            <BrandImage kind="cover" version={data.branding.coverVersion} manage={manage} onSaved={setData} />
          </div>
        </div></article>
        <article className="card"><div className="card-head"><div><h3>Liên hệ phòng Nhân sự</h3><p>Nhân viên thấy khi cần hỗ trợ (tài khoản bị khóa, lỗi hệ thống).</p></div></div><div className="card-body"><div className="form-grid">
          <Field label="Điện thoại"><input value={f.phone} onChange={set("phone")} disabled={!manage} inputMode="tel" placeholder="028 …" /></Field>
          <Field label="Email"><input type="email" value={f.email} onChange={set("email")} disabled={!manage} placeholder="hr@congty.vn" /></Field>
          <Field label="Giờ hỗ trợ" full><input value={f.hours} onChange={set("hours")} disabled={!manage} placeholder="8:00–17:00, thứ Hai – thứ Sáu" /></Field>
          <Field label="Ghi chú" full><input value={f.note} onChange={set("note")} disabled={!manage} placeholder="Ví dụ: ngoài giờ gọi trưởng ca" /></Field>
        </div></div></article>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Cập nhật lần cuối {fmtDateTime(data.updatedAt, data.tenant.timezone)}.{manage ? "" : " Chỉ Tenant Admin sửa được cấu hình doanh nghiệp."}</p>
    </>
  );
}

function SwitchRow({ label, note, checked, locked, onChange }: { label: string; note?: string; checked: boolean; locked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="detail-row">
      <span style={{ fontSize: 11.5, color: "var(--ink)" }}>{label}{note ? <small style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>{note}</small> : null}</span>
      <label className="switch" style={locked ? { opacity: 0.55 } : undefined}><input type="checkbox" checked={checked} disabled={locked} onChange={(e) => onChange?.(e.target.checked)} aria-label={label} /><i /></label>
    </div>
  );
}

/* Ảnh logo/bìa: xem trước + tải lên ngay (không chờ "Lưu thay đổi") */
function BrandImage({ kind, version, manage, onSaved }: { kind: BrandingKind; version: string | null; manage: boolean; onSaved: (d: CompanySettings) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();
  const logo = kind === "logo";
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { await run("x", async () => { throw new Error("Ảnh tối đa 2 MB."); }); return; }
    const dataBase64 = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file); });
    await run("up", async () => onSaved(await call<CompanySettings>("POST", `settings/branding/${kind}`, { dataBase64 })), logo ? "Đã cập nhật logo" : "Đã cập nhật ảnh bìa");
  };
  const box = { border: "1px dashed var(--line-strong)", borderRadius: 12, background: "var(--surface-2)", display: "grid", placeItems: "center", overflow: "hidden", color: "var(--muted)", fontSize: 11 } as const;
  return (
    <div>
      <div style={{ ...box, ...(logo ? { width: 120, height: 120 } : { width: "100%", aspectRatio: "320 / 124" }) }}>
        {version ? <img src={`/api/branding/${kind}?v=${version}`} alt={logo ? "Logo công ty" : "Ảnh bìa"} style={{ width: "100%", height: "100%", objectFit: logo ? "contain" : "cover" }} />
          : <span>{logo ? "Chưa có logo" : "Ảnh bìa mặc định của Kavor"}</span>}
      </div>
      <p className="muted" style={{ fontSize: 10.5, margin: "6px 0" }}>{logo ? "Logo · vuông" : "Ảnh bìa hồ sơ · 320×124"}</p>
      {manage ? (
        <div className="row-actions" style={{ justifyContent: "flex-start" }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <button className="btn small" disabled={!!busy} onClick={() => input.current?.click()}><Icon name="upload" /> {busy === "up" ? "Đang tải…" : version ? "Thay ảnh" : "Tải ảnh lên"}</button>
          {version ? <button className="btn small" disabled={!!busy} onClick={() => run("rm", async () => onSaved(await call<CompanySettings>("POST", `settings/branding/${kind}/remove`, {})), "Đã gỡ ảnh")}>Gỡ</button> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Thiết lập ban đầu ---------- */
const STEP: Record<SetupStepState, [string, string]> = { done: ["Đã xong", ""], todo: ["Chưa xong", "warn"], warn: ["Nên xử lý", "bad"], unavailable: ["Sắp có", "muted"] };
function Setup() {
  const { data, error, reload } = useApi<SetupChecklist>("settings/checklist");
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return null;
  const pct = Math.round((data.done / Math.max(1, data.total)) * 100);
  return (
    <article className="card">
      <div className="card-head"><div><h3>Đã xong {data.done}/{data.total} bước</h3><p>Theo checklist onboarding: thông tin công ty → tổ chức → địa điểm → ca → quy định → nhân viên → quản lý → chạy thử.</p></div><b className="num">{pct}%</b></div>
      <div className="card-body" style={{ paddingTop: 0 }}><span className="progress" style={{ display: "block", ["--value" as string]: `${pct}%` }}><i /></span></div>
      <div className="detail-list">
        {data.steps.map((s, i) => (
          <div key={s.key} className="detail-row" style={{ gridTemplateColumns: "24px 1fr auto auto", minHeight: 52 }}>
            <span className="num" style={{ fontSize: 11 }}>{i + 1}</span>
            <span style={{ color: "var(--ink)", fontSize: 12 }}><b style={{ fontSize: 12, textAlign: "left" }}>{s.title}</b><small style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>{s.detail}</small></span>
            <Status v={STEP[s.state]} />
            {s.href ? <Link className="btn small" href={s.href}>Mở <Icon name="arrow" /></Link> : <span />}
          </div>
        ))}
      </div>
    </article>
  );
}

/* ---------- Quy định ---------- */
const fieldText = (kind: RuleKind, config: RuleConfig) => RULE_KINDS[kind].fields.map((f) => {
  const v = config[f.key];
  return f.type === "bool" ? `${f.label}: ${v ? "có" : "không"}` : `${f.label}: ${v} ${f.unit ?? ""}`.trim();
});
const ASSIGN_STATE: Record<PolicyAssignment["state"], [string, string]> = { active: ["Đang áp dụng", ""], scheduled: ["Sắp áp dụng", "info"], ended: ["Đã kết thúc", "muted"], cancelled: ["Đã hủy", "muted"] };

function Rules({ setAction }: { setAction: SetAction }) {
  const me = useMe();
  const { data, error, reload } = useApi<RulePolicy[]>("rules");
  const [form, setForm] = useState<{ rule: RulePolicy | null; kind: RuleKind } | null>(null);
  const [assign, setAssign] = useState<RulePolicy | null>(null);
  const [ending, setEnding] = useState<PolicyAssignment | null>(null);
  const { run } = useAction();
  const manage = can(me, "policy.manage");
  useEffect(() => {
    setAction(manage ? <button className="btn primary" onClick={() => setForm({ rule: null, kind: "explanation" })}><Icon name="plus" /> Tạo quy định</button> : null);
    return () => setAction(null);
  }, [manage, setAction]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (data && !data.length) return <Empty title="Chưa có quy định" text="Kavor tạo sẵn bộ mẫu khi tạo công ty." />;
  return (
    <>
      <div className="grid two">
        {(data ?? []).map((r) => {
          const live = r.assignments.filter((a) => a.state === "active" || a.state === "scheduled");
          return (
            <article key={r.id} className="card">
              <div className="card-head"><div><h3>{RULE_KINDS[r.kind].label} · {r.name}</h3><p>{r.code} · {RULE_KINDS[r.kind].description}</p></div>
                <span className="row-actions">{r.active ? <Status v={["Đang dùng", ""]} /> : <Status v={["Ngừng dùng", "muted"]} />}</span></div>
              <div className="card-body">
                {r.current ? <ul className="version-list" style={{ marginTop: 0, color: "var(--ink)" }}>{fieldText(r.kind, r.current.config).map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-red" style={{ fontSize: 12 }}>Chưa có phiên bản hiệu lực hôm nay.</p>}
                {r.next ? <p style={{ margin: "8px 0", fontSize: 12.5 }}><span className="status info">Từ {fmtDate(r.next.effectiveFrom)}</span> {fieldText(r.kind, r.next.config).join(" · ")}</p> : null}
                <ul className="version-list">{r.versions.map((v) => <li key={v.id}>v{v.versionNo} · từ {fmtDate(v.effectiveFrom)}{v.note ? ` — ${v.note}` : ""}</li>)}</ul>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <b style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Áp dụng</b>
                  {live.length ? live.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #edf0ed" }}>
                      <span style={{ flex: 1 }}>{SCOPE[a.scopeType]}{a.scope ? `: ${a.scope.name}` : ""} <span className="muted">· {fmtDate(a.effectiveFrom)} → {a.effectiveTo ? fmtDate(a.effectiveTo) : "không thời hạn"}</span></span>
                      <Status v={ASSIGN_STATE[a.state]} />
                      {manage ? <button className="btn small" onClick={() => setEnding(a)}>{a.state === "scheduled" ? "Hủy" : "Kết thúc"}</button> : null}
                    </div>
                  )) : <p className="muted" style={{ margin: "4px 0 0" }}>Chưa áp dụng cho ai.</p>}
                </div>
                {manage ? <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <button className="btn small" onClick={() => setForm({ rule: r, kind: r.kind })}>Phiên bản mới</button>
                  <button className="btn small" onClick={() => setAssign(r)}>Áp dụng cho nhóm</button>
                  <button className="btn small" onClick={() => run(r.id, () => call("PATCH", `rules/${r.id}`, { active: !r.active }), r.active ? "Đã ngừng dùng quy định" : "Đã dùng lại quy định").then(() => reload())}>{r.active ? "Ngừng dùng" : "Dùng lại"}</button>
                </div> : null}
              </div>
            </article>
          );
        })}
      </div>
      {form ? <RuleForm rule={form.rule} kind={form.kind} onClose={() => setForm(null)} onSaved={() => { setForm(null); void reload(); }} /> : null}
      {assign ? <RuleAssign rule={assign} onClose={() => setAssign(null)} onSaved={() => { setAssign(null); void reload(); }} /> : null}
      {ending ? <ReasonModal title={`${ending.state === "scheduled" ? "Hủy" : "Kết thúc từ hôm nay"} áp dụng ${ending.target.name}`} label="Lý do" ok="Đã cập nhật áp dụng"
        go={(reason) => call("POST", `policy-assignments/${ending.id}/end`, { reason })} onClose={() => setEnding(null)} onDone={reload} /> : null}
    </>
  );
}

function RuleForm({ rule, kind: initialKind, onClose, onSaved }: { rule: RulePolicy | null; kind: RuleKind; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const today = tenantToday(me.tenant.timezone);
  const base: RuleVersion | null = rule?.next ?? rule?.current ?? null;
  const [kind, setKind] = useState<RuleKind>(initialKind);
  const defaults = (k: RuleKind): RuleConfig => Object.fromEntries(RULE_KINDS[k].fields.map((f) => [f.key, f.type === "bool" ? false : f.min ?? 0]));
  const [config, setConfig] = useState<RuleConfig>(base?.config ?? defaults(initialKind));
  const [meta, setMeta] = useState({ code: "", name: "", effectiveFrom: rule ? today : today, note: "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    const { config: clean, problems } = checkRuleConfig(kind, config);
    if (problems.length) { setErr(problems.join(" ")); return; }
    const v = { config: clean, effectiveFrom: meta.effectiveFrom, note: meta.note || null };
    const ok = await run("save", () => (rule ? call("POST", `rules/${rule.id}/versions`, v) : call("POST", "rules", { ...v, kind, code: meta.code, name: meta.name })), rule ? "Đã thêm phiên bản quy định" : "Đã tạo quy định");
    if (ok) onSaved();
  }
  return (
    <Modal wide title={rule ? `Phiên bản mới · ${rule.name}` : "Tạo quy định"} sub={rule ? "Áp dụng từ ngày hiệu lực; trước ngày đó vẫn theo phiên bản cũ." : "Quy định mới chưa áp dụng cho ai cho tới khi bấm “Áp dụng cho nhóm”."} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        {!rule ? <>
          <Field label="Loại quy định"><select value={kind} onChange={(e) => { const k = e.target.value as RuleKind; setKind(k); setConfig(defaults(k)); setErr(null); }}>{(Object.keys(RULE_KINDS) as RuleKind[]).map((k) => <option key={k} value={k}>{RULE_KINDS[k].label}</option>)}</select></Field>
          <Field label="Mã"><input value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value })} placeholder="GT-MKT" /></Field>
          <Field label="Tên" full><input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Giải trình khối Marketing" /></Field>
        </> : null}
        {RULE_KINDS[kind].fields.map((f) => f.type === "bool" ? (
          <label key={f.key} className="check-row field full"><input type="checkbox" checked={config[f.key] === true} onChange={(e) => setConfig({ ...config, [f.key]: e.target.checked })} /> {f.label}</label>
        ) : (
          <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} hint={`Từ ${f.min ?? 0} đến ${f.max}`}>
            <input type="number" min={f.min} max={f.max} value={String(config[f.key] ?? "")} onChange={(e) => { setConfig({ ...config, [f.key]: e.target.value === "" ? NaN : Number(e.target.value) }); setErr(null); }} />
          </Field>
        ))}
        <Field label="Hiệu lực từ"><input type="date" min={today} value={meta.effectiveFrom} onChange={(e) => setMeta({ ...meta, effectiveFrom: e.target.value })} /></Field>
        <Field label="Ghi chú"><input value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function RuleAssign({ rule, onClose, onSaved }: { rule: RulePolicy; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const org = useApi<OrgOptions>("org");
  const [f, setF] = useState({ scopeType: "department" as PolicyScopeType, scopeId: "", effectiveFrom: tenantToday(me.tenant.timezone), effectiveTo: "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value, ...(k === "scopeType" ? { scopeId: "" } : {}) }); setErr(null); };
  const scopes = f.scopeType === "legal_entity" ? org.data?.legalEntities : f.scopeType === "branch" ? org.data?.branches : f.scopeType === "department" ? org.data?.departments : f.scopeType === "employee" ? org.data?.employees.map((e) => ({ id: e.id, name: `${e.name} · ${e.code}` })) : [];
  async function save() {
    if (f.scopeType !== "tenant" && !f.scopeId) { setErr("Chọn đối tượng áp dụng."); return; }
    if (f.scopeType === "employee" && f.reason.trim().length < 5) { setErr("Ngoại lệ cá nhân phải ghi lý do (ít nhất 5 ký tự)."); return; }
    const ok = await run("save", () => call("POST", "policy-assignments", { kind: rule.kind, targetId: rule.id, scopeType: f.scopeType, scopeId: f.scopeType === "tenant" ? null : f.scopeId, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || null, reason: f.reason || null }), "Đã áp dụng quy định");
    if (ok) onSaved();
  }
  return (
    <Modal wide title={`Áp dụng ${rule.name}`} sub="Nhân viên theo quy định của tầng ưu tiên cao nhất khớp với họ; tra theo ngày, không sao chép vào hồ sơ." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Áp dụng"}</button></>}>
      <div className="form-grid">
        <Field label="Tầng"><select value={f.scopeType} onChange={set("scopeType")}>{(["tenant", "legal_entity", "branch", "department", "employee"] as const).map((s) => <option key={s} value={s}>{SCOPE[s]}</option>)}</select></Field>
        {f.scopeType !== "tenant" ? <Field label="Đối tượng"><select value={f.scopeId} onChange={set("scopeId")}><option value="">Chọn…</option>{(scopes ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field> : <div />}
        <Field label="Hiệu lực từ"><input type="date" min={tenantToday(me.tenant.timezone)} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field>
        <Field label="Đến (bỏ trống = không thời hạn)"><input type="date" value={f.effectiveTo} onChange={set("effectiveTo")} /></Field>
        <Field label={f.scopeType === "employee" ? "Lý do (bắt buộc với ngoại lệ cá nhân)" : "Lý do"} full><input value={f.reason} onChange={set("reason")} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/* ---------- Ngày lễ ---------- */
const HOLIDAY_KIND: Record<string, [string, string]> = { public: ["Lễ, Tết quốc gia", ""], compensatory: ["Nghỉ bù", "info"], company: ["Nghỉ riêng công ty", "violet"] };
const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
function Holidays({ setAction }: { setAction: SetAction }) {
  const me = useMe();
  const today = tenantToday(me.tenant.timezone);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, error, reload } = useApi<HolidayYear>(`holidays?year=${year}`);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const manage = can(me, "policy.manage");
  useEffect(() => {
    setAction(manage ? <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Thêm ngày nghỉ</button> : null);
    return () => setAction(null);
  }, [manage, setAction]);
  if (error) return <LoadError error={error} retry={reload} />;
  const paidDays = (data?.holidays ?? []).filter((h) => h.paid).length;
  return (
    <>
      {data && (!data.national || !data.national.verified) ? (
        <div className="banner"><span className="banner-icon"><Icon name="alert" /></span><span className="banner-copy">
          <b>{data.national ? `${data.national.name}: chưa được chuyên gia xác nhận` : `Kavor chưa công bố lịch quốc gia ${year}`}</b>
          <span>{data.national ? `Nguồn: ${data.national.source ?? "—"}. Dữ liệu dùng cho phát triển; HR/Payroll SME xác nhận trước khi tính lương thật.` : "Lịch Tết và ngày nghỉ liền kề do Chính phủ công bố hằng năm; Kavor sẽ cập nhật khi có thông báo."}</span>
        </span></div>
      ) : null}
      <article className="card">
        <div className="toolbar">
          {[thisYear, thisYear + 1].map((y) => <button key={y} className={`filter-chip ${year === y ? "active" : ""}`} onClick={() => setYear(y)}>Năm {y}</button>)}
          <span className="toolbar-spacer" />
          <span className="muted" style={{ fontSize: 11.5 }}>{data ? `${num(data.holidays.length)} ngày nghỉ · ${num(paidDays)} ngày hưởng lương` : ""}</span>
        </div>
        {data && !data.holidays.length ? <Empty title={`Chưa có ngày nghỉ nào năm ${year}`} /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 760 }}><thead><tr><th>Ngày</th><th>Tên</th><th>Loại</th><th>Hưởng lương</th><th>Nguồn</th><th /></tr></thead><tbody>
            {(data?.holidays ?? []).map((h) => {
              const d = new Date(`${h.date}T12:00:00Z`);
              return (
                <tr key={h.id} style={h.date < today ? { opacity: 0.6 } : undefined}>
                  <td className="nowrap"><b>{fmtDate(h.date)}</b> <span className="muted">· {WD[d.getUTCDay()]}</span></td>
                  <td>{h.name}</td>
                  <td><Status v={HOLIDAY_KIND[h.kind] ?? [h.kind, "muted"]} /></td>
                  <td>{h.paid ? "Có" : "Không"}</td>
                  <td>{h.scope === "national" ? "Kavor (luật)" : "Công ty"}</td>
                  <td>{manage && h.scope === "company" && h.date >= today ? <button className="btn small" onClick={() => setRemoving({ id: h.id, name: h.name })}>Xóa</button> : null}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </article>
      {adding ? <HolidayForm onClose={() => setAdding(false)} onSaved={(y) => { setAdding(false); if (y === year) void reload(); else setYear(y); }} /> : null}
      {removing ? <ReasonModal title={`Xóa ngày nghỉ “${removing.name}”?`} label="Lý do" ok="Đã xóa ngày nghỉ" go={(reason) => call("POST", `holidays/${removing.id}/remove`, { reason })} onClose={() => setRemoving(null)} onDone={reload} /> : null}
    </>
  );
}

function HolidayForm({ onClose, onSaved }: { onClose: () => void; onSaved: (year: number) => void }) {
  const me = useMe();
  const today = tenantToday(me.tenant.timezone);
  const [f, setF] = useState({ date: today, name: "", kind: "company" as "company" | "compensatory", paid: true });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (f.name.trim().length < 2) { setErr("Nhập tên ngày nghỉ."); return; }
    if (await run("save", () => call("POST", "holidays", f), "Đã thêm ngày nghỉ")) onSaved(Number(f.date.slice(0, 4)));
  }
  return (
    <Modal title="Thêm ngày nghỉ riêng" sub="Chỉ thêm được từ hôm nay trở đi; ngày đã qua đã vào bảng công." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Thêm"}</button></>}>
      <div className="form-grid">
        <Field label="Ngày"><input type="date" min={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Loại"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "company" | "compensatory" })}><option value="company">Nghỉ riêng công ty</option><option value="compensatory">Nghỉ bù</option></select></Field>
        <Field label="Tên" full><input value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(null); }} placeholder="Ngày thành lập công ty" /></Field>
        <label className="check-row field full"><input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> Hưởng nguyên lương</label>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/* ---------- Dữ liệu cá nhân ---------- */
function Privacy({ setAction }: { setAction: SetAction }) {
  const me = useMe();
  const { data, error, reload, setData } = useApi<PrivacyOverview>("privacy");
  const [editing, setEditing] = useState(false);
  const manage = can(me, "tenant.settings.manage");
  useEffect(() => {
    setAction(manage ? <button className="btn primary" onClick={() => setEditing(true)}>Công bố phiên bản mới</button> : null);
    return () => setAction(null);
  }, [manage, setAction]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return null;
  const pct = data.accounts ? Math.round((data.consentedCurrent / data.accounts) * 100) : 0;
  return (
    <>
      <div className="split-panel">
        <article className="card">
          <div className="card-head"><div><h3>{data.current ? `${data.current.title} · phiên bản ${data.current.versionNo}` : "Chưa có điều khoản"}</h3>
            <p>{data.current ? `Công bố ${fmtDateTime(data.current.publishedAt, me.tenant.timezone)}. Nội dung mẫu cần chuyên gia pháp lý rà soát.` : "Nhân viên chưa thể đồng ý xử lý dữ liệu cá nhân."}</p></div></div>
          {data.current ? <div className="card-body" style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.6, maxHeight: 460, overflow: "auto" }}>{data.current.content}</div> : null}
        </article>
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <article className="card">
            <div className="card-head"><div><h3>Đồng ý phiên bản hiện hành</h3><p>Tài khoản đã kích hoạt trong phạm vi của bạn</p></div><b className="num">{num(data.consentedCurrent)}/{num(data.accounts)}</b></div>
            <div className="card-body"><span className="progress" style={{ display: "block", ["--value" as string]: `${pct}%` }}><i /></span>
              {data.pending.length ? <>
                <p className="muted" style={{ fontSize: 11.5, margin: "12px 0 6px" }}>Chưa đồng ý (app sẽ hỏi ở lần mở kế tiếp):</p>
                <ul className="version-list" style={{ marginTop: 0 }}>{data.pending.map((p) => <li key={p.id}>{p.fullName} · {p.code}{p.lastVersionNo ? ` · đã đồng ý v${p.lastVersionNo}` : " · chưa đồng ý bản nào"}</li>)}</ul>
              </> : <p className="muted" style={{ fontSize: 11.5, margin: "12px 0 0" }}>Mọi tài khoản đã đồng ý phiên bản hiện hành.</p>}
            </div>
          </article>
          <article className="card"><div className="card-head"><h3>Lịch sử phiên bản</h3></div><div className="detail-list">
            {data.versions.map((v) => <div key={v.id} className="detail-row"><span>v{v.versionNo} · {fmtDate(v.publishedAt)}</span><b>{num(v.consents)} lượt đồng ý</b></div>)}
          </div></article>
        </div>
      </div>
      {editing ? <PrivacyForm current={data.current} onClose={() => setEditing(false)} onSaved={(d) => { setEditing(false); setData(d); }} /> : null}
    </>
  );
}

function PrivacyForm({ current, onClose, onSaved }: { current: PrivacyOverview["current"]; onClose: () => void; onSaved: (d: PrivacyOverview) => void }) {
  const [f, setF] = useState({ title: current?.title ?? "Điều khoản xử lý dữ liệu cá nhân", content: current?.content ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (f.content.trim().length < 50) { setErr("Nội dung điều khoản cần ít nhất 50 ký tự."); return; }
    if (current && f.title === current.title && f.content.trim() === current.content.trim()) { setErr("Nội dung giống phiên bản hiện hành."); return; }
    await run("save", async () => onSaved(await call<PrivacyOverview>("POST", "privacy/terms", { title: f.title, content: f.content.trim() })), "Đã công bố — nhân viên sẽ được hỏi đồng ý lại");
  }
  return (
    <Modal wide title={`Công bố phiên bản ${(current?.versionNo ?? 0) + 1}`} sub="Phiên bản đã công bố không sửa được. Mọi nhân viên phải đồng ý lại ở lần mở app kế tiếp." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang công bố…" : "Công bố"}</button></>}>
      <div className="form-grid">
        <Field label="Tiêu đề" full><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Nội dung" full><textarea rows={14} value={f.content} onChange={(e) => { setF({ ...f, content: e.target.value }); setErr(null); }} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

export default function Page() { return <Suspense><SettingsPage /></Suspense>; }
