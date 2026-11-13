"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AdminDevice, EmployeeDetail, EmployeeLeave, EmployeeStatus, EmployeeTimesheet, EmploymentType, ChecklistGaps, OrgOptions, RequestItem, RequestQueue } from "@kavor/contracts";
import { MANAGEMENT_TIERS, MANAGEMENT_TIERS_EN, managerTierOk, type AdminMe } from "@kavor/contracts";
import { call, useApi } from "../../_lib/client";
import { EmployeePaySection } from "./pay";
import { EmployeeChecklistSection } from "../documents/checklist";
import {
  ACCOUNT, Avatar, DEVICE, Dl, EMP_STATUS, EMPLOYMENT, ErrorLine, Field, Icon, LoadError, Modal, MoreMenu, Phrases, REJECT_REASON, Section, Status, scopeText,
  ago, can, fmtDate, fmtDateTime, tenantToday, tenure, useAction, useMe,
} from "../../_ui/kit";
import { ReasonModal } from "../../_ui/reason-modal";
import { REQUEST_STATUS, REQUEST_TYPE, RequestModal, requestSummary } from "../../_ui/request";
import { Select, SkeletonLines } from "@kavor/web-ui";

const AUDIT: Record<string, string> = {
  "employee.created": "Tạo hồ sơ", "employee.updated": "Sửa hồ sơ", "employee.invited": "Gửi lời mời kích hoạt", "account.locked": "Khóa tài khoản", "account.unlocked": "Mở khóa tài khoản",
  "auth.activated": "Nhân viên kích hoạt tài khoản", "auth.activation.otp_sent": "Gửi OTP kích hoạt", "auth.login": "Đăng nhập", "auth.login_failed": "Đăng nhập sai mật khẩu", "auth.password_reset": "Đặt lại mật khẩu",
  "auth.mfa_enrolled": "Bật xác thực hai lớp", "auth.mfa_verified": "Xác thực hai lớp khi đăng nhập web", "auth.mfa_reset": "Đặt lại xác thực hai lớp",
  "privacy.consented": "Đồng ý điều khoản dữ liệu cá nhân",
  "request.submitted": "Gửi đơn", "request.cancelled": "Hủy đơn", "approval.approved": "Duyệt đơn", "approval.rejected": "Từ chối đơn",
  "leave.adjusted": "Điều chỉnh sổ phép", "leave.carry_imported": "Nhập phép tồn", "compensation.changed": "Đổi mức lương", "compensation.viewed": "Xem lương", "tax_profile.changed": "Sửa MST/công đoàn", "dependent.added": "Thêm người phụ thuộc", "dependent.changed": "Sửa người phụ thuộc", "dependent.removed": "Xóa người phụ thuộc", "salary_advance.paid": "Chi tạm ứng",
  "device.registered": "Đăng ký thiết bị", "device.change_requested": "Yêu cầu dùng máy mới", "device.approved": "Duyệt thiết bị", "device.rejected": "Từ chối thiết bị", "device.revoked": "Thu hồi thiết bị",
};

/* Hồ sơ chia tab để mỗi phần có bố cục đều, không dồn cột */
type ProfileTab = "overview" | "personal" | "attendance" | "pay" | "papers" | "requests" | "history";
const TABS: Array<{ id: ProfileTab; label: string; show: (me: AdminMe) => boolean }> = [
  { id: "overview", label: "Tổng quan", show: () => true },
  { id: "personal", label: "Cá nhân", show: () => true },
  { id: "attendance", label: "Chấm công", show: (me) => can(me, "attendance.read") },
  { id: "pay", label: "Lương", show: (me) => can(me, "compensation.read") },
  { id: "papers", label: "Giấy tờ", show: (me) => can(me, "document.read") },
  { id: "requests", label: "Đơn từ", show: (me) => can(me, "request.read") },
  { id: "history", label: "Lịch sử", show: (me) => can(me, "audit.read") },
];

export function EmployeeProfile({ id }: { id: string }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const today = tenantToday(tz);
  const { data: e, error, reload } = useApi<EmployeeDetail>(`employees/${id}`, { tables: ["employees", "employee_devices", "attendance_events"], tenantId: me.tenant.id });
  const org = useApi<OrgOptions>(can(me, "employee.update") ? "org" : null);
  const { busy, run } = useAction();
  const [ask, setAsk] = useState<null | { title: string; label: string; danger?: boolean; go: (reason: string) => Promise<unknown>; ok: string }>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("overview");

  /* Giấy tờ bắt buộc còn thiếu (danh mục công ty tự khai); tải lại khi rời tab Giấy tờ vì có thể vừa đánh dấu nộp */
  const gaps = useApi<ChecklistGaps>(can(me, "document.read") ? "checklist/gaps" : null);
  const prevTab = useRef(tab);
  useEffect(() => { if (prevTab.current === "papers" && tab !== "papers") void gaps.reload(); prevTab.current = tab; }, [tab, gaps]);
  const missing = gaps.data?.rows.find((r) => r.employeeId === id)?.missing ?? [];
  /* Số ngày công/phép lấy từ endpoint đã có (cần quyền chấm công/nghỉ phép); lỗi (ngoài phạm vi) thì ẩn thẻ */
  const ts = useApi<EmployeeTimesheet>(tab === "overview" && can(me, "attendance.read") ? `timesheets/${id}` : null);
  const lv = useApi<EmployeeLeave>(tab === "overview" && can(me, "leave.read") ? `leave/${id}` : null);

  const deviceAct = (d: AdminDevice, action: "approve" | "reject" | "revoke") =>
    action === "approve"
      ? run(`dev-${d.id}`, () => call("POST", `devices/${d.id}/approve`, {}), `Đã duyệt ${d.deviceModel ?? "thiết bị"}`).then(reload)
      : setAsk({ title: action === "reject" ? "Từ chối thiết bị" : "Thu hồi thiết bị", label: "Lý do (nhân viên sẽ thấy)", danger: true, ok: action === "reject" ? "Đã từ chối thiết bị" : "Đã thu hồi thiết bị",
        go: (reason) => call("POST", `devices/${d.id}/${action}`, { reason }) });

  if (!e) return <><LoadError error={error} retry={reload} />{error ? null : <SkeletonLines lines={6} avatar />}</>;

  const invite = () => run("invite", () => call("POST", `employees/${e.id}/invite`, {}), `Đã gửi lời mời tới ${e.email}`).then(reload);
  const canInvite = (e.account === "invited" || e.account === "not_invited") && can(me, "membership.invite");
  const canDisable = can(me, "membership.disable") && e.id !== me.employeeId;
  const menu = [
    ...(e.account === "active" && canDisable ? [{ label: "Khóa tài khoản", icon: "lock", danger: true, onClick: () => setAsk({ title: `Khóa tài khoản ${e.fullName}?`, label: "Lý do khóa", danger: true, ok: "Đã khóa tài khoản — mọi phiên đăng nhập bị chặn ngay", go: (reason) => call("POST", `employees/${e.id}/lock`, { reason }) }) }] : []),
    ...(e.account === "active" && canDisable ? [{ label: "Đặt lại xác thực hai lớp", icon: "shield", onClick: () => setAsk({ title: `Đặt lại xác thực hai lớp của ${e.fullName}?`, label: "Lý do (ví dụ: mất điện thoại)", ok: "Đã đặt lại — lần đăng nhập web sau phải liên kết lại ứng dụng xác thực", go: (reason) => call("POST", `employees/${e.id}/mfa-reset`, { reason }) }) }] : []),
    ...(e.account === "locked" && can(me, "membership.disable") ? [{ label: "Mở khóa tài khoản", icon: "lock", onClick: () => void run("unlock", () => call("POST", `employees/${e.id}/unlock`, {}), "Đã mở khóa tài khoản").then(reload) }] : []),
  ];
  const needInvite = canInvite && e.status !== "terminated";

  return (
    <>
      <LoadError error={error} retry={reload} />
      <section className="card phead">
        <div className="phead-top">
          <Avatar name={e.fullName} seed={e.code} xl />
          <div className="phead-main">
            <div className="phead-title"><h2>{e.fullName}</h2><span className="source-tag">{e.code}</span><Status v={EMP_STATUS[e.status]} /></div>
            <p className="phead-sub">{[e.position?.name, e.department?.name].filter(Boolean).join(" · ") || "—"}</p>
            <div className="meta">
              {e.email ? <span><Icon name="mail" />{e.email}</span> : null}
              {e.phone ? <span><Icon name="phone" />{e.phone}</span> : null}
              <span><Icon name="calendar" />Vào làm {fmtDate(e.hireDate)} · {tenure(e.hireDate, today)}</span>
              {e.branch ? <span><Icon name="pin" />{e.branch.name}</span> : null}
            </div>
          </div>
          <div className="phead-actions">
            {can(me, "employee.update") ? <button className="btn" disabled={!org.data} onClick={() => setEditing(true)}>Sửa hồ sơ</button> : null}
            {menu.length ? <MoreMenu items={menu} /> : null}
          </div>
        </div>
        {(missing.length && e.status !== "terminated") || needInvite ? (
          <div className="needs"><span className="cap">Cần bổ sung</span>
            {missing.length && e.status !== "terminated" ? <button className="needbtn" title={missing.join(", ")} onClick={() => setTab("papers")}><Icon name="file" />Thiếu {missing.length} giấy tờ bắt buộc</button> : null}
            {needInvite ? <button className="needbtn" disabled={!!busy || !e.email} onClick={() => void invite()}><Icon name="mail" />{e.account === "invited" ? "Chưa kích hoạt app · gửi lại lời mời" : "Chưa mời dùng app · gửi lời mời"}</button> : null}
          </div>
        ) : null}
      </section>
      <div className="segmented profile-tabs" role="tablist">{TABS.filter((t) => t.show(me)).map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}{t.id === "papers" && missing.length ? <span className="n hot">{missing.length}</span> : null}</button>
      ))}</div>

      {tab === "overview" ? <>
        <div className="grid two top">
          <Section title="Công việc" action={can(me, "employee.update") ? <button className="btn small" disabled={!org.data} onClick={() => setEditing(true)}>Sửa</button> : undefined}>
            <Dl rows={[
              ["Phòng ban", e.department?.name ?? "—"],
              ["Chức danh", e.position?.name ?? "—"],
              ["Chi nhánh · pháp nhân", <Phrases key="b" text={`${e.branch?.name ?? "—"} · ${e.legalEntity?.name ?? "—"}`} />],
              ["Quản lý trực tiếp", e.manager?.name ?? "—"],
              ["Cấp bậc", `${e.tier ? `${MANAGEMENT_TIERS[e.tier]} (${MANAGEMENT_TIERS_EN[e.tier]})` : "Chưa đặt"}${e.directReports ? ` · quản lý ${e.directReports} người` : ""}`],
              /* Cấp bậc theo chức danh; quyền xem/duyệt trên web theo vai trò được gán — hai thứ tách nhau */
              ["Quyền trên Kavor", <Phrases key="r" text={e.roles.length ? e.roles.map((r) => `${r.name} (${r.scope})`).join(", ") : "Nhân viên (chỉ dùng app)"} />],
              ["Email công ty", e.email ?? "—"],
              ["Điện thoại", e.phone ?? "—"],
              ["Ngày vào làm · loại HĐ", `${fmtDate(e.hireDate)} · ${EMPLOYMENT[e.employmentType]}`],
              ...(e.terminationDate ? [["Ngày nghỉ việc", fmtDate(e.terminationDate)] as [string, ReactNode]] : []),
            ]} />
            {e.directReports && !e.roles.some((r) => ["manager", "tenant_admin", "hr_ops"].includes(r.code)) ? <p className="text-amber" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
              Đang quản lý {e.directReports} người nhưng chưa có quyền duyệt: chưa xem đơn, bảng công của cấp dưới trên web. <Link href="/roles">Gán vai trò Quản lý</Link> hoặc dùng Sắp xếp tự động ở Cơ cấu tổ chức.</p> : null}
          </Section>
          <div className="col-stack">
            <Section title="Ca và nơi chấm công">
              <div className="kv-spread"><span><b>Ca làm</b><small>{e.policies.shift ? `${e.policies.shift.name} · ${e.policies.shift.start}–${e.policies.shift.end}` : ""}</small></span>
                {e.policies.shift ? <span className="source-tag" title="Tầng áp dụng">{scopeText(e.policies.shift.source)}</span> : <span className="text-red">Chưa áp dụng ca nào</span>}</div>
              <div className="kv-spread"><span><b>Địa điểm chấm công</b><small>{e.policies.locations.length ? e.policies.locations.map((l) => `${l.name} (${l.radiusM} m)`).join(", ") : ""}</small></span>
                {e.policies.locations.length ? (e.policies.locationSource ? <span className="source-tag">{scopeText(e.policies.locationSource)}</span> : null) : <span className="text-red">Chưa có địa điểm</span>}</div>
            </Section>
            <Section title="Tài khoản Kavor">
              <Dl rows={[
                ["Trạng thái", <Status key="s" v={ACCOUNT[e.account]} />],
                ...(e.invitedAt ? [["Lời mời gần nhất", fmtDateTime(e.invitedAt, tz)] as [string, ReactNode]] : []),
                ...(e.lastLoginAt ? [["Đăng nhập gần nhất", ago(e.lastLoginAt)] as [string, ReactNode]] : []),
              ]} />
              {canInvite ? <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                <button className="btn small" disabled={!!busy || !e.email} onClick={() => void invite()}><Icon name="mail" /> {busy === "invite" ? "Đang gửi…" : e.account === "invited" ? "Gửi lại lời mời" : "Gửi lời mời"}</button>
              </div> : null}
            </Section>
          </div>
        </div>
        {ts.data || lv.data?.balance ? <div className="grid two top">
          {ts.data ? <Section title="Kỳ công hiện tại" action={<button className="btn small ghost" onClick={() => setTab("attendance")}>Chi tiết</button>}>
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>{fmtDate(ts.data.period.start)} – {fmtDate(ts.data.period.end)}</p>
            <div className="params four">
              <div className="param"><b>{ts.data.summary.credited}/{ts.data.summary.standard}</b><span>Ngày công</span></div>
              <div className="param"><b className={ts.data.summary.lateDays ? "text-amber" : ""}>{ts.data.summary.lateDays}</b><span>Đi muộn</span></div>
              <div className="param"><b className={ts.data.summary.missingDays ? "text-red" : ""}>{ts.data.summary.missingDays}</b><span>Thiếu công</span></div>
              <div className="param"><b>{ts.data.summary.leaveDays}</b><span>Nghỉ phép</span></div>
            </div>
          </Section> : <div />}
          {lv.data?.balance ? <LeaveCard b={lv.data.balance} /> : <div />}
        </div> : null}
      </> : null}

      {tab === "personal" ? <div className="grid two top">
        {/* Thông tin cá nhân do nhân viên đề nghị sửa trên app, HR duyệt (Đơn & phê duyệt); số tài khoản đầy đủ chỉ khi có quyền */}
        <Section title="Thông tin cá nhân">
          <Dl rows={[
            ["Ngày sinh · giới tính", `${e.personal.birthDate ? fmtDate(e.personal.birthDate) : "—"} · ${e.personal.gender ? { male: "Nam", female: "Nữ", other: "Khác" }[e.personal.gender] : "—"}`],
            ["CCCD/CMND", <Phrases key="i" text={e.personal.idNumber ? `${e.personal.idNumber}${e.personal.idIssuedOn ? ` · cấp ${fmtDate(e.personal.idIssuedOn)}` : ""}${e.personal.idIssuedBy ? ` · ${e.personal.idIssuedBy}` : ""}` : null} />],
            ["Số sổ BHXH", e.personal.socialInsuranceNo ?? "—"],
            ["Email cá nhân", e.personal.personalEmail ?? "—"],
          ]} />
        </Section>
        <Section title="Liên hệ và địa chỉ">
          <Dl rows={[
            ["Thường trú", <Phrases key="p" text={e.personal.permanentAddress} />],
            ["Địa chỉ hiện tại", <Phrases key="a" text={e.personal.address} />],
            ["Liên hệ khẩn cấp", e.personal.emergency ? `${e.personal.emergency.name} · ${e.personal.emergency.relation} · ${e.personal.emergency.phone}` : "—"],
            ["Tài khoản ngân hàng", <Phrases key="k" text={e.personal.bank ? `${e.personal.bank.bankName} · ${e.personal.bank.accountNo ?? `•••• ${e.personal.bank.last4}`} · ${e.personal.bank.holder}` : null} />],
          ]} />
        </Section>
      </div> : null}

      {tab === "attendance" && can(me, "attendance.read") ? <div className="grid two top">
        <Section title="Thiết bị chấm công">
          {!e.devices.length ? <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Chưa đăng ký thiết bị.</p> : e.devices.map((d) => (
            <div key={d.id} className="kv-spread">
              <span><b>{d.deviceModel ?? d.platform}</b> · {d.osVersion ?? d.platform}<small>Đăng ký {fmtDateTime(d.registeredAt, tz)}{d.decisionReason ? ` · ${d.decisionReason}` : ""}</small></span>
              <span className="row-actions"><Status v={DEVICE[d.status]} />
                {can(me, "attendance.device.manage") && d.status === "pending" ? <><button className="btn small primary" disabled={!!busy} onClick={() => void deviceAct(d, "approve")}>Duyệt</button><button className="btn small" onClick={() => void deviceAct(d, "reject")}>Từ chối</button></> : null}
                {can(me, "attendance.device.manage") && d.status === "active" ? <button className="btn small" onClick={() => void deviceAct(d, "revoke")}>Thu hồi</button> : null}
              </span>
            </div>
          ))}
        </Section>
        <Section title="Chấm công 14 ngày gần nhất">
          {!e.recentEvents.length ? <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Chưa có bản ghi.</p> : (
            <Dl rows={e.recentEvents.slice(0, 12).map((ev): [string, ReactNode] => [
              `${fmtDateTime(ev.occurredAt, tz)} · ${ev.kind === "in" ? "Vào ca" : "Ra ca"}${ev.offline ? " · offline" : ""}`,
              ev.status === "accepted" ? (ev.deviationMinutes > 0 ? <span className="text-red">{ev.kind === "in" ? "Muộn" : "Sớm"} {ev.deviationMinutes} phút</span> : <span className="text-green">Hợp lệ</span>) : <span className="text-red">{REJECT_REASON[ev.rejectReason ?? ""] ?? "Bị từ chối"}</span>,
            ])} />
          )}
        </Section>
      </div> : null}

      {tab === "pay" && can(me, "compensation.read") ? <EmployeePaySection employeeId={e.id} name={e.fullName} /> : null}
      {tab === "papers" && can(me, "document.read") ? <EmployeeChecklistSection employeeId={e.id} /> : null}
      {tab === "requests" && can(me, "request.read") ? <EmployeeRequests employeeId={e.id} /> : null}

      {tab === "history" && can(me, "audit.read") ? (
        <Section title="Lịch sử thay đổi" action={<span className="muted" style={{ fontSize: 12.5 }}>Xem dữ liệu nhạy cảm cũng được ghi lại</span>}>
          {!e.audit.length ? <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Chưa có thay đổi.</p> : (
            <div className="tl">{e.audit.slice(0, 15).map((a) => (
              <div key={a.id}><span className="pt" /><div className="kv-spread">
                <span><b>{AUDIT[a.action] ?? a.action}</b><small>{[a.actor, a.reason].filter(Boolean).join(" — ")}</small></span>
                <small className="num">{fmtDateTime(a.createdAt, tz)}</small>
              </div></div>
            ))}</div>
          )}
        </Section>
      ) : null}

      {ask ? <ReasonModal {...ask} onClose={() => setAsk(null)} onDone={() => void reload()} /> : null}
      {editing && org.data ? <EmployeeForm org={org.data} employee={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); }} /> : null}
    </>
  );
}

/* Phép năm: vòng = còn lại / định mức năm; số liệu từ sổ phép (employees leave/:id) */
function LeaveCard({ b }: { b: NonNullable<EmployeeLeave["balance"]> }) {
  const total = Math.max(b.available + b.used, 0.0001);
  const R = 42, C = 2 * Math.PI * R;
  const left = Math.max(0, Math.min(1, b.available / total));
  return (
    <Section title={`Phép năm ${b.year}`}>
      <div className="ring-row">
        <span className="ringw" style={{ width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r={R} fill="none" stroke="var(--track)" strokeWidth="12" />
            <circle cx="48" cy="48" r={R} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * left} ${C}`} /></svg>
          <span className="c"><b>{b.available}</b><span>còn lại</span></span>
        </span>
        <div className="col">
          <div className="kv-spread"><span><i className="lg-dot" style={{ background: "var(--accent)" }} />Còn lại</span><b className="num">{b.available} ngày</b></div>
          <div className="kv-spread"><span><i className="lg-dot" style={{ background: "var(--info-fill)" }} />Đã nghỉ</span><b className="num">{b.used} ngày</b></div>
          {b.pending ? <div className="kv-spread"><span><i className="lg-dot" style={{ background: "var(--warn-fill)" }} />Đang chờ duyệt</span><b className="num">{b.pending} ngày</b></div> : null}
        </div>
      </div>
    </Section>
  );
}

export function EmployeeForm({ org, employee, onClose, onSaved }: { org: OrgOptions; employee: EmployeeDetail | null; onClose: () => void; onSaved: (id: string) => void }) {
  const me = useMe();
  const today = tenantToday(me.tenant.timezone);
  const [f, setF] = useState({
    employeeCode: employee?.code ?? "", fullName: employee?.fullName ?? "", workEmail: employee?.email ?? "", phone: employee?.phone ?? "",
    hireDate: employee?.hireDate ?? today, employmentType: (employee?.employmentType ?? "probation") as EmploymentType, status: (employee?.status ?? "active") as EmployeeStatus,
    departmentId: employee?.department?.id ?? "", positionId: employee?.position?.id ?? "", managerEmployeeId: employee?.manager?.id ?? "",
    effectiveFrom: today, sendInvite: true,
  });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr(null); };
  /* Danh sách chọn quản lý trực tiếp: chỉ người có cấp quản lý cao hơn chức danh đang chọn (managerTierOk); giữ người đang được chọn
     dù sai cấp để không âm thầm đổi dữ liệu cũ — API chặn khi lưu */
  const posTier = org.positions.find((p) => p.id === f.positionId)?.tier ?? null;
  const mgrOptions = org.employees.filter((x) => x.id !== employee?.id && (managerTierOk(x.tier, posTier) || x.id === f.managerEmployeeId))
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || a.name.localeCompare(b.name, "vi"));
  /* Quản lý trực tiếp chưa có vai trò xem dữ liệu nhân viên trên web (Quản lý / Nhân sự vận hành / Quản trị viên): gợi ý gán */
  const mgrNoRole = ((m) => (m && !m.roles.some((r) => r === "manager" || r === "hr_ops" || r === "tenant_admin") ? m : null))(org.employees.find((x) => x.id === f.managerEmployeeId));
  const placementChanged = !!employee && (f.departmentId !== (employee.department?.id ?? "") || f.positionId !== (employee.position?.id ?? "") || f.managerEmployeeId !== (employee.manager?.id ?? ""));

  async function save() {
    if (!f.fullName.trim() || !f.employeeCode.trim() || !f.workEmail.trim() || !f.departmentId || !f.positionId) { setErr("Điền đủ họ tên, mã, email công ty, phòng ban và chức danh."); return; }
    const body: Record<string, unknown> = { ...f, phone: f.phone || null, managerEmployeeId: f.managerEmployeeId || null };
    if (employee) { delete body.sendInvite; if (!placementChanged) { delete body.departmentId; delete body.positionId; delete body.managerEmployeeId; delete body.effectiveFrom; } }
    else delete body.status;
    let id = employee?.id ?? "";
    const ok = await run("save", async () => {
      const r = employee ? await call<EmployeeDetail>("PATCH", `employees/${employee.id}`, body) : await call<EmployeeDetail>("POST", "employees", body);
      id = r.id;
    }, employee ? "Đã lưu hồ sơ" : f.sendInvite ? "Đã tạo hồ sơ và gửi lời mời kích hoạt" : "Đã tạo hồ sơ");
    if (ok) onSaved(id);
  }

  return (
    <Modal wide title={employee ? `Sửa hồ sơ ${employee.fullName}` : "Thêm nhân viên"} sub={employee ? "Đổi phòng ban/chức danh/quản lý sẽ tạo phân công mới từ ngày hiệu lực, giữ lịch sử cũ." : undefined} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!!busy} onClick={save}>{busy ? "Đang lưu…" : employee ? "Lưu thay đổi" : "Tạo hồ sơ"}</button></>}>
      <div className="form-grid">
        <Field label="Họ và tên"><input value={f.fullName} onChange={set("fullName")} placeholder="Nguyễn Văn A" /></Field>
        <Field label="Mã nhân viên"><input value={f.employeeCode} onChange={set("employeeCode")} placeholder="HD0301" /></Field>
        <Field label="Email công ty" note={employee?.account === "active" || employee?.account === "locked" ? "Đã kích hoạt: không đổi được email đăng nhập" : undefined}>
          <input type="email" value={f.workEmail} onChange={set("workEmail")} disabled={employee?.account === "active" || employee?.account === "locked"} />
        </Field>
        <Field label="Điện thoại"><input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Phòng ban"><Select value={f.departmentId} onChange={set("departmentId")}><option value="">Chọn phòng ban</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Chức danh"><Select value={f.positionId} onChange={set("positionId")}><option value="">Chọn chức danh</option>{org.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Quản lý trực tiếp"><Select value={f.managerEmployeeId} onChange={set("managerEmployeeId")}><option value="">Không có</option>{mgrOptions.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}{x.position ? ` · ${x.position}` : ""}{managerTierOk(x.tier, posTier) ? "" : " (sai cấp)"}</option>)}</Select>
          {f.positionId && !posTier ? <small className="muted" style={{ display: "block", marginTop: 6 }}>Chức danh này chưa đặt cấp quản lý nên đang hiện mọi người. Đặt cấp ở Cơ cấu tổ chức → Chức danh.</small> : null}
          {mgrNoRole ? <small className="muted" style={{ display: "block", marginTop: 6 }}>{mgrNoRole.name} sẽ duyệt đơn của nhân viên này trên app, nhưng chưa có vai trò Quản lý nên chưa xem được đơn và bảng công trên web. <a href="/roles">Gán vai trò Quản lý</a> (phạm vi Nhân viên trực tiếp).</small> : null}
        </Field>
        <Field label="Ngày vào làm"><input type="date" value={f.hireDate} onChange={set("hireDate")} /></Field>
        <Field label="Loại hợp đồng"><Select value={f.employmentType} onChange={set("employmentType")}>{Object.entries(EMPLOYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {employee ? <Field label="Trạng thái làm việc"><Select value={f.status} onChange={set("status")}>{Object.entries(EMP_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select></Field> : null}
        {placementChanged ? <Field label="Hiệu lực thay đổi phòng ban/chức danh từ"><input type="date" value={f.effectiveFrom} onChange={set("effectiveFrom")} /></Field> : null}
        {!employee ? <label className="check-row" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={f.sendInvite} onChange={(e) => setF({ ...f, sendInvite: e.target.checked })} /> Gửi email mời kích hoạt ngay</label> : null}
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/* Đơn từ của nhân viên (mới nhất trước, mọi trạng thái): xem lại/đối chiếu ngay trong hồ sơ; danh sách đầy đủ ở Đơn & phê duyệt */
function EmployeeRequests({ employeeId }: { employeeId: string }) {
  const me = useMe();
  const { data, reload } = useApi<RequestQueue>(`requests?status=all&employeeId=${employeeId}&pageSize=10`, { tables: ["requests", "approval_tasks"], tenantId: me.tenant.id });
  const [open, setOpen] = useState<RequestItem | null>(null);
  return (
    <section className="card">
      <div className="card-head"><h3>Đơn từ{data ? ` (${data.total})` : ""}</h3></div>
      {!data ? <div className="card-body"><SkeletonLines lines={3} /></div> : !data.items.length ? <div className="card-body"><p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Chưa có đơn nào.</p></div> : (
        <div className="table-wrap" style={{ marginTop: 12 }}><table className="data-table"><tbody>
          {data.items.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
              <td className="nowrap"><b>{r.no}</b></td><td>{REQUEST_TYPE[r.type]}</td><td>{requestSummary(r)}</td>
              <td className="nowrap">{fmtDateTime(r.submittedAt, me.tenant.timezone)}</td><td><Status v={REQUEST_STATUS[r.status]} /></td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {data && data.total > data.items.length ? <p className="muted" style={{ fontSize: 12.5, margin: 0, padding: "10px 22px 18px" }}>Đang hiện {data.items.length} đơn mới nhất. Xem đủ ở Đơn & phê duyệt → tab Tất cả, tìm theo mã nhân viên.</p> : null}
      {open ? <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => void reload()} /> : null}
    </section>
  );
}
