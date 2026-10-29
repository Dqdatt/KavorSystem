"use client";
import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { LocationDef, OrgOptions, PolicyAssignment, PolicyKind, PolicyScopeType, ShiftDef, ShiftVersion } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, SCOPE, Status, can, fmtDate, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { Select } from "@kavor/web-ui";

type Tab = "shifts" | "locations" | "assignments";
/* Leaflet cần window → chỉ tải phía trình duyệt */
/* Có NEXT_PUBLIC_GOOGLE_MAPS_API_KEY thì dùng Google Maps, chưa có thì Leaflet + tile OSM (bản dev) */
const LocationMap = dynamic(() => (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? import("../../_ui/google-location-map") : import("../../_ui/location-map")),
  { ssr: false, loading: () => <div className="location-map-canvas" /> });

function SchedulesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "shifts";
  return (
    <section className="page active">
      <div className="page-head">
        <div><p>{tab === "assignments" ? "Ưu tiên: cá nhân > phòng ban > chi nhánh > pháp nhân > công ty. Nhân viên luôn tra theo ngày, không sao chép quy định vào hồ sơ." : "Sửa giờ ca hay vị trí = thêm phiên bản mới từ một ngày; phiên bản cũ giữ nguyên cho công đã chấm."}</p></div>
        <div className="segmented" role="tablist">{([["shifts", "Mẫu ca"], ["locations", "Địa điểm"], ["assignments", "Áp dụng"]] as const).map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => router.replace(`/schedules?tab=${k}`, { scroll: false })}>{l}</button>)}</div>
      </div>
      {tab === "shifts" ? <Shifts /> : tab === "locations" ? <Locations /> : <Assignments />}
    </section>
  );
}

const DAYS = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
/* "T2–T6", "T2–T7", hoặc liệt kê khi không liên tục */
const daysText = (d: number[]) => { const s = [...d].sort(); return s.length > 2 && s.every((x, i) => i === 0 || x === s[i - 1]! + 1) ? `${DAYS[s[0]!]}–${DAYS[s[s.length - 1]!]}` : s.map((x) => DAYS[x]).join(", "); };
const shiftText = (v: ShiftVersion) => `${daysText(v.workDays ?? [1, 2, 3, 4, 5])} · ${v.start}–${v.end}${v.breakStart ? ` · nghỉ ${v.breakStart}–${v.breakEnd}` : ""}${v.lateGraceMinutes ? ` · ân hạn muộn ${v.lateGraceMinutes}′` : ""}${v.earlyGraceMinutes ? ` · ân hạn sớm ${v.earlyGraceMinutes}′` : ""}`;

function Shifts() {
  const me = useMe();
  const { data, error, reload } = useApi<ShiftDef[]>("shifts");
  const [form, setForm] = useState<ShiftDef | "new" | null>(null);
  const { run } = useAction();
  const manage = can(me, "schedule.manage");
  return (
    <>
      <LoadError error={error} retry={reload} />
      {manage ? <div className="head-actions" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setForm("new")}><Icon name="plus" /> Tạo ca</button></div> : null}
      {data && !data.length ? <Empty title="Chưa có mẫu ca" /> : (
        <div className="grid two">
          {(data ?? []).map((s) => (
            <article key={s.id} className="card">
              <div className="card-head"><div><h3>{s.code} · {s.name}</h3><p>{s.current ? shiftText(s.current) : "Chưa có phiên bản hiệu lực"}</p></div>
                <span className="row-actions">{s.active ? <Status v={["Đang dùng", ""]} /> : <Status v={["Ngừng dùng", "muted"]} />}</span></div>
              <div className="card-body">
                {s.next ? <p style={{ margin: "0 0 8px", fontSize: 12.5 }}><span className="status info">Từ {fmtDate(s.next.effectiveFrom)}</span> {shiftText(s.next)}</p> : null}
                <ul className="version-list">{s.versions.map((v) => <li key={v.id}>v{v.versionNo} · từ {fmtDate(v.effectiveFrom)} · {shiftText(v)}{v.note ? ` — ${v.note}` : ""}</li>)}</ul>
                {manage ? <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <button className="btn small" onClick={() => setForm(s)}>Phiên bản mới</button>
                  <button className="btn small" onClick={() => run(s.id, () => call("PATCH", `shifts/${s.id}`, { active: !s.active }), s.active ? "Đã ngừng dùng ca" : "Đã dùng lại ca").then(() => reload())}>{s.active ? "Ngừng dùng" : "Dùng lại"}</button>
                </div> : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {form ? <ShiftForm shift={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); void reload(); }} /> : null}
    </>
  );
}

function ShiftForm({ shift, onClose, onSaved }: { shift: ShiftDef | null; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const base = shift?.next ?? shift?.current;
  const [f, setF] = useState({ code: "", name: "", start: base?.start ?? "08:00", end: base?.end ?? "17:00", breakStart: base?.breakStart ?? "12:00", breakEnd: base?.breakEnd ?? "13:00",
    lateGraceMinutes: String(base?.lateGraceMinutes ?? 0), earlyGraceMinutes: String(base?.earlyGraceMinutes ?? 0), workDays: base?.workDays ?? [1, 2, 3, 4, 5], effectiveFrom: tenantToday(me.tenant.timezone), note: "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr(null); };
  async function save() {
    if (f.end <= f.start) { setErr("Giờ kết thúc phải sau giờ bắt đầu (chưa hỗ trợ ca qua đêm)."); return; }
    if (!f.workDays.length) { setErr("Chọn ít nhất một ngày làm việc."); return; }
    const v = { start: f.start, end: f.end, breakStart: f.breakStart || null, breakEnd: f.breakEnd || null, lateGraceMinutes: Number(f.lateGraceMinutes) || 0, earlyGraceMinutes: Number(f.earlyGraceMinutes) || 0, workDays: f.workDays, effectiveFrom: f.effectiveFrom, note: f.note || null };
    const ok = await run("save", () => (shift ? call("POST", `shifts/${shift.id}/versions`, v) : call("POST", "shifts", { ...v, code: f.code, name: f.name })), shift ? "Đã thêm phiên bản ca" : "Đã tạo ca");
    if (ok) onSaved();
  }
  return (
    <Modal title={shift ? `Phiên bản mới · ${shift.name}` : "Tạo mẫu ca"} sub={shift ? "Áp dụng từ ngày hiệu lực; công trước ngày đó vẫn tính theo phiên bản cũ." : "Ca mới chưa áp dụng cho ai cho tới khi tạo áp dụng."} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        {!shift ? <><Field label="Mã ca"><input value={f.code} onChange={set("code")} placeholder="HC" /></Field><Field label="Tên ca"><input value={f.name} onChange={set("name")} placeholder="Ca hành chính" /></Field></> : null}
        <Field label="Giờ vào"><input type="time" value={f.start} onChange={set("start")} /></Field>
        <Field label="Giờ ra"><input type="time" value={f.end} onChange={set("end")} /></Field>
        <Field label="Nghỉ giữa ca từ"><input type="time" value={f.breakStart} onChange={set("breakStart")} /></Field>
        <Field label="đến"><input type="time" value={f.breakEnd} onChange={set("breakEnd")} /></Field>
        <Field label="Ngày làm việc trong tuần" full>
          <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="check-row"><input type="checkbox" checked={f.workDays.includes(d)} onChange={(e) => setF({ ...f, workDays: e.target.checked ? [...f.workDays, d].sort() : f.workDays.filter((x) => x !== d) })} /> {DAYS[d]}</label>
          ))}</span>
        </Field>
        <Field label="Ân hạn đi muộn (phút)"><input type="number" min={0} max={120} value={f.lateGraceMinutes} onChange={set("lateGraceMinutes")} /></Field>
        <Field label="Ân hạn về sớm (phút)"><input type="number" min={0} max={120} value={f.earlyGraceMinutes} onChange={set("earlyGraceMinutes")} /></Field>
        <Field label="Hiệu lực từ ngày"><input type="date" min={tenantToday(me.tenant.timezone)} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field>
        <Field label="Ghi chú"><input value={f.note} onChange={set("note")} placeholder="Ví dụ: đổi giờ mùa đông" /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function Locations() {
  const me = useMe();
  const { data, error, reload } = useApi<LocationDef[]>("locations");
  const [form, setForm] = useState<LocationDef | "new" | null>(null);
  const { run } = useAction();
  const manage = can(me, "schedule.manage");
  return (
    <>
      <LoadError error={error} retry={reload} />
      {manage ? <div className="head-actions" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setForm("new")}><Icon name="plus" /> Thêm địa điểm</button></div> : null}
      <article className="card">
        {data && !data.length ? <Empty title="Chưa có địa điểm chấm công" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Địa điểm</th><th>Chi nhánh</th><th>Tọa độ</th><th title="Bán kính · sai số GPS tối đa">Bán kính · sai số</th><th>Phiên bản</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id}>
                <td className="wrap"><b>{l.code} · {l.name}</b><br /><small className="muted">{l.address ?? "—"}</small></td>
                <td className="wrap">{l.branch?.name ?? "—"}</td>
                {/* Chưa có phiên bản hiệu lực hôm nay (phiên bản đầu bắt đầu từ ngày sau) thì hiện phiên bản sắp tới, ghi rõ ngày */}
                {((v) => <>
                  <td>{v ? <a href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`} target="_blank" rel="noreferrer">{v.latitude.toFixed(6)}, {v.longitude.toFixed(6)}</a> : "—"}</td>
                  <td>{v ? `${v.radiusM} m · ±${v.maxAccuracyM} m` : "—"}{l.current && l.next ? <><br /><small className="status info">Từ {fmtDate(l.next.effectiveFrom)}: {l.next.radiusM} m</small></> : null}</td>
                  <td>{v ? <>v{v.versionNo} · từ {fmtDate(v.effectiveFrom)}{l.current ? null : <><br /><small className="status warn">Chưa hiệu lực</small></>}</> : "—"}</td>
                </>)(l.current ?? l.next)}
                <td>{l.active ? <Status v={["Đang dùng", ""]} /> : <Status v={["Ngừng dùng", "muted"]} />}</td>
                <td>{manage ? <span className="row-actions"><button className="btn small" onClick={() => setForm(l)}>Phiên bản mới</button>
                  <button className="btn small" onClick={() => run(l.id, () => call("PATCH", `locations/${l.id}`, { active: !l.active }), l.active ? "Đã ngừng dùng địa điểm" : "Đã dùng lại địa điểm").then(() => reload())}>{l.active ? "Ngừng" : "Dùng lại"}</button></span> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {form ? <LocationForm loc={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); void reload(); }} /> : null}
    </>
  );
}

function LocationForm({ loc, onClose, onSaved }: { loc: LocationDef | null; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const org = useApi<OrgOptions>("org");
  const base = loc?.next ?? loc?.current;
  const [f, setF] = useState({ code: "", name: "", address: "", branchId: "", latitude: String(base?.latitude ?? ""), longitude: String(base?.longitude ?? ""), radiusM: String(base?.radiusM ?? 50), maxAccuracyM: String(base?.maxAccuracyM ?? 60), effectiveFrom: tenantToday(me.tenant.timezone), note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr(null); };
  /* Lấy tọa độ từ trình duyệt (cần HTTPS hoặc localhost) — thay cho nút dev trên mobile trước đây */
  const here = () => {
    if (!navigator.geolocation) { setErr("Trình duyệt không hỗ trợ định vị."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); if (p.coords.accuracy > 100) setErr(`Vị trí trình duyệt sai số ±${Math.round(p.coords.accuracy)} m — nên kiểm tra lại trên bản đồ.`); },
      (e) => { setLocating(false); setErr(e.code === 1 ? "Bạn chưa cho phép trình duyệt truy cập vị trí." : "Không lấy được vị trí."); },
      { enableHighAccuracy: true, timeout: 15000 });
  };
  const lat = Number(f.latitude), lng = Number(f.longitude);
  const point = f.latitude !== "" && f.longitude !== "" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  async function save() {
    const v = { latitude: Number(f.latitude), longitude: Number(f.longitude), radiusM: Number(f.radiusM), maxAccuracyM: Number(f.maxAccuracyM), effectiveFrom: f.effectiveFrom, note: f.note || null };
    if (!Number.isFinite(v.latitude) || !Number.isFinite(v.longitude) || f.latitude === "" || f.longitude === "") { setErr("Nhập vĩ độ và kinh độ."); return; }
    const ok = await run("save", () => (loc ? call("POST", `locations/${loc.id}/versions`, v) : call("POST", "locations", { ...v, code: f.code, name: f.name, address: f.address || null, branchId: f.branchId || null })), loc ? "Đã thêm phiên bản địa điểm" : "Đã thêm địa điểm");
    if (ok) onSaved();
  }
  return (
    <Modal wide title={loc ? `Phiên bản mới · ${loc.name}` : "Thêm địa điểm chấm công"} sub="Bán kính nên ≥ 50 m vì GPS điện thoại thường lệch 5–30 m trong nhà." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        {!loc ? <>
          <Field label="Mã địa điểm"><input value={f.code} onChange={set("code")} placeholder="HCM-Q3" /></Field>
          <Field label="Tên"><input value={f.name} onChange={set("name")} placeholder="Văn phòng Quận 3" /></Field>
          <Field label="Địa chỉ" full><input value={f.address} onChange={set("address")} /></Field>
          <Field label="Chi nhánh"><Select value={f.branchId} onChange={set("branchId")}><option value="">Không gắn</option>{org.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        </> : null}
        <LocationMap value={point} radius={Number(f.radiusM) || 0} onPick={(p) => { setF((x) => ({ ...x, latitude: p.lat.toFixed(6), longitude: p.lng.toFixed(6) })); setErr(null); }} />
        <Field label="Vĩ độ"><input inputMode="decimal" value={f.latitude} onChange={set("latitude")} placeholder="10.774390" /></Field>
        <Field label="Kinh độ"><input inputMode="decimal" value={f.longitude} onChange={set("longitude")} placeholder="106.703940" /></Field>
        <div className="field full"><button className="btn small" type="button" onClick={here} disabled={locating}><Icon name="pin" /> {locating ? "Đang lấy vị trí…" : "Dùng vị trí hiện tại của trình duyệt"}</button></div>
        <Field label="Bán kính (m)"><input type="number" min={10} max={5000} value={f.radiusM} onChange={set("radiusM")} /></Field>
        <Field label="Sai số GPS tối đa (m)" hint="Lần chấm công có sai số lớn hơn sẽ bị từ chối"><input type="number" min={5} max={1000} value={f.maxAccuracyM} onChange={set("maxAccuracyM")} /></Field>
        <Field label="Hiệu lực từ ngày"><input type="date" min={tenantToday(me.tenant.timezone)} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field>
        <Field label="Ghi chú"><input value={f.note} onChange={set("note")} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

const STATE: Record<PolicyAssignment["state"], [string, string]> = { active: ["Đang áp dụng", ""], scheduled: ["Sắp áp dụng", "info"], ended: ["Đã kết thúc", "muted"], cancelled: ["Đã hủy", "muted"] };

function Assignments() {
  const me = useMe();
  const { data, error, reload } = useApi<PolicyAssignment[]>("policy-assignments?kind=schedule");
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<PolicyAssignment | null>(null);
  const [showOld, setShowOld] = useState(false);
  const manage = can(me, "schedule.manage");
  const rows = (data ?? []).filter((a) => showOld || a.state === "active" || a.state === "scheduled");
  return (
    <>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar">
          <button className={`filter-chip ${!showOld ? "active" : ""}`} onClick={() => setShowOld(false)}>Đang và sắp áp dụng</button>
          <button className={`filter-chip ${showOld ? "active" : ""}`} onClick={() => setShowOld(true)}>Cả lịch sử</button>
          <span className="toolbar-spacer" />
          {manage ? <button className="btn primary small" onClick={() => setCreating(true)}><Icon name="plus" /> Áp dụng mới</button> : null}
        </div>
        {data && !rows.length ? <Empty title="Chưa có áp dụng nào" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Loại</th><th>Áp dụng</th><th>Tầng</th><th>Hiệu lực</th><th>Trạng thái</th><th>Lý do · người tạo</th><th /></tr></thead><tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.kind === "shift" ? "Ca làm" : "Địa điểm"}</td>
                <td><b>{a.target.name}</b></td>
                <td className="wrap">{SCOPE[a.scopeType]}{a.scope ? `: ${a.scope.name}` : ""}</td>
                <td className="nowrap">{fmtDate(a.effectiveFrom)} → {a.effectiveTo ? fmtDate(a.effectiveTo) : "không thời hạn"}</td>
                <td><Status v={STATE[a.state]} /></td>
                <td className="wrap"><small>{a.reason ?? "—"}<br /><span className="muted">{a.createdBy ?? "Dữ liệu mẫu"}</span></small></td>
                <td>{manage && (a.state === "active" || a.state === "scheduled") ? <button className="btn small" onClick={() => setEnding(a)}>{a.state === "scheduled" ? "Hủy" : "Kết thúc"}</button> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {creating ? <AssignmentForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void reload(); }} /> : null}
      {ending ? <ReasonModal title={`${ending.state === "scheduled" ? "Hủy" : "Kết thúc từ hôm nay"} áp dụng ${ending.target.name}`} label="Lý do" ok="Đã cập nhật áp dụng"
        go={(reason) => call("POST", `policy-assignments/${ending.id}/end`, { reason })} onClose={() => setEnding(null)} onDone={reload} /> : null}
    </>
  );
}

function AssignmentForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const shifts = useApi<ShiftDef[]>("shifts"), locs = useApi<LocationDef[]>("locations"), org = useApi<OrgOptions>("org");
  const [f, setF] = useState({ kind: "shift" as PolicyKind, targetId: "", scopeType: "department" as PolicyScopeType, scopeId: "", effectiveFrom: tenantToday(me.tenant.timezone), effectiveTo: "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value, ...(k === "kind" ? { targetId: "" } : k === "scopeType" ? { scopeId: "" } : {}) }); setErr(null); };
  const targets = f.kind === "shift" ? (shifts.data ?? []).filter((s) => s.active).map((s) => ({ id: s.id, name: `${s.code} · ${s.name}` })) : (locs.data ?? []).filter((l) => l.active).map((l) => ({ id: l.id, name: `${l.code} · ${l.name}` }));
  const scopes = f.scopeType === "legal_entity" ? org.data?.legalEntities : f.scopeType === "branch" ? org.data?.branches : f.scopeType === "department" ? org.data?.departments : f.scopeType === "employee" ? org.data?.employees.map((e) => ({ id: e.id, name: `${e.name} · ${e.code}` })) : [];
  async function save() {
    if (!f.targetId) { setErr("Chọn ca hoặc địa điểm."); return; }
    if (f.scopeType !== "tenant" && !f.scopeId) { setErr("Chọn đối tượng áp dụng."); return; }
    if (f.scopeType === "employee" && f.reason.trim().length < 5) { setErr("Ngoại lệ cá nhân phải ghi lý do (ít nhất 5 ký tự)."); return; }
    const ok = await run("save", () => call("POST", "policy-assignments", { ...f, scopeId: f.scopeType === "tenant" ? null : f.scopeId, effectiveTo: f.effectiveTo || null, reason: f.reason || null }), "Đã tạo áp dụng");
    if (ok) onSaved();
  }
  return (
    <Modal wide title="Áp dụng ca / địa điểm" sub={f.kind === "work_location" ? "Ở cùng một tầng có thể áp dụng nhiều địa điểm; nhân viên chấm công ở địa điểm gần nhất." : "Mỗi nhân viên theo ca của tầng ưu tiên cao nhất khớp với họ."} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Áp dụng"}</button></>}>
      <div className="form-grid">
        <Field label="Loại"><Select value={f.kind} onChange={set("kind")}><option value="shift">Ca làm</option><option value="work_location">Địa điểm chấm công</option></Select></Field>
        <Field label={f.kind === "shift" ? "Ca" : "Địa điểm"}><Select value={f.targetId} onChange={set("targetId")}><option value="">Chọn…</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Tầng"><Select value={f.scopeType} onChange={set("scopeType")}>{(["tenant", "legal_entity", "branch", "department", "employee"] as const).map((s) => <option key={s} value={s}>{SCOPE[s]}</option>)}</Select></Field>
        {f.scopeType !== "tenant" ? <Field label="Đối tượng"><Select value={f.scopeId} onChange={set("scopeId")}><option value="">Chọn…</option>{(scopes ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : <div />}
        <Field label="Hiệu lực từ"><input type="date" min={tenantToday(me.tenant.timezone)} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field>
        <Field label="Đến (bỏ trống = không thời hạn)"><input type="date" value={f.effectiveTo} onChange={set("effectiveTo")} /></Field>
        <Field label={f.scopeType === "employee" ? "Lý do (bắt buộc với ngoại lệ cá nhân)" : "Lý do"} full><input value={f.reason} onChange={set("reason")} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

export default function Page() { return <Suspense><SchedulesPage /></Suspense>; }
