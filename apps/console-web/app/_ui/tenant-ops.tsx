"use client";
/* Vận hành tenant (docs/plans/console-ops.md phần A, thiết kế bổ sung — prototype không có): đổi gói + giới hạn nhân sự,
   tạm khóa / mở lại / đóng tenant. Chỉ Platform Operator; mọi thao tác bắt buộc lý do và tenant thấy trong nhật ký. */
import { useState } from "react";
import { NEAR_LIMIT_RATIO, type ConsoleTenant, type ConsoleTenantDetail, type PlanCode, type PlatformPlan, type TenantStatusAction } from "@kavor/contracts";
import { call, useApi } from "../_lib/client";
import { ErrorLine, Field, Modal, num, useAction } from "./kit";
import { Select } from "@kavor/web-ui";

export const nearLimit = (t: Pick<ConsoleTenant, "employees" | "employeeLimit">) => t.employees >= t.employeeLimit * NEAR_LIMIT_RATIO;
export const usageTone = (t: Pick<ConsoleTenant, "employees" | "employeeLimit">) => (t.employees >= t.employeeLimit ? "text-red" : nearLimit(t) ? "text-amber" : "");

export function PlanModal({ t, onClose, onDone }: { t: ConsoleTenant; onClose: () => void; onDone: (t: ConsoleTenantDetail) => void }) {
  const plans = useApi<PlatformPlan[]>("plans").data ?? [];
  const [plan, setPlan] = useState<PlanCode>(t.plan);
  const [limit, setLimit] = useState(String(t.employeeLimit));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const n = Number(limit);
  function pick(code: PlanCode) {
    setPlan(code); setErr(null);
    const p = plans.find((x) => x.code === code);
    if (p?.employeeLimit) setLimit(String(p.employeeLimit));
  }
  async function save() {
    if (!Number.isInteger(n) || n < 1) { setErr("Nhập giới hạn nhân sự là số nguyên dương."); return; }
    if (reason.trim().length < 5) { setErr("Ghi lý do (ít nhất 5 ký tự), ví dụ số hợp đồng/phụ lục."); return; }
    await run("plan", async () => { onDone(await call<ConsoleTenantDetail>("POST", `tenants/${t.id}/plan`, { plan, employeeLimit: n, reason })); onClose(); }, "Đã đổi gói dịch vụ");
  }
  return (
    <Modal title={`Đổi gói · ${t.name}`} sub="Áp dụng ngay. Giới hạn chỉ chặn thêm nhân sự mới, không ảnh hưởng hồ sơ đang có." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Gói dịch vụ"><Select value={plan} onChange={(e) => pick(e.target.value as PlanCode)}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}{p.employeeLimit ? ` · tối đa ${num(p.employeeLimit)}` : " · theo hợp đồng"}</option>)}</Select></Field>
        <Field label="Giới hạn nhân sự" hint={`Đang dùng ${num(t.employees)}`}><input type="number" min={1} value={limit} onChange={(e) => { setLimit(e.target.value); setErr(null); }} /></Field>
        <Field label="Lý do / hợp đồng" full><input value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="Ví dụ: Phụ lục HĐ số 12 nâng lên Growth" /></Field>
      </div>
      {n > 0 && n < t.employees ? <p className="text-amber" style={{ fontSize: 12, margin: "10px 0 0" }}>Giới hạn thấp hơn số đang dùng ({num(t.employees)}): công ty sẽ không thêm được nhân sự cho tới khi cho nghỉ bớt hồ sơ.</p> : null}
      <ErrorLine text={err} />
    </Modal>
  );
}

const COPY: Record<TenantStatusAction, { title: string; sub: string; btn: string; done: string; danger: boolean; placeholder: string }> = {
  suspend: { title: "Tạm khóa", sub: "Mọi người dùng của công ty (web HR và app) bị chặn ngay, kể cả phiên đang mở. Dữ liệu giữ nguyên; mở lại được bất cứ lúc nào.", btn: "Tạm khóa", done: "Đã tạm khóa doanh nghiệp", danger: true, placeholder: "Ví dụ: Quá hạn thanh toán HĐ số 12" },
  reactivate: { title: "Mở lại", sub: "Người dùng của công ty đăng nhập và dùng lại bình thường.", btn: "Mở lại", done: "Đã mở lại doanh nghiệp", danger: false, placeholder: "Ví dụ: Khách đã thanh toán" },
  close: { title: "Đóng", sub: "Đóng là vĩnh viễn: không mở lại, không đổi gói, không khôi phục chủ sở hữu. Dữ liệu được giữ để xuất/xóa theo hợp đồng.", btn: "Đóng doanh nghiệp", done: "Đã đóng doanh nghiệp", danger: true, placeholder: "Ví dụ: Kết thúc hợp đồng, biên bản thanh lý số …" },
};

export function StatusModal({ t, action, onClose, onDone }: { t: ConsoleTenant; action: TenantStatusAction; onClose: () => void; onDone: (t: ConsoleTenantDetail) => void }) {
  const c = COPY[action];
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function save() {
    if (reason.trim().length < 5) { setErr("Ghi lý do (ít nhất 5 ký tự)."); return; }
    if (action === "close" && code.trim().toUpperCase() !== t.code) { setErr(`Gõ lại mã doanh nghiệp ${t.code} để xác nhận.`); return; }
    await run("status", async () => { onDone(await call<ConsoleTenantDetail>("POST", `tenants/${t.id}/status`, { action, reason, confirmCode: action === "close" ? code : undefined })); onClose(); }, c.done);
  }
  return (
    <Modal title={`${c.title} ${t.name}?`} sub={c.sub} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className={`btn ${c.danger ? "danger" : "primary"}`} disabled={!!busy} onClick={save}>{busy ? "Đang xử lý…" : c.btn}</button></>}>
      <div className="form-grid">
        <Field label="Lý do" full hint="Công ty thấy lý do này trong nhật ký hoạt động"><textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder={c.placeholder} autoFocus /></Field>
        {action === "close" ? <Field label={`Gõ lại mã doanh nghiệp (${t.code})`} full><input value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder={t.code} /></Field> : null}
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}
