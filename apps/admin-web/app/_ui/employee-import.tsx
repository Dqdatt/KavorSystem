"use client";
/* Nhập nhân viên từ CSV (docs/plans/employee-import.md, thiết kế bổ sung — prototype chỉ có nút "Import"): chọn file → xem trước từng dòng
   → nhập khi cả file không lỗi. File Excel/Google Sheets: lưu dạng "CSV UTF-8" rồi chọn. */
import { useState } from "react";
import { EMPLOYEE_IMPORT_COLUMNS, EMPLOYEE_IMPORT_REQUIRED, type EmployeeImportResult, type EmployeeImportRow } from "@kavor/contracts";
import { call } from "../_lib/client";
import { Empty, ErrorLine, Field, Icon, Modal, Status, useAction } from "./kit";

const ACTION: Record<EmployeeImportRow["action"], [string, string]> = { create: ["Tạo mới", ""], exists: ["Đã có — bỏ qua", "muted"], error: ["Lỗi", "bad"] };
const TEMPLATE = `${EMPLOYEE_IMPORT_COLUMNS.join(",")}\r\nNV0001,Nguyễn Văn A,a.nguyen@congty.vn,0901 234 567,01/11/2026,Thử việc,MKT,AE,\r\n`;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob(["﻿", TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "mau-nhap-nhan-vien.csv"; a.click(); URL.revokeObjectURL(url);
}

export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [r, setR] = useState<EmployeeImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState(false);
  const { busy, run } = useAction();
  async function pick(f: File | undefined) {
    setR(null); setErr(null);
    if (!f) return;
    if (f.size > 2_000_000) { setErr("File tối đa 2 MB."); return; }
    if (!/\.csv$/i.test(f.name)) { setErr("Chọn file .csv (Excel/Google Sheets: Lưu thành CSV UTF-8)."); return; }
    const csv = await f.text();
    setFile({ name: f.name, csv });
    await run("preview", async () => setR(await call<EmployeeImportResult>("POST", "employees/import", { fileName: f.name, csv, dryRun: true })));
  }
  const ok = r && !r.fileErrors.length && !r.totals.error && r.totals.create > 0;
  const rows = (r?.rows ?? []).filter((x) => !only || x.action === "error");
  return (
    <Modal wide title="Nhập nhân viên từ file" sub="Mỗi dòng một nhân viên. Chỉ nhập khi cả file không có lỗi; mã nhân viên đã có sẽ được bỏ qua." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={!ok || !!busy} onClick={() => run("apply", async () => {
          const res = await call<EmployeeImportResult>("POST", "employees/import", { fileName: file!.name, csv: file!.csv, dryRun: false });
          setR(res); onDone(); onClose();
        }, `Đã nhập ${r?.totals.create ?? 0} nhân viên`)}>{busy === "apply" ? "Đang nhập…" : `Nhập ${r?.totals.create ?? 0} nhân viên`}</button></>}>
      <div className="form-grid">
        <Field label="File CSV" full hint={`Cột bắt buộc: ${EMPLOYEE_IMPORT_REQUIRED.join(", ")}. Không bắt buộc: phone, manager_code. Ngày YYYY-MM-DD hoặc DD/MM/YYYY.`}>
          <input type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
        </Field>
      </div>
      <div className="head-actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <button className="btn small" onClick={downloadTemplate}><Icon name="download" /> Tải file mẫu</button>
        <span className="muted" style={{ fontSize: 11 }}>Mã phòng ban/chức danh xem ở trang Cơ cấu tổ chức → Danh sách. Lời mời kích hoạt gửi riêng sau khi nhập.</span>
      </div>
      <ErrorLine text={err} />
      {busy === "preview" ? <p className="muted" style={{ fontSize: 12 }}>Đang kiểm tra file…</p> : null}
      {r ? <>
        <div className="card detail-list" style={{ marginTop: 12 }}>
          <div className="detail-row"><span>{r.fileName}</span><b>{r.totals.rows} dòng · {r.totals.create} tạo mới · {r.totals.exists} đã có · <span className={r.totals.error ? "text-red" : ""}>{r.totals.error} lỗi</span></b></div>
          <div className="detail-row"><span>Gói {r.capacity.planName}</span><b>{r.capacity.employees} + {r.totals.create} / {r.capacity.limit} nhân sự</b></div>
        </div>
        {r.fileErrors.map((e) => <ErrorLine key={e} text={e} />)}
        {r.totals.error ? <label className="check-row" style={{ fontSize: 11.5, margin: "10px 0 0" }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Chỉ hiện dòng lỗi</label> : null}
        {rows.length ? <div className="table-wrap" style={{ marginTop: 10, maxHeight: 360, overflow: "auto" }}><table className="data-table"><thead><tr><th>Dòng</th><th>Mã · họ tên</th><th>Phòng ban · chức danh</th><th>Quản lý</th><th>Kết quả</th></tr></thead><tbody>
          {rows.map((x) => (
            <tr key={x.line}>
              <td className="num">{x.line}</td><td><b>{x.code || "—"}</b> · {x.fullName || "—"}</td><td>{x.department ?? "—"} · {x.position ?? "—"}</td><td>{x.manager ?? "—"}</td>
              <td style={{ whiteSpace: "normal" }}><Status v={ACTION[x.action]} />{x.errors.length ? <div className="text-red" style={{ fontSize: 11, marginTop: 3 }}>{x.errors.join("; ")}</div> : null}</td>
            </tr>
          ))}
        </tbody></table></div> : r.fileErrors.length ? null : <Empty title="File không có dòng dữ liệu" />}
      </> : null}
    </Modal>
  );
}
