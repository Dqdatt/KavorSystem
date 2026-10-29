/* Đơn từ + luồng duyệt (PILOT_RULEBOOK §6, §9). Bắt đầu từ giải trình công; loại đơn khác dùng cùng khung.
   - Gửi: kiểm tra ngày công có bất thường, còn lượt, còn hạn, kỳ chưa khóa; chụp lại quy định + luồng duyệt; tính người duyệt
     (quản lý trực tiếp; không có hoặc chính là người gửi thì bỏ bước); tạo đơn nguyên tử bằng hàm SQL.
   - Duyệt: người được giao (bước quản lý) hoặc người có request.hr_review với người gửi (bước HR); không ai tự duyệt đơn
     của mình. Chuyển bước nguyên tử bằng decide_approval; duyệt hết thì tạo điều chỉnh giờ công. */
import {
  EXPLANATION_KINDS, REQUEST_TYPES, STEP_RESOLVERS,
  type AdvancePayload, type ExplanationKind, type ExplanationPayload, type LeavePayload, type MyApprovals, type OvertimePayload, type MyTimesheet, type ProfileChangePayload, type RequestItem, type RequestQueue, type RequestStatus, type RequestStep, type StepResolver, type StepStatus,
  type WorkflowDef, type WorkflowStepInput,
} from "@kavor/contracts";
import type { EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import { date, number, oneOf, req, time, type Body } from "../admin/validate.js";
import { monthOf } from "./compute.js";
import { EMP_LITE, type EmployeeLite, type TimesheetService } from "./timesheet.service.js";

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
const STEP_PERM = { hr: "request.hr_review", payroll: "salary_advance.process" } as const;
type Scopes = Record<keyof typeof STEP_PERM, Set<string>>;

export class RequestsService {
  constructor(private readonly sb: SupabaseGateway, private readonly timesheets: TimesheetService) {}

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
    if (error) throw error;
    await this.audit(db, v, approve ? "approval.approved" : "approval.rejected", "request", task.request_id, { step: task.step_no, status: "pending" }, { step: task.step_no, result: data, no: task.requests.request_no }, comment);
    return (await this.items(db, v, [task.request_id]))[0]!;
  }

  /* ---------- Web HR ---------- */
  async queue(ctx: AdminContext, filter: { status?: string }): Promise<RequestQueue> {
    ctx.require("request.read");
    const db = ctx.db;
    const scope = await ctx.scopedEmployeeIds("request.read");
    let q = db.from("requests").select("id, requester_employee_id, status").eq("tenant_id", ctx.tenantId).order("submitted_at", { ascending: false }).limit(300);
    if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
    const { data } = await q;
    const ids = ((data ?? []) as Array<{ id: string; requester_employee_id: string }>).filter((r) => scope.has(r.requester_employee_id)).map((r) => r.id);
    const v = viewerOf(ctx);
    const items = await this.items(db, v, ids);
    const now = new Date().toISOString();
    const out = items.map((i) => {
      const cur = i.steps.find((s) => s.status === "pending");
      return { ...i, dueAt: cur?.dueAt ?? null, overdue: !!cur?.dueAt && cur.dueAt < now };
    }).sort((a, b) => Number(!!b.myTaskId) - Number(!!a.myTaskId) || Number(b.status === "pending") - Number(a.status === "pending") || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || b.submittedAt.localeCompare(a.submittedAt));
    return { items: out, counts: { pending: out.filter((i) => i.status === "pending").length, mine: out.filter((i) => i.myTaskId).length, overdue: out.filter((i) => i.overdue).length } };
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
    const [{ data: rs }, { data: ts }, { data: vs }] = await Promise.all([
      db.from("requests").select(REQ_COLS).eq("tenant_id", v.tenantId).in("id", ids),
      db.from("approval_tasks").select(TASK_COLS).in("request_id", ids).order("step_no"),
      db.from("request_versions").select("request_id, version_no, payload, policy_snapshot").in("request_id", ids),
    ]);
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
    const ver = new Map(((vs ?? []) as Array<{ request_id: string; version_no: number; payload: ExplanationPayload | LeavePayload | OvertimePayload | AdvancePayload; policy_snapshot: { day?: { rawIn: string | null; rawOut: string | null; shift: { name: string; start: string; end: string } | null } } }>)
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
        ? { type: "overtime" as const, payload: (x?.payload ?? { date: r.work_date ?? "", start: "", end: "", hours: 0, dayKind: "workday", ratePercent: 150, reason: "" }) as OvertimePayload }
        : { type: "explanation" as const, payload: (x?.payload ?? { kind: "other", clockIn: null, clockOut: null, reason: "" }) as ExplanationPayload };
      return {
        id: r.id, no: r.request_no, ...typed, status: r.status, submittedAt: r.submitted_at, completedAt: r.completed_at, workDate: r.work_date,
        requester: { id: r.requester_employee_id, code: e?.employee_code ?? "", fullName: e?.full_name ?? "—", department: dept.get(r.requester_employee_id) || null },
        steps, day: day ? { rawIn: day.rawIn, rawOut: day.rawOut, shift: day.shift ? `${day.shift.name} ${day.shift.start}–${day.shift.end}` : null } : null,
        myTaskId: mine?.id ?? null, canCancel: r.status === "pending" && r.requester_employee_id === v.employeeId,
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
