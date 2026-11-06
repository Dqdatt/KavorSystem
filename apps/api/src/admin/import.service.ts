/* Nhập nhân viên từ file bất kỳ (docs/plans/employee-import.md): .xlsx/.csv, tiêu đề tự do, nhiều sheet. detect.ts nhận dạng (thuần),
   service này kiểm tra theo dữ liệu Kavor (email đã dùng, phạm vi, cấp quản lý, gói) rồi ghi nguyên khối bằng import_employees_with_units.
   Lỗi định dạng phụ (email/điện thoại/quản lý) chỉ cảnh báo, không chặn; chỉ chặn khi thiếu thứ bắt buộc. Không chép email/điện thoại vào audit. */
import {
  ADMIN_ERRORS, IMPORT_FIELDS, MANAGEMENT_TIERS, managerTierOk,
  type EmployeeImportResult, type EmployeeImportRow, type ImportField, type ImportOptions, type ManagementTier,
} from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import { localParts, tenantSettings } from "../attendance/attendance.service.js";
import { loadPlacements } from "../attendance/policy.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { invalid, type AdminContext } from "./context.js";
import { req, type Body } from "./validate.js";
import { planOf } from "../tenancy/plan.js";
import { buildImport, norm, type Saved } from "./import/detect.js";
import { readSpreadsheet, SpreadsheetError, type Sheet } from "./import/spreadsheet.js";

export const IMPORT_MAX_ROWS = 1000;
const MAX_FILE = 5_000_000;
const UUID = /^[0-9a-f-]{36}$/i;

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const strMap = (v: unknown, ok: (s: string) => boolean): Record<string, string> =>
  Object.fromEntries(Object.entries(asRecord(v)).filter(([k, x]) => k.length <= 200 && typeof x === "string" && ok(x)).slice(0, 500)) as Record<string, string>;

/* Tùy chọn HR chọn trên màn xem trước; giá trị lạ bị bỏ (không lỗi) */
export function importOptions(v: unknown): ImportOptions {
  const o = asRecord(v);
  const sheets = Object.fromEntries(Object.entries(asRecord(o.sheets)).filter(([, x]) => typeof x === "boolean").slice(0, 100)) as Record<string, boolean>;
  const columns = strMap(o.columns, (x) => x === "" || x in IMPORT_FIELDS) as Record<string, ImportField | "">;
  const unit = (x: string) => /^(code|new):.{1,200}$/.test(x);
  const units = asRecord(o.units);
  return {
    sheets, columns, units: { department: strMap(units.department, unit), position: strMap(units.position, unit) },
    dateOrder: o.dateOrder === "dmy" || o.dateOrder === "mdy" ? o.dateOrder : undefined,
    branchId: typeof o.branchId === "string" && UUID.test(o.branchId) ? o.branchId : undefined,
  };
}

export class EmployeeImport {
  constructor(private readonly sb: SupabaseGateway) {}

  async run(ctx: AdminContext, b: Body): Promise<EmployeeImportResult> {
    ctx.require("employee.create");
    const fileName = req(b, "fileName", { max: 255 });
    let buf: Buffer;
    if (typeof b?.file === "string") {
      if (b.file.length > Math.ceil(MAX_FILE / 3) * 4 + 8) throw invalid("File tối đa 5 MB.");
      buf = Buffer.from(b.file, "base64");
    } else if (typeof b?.csv === "string" && b.csv.length <= 2_000_000) buf = Buffer.from(b.csv, "utf8");
    else throw invalid("Thiếu nội dung file.");
    const dryRun = b?.dryRun !== false;
    const options = importOptions(b?.options);
    const db = ctx.db;
    const today = localParts(new Date(), (await tenantSettings(this.sb, ctx.tenantId)).timezone).date;

    const fileErrors: string[] = [];
    let sheets: Sheet[] = [];
    try { sheets = readSpreadsheet(fileName, buf); } catch (e) {
      if (!(e instanceof SpreadsheetError)) throw e;
      fileErrors.push(e.message);
    }
    const live = `effective_to.is.null,effective_to.gte.${today}`;
    const [{ data: deps }, { data: brs }, { data: pos }, { data: emps }, { data: map }, plan] = await Promise.all([
      db.from("departments").select("id, code, name, branch_id").eq("tenant_id", ctx.tenantId).or(live),
      db.from("branches").select("id, name, legal_entity_id").eq("tenant_id", ctx.tenantId).or(live),
      db.from("positions").select("id, code, name, management_tier, effective_from, effective_to").eq("tenant_id", ctx.tenantId),
      db.from("employees").select("id, employee_code, full_name, status").eq("tenant_id", ctx.tenantId),
      db.from("employee_import_mappings").select("columns, department_values, position_values").eq("tenant_id", ctx.tenantId).maybeSingle(),
      planOf(db, ctx.tenantId),
    ]);
    type Dept = { id: string; code: string; name: string; branch_id: string | null };
    type Pos = { id: string; code: string; name: string; management_tier: number | null; effective_from: string; effective_to: string | null };
    type Emp = { id: string; employee_code: string; full_name: string; status: string };
    const deptList = (deps ?? []) as Dept[], branches = (brs ?? []) as Array<{ id: string; name: string; legal_entity_id: string }>;
    const allPos = (pos ?? []) as Pos[], posList = allPos.filter((p) => !p.effective_to || p.effective_to >= today);
    const empList = (emps ?? []) as Emp[];
    const m = map as { columns: Saved["columns"]; department_values: Record<string, string>; position_values: Record<string, string> } | null;
    const saved: Saved = { columns: m?.columns ?? {}, department: m?.department_values ?? {}, position: m?.position_values ?? {} };

    const built = buildImport({
      sheets, saved, options, today,
      catalog: {
        departments: deptList.map((d) => ({ code: d.code, name: d.name })), positions: posList.map((p) => ({ code: p.code, name: p.name })),
        employees: empList.map((e) => ({ code: e.employee_code, name: e.full_name, status: e.status })),
      },
    });
    fileErrors.push(...built.fileErrors);
    const toCreate = built.rows.filter((r) => !r.skip && !r.exists);
    if (toCreate.length > IMPORT_MAX_ROWS) fileErrors.push(`Tối đa ${IMPORT_MAX_ROWS} nhân viên mới mỗi lần nhập (file có ${toCreate.length}).`);

    /* Đơn vị: lựa chọn cuối cùng của từng nhóm → mã có sẵn hoặc mã mới */
    const deptByCode = new Map(deptList.map((d) => [d.code.toUpperCase(), d]));
    const posByCode = new Map(posList.map((p) => [p.code.toUpperCase(), p]));
    const resolve = (list: typeof built.departments) => {
      const out = new Map<string, { code: string; isNew: boolean }>();
      for (const u of list) {
        if (u.choice.startsWith("code:")) out.set(u.key, { code: u.choice.slice(5).toUpperCase(), isNew: false });
        else { const t = list.find((x) => x.key === u.choice.slice(4)) ?? u; out.set(u.key, { code: t.newCode, isNew: true }); }
      }
      return out;
    };
    const deptOf = resolve(built.departments), posOf = resolve(built.positions);
    const newDepts = built.departments.filter((u) => u.choice === `new:${u.key}`), newPos = built.positions.filter((u) => u.choice === `new:${u.key}`);
    const activeBranches = branches.map((x) => ({ id: x.id, name: x.name }));
    /* Chi nhánh cho phòng ban mới: HR chọn; không chọn thì lấy chi nhánh duy nhất, hoặc chi nhánh chung của mọi phòng ban có sẵn trong file */
    const fileBranches = new Set(built.departments.map((u) => (u.existing ? deptByCode.get(u.existing.code.toUpperCase())?.branch_id : null)).filter(Boolean));
    const branchId = options.branchId && branches.some((x) => x.id === options.branchId) ? options.branchId
      : branches.length === 1 ? branches[0]!.id : fileBranches.size === 1 ? [...fileBranches][0]! : null;
    const branchLe = new Map(branches.map((x) => [x.id, x.legal_entity_id]));
    if (newDepts.length && !branchId) fileErrors.push(`Chọn chi nhánh cho ${newDepts.length} phòng ban mới.`);

    /* Email đã dùng ở hồ sơ khác (toàn hệ thống — email là khóa đăng nhập) → bỏ trống, cảnh báo */
    const emails = [...new Set(toCreate.map((r) => r.email).filter((e): e is string => !!e))];
    const taken = new Set<string>();
    for (let i = 0; i < emails.length; i += 200) {
      const { data } = await db.from("employees").select("work_email").in("work_email", emails.slice(i, i + 200));
      for (const e of (data ?? []) as Array<{ work_email: string }>) taken.add(e.work_email.toLowerCase());
    }
    const existing = new Map(empList.map((e) => [e.employee_code.toUpperCase(), e]));
    const scopes = ctx.scopes("employee.create");
    const inScope = (d: { id: string | null; branch_id: string | null }) => scopes.some((g) => g.scope_type === "tenant"
      || (g.scope_type === "legal_entity" && g.scope_id === branchLe.get(d.branch_id ?? "")) || (g.scope_type === "branch" && g.scope_id === d.branch_id)
      || (g.scope_type === "department" && !!d.id && g.scope_id === d.id));
    const tierById = new Map(allPos.map((p) => [p.id, p.management_tier]));
    const mgrIds = [...new Set(toCreate.map((r) => r.managerCode).filter((c): c is string => !!c && existing.has(c)).map((c) => existing.get(c)!.id))];
    const mgrPlace = mgrIds.length ? await loadPlacements(db, ctx.tenantId, today, mgrIds) : new Map();
    const rowByCode = new Map(toCreate.map((r) => [r.code, r]));
    const tierOfRow = (code: string) => posByCode.get(posOf.get(norm(rowByCode.get(code)?.pos ?? ""))?.code ?? "")?.management_tier ?? null;

    const out: EmployeeImportRow[] = [];
    const apply: Array<Record<string, unknown>> = [];
    for (const r of built.rows) {
      const errs = [...r.errors], warns = [...r.warnings];
      const dk = r.dept ? deptOf.get(norm(r.dept)) : undefined, pk = posOf.get(norm(r.pos));
      const d = dk && !dk.isNew ? deptByCode.get(dk.code) : undefined, p = pk && !pk.isNew ? posByCode.get(pk.code) : undefined;
      const deptName = d?.name ?? (dk?.isNew ? built.departments.find((u) => u.newCode === dk.code)?.value : null) ?? r.dept;
      const posName = p?.name ?? (pk?.isNew ? built.positions.find((u) => u.newCode === pk.code)?.value : null) ?? r.pos;
      let manager = r.managerCode;
      if (!r.skip && !r.exists) {
        if (dk && !dk.isNew && !d) errs.push(`Phòng ban ${dk.code} không có hoặc đã ngừng`);
        if (d && !d.branch_id) errs.push(`Phòng ban ${d.code} chưa gắn chi nhánh`);
        const deptBranch = d?.branch_id ?? (dk?.isNew ? branchId : null);
        if (deptBranch && !inScope({ id: d?.id ?? null, branch_id: deptBranch })) errs.push("Phòng ban nằm ngoài phạm vi bạn được quản lý");
        if (r.email && taken.has(r.email)) { warns.push("Email đã dùng cho hồ sơ khác — bỏ trống"); r.email = null; }
        if (manager) {
          const me = existing.get(manager);
          if (me?.status === "terminated") { warns.push(`Quản lý ${manager} đã nghỉ việc — gán sau`); manager = null; }
          else {
            const mt = me ? tierById.get(mgrPlace.get(me.id)?.position_id ?? "") ?? null : tierOfRow(manager);
            const et = p?.management_tier ?? null;
            if (!managerTierOk(mt, et)) { warns.push(`Quản lý ${manager} (${MANAGEMENT_TIERS[mt as ManagementTier]}) không cao hơn ${posName} (${MANAGEMENT_TIERS[et as ManagementTier]}) — gán sau`); manager = null; }
          }
        }
      }
      const action: EmployeeImportRow["action"] = r.skip ? "skip" : r.exists ? "exists" : errs.length ? "error" : "create";
      out.push({ sheet: r.sheet, line: r.line, code: r.code, fullName: r.fullName, department: deptName, position: posName, manager,
        action, errors: r.skip || r.exists ? [] : errs, warnings: action === "create" ? warns : r.skip ? [r.skip] : [] });
      if (action === "create") {
        const br = d?.branch_id ?? branchId!;
        apply.push({ code: r.code, full_name: r.fullName, work_email: r.email, phone: r.phone, hire_date: r.hireDate, employment_type: r.type,
          legal_entity_id: branchLe.get(br), branch_id: br, department_id: d?.id ?? null, department_code: dk!.code, position_id: p?.id ?? null, position_code: pk!.code,
          manager_code: manager && !existing.has(manager) ? manager : null, manager_id: manager ? existing.get(manager)?.id ?? null : null });
      }
    }
    /* Vòng quản lý / quản lý ở dòng không được tạo → bỏ quản lý (cảnh báo), không chặn cả dòng */
    const creating = new Map(apply.map((a) => [a.code as string, a]));
    for (const a of apply) {
      const mc = a.manager_code as string | null;
      if (!mc) continue;
      let c: string | null = mc, loop = false;
      for (let i = 0; c && creating.has(c) && i <= apply.length; i++) { if (c === a.code) { loop = true; break; } c = (creating.get(c)!.manager_code as string | null) ?? null; }
      if (!creating.has(mc) || loop) {
        a.manager_code = null;
        out.find((o) => o.code === a.code && o.action === "create")!.warnings.push(loop ? `Quản lý ${mc} tạo vòng quản lý — gán sau` : `Quản lý ${mc} ở dòng không nhập được — gán sau`);
      }
    }

    const creates = apply.length;
    if (creates && plan.employees + creates > plan.employeeLimit) {
      fileErrors.push(`Vượt giới hạn gói ${plan.name}: đang có ${plan.employees}/${plan.employeeLimit} nhân sự, file tạo thêm ${creates}. Liên hệ Kavor để nâng gói.`);
    }
    const count = (a: EmployeeImportRow["action"]) => out.filter((o) => o.action === a).length;
    const usedDept = new Set(apply.map((a) => a.department_code)), usedPos = new Set(apply.map((a) => a.position_code));
    const result: EmployeeImportResult = {
      fileName, dryRun, applied: false, fileErrors,
      totals: { rows: out.length, create: creates, exists: count("exists"), skip: count("skip"), error: count("error"), warning: out.filter((o) => o.warnings.length && o.action === "create").length },
      capacity: { employees: plan.employees, limit: plan.employeeLimit, planName: plan.name }, rows: out,
      analysis: {
        sheets: built.sheets, columns: built.columns, dateOrder: built.dateOrder, departments: built.departments, positions: built.positions,
        branches: activeBranches, branchId,
        catalog: { departments: deptList.map((x) => ({ code: x.code, name: x.name })), positions: posList.map((x) => ({ code: x.code, name: x.name })) },
      },
    };
    if (dryRun) return result;
    if (fileErrors.length || result.totals.error) throw new AuthError("IMPORT_HAS_ERRORS", "File còn lỗi; sửa rồi xem trước lại.", 422);
    if (!creates) return result;
    const minHire = (k: "department_code" | "position_code", code: string) => apply.filter((a) => a[k] === code).map((a) => a.hire_date as string).sort()[0] ?? today;
    const pDepts = newDepts.filter((u) => usedDept.has(u.newCode)).map((u) => ({ code: u.newCode, name: u.value.slice(0, 120), branch_id: branchId, effective_from: minHire("department_code", u.newCode) }));
    const pPos = newPos.filter((u) => usedPos.has(u.newCode)).map((u) => ({ code: u.newCode, name: u.value.slice(0, 120), effective_from: minHire("position_code", u.newCode) }));
    const { data, error } = await db.rpc("import_employees_with_units", { p_tenant: ctx.tenantId, p_departments: pDepts, p_positions: pPos, p_rows: apply });
    if (error?.code === "23505") throw new AuthError(ADMIN_ERRORS.conflict, "Có mã hoặc email vừa được tạo ở nơi khác; xem trước lại.", 409);
    if (error) throw error;
    const created = (data ?? []) as Array<{ code: string; id: string }>;
    /* Nhớ cách khớp để lần sau cùng mẫu file tự nhận (chỉ tên cột + tên đơn vị) */
    const columns = { ...saved.columns };
    for (const c of built.columns) if (c.source === "manual" || c.source === "content" || c.source === "header") columns[c.key] = c.field ?? "";
    const remember = (list: typeof built.departments, codeOf: Map<string, { code: string }>, prev: Record<string, string>) =>
      ({ ...prev, ...Object.fromEntries(list.filter((u) => !u.existing).map((u) => [u.key, `code:${codeOf.get(u.key)!.code}`])) });
    const { error: mErr } = await db.from("employee_import_mappings").upsert({
      tenant_id: ctx.tenantId, columns, department_values: remember(built.departments, deptOf, saved.department), position_values: remember(built.positions, posOf, saved.position),
      updated_by: ctx.userId, updated_at: new Date().toISOString(),
    });
    if (mErr) throw mErr;
    await ctx.audit("employee.imported", "tenant", ctx.tenantId, null, { file_name: fileName, rows: out.length, created: created.length, skipped: result.totals.exists + result.totals.skip, departments_created: pDepts.length, positions_created: pPos.length });
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
