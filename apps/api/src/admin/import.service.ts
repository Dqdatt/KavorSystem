/* Nhập nhân viên hàng loạt từ CSV (docs/plans/employee-import.md). Kiểm tra toàn file → xem trước; chỉ ghi khi cả file không lỗi,
   ghi nguyên khối bằng import_employees. Mã đã có thì bỏ qua. Không chép email/điện thoại vào audit tổng. */
import {
  ADMIN_ERRORS, EMPLOYEE_IMPORT_REQUIRED, type EmployeeImportResult, type EmployeeImportRow, type EmploymentType,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import { readCsv } from "../payroll/csv.js";
import { localParts, tenantSettings } from "../attendance/attendance.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { invalid, type AdminContext } from "./context.js";
import { EMAIL, req, type Body } from "./validate.js";
import { planOf } from "../tenancy/plan.js";

export const IMPORT_MAX_ROWS = 1000;
const CODE = /^[A-Za-z0-9._-]{2,40}$/;
const TYPES: Record<string, EmploymentType> = {
  official: "official", probation: "probation", contractor: "contractor", intern: "intern",
  "chính thức": "official", "thử việc": "probation", "cộng tác viên": "contractor", "thực tập": "intern",
};

/* YYYY-MM-DD hoặc DD/MM/YYYY → YYYY-MM-DD (ngày có thật) */
export function importDate(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = s.includes("/") ? [m[3]!, m[2]!.padStart(2, "0"), m[1]!.padStart(2, "0")] : [m[1]!, m[2]!, m[3]!];
  const iso = `${y}-${mo}-${d}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

type Parsed = {
  line: number; code: string; fullName: string; email: string; phone: string | null; hireDate: string | null; type: EmploymentType | null;
  deptCode: string; posCode: string; managerCode: string | null; errors: string[];
};

/* Đọc + kiểm tra định dạng từng dòng (không cần DB) */
export function parseEmployeeCsv(csv: string): { rows: Parsed[]; fileErrors: string[] } {
  const { records, errors } = readCsv(csv);
  const fileErrors = errors.map((e) => `Dòng ${e.row ?? "?"}: ${e.message}`);
  if (!records.length) return { rows: [], fileErrors: [...fileErrors, "File trống."] };
  /* Tên cột cũ của sample-data/employees.csv vẫn nhận; cột thừa (tenant_code, branch_code, status…) bỏ qua */
  const ALIAS: Record<string, string> = { manager_employee_code: "manager_code" };
  const header = records[0]!.cells.map((h) => { const k = h.trim().toLowerCase(); return ALIAS[k] ?? k; });
  const col = (k: string) => header.indexOf(k);
  const missing = EMPLOYEE_IMPORT_REQUIRED.filter((k) => col(k) < 0);
  if (missing.length) return { rows: [], fileErrors: [...fileErrors, `Thiếu cột bắt buộc: ${missing.join(", ")}.`] };
  const body = records.slice(1);
  if (body.length > IMPORT_MAX_ROWS) return { rows: [], fileErrors: [...fileErrors, `Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần nhập.`] };
  const cell = (r: { cells: string[] }, k: string) => (col(k) >= 0 ? (r.cells[col(k)] ?? "").trim() : "");
  const seenCode = new Map<string, number>(), seenEmail = new Map<string, number>();
  const rows = body.map((r): Parsed => {
    const errs: string[] = [];
    const code = cell(r, "employee_code").toUpperCase(), fullName = cell(r, "full_name"), email = cell(r, "work_email").toLowerCase();
    const rawDate = cell(r, "hire_date"), rawType = cell(r, "employment_type").toLowerCase();
    if (!CODE.test(code)) errs.push("Mã nhân viên 2–40 ký tự chữ, số, . _ -");
    if (fullName.length < 2 || fullName.length > 120) errs.push("Họ tên 2–120 ký tự");
    if (!EMAIL.test(email) || email.length > 200) errs.push("Email công ty không hợp lệ");
    const hireDate = importDate(rawDate);
    if (!hireDate) errs.push("Ngày vào làm dạng YYYY-MM-DD hoặc DD/MM/YYYY");
    const type = TYPES[rawType] ?? null;
    if (!type) errs.push("Loại hợp đồng: Chính thức / Thử việc / Cộng tác viên / Thực tập");
    const phone = cell(r, "phone") || null;
    if (phone && !/^[0-9+ ().-]{6,30}$/.test(phone)) errs.push("Điện thoại không hợp lệ");
    if (!cell(r, "department_code")) errs.push("Thiếu mã phòng ban");
    if (!cell(r, "position_code")) errs.push("Thiếu mã chức danh");
    if (code && seenCode.has(code)) errs.push(`Trùng mã với dòng ${seenCode.get(code)}`);
    if (email && seenEmail.has(email)) errs.push(`Trùng email với dòng ${seenEmail.get(email)}`);
    if (code) seenCode.set(code, r.line);
    if (email) seenEmail.set(email, r.line);
    const managerCode = cell(r, "manager_code").toUpperCase() || null;
    if (managerCode && managerCode === code) errs.push("Không tự làm quản lý của mình");
    return { line: r.line, code, fullName, email, phone, hireDate, type, deptCode: cell(r, "department_code").toUpperCase(), posCode: cell(r, "position_code").toUpperCase(), managerCode, errors: errs };
  });
  return { rows, fileErrors };
}

export class EmployeeImport {
  constructor(private readonly sb: SupabaseGateway) {}

  async run(ctx: AdminContext, b: Body): Promise<EmployeeImportResult> {
    ctx.require("employee.create");
    const fileName = req(b, "fileName", { max: 255 });
    if (typeof b?.csv !== "string" || b.csv.length > 2_000_000) throw invalid("CSV phải là chuỗi tối đa 2.000.000 ký tự.");
    const dryRun = b?.dryRun !== false;
    const db = ctx.db;
    const today = localParts(new Date(), (await tenantSettings(this.sb, ctx.tenantId)).timezone).date;
    const { rows, fileErrors } = parseEmployeeCsv(b.csv);
    const live = `effective_to.is.null,effective_to.gte.${today}`;
    const [{ data: deps }, { data: brs }, { data: pos }, { data: emps }, plan] = await Promise.all([
      db.from("departments").select("id, code, name, branch_id").eq("tenant_id", ctx.tenantId).or(live),
      db.from("branches").select("id, legal_entity_id").eq("tenant_id", ctx.tenantId).or(live),
      db.from("positions").select("id, code, name").eq("tenant_id", ctx.tenantId).or(live),
      db.from("employees").select("id, employee_code, status").eq("tenant_id", ctx.tenantId),
      planOf(db, ctx.tenantId),
    ]);
    const dept = new Map(((deps ?? []) as Array<{ id: string; code: string; name: string; branch_id: string | null }>).map((d) => [d.code.toUpperCase(), d]));
    const branchLe = new Map(((brs ?? []) as Array<{ id: string; legal_entity_id: string }>).map((x) => [x.id, x.legal_entity_id]));
    const posi = new Map(((pos ?? []) as Array<{ id: string; code: string; name: string }>).map((p) => [p.code.toUpperCase(), p]));
    const existing = new Map(((emps ?? []) as Array<{ id: string; employee_code: string; status: string }>).map((e) => [e.employee_code.toUpperCase(), e]));
    /* Email dùng ở hồ sơ khác (toàn hệ thống — email là khóa đăng nhập) */
    const emails = [...new Set(rows.filter((r) => !existing.has(r.code) && EMAIL.test(r.email)).map((r) => r.email))];
    const taken = new Set<string>();
    for (let i = 0; i < emails.length; i += 200) {
      const { data } = await db.from("employees").select("work_email").in("work_email", emails.slice(i, i + 200));
      for (const e of (data ?? []) as Array<{ work_email: string }>) taken.add(e.work_email.toLowerCase());
    }
    const scopes = ctx.scopes("employee.create");
    const fileCodes = new Set(rows.map((r) => r.code));
    const out: EmployeeImportRow[] = [];
    const apply: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const errs = [...r.errors];
      const d = dept.get(r.deptCode), p = posi.get(r.posCode);
      const exists = existing.has(r.code);
      if (!exists) {
        if (r.deptCode && !d) errs.push(`Phòng ban ${r.deptCode} không có hoặc đã ngừng`);
        if (d && !d.branch_id) errs.push(`Phòng ban ${r.deptCode} chưa gắn chi nhánh`);
        if (r.posCode && !p) errs.push(`Chức danh ${r.posCode} không có hoặc đã ngừng`);
        if (taken.has(r.email)) errs.push("Email đã dùng cho hồ sơ khác");
        const le = d?.branch_id ? branchLe.get(d.branch_id) : undefined;
        if (d && d.branch_id && !scopes.some((g) => g.scope_type === "tenant" || (g.scope_type === "legal_entity" && g.scope_id === le)
          || (g.scope_type === "branch" && g.scope_id === d.branch_id) || (g.scope_type === "department" && g.scope_id === d.id))) errs.push("Phòng ban nằm ngoài phạm vi bạn được quản lý");
        if (r.managerCode) {
          const m = existing.get(r.managerCode);
          if (m ? m.status === "terminated" : !fileCodes.has(r.managerCode)) errs.push(`Quản lý ${r.managerCode} không có hoặc đã nghỉ việc`);
        }
      }
      const action: EmployeeImportRow["action"] = errs.length ? "error" : exists ? "exists" : "create";
      out.push({ line: r.line, code: r.code, fullName: r.fullName, department: d?.name ?? (r.deptCode || null), position: p?.name ?? (r.posCode || null), manager: r.managerCode, action, errors: errs });
      if (action === "create") {
        const m = r.managerCode ? existing.get(r.managerCode) : undefined;
        apply.push({ code: r.code, full_name: r.fullName, work_email: r.email, phone: r.phone, hire_date: r.hireDate, employment_type: r.type,
          legal_entity_id: branchLe.get(d!.branch_id!), branch_id: d!.branch_id, department_id: d!.id, position_id: p!.id,
          manager_code: m ? null : r.managerCode, manager_id: m?.id ?? null });
      }
    }
    /* Quản lý là người trong file nhưng dòng đó lỗi → dòng phụ thuộc cũng lỗi */
    const willCreate = new Set(apply.map((a) => a.code as string));
    for (const o of out) if (o.action === "create" && o.manager && !existing.has(o.manager) && !willCreate.has(o.manager)) {
      o.action = "error"; o.errors.push(`Quản lý ${o.manager} ở dòng có lỗi`);
    }
    const creates = out.filter((o) => o.action === "create").length;
    if (creates && plan.employees + creates > plan.employeeLimit) {
      fileErrors.push(`Vượt giới hạn gói ${plan.name}: đang có ${plan.employees}/${plan.employeeLimit} nhân sự, file tạo thêm ${creates}. Liên hệ Kavor để nâng gói.`);
    }
    const errorCount = out.filter((o) => o.action === "error").length;
    const result: EmployeeImportResult = {
      fileName, dryRun, applied: false, fileErrors,
      totals: { rows: out.length, create: creates, exists: out.filter((o) => o.action === "exists").length, error: errorCount },
      capacity: { employees: plan.employees, limit: plan.employeeLimit, planName: plan.name }, rows: out,
    };
    if (dryRun) return result;
    if (fileErrors.length || errorCount) throw new AuthError("IMPORT_HAS_ERRORS", "File còn lỗi; sửa rồi tải lại để xem trước.", 422);
    if (!creates) return result;
    const final = apply.filter((a) => out.some((o) => o.code === a.code && o.action === "create"));
    const { data, error } = await db.rpc("import_employees", { p_tenant: ctx.tenantId, p_rows: final });
    if (error?.code === "23505") throw new AuthError(ADMIN_ERRORS.conflict, "Có mã hoặc email vừa được tạo ở nơi khác; tải lại file để xem trước.", 409);
    if (error) throw error;
    const created = (data ?? []) as Array<{ code: string; id: string }>;
    await ctx.audit("employee.imported", "tenant", ctx.tenantId, null, { file_name: fileName, rows: out.length, created: created.length, skipped: result.totals.exists });
    if (created.length) {
      const { error: aErr } = await db.from("audit_logs").insert(created.map((c) => ({
        tenant_id: ctx.tenantId, actor_user_id: ctx.userId, actor_type: "user", action: "employee.created", resource_type: "employee", resource_id: c.id,
        after_data: { employee_code: c.code, source: "import", file_name: fileName }, correlation_id: ctx.correlationId,
      })));
      if (aErr) throw aErr;
    }
    return { ...result, applied: true, totals: { ...result.totals, create: created.length } };
  }
}
