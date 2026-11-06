"use client";
/* Nhập nhân viên từ file bất kỳ (docs/plans/employee-import.md): chọn .xlsx/.csv như công ty đang dùng → Kavor tự nhận sheet, cột, phòng ban,
   chức danh → HR xem trước, đổi chỗ nào chưa đúng (đổi là xem trước lại) → nhập. Cách khớp được nhớ cho lần sau. */
import { useEffect, useState } from "react";
import { IMPORT_FIELDS, MANAGEMENT_TIERS, type ManagementTier, type EmployeeImportResult, type EmployeeImportRow, type ImportField, type ImportOptions, type ImportUnit } from "@kavor/contracts";
import { Select } from "@kavor/web-ui";
import { call } from "../_lib/client";
import { Empty, ErrorLine, Field, Modal, Status, useAction } from "./kit";

const ACTION: Record<EmployeeImportRow["action"], [string, string]> = { create: ["Tạo mới", ""], exists: ["Đã có — bỏ qua", "muted"], skip: ["Bỏ qua", "muted"], error: ["Lỗi", "bad"] };
const SOURCE: Record<string, string> = { manual: "bạn chọn", saved: "đã nhớ", header: "theo tên cột", content: "theo nội dung" };
type Filter = "all" | "error" | "warning" | "skip" | "left";

function toBase64(f: File): Promise<string> {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => bad(new Error("Không đọc được file."));
    r.readAsDataURL(f);
  });
}

function UnitTable({ title, units, catalog, onPick, onTier }: {
  title: string; units: ImportUnit[]; catalog: Array<{ code: string; name: string }>; onPick: (key: string, choice: string) => void; onTier?: (key: string, tier: ManagementTier) => void;
}) {
  /* Đơn vị cần HR xem: chưa có trong Kavor; với chức danh thêm cả chức danh có sẵn chưa đặt cấp */
  const open = units.filter((u) => !u.existing || (onTier && !u.existing.tier));
  if (!open.length) return null;
  const fresh = open.filter((u) => !u.existing);
  const newGroups = fresh.filter((u) => u.choice === `new:${u.key}`);
  const merged = fresh.length - newGroups.length;
  return (
    <div className="card" style={{ marginTop: 12, padding: 12 }}>
      <b style={{ fontSize: 12.5 }}>{title}: {newGroups.length} tạo mới{merged ? `, ${merged} gộp` : ""}{open.length > fresh.length ? `, ${open.length - fresh.length} có sẵn chưa đặt cấp` : ""}</b>
      {onTier ? <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>Cấp bậc chuẩn: Nhân viên (Staff) → Trưởng nhóm (Team Lead) → Quản lý (Manager) → Ban Giám đốc (Director). Kavor đoán theo tên chức danh; quản lý trực tiếp được tự gán theo cấp trong cùng phòng.</p> : null}
      <div className="table-wrap" style={{ marginTop: 8, maxHeight: 300, overflow: "auto" }}><table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}><thead><tr>
        <th>Trong file</th><th className="num" style={{ width: 70 }}>Người</th><th style={{ width: onTier ? "38%" : "55%" }}>Kavor dùng</th>{onTier ? <th style={{ width: "24%" }}>Cấp</th> : null}</tr></thead><tbody>
        {open.map((u) => (
          <tr key={u.key}>
            <td style={{ whiteSpace: "normal" }}>{u.value}{u.suggested ? <span className="text-amber" style={{ fontSize: 11 }}> · Kavor đoán, kiểm tra lại</span> : null}</td>
            <td className="num">{u.live}{u.rows > u.live ? <span className="muted" style={{ fontSize: 11 }}> +{u.rows - u.live} nghỉ</span> : null}</td>
            <td style={{ whiteSpace: "normal" }}>{u.existing ? <span>{u.existing.name} ({u.existing.code})</span> : <Select value={u.choice} onChange={(e) => onPick(u.key, e.target.value)} aria-label={`${title} cho ${u.value}`}>
              <option value={`new:${u.key}`}>Tạo mới “{u.value}” ({u.newCode})</option>
              {fresh.filter((x) => x !== u && x.choice === `new:${x.key}`).map((x) => <option key={x.key} value={`new:${x.key}`}>Gộp vào “{x.value}” (mới)</option>)}
              {catalog.map((c) => <option key={c.code} value={`code:${c.code}`}>{c.name} ({c.code})</option>)}
            </Select>}</td>
            {onTier ? <td style={{ whiteSpace: "normal" }}>{u.choice === `new:${u.key}` || (u.existing && !u.existing.tier) ? <>
              <Select value={String(u.tier ?? 1)} onChange={(e) => onTier(u.key, Number(e.target.value) as ManagementTier)} aria-label={`Cấp của ${u.value}`}>
                {([1, 2, 3, 4] as ManagementTier[]).map((t) => <option key={t} value={t}>{MANAGEMENT_TIERS[t]}</option>)}
              </Select>{u.tierInferred ? <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>đoán theo tên</div> : null}</> : <span className="muted">theo đơn vị gộp</span>}</td> : null}
          </tr>
        ))}
      </tbody></table></div>
    </div>
  );
}

/* Tiến trình nổi bật: một yêu cầu duy nhất nên không có %; thanh chạy + câu theo thời gian để người dùng biết hệ thống đang làm */
const STEPS: Record<"preview" | "apply", string[]> = {
  preview: ["Đang tải file lên…", "Đang đọc các sheet…", "Đang nhận cột và chuẩn hóa dữ liệu…", "Đang đối chiếu phòng ban, chức danh, nhân viên có sẵn…", "File lớn, sắp xong…"],
  apply: ["Đang tạo phòng ban và chức danh…", "Đang tạo hồ sơ nhân viên…", "Đang gán phòng ban và quản lý…", "Sắp xong…"],
};
function Working({ kind, count }: { kind: "preview" | "apply"; count?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS[kind].length - 1)), 1600); return () => clearInterval(t); }, [kind]);
  return (
    <div className="card" role="status" aria-live="polite" style={{ marginTop: 12, padding: "18px 16px", display: "grid", gap: 10, borderColor: "var(--accent-line)" }}>
      <b style={{ fontSize: 14 }}>{kind === "apply" ? `Đang nhập ${count ?? ""} hồ sơ — đừng đóng cửa sổ` : "Kavor đang đọc file"}</b>
      <div className="progress indeterminate"><i /></div>
      <span className="muted" style={{ fontSize: 12.5 }}>{STEPS[kind][i]}</span>
    </div>
  );
}

export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [opts, setOpts] = useState<ImportOptions>({});
  const [r, setR] = useState<EmployeeImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const { busy, run } = useAction();
  const preview = (f: { name: string; data: string }, o: ImportOptions) =>
    run("preview", async () => setR(await call<EmployeeImportResult>("POST", "employees/import", { fileName: f.name, file: f.data, options: o, dryRun: true })));
  async function pick(f: File | undefined) {
    setR(null); setErr(null); setOpts({});
    if (!f) return;
    if (f.size > 5_000_000) { setErr("File tối đa 5 MB."); return; }
    const next = { name: f.name, data: await toBase64(f) };
    setFile(next);
    await preview(next, {});
  }
  function change(o: ImportOptions) { setOpts(o); if (file) void preview(file, o); }
  const a = r?.analysis;
  const ok = r && !r.fileErrors.length && !r.totals.error && r.totals.create > 0;
  const rows = (r?.rows ?? []).filter((x) => filter === "all" || (filter === "error" ? x.action === "error" : filter === "skip" ? x.action === "skip" || x.action === "exists" : filter === "left" ? x.action === "create" && x.left : x.warnings.length && x.action === "create" && !x.left));
  const cols = (a?.columns ?? []).filter((c) => !c.later);
  const later = (a?.columns ?? []).filter((c) => c.later);
  return (
    <Modal wide title="Nhập nhân viên từ file" sub="Chọn file Excel/CSV công ty đang dùng — không cần sửa theo mẫu. Kavor tự nhận cột, bạn kiểm tra rồi nhập." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={!ok || !!busy} onClick={() => run("apply", async () => {
          const res = await call<EmployeeImportResult>("POST", "employees/import", { fileName: file!.name, file: file!.data, options: opts, dryRun: false });
          setR(res); onDone(); onClose();
        }, `Đã nhập ${r?.totals.create ?? 0} hồ sơ`)}>{busy === "apply" ? "Đang nhập…" : `Nhập ${r?.totals.create ?? 0} hồ sơ`}</button></>}>
      <div className="form-grid">
        <Field label="File nhân viên" full hint="Excel (.xlsx) hoặc CSV, nhiều sheet cũng được. Cần ít nhất họ tên, phòng ban và ngày vào làm; mã nhân viên, email, chức danh không có thì Kavor tự xử lý.">
          <input type="file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
        </Field>
      </div>
      <ErrorLine text={err} />
      {busy === "preview" || busy === "apply" ? <Working kind={busy} count={r?.totals.create} /> : null}
      {r && a ? <div style={busy ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
        <div className="card detail-list" style={{ marginTop: 12 }}>
          <div className="detail-row"><span>{r.fileName}</span><b>{r.totals.create - r.totals.createLeft} tạo mới{r.totals.createLeft ? ` (+${r.totals.createLeft} đã nghỉ)` : ""} · {r.totals.exists} đã có · {r.totals.skip} bỏ qua · <span className={r.totals.error ? "text-red" : ""}>{r.totals.error} lỗi</span>{r.totals.warning ? <span className="text-amber"> · {r.totals.warning} cần xem</span> : null}</b></div>
          <div className="detail-row"><span>Gói {r.capacity.planName}</span><b>{r.capacity.employees} + {r.totals.create - r.totals.createLeft} / {r.capacity.limit} nhân sự</b></div>
          <label className="detail-row check-row" style={{ margin: 0 }}><span><input type="checkbox" checked={opts.includeLeft !== false} disabled={!!busy} onChange={(e) => change({ ...opts, includeLeft: e.target.checked ? undefined : false })} /> Nhập cả nhân viên đã nghỉ để tra cứu</span><b className="muted" style={{ fontWeight: 500 }}>không tính vào gói, không gửi lời mời</b></label>
        </div>
        {r.fileErrors.map((e) => <ErrorLine key={e} text={e} />)}

        {a.sheets.length > 1 ? <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <b style={{ fontSize: 12.5 }}>Sheet</b>
          {a.sheets.map((s) => (
            <label key={s.name} className="check-row" style={{ fontSize: 12, margin: "6px 0 0" }}>
              <input type="checkbox" checked={s.included} disabled={!s.selectable || !!busy} onChange={(e) => change({ ...opts, sheets: { ...opts.sheets, [s.name]: e.target.checked } })} />
              {s.name} <span className="muted">· {s.rows} dòng{s.note ? ` · ${s.note}` : ""}</span>
            </label>
          ))}
        </div> : null}

        {a.dateOrder.ambiguous || a.branches.length > 1 && a.departments.some((u) => u.choice === `new:${u.key}`) ? <div className="form-grid" style={{ marginTop: 12 }}>
          {a.dateOrder.ambiguous ? <Field label="Ngày trong file ghi theo" hint="Không có ngày nào lớn hơn 12 để Kavor tự biết — chọn đúng cách công ty bạn ghi.">
            <Select value={a.dateOrder.value} onChange={(e) => change({ ...opts, dateOrder: e.target.value as "dmy" | "mdy" })}><option value="dmy">Ngày/tháng/năm (05/01 = 5 tháng 1)</option><option value="mdy">Tháng/ngày/năm (05/01 = 1 tháng 5)</option></Select>
          </Field> : null}
          {a.branches.length > 1 && a.departments.some((u) => u.choice === `new:${u.key}`) ? <Field label="Chi nhánh của phòng ban mới">
            <Select value={a.branchId ?? ""} onChange={(e) => change({ ...opts, branchId: e.target.value })}><option value="">Chọn chi nhánh</option>{a.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field> : null}
        </div> : null}

        {cols.length ? <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <b style={{ fontSize: 12.5 }}>Cột Kavor đã nhận</b>
          <div className="table-wrap" style={{ marginTop: 8, maxHeight: 280, overflow: "auto" }}><table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}><thead><tr><th>Cột trong file</th><th>Ví dụ</th><th>Kavor hiểu là</th></tr></thead><tbody>
            {cols.map((c) => (
              <tr key={c.key}>
                <td>{c.header}</td><td className="muted" style={{ fontSize: 11, whiteSpace: "normal" }}>{c.samples.join(" · ") || "—"}</td>
                <td style={{ width: "40%", whiteSpace: "normal" }}><Select value={c.field ?? ""} onChange={(e) => change({ ...opts, columns: { ...opts.columns, [c.key]: e.target.value as ImportField | "" } })} aria-label={`Trường cho cột ${c.header}`}>
                  <option value="">Không dùng</option>
                  {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => <option key={f} value={f}>{IMPORT_FIELDS[f]}</option>)}
                </Select>{c.field && c.source ? <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{SOURCE[c.source]}</div> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
          {later.length ? <p className="muted" style={{ fontSize: 11, margin: "8px 0 0" }}>Kavor nhận ra nhưng chưa nhập ở bước này (giữ nguyên trong file của bạn): {[...new Set(later.map((c) => c.later))].join(", ")}.</p> : null}
        </div> : null}

        <UnitTable title="Phòng ban" units={a.departments} catalog={a.catalog.departments} onPick={(k, v) => change({ ...opts, units: { ...opts.units, department: { ...opts.units?.department, [k]: v } } })} />
        <UnitTable title="Chức danh" units={a.positions} catalog={a.catalog.positions} onPick={(k, v) => change({ ...opts, units: { ...opts.units, position: { ...opts.units?.position, [k]: v } } })}
          onTier={(k, t) => change({ ...opts, tiers: { ...opts.tiers, [k]: t } })} />

        <div className="head-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Lọc dòng" style={{ width: 200 }}>
            <option value="all">Tất cả ({r.totals.rows})</option><option value="error">Lỗi ({r.totals.error})</option>
            <option value="warning">Cần xem ({r.totals.warning})</option><option value="left">Đã nghỉ — lưu tra cứu ({r.totals.createLeft})</option><option value="skip">Bỏ qua / đã có ({r.totals.skip + r.totals.exists})</option>
          </Select>
        </div>
        {rows.length ? <div className="table-wrap" style={{ marginTop: 8, maxHeight: 360, overflow: "auto" }}><table className="data-table" style={{ minWidth: 0 }}><thead><tr><th>Sheet · dòng</th><th>Mã · họ tên</th><th>Phòng ban · chức danh</th><th>Kết quả</th></tr></thead><tbody>
          {rows.map((x) => (
            <tr key={`${x.sheet}:${x.line}`}>
              <td className="muted" style={{ fontSize: 11 }}>{x.sheet} · {x.line}</td><td><b>{x.code || "—"}</b> · {x.fullName || "—"}</td><td style={{ whiteSpace: "normal" }}>{x.department ?? "—"} · {x.position ?? "—"}{x.manager ? <div className="muted" style={{ fontSize: 11 }}>Quản lý: {x.manager}</div> : null}</td>
              <td style={{ whiteSpace: "normal" }}><Status v={x.action === "create" && x.left ? ["Lưu — đã nghỉ", "violet"] : ACTION[x.action]} />
                {x.errors.length ? <div className="text-red" style={{ fontSize: 11, marginTop: 3 }}>{x.errors.join("; ")}</div> : null}
                {x.warnings.length ? <div className={x.action === "create" ? "text-amber" : "muted"} style={{ fontSize: 11, marginTop: 3 }}>{x.warnings.join("; ")}</div> : null}</td>
            </tr>
          ))}
        </tbody></table></div> : r.fileErrors.length ? null : <Empty title="Không có dòng phù hợp" />}
      </div> : null}
    </Modal>
  );
}
