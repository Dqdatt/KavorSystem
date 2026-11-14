"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { LocationDef, OrgOptions, PolicyAssignment, PolicyKind, PolicyScopeType, ShiftDef, ShiftVersion } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { PageActions, Empty, ErrorLine, Field, Icon, LoadError, Modal, SCOPE, Status, can, fmtDate, tenantToday, useAction, useMe } from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { Select, SkeletonLines, SkeletonRows } from "@kavor/web-ui";

/* Leaflet cần window → chỉ tải phía trình duyệt. Chọn vị trí (form) dùng Google Maps khi có NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, không thì Leaflet + tile OSM (bản dev);
   bản đồ xem trên thẻ địa điểm luôn là Leaflet chỉ-đọc. */
const LocationMap = dynamic(() => (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? import("../../_ui/google-location-map") : import("../../_ui/location-map")),
  { ssr: false, loading: () => <div className="location-map-canvas" /> });
const MapView = dynamic(() => import("../../_ui/location-map"), { ssr: false, loading: () => <div className="location-map-canvas mini" /> });

/* Ca & địa điểm (prototype v2 PAGES['ca-dia-diem']): ca bên trái, địa điểm bên phải, áp dụng ở dưới — một trang, không tab */
export default function Page() {
  const me = useMe();
  const shifts = useApi<ShiftDef[]>("shifts");
  const locs = useApi<LocationDef[]>("locations");
  const assigned = useApi<PolicyAssignment[]>("policy-assignments?kind=schedule");
  const [shiftForm, setShiftForm] = useState<ShiftDef | "new" | null>(null);
  const [locForm, setLocForm] = useState<LocationDef | "new" | null>(null);
  const [creating, setCreating] = useState<{ kind: PolicyKind; targetId: string } | boolean>(false);
  const manage = can(me, "schedule.manage");
  /* Địa điểm chưa có áp dụng đang/sắp hiệu lực thì không nhân viên nào chấm công được ở đó (app báo "chưa có địa điểm") */
  const applied = new Set((assigned.data ?? []).filter((a) => a.kind === "work_location" && (a.state === "active" || a.state === "scheduled")).map((a) => a.target.id));
  const reloadAll = () => { void shifts.reload(); void locs.reload(); void assigned.reload(); };
  return (
    <section className="page active">
      <LoadError error={shifts.error ?? locs.error} retry={reloadAll} />
      <PageActions>{manage ? <><button className="btn" onClick={() => setLocForm("new")}><Icon name="plus" /> Thêm địa điểm</button><button className="btn primary" onClick={() => setShiftForm("new")}><Icon name="plus" /> Tạo ca</button></> : null}</PageActions>
      <div className="grid two top">
        <div className="col-stack">
          {shifts.data && !shifts.data.length ? <article className="card"><Empty title="Chưa có mẫu ca" /></article> : null}
          {!shifts.data && !shifts.error ? <article className="card"><div className="card-body"><SkeletonLines lines={5} /></div></article> : null}
          {(shifts.data ?? []).map((s) => <ShiftCard key={s.id} s={s} manage={manage} onNew={() => setShiftForm(s)} onChanged={() => void shifts.reload()} />)}
        </div>
        <div className="col-stack">
          {locs.data && !locs.data.length ? <article className="card"><Empty title="Chưa có địa điểm chấm công" /></article> : null}
          {!locs.data && !locs.error ? <article className="card"><div className="card-body"><SkeletonLines lines={5} /></div></article> : null}
          {(locs.data ?? []).map((l) => <LocationCard key={l.id} l={l} manage={manage} unapplied={l.active && !!assigned.data && !applied.has(l.id)} onNew={() => setLocForm(l)} onApply={() => setCreating({ kind: "work_location", targetId: l.id })} onChanged={() => void locs.reload()} />)}
        </div>
      </div>
      <Assignments data={assigned.data} error={assigned.error} reload={assigned.reload} manage={manage} onCreate={() => setCreating(true)} />
      {shiftForm ? <ShiftForm shift={shiftForm === "new" ? null : shiftForm} onClose={() => setShiftForm(null)} onSaved={() => { setShiftForm(null); void shifts.reload(); }} /> : null}
      {locForm ? <LocationForm loc={locForm === "new" ? null : locForm} onClose={() => setLocForm(null)} onSaved={() => { setLocForm(null); reloadAll(); }} /> : null}
      {creating ? <AssignmentForm preset={typeof creating === "object" ? creating : undefined} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void assigned.reload(); }} /> : null}
    </section>
  );
}

const DAYS = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const shiftHours = (v: ShiftVersion) => (mins(v.end) - mins(v.start) - (v.breakStart && v.breakEnd ? mins(v.breakEnd) - mins(v.breakStart) : 0)) / 60;
const shiftNote = (v: ShiftVersion) => `${v.start}–${v.end}${v.breakStart ? ` · nghỉ ${v.breakStart}–${v.breakEnd}` : ""}`;

function ShiftCard({ s, manage, onNew, onChanged }: { s: ShiftDef; manage: boolean; onNew: () => void; onChanged: () => void }) {
  const { run } = useAction();
  const v = s.current ?? s.next;
  const days = v?.workDays ?? [1, 2, 3, 4, 5];
  return (
    <article className="card">
      <div className="card-head"><div><h3>{s.name} <span className="tag">{s.code}</span></h3><span className="small muted">{v ? <>Phiên bản {v.versionNo}<i className="vs" />từ {fmtDate(v.effectiveFrom)}{s.current ? "" : " · chưa hiệu lực"}</> : "Chưa có phiên bản hiệu lực"}</span></div>
        {s.active ? <Status v={["Đang dùng", ""]} /> : <Status v={["Ngừng dùng", "muted"]} />}</div>
      <div className="card-body col">
        {v ? <>
          <div>
            <div className="spread" style={{ marginBottom: 10 }}><b className="num shift-time">{v.start} – {v.end}</b><span className="sub small">{shiftHours(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ làm{v.breakStart ? <><i className="vs" />nghỉ {v.breakStart}–{v.breakEnd}</> : null}</span></div>
            <div className="hours">{[...Array(14)].map((_, k) => { const h = 6 + k, mid = h * 60 + 30; return <i key={h} className={v.breakStart && mid >= mins(v.breakStart) && mid < mins(v.breakEnd!) ? "b" : mid >= mins(v.start) && mid < mins(v.end) ? "w" : ""} title={`${h}:00`} />; })}{[...Array(14)].map((_, k) => <span key={k}>{(6 + k) % 2 ? "" : String(6 + k).padStart(2, "0")}</span>)}</div>
          </div>
          <div className="spread"><div className="week">{[1, 2, 3, 4, 5, 6, 7].map((d) => <span key={d} className={days.includes(d) ? "on" : ""}>{DAYS[d]}</span>)}</div><span className="small sub">{days.length} ngày/tuần</span></div>
          <div className="params"><div className="param"><b className="num">{v.lateGraceMinutes} phút</b><span>Ân hạn đi muộn</span></div><div className="param"><b className="num">{v.earlyGraceMinutes} phút</b><span>Ân hạn về sớm</span></div></div>
        </> : null}
        {s.next && s.current ? <p className="small" style={{ margin: 0 }}><span className="status info">Từ {fmtDate(s.next.effectiveFrom)}</span> {shiftNote(s.next)} · {s.next.workDays.map((d) => DAYS[d]).join(", ")}</p> : null}
        {s.versions.length > 1 ? <ul className="version-list" style={{ margin: 0 }}>{s.versions.map((x) => <li key={x.id}>v{x.versionNo} · từ {fmtDate(x.effectiveFrom)} · {shiftNote(x)}{x.note ? ` — ${x.note}` : ""}</li>)}</ul> : null}
        {manage ? <div className="row-actions">
          <button className="btn small" onClick={onNew}><Icon name="edit" />Phiên bản mới</button>
          <button className="btn small ghost" onClick={() => run(s.id, () => call("PATCH", `shifts/${s.id}`, { active: !s.active }), s.active ? "Đã ngừng dùng ca" : "Đã dùng lại ca").then(() => onChanged())}>{s.active ? "Ngừng dùng" : "Dùng lại"}</button>
        </div> : null}
      </div>
    </article>
  );
}

function LocationCard({ l, manage, unapplied, onNew, onApply, onChanged }: { l: LocationDef; manage: boolean; unapplied: boolean; onNew: () => void; onApply: () => void; onChanged: () => void }) {
  const { run } = useAction();
  /* Chưa có phiên bản hiệu lực hôm nay (phiên bản đầu bắt đầu từ ngày sau) thì hiện phiên bản sắp tới, ghi rõ ngày */
  const v = l.current ?? l.next;
  return (
    <article className="card">
      <div className="card-head"><div><h3>{l.name} <span className="tag">{l.code}</span></h3><span className="small muted">{[l.address, l.branch?.name].filter(Boolean).join(" · ") || "—"}{v ? <><i className="vs" />phiên bản {v.versionNo} từ {fmtDate(v.effectiveFrom)}</> : null}</span></div>
        <span className="row-actions">{l.active ? <Status v={["Đang dùng", ""]} /> : <Status v={["Ngừng dùng", "muted"]} />}{unapplied ? <span className="status warn">Chưa áp dụng cho ai</span> : null}</span></div>
      <div className="card-body col">
        {v ? <>
          <MapView value={{ lat: v.latitude, lng: v.longitude }} radius={v.radiusM} onPick={() => undefined} readOnly />
          <div className="params">
            <div className="param"><b className="num">{v.radiusM}&nbsp;m</b><span>Bán kính cho phép</span></div>
            <div className="param"><b className="num">±{v.maxAccuracyM}&nbsp;m</b><span>Sai số GPS tối đa</span></div>
            <div className="param"><b className="num"><a href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`} target="_blank" rel="noreferrer">{v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</a></b><span>Tọa độ</span></div>
          </div>
        </> : <p className="muted small" style={{ margin: 0 }}>Chưa có phiên bản hiệu lực.</p>}
        {l.current && l.next ? <p className="small" style={{ margin: 0 }}><span className="status info">Từ {fmtDate(l.next.effectiveFrom)}</span> bán kính {l.next.radiusM} m</p> : null}
        {!l.current && l.next ? <p className="small" style={{ margin: 0 }}><span className="status warn">Chưa hiệu lực</span></p> : null}
        {manage ? <div className="row-actions">{unapplied ? <button className="btn small primary" onClick={onApply}>Áp dụng</button> : null}
          <button className="btn small" onClick={onNew}><Icon name="edit" />Phiên bản mới</button>
          <button className="btn small ghost" onClick={() => run(l.id, () => call("PATCH", `locations/${l.id}`, { active: !l.active }), l.active ? "Đã ngừng dùng địa điểm" : "Đã dùng lại địa điểm").then(() => onChanged())}>{l.active ? "Ngừng" : "Dùng lại"}</button></div> : null}
      </div>
    </article>
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
        <Field label="Hiệu lực từ ngày" hint={loc ? "Trùng ngày của phiên bản đang có = sửa phiên bản đó (khi chưa ai chấm công ở đây từ ngày này)" : undefined}><input type="date" min={tenantToday(me.tenant.timezone)} value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field>
        <Field label="Ghi chú"><input value={f.note} onChange={set("note")} /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

const STATE: Record<PolicyAssignment["state"], [string, string]> = { active: ["Đang áp dụng", ""], scheduled: ["Sắp áp dụng", "info"], ended: ["Đã kết thúc", "muted"], cancelled: ["Đã hủy", "muted"] };

function Assignments({ data, error, reload, manage, onCreate }: { data: PolicyAssignment[] | null; error: { message: string } | null; reload: () => void | Promise<unknown>; manage: boolean; onCreate: () => void }) {
  const [ending, setEnding] = useState<PolicyAssignment | null>(null);
  const [showOld, setShowOld] = useState(false);
  const rows = (data ?? []).filter((a) => showOld || a.state === "active" || a.state === "scheduled");
  return (
    <article className="card">
      <div className="card-head"><div><h3>Đang áp dụng</h3><span className="small muted">Áp dụng hẹp hơn (phòng ban, cá nhân) được ưu tiên hơn Toàn công ty</span></div>
        <div className="row-actions"><div className="segmented">
          <button className={!showOld ? "active" : ""} onClick={() => setShowOld(false)}>Đang và sắp áp dụng</button>
          <button className={showOld ? "active" : ""} onClick={() => setShowOld(true)}>Cả lịch sử</button></div>
          {manage ? <button className="btn small primary" onClick={onCreate}><Icon name="plus" /> Áp dụng mới</button> : null}</div></div>
      {data && !rows.length ? <Empty title="Chưa có áp dụng nào" /> : (
        <div className="table-wrap"><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>Loại</th><th>Áp dụng</th><th>Phạm vi</th><th>Hiệu lực</th><th>Người tạo</th><th>Trạng thái</th><th /></tr></thead><tbody>
          {!data && !error ? <SkeletonRows cols={7} rows={3} /> : null}
          {rows.map((a) => (
            <tr key={a.id} className={a.state === "ended" || a.state === "cancelled" ? "past" : ""}>
              <td><span className="rw"><Icon name={a.kind === "shift" ? "clock" : "pin"} size={16} />{a.kind === "shift" ? "Ca làm" : "Địa điểm"}</span></td>
              <td><b>{a.target.name}</b></td>
              <td className="nowrap"><span className="tag">{SCOPE[a.scopeType]}</span>{a.scope ? <> <span className="small muted">{a.scope.name}</span></> : null}</td>
              <td className="num nowrap">{fmtDate(a.effectiveFrom)} → {a.effectiveTo ? fmtDate(a.effectiveTo) : "không thời hạn"}</td>
              <td className="wrap"><span className="sub">{a.createdBy ?? "Dữ liệu mẫu"}</span>{a.reason ? <small className="muted" style={{ display: "block" }}>{a.reason}</small> : null}</td>
              <td><Status v={STATE[a.state]} /></td>
              <td>{manage && (a.state === "active" || a.state === "scheduled") ? <button className="btn small ghost" onClick={() => setEnding(a)}>{a.state === "scheduled" ? "Hủy" : "Kết thúc"}</button> : null}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {ending ? <ReasonModal title={`${ending.state === "scheduled" ? "Hủy" : "Kết thúc từ hôm nay"} áp dụng ${ending.target.name}`} label="Lý do" ok="Đã cập nhật áp dụng"
        go={(reason) => call("POST", `policy-assignments/${ending.id}/end`, { reason })} onClose={() => setEnding(null)} onDone={reload} /> : null}
    </article>
  );
}

function AssignmentForm({ preset, onClose, onSaved }: { preset?: { kind: PolicyKind; targetId: string }; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const shifts = useApi<ShiftDef[]>("shifts"), locs = useApi<LocationDef[]>("locations"), org = useApi<OrgOptions>("org");
  const [f, setF] = useState({ kind: preset?.kind ?? ("shift" as PolicyKind), targetId: preset?.targetId ?? "", scopeType: (preset ? "tenant" : "department") as PolicyScopeType, scopeId: "", effectiveFrom: tenantToday(me.tenant.timezone), effectiveTo: "", reason: "" });
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

