"use client";
/* Lương & tạm ứng — bám page-payroll của prototype HR. Tab Bảng lương đầu vào (HCNS lập, Kế toán nhận); tab Kỳ lương (Kế toán): nhập kết quả CSV, lỗi/cảnh báo, duyệt, công bố;
   tab Tạm ứng và Lương cơ bản chuyển từ trang /advances cũ. Mỗi tab chỉ hiện với người có quyền tương ứng. */
import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { can, tenantToday, useMe } from "../../_ui/kit";
import { call } from "../../_lib/client";
import { PayCalc } from "@kavor/web-ui";
import type { PayCalcResult } from "@kavor/contracts";
import { Advances, Salary } from "./advances";
import { Cycles } from "./cycles";
import { Inputs } from "./inputs";
import { PayItems } from "./pay-items";

type Tab = "cycles" | "inputs" | "advances" | "salary" | "items" | "calc";
const TABS: Array<[Tab, string, string]> = [["inputs", "Bảng lương đầu vào", "compensation.read"], ["cycles", "Kỳ lương", "payroll.read"], ["advances", "Tạm ứng", "salary_advance.process"], ["salary", "Mức lương", "compensation.read"], ["items", "Khoản phụ cấp", "compensation.read"], ["calc", "Tính thử lương", "compensation.read"]];

function PayrollPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tabs = TABS.filter(([, , perm]) => can(me, perm));
  const tab = tabs.find(([k]) => k === params.get("tab"))?.[0] ?? tabs[0]?.[0];
  const switcher: ReactNode = tabs.length > 1 ? (
    <div className="segmented" role="tablist">{tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => router.replace(`/payroll?tab=${k}`, { scroll: false })}>{label}</button>)}</div>
  ) : null;
  if (tab === "cycles") return <section className="page active"><Cycles tabs={switcher} /></section>;
  if (tab === "inputs") return <section className="page active"><Inputs tabs={switcher} /></section>;
  if (tab === "items") return <section className="page active"><PayItems tabs={switcher} /></section>;
  return (
    <section className="page active">
      <div className="page-head"><div>{switcher}</div></div>
      {tab === "salary" ? <Salary /> : tab === "advances" ? <Advances /> : tab === "calc" ? <PayCalc defaultDate={tenantToday(me.tenant.timezone)} onCalc={(i) => call<PayCalcResult>("POST", "payroll/calc-preview", i)} /> : null}
    </section>
  );
}
export default function Page() { return <Suspense><PayrollPage /></Suspense>; }
