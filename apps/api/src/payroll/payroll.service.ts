/* final_result_import: parsing/đối chiếu ở API; mọi thay đổi payroll qua hàm SQL có khóa dòng.
   Không ghi số tiền, CSV, tên file hay note nhập vào audit/log. */
import type {
  MyPayslip, MyPayslips, PayComponent, PayrollAction, PayrollBatch, PayrollBoard, PayrollCycle,
  PayrollDetail, PayrollEvent, PayrollImportOutcome, PayrollIssue, PayrollResult, PayrollStatus, PayrollTransition,
} from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import { date, nullableText, req, type Body } from "../admin/validate.js";
import { EMP_LITE, MONTH, type EmployeeLite, type TimesheetService } from "../timesheet/timesheet.service.js";
import { issue, readCsv, validateCsv, type ImportRow } from "./csv.js";

type Db = SupabaseGateway["admin"];
type CycleRow = {
  id: string; tenant_id: string; month: string; period_start: string; period_end: string; pay_date: string; status: PayrollStatus;
  latest_batch_id: string | null; imported_by: string | null; imported_at: string | null; approved_by: string | null; approved_at: string | null;
  published_at: string | null; paid_at: string | null; closed_at: string | null;
};
type BatchRow = { id: string; file_name: string; total_rows: number; error_rows: number; warnings: PayrollIssue[]; created_by: string; created_at: string };
type ResultRow = { id: string; employee_id: string; batch_id: string; gross: number; deduction: number; net: number; work_days: number | null; note: string | null };
type ComponentRow = { id: string; code: string; name: string; kind: PayComponent["kind"]; display_order: number };
type ItemRow = { id: string; result_id: string; component_id: string; component_code: string; component_name: string; component_kind: PayComponent["kind"]; display_order: number; amount: number; label: string | null };
type EventRow = { id: string; action: string; from_status: PayrollStatus | null; to_status: PayrollStatus; actor_user_id: string; employee_id: string | null; reason: string | null; created_at: string; batch_id: string | null };
const CYCLE_COLS = "id, tenant_id, month, period_start, period_end, pay_date, status, latest_batch_id, imported_by, imported_at, approved_by, approved_at, published_at, paid_at, closed_at";
const RESULT_COLS = "id, employee_id, batch_id, gross, deduction, net, work_days, note";
const PUBLISHED: PayrollStatus[] = ["published", "paid", "closed"];
const PERMISSION: Record<PayrollAction, string> = { submit: "payroll.import", approve: "payroll.approve", publish: "payroll.publish", paid: "payroll.publish", close: "payroll.publish", reopen: "payroll.cycle.reopen" };
const FROM: Record<PayrollAction, PayrollStatus> = { submit: "prepared", approve: "under_review", publish: "approved", paid: "published", close: "paid", reopen: "approved" };
const cycleView = (c: CycleRow): PayrollCycle => ({
  id: c.id, month: c.month, periodStart: c.period_start, periodEnd: c.period_end, payDate: c.pay_date, status: c.status,
  latestBatchId: c.latest_batch_id, importedBy: c.imported_by, importedAt: c.imported_at, approvedBy: c.approved_by,
  approvedAt: c.approved_at, publishedAt: c.published_at, paidAt: c.paid_at, closedAt: c.closed_at,
});
const batchView = (b: BatchRow, applied: boolean): PayrollBatch => ({
  id: b.id, fileName: b.file_name, totalRows: b.total_rows, errorRows: b.error_rows, createdBy: b.created_by, createdAt: b.created_at, applied,
  errors: b.warnings.filter((i) => i.severity === "error"), warnings: b.warnings.filter((i) => i.severity === "warning"),
});
const monthParam = (m: string) => { if (!MONTH.test(m) || Number(m.slice(0, 4)) < 1) throw invalid("Tháng phải có dạng YYYY-MM, năm từ 0001."); return m; };

// Không để lỗi PostgreSQL chứa failing row/số tiền đi tới console.error của controller.
function dbError(e: unknown): never {
  const err = e as { code?: string; message?: string };
  const message = err.message ?? "";
  if (/PAYROLL_FORBIDDEN|PAYROLL_CYCLE_NOT_FOUND|PAYSLIP_NOT_FOUND/.test(message)) throw notFound("kỳ lương hoặc phiếu lương");
  if (message.includes("PAYROLL_SELF_APPROVAL")) throw forbidden("Người nhập kết quả lần cuối không được tự duyệt kỳ lương.");
  if (message.includes("PAYROLL_REOPEN_REASON_REQUIRED")) throw invalid("Lý do mở lại cần ít nhất 5 ký tự.");
  if (err.code === "23505") throw conflict("Kỳ lương hoặc dữ liệu này đã tồn tại.");
  if (/PAYROLL_(RESULTS_LOCKED|TRANSITION_INVALID|IMPORT_NOT_READY|BATCH_MISMATCH|BATCH_ALREADY_APPLIED|IMPORT_HAS_ERRORS)/.test(message)) throw conflict("Trạng thái kỳ hoặc lần nhập đã thay đổi; cần file hợp lệ đã áp thành công trước khi gửi/duyệt.");
  throw new AuthError("INTERNAL_ERROR", "Không xử lý được dữ liệu payroll. Vui lòng thử lại.", 500, true);
}

/* Không phụ thuộc giới hạn mặc định 1.000 dòng của PostgREST: lương không được nhập/đọc thiếu âm thầm. */
async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) dbError(error);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export class PayrollService {
  constructor(private readonly sb: SupabaseGateway, private readonly timesheets: TimesheetService) {}

  private async cycle(db: Db, tenantId: string, month: string): Promise<CycleRow> {
    monthParam(month);
    const { data, error } = await db.from("payroll_cycles").select(CYCLE_COLS).eq("tenant_id", tenantId).eq("month", month).maybeSingle();
    if (error) dbError(error);
    if (!data) throw notFound("kỳ lương");
    return data as CycleRow;
  }

  private async inScope(ctx: AdminContext, c: CycleRow, perm: string) {
    const { data, error } = await ctx.db.rpc("payroll_cycle_in_scope", { p_user: ctx.userId, p_cycle: c.id, p_perm: perm });
    if (error) dbError(error);
    return data === true;
  }

  private async scopedCycle(ctx: AdminContext, month: string, perm: string) {
    ctx.require(perm);
    const c = await this.cycle(ctx.db, ctx.tenantId, month);
    if (!await this.inScope(ctx, c, perm)) throw notFound("kỳ lương");
    return c;
  }

  private components(db: Db, tenantId: string): Promise<PayComponent[]> {
    return all<ComponentRow>((a, b) => db.from("pay_components").select("id, code, name, kind, display_order").eq("tenant_id", tenantId).order("id").range(a, b))
      .then((rows) => rows.map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind, displayOrder: r.display_order })).sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code)));
  }

  private employees(db: Db, tenantId: string) {
    return all<EmployeeLite>((a, b) => db.from("employees").select(EMP_LITE).eq("tenant_id", tenantId).order("id").range(a, b));
  }

  private events(db: Db, c: CycleRow) {
    return all<EventRow>((a, b) => db.from("payroll_cycle_events").select("id, action, from_status, to_status, actor_user_id, employee_id, reason, created_at, batch_id")
      .eq("tenant_id", c.tenant_id).eq("cycle_id", c.id).order("created_at").order("id").range(a, b));
  }

  private async results(db: Db, c: CycleRow, employeeId?: string): Promise<PayrollResult[]> {
    const query = () => {
      let q = db.from("payroll_results").select(RESULT_COLS).eq("tenant_id", c.tenant_id).eq("cycle_id", c.id);
      if (employeeId) q = q.eq("employee_id", employeeId);
      return q;
    };
    const rows = await all<ResultRow>((a, b) => query().order("id").range(a, b));
    if (!rows.length) return [];
    const items: ItemRow[] = [], employees = new Map<string, { id: string; employee_code: string; full_name: string }>();
    for (let n = 0; n < rows.length; n += 100) {
      const chunk = rows.slice(n, n + 100);
      const [parts, emps] = await Promise.all([
        all<ItemRow>((a, b) => db.from("payroll_result_items").select("id, result_id, component_id, component_code, component_name, component_kind, display_order, amount, label")
          .eq("tenant_id", c.tenant_id).in("result_id", chunk.map((r) => r.id)).order("id").range(a, b)),
        db.from("employees").select("id, employee_code, full_name").eq("tenant_id", c.tenant_id).in("id", chunk.map((r) => r.employee_id)),
      ]);
      if (emps.error) dbError(emps.error);
      items.push(...parts);
      for (const e of emps.data ?? []) employees.set(e.id as string, e as { id: string; employee_code: string; full_name: string });
    }
    return rows.map((r) => {
      const e = employees.get(r.employee_id)!;
      return { id: r.id, employee: { id: e.id, code: e.employee_code, fullName: e.full_name }, batchId: r.batch_id,
        gross: Number(r.gross), deduction: Number(r.deduction), net: Number(r.net), workDays: r.work_days === null ? null : Number(r.work_days), note: r.note,
        items: items.filter((i) => i.result_id === r.id).map((i) => ({ id: i.component_id, code: i.component_code, name: i.component_name, kind: i.component_kind,
          displayOrder: i.display_order, amount: Number(i.amount), label: i.label })).sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code)),
      };
    }).sort((a, b) => a.employee.code.localeCompare(b.employee.code));
  }

  async board(ctx: AdminContext): Promise<PayrollBoard> {
    ctx.require("payroll.read");
    const rows = await all<CycleRow>((a, b) => ctx.db.from("payroll_cycles").select(CYCLE_COLS).eq("tenant_id", ctx.tenantId).order("month", { ascending: false }).range(a, b));
    const cycles: PayrollCycle[] = [];
    for (const c of rows) if (await this.inScope(ctx, c, "payroll.read")) cycles.push(cycleView(c));
    await ctx.audit("payroll.cycles.viewed", "tenant", ctx.tenantId, null, { cycles: cycles.length });
    return { cycles, canCreate: ctx.tenantWide("payroll.import") };
  }

  async create(ctx: AdminContext, b: Body): Promise<PayrollTransition> {
    ctx.require("payroll.import");
    if (!ctx.tenantWide("payroll.import")) throw notFound("kỳ lương");
    const month = monthParam(req(b, "month")), payDate = date(b, "payDate")!;
    const { data, error } = await ctx.db.rpc("create_payroll_cycle", { p_tenant: ctx.tenantId, p_user: ctx.userId, p_month: month, p_pay_date: payDate });
    if (error) dbError(error);
    await ctx.audit("payroll.cycle.created", "payroll_cycle", data as string, null, { month, payDate });
    return { cycle: cycleView(await this.cycle(ctx.db, ctx.tenantId, month)) };
  }

  async detail(ctx: AdminContext, month: string): Promise<PayrollDetail> {
    const c = await this.scopedCycle(ctx, month, "payroll.read");
    const [components, results, rawBatches, rawEvents, scopedEmployees] = await Promise.all([
      this.components(ctx.db, ctx.tenantId), this.results(ctx.db, c),
      all<BatchRow>((a, b) => ctx.db.from("payroll_import_batches").select("id, file_name, total_rows, error_rows, warnings, created_by, created_at")
        .eq("tenant_id", ctx.tenantId).eq("cycle_id", c.id).order("created_at", { ascending: false }).order("id").range(a, b)), this.events(ctx.db, c),
      all<{ id: string; employee_code: string }>((a, b) => ctx.scopedEmployees("payroll.read", "id, employee_code").order("id").range(a, b)),
    ]);
    const codes = new Set(scopedEmployees.map((e) => e.employee_code)), ids = new Set(scopedEmployees.map((e) => e.id));
    // Batch cũ/cảnh báo thiếu dòng có thể nhắc người ngoài kết quả hiện tại; không lộ khi phạm vi đã thu hẹp.
    const batches = rawBatches.map((b) => batchView({ ...b, warnings: b.warnings.filter((i) => !i.employeeCode || codes.has(i.employeeCode)) }, rawEvents.some((e) => e.action === "replaced" && e.batch_id === b.id)));
    const latest = batches.find((b) => b.id === c.latest_batch_id);
    const ready = !!latest && latest.applied && latest.totalRows > 0 && latest.errorRows === 0 && latest.errors.length === 0;
    const actions: PayrollAction[] = [];
    for (const action of Object.keys(PERMISSION) as PayrollAction[]) {
      if (c.status !== FROM[action] || !ctx.can(PERMISSION[action])) continue;
      if ((action === "submit" || action === "approve") && !ready) continue;
      if (action === "approve" && c.imported_by === ctx.userId) continue;
      if (await this.inScope(ctx, c, PERMISSION[action])) actions.push(action);
    }
    const canImport = ["open", "prepared", "under_review"].includes(c.status) && ctx.can("payroll.import") && await this.inScope(ctx, c, "payroll.import");
    await ctx.audit("payroll.cycle.viewed", "payroll_cycle", c.id, null, { month: c.month, employees: results.length });
    return { cycle: cycleView(c), components, results, batches, errors: latest?.errors ?? [], warnings: latest?.warnings ?? [], canImport, actions,
      events: rawEvents.filter((e) => !e.employee_id || ids.has(e.employee_id)).map((e): PayrollEvent => ({ id: e.id, action: e.action, fromStatus: e.from_status, toStatus: e.to_status, actorUserId: e.actor_user_id, employeeId: e.employee_id, reason: e.reason, createdAt: e.created_at })),
    };
  }

  private async warnings(db: Db, c: CycleRow, rows: ImportRow[], employees: EmployeeLite[], allowed: Set<string>): Promise<PayrollIssue[]> {
    const out: PayrollIssue[] = [];
    const warn = (code: string, message: string, r?: ImportRow, column: string | null = null, employeeCode: string | null = null) => out.push(issue("warning", code, message, r?.line ?? null, column, r?.employeeCode ?? employeeCode));
    const inPeriod = employees.filter((e) => allowed.has(e.id) && e.hire_date <= c.period_end && (!e.termination_date || e.termination_date >= c.period_start));
    const byId = new Map(rows.map((r) => [r.employeeId, r]));
    for (const e of inPeriod) if (!byId.has(e.id)) warn("EMPLOYEE_MISSING", "Nhân viên làm việc trong kỳ nhưng thiếu trong file.", undefined, "employee_code", e.employee_code);
    const [{ data: advanceComp, error: compErr }, advances, ots, sheets] = await Promise.all([
      db.from("pay_components").select("id, code").eq("tenant_id", c.tenant_id).in("code", ["ADVANCE", "OT_PAY"]),
      all<{ id: string; employee_id: string; amount: number; deducted_cycle_id: string | null }>((a, b) => db.from("salary_advances").select("id, employee_id, amount, deducted_cycle_id")
        .eq("tenant_id", c.tenant_id).eq("deduct_month", `${c.month}-01`).not("paid_at", "is", null).order("id").range(a, b)),
      all<{ id: string; employee_id: string; minutes: number }>((a, b) => db.from("overtime_entries").select("id, employee_id, minutes, requests!inner(status)")
        .eq("tenant_id", c.tenant_id).gte("work_date", c.period_start).lte("work_date", c.period_end).eq("requests.status", "approved").order("id").range(a, b)),
      this.timesheets.build(c.tenant_id, employees.filter((e) => byId.has(e.id)), c.month, { periodStartDay: Number(c.period_start.slice(8, 10)) }),
    ]);
    if (compErr) dbError(compErr);
    if (!sheets.lock) warn("TIMESHEET_UNLOCKED", "Kỳ công chưa khóa; ngày công vẫn có thể thay đổi.");
    const advanceId = advanceComp?.find((x) => x.code === "ADVANCE")?.id as string | undefined;
    const otId = advanceComp?.find((x) => x.code === "OT_PAY")?.id as string | undefined;
    for (const r of rows) {
      const adv = advances.filter((a) => a.employee_id === r.employeeId);
      const paid = adv.reduce((n, a) => n + BigInt(a.amount), 0n);
      const imported = r.items.find((i) => i.componentId === advanceId)?.amount ?? 0;
      if (BigInt(imported) !== paid) warn("ADVANCE_MISMATCH", "ADVANCE khác tổng tạm ứng đã chi của tháng khấu trừ.", r, "ADVANCE");
      if (adv.some((a) => a.deducted_cycle_id !== null)) warn("ADVANCE_ALREADY_DEDUCTED", "Có tạm ứng đã được ghi nhận khấu trừ.", r, "ADVANCE");
      const hasOt = ots.some((o) => o.employee_id === r.employeeId && o.minutes > 0), hasPay = (r.items.find((i) => i.componentId === otId)?.amount ?? 0) > 0;
      if (hasOt !== hasPay) warn("OT_MISMATCH", hasOt ? "Có OT đã duyệt trong kỳ nhưng không có OT_PAY." : "Có OT_PAY nhưng không có OT đã duyệt trong kỳ.", r, "OT_PAY");
      const credited = sheets.sheets.get(r.employeeId)?.summary.credited;
      if (r.workDays !== null && credited !== undefined && r.workDays !== credited) warn("WORK_DAYS_MISMATCH", "work_days khác ngày công credited trong bảng công của kỳ.", r, "work_days");
    }
    // Thiếu cả dòng nhân viên có tạm ứng đã chi vẫn phải hiện đối chiếu, không chỉ cảnh báo thiếu nhân viên.
    for (const id of new Set(advances.map((a) => a.employee_id))) if (allowed.has(id) && !byId.has(id)) {
      const code = employees.find((e) => e.id === id)?.employee_code ?? null;
      warn("ADVANCE_MISMATCH", "Thiếu dòng nhân viên có tạm ứng đã chi của tháng khấu trừ.", undefined, "ADVANCE", code);
    }
    return out;
  }

  async importCsv(ctx: AdminContext, month: string, b: Body): Promise<PayrollImportOutcome> {
    const c = await this.scopedCycle(ctx, month, "payroll.import");
    if (!["open", "prepared", "under_review"].includes(c.status)) throw conflict("Kỳ lương đã duyệt, không được nhập lại.");
    const fileName = req(b, "fileName", { max: 255 });
    if (typeof b?.csv !== "string" || b.csv.length > 3_000_000) throw invalid("CSV phải là chuỗi tối đa 3.000.000 ký tự.");
    const parsed = readCsv(b.csv);
    const [components, employees, allowed] = await Promise.all([this.components(ctx.db, ctx.tenantId), this.employees(ctx.db, ctx.tenantId), ctx.scopedEmployeeIds("payroll.import")]);
    const byCode = new Map(employees.map((e) => [e.employee_code, e.id]));
    // Kiểm phạm vi trước khi trả chẩn đoán; không tiết lộ nhân viên ngoài phạm vi dù file có lỗi khác.
    const codeColumns = (parsed.records[0]?.cells ?? []).map((h, i) => h.trim() === "employee_code" ? i : -1).filter((i) => i >= 0);
    for (const r of parsed.records.slice(1)) for (const col of codeColumns) {
      const id = byCode.get((r.cells[col] ?? "").trim());
      if (id && !allowed.has(id)) throw notFound("nhân viên");
    }
    const validated = validateCsv(parsed, components, byCode);
    const warnings = await this.warnings(ctx.db, c, validated.rows, employees, allowed);
    const { data: bid, error } = await ctx.db.rpc("record_payroll_import", { p_cycle: c.id, p_user: ctx.userId, p_file_name: fileName,
      p_total_rows: validated.totalRows, p_error_rows: validated.errorRows, p_warnings: [...validated.errors, ...warnings] });
    if (error) dbError(error);
    let applied = false;
    if (!validated.errors.length) {
      const { error: replaceErr } = await ctx.db.rpc("replace_payroll_results", { p_cycle: c.id, p_batch: bid, p_user: ctx.userId,
        p_rows: validated.rows.map(({ employeeCode: _code, line: _line, ...r }) => r) });
      if (replaceErr) dbError(replaceErr);
      applied = true;
    }
    await ctx.audit("payroll.import.recorded", "payroll_cycle", c.id, null, { month: c.month, batchId: bid, rows: validated.totalRows, errorRows: validated.errorRows, errors: validated.errors.length, warnings: warnings.length, applied });
    const { data: batch, error: batchErr } = await ctx.db.from("payroll_import_batches").select("id, file_name, total_rows, error_rows, warnings, created_by, created_at").eq("tenant_id", ctx.tenantId).eq("id", bid).single();
    if (batchErr) dbError(batchErr);
    return { cycle: cycleView(await this.cycle(ctx.db, ctx.tenantId, month)), batch: batchView(batch as BatchRow, applied) };
  }

  async transition(ctx: AdminContext, month: string, action: string, b: Body): Promise<PayrollTransition> {
    if (!Object.hasOwn(PERMISSION, action)) throw notFound();
    const a = action as PayrollAction;
    const c = await this.scopedCycle(ctx, month, PERMISSION[a]);
    const reason = a === "reopen" ? nullableText(b, "reason", 1000) : null;
    if (a === "reopen" && (!reason || reason.length < 5)) throw invalid("Lý do mở lại cần ít nhất 5 ký tự.");
    if (c.status !== FROM[a]) throw conflict("Không thể thực hiện bước này ở trạng thái hiện tại.");
    if (a === "approve" && c.imported_by === ctx.userId) throw forbidden("Người nhập kết quả lần cuối không được tự duyệt kỳ lương.");
    const { error } = await ctx.db.rpc("transition_payroll_cycle", { p_cycle: c.id, p_user: ctx.userId, p_action: a, p_reason: reason ?? null });
    if (error) dbError(error);
    // Lý do nằm trong sự kiện SQL được phân quyền payroll; audit chung chỉ giữ cờ, không chép văn bản tự do.
    await ctx.audit(`payroll.cycle.${a}`, "payroll_cycle", c.id, { status: c.status }, { month: c.month, reasonProvided: !!reason });
    return { cycle: cycleView(await this.cycle(ctx.db, ctx.tenantId, month)) };
  }

  private async requireSelf(me: EmployeeRow) {
    const { data, error } = await this.sb.admin.rpc("employee_in_scope", { p_user: me.user_id, p_tenant: me.tenant_id, p_perm: "payroll.self.read", p_employee: me.id });
    if (error) dbError(error);
    if (data !== true) throw notFound("phiếu lương");
  }

  private async selfAudit(me: EmployeeRow, correlationId: string, action: string, id: string | null, metadata: Record<string, unknown>) {
    const { error } = await this.sb.admin.from("audit_logs").insert({ tenant_id: me.tenant_id, actor_user_id: me.user_id, actor_type: "user", action,
      resource_type: "payslip", resource_id: id, after_data: metadata, correlation_id: correlationId });
    if (error) dbError(error);
  }

  async myPayslips(me: EmployeeRow, correlationId: string): Promise<MyPayslips> {
    await this.requireSelf(me);
    const db = this.sb.admin;
    const rows = await all<{ id: string; net: number; work_days: number | null; payroll_cycles: CycleRow; payslip_views: { viewed_at: string } | null }>((a, b) =>
      db.from("payroll_results").select(`id, net, work_days, payroll_cycles!inner(${CYCLE_COLS}), payslip_views(viewed_at)`)
        .eq("tenant_id", me.tenant_id).eq("employee_id", me.id).in("payroll_cycles.status", PUBLISHED).order("id").range(a, b));
    await this.selfAudit(me, correlationId, "payslips.viewed", null, { count: rows.length });
    return { items: rows.map((r) => ({ cycle: cycleView(r.payroll_cycles), net: Number(r.net), workDays: r.work_days === null ? null : Number(r.work_days), viewedAt: r.payslip_views?.viewed_at ?? null })).sort((a, b) => b.cycle.month.localeCompare(a.cycle.month)) };
  }

  async myPayslip(me: EmployeeRow, month: string, correlationId: string): Promise<MyPayslip> {
    await this.requireSelf(me);
    const c = await this.cycle(this.sb.admin, me.tenant_id, month);
    if (!PUBLISHED.includes(c.status)) throw notFound("phiếu lương");
    const result = (await this.results(this.sb.admin, c, me.id))[0];
    if (!result) throw notFound("phiếu lương");
    const { data, error } = await this.sb.admin.rpc("mark_payslip_viewed", { p_result: result.id, p_user: me.user_id });
    if (error) dbError(error);
    await this.selfAudit(me, correlationId, "payslip.viewed", result.id, { month: c.month });
    return { cycle: cycleView(c), result, viewedAt: data as string };
  }
}
