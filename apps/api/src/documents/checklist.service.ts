/* Danh mục giấy tờ hồ sơ (docs/plans/payroll-tenant-rules.md mục 4). Công ty tự khai danh mục (document.manage toàn công ty); HR tích từng
   nhân viên đã nộp gì (document.upload trong phạm vi), xem theo document.read. Không có trạng thái giữ bản chính (BLLĐ 2019 Điều 17).
   Nhật ký: checklist_item.created/updated, checklist.updated (không chép nội dung giấy tờ). */
import type { ChecklistEntry, ChecklistForm, ChecklistGaps, ChecklistItem, ChecklistItemList, ChecklistStatus, EmployeeChecklist, EmploymentType } from "@kavor/contracts";
import { conflict, invalid, notFound, type AdminContext } from "../admin/context.js";
import { date, nullableText, number, oneOf, type Body } from "../admin/validate.js";

type ItemRow = { id: string; name: string; required: boolean; employment_types: EmploymentType[] | null; purpose: string | null; sort_order: number; archived_at: string | null };
type StatusRow = { employee_id: string; item_id: string; status: ChecklistStatus; form: ChecklistForm | null; submitted_on: string | null; note: string | null; updated_at: string };
const ITEM_COLS = "id, name, required, employment_types, purpose, sort_order, archived_at";
const STATUS_COLS = "employee_id, item_id, status, form, submitted_on, note, updated_at";
const TYPES: readonly EmploymentType[] = ["probation", "official", "contractor", "intern"];
const FORMS: readonly ChecklistForm[] = ["copy", "original_checked"];
const UUID = /^[0-9a-f-]{36}$/i;

/* Mẫu gợi ý (công ty sửa/ngừng tùy ý) — luật không quy định danh mục bắt buộc */
const TEMPLATES: Array<{ name: string; required: boolean; purpose: string; types?: EmploymentType[] }> = [
  { name: "Sơ yếu lý lịch", required: true, purpose: "Hồ sơ tuyển dụng" },
  { name: "CCCD (bản sao)", required: true, purpose: "Xác minh nhân thân, khai BHXH và thuế" },
  { name: "Giấy khám sức khỏe", required: true, purpose: "Đánh giá sức khỏe phù hợp công việc" },
  { name: "Bằng cấp, chứng chỉ (bản sao)", required: false, purpose: "Xác minh trình độ theo vị trí" },
  { name: "Xác nhận thông tin cư trú (CT07)", required: false, purpose: "Liên hệ, khai BHXH" },
  { name: "Ảnh 3×4", required: false, purpose: "Thẻ nhân viên, hồ sơ BHXH" },
  { name: "Sổ BHXH / mã số BHXH", required: false, purpose: "Đóng BHXH", types: ["official"] },
  { name: "Mã số thuế cá nhân", required: false, purpose: "Khấu trừ, quyết toán thuế TNCN" },
  { name: "Thông tin tài khoản ngân hàng", required: true, purpose: "Chi trả lương" },
  { name: "Quyết định thôi việc nơi cũ", required: false, purpose: "Chốt sổ BHXH, thâm niên", types: ["official"] },
  { name: "Giấy tờ người phụ thuộc", required: false, purpose: "Giảm trừ gia cảnh thuế TNCN" },
];

const item = (r: ItemRow): ChecklistItem => ({ id: r.id, name: r.name, required: r.required, employmentTypes: r.employment_types, purpose: r.purpose, sortOrder: r.sort_order, archived: !!r.archived_at });
const applies = (i: { employment_types: EmploymentType[] | null }, t: EmploymentType) => !i.employment_types || i.employment_types.includes(t);
const sorted = (rows: ItemRow[]) => rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi"));

export class ChecklistService {
  private async items(ctx: AdminContext, activeOnly: boolean): Promise<ItemRow[]> {
    let q = ctx.db.from("document_checklist_items").select(ITEM_COLS).eq("tenant_id", ctx.tenantId);
    if (activeOnly) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return sorted((data ?? []) as ItemRow[]);
  }

  /* ---------- Danh mục ---------- */
  async list(ctx: AdminContext): Promise<ChecklistItemList> {
    ctx.require("document.read");
    const rows = await this.items(ctx, false);
    return { items: rows.map(item).sort((a, b) => Number(a.archived) - Number(b.archived)), canManage: ctx.tenantWide("document.manage") };
  }

  private fields(b: Body) {
    const name = nullableText(b, "name", 80);
    if (!name) throw invalid("Nhập tên giấy tờ (ví dụ: CCCD bản sao).");
    const raw = b?.employmentTypes;
    let types: EmploymentType[] | null = null;
    if (raw !== null && raw !== undefined) {
      if (!Array.isArray(raw) || !raw.length || raw.some((t) => !TYPES.includes(t as EmploymentType))) throw invalid("Tình trạng lao động áp dụng không hợp lệ.");
      types = [...new Set(raw as EmploymentType[])];
      if (types.length === TYPES.length) types = null;
    }
    return { name, required: b?.required !== false, employment_types: types, purpose: nullableText(b, "purpose", 200) ?? null,
      sort_order: number(b, "sortOrder", 0, 10000, { integer: true, optional: true }) };
  }

  private taken(e: { code?: string } | null, name: string) {
    if (e?.code === "23505") return conflict(`Đã có giấy tờ "${name}". Đặt tên khác.`);
    return e;
  }

  private async nextOrder(ctx: AdminContext) {
    const { data } = await ctx.db.from("document_checklist_items").select("sort_order").eq("tenant_id", ctx.tenantId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    return Math.min(10000, ((data as { sort_order: number } | null)?.sort_order ?? 0) + 10);
  }

  async create(ctx: AdminContext, b: Body): Promise<ChecklistItemList> {
    ctx.requireTenantWide("document.manage");
    const f = this.fields(b);
    const row = { tenant_id: ctx.tenantId, ...f, sort_order: f.sort_order ?? await this.nextOrder(ctx), created_by: ctx.userId };
    const { data, error } = await ctx.db.from("document_checklist_items").insert(row).select("id").single();
    if (error) throw this.taken(error, f.name);
    await ctx.audit("checklist_item.created", "checklist_item", (data as { id: string }).id, null, { name: f.name, required: f.required, employment_types: f.employment_types });
    return this.list(ctx);
  }

  private async own(ctx: AdminContext, id: string): Promise<ItemRow> {
    if (!UUID.test(id)) throw notFound("giấy tờ");
    const { data, error } = await ctx.db.from("document_checklist_items").select(ITEM_COLS).eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("giấy tờ");
    return data as ItemRow;
  }

  async update(ctx: AdminContext, id: string, b: Body): Promise<ChecklistItemList> {
    ctx.requireTenantWide("document.manage");
    const cur = await this.own(ctx, id);
    const f = this.fields(b);
    const { error } = await ctx.db.from("document_checklist_items").update({ ...f, sort_order: f.sort_order ?? cur.sort_order, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId).eq("id", id);
    if (error) throw this.taken(error, f.name);
    await ctx.audit("checklist_item.updated", "checklist_item", id, { name: cur.name, required: cur.required, employment_types: cur.employment_types },
      { name: f.name, required: f.required, employment_types: f.employment_types });
    return this.list(ctx);
  }

  /* Ngừng dùng / dùng lại (không xóa — giữ trạng thái đã tích của nhân viên) */
  async archive(ctx: AdminContext, id: string, b: Body): Promise<ChecklistItemList> {
    ctx.requireTenantWide("document.manage");
    const cur = await this.own(ctx, id);
    const on = b?.archived === true;
    const { error } = await ctx.db.from("document_checklist_items").update({ archived_at: on ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId).eq("id", id);
    if (error) throw this.taken(error, cur.name);
    await ctx.audit(on ? "checklist_item.archived" : "checklist_item.restored", "checklist_item", id, null, { name: cur.name });
    return this.list(ctx);
  }

  async addTemplates(ctx: AdminContext): Promise<ChecklistItemList> {
    ctx.requireTenantWide("document.manage");
    const have = new Set((await this.items(ctx, true)).map((r) => r.name.trim().toLowerCase()));
    let order = await this.nextOrder(ctx);
    const rows = TEMPLATES.filter((t) => !have.has(t.name.toLowerCase())).map((t) => {
      const r = { tenant_id: ctx.tenantId, name: t.name, required: t.required, purpose: t.purpose, employment_types: t.types ?? null, sort_order: order, created_by: ctx.userId };
      order = Math.min(10000, order + 10);
      return r;
    });
    if (rows.length) {
      const { error } = await ctx.db.from("document_checklist_items").insert(rows);
      if (error) throw error;
      await ctx.audit("checklist_item.templates_added", "tenant", ctx.tenantId, null, { count: rows.length });
    }
    return this.list(ctx);
  }

  /* ---------- Từng nhân viên ---------- */
  async employee(ctx: AdminContext, employeeId: string): Promise<EmployeeChecklist> {
    await ctx.requireEmployee("document.read", employeeId);
    const [{ data: emp, error: e1 }, rows, { data: st, error: e2 }, edit] = await Promise.all([
      ctx.db.from("employees").select("employment_type").eq("tenant_id", ctx.tenantId).eq("id", employeeId).single(),
      this.items(ctx, false),
      ctx.db.from("employee_checklist_status").select(STATUS_COLS).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId),
      ctx.can("document.upload") ? ctx.db.rpc("employee_in_scope", { p_user: ctx.userId, p_tenant: ctx.tenantId, p_perm: "document.upload", p_employee: employeeId }) : Promise.resolve({ data: false }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const type = (emp as { employment_type: EmploymentType }).employment_type;
    const status = new Map(((st ?? []) as StatusRow[]).map((s) => [s.item_id, s]));
    /* Mục đã ngừng chỉ hiện khi nhân viên đã có trạng thái ở mục đó */
    const entries: ChecklistEntry[] = rows.filter((r) => !r.archived_at || status.has(r.id)).map((r) => {
      const s = status.get(r.id);
      return { item: item(r), applies: applies(r, type), status: s?.status ?? null, form: s?.form ?? null, submittedOn: s?.submitted_on ?? null, note: s?.note ?? null, updatedAt: s?.updated_at ?? null };
    });
    const missingRequired = entries.filter((e) => !e.item.archived && e.item.required && e.applies && !e.status).length;
    return { employeeId, employmentType: type, entries, missingRequired, canEdit: (edit as { data: unknown }).data === true };
  }

  async setEntry(ctx: AdminContext, employeeId: string, itemId: string, b: Body): Promise<EmployeeChecklist> {
    await ctx.requireEmployee("document.upload", employeeId);
    const it = await this.own(ctx, itemId);
    const status = b?.status === null || b?.status === undefined ? null : oneOf(b, "status", ["submitted", "waived"] as const)!;
    const { data: before } = await ctx.db.from("employee_checklist_status").select(STATUS_COLS).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).eq("item_id", itemId).maybeSingle();
    const prev = before as StatusRow | null;
    if (!status) {
      if (prev) {
        const { error } = await ctx.db.from("employee_checklist_status").delete().eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).eq("item_id", itemId);
        if (error) throw error;
      }
    } else {
      if (it.archived_at && !prev) throw conflict("Giấy tờ này đã ngừng dùng.");
      let row: Omit<StatusRow, "employee_id" | "item_id" | "updated_at">;
      if (status === "submitted") {
        const form = oneOf(b, "form", FORMS)!;
        const { data: today, error } = await ctx.db.rpc("tenant_today", { p_tenant: ctx.tenantId });
        if (error) throw error;
        const on = date(b, "submittedOn", true) ?? (today as string);
        if (on > (today as string)) throw invalid("Ngày nộp không được sau hôm nay.");
        row = { status, form, submitted_on: on, note: nullableText(b, "note", 200) ?? null };
      } else {
        const note = nullableText(b, "note", 200);
        if (!note) throw invalid("Ghi lý do không áp dụng (ví dụ: chưa có người phụ thuộc).");
        row = { status, form: null, submitted_on: null, note };
      }
      const { error } = await ctx.db.from("employee_checklist_status").upsert({ tenant_id: ctx.tenantId, employee_id: employeeId, item_id: itemId, ...row,
        updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: "employee_id,item_id" });
      if (error) throw error;
    }
    await ctx.audit("checklist.updated", "employee", employeeId, prev ? { item: it.name, status: prev.status, form: prev.form } : { item: it.name, status: null },
      { item: it.name, status, form: status === "submitted" ? b?.form ?? null : null });
    return this.employee(ctx, employeeId);
  }

  /* Nhân viên đang làm trong phạm vi còn thiếu giấy tờ bắt buộc (cho bộ lọc danh sách nhân viên) */
  async gaps(ctx: AdminContext): Promise<ChecklistGaps> {
    ctx.require("document.read");
    const [rows, { data: emps, error }, { data: today, error: e3 }] = await Promise.all([
      this.items(ctx, true),
      ctx.scopedEmployees("document.read", "id, employment_type, status, termination_date"),
      ctx.db.rpc("tenant_today", { p_tenant: ctx.tenantId }),
    ]);
    if (error) throw error;
    if (e3) throw e3;
    const req = rows.filter((r) => r.required);
    if (!req.length) return { rows: [], itemCount: rows.length, requiredCount: 0 };
    const working = ((emps ?? []) as unknown as Array<{ id: string; employment_type: EmploymentType; status: string; termination_date: string | null }>)
      .filter((e) => e.status !== "terminated" && (!e.termination_date || e.termination_date >= (today as string)));
    const done = new Set<string>();
    for (let n = 0; n < working.length; n += 200) {
      const { data, error: e2 } = await ctx.db.from("employee_checklist_status").select("employee_id, item_id").eq("tenant_id", ctx.tenantId)
        .in("employee_id", working.slice(n, n + 200).map((e) => e.id));
      if (e2) throw e2;
      for (const s of (data ?? []) as Array<{ employee_id: string; item_id: string }>) done.add(`${s.employee_id}:${s.item_id}`);
    }
    const out = working.map((e) => {
      const mine = req.filter((r) => applies(r, e.employment_type));
      return { employeeId: e.id, missing: mine.filter((r) => !done.has(`${e.id}:${r.id}`)).map((r) => r.name), required: mine.length };
    }).filter((r) => r.missing.length);
    return { rows: out, itemCount: rows.length, requiredCount: req.length };
  }
}
