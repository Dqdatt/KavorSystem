"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EmployeeListItem } from "@kavor/contracts";
import { useApi } from "../_lib/client";
import { Avatar, Empty, Icon, can, useMe } from "./kit";

export type CmdPage = { href: string; label: string; icon: string };
type Row = { g: string; t: string; s?: string; icon?: string; emp?: string; href: string };
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

/* Thao tác nhanh: chỉ route/tham số đã có thật; prototype còn tìm mã đơn — chưa có API nên bỏ */
const ACTIONS: Array<{ icon: string; t: string; href: string; perm: string }> = [
  { icon: "plus", t: "Thêm nhân viên", href: "/employees?new=1", perm: "employee.create" },
  { icon: "users", t: "Gửi lời mời kích hoạt app", href: "/employees?account=pending", perm: "employee.read" },
  { icon: "pay", t: "Tính thử lương", href: "/payroll?tab=calc", perm: "compensation.read" },
  { icon: "lock", t: "Khóa kỳ công", href: "/attendance?tab=month", perm: "attendance.read" },
  { icon: "news", t: "Tạo bài viết bản tin", href: "/announcements?new=1", perm: "announcement.publish" },
];

export function CmdK({ pages, onClose }: { pages: CmdPage[]; onClose: () => void }) {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [on, setOn] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const emps = useApi<EmployeeListItem[]>(can(me, "employee.read") ? "employees?status=working&account=all" : null).data;

  const rows = useMemo<Row[]>(() => {
    const k = fold(q.trim());
    const m = (s: string) => fold(s).includes(k);
    const e: Row[] = k ? (emps ?? []).filter((x) => m(x.fullName) || m(x.code)).slice(0, 6).map((x) => ({ g: "Nhân viên", t: x.fullName, emp: x.fullName, s: `${x.code}${x.department ? `|${x.department.name}` : ""}`, href: `/employees/${x.id}` })) : [];
    const a: Row[] = ACTIONS.filter((x) => can(me, x.perm) && m(x.t)).map((x) => ({ g: "Thao tác nhanh", t: x.t, icon: x.icon, href: x.href }));
    const p: Row[] = pages.filter((x) => m(x.label)).map((x) => ({ g: "Trang", t: x.label, icon: x.icon, href: x.href }));
    return [...e, ...a, ...p];
  }, [q, emps, pages, me]);

  useEffect(() => setOn(0), [q]);
  useEffect(() => { box.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }, [on]);
  const go = (r: Row | undefined) => { if (!r) return; onClose(); router.push(r.href); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (rows.length) setOn((i) => (i + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(rows[on]); }
  };

  let g = "";
  return (
    <div className="cmdk-layer">
      <div className="scrim" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Tìm kiếm nhanh" onKeyDown={key}>
        <div className="inwrap"><Icon name="search" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhân viên, trang hoặc thao tác…" autoComplete="off" aria-label="Tìm kiếm nhanh" /></div>
        <div className="res" ref={box}>
          {rows.length ? rows.map((r, i) => (
            <div key={r.href + r.t} style={{ display: "contents" }}>
              {r.g !== g ? <h6>{(g = r.g)}</h6> : null}
              <button className={i === on ? "on" : ""} onMouseEnter={() => setOn(i)} onClick={() => go(r)}>
                {r.emp ? <Avatar name={r.emp} /> : <span className="tile"><Icon name={r.icon ?? "search"} size={15} /></span>}
                <span className="grow"><b>{r.t}</b>{r.s ? <> <span className="muted small">{r.s.split("|").map((x, j) => <span key={j}>{j ? <i className="vs" /> : null}{x}</span>)}</span></> : null}</span>
                {i === on ? <span className="kbd">Enter</span> : null}
              </button>
            </div>
          )) : <Empty title="Không tìm thấy" text="Thử tên hoặc mã nhân viên." />}
        </div>
      </div>
    </div>
  );
}
