"use client";
/* Platform audit: bám page-audit của Kavor Console Prototype.html, chỉ hành động của nhân viên Kavor (append-only) */
import { useState } from "react";
import type { ConsoleAuditEntry } from "@kavor/contracts";
import { useApi } from "../../_lib/client";
import { Empty, Icon, LoadError, fmtDateTime } from "../../_ui/kit";
import { ACTION } from "../../_ui/labels";

export default function AuditPage() {
  const { data, error, reload } = useApi<ConsoleAuditEntry[]>("audit");
  const [q, setQ] = useState("");
  const k = q.trim().toLowerCase();
  const rows = (data ?? []).filter((a) => !k || `${a.actor} ${a.tenant?.name ?? ""} ${a.tenant?.code ?? ""} ${a.action} ${ACTION[a.action] ?? ""} ${a.resourceType}`.toLowerCase().includes(k));
  return (
    <section className="page active">
      <div className="page-head"><div><h2>Platform audit</h2><p>Theo dõi hành động của nhân viên Kavor. Append-only; thao tác trên tenant nào thì tenant đó cũng thấy.</p></div></div>
      <LoadError error={error} retry={reload} />
      <article className="card">
        <div className="toolbar"><label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Actor, tenant, action hoặc resource…" /></label></div>
        {data && !rows.length ? <Empty title="Không có dòng audit phù hợp" /> : (
          <div className="table-wrap"><table className="data-table" style={{ minWidth: 980 }}><thead><tr><th>Thời gian</th><th>Actor</th><th>Tenant</th><th>Action</th><th>Resource</th><th>Lý do</th></tr></thead><tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="nowrap">{fmtDateTime(a.createdAt, "Asia/Ho_Chi_Minh")}</td>
                <td>{a.actor}</td>
                <td>{a.tenant ? `${a.tenant.name} · ${a.tenant.code}` : "—"}</td>
                <td><b>{ACTION[a.action] ?? a.action}</b><br /><small className="muted">{a.action}</small></td>
                <td><small>{a.resourceType}{a.resourceId ? ` · ${a.resourceId.slice(0, 8)}` : ""}</small></td>
                <td style={{ maxWidth: 280, whiteSpace: "normal" }}><small>{a.reason ?? "—"}</small></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </article>
    </section>
  );
}
