"use client";
/* Lương & tạm ứng (Kế toán) — bám page-payroll của prototype HR. Tab Kỳ lương: nhập kết quả CSV, lỗi/cảnh báo, duyệt, công bố;
   tab Tạm ứng và Lương cơ bản chuyển từ trang /advances cũ. Mỗi tab chỉ hiện với người có quyền tương ứng. */
import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { can, useMe } from "../../_ui/kit";
import { Advances, Salary } from "./advances";
import { Cycles } from "./cycles";

type Tab = "cycles" | "advances" | "salary";
const TABS: Array<[Tab, string, string]> = [["cycles", "Kỳ lương", "payroll.read"], ["advances", "Tạm ứng", "salary_advance.process"], ["salary", "Lương cơ bản", "compensation.read"]];

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
  return (
    <section className="page active">
      <div className="page-head">
        <div><h2>{tab === "salary" ? "Lương cơ bản" : "Tạm ứng lương"}</h2>
          <p>{tab === "salary" ? "Dùng để tính hạn mức tạm ứng. Chỉ Kế toán xem được; đổi lương là phiên bản mới từ ngày hiệu lực." : "Duyệt bước Kế toán và xác nhận đã chi; khoản ứng trừ vào lương của tháng ứng."}</p></div>
        <div className="head-actions">{switcher}</div>
      </div>
      {tab === "salary" ? <Salary /> : tab === "advances" ? <Advances /> : null}
    </section>
  );
}
export default function Page() { return <Suspense><PayrollPage /></Suspense>; }
