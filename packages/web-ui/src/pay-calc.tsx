"use client";
/* Tính thử lương một người theo tham số luật Kavor (dùng chung web HR + Kavor Console). Mỗi khoản hiện công thức để Kế toán đối chiếu;
   mục luật chưa đối chiếu văn bản gốc được cảnh báo. Gọi API qua onCalc của từng web. */
import { useState } from "react";
import type { PayCalcInput, PayCalcLine, PayCalcResult } from "@kavor/contracts";
import { Select } from "./select";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/[^\d]/g, "")));

function Lines({ title, lines }: { title: string; lines: PayCalcLine[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <b style={{ fontSize: 12.5 }}>{title}</b>
      <div className="card detail-list" style={{ marginTop: 6 }}>
        {lines.map((l) => (
          <div key={l.key} className="detail-row"><span>{l.label}<div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{l.formula}</div></span><b>{vnd(l.amount)}</b></div>
        ))}
      </div>
    </div>
  );
}

export function PayCalc({ onCalc, defaultDate }: { onCalc: (input: PayCalcInput) => Promise<PayCalcResult>; defaultDate: string }) {
  const [f, setF] = useState({ date: defaultDate, gross: "20.000.000", taxFree: "", insuranceSalary: "", region: "1", dependents: "0", unionMember: false, contract: "labor", advance: "" });
  const [r, setR] = useState<PayCalcResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const money = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    const v = num(e.target.value); setF({ ...f, [k]: v === undefined || Number.isNaN(v) ? "" : v.toLocaleString("vi-VN") });
  };
  async function go() {
    setBusy(true); setErr(null);
    try {
      setR(await onCalc({ date: f.date, gross: num(f.gross) ?? 0, taxFree: num(f.taxFree), insuranceSalary: num(f.insuranceSalary) ?? null, region: Number(f.region) as 1,
        dependents: Number(f.dependents) || 0, unionMember: f.unionMember, contract: f.contract as "labor", advance: num(f.advance) }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Không tính được."); } finally { setBusy(false); }
  }
  const field = (label: string, el: React.ReactNode, hint?: string) => <div className="field"><label>{label}</label>{el}{hint ? <small className="muted">{hint}</small> : null}</div>;
  return (
    <div className="profile-grid" style={{ alignItems: "start" }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="form-grid">
          {field("Ngày tính (kỳ lương)", <input type="date" value={f.date} onChange={set("date")} />, "Chọn ngày để dùng đúng phiên bản luật")}
          {field("Loại hợp đồng", <Select value={f.contract} onChange={set("contract")}><option value="labor">HĐLĐ từ 3 tháng</option><option value="casual">Dưới 3 tháng / thời vụ</option></Select>)}
          {field("Tổng thu nhập (gross)", <input inputMode="numeric" value={f.gross} onChange={money("gross")} />)}
          {field("Khoản không chịu thuế", <input inputMode="numeric" value={f.taxFree} onChange={money("taxFree")} placeholder="0" />, "Ăn trưa, điện thoại… phần được miễn")}
          {field("Lương đóng bảo hiểm", <input inputMode="numeric" value={f.insuranceSalary} onChange={money("insuranceSalary")} placeholder="Bằng gross" />)}
          {field("Vùng lương tối thiểu", <Select value={f.region} onChange={set("region")}>{["1", "2", "3", "4"].map((v) => <option key={v} value={v}>Vùng {v}</option>)}</Select>)}
          {field("Người phụ thuộc", <input type="number" min={0} max={20} value={f.dependents} onChange={set("dependents")} />)}
          {field("Tạm ứng trong kỳ", <input inputMode="numeric" value={f.advance} onChange={money("advance")} placeholder="0" />)}
        </div>
        <label className="check-row" style={{ fontSize: 12.5, marginTop: 10 }}><input type="checkbox" checked={f.unionMember} onChange={(e) => setF({ ...f, unionMember: e.target.checked })} /> Đoàn viên công đoàn</label>
        <div style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? "Đang tính…" : "Tính"}</button></div>
        {err ? <p className="text-red" style={{ fontSize: 12.5 }}>{err}</p> : null}
      </div>
      <div>
        {r ? <>
          <div className="card detail-list">
            <div className="detail-row"><span>Tổng thu nhập</span><b>{vnd(r.totals.gross)}</b></div>
            <div className="detail-row"><span>Bảo hiểm + đoàn phí</span><b>− {vnd(r.totals.insurance + r.totals.union)}</b></div>
            <div className="detail-row"><span>Thuế TNCN</span><b>− {vnd(r.totals.pit)}</b></div>
            {r.totals.advance ? <div className="detail-row"><span>Tạm ứng</span><b>− {vnd(r.totals.advance)}</b></div> : null}
            <div className="detail-row"><span>Thực nhận</span><b style={{ fontSize: 16 }}>{vnd(r.totals.net)}</b></div>
            <div className="detail-row"><span>Chi phí công ty</span><b>{vnd(r.totals.employerCost)}</b></div>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: "8px 0 0" }}>Theo tham số luật hiệu lực từ {r.lawFrom.split("-").reverse().join("/")}.</p>
          {r.unverified.length ? <div className="card" style={{ marginTop: 10, padding: 10, borderColor: "var(--amber)" }}>
            <b className="text-amber" style={{ fontSize: 12 }}>Cần đối chiếu</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11.5 }}>{r.unverified.map((u) => <li key={u}>{u}</li>)}</ul>
          </div> : null}
          <Lines title="Người lao động bị trừ" lines={r.employee} />
          {r.employer.length ? <Lines title="Công ty đóng thêm" lines={r.employer} /> : null}
        </> : <div className="card" style={{ padding: 16 }}><p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Nhập thông tin rồi bấm Tính để xem từng khoản và cách tính.</p></div>}
      </div>
    </div>
  );
}
