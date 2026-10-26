/* Tạm ứng lương (PILOT_RULEBOOK §9; PERMISSION_MATRIX "Payroll"):
   - Hạn mức = lương cơ bản hiện hành × % theo quy định tạm ứng (tra theo tầng), làm tròn xuống 10.000 ₫. Mỗi tháng một đơn,
     nhận đơn đến hết ngày quy định; không áp dụng cho thử việc / đang báo trước nghỉ việc nếu quy định nói vậy.
   - Đơn tạm ứng qua luồng duyệt (mẫu Quản lý → HR khi trên 5 triệu → Kế toán); duyệt xong Kế toán xác nhận đã chi (ghi chú chuyển khoản),
     nhân viên nhận thông báo. Khấu trừ vào lương tháng ứng — module payroll đọc salary_advances đã chi.
   - Lương cơ bản: chỉ người có compensation.read xem, compensation.manage nhập (phiên bản theo ngày hiệu lực, không sửa bản cũ).
     Nhật ký không ghi số tiền lương (HR/kiểm soát đọc được nhật ký hồ sơ). */
import type {
  AdvanceBoard, AdvancePolicy, AdvanceRow, CompensationBoard, CompensationRow, MyAdvance, RequestItem, ResolvedRule, StepResolver,
} from "@kavor/contracts";
import { STEP_RESOLVERS } from "@kavor/contracts";
import type { EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import { date, nullableText, number, type Body } from "../admin/validate.js";
import { PolicyIndex, loadPlacements } from "../attendance/policy.js";
import { monthOf, periodOf } from "../timesheet/compute.js";
import type { RequestsService, Viewer } from "../timesheet/requests.service.js";
import type { TimesheetService } from "../timesheet/timesheet.service.js";
import { bankView } from "../profile/profile.service.js";

type Db = SupabaseGateway["admin"];
type AdvRow = { request_id: string; employee_id: string; amount: number; deduct_month: string; paid_at: string | null; requests: { status: string; submitted_at: string } };
const STEP = 10_000;
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

export function advancePolicy(rule: ResolvedRule | undefined): AdvancePolicy | null {
  if (!rule) return null;
  const c = rule.config as Record<string, number | boolean>;
  return { name: rule.name, versionNo: rule.versionNo, enabled: c.enabled !== false, maxPercent: Number(c.maxPercent ?? 30), minAmount: Number(c.minAmount ?? 500_000), deadlineDay: Number(c.deadlineDay ?? 20) };
}

export class AdvanceService {
  constructor(private readonly sb: SupabaseGateway, private readonly timesheets: TimesheetService, private readonly requests: RequestsService) {}

  /* Lương cơ bản hiện hành (bản mới nhất đã hiệu lực) */
  private async baseSalary(db: Db, empId: string, on: string): Promise<number | null> {
    const { data } = await db.from("employee_compensations").select("base_salary").eq("employee_id", empId).lte("effective_from", on).order("effective_from", { ascending: false }).limit(1).maybeSingle();
    return data ? Number((data as { base_salary: number }).base_salary) : null;
  }

  /* Điều kiện + hạn mức của nhân viên hôm nay */
  private async state(db: Db, me: EmployeeRow) {
    const clock = await this.timesheets.tenantClock(db, me.tenant_id);
    const month = clock.today.slice(0, 7);
    const [index, placements, emp, base] = await Promise.all([
      PolicyIndex.load(db, me.tenant_id), loadPlacements(db, me.tenant_id, clock.today, [me.id]),
      db.from("employees").select("employment_type, status").eq("id", me.id).single(), this.baseSalary(db, me.id, clock.today),
    ]);
    const placement = placements.get(me.id) ?? null;
    const rule = index.resolveRules(me.id, placement, clock.today).salary_advance;
    const policy = advancePolicy(rule);
    const e = emp.data as { employment_type: string; status: string };
    const c = (rule?.config ?? {}) as Record<string, boolean>;
    const ineligible: [string, string] | null = !policy ? ["Công ty chưa áp dụng tạm ứng lương", "Liên hệ phòng Nhân sự nếu cần ứng lương."]
      : !policy.enabled ? ["Công ty chưa mở tạm ứng lương", "Liên hệ phòng Nhân sự nếu cần ứng lương."]
      : c.excludeProbation && e.employment_type === "probation" ? ["Chưa áp dụng cho nhân viên thử việc", "Bạn có thể tạm ứng sau khi ký hợp đồng chính thức."]
      : c.excludeNoticePeriod && e.status === "leaving" ? ["Không áp dụng trong thời gian báo trước nghỉ việc", "Lương cuối được thanh toán đủ theo quy trình nghỉ việc."]
      : base == null ? ["Chưa có lương cơ bản trên Kavor", "Kế toán chưa nhập lương cơ bản của bạn nên chưa tính được hạn mức. Liên hệ phòng Kế toán."]
      : null;
    const limit = policy && base ? Math.floor((base * policy.maxPercent) / 100 / STEP) * STEP : 0;
    /* Hạn nhận đơn: ngày quy định, tháng ngắn hơn thì ngày cuối tháng (31 = cuối tháng) */
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const deadline = policy ? `${month}-${String(Math.min(policy.deadlineDay, lastDay)).padStart(2, "0")}` : null;
    return { clock, month, placement, rule, policy, base, limit, ineligible, deadline, deadlinePassed: !!deadline && clock.today > deadline };
  }

  private async mine(db: Db, me: EmployeeRow, correlationId: string): Promise<RequestItem[]> {
    const { data } = await db.from("requests").select("id").eq("tenant_id", me.tenant_id).eq("request_type", "salary_advance").eq("requester_employee_id", me.id).order("submitted_at", { ascending: false }).limit(24);
    const v: Viewer = { userId: me.user_id ?? "", employeeId: me.id, tenantId: me.tenant_id, correlationId };
    return this.requests.items(db, v, ((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  }

  /* ---------- Nhân viên (mobile) ---------- */
  async myAdvance(me: EmployeeRow, correlationId: string): Promise<MyAdvance> {
    const db = this.sb.admin;
    const st = await this.state(db, me);
    const [history, wf] = await Promise.all([this.mine(db, me, correlationId), this.requests.workflowFor(db, me.tenant_id, "salary_advance", st.clock.today)]);
    const current = history.find((r) => r.type === "salary_advance" && r.payload.month === st.month && (r.status === "pending" || r.status === "approved")) ?? null;
    const approvers: string[] = [];
    if (wf) {
      for (const t of this.requests.planSteps(wf.steps, me.id, st.placement?.manager_employee_id ?? null, { amount: 0 })) {
        if (t.status === "skipped") continue;
        if (t.assigneeEmployeeId) {
          const { data } = await db.from("employees").select("full_name").eq("id", t.assigneeEmployeeId).maybeSingle();
          approvers.push((data as { full_name: string } | null)?.full_name ?? STEP_RESOLVERS.direct_manager);
        } else approvers.push(STEP_RESOLVERS[t.resolver as StepResolver]);
      }
    }
    return {
      today: st.clock.today, month: st.month, policy: st.policy, baseSalary: st.base, limit: st.limit, ineligible: st.ineligible, deadline: st.deadline, deadlinePassed: st.deadlinePassed,
      current, history, approvers, hrOverAmount: wf?.steps.find((s) => s.resolver === "hr")?.amountOver ?? null,
    };
  }

  async createAdvance(me: EmployeeRow, b: Body, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    const st = await this.state(db, me);
    if (st.ineligible) throw conflict(`${st.ineligible[0]}. ${st.ineligible[1]}`);
    const policy = st.policy!;
    if (st.deadlinePassed) throw conflict(`Đã qua hạn nhận đơn tạm ứng tháng ${monthLabel(st.month)} (đến hết ngày ${policy.deadlineDay}).`);
    const amount = number(b, "amount", 1, 10_000_000_000, { integer: true })!;
    if (amount % STEP) throw invalid("Số tiền theo bước 10.000 ₫.");
    if (amount < policy.minAmount) throw invalid(`Tối thiểu ${vnd(policy.minAmount)}.`);
    if (amount > st.limit) throw invalid(`Vượt hạn mức. Tối đa ${vnd(st.limit)} (${policy.maxPercent}% lương cơ bản).`);
    const reason = nullableText(b, "reason", 500) ?? "";

    const wf = await this.requests.workflowFor(db, me.tenant_id, "salary_advance", st.clock.today);
    if (!wf) throw conflict("Công ty chưa cấu hình luồng duyệt tạm ứng.");
    const tasks = this.requests.planSteps(wf.steps, me.id, st.placement?.manager_employee_id ?? null, { amount });
    const payload = { amount, month: st.month, reason };
    const { data, error } = await db.rpc("create_advance_request", {
      p_tenant: me.tenant_id, p_employee: me.id, p_user: me.user_id, p_workflow_version: wf.id,
      p_period_start: periodOf(monthOf(st.clock.today, st.clock.periodStartDay), st.clock.periodStartDay).start, p_payload: payload,
      /* Ảnh chụp quy định + hạn mức lúc gửi (không chụp lương cơ bản vào đơn để người duyệt không thấy lương) */
      p_snapshot: { salaryAdvance: st.rule && { policyId: st.rule.policyId, versionNo: st.rule.versionNo, config: st.rule.config, source: st.rule.source }, limit: st.limit, workflow: { versionNo: wf.version_no, steps: wf.steps } },
      p_tasks: tasks, p_amount: amount, p_deduct_month: `${st.month}-01`,
    });
    if (error?.message?.includes("ADVANCE_MONTH_USED")) throw conflict(`Bạn đã có đơn tạm ứng tháng ${monthLabel(st.month)}. Mỗi tháng tạm ứng một lần.`);
    if (error) throw error;
    const r = data as { id: string; no: string };
    await db.from("audit_logs").insert({ tenant_id: me.tenant_id, actor_user_id: me.user_id, actor_type: "user", action: "request.submitted", resource_type: "request", resource_id: r.id,
      after_data: { no: r.no, type: "salary_advance", amount, month: st.month }, correlation_id: correlationId });
    const v: Viewer = { userId: me.user_id ?? "", employeeId: me.id, tenantId: me.tenant_id, correlationId };
    return (await this.requests.items(db, v, [r.id]))[0]!;
  }

  /* ---------- Web: Kế toán ---------- */
  private async departments(db: Db, tenantId: string, ids: string[]) {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const { data } = await db.from("employee_assignments").select("employee_id, effective_to, departments(name)").eq("tenant_id", tenantId).eq("is_primary", true).in("employee_id", ids).order("effective_from", { ascending: false });
    for (const d of (data ?? []) as unknown as Array<{ employee_id: string; effective_to: string | null; departments: { name: string } | null }>) if (!d.effective_to && !out.has(d.employee_id)) out.set(d.employee_id, d.departments?.name ?? "");
    return out;
  }

  async board(ctx: AdminContext, monthRaw?: string): Promise<AdvanceBoard> {
    ctx.require("salary_advance.process");
    const db = ctx.db;
    const clock = await this.timesheets.tenantClock(db, ctx.tenantId);
    const month = monthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw) ? monthRaw : clock.today.slice(0, 7);
    const scope = await ctx.scopedEmployeeIds("salary_advance.process");
    const { data, error } = await db.from("salary_advances").select("request_id, employee_id, amount, deduct_month, paid_at, requests!inner(status, submitted_at)").eq("tenant_id", ctx.tenantId).eq("deduct_month", `${month}-01`);
    if (error) throw error;
    const advs = ((data ?? []) as unknown as AdvRow[]).filter((a) => scope.has(a.employee_id));
    const items = await this.requests.items(db, { userId: ctx.userId, employeeId: ctx.actor?.id ?? null, tenantId: ctx.tenantId, correlationId: ctx.correlationId }, advs.map((a) => a.request_id));
    const deps = await this.departments(db, ctx.tenantId, [...new Set(advs.map((a) => a.employee_id))]);
    const rows: AdvanceRow[] = items.map((r) => ({ request: r, employee: { id: r.requester.id, code: r.requester.code, fullName: r.requester.fullName, department: deps.get(r.requester.id) || null } }))
      .sort((a, b) => rank(a.request) - rank(b.request) || b.request.submittedAt.localeCompare(a.request.submittedAt));
    const paid = advs.filter((a) => a.paid_at);
    return {
      month, rows, canProcess: true,
      metrics: { pending: advs.filter((a) => a.requests.status === "pending").length, toPay: advs.filter((a) => a.requests.status === "approved" && !a.paid_at).length,
        paidCount: paid.length, paidAmount: paid.reduce((n, a) => n + Number(a.amount), 0) },
    };
  }

  /* Kế toán xác nhận đã chi (chỉ đơn đã duyệt, một lần) */
  async markPaid(ctx: AdminContext, requestId: string, b: Body): Promise<RequestItem> {
    ctx.require("salary_advance.process");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw notFound("đơn tạm ứng");
    const db = ctx.db;
    const { data } = await db.from("salary_advances").select("employee_id, amount, paid_at, requests!inner(status, request_no)").eq("tenant_id", ctx.tenantId).eq("request_id", requestId).maybeSingle();
    const a = data as { employee_id: string; amount: number; paid_at: string | null; requests: { status: string; request_no: string } } | null;
    if (!a) throw notFound("đơn tạm ứng");
    await ctx.requireEmployee("salary_advance.process", a.employee_id);
    if (a.employee_id === ctx.actor?.id) throw forbidden("Không tự xác nhận chi tạm ứng của chính mình.");
    if (a.paid_at) throw conflict("Đơn này đã được xác nhận chi.");
    if (a.requests.status !== "approved") throw conflict("Đơn chưa được duyệt xong, chưa chi được.");
    const note = nullableText(b, "note", 200) ?? null;
    const { error } = await db.from("salary_advances").update({ paid_at: new Date().toISOString(), paid_by: ctx.userId, payout_note: note }).eq("request_id", requestId).is("paid_at", null);
    if (error) throw error;
    await ctx.audit("salary_advance.paid", "request", requestId, { paid: false }, { paid: true, no: a.requests.request_no, amount: Number(a.amount) }, note);
    return (await this.requests.items(db, { userId: ctx.userId, employeeId: ctx.actor?.id ?? null, tenantId: ctx.tenantId, correlationId: ctx.correlationId }, [requestId]))[0]!;
  }

  /* ---------- Web: lương cơ bản ---------- */
  async compensations(ctx: AdminContext): Promise<CompensationBoard> {
    ctx.require("compensation.read");
    const db = ctx.db;
    const ids = [...await ctx.scopedEmployeeIds("compensation.read")];
    if (!ids.length) return { rows: [], canManage: ctx.can("compensation.manage") };
    const [{ data: emps }, { data: comps }, deps] = await Promise.all([
      db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", ids).neq("status", "terminated").order("employee_code"),
      db.from("employee_compensations").select("employee_id, base_salary, effective_from, note, created_at").eq("tenant_id", ctx.tenantId).in("employee_id", ids).order("effective_from", { ascending: false }),
      this.departments(db, ctx.tenantId, ids),
    ]);
    const today = (await this.timesheets.tenantClock(db, ctx.tenantId)).today;
    const all = (comps ?? []) as Array<{ employee_id: string; base_salary: number; effective_from: string; note: string | null; created_at: string }>;
    /* Kế toán đọc lại tài khoản ngân hàng HR đã duyệt (đề nghị sửa hồ sơ), chỉ khi có employee.sensitive.read trong phạm vi */
    const sens = ctx.can("employee.sensitive.read") ? await ctx.scopedEmployeeIds("employee.sensitive.read") : new Set<string>();
    const bankIds = ids.filter((id) => sens.has(id));
    const { data: banks, error: bankErr } = bankIds.length ? await db.from("employee_bank_accounts").select("employee_id, bank_name, account_no, holder").eq("tenant_id", ctx.tenantId).in("employee_id", bankIds) : { data: [], error: null };
    if (bankErr) throw bankErr;
    const bank = new Map(((banks ?? []) as Array<{ employee_id: string; bank_name: string; account_no: string; holder: string }>).map((x) => [x.employee_id, x]));
    const rows: CompensationRow[] = ((emps ?? []) as Array<{ id: string; employee_code: string; full_name: string }>).map((e) => {
      const h = all.filter((c) => c.employee_id === e.id);
      const cur = h.find((c) => c.effective_from <= today);
      return {
        employee: { id: e.id, code: e.employee_code, fullName: e.full_name, department: deps.get(e.id) || null },
        baseSalary: cur ? Number(cur.base_salary) : null, effectiveFrom: cur?.effective_from ?? null,
        history: h.map((c) => ({ baseSalary: Number(c.base_salary), effectiveFrom: c.effective_from, note: c.note, createdAt: c.created_at })),
        bank: bank.has(e.id) ? bankView(bank.get(e.id)!, true) : null,
      };
    });
    await ctx.audit("compensation.viewed", "tenant", ctx.tenantId, null, { employees: rows.length });
    return { rows, canManage: ctx.can("compensation.manage") };
  }

  async setCompensation(ctx: AdminContext, employeeId: string, b: Body): Promise<CompensationBoard> {
    ctx.require("compensation.manage");
    await ctx.requireEmployee("compensation.manage", employeeId);
    const base = number(b, "baseSalary", 1_000_000, 10_000_000_000, { integer: true })!;
    const from = date(b, "effectiveFrom")!;
    const note = nullableText(b, "note", 200) ?? null;
    const { error } = await ctx.db.from("employee_compensations").insert({ tenant_id: ctx.tenantId, employee_id: employeeId, base_salary: base, effective_from: from, note, created_by: ctx.userId });
    if (error?.code === "23505") throw conflict(`Đã có lương cơ bản hiệu lực từ ${from}. Chọn ngày khác.`);
    if (error) throw error;
    /* Không ghi số tiền vào nhật ký: HR/kiểm soát đọc được nhật ký hồ sơ nhân viên */
    await ctx.audit("compensation.changed", "employee", employeeId, null, { effective_from: from }, note);
    return this.compensations(ctx);
  }
}

/* Thứ tự hiển thị: chờ chi → đang duyệt → đã chi → còn lại */
const rank = (r: RequestItem) => (r.type === "salary_advance" && r.status === "approved" && !r.payout ? 0 : r.status === "pending" ? 1 : r.type === "salary_advance" && r.payout ? 2 : 3);
