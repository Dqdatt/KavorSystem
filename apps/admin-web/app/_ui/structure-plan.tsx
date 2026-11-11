"use client";
/* Sắp xếp tự động (Cơ cấu tổ chức): thay vì đặt cấp từng chức danh và chọn quản lý từng người, Kavor đề xuất theo hệ cấp bậc chuẩn
   (Nhân viên → Trưởng nhóm → Quản lý → Ban Giám đốc) và phòng ban; HR xem một bảng, đổi chỗ chưa đúng, áp dụng một lần. */
import { Fragment, useEffect, useState } from "react";
import { MANAGEMENT_TIERS, MANAGEMENT_TIERS_EN, type ManagementTier, type StructureInput, type StructurePlan } from "@kavor/contracts";
import { Select } from "@kavor/web-ui";
import { call } from "../_lib/client";
import { ErrorLine, Modal, useAction } from "./kit";

const TIERS = [1, 2, 3, 4] as ManagementTier[];

export function StructureModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [input, setInput] = useState<Required<StructureInput>>({ tiers: {}, overwrite: false, skip: [], grantManager: true, skipGrant: [] });
  const [plan, setPlan] = useState<StructurePlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const { busy, run } = useAction();
  const load = (next: Required<StructureInput>) => { setInput(next); void run("plan", async () => { setErr(null); setPlan(await call<StructurePlan>("POST", "organization/structure/plan", next)); }); };
  useEffect(() => { load(input); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const positions = (plan?.positions ?? []).filter((p) => !onlyChanges || p.tier !== p.current || p.current == null);
  const rows = (plan?.rows ?? []).filter((r) => !onlyChanges || r.change || input.skip.includes(r.employeeId) || (!r.proposed && r.note));
  const n = plan?.changes ?? { tiers: 0, managers: 0, grants: 0 };
  return (
    <Modal wide title="Sắp xếp cấp bậc và quản lý tự động" sub="Kavor đề xuất theo tên chức danh và phòng ban. Xem lại, đổi chỗ chưa đúng rồi áp dụng một lần — không phải sửa từng người." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={!plan || !!busy || (!n.tiers && !n.managers && !n.grants)} onClick={() => run("apply", async () => {
          await call("POST", "organization/structure/apply", input); onDone(); onClose();
        }, `Đã đổi cấp ${n.tiers} chức danh, gán quản lý ${n.managers} người, cấp quyền ${n.grants} người`)}>{busy === "apply" ? "Đang áp dụng…" : `Áp dụng: ${n.tiers} chức danh · ${n.managers} người · ${n.grants} quyền`}</button></>}>
      {busy && !plan ? <div className="card" role="status" style={{ padding: 16, display: "grid", gap: 10 }}><b>Kavor đang phân tích cơ cấu…</b><div className="progress indeterminate"><i /></div></div> : null}
      <ErrorLine text={err} />
      {plan ? <div style={busy ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
        <div className="card detail-list" style={{ padding: "12px 14px" }}>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 4px", lineHeight: 1.55 }}>
            <b style={{ color: "var(--ink-2)" }}>Cấp bậc chuẩn:</b> {TIERS.map((t) => `${MANAGEMENT_TIERS[t]} (${MANAGEMENT_TIERS_EN[t]})`).join(" → ")}.<br />
            <b style={{ color: "var(--ink-2)" }}>Quản lý trực tiếp:</b> người cấp cao hơn gần nhất cùng phòng → Trưởng đơn vị của phòng → phòng cấp trên → Ban Giám đốc (khi công ty chỉ có một người). Đặt Trưởng đơn vị ở nút Sửa của phòng ban. Nhiều người cùng cấp thì để bạn chọn.
          </p>
          <label className="detail-row check-row" style={{ margin: 0 }}><span><input type="checkbox" checked={input.overwrite} onChange={(e) => load({ ...input, overwrite: e.target.checked })} /> Đề xuất lại cả người đã có quản lý đúng cấp</span><b className="muted" style={{ fontWeight: 500 }}>mặc định giữ nguyên</b></label>
          <label className="detail-row check-row" style={{ margin: 0 }}><span><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Chỉ hiện chỗ thay đổi / cần chọn</span><b /></label>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <b style={{ fontSize: 12.5 }}>Cấp chức danh: đổi {n.tiers}</b>
          {positions.length ? <div className="table-wrap" style={{ marginTop: 8, maxHeight: 280, overflow: "auto" }}><table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}>
            <thead><tr><th>Chức danh</th><th className="num" style={{ width: 70 }}>Người</th><th style={{ width: "22%" }}>Đang đặt</th><th style={{ width: "30%" }}>Áp dụng</th></tr></thead><tbody>
            {positions.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: "normal" }}>{p.name} <span className="muted" style={{ fontSize: 12 }}>{p.code}</span></td><td className="num">{p.people}</td>
                <td className={p.current == null ? "muted" : ""}>{p.current ? MANAGEMENT_TIERS[p.current] : "Chưa đặt"}</td>
                <td><Select value={String(p.tier)} onChange={(e) => load({ ...input, tiers: { ...input.tiers, [p.id]: Number(e.target.value) as ManagementTier } })} aria-label={`Cấp của ${p.name}`}>
                  {TIERS.map((t) => <option key={t} value={t}>{MANAGEMENT_TIERS[t]}{t === p.suggested ? " (đề xuất)" : ""}</option>)}
                </Select></td>
              </tr>
            ))}
          </tbody></table></div> : <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Mọi chức danh đã đúng cấp.</p>}
        </div>

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <b style={{ fontSize: 12.5 }}>Quản lý trực tiếp: gán {n.managers} người</b>
          {rows.length ? <div className="table-wrap" style={{ marginTop: 8, maxHeight: 360, overflow: "auto" }}><table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}>
            <thead><tr><th style={{ width: 44 }} /><th>Nhân viên</th><th style={{ width: "24%" }}>Đang là</th><th style={{ width: "32%" }}>Đề xuất</th></tr></thead><tbody>
            {rows.map((r, i) => {
              const skipped = input.skip.includes(r.employeeId);
              return (<Fragment key={r.employeeId}>
                {i === 0 || rows[i - 1]!.department !== r.department ? <tr className="group-row"><td colSpan={4}>{r.department ?? "Chưa có phòng ban"}</td></tr> : null}
                <tr>
                  <td>{r.change || skipped ? <input type="checkbox" checked={!skipped} aria-label={`Áp dụng cho ${r.name}`}
                    onChange={(e) => load({ ...input, skip: e.target.checked ? input.skip.filter((x) => x !== r.employeeId) : [...input.skip, r.employeeId] })} /> : null}</td>
                  <td style={{ whiteSpace: "normal" }}><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.position ?? "—"} · {r.tier ? MANAGEMENT_TIERS[r.tier] : "Nhân viên"}</div></td>
                  <td style={{ whiteSpace: "normal" }} className={r.current && !r.currentOk ? "text-red" : r.current ? "" : "muted"}>{r.current?.name ?? "Chưa có"}{r.current && !r.currentOk ? <div style={{ fontSize: 12 }}>sai cấp</div> : null}</td>
                  <td style={{ whiteSpace: "normal" }}>{r.proposed && (r.change || skipped) ? <b>{r.proposed.name}</b> : r.proposed ? <span className="muted">{r.proposed.name}</span> : <span className="muted">—</span>}
                    {r.note ? <div className={r.proposed ? "muted" : "text-amber"} style={{ fontSize: 12 }}>{r.note}</div> : null}</td>
                </tr>
              </Fragment>);
            })}
          </tbody></table></div> : <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Mọi người đã có quản lý đúng cấp.</p>}
        </div>
        {plan.grants.length ? <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <b style={{ fontSize: 12.5 }}>Quyền duyệt cho người quản lý: {n.grants} người</b>
          <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 0" }}>Những người dưới đây sẽ quản lý người khác nhưng mới có quyền Nhân viên — chưa xem đơn, bảng công của cấp dưới trên web.
            Gán vai trò <b>Quản lý</b> (phạm vi Nhân viên trực tiếp, từ hôm nay; thu hồi được ở Vai trò &amp; phân quyền).</p>
          {!plan.canGrant ? <p className="text-amber" style={{ fontSize: 12, margin: "6px 0 0" }}>Bạn không có quyền gán vai trò — nhờ quản trị viên công ty.</p> : <>
            <label className="check-row" style={{ fontSize: 12, margin: "8px 0 0" }}><input type="checkbox" checked={input.grantManager} onChange={(e) => load({ ...input, grantManager: e.target.checked })} /> Gán vai trò Quản lý khi áp dụng</label>
            <div className="table-wrap" style={{ marginTop: 8, maxHeight: 240, overflow: "auto" }}><table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}>
              <thead><tr><th style={{ width: 44 }} /><th>Người quản lý</th><th className="num" style={{ width: 120 }}>Số cấp dưới</th></tr></thead><tbody>
              {plan.grants.map((g) => (
                <tr key={g.employeeId}>
                  <td><input type="checkbox" disabled={!input.grantManager} checked={g.selected} aria-label={`Gán Quản lý cho ${g.name}`}
                    onChange={(e) => load({ ...input, skipGrant: e.target.checked ? input.skipGrant.filter((x) => x !== g.employeeId) : [...input.skipGrant, g.employeeId] })} /></td>
                  <td style={{ whiteSpace: "normal" }}><b>{g.name}</b>{g.position ? <div className="muted" style={{ fontSize: 12 }}>{g.position}</div> : null}</td>
                  <td className="num">{g.reports}</td>
                </tr>
              ))}
            </tbody></table></div></>}
        </div> : null}
      </div> : null}
    </Modal>
  );
}
