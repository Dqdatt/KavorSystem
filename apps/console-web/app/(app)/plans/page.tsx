"use client";
/* Gói dịch vụ: bám page-subscriptions (thẻ gói) + bảng "Tenant gần giới hạn" của page-usage trong Kavor Console Prototype.html.
   Chưa có giá, tính năng theo gói, tạo/sửa gói (prototype có "Tạo gói"/"Chỉnh sửa") — gói do Kavor duy trì trong DB. */
import { useState } from "react";
import { canOperate, type ConsoleTenant, type PlatformPlan } from "@kavor/contracts";
import { useApi } from "../../_lib/client";
import { Empty, LoadError, Person, Status, num, useMe } from "../../_ui/kit";
import { PLAN, TSTATUS } from "../../_ui/labels";
import { PlanModal, nearLimit, usageTone } from "../../_ui/tenant-ops";
import { SkeletonRows } from "@kavor/web-ui";

const TONE: Record<string, string> = { trial: "muted", starter: "muted", growth: "", enterprise: "violet" };

export default function Plans() {
  const me = useMe();
  const { data: plans, error, reload } = useApi<PlatformPlan[]>("plans");
  const tenants = useApi<ConsoleTenant[]>("tenants");
  const [edit, setEdit] = useState<ConsoleTenant | null>(null);
  const near = (tenants.data ?? []).filter((t) => t.status !== "closed" && nearLimit(t)).sort((a, b) => b.employees / b.employeeLimit - a.employees / a.employeeLimit);
  return (
    <section className="page active">
      <div className="page-head"><div><p>Giới hạn theo nhân sự. Đổi gói của từng doanh nghiệp trong phần chi tiết ở trang Doanh nghiệp.</p></div></div>
      <LoadError error={error ?? tenants.error} retry={() => { void reload(); void tenants.reload(); }} />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {(plans ?? []).map((p) => (
          <article key={p.code} className="card integration-card" style={p.code === "growth" ? { boxShadow: "inset 0 3px 0 var(--accent)" } : undefined}>
            <div><span className={`status ${TONE[p.code]}`}>{p.name.toUpperCase()}</span>
              <h3 style={{ fontSize: 20, margin: "12px 0 4px" }}>{p.employeeLimit ? `Tối đa ${num(p.employeeLimit)} nhân sự` : "Theo hợp đồng"}</h3><p className="muted">{p.summary}</p></div>
            <div className="detail-list" style={{ padding: "12px 0 0" }}><div className="detail-row"><span>Doanh nghiệp</span><b>{num(p.tenants)}</b></div></div>
          </article>
        ))}
      </div>
      <article className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Doanh nghiệp gần giới hạn</h3><p>Dùng từ 90% giới hạn nhân sự trở lên</p></div></div>
        {tenants.data && !near.length ? <Empty title="Chưa doanh nghiệp nào gần giới hạn" /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Doanh nghiệp</th><th>Gói</th><th>Đang dùng</th><th>Giới hạn</th><th>Tỷ lệ</th><th>Trạng thái</th><th /></tr></thead><tbody>
            {!tenants.data && !tenants.error ? <SkeletonRows cols={7} rows={4} /> : null}
            {near.map((t) => (
              <tr key={t.id}>
                <td><Person name={t.name} seed={t.code} sub={t.code} /></td><td>{PLAN[t.plan]}</td>
                <td className="num">{num(t.employees)}</td><td className="num">{num(t.employeeLimit)}</td>
                <td className={`num ${usageTone(t)}`}><b>{Math.round((t.employees / t.employeeLimit) * 100)}%</b></td><td><Status v={TSTATUS[t.status]} /></td>
                <td>{canOperate(me.role) ? <button className="btn small" onClick={() => setEdit(t)}>Đổi gói</button> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
      {edit ? <PlanModal t={edit} onClose={() => setEdit(null)} onDone={() => { void reload(); void tenants.reload(); }} /> : null}
    </section>
  );
}
