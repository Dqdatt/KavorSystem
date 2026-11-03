/* Đơn từ + luồng duyệt (PILOT_RULEBOOK §6, §9). Bắt đầu từ giải trình công; loại đơn khác dùng cùng khung.
   - Gửi: kiểm tra ngày công có bất thường, còn lượt, còn hạn, kỳ chưa khóa; chụp lại quy định + luồng duyệt; tính người duyệt
     (quản lý trực tiếp; không có hoặc chính là người gửi thì bỏ bước); tạo đơn nguyên tử bằng hàm SQL.
   - Duyệt: người được giao (bước quản lý) hoặc người có request.hr_review với người gửi (bước HR); không ai tự duyệt đơn
     của mình. Chuyển bước nguyên tử bằng decide_approval; duyệt hết thì tạo điều chỉnh giờ công. */
import {
  EXPLANATION_KINDS, PROFILE_FIELDS, REQUEST_ATTACHMENT_MAX, REQUEST_TYPES, STEP_RESOLVERS, type RequestQueueFilter, type RequestQueueItem,
  type AdvancePayload, type RequestAttachment, type ExplanationKind, type ExplanationPayload, type LeavePayload, type MyApprovals, type OvertimePayload, type MyTimesheet, type ProfileChangePayload, type RequestItem, type RequestQueue, type RequestStatus, type RequestStep, type StepResolver, type StepStatus,
  type WorkflowDef, type WorkflowStepInput,
} from "@kavor/contracts";
import type { EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import { date, number, oneOf, req, time, type Body } from "../admin/validate.js";
import { monthOf, overtimeAttendance } from "./compute.js";
import { EMP_LITE, type EmployeeLite, type TimesheetService } from "./timesheet.service.js";
import { FILE_MAX_BYTES, PrivateFiles, checkLink, safeName, sha256, signLink, sniffFile } from "../files/private-files.js";
import { localParts } from "../attendance/attendance.service.js";
import { loadPlacements } from "../attendance/policy.js";

type Db = SupabaseGateway["admin"];
/* Người xem/thao tác: nhân viên trên mobile hoặc HR/quản lý trên web — đều là một tài khoản gắn hồ sơ nhân viên */
export type Viewer = { userId: string; employeeId: string | null; tenantId: string; correlationId: string };
type RequestRow = { id: string; tenant_id: string; request_no: string; request_type: RequestItem["type"]; requester_employee_id: string; status: RequestStatus; work_date: string | null; submitted_at: string; completed_at: string | null; current_version: number; workflow_version_id: string };
type TaskRow = { id: string; request_id: string; step_no: number; resolver: StepResolver; assignee_employee_id: string | null; status: StepStatus; due_at: string | null; acted_by: string | null; acted_at: string | null; comment: string | null };
const REQ_COLS = "id, tenant_id, request_no, request_type, requester_employee_id, status, work_date, submitted_at, completed_at, current_version, workflow_version_id";
const TASK_COLS = "id, request_id, step_no, resolver, assignee_employee_id, status, due_at, acted_by, acted_at, comment";
const KINDS = Object.keys(EXPLANATION_KINDS) as ExplanationKind[];
const RESOLVERS = Object.keys(STEP_RESOLVERS) as StepResolver[];
const TYPES = Object.keys(REQUEST_TYPES) as Array<RequestItem["type"]>;
/* Quyền xác định người duyệt các bước không chỉ định người (theo phạm vi người gửi) */
/* Bỏ dấu để tìm theo tên không dấu */
const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUIDV = /^[0-9a-f-]{36}$/i;
/* Tham số lọc danh sách đơn (query string) → bộ lọc đã kiểm */
export function parseQueueFilter(q: Record<string, string | undefined>): RequestQueueFilter {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[], what: string): T | undefined => {
    if (v === undefined || v === "") return undefined;
    if (!(allowed as readonly string[]).includes(v)) throw invalid(`${what} không hợp lệ.`);
    return v as T;
  };
  const day = (v: string | undefined, what: string) => { if (!v) return undefined; if (!DAY.test(v)) throw invalid(`${what} phải có dạng YYYY-MM-DD.`); return v; };
  const id = (v: string | undefined, what: string) => { if (!v) return undefined; if (!UUIDV.test(v)) throw invalid(`${what} không hợp lệ.`); return v; };
  const int = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) ? Number(v) : undefined);
  const f: RequestQueueFilter = {
    status: pick(q.status === "rejected" || q.status === "cancelled" ? "closed" : q.status, ["pending", "approved", "closed", "all"] as const, "Trạng thái"),
    type: pick(q.type, Object.keys(REQUEST_TYPES) as RequestItem["type"][], "Loại đơn"),
    departmentId: id(q.departmentId, "Phòng ban"), employeeId: id(q.employeeId, "Nhân viên"),
    from: day(q.from, "Từ ngày"), to: day(q.to, "Đến ngày"), dateBy: pick(q.dateBy, ["applied", "submitted"] as const, "Kiểu ngày"),
    only: pick(q.only, ["mine", "overdue"] as const, "Bộ lọc"), q: q.q?.slice(0, 100), page: int(q.page), pageSize: int(q.pageSize),
  };
  if (f.from && f.to && f.from > f.to) throw invalid("Từ ngày phải trước đến ngày.");
  return f;
}

const STATUS_TEXT: Record<RequestStatus, string> = { pending: "Đang chờ", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã hủy" };
const STEP_TEXT: Record<string, string> = { pending: "đang chờ", waiting: "chưa tới", approved: "đã duyệt", rejected: "từ chối", cancelled: "dừng" };
/* Ngày cuối tháng YYYY-MM */
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number) as [number, number]; return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`; };
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} đ`;
/* Nội dung đơn một dòng cho file xuất */
function summaryOf(i: RequestItem): string {
  switch (i.type) {
    case "explanation": return `${EXPLANATION_KINDS[i.payload.kind]}${i.payload.clockIn ? ` · vào ${i.payload.clockIn}` : ""}${i.payload.clockOut ? ` · ra ${i.payload.clockOut}` : ""}`;
    case "leave": return `${i.payload.leaveTypeName} · ${i.payload.days} ngày${i.payload.half !== "full" ? ` (${i.payload.half === "am" ? "sáng" : "chiều"})` : ""}`;
    case "overtime": return `${i.payload.start}–${i.payload.end} · ${i.payload.hours} giờ · ${i.payload.ratePercent}%`;
    case "salary_advance": return `${vnd(i.payload.amount)} · trừ lương tháng ${i.payload.month}`;
    case "profile_change": return `Sửa ${i.payload.fields.map((k) => PROFILE_FIELDS[k]).join(", ")}`;
  }
}

type AttachmentRow = { id: string; request_id: string; storage_path: string; file_name: string; mime_type: RequestAttachment["type"]; size_bytes: number; created_at: string };
const ATT_COLS = "id, request_id, storage_path, file_name, mime_type, size_bytes, created_at";
const ATTACHABLE: Array<RequestItem["type"]> = ["explanation", "leave"];
const UUID = /^[0-9a-f-]{36}$/i;
const STEP_PERM = { hr: "request.hr_review", payroll: "salary_advance.process" } as const;
type Scopes = Record<keyof typeof STEP_PERM, Set<string>>;

export class RequestsService {
  private readonly files: PrivateFiles;
  constructor(private readonly sb: SupabaseGateway, private readonly timesheets: TimesheetService) { this.files = new PrivateFiles(sb, "request-attachments"); }

  private async audit(db: Db, v: Viewer, action: string, type: string, id: string | null, before: unknown, after: unknown, reason: string | null = null) {
    await db.from("audit_logs").insert({ tenant_id: v.tenantId, actor_user_id: v.userId, actor_type: "user", action, resource_type: type, resource_id: id, before_data: before, after_data: after, reason, correlation_id: v.correlationId });
  }

  /* Phiên bản luồng duyệt áp dụng cho ngày D */
  async workflowFor(db: Db, tenantId: string, type: string, on: string) {
    const { data } = await db.from("workflow_versions").select("id, version_no, steps, effective_from, workflow_definitions!inner(tenant_id, request_type)")
      .eq("workflow_definitions.tenant_id", tenantId).eq("workflow_definitions.request_type", type).lte("effective_from", on).order("effective_from", { ascending: false }).limit(1).maybeSingle();
    return data as { id: string; version_no: number; steps: WorkflowStepInput[] } | null;
  }

  /* Người duyệt từng bước. Bước quản lý không có người (không có quản lý, hoặc người gửi tự là người duyệt) thì bỏ qua;
     bước có daysOver chỉ áp dụng khi đơn nghỉ dài hơn (hoặc khi forceHr: nghỉ trước phép); không còn bước nào thì chuyển cho HR. */
  planSteps(steps: WorkflowStepInput[], requesterId: string, managerId: string | null, opts: { days?: number; amount?: number; forceHr?: boolean } = {}) {
    const out = steps.map((s, i) => {
      const assignee = s.resolver === "direct_manager" ? (managerId && managerId !== requesterId ? managerId : null) : null;
      const applies = (s.daysOver == null || (opts.days ?? 0) > s.daysOver || (s.resolver === "hr" && !!opts.forceHr)) && (s.amountOver == null || (opts.amount ?? 0) > s.amountOver);
      return { stepNo: i + 1, resolver: s.resolver, assigneeEmployeeId: assignee, slaHours: s.slaHours, status: !applies || (s.resolver === "direct_manager" && !assignee) ? "skipped" : "waiting" };
    });
    if (opts.forceHr && !out.some((t) => t.resolver === "hr" && t.status !== "skipped")) out.push({ stepNo: out.length + 1, resolver: "hr", assigneeEmployeeId: null, slaHours: 24, status: "waiting" });
    if (!out.some((t) => t.status !== "skipped")) out.push({ stepNo: out.length + 1, resolver: "hr", assigneeEmployeeId: null, slaHours: 24, status: "waiting" });
    const first = out.find((t) => t.status === "waiting");
    if (first) first.status = "pending";
    return out;
  }

  /* ---------- Nhân viên ---------- */
  /* Bảng công tháng của chính mình + lượt giải trình + người duyệt bước đầu (hiện trên form) */
  async myTimesheet(emp: EmployeeRow, month?: string): Promise<MyTimesheet> {
    const db = this.sb.admin;
    const m = month ?? (await this.timesheets.tenantClock(db, emp.tenant_id)).currentMonth;
    const built = await this.timesheets.build(emp.tenant_id, await this.lite(db, emp.tenant_id, [emp.id]), m);
    const sheet = built.sheets.get(emp.id)!;
    const wf = await this.workflowFor(db, emp.tenant_id, "explanation", built.today);
    const first = wf ? this.planSteps(wf.steps, emp.id, sheet.placement?.manager_employee_id ?? null).find((t) => t.status === "pending") : undefined;
    let approver: string | null = first ? STEP_RESOLVERS.hr : null;
    if (first?.assigneeEmployeeId) {
      const { data } = await db.from("employees").select("full_name").eq("id", first.assigneeEmployeeId).maybeSingle();
      approver = (data as { full_name: string } | null)?.full_name ?? null;
    }
    return { period: built.period, timezone: built.timezone, days: sheet.days, summary: sheet.summary, explanation: sheet.quota, approver };
  }

  async createExplanation(emp: EmployeeRow, b: Body, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    const workDate = date(b, "workDate")!;
    const kind = oneOf(b, "kind", KINDS)!;
    const clockIn = time(b, "clockIn", true) ?? null, clockOut = time(b, "clockOut", true) ?? null;
    const reason = req(b, "reason", { min: 5, max: 1000, hint: "mô tả ít nhất 5 ký tự" });
    if ((kind === "missing_in" || kind === "late") && !clockIn) throw invalid("Nhập giờ vào đề nghị ghi nhận.");
    if ((kind === "missing_out" || kind === "early") && !clockOut) throw invalid("Nhập giờ ra đề nghị ghi nhận.");
    if (!clockIn && !clockOut) throw invalid("Nhập giờ vào hoặc giờ ra đề nghị ghi nhận.");
    if (clockIn && clockOut && clockOut <= clockIn) throw invalid("Giờ ra phải sau giờ vào.");

    const clock = await this.timesheets.tenantClock(db, emp.tenant_id);
    if (workDate > clock.today) throw invalid("Chưa tới ngày này.");
    const month = monthOf(workDate, clock.periodStartDay);
    const lite = await this.lite(db, emp.tenant_id, [emp.id]);
    const built = await this.timesheets.build(emp.tenant_id, lite, month);
    const sheet = built.sheets.get(emp.id)!;
    const day = sheet.days.find((d) => d.date === workDate);
    if (built.period.locked) throw conflict("Kỳ công này đã khóa, không gửi giải trình được. Liên hệ phòng Nhân sự.");
    if (!sheet.quota) throw conflict("Công ty chưa áp dụng quy định giải trình cho bạn.");
    if (!day || day.kind !== "work" || !day.issue) throw invalid("Ngày này không có bất thường cần giải trình.");
    if (day.request && (day.request.status === "pending" || day.request.status === "approved")) throw conflict(`Ngày này đã có giải trình ${day.request.no}.`);
    if (sheet.quota.left <= 0) throw conflict(`Đã dùng hết ${sheet.quota.limit} lượt giải trình của kỳ này.`);
    if (!day.explainDeadline || clock.today > day.explainDeadline) throw conflict(`Đã quá hạn giải trình (hạn ${day.explainDeadline}).`);

    const wf = await this.workflowFor(db, emp.tenant_id, "explanation", clock.today);
    if (!wf) throw conflict("Công ty chưa cấu hình luồng duyệt giải trình.");
    const tasks = this.planSteps(wf.steps, emp.id, sheet.placement?.manager_employee_id ?? null);
    const rule = built.index.resolveRules(emp.id, sheet.placement, clock.today).explanation ?? null;
    const { data, error } = await db.rpc("create_request", {
      p_tenant: emp.tenant_id, p_prefix: "GT", p_type: "explanation", p_employee: emp.id, p_user: emp.user_id, p_workflow_version: wf.id,
      p_work_date: workDate, p_period_start: built.period.start,
      p_payload: { kind, clockIn, clockOut, reason },
      p_snapshot: { explanation: rule && { policyId: rule.policyId, versionNo: rule.versionNo, config: rule.config, source: rule.source }, workflow: { versionNo: wf.version_no, steps: wf.steps }, day: { rawIn: day.rawIn, rawOut: day.rawOut, shift: day.shift, issue: day.issue } },
      p_tasks: tasks,
    });
    if (error?.code === "23505") throw conflict("Ngày này đã có giải trình đang chờ hoặc đã duyệt.");
    if (error) throw error;
    const r = data as { id: string; no: string };
    const v: Viewer = { userId: emp.user_id ?? "", employeeId: emp.id, tenantId: emp.tenant_id, correlationId };
    await this.audit(db, v, "request.submitted", "request", r.id, null, { no: r.no, type: "explanation", work_date: workDate, kind, clock_in: clockIn, clock_out: clockOut });
    return (await this.items(db, v, [r.id]))[0]!;
  }

  async mine(emp: EmployeeRow, correlationId: string): Promise<RequestItem[]> {
    const db = this.sb.admin;
    const { data } = await db.from("requests").select("id").eq("tenant_id", emp.tenant_id).eq("requester_employee_id", emp.id).order("submitted_at", { ascending: false }).limit(100);
    return this.items(db, { userId: emp.user_id ?? "", employeeId: emp.id, tenantId: emp.tenant_id, correlationId }, ((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  }

  async cancel(emp: EmployeeRow, id: string, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("đơn");
    const { error } = await db.rpc("cancel_request", { p_request: id, p_employee: emp.id });
    if (error?.message?.includes("REQUEST_NOT_FOUND")) throw notFound("đơn");
    if (error?.message?.includes("REQUEST_NOT_PENDING")) throw conflict("Đơn đã được xử lý, không hủy được.");
    if (error) throw error;
    const v: Viewer = { userId: emp.user_id ?? "", employeeId: emp.id, tenantId: emp.tenant_id, correlationId };
    await this.audit(db, v, "request.cancelled", "request", id, { status: "pending" }, { status: "cancelled" });
    return (await this.items(db, v, [id]))[0]!;
  }

  /* ---------- Duyệt (mobile + web) ---------- */
  /* Nhân viên mà người xem được duyệt ở các bước theo quyền: HR (request.hr_review), Kế toán (salary_advance.process) */
  private async scopes(db: Db, v: Viewer): Promise<Scopes> {
    const of = async (perm: string) => {
      const { data } = await db.rpc("scoped_employees", { p_user: v.userId, p_tenant: v.tenantId, p_perm: perm }).select("id");
      return new Set(((data ?? []) as unknown as Array<{ id: string }>).map((e) => e.id));
    };
    const [hr, payroll] = await Promise.all([of(STEP_PERM.hr), of(STEP_PERM.payroll)]);
    return { hr, payroll };
  }

  private actionable(v: Viewer, task: TaskRow, requesterId: string, sc: Scopes) {
    if (task.status !== "pending" || requesterId === v.employeeId) return false;
    return task.resolver === "direct_manager" ? !!v.employeeId && task.assignee_employee_id === v.employeeId : sc[task.resolver].has(requesterId);
  }

  async approvals(v: Viewer): Promise<MyApprovals> {
    const db = this.sb.admin;
    const sc = await this.scopes(db, v);
    const [{ data: mgr }, { count: reports }] = await Promise.all([
      v.employeeId ? db.from("approval_tasks").select("request_id").eq("tenant_id", v.tenantId).eq("status", "pending").eq("resolver", "direct_manager").eq("assignee_employee_id", v.employeeId) : Promise.resolve({ data: [] }),
      v.employeeId ? db.from("employee_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", v.tenantId).eq("manager_employee_id", v.employeeId).is("effective_to", null) : Promise.resolve({ count: 0 }),
    ]);
    let ids = ((mgr ?? []) as Array<{ request_id: string }>).map((t) => t.request_id);
    for (const resolver of ["hr", "payroll"] as const) {
      if (!sc[resolver].size) continue;
      const { data: tasks } = await db.from("approval_tasks").select("request_id, requests!inner(requester_employee_id)").eq("tenant_id", v.tenantId).eq("status", "pending").eq("resolver", resolver);
      ids = ids.concat(((tasks ?? []) as unknown as Array<{ request_id: string; requests: { requester_employee_id: string } }>)
        .filter((t) => sc[resolver].has(t.requests.requester_employee_id) && t.requests.requester_employee_id !== v.employeeId).map((t) => t.request_id));
    }
    const items = (await this.items(db, v, [...new Set(ids)], sc)).filter((i) => i.myTaskId);
    return { canApprove: sc.hr.size > 0 || sc.payroll.size > 0 || (reports ?? 0) > 0 || items.length > 0, items: items.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)) };
  }

  async decide(v: Viewer, taskId: string, approve: boolean, b: Body): Promise<RequestItem> {
    const db = this.sb.admin;
    if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw notFound("bước duyệt");
    const { data: t } = await db.from("approval_tasks").select(`${TASK_COLS}, requests!inner(tenant_id, requester_employee_id, request_no)`).eq("id", taskId).eq("tenant_id", v.tenantId).maybeSingle();
    const task = t as (TaskRow & { requests: { tenant_id: string; requester_employee_id: string; request_no: string } }) | null;
    if (!task) throw notFound("bước duyệt");
    const comment = typeof b?.comment === "string" ? b.comment.trim().slice(0, 1000) || null : null;
    if (!approve && (!comment || comment.length < 5)) throw invalid("Ghi lý do từ chối (ít nhất 5 ký tự).");
    if (task.requests.requester_employee_id === v.employeeId) throw forbidden("Không tự duyệt đơn của chính mình.");
    const sc = task.resolver === "direct_manager" ? { hr: new Set<string>(), payroll: new Set<string>() } : await this.scopes(db, v);
    if (!this.actionable(v, task, task.requests.requester_employee_id, sc)) {
      if (task.status !== "pending") throw conflict("Bước này đã được xử lý hoặc chưa tới lượt.");
      throw forbidden("Bạn không phải người duyệt bước này.");
    }
    const { data, error } = await db.rpc("decide_approval", { p_task: taskId, p_actor: v.userId, p_approve: approve, p_comment: comment });
    if (error?.message?.includes("TASK_NOT_PENDING")) throw conflict("Bước này vừa được người khác xử lý.");
    if (error?.message?.includes("PERIOD_LOCKED")) throw conflict("Kỳ công của ngày này đã khóa. Mở lại kỳ công trước khi duyệt.");
    if (error?.message?.includes("ATTACHMENT_REQUIRED")) throw conflict("Đơn cần minh chứng nhưng nhân viên chưa đính kèm. Nhắc nhân viên bổ sung trên app, hoặc từ chối đơn.");
    if (error) throw error;
    await this.audit(db, v, approve ? "approval.approved" : "approval.rejected", "request", task.request_id, { step: task.step_no, status: "pending" }, { step: task.step_no, result: data, no: task.requests.request_no }, comment);
    return (await this.items(db, v, [task.request_id]))[0]!;
  }

  /* ---------- Minh chứng ---------- */
  /* Người gửi tải lên khi đơn đang chờ; SQL kiểm lại loại đơn, trạng thái và số file (khóa dòng đơn) */
  async attach(emp: EmployeeRow, id: string, b: Body, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    if (!UUID.test(id)) throw notFound("đơn");
    const { data: r } = await db.from("requests").select("id, requester_employee_id, request_no").eq("id", id).eq("tenant_id", emp.tenant_id).maybeSingle();
    if (!r || (r as { requester_employee_id: string }).requester_employee_id !== emp.id) throw notFound("đơn");
    const fileName = safeName(req(b, "fileName", { max: 200 }));
    const raw = req(b, "dataBase64", { max: Math.ceil(FILE_MAX_BYTES * 1.4) });
    const data = Buffer.from(raw, "base64");
    if (!data.length) throw invalid("File trống.");
    if (data.length > FILE_MAX_BYTES) throw invalid("File tối đa 5 MB.");
    const type = sniffFile(data);
    if (!type) throw invalid("Chỉ nhận PDF hoặc ảnh PNG, JPEG, WebP.");
    const path = await this.files.put(emp.tenant_id, id, data, type);
    const { data: row, error } = await db.from("request_attachments").insert({ tenant_id: emp.tenant_id, request_id: id, storage_path: path, file_name: fileName, mime_type: type,
      size_bytes: data.length, sha256: sha256(data), created_by: emp.user_id }).select("id").single();
    if (error) {
      await this.files.remove(path);
      if (error.message.includes("REQUEST_NOT_PENDING")) throw conflict("Đơn đã được xử lý, không thêm minh chứng được.");
      if (error.message.includes("ATTACHMENT_LIMIT")) throw conflict(`Mỗi đơn tối đa ${REQUEST_ATTACHMENT_MAX} file minh chứng.`);
      if (error.message.includes("ATTACHMENT_NOT_ALLOWED")) throw invalid("Loại đơn này không đính kèm minh chứng.");
      throw error;
    }
    const v: Viewer = { userId: emp.user_id ?? "", employeeId: emp.id, tenantId: emp.tenant_id, correlationId };
    await this.audit(db, v, "request.attachment_added", "request", id, null, { no: (r as { request_no: string }).request_no, attachmentId: (row as { id: string }).id, type, bytes: data.length });
    return (await this.items(db, v, [id]))[0]!;
  }

  /* App: người gửi, quản lý được giao một bước của đơn, hoặc người duyệt theo quyền (HR/Kế toán) với người gửi */
  private async attachmentFor(v: Viewer, id: string, attId: string) {
    const db = this.sb.admin;
    if (!UUID.test(id) || !UUID.test(attId)) throw notFound("minh chứng");
    const [{ data: r }, { data: a }] = await Promise.all([
      db.from("requests").select("id, requester_employee_id, request_no").eq("id", id).eq("tenant_id", v.tenantId).maybeSingle(),
      db.from("request_attachments").select(ATT_COLS).eq("id", attId).eq("request_id", id).eq("tenant_id", v.tenantId).maybeSingle(),
    ]);
    if (!r || !a) throw notFound("minh chứng");
    const rq = r as { requester_employee_id: string; request_no: string };
    let ok = rq.requester_employee_id === v.employeeId;
    if (!ok && v.employeeId) {
      const { count } = await db.from("approval_tasks").select("id", { count: "exact", head: true }).eq("request_id", id).eq("assignee_employee_id", v.employeeId);
      ok = (count ?? 0) > 0;
    }
    if (!ok) { const sc = await this.scopes(db, v); ok = sc.hr.has(rq.requester_employee_id) || sc.payroll.has(rq.requester_employee_id); }
    if (!ok) throw notFound("minh chứng");
    return { att: a as AttachmentRow, no: rq.request_no };
  }

  /* Liên kết 5 phút để app mở file bằng trình duyệt hệ thống; đường dẫn tương đối với /api/v1 */
  async attachmentLink(v: Viewer, id: string, attId: string): Promise<{ path: string; expiresAt: string }> {
    await this.attachmentFor(v, id, attId);
    const { exp, sig } = signLink("request_attachment", attId, v.employeeId!, Date.now());
    return { path: `me/requests/${id}/attachments/${attId}/file?e=${v.employeeId}&exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /* Tải theo liên kết đã ký: kiểm chữ ký rồi kiểm lại quyền (người xem có thể vừa mất quyền) */
  async linkedAttachment(id: string, attId: string, employeeId: string, exp: number, sig: string, correlationId: string) {
    if (!UUID.test(attId) || !UUID.test(employeeId) || !checkLink("request_attachment", attId, employeeId, exp, sig)) throw notFound("minh chứng");
    const { data: e } = await this.sb.admin.from("employees").select("id, tenant_id, user_id, status").eq("id", employeeId).maybeSingle();
    const emp = e as { id: string; tenant_id: string; user_id: string | null; status: string } | null;
    if (!emp || emp.status === "terminated") throw notFound("minh chứng");
    const v: Viewer = { userId: emp.user_id ?? "", employeeId: emp.id, tenantId: emp.tenant_id, correlationId };
    const { att, no } = await this.attachmentFor(v, id, attId);
    return this.readAttachment(v, att, no, "app");
  }

  /* Web HR: người có request.read với người gửi */
  async adminAttachment(ctx: AdminContext, id: string, attId: string) {
    const r = await this.detail(ctx, id);
    const a = r.attachments.find((x) => x.id === attId);
    if (!a) throw notFound("minh chứng");
    const { data } = await ctx.db.from("request_attachments").select(ATT_COLS).eq("id", attId).single();
    return this.readAttachment(viewerOf(ctx), data as AttachmentRow, r.no, "web");
  }

  private async readAttachment(v: Viewer, a: AttachmentRow, no: string, by: "app" | "web") {
    const data = await this.files.get(a.storage_path);
    if (!data) throw notFound("file minh chứng");
    await this.audit(this.sb.admin, v, "request.attachment_downloaded", "request", a.request_id, null, { no, attachmentId: a.id, by });
    return { data, contentType: a.mime_type, name: a.file_name };
  }

  /* ---------- Web HR ---------- */
  /* Đơn trong phạm vi request.read theo bộ lọc (trừ trạng thái): trả kèm ngày áp dụng để lọc/đối chiếu. Lọc trong bộ nhớ API như các bảng
     khác (đủ cho vài nghìn đơn); chỉ nạp chi tiết (bước duyệt, người duyệt) cho trang đang xem hoặc khi xuất file. */
  private async filtered(ctx: AdminContext, f: RequestQueueFilter) {
    ctx.require("request.read");
    const db = ctx.db;
    const [scope, clock] = await Promise.all([ctx.scopedEmployeeIds("request.read"), this.timesheets.tenantClock(db, ctx.tenantId)]);
    type Row = { id: string; request_no: string; request_type: RequestItem["type"]; requester_employee_id: string; status: RequestStatus; work_date: string | null; submitted_at: string; current_version: number };
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      let q = db.from("requests").select("id, request_no, request_type, requester_employee_id, status, work_date, submitted_at, current_version").eq("tenant_id", ctx.tenantId)
        .order("submitted_at", { ascending: false }).range(from, from + 999);
      if (f.type) q = q.eq("request_type", f.type);
      if (f.employeeId) q = q.eq("requester_employee_id", f.employeeId);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...(data ?? []) as Row[]);
      if ((data ?? []).length < 1000) break;
    }
    let list = rows.filter((r) => scope.has(r.requester_employee_id));
    /* Ngày áp dụng: nghỉ phép từ–đến, tạm ứng theo tháng khấu trừ (đọc nội dung đơn) */
    const needPayload = list.filter((r) => r.request_type === "leave" || r.request_type === "salary_advance");
    const payload = new Map<string, { from?: string; to?: string; month?: string }>();
    for (let k = 0; k < needPayload.length; k += 200) {
      const chunk = needPayload.slice(k, k + 200);
      const { data } = await db.from("request_versions").select("request_id, version_no, payload").in("request_id", chunk.map((r) => r.id));
      for (const x of (data ?? []) as Array<{ request_id: string; version_no: number; payload: { from?: string; to?: string; month?: string } }>) {
        if (chunk.find((r) => r.id === x.request_id)?.current_version === x.version_no) payload.set(x.request_id, x.payload);
      }
    }
    const applied = (r: Row): { from: string; to: string } | null => {
      if (r.request_type === "leave") { const pl = payload.get(r.id); return pl?.from ? { from: pl.from, to: pl.to ?? pl.from } : r.work_date ? { from: r.work_date, to: r.work_date } : null; }
      if (r.request_type === "salary_advance") { const m = payload.get(r.id)?.month; return m ? { from: `${m}-01`, to: lastDay(m) } : null; }
      return r.work_date ? { from: r.work_date, to: r.work_date } : null;
    };
    const submittedDay = (r: Row) => localParts(r.submitted_at, clock.timezone).date;
    if (f.from || f.to) {
      const lo = f.from ?? "0000-01-01", hi = f.to ?? "9999-12-31";
      list = list.filter((r) => {
        const a = f.dateBy === "submitted" ? null : applied(r);
        const [x, y] = a ? [a.from, a.to] : [submittedDay(r), submittedDay(r)];
        return x <= hi && y >= lo;
      });
    }
    if (f.departmentId) {
      const places = await loadPlacements(db, ctx.tenantId, clock.today, [...new Set(list.map((r) => r.requester_employee_id))]);
      list = list.filter((r) => places.get(r.requester_employee_id)?.department_id === f.departmentId);
    }
    if (f.q?.trim()) {
      const ids = [...new Set(list.map((r) => r.requester_employee_id))];
      const names = new Map<string, string>();
      for (let k = 0; k < ids.length; k += 200) {
        const { data } = await db.from("employees").select("id, employee_code, full_name").in("id", ids.slice(k, k + 200));
        for (const e of (data ?? []) as Array<{ id: string; employee_code: string; full_name: string }>) names.set(e.id, `${e.employee_code} ${e.full_name}`);
      }
      const k = fold(f.q.trim());
      list = list.filter((r) => fold(`${r.request_no} ${names.get(r.requester_employee_id) ?? ""}`).includes(k));
    }
    return { list, applied, clock };
  }

  /* Lấy chi tiết theo lô (tránh câu truy vấn quá dài) và thêm hạn/quá hạn + ngày áp dụng */
  private async queueItems(db: Db, v: Viewer, rows: Array<{ id: string }>, applied: (r: never) => { from: string; to: string } | null, sc?: Scopes): Promise<RequestQueueItem[]> {
    const out: RequestQueueItem[] = [];
    const now = new Date().toISOString();
    for (let k = 0; k < rows.length; k += 200) {
      const chunk = rows.slice(k, k + 200);
      const items = await this.items(db, v, chunk.map((r) => r.id), sc);
      for (const i of items) {
        const cur = i.steps.find((s) => s.status === "pending");
        out.push({ ...i, dueAt: cur?.dueAt ?? null, overdue: !!cur?.dueAt && cur.dueAt < now, applied: applied(chunk.find((r) => r.id === i.id) as never) });
      }
    }
    return out;
  }

  async queue(ctx: AdminContext, f: RequestQueueFilter): Promise<RequestQueue> {
    const { list, applied } = await this.filtered(ctx, f);
    const v = viewerOf(ctx), db = ctx.db;
    const bucket = (st: RequestStatus) => (st === "rejected" || st === "cancelled" ? "closed" : st);
    /* Đơn đang chờ luôn nạp đủ để đếm "chờ tôi duyệt"/"quá hạn" và sắp xếp: thường ít */
    const sc = await this.scopes(db, v);
    const pending = await this.queueItems(db, v, list.filter((r) => r.status === "pending"), applied, sc);
    const counts = {
      pending: pending.length, approved: list.filter((r) => r.status === "approved").length, closed: list.filter((r) => bucket(r.status) === "closed").length,
      all: list.length, mine: pending.filter((i) => i.myTaskId).length, overdue: pending.filter((i) => i.overdue).length,
    };
    const status = f.status ?? "pending", pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50)), page = Math.max(1, f.page ?? 1);
    let items: RequestQueueItem[];
    let total: number;
    if (status === "pending") {
      const sorted = pending.filter((i) => !f.only || (f.only === "mine" ? !!i.myTaskId : i.overdue))
        .sort((a, b) => Number(!!b.myTaskId) - Number(!!a.myTaskId) || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || b.submittedAt.localeCompare(a.submittedAt));
      total = sorted.length; items = sorted.slice((page - 1) * pageSize, page * pageSize);
    } else {
      const rows = list.filter((r) => status === "all" || bucket(r.status) === status);
      total = rows.length;
      items = await this.queueItems(db, v, rows.slice((page - 1) * pageSize, page * pageSize), applied, sc);
    }
    return { items, counts, total, page, pageSize };
  }

  /* CSV theo bộ lọc (UTF-8 có BOM để Excel đọc đúng tiếng Việt); ghi nhật ký request.exported */
  async exportCsv(ctx: AdminContext, f: RequestQueueFilter): Promise<{ filename: string; body: string }> {
    const { list, applied, clock } = await this.filtered(ctx, f);
    const status = f.status ?? "all";
    const rows = list.filter((r) => status === "all" || (status === "closed" ? r.status === "rejected" || r.status === "cancelled" : r.status === status));
    const items = await this.queueItems(ctx.db, viewerOf(ctx), rows, applied);
    const esc = (x: unknown) => { const t = String(x ?? ""); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const at = (iso: string | null) => (iso ? `${localParts(iso, clock.timezone).date} ${String(Math.floor(localParts(iso, clock.timezone).minutes / 60)).padStart(2, "0")}:${String(localParts(iso, clock.timezone).minutes % 60).padStart(2, "0")}` : "");
    const head = ["Mã đơn", "Mã NV", "Họ tên", "Phòng ban", "Loại đơn", "Áp dụng từ", "Áp dụng đến", "Nội dung", "Lý do", "Trạng thái", "Gửi lúc", "Hoàn tất lúc", "Các bước duyệt", "Minh chứng"];
    const lines = items.map((i) => [i.no, i.requester.code, i.requester.fullName, i.requester.department ?? "", REQUEST_TYPES[i.type], i.applied?.from ?? "", i.applied?.to ?? "",
      summaryOf(i), i.payload.reason ?? "", STATUS_TEXT[i.status], at(i.submittedAt), at(i.completedAt),
      i.steps.filter((s) => s.status !== "skipped").map((s) => `${STEP_RESOLVERS[s.resolver]}: ${STEP_TEXT[s.status] ?? s.status}${s.actedBy ? ` (${s.actedBy} ${at(s.actedAt)})` : ""}${s.comment ? ` – ${s.comment}` : ""}`).join(" | "),
      i.attachments.length].map(esc).join(","));
    await ctx.audit("request.exported", "request", null, null, { rows: items.length, filter: f });
    return { filename: `don-tu-${clock.today}.csv`, body: "\uFEFF" + [head.join(","), ...lines].join("\r\n") + "\r\n" };
  }

  async detail(ctx: AdminContext, id: string): Promise<RequestItem> {
    ctx.require("request.read");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("đơn");
    const { data } = await ctx.db.from("requests").select("requester_employee_id").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!data) throw notFound("đơn");
    await ctx.requireEmployee("request.read", (data as { requester_employee_id: string }).requester_employee_id);
    return (await this.items(ctx.db, viewerOf(ctx), [id]))[0]!;
  }

  async workflows(ctx: AdminContext): Promise<WorkflowDef[]> {
    ctx.require("request.read");
    const { data } = await ctx.db.from("workflow_definitions").select("request_type, name, workflow_versions(version_no, steps, effective_from, note, created_at)").eq("tenant_id", ctx.tenantId);
    const today = (await this.timesheets.tenantClock(ctx.db, ctx.tenantId)).today;
    return ((data ?? []) as unknown as Array<{ request_type: RequestItem["type"]; name: string; workflow_versions: Array<{ version_no: number; steps: WorkflowStepInput[]; effective_from: string; note: string | null; created_at: string }> }>).map((w) => {
      const vs = [...w.workflow_versions].sort((a, b) => b.version_no - a.version_no);
      const cur = vs.filter((x) => x.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
      return {
        requestType: w.request_type, name: w.name,
        current: cur ? { versionNo: cur.version_no, steps: cur.steps, effectiveFrom: cur.effective_from } : null,
        versions: vs.map((x) => ({ versionNo: x.version_no, steps: x.steps, effectiveFrom: x.effective_from, note: x.note, createdAt: x.created_at })),
      };
    });
  }

  /* Đổi luồng duyệt = phiên bản mới từ hôm nay trở đi; đơn đã gửi giữ luồng lúc gửi */
  async addWorkflowVersion(ctx: AdminContext, type: string, b: Body): Promise<WorkflowDef[]> {
    ctx.requireTenantWide("workflow.manage");
    if (!TYPES.includes(type as RequestItem["type"])) throw notFound("luồng duyệt");
    const raw = b?.steps;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) throw invalid("Luồng duyệt có từ 1 đến 5 bước.");
    const steps: WorkflowStepInput[] = raw.map((s, i) => ({
      resolver: oneOf(s as Body, "resolver", RESOLVERS)!,
      slaHours: number(s as Body, "slaHours", 1, 240, { integer: true }) ?? (() => { throw invalid(`Bước ${i + 1}: hạn xử lý phải từ 1 đến 240 giờ.`); })(),
      /* Chỉ đơn nghỉ có số ngày để đặt điều kiện */
      ...(type === "leave" && (s as Body)?.daysOver != null ? { daysOver: number(s as Body, "daysOver", 0, 30, { integer: true })! } : {}),
      /* Chỉ đơn tạm ứng có số tiền để đặt điều kiện */
      ...(type === "salary_advance" && (s as Body)?.amountOver != null ? { amountOver: number(s as Body, "amountOver", 0, 1_000_000_000, { integer: true })! } : {}),
    }));
    if (steps.every((s) => s.daysOver != null || s.amountOver != null)) throw invalid("Cần ít nhất một bước luôn áp dụng (không đặt điều kiện).");
    if (type === "salary_advance" && !steps.some((s) => s.resolver === "payroll")) throw invalid("Luồng tạm ứng phải có bước Kế toán (người chi tiền).");
    if (type !== "salary_advance" && steps.some((s) => s.resolver === "payroll")) throw invalid("Bước Kế toán chỉ dùng cho đơn tạm ứng.");
    if (new Set(steps.map((s) => s.resolver)).size !== steps.length) throw invalid("Mỗi loại người duyệt chỉ xuất hiện một lần.");
    const today = (await this.timesheets.tenantClock(ctx.db, ctx.tenantId)).today;
    const effectiveFrom = date(b, "effectiveFrom", true) ?? today;
    if (effectiveFrom < today) throw invalid("Luồng mới chỉ áp dụng từ hôm nay trở đi.");
    const { data: def } = await ctx.db.from("workflow_definitions").select("id, workflow_versions(version_no, effective_from, steps)").eq("tenant_id", ctx.tenantId).eq("request_type", type).single();
    const d = def as { id: string; workflow_versions: Array<{ version_no: number; effective_from: string; steps: WorkflowStepInput[] }> };
    if (d.workflow_versions.some((x) => x.effective_from === effectiveFrom)) throw conflict(`Đã có phiên bản hiệu lực từ ${effectiveFrom}.`);
    const no = Math.max(0, ...d.workflow_versions.map((x) => x.version_no)) + 1;
    const note = typeof b?.note === "string" ? b.note.trim().slice(0, 300) || null : null;
    const { error } = await ctx.db.from("workflow_versions").insert({ tenant_id: ctx.tenantId, workflow_id: d.id, version_no: no, steps, effective_from: effectiveFrom, note, created_by: ctx.userId });
    if (error) throw error;
    const prev = d.workflow_versions.sort((a, b2) => b2.version_no - a.version_no)[0];
    await ctx.audit("workflow.version_added", "workflow", d.id, prev ? { version_no: prev.version_no, steps: prev.steps } : null, { version_no: no, steps, effective_from: effectiveFrom });
    return this.workflows(ctx);
  }

  /* ---------- Dựng RequestItem ---------- */
  async items(db: Db, v: Viewer, ids: string[], scPre?: Scopes): Promise<RequestItem[]> {
    if (!ids.length) return [];
    const [{ data: rs }, { data: ts }, { data: vs }, { data: as }] = await Promise.all([
      db.from("requests").select(REQ_COLS).eq("tenant_id", v.tenantId).in("id", ids),
      db.from("approval_tasks").select(TASK_COLS).in("request_id", ids).order("step_no"),
      db.from("request_versions").select("request_id, version_no, payload, policy_snapshot").in("request_id", ids),
      db.from("request_attachments").select(ATT_COLS).eq("tenant_id", v.tenantId).in("request_id", ids).order("created_at"),
    ]);
    const atts = new Map<string, RequestAttachment[]>();
    for (const a of (as ?? []) as AttachmentRow[]) atts.set(a.request_id, [...(atts.get(a.request_id) ?? []), { id: a.id, name: a.file_name, type: a.mime_type, size: a.size_bytes, createdAt: a.created_at }]);
    const rows = (rs ?? []) as RequestRow[];
    const tasks = (ts ?? []) as TaskRow[];
    const empIds = new Set<string>([...rows.map((r) => r.requester_employee_id), ...tasks.map((t) => t.assignee_employee_id).filter((x): x is string => !!x)]);
    const actorIds = [...new Set(tasks.map((t) => t.acted_by).filter((x): x is string => !!x))];
    const [{ data: es }, { data: actors }, { data: deps }] = await Promise.all([
      db.from("employees").select("id, employee_code, full_name").in("id", [...empIds]),
      actorIds.length ? db.from("employees").select("user_id, full_name").eq("tenant_id", v.tenantId).in("user_id", actorIds) : Promise.resolve({ data: [] }),
      db.from("employee_assignments").select("employee_id, effective_to, departments(name)").eq("tenant_id", v.tenantId).eq("is_primary", true).in("employee_id", rows.map((r) => r.requester_employee_id)).order("effective_from", { ascending: false }),
    ]);
    const emp = new Map(((es ?? []) as Array<{ id: string; employee_code: string; full_name: string }>).map((e) => [e.id, e]));
    const actor = new Map(((actors ?? []) as Array<{ user_id: string; full_name: string }>).map((e) => [e.user_id, e.full_name]));
    const dept = new Map<string, string>();
    for (const d of (deps ?? []) as unknown as Array<{ employee_id: string; effective_to: string | null; departments: { name: string } | null }>) if (!d.effective_to && !dept.has(d.employee_id)) dept.set(d.employee_id, d.departments?.name ?? "");
    const ver = new Map(((vs ?? []) as Array<{ request_id: string; version_no: number; payload: ExplanationPayload | LeavePayload | OvertimePayload | AdvancePayload; policy_snapshot: { attachmentRequired?: boolean; day?: { rawIn: string | null; rawOut: string | null; shift: { name: string; start: string; end: string } | null } } }>)
      .map((x) => [`${x.request_id}|${x.version_no}`, x]));
    const sc = scPre ?? (tasks.some((t) => t.resolver !== "direct_manager" && t.status === "pending") ? await this.scopes(db, v) : { hr: new Set<string>(), payroll: new Set<string>() });
    const advIds = rows.filter((r) => r.request_type === "salary_advance").map((r) => r.id);
    const { data: advs } = advIds.length ? await db.from("salary_advances").select("request_id, paid_at, paid_by, payout_note").in("request_id", advIds) : { data: [] };
    const payout = new Map(((advs ?? []) as Array<{ request_id: string; paid_at: string | null; paid_by: string | null; payout_note: string | null }>).map((a) => [a.request_id, a]));
    const payers = [...new Set([...payout.values()].map((a) => a.paid_by).filter((x): x is string => !!x && !actor.has(x)))];
    if (payers.length) {
      const { data: ps } = await db.from("employees").select("user_id, full_name").eq("tenant_id", v.tenantId).in("user_id", payers);
      for (const e of (ps ?? []) as Array<{ user_id: string; full_name: string }>) actor.set(e.user_id, e.full_name);
    }
    /* Sửa hồ sơ: số tài khoản mới đầy đủ chỉ cho người gửi và người có employee.sensitive.read với người gửi; còn lại 4 số cuối */
    const pcIds = rows.filter((r) => r.request_type === "profile_change").map((r) => r.id);
    const fullBank = new Map<string, string>();
    if (pcIds.length) {
      const { data: pb } = await db.from("profile_change_bank").select("request_id, account_no").in("request_id", pcIds);
      for (const x of (pb ?? []) as Array<{ request_id: string; account_no: string }>) {
        const r = rows.find((y) => y.id === x.request_id)!;
        const mine = r.requester_employee_id === v.employeeId;
        const ok = mine || (!!v.userId && (await db.rpc("employee_in_scope", { p_user: v.userId, p_tenant: v.tenantId, p_perm: "employee.sensitive.read", p_employee: r.requester_employee_id })).data === true);
        if (ok) fullBank.set(x.request_id, x.account_no);
      }
    }
    /* Đơn OT: chấm công thực tế của ngày làm thêm (đọc lúc xem, gồm cả đơn đang chờ) để đối chiếu */
    const otReq = rows.filter((r) => r.request_type === "overtime" && r.work_date);
    const clock = otReq.length ? await this.timesheets.tenantClock(db, v.tenantId) : null;
    const otPast = clock ? otReq.filter((r) => r.work_date! <= clock.today) : [];
    const seen = clock && otPast.length
      ? await this.timesheets.presence(db, v.tenantId, clock.timezone, [...new Set(otPast.map((r) => r.requester_employee_id))],
        otPast.reduce((m, r) => (r.work_date! < m ? r.work_date! : m), clock.today), otPast.reduce((m, r) => (r.work_date! > m ? r.work_date! : m), otPast[0]!.work_date!))
      : null;
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((r) => {
      const e = emp.get(r.requester_employee_id);
      const rt = tasks.filter((t) => t.request_id === r.id);
      const x = ver.get(`${r.id}|${r.current_version}`);
      const day = x?.policy_snapshot?.day;
      const steps: RequestStep[] = rt.map((t) => ({
        taskId: t.id, stepNo: t.step_no, resolver: t.resolver, status: t.status, dueAt: t.due_at, actedAt: t.acted_at, comment: t.comment,
        assignee: t.resolver === "direct_manager" ? (t.assignee_employee_id ? emp.get(t.assignee_employee_id)?.full_name ?? null : null) : STEP_RESOLVERS[t.resolver],
        actedBy: t.acted_by ? actor.get(t.acted_by) ?? "—" : null,
      }));
      const mine = rt.find((t) => this.actionable(v, t, r.requester_employee_id, sc));
      const typed = r.request_type === "leave"
        ? { type: "leave" as const, payload: (x?.payload ?? { leaveType: "", leaveTypeName: "Nghỉ phép", from: r.work_date ?? "", to: r.work_date ?? "", half: "full", days: 0, reason: "" }) as LeavePayload }
        : r.request_type === "salary_advance"
        ? { type: "salary_advance" as const, payload: (x?.payload ?? { amount: 0, month: "", reason: "" }) as AdvancePayload,
            payout: ((a) => (a?.paid_at ? { paidAt: a.paid_at, paidBy: a.paid_by ? actor.get(a.paid_by) ?? "—" : null, note: a.payout_note } : null))(payout.get(r.id)) }
        : r.request_type === "profile_change"
        ? { type: "profile_change" as const, payload: ((pl) => (fullBank.has(r.id) && pl.after.bank ? { ...pl, after: { ...pl.after, bank: { ...pl.after.bank, accountNo: fullBank.get(r.id)! } } } : pl))(
            (x?.payload ?? { fields: [], before: {}, after: {}, reason: null }) as unknown as ProfileChangePayload) }
        : r.request_type === "overtime"
        ? ((payload) => ({ type: "overtime" as const, payload,
            attendance: clock && payload.start && payload.end ? overtimeAttendance(payload.date, clock.today, payload.start, payload.end,
              seen?.events.get(`${r.requester_employee_id}|${payload.date}`) ?? [], seen?.adjustments.get(`${r.requester_employee_id}|${payload.date}`) ?? null) : null,
          }))((x?.payload ?? { date: r.work_date ?? "", start: "", end: "", hours: 0, dayKind: "workday", ratePercent: 150, reason: "" }) as OvertimePayload)
        : { type: "explanation" as const, payload: (x?.payload ?? { kind: "other", clockIn: null, clockOut: null, reason: "" }) as ExplanationPayload };
      return {
        id: r.id, no: r.request_no, ...typed, status: r.status, submittedAt: r.submitted_at, completedAt: r.completed_at, workDate: r.work_date,
        requester: { id: r.requester_employee_id, code: e?.employee_code ?? "", fullName: e?.full_name ?? "—", department: dept.get(r.requester_employee_id) || null },
        steps, day: day ? { rawIn: day.rawIn, rawOut: day.rawOut, shift: day.shift ? `${day.shift.name} ${day.shift.start}–${day.shift.end}` : null } : null,
        myTaskId: mine?.id ?? null, canCancel: r.status === "pending" && r.requester_employee_id === v.employeeId,
        attachments: atts.get(r.id) ?? [], attachmentRequired: !!x?.policy_snapshot?.attachmentRequired,
        canAttach: r.status === "pending" && r.requester_employee_id === v.employeeId && ATTACHABLE.includes(r.request_type) && (atts.get(r.id)?.length ?? 0) < REQUEST_ATTACHMENT_MAX,
      };
    });
  }

  async lite(db: Db, tenantId: string, ids: string[]): Promise<EmployeeLite[]> {
    const { data, error } = await db.from("employees").select(EMP_LITE).eq("tenant_id", tenantId).in("id", ids);
    if (error) throw error;
    return (data ?? []) as EmployeeLite[];
  }
}

export const viewerOf = (ctx: AdminContext): Viewer => ({ userId: ctx.userId, employeeId: ctx.actor?.id ?? null, tenantId: ctx.tenantId, correlationId: ctx.correlationId });
