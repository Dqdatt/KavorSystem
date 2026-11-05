"use client";
/* Lương & tạm ứng — bám page-payroll của prototype HR. Tab Bảng lương đầu vào (HCNS lập, Kế toán nhận); tab Kỳ lương (Kế toán): nhập kết quả CSV, lỗi/cảnh báo, duyệt, công bố;
   tab Tạm ứng và Lương cơ bản chuyển từ trang /advances cũ. Mỗi tab chỉ hiện với người có quyền tương ứng. */
import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { can, useMe } from "../../_ui/kit";
import { Advances, Salary } from "./advances";
import { Cycles } from "./cycles";
import { Inputs } from "./inputs";

type Tab = "cycles" | "inputs" | "advances" | "salary";
const TABS: Array<[Tab, string, string]> = [["inputs", "Bảng lương đầu vào", "compensation.read"], ["cycles", "Kỳ lương", "payroll.read"], ["advances", "Tạm ứng", "salary_advance.process"], ["salary", "Lương cơ bản", "compensation.read"]];

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
  return (
    <section className="page active">
      <div className="page-head">
        <div><p>{tab === "salary" ? "Mức lương từng người (HCNS và Kế toán xem). Đổi lương là phiên bản mới từ ngày hiệu lực; sửa đủ thông tin lương ở hồ sơ nhân viên." : "Duyệt bước Kế toán và xác nhận đã chi; khoản ứng trừ vào lương của tháng ứng."}</p></div>
        <div className="head-actions">{switcher}</div>
      </div>
      {tab === "salary" ? <Salary /> : tab === "advances" ? <Advances /> : null}
    </section>
  );
}
export default function Page() { return <Suspense><PayrollPage /></Suspense>; }
