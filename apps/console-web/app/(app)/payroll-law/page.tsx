"use client";
/* Tham số luật tính lương (ADR 0001: Kavor duy trì luật nhà nước). Phiên bản theo ngày hiệu lực; phiên bản đã hiệu lực bất biến — đổi luật =
   tạo phiên bản mới từ ngày áp dụng. Chỉ Quản trị Console tạo/sửa. Mục chưa đối chiếu văn bản gốc hiện cảnh báo (cả khi doanh nghiệp tính lương). */
import { useState } from "react";
import type { PayCalcResult, PayrollLawParams, PayrollLawVersion } from "@kavor/contracts";
import { PayCalc, SkeletonLines } from "@kavor/web-ui";
import { call, useApi } from "../../_lib/client";
import { ErrorLine, Field, LoadError, Modal, Status, fmtDate, tenantToday, useAction, useMe } from "../../_ui/kit";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
const pct = (r: number) => `${(r * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const STATE: Record<PayrollLawVersion["state"], [string, string]> = { active: ["Đang áp dụng", ""], future: ["Sắp áp dụng", "info"], past: ["Đã thay thế", "muted"] };

function Summary({ p }: { p: PayrollLawParams }) {
  const row = (k: string, v: string) => <div className="detail-row"><span>{k}</span><b>{v}</b></div>;
  return (
    <div className="card detail-list">
      {row("Lương cơ sở", vnd(p.baseSalary))}
      {row("Lương tối thiểu vùng I–IV", (["1", "2", "3", "4"] as const).map((r) => vnd(p.regionMinWage[r])).join(" · "))}
      {row("Người lao động BHXH · BHYT · BHTN", `${pct(p.employee.si)} · ${pct(p.employee.hi)} · ${pct(p.employee.ui)}`)}
      {row("Công ty BHXH · BHYT · BHTN", `${pct(p.employer.si)} · ${pct(p.employer.hi)} · ${pct(p.employer.ui)}`)}
      {row("Trần đóng", `BHXH/BHYT ${p.capMultiplier.siHi} × lương cơ sở = ${vnd(p.baseSalary * p.capMultiplier.siHi)} · BHTN ${p.capMultiplier.ui} × lương tối thiểu vùng`)}
      {row("Giảm trừ bản thân · người phụ thuộc", `${vnd(p.deduction.self)} · ${vnd(p.deduction.dependent)}`)}
      {row("Biểu thuế", p.pit.map((b, i) => `${b.upTo ? `đến ${(b.upTo / 1e6).toLocaleString("vi-VN")} tr` : i ? "trên" : "mọi mức"} ${pct(b.rate)}`).join(" · "))}
      {row("Thời vụ (dưới 3 tháng)", `${pct(p.casual.rate)} từ ${vnd(p.casual.threshold)}`)}
      {row("Đoàn phí", `NLĐ ${pct(p.union.employee)} (tối đa ${pct(p.union.employeeCapOfBase)} lương cơ sở) · công ty ${pct(p.union.employer)}`)}
    </div>
  );
}

function VersionModal({ base, edit, onClose, onDone }: { base: PayrollLawVersion; edit: boolean; onClose: () => void; onDone: (v: PayrollLawVersion[]) => void }) {
  const [from, setFrom] = useState(edit ? base.effectiveFrom : "");
  const [params, setParams] = useState(JSON.stringify(base.params, null, 2));
  const [sources, setSources] = useState(JSON.stringify(base.sources, null, 2));
  const [note, setNote] = useState(edit ? base.note ?? "" : "");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    let p: unknown, s: unknown;
    try { p = JSON.parse(params); s = JSON.parse(sources); } catch { setErr("Tham số hoặc nguồn không phải JSON hợp lệ."); return; }
    await run("save", async () => {
      onDone(edit ? await call("PATCH", `payroll-law/${base.id}`, { params: p, sources: s, note }) : await call("POST", "payroll-law", { effectiveFrom: from, params: p, sources: s, note }));
      onClose();
    }, edit ? "Đã lưu phiên bản" : "Đã tạo phiên bản");
  }
  return (
    <Modal wide title={edit ? `Sửa phiên bản từ ${fmtDate(base.effectiveFrom)}` : "Phiên bản luật mới"} sub="Tỷ lệ ghi dạng số thập phân (8% = 0.08). Mỗi mục ghi nguồn văn bản; chưa đối chiếu văn bản gốc thì để verified: false." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy || (!edit && !from)} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        {!edit ? <Field label="Hiệu lực từ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field> : null}
        <Field label="Ghi chú"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd. Lương cơ sở mới theo NĐ…" /></Field>
        <Field label="Tham số" full><textarea rows={14} value={params} onChange={(e) => setParams(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} /></Field>
        <Field label="Nguồn" full><textarea rows={8} value={sources} onChange={(e) => setSources(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

export default function PayrollLaw() {
  const me = useMe();
  const { data, error, reload, setData } = useApi<PayrollLawVersion[]>("payroll-law");
  const [modal, setModal] = useState<{ base: PayrollLawVersion; edit: boolean } | null>(null);
  const [calc, setCalc] = useState(false);
  const admin = me.role === "platform_admin";
  const latest = data?.[0];
  return (
    <section className="page active">
      <div className="page-head"><div><p>Luật nhà nước dùng để tính lương cho mọi doanh nghiệp. Đổi luật = tạo phiên bản mới từ ngày áp dụng.</p></div>
        <div className="head-actions">
          <button className="btn" onClick={() => setCalc(!calc)}>{calc ? "Ẩn tính thử" : "Tính thử"}</button>
          {admin && latest ? <button className="btn primary" onClick={() => setModal({ base: latest, edit: false })}>Tạo phiên bản mới</button> : null}
        </div>
      </div>
      <LoadError error={error} retry={reload} />
      {calc ? <div style={{ marginBottom: 16 }}><PayCalc defaultDate={tenantToday("Asia/Ho_Chi_Minh")} onCalc={(i) => call<PayCalcResult>("POST", "payroll-law/preview", i)} /></div> : null}
      {!data && !error ? <SkeletonLines lines={6} /> : null}
      {(data ?? []).map((v) => {
        const todo = v.sources.filter((s) => !s.verified);
        return (
          <article key={v.id} className="card" style={{ padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>Hiệu lực từ {fmtDate(v.effectiveFrom)}</b><Status v={STATE[v.state]} />
              {todo.length ? <Status v={[`${todo.length} mục cần đối chiếu`, "warn"]} /> : <Status v={["Đã đối chiếu đủ", ""]} />}
              <span className="toolbar-spacer" style={{ flex: 1 }} />
              {admin && v.editable ? <button className="btn small" onClick={() => setModal({ base: v, edit: true })}>Sửa</button> : null}
            </div>
            {v.note ? <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>{v.note}</p> : null}
            <div className="profile-grid" style={{ marginTop: 10 }}>
              <Summary p={v.params} />
              <div className="card detail-list">
                {v.sources.map((s) => <div key={s.item} className="detail-row"><span>{s.item}</span><b className={s.verified ? "" : "text-amber"} style={{ fontWeight: 500 }}>{s.verified ? "" : "Cần đối chiếu · "}{s.ref}</b></div>)}
              </div>
            </div>
          </article>
        );
      })}
      {modal ? <VersionModal base={modal.base} edit={modal.edit} onClose={() => setModal(null)} onDone={setData} /> : null}
    </section>
  );
}
