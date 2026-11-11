"use client";
/* Tab Khoản phụ cấp (thiết kế bổ sung, prototype HR chưa có): danh mục khoản phụ cấp/thưởng do từng doanh nghiệp tự khai.
   Lương cứng (thỏa thuận lúc phỏng vấn) = lương cơ bản + các khoản này; số tiền từng người nhập ở hồ sơ nhân viên → Lương.
   Mẫu phổ biến chỉ có tên + cách tính gợi ý, không có số tiền. Ngừng dùng thay cho xóa (phiên bản lương cũ vẫn trỏ tới). */
import { useState, type ReactNode } from "react";
import type { PayItem, PayItemInput, PayItemList, PayItemMode, PayItemTax } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { Empty, ErrorLine, Field, Icon, LoadError, Modal, Status, useAction } from "../../_ui/kit";
import { money } from "../../_ui/request";
import { Select, SkeletonRows } from "@kavor/web-ui";

export const PAY_MODE: Record<PayItemMode, string> = { by_workdays: "Chia theo công", fixed: "Cố định theo tháng", conditional: "Có điều kiện" };
const PAY_MODE_HINT: Record<PayItemMode, string> = {
  by_workdays: "Mức × công thực tế ÷ công chuẩn",
  fixed: "Đủ tháng làm việc là trả đủ, không chia theo công",
  conditional: "Ví dụ thưởng chuyên cần: mất khi nghỉ/đi trễ — Kế toán xét theo quy định công ty",
};
export const TAX_MODE: Record<PayItemTax, string> = { taxable: "Chịu thuế", exempt: "Không chịu thuế", partial: "Miễn thuế đến mức", meal: "Tiền ăn — miễn theo luật" };
const digits = (s: string) => s.replace(/\D/g, "");
const moneyInput = (s: string) => (s ? Number(digits(s)).toLocaleString("vi-VN") : "");

export function PayItems({ tabs }: { tabs: ReactNode }) {
  const { data: l, error, reload, setData } = useApi<PayItemList>("payroll/pay-items");
  const [edit, setEdit] = useState<PayItem | "new" | null>(null);
  const { busy, run } = useAction();
  const active = (l?.items ?? []).filter((x) => !x.archived);
  return (
    <>
      <div className="page-head">
        <div>{tabs}</div>
        <div className="head-actions">
          {l?.canManage ? <>
            <button className="btn" disabled={!!busy} onClick={() => void run("tpl", async () => setData(await call<PayItemList>("POST", "payroll/pay-items/templates", {})), "Đã thêm các khoản mẫu")}>
              <Icon name="plus" /> Thêm khoản mẫu</button>
            <button className="btn primary" onClick={() => setEdit("new")}><Icon name="plus" /> Thêm khoản</button>
          </> : null}
        </div>
      </div>
      <LoadError error={error} retry={reload} />
      <article className="card">
        {l && !l.items.length ? (
          <Empty title="Chưa có khoản phụ cấp nào" text={l.canManage ? "Bấm “Thêm khoản mẫu” để có sẵn ăn trưa, xăng xe, điện thoại, trách nhiệm… rồi sửa theo thực tế công ty, hoặc tự thêm từng khoản." : "Quản trị viên công ty hoặc HCNS khai danh mục này."} />
        ) : (
          <div className="table-wrap"><table className="data-table"><thead><tr>
            <th>Khoản</th><th>Cách trả</th><th>Đóng BH</th><th>Thuế TNCN</th><th>Mức mặc định</th><th>Trạng thái</th><th />
          </tr></thead><tbody>
            {!l && !error ? <SkeletonRows cols={7} rows={5} /> : null}
            {(l?.items ?? []).map((x) => (
              <tr key={x.id} className={x.archived ? "muted" : undefined}>
                <td><b>{x.name}</b><div className="muted" style={{ fontSize: 12 }}>{x.kind === "bonus" ? "Thưởng" : "Phụ cấp"}{x.note ? ` · ${x.note}` : ""}</div></td>
                <td>{PAY_MODE[x.payMode]}</td>
                <td>{x.insurable ? "Có" : "Không"}</td>
                <td>{x.taxMode === "partial" ? (x.taxFreeCap ? `Miễn đến ${money(x.taxFreeCap)}` : "Miễn một phần") : TAX_MODE[x.taxMode]}</td>
                <td className="num">{x.defaultAmount ? money(x.defaultAmount) : <span className="muted">—</span>}</td>
                <td><Status v={x.archived ? ["Ngừng dùng", "muted"] : ["Đang dùng", ""]} /></td>
                <td className="nowrap" style={{ textAlign: "right" }}>{l?.canManage ? <>
                  {!x.archived ? <button className="btn small" onClick={() => setEdit(x)}>Sửa</button> : null}{" "}
                  <button className="btn small" disabled={!!busy} onClick={() => void run(x.id, async () => setData(await call<PayItemList>("POST", `payroll/pay-items/${x.id}/archive`, { archived: !x.archived })),
                    x.archived ? "Đã dùng lại khoản" : "Đã ngừng dùng khoản")}>{x.archived ? "Dùng lại" : "Ngừng dùng"}</button>
                </> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {l && active.length ? <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Lương cứng = lương cơ bản + các khoản này. Số tiền từng người nhập ở hồ sơ nhân viên.</p> : null}
      {edit ? <PayItemModal item={edit === "new" ? null : edit} onClose={() => setEdit(null)}
        save={async (b) => setData(await call<PayItemList>("POST", edit === "new" ? "payroll/pay-items" : `payroll/pay-items/${edit.id}`, b))} /> : null}
    </>
  );
}

function PayItemModal({ item, onClose, save }: { item: PayItem | null; onClose: () => void; save: (b: PayItemInput) => Promise<unknown> }) {
  const [f, setF] = useState({
    name: item?.name ?? "", kind: item?.kind ?? "allowance", payMode: item?.payMode ?? "by_workdays", insurable: item?.insurable ?? true,
    taxMode: item?.taxMode ?? "taxable", cap: item?.taxFreeCap ? String(item.taxFreeCap) : "", amount: item?.defaultAmount ? String(item.defaultAmount) : "", note: item?.note ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function go() {
    if (!f.name.trim()) { setErr("Nhập tên khoản."); return; }
    setErr(null);
    await run("save", async () => {
      await save({ name: f.name.trim(), kind: f.kind as PayItem["kind"], payMode: f.payMode as PayItemMode, insurable: f.insurable, taxMode: f.taxMode as PayItemTax,
        taxFreeCap: f.taxMode === "partial" && f.cap ? Number(f.cap) : null, defaultAmount: f.amount ? Number(f.amount) : null, note: f.note.trim() || null });
      onClose();
    }, item ? "Đã lưu khoản" : "Đã thêm khoản");
  }
  return (
    <Modal title={item ? `Sửa khoản · ${item.name}` : "Thêm khoản phụ cấp/thưởng"} sub="Số tiền của từng người nhập ở hồ sơ nhân viên; mức mặc định chỉ để điền sẵn khi nhập lương." onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={() => void go()}>{busy ? "Đang lưu…" : "Lưu"}</button></>}>
      <div className="form-grid">
        <Field label="Tên khoản"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Phụ cấp ăn trưa" /></Field>
        <Field label="Loại">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PayItem["kind"] })}><option value="allowance">Phụ cấp</option><option value="bonus">Thưởng</option></Select>
        </Field>
        <Field label="Cách trả" hint={PAY_MODE_HINT[f.payMode]}>
          <Select value={f.payMode} onChange={(e) => { const m = e.target.value as PayItemMode; setF({ ...f, payMode: m, ...(item ? {} : { insurable: m !== "conditional" }) }); }}>{(Object.keys(PAY_MODE) as PayItemMode[]).map((k) => <option key={k} value={k}>{PAY_MODE[k]}</option>)}</Select>
        </Field>
        <Field label="Tính vào lương đóng BH" hint={f.payMode !== "conditional" && !f.insurable ? "Khoản cố định ghi trong HĐLĐ, trả đều mỗi kỳ thường phải tính đóng BHXH (NĐ 158/2025) — để Không có rủi ro bị truy thu."
          : f.payMode === "conditional" && f.insurable ? "Khoản có điều kiện (theo năng suất, chuyên cần) thường không tính đóng BHXH." : undefined}>
          <Select value={f.insurable ? "1" : "0"} onChange={(e) => setF({ ...f, insurable: e.target.value === "1" })}><option value="0">Không</option><option value="1">Có</option></Select>
        </Field>
        <Field label="Thuế TNCN" hint={f.taxMode === "meal" ? "Dùng cho tiền ăn trưa, ăn ca. Phần trong mức luật cho phép không tính thuế, phần vượt mới tính. Kavor tự cập nhật mức này khi luật đổi — công ty không cần nhập." : undefined}>
          <Select value={f.taxMode} onChange={(e) => setF({ ...f, taxMode: e.target.value as PayItemTax })}>{(Object.keys(TAX_MODE) as PayItemTax[]).map((k) => <option key={k} value={k}>{TAX_MODE[k]}</option>)}</Select>
        </Field>
        {f.taxMode === "partial" ? <Field label="Mức miễn thuế (₫/tháng)" hint="Theo quy định hiện hành, Kế toán xác nhận"><input inputMode="numeric" value={moneyInput(f.cap)} onChange={(e) => setF({ ...f, cap: digits(e.target.value) })} placeholder="Ví dụ 1.000.000" /></Field> : null}
        <Field label="Mức mặc định (₫/tháng)" hint="Không bắt buộc — điền sẵn khi nhập lương"><input inputMode="numeric" value={moneyInput(f.amount)} onChange={(e) => setF({ ...f, amount: digits(e.target.value) })} placeholder="Để trống nếu mỗi người một mức" /></Field>
        <Field label="Ghi chú"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ví dụ: Theo quy chế lương 2026" /></Field>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}
