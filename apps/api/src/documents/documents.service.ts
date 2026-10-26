/* Tài liệu nhân sự (docs/plans/documents.md). HR xem/tải lên/quản lý theo phạm vi document.read/upload/manage (SQL kiểm lại khi ghi);
   nhân viên xem tài liệu "HR + Nhân viên" của mình (document.self.read). Mỗi lần thay file là phiên bản mới, bất biến; gỡ thay cho xóa.
   Mọi lần tải file đều ghi audit (không chép nội dung/tên file nhạy cảm vào lỗi). Ngày "hôm nay" theo múi giờ công ty. */
import type { DocumentBoard, DocumentCategory, DocumentDetail, DocumentExpiry, DocumentFileType, DocumentVersion, DocumentVisibility,
  EmployeeDocument, MyDocument, MyDocuments } from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, invalid, notFound, type AdminContext } from "../admin/context.js";
import { addDays, date, oneOf, req, text, type Body } from "../admin/validate.js";
import { FILE_MAX_BYTES, PrivateFiles, checkLink, safeName, sha256, signLink, sniffFile } from "../files/private-files.js";

type Db = SupabaseGateway["admin"];
type DocRow = {
  id: string; employee_id: string; category: DocumentCategory; title: string; doc_no: string | null; issued_on: string | null; expires_on: string | null;
  visibility: DocumentVisibility; current_version_id: string; version_count: number; archived_at: string | null; archive_reason: string | null; created_at: string; updated_at: string;
};
type VerRow = { id: string; document_id: string; version_no: number; storage_path: string; file_name: string; mime_type: DocumentFileType; size_bytes: number; sha256: string;
  scan_status: DocumentVersion["scanStatus"]; note: string | null; created_at: string };
const DOC_COLS = "id, employee_id, category, title, doc_no, issued_on, expires_on, visibility, current_version_id, version_count, archived_at, archive_reason, created_at, updated_at";
const VER_COLS = "id, document_id, version_no, storage_path, file_name, mime_type, size_bytes, sha256, scan_status, note, created_at";
const CATEGORIES: DocumentCategory[] = ["contract", "appendix", "decision", "personal", "insurance", "other"];
const UUID = /^[0-9a-f-]{36}$/i;
const SOON_DAYS = 30;

const version = (v: VerRow): DocumentVersion => ({ id: v.id, versionNo: v.version_no, fileName: v.file_name, type: v.mime_type, size: v.size_bytes, sha256: v.sha256,
  scanStatus: v.scan_status, note: v.note, createdAt: v.created_at });
export const expiry = (expiresOn: string | null, today: string): DocumentExpiry =>
  !expiresOn ? "none" : expiresOn < today ? "expired" : expiresOn <= addDays(today, SOON_DAYS) ? "soon" : "valid";

function dbError(e: unknown): never {
  const message = (e as { message?: string }).message ?? "";
  if (message.includes("DOCUMENT_FORBIDDEN")) throw notFound("nhân viên hoặc tài liệu");
  if (message.includes("DOCUMENT_ARCHIVED")) throw conflict("Tài liệu đã gỡ, không sửa được.");
  if (message.includes("DOCUMENT_IMMUTABLE")) throw conflict("Không thay đổi được thông tin này của tài liệu.");
  if ((e as { code?: string }).code === "23514") throw invalid("Thông tin tài liệu không hợp lệ (ngày hết hạn phải sau ngày hiệu lực).");
  throw new AuthError("INTERNAL_ERROR", "Không xử lý được tài liệu. Vui lòng thử lại.", 500, true);
}

/* Hàm chạy theo lô 200 id cho .in() của PostgREST */
async function chunked<T>(ids: string[], fn: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let n = 0; n < ids.length; n += 200) {
    const { data, error } = await fn(ids.slice(n, n + 200));
    if (error) dbError(error);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export class DocumentsService {
  private readonly files: PrivateFiles;
  constructor(private readonly sb: SupabaseGateway) { this.files = new PrivateFiles(sb, "employee-documents"); }

  private async today(db: Db, tenantId: string): Promise<string> {
    const { data, error } = await db.rpc("tenant_today", { p_tenant: tenantId });
    if (error) dbError(error);
    return data as string;
  }

  private async views(db: Db, tenantId: string, rows: DocRow[], today: string): Promise<EmployeeDocument[]> {
    if (!rows.length) return [];
    const empIds = [...new Set(rows.map((r) => r.employee_id))];
    const [vers, emps, deps] = await Promise.all([
      chunked<VerRow>(rows.map((r) => r.current_version_id), (c) => db.from("document_versions").select(VER_COLS).eq("tenant_id", tenantId).in("id", c)),
      chunked<{ id: string; employee_code: string; full_name: string }>(empIds, (c) => db.from("employees").select("id, employee_code, full_name").eq("tenant_id", tenantId).in("id", c)),
      chunked<{ employee_id: string; effective_to: string | null; departments: { name: string } | null }>(empIds, (c) => db.from("employee_assignments")
        .select("employee_id, effective_to, departments(name)").eq("tenant_id", tenantId).eq("is_primary", true).in("employee_id", c).order("effective_from", { ascending: false })),
    ]);
    const v = new Map(vers.map((x) => [x.id, x])), e = new Map(emps.map((x) => [x.id, x])), dep = new Map<string, string>();
    for (const d of deps) if (!d.effective_to && !dep.has(d.employee_id)) dep.set(d.employee_id, d.departments?.name ?? "");
    return rows.map((r) => {
      const emp = e.get(r.employee_id)!;
      return { id: r.id, employee: { id: emp.id, code: emp.employee_code, fullName: emp.full_name, department: dep.get(emp.id) || null },
        category: r.category, title: r.title, docNo: r.doc_no, issuedOn: r.issued_on, expiresOn: r.expires_on, expiry: expiry(r.expires_on, today),
        visibility: r.visibility, current: version(v.get(r.current_version_id)!), versionCount: r.version_count,
        archivedAt: r.archived_at, archiveReason: r.archive_reason, createdAt: r.created_at, updatedAt: r.updated_at };
    });
  }

  /* Tài liệu trong phạm vi document.read của người xem (kèm 404 nếu ngoài phạm vi) */
  private async scopedDoc(ctx: AdminContext, id: string, perm = "document.read"): Promise<DocRow> {
    ctx.require(perm);
    if (!UUID.test(id)) throw notFound("tài liệu");
    const { data, error } = await ctx.db.from("employee_documents").select(DOC_COLS).eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
    if (error) dbError(error);
    if (!data) throw notFound("tài liệu");
    await ctx.requireEmployee(perm, (data as DocRow).employee_id).catch(() => { throw notFound("tài liệu"); });
    return data as DocRow;
  }

  /* ---------- Web HR ---------- */
  async board(ctx: AdminContext, q: { employeeId?: string } = {}): Promise<DocumentBoard> {
    ctx.require("document.read");
    const [ids, today] = await Promise.all([ctx.scopedEmployeeIds("document.read"), this.today(ctx.db, ctx.tenantId)]);
    let query = ctx.db.from("employee_documents").select(DOC_COLS).eq("tenant_id", ctx.tenantId).order("updated_at", { ascending: false }).limit(2000);
    if (q.employeeId) { if (!UUID.test(q.employeeId)) throw notFound("nhân viên"); query = query.eq("employee_id", q.employeeId); }
    const { data, error } = await query;
    if (error) dbError(error);
    const rows = ((data ?? []) as DocRow[]).filter((r) => ids.has(r.employee_id));
    const items = await this.views(ctx.db, ctx.tenantId, rows, today);
    const live = items.filter((d) => !d.archivedAt);
    // Nhân viên đang làm trong phạm vi chưa có hợp đồng lao động còn hiệu lực (chưa gỡ, chưa hết hạn)
    const { data: emps, error: empErr } = await ctx.scopedEmployees("document.read", "id, status, termination_date");
    if (empErr) dbError(empErr);
    const hasContract = new Set(live.filter((d) => d.category === "contract" && d.expiry !== "expired").map((d) => d.employee.id));
    const working = ((emps ?? []) as unknown as Array<{ id: string; status: string; termination_date: string | null }>)
      .filter((x) => x.status !== "terminated" && (!x.termination_date || x.termination_date >= today));
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { count } = await ctx.db.from("audit_logs").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("action", "document.downloaded").gte("created_at", since);
    await ctx.audit("documents.viewed", "tenant", ctx.tenantId, null, { documents: items.length });
    return {
      items,
      metrics: { total: live.length, expiringSoon: live.filter((d) => d.expiry === "soon").length, expired: live.filter((d) => d.expiry === "expired").length,
        missingContract: working.filter((x) => !hasContract.has(x.id)).length, downloadsWeek: count ?? 0 },
      canUpload: ctx.can("document.upload"), canManage: ctx.can("document.manage"),
    };
  }

  async detail(ctx: AdminContext, id: string): Promise<DocumentDetail> {
    const r = await this.scopedDoc(ctx, id);
    const [[item], vers] = await Promise.all([
      this.views(ctx.db, ctx.tenantId, [r], await this.today(ctx.db, ctx.tenantId)),
      ctx.db.from("document_versions").select(VER_COLS).eq("tenant_id", ctx.tenantId).eq("document_id", r.id).order("version_no", { ascending: false }),
    ]);
    if (vers.error) dbError(vers.error);
    const inScope = async (perm: string) => ctx.can(perm) && await ctx.requireEmployee(perm, r.employee_id).then(() => true, () => false);
    const [canUpload, canManage] = await Promise.all([inScope("document.upload"), inScope("document.manage")]);
    return { item: item!, versions: ((vers.data ?? []) as VerRow[]).map(version), canUpload: canUpload && !r.archived_at, canManage: canManage && !r.archived_at };
  }

  private meta(b: Body) {
    const issuedOn = date(b, "issuedOn", true) ?? null, expiresOn = date(b, "expiresOn", true) ?? null;
    if (issuedOn && expiresOn && expiresOn < issuedOn) throw invalid("Ngày hết hạn phải sau ngày hiệu lực.");
    return { category: oneOf(b, "category", CATEGORIES)!, title: req(b, "title", { max: 200 }), docNo: text(b, "docNo", { max: 80, optional: true }) ?? null,
      issuedOn, expiresOn, visibility: oneOf(b, "visibility", ["hr_employee", "hr_only"] as const)! };
  }

  private async upload(ctx: AdminContext, employeeId: string, b: Body) {
    const fileName = safeName(req(b, "fileName", { max: 200 }));
    const raw = req(b, "dataBase64", { max: Math.ceil(FILE_MAX_BYTES * 1.4) });
    const data = Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64");
    if (!data.length) throw invalid("File rỗng.");
    if (data.length > FILE_MAX_BYTES) throw invalid("File tối đa 5 MB.");
    const type = sniffFile(data);
    if (!type) throw invalid("Chỉ nhận file PDF hoặc ảnh PNG, JPEG, WebP.");
    const note = text(b, "note", { max: 500, optional: true }) ?? null;
    const path = await this.files.put(ctx.tenantId, employeeId, data, type);
    return { path, version: { storagePath: path, fileName, mimeType: type, sizeBytes: data.length, sha256: sha256(data), note } };
  }

  async create(ctx: AdminContext, b: Body): Promise<DocumentDetail> {
    const employeeId = typeof b?.employeeId === "string" ? b.employeeId : "";
    await ctx.requireEmployee("document.upload", employeeId);
    const meta = this.meta(b);
    const { path, version: v } = await this.upload(ctx, employeeId, b);
    const { data: id, error } = await ctx.db.rpc("create_employee_document", { p_tenant: ctx.tenantId, p_user: ctx.userId, p_employee: employeeId, p_data: meta, p_version: v });
    if (error) { await this.files.remove(path); dbError(error); }
    await ctx.audit("document.created", "employee_document", id as string, null, { employeeId, category: meta.category, visibility: meta.visibility, bytes: v.sizeBytes, type: v.mimeType });
    return this.detail(ctx, id as string);
  }

  async addVersion(ctx: AdminContext, id: string, b: Body): Promise<DocumentDetail> {
    const r = await this.scopedDoc(ctx, id, "document.upload");
    if (r.archived_at) throw conflict("Tài liệu đã gỡ, không thêm phiên bản được.");
    const { path, version: v } = await this.upload(ctx, r.employee_id, b);
    const { data: n, error } = await ctx.db.rpc("add_document_version", { p_tenant: ctx.tenantId, p_user: ctx.userId, p_document: r.id, p_version: v });
    if (error) { await this.files.remove(path); dbError(error); }
    await ctx.audit("document.version_added", "employee_document", r.id, { versionNo: r.version_count }, { versionNo: n, bytes: v.sizeBytes, type: v.mimeType });
    return this.detail(ctx, r.id);
  }

  async update(ctx: AdminContext, id: string, b: Body): Promise<DocumentDetail> {
    const r = await this.scopedDoc(ctx, id, "document.manage");
    if (r.archived_at) throw conflict("Tài liệu đã gỡ, không sửa được.");
    const m = this.meta(b);
    const { error } = await ctx.db.from("employee_documents").update({ category: m.category, title: m.title, doc_no: m.docNo, issued_on: m.issuedOn, expires_on: m.expiresOn,
      visibility: m.visibility, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq("tenant_id", ctx.tenantId).eq("id", r.id);
    if (error) dbError(error);
    await ctx.audit("document.updated", "employee_document", r.id, { category: r.category, visibility: r.visibility, expiresOn: r.expires_on }, { category: m.category, visibility: m.visibility, expiresOn: m.expiresOn });
    return this.detail(ctx, r.id);
  }

  async archive(ctx: AdminContext, id: string, b: Body): Promise<DocumentDetail> {
    const r = await this.scopedDoc(ctx, id, "document.manage");
    if (r.archived_at) throw conflict("Tài liệu đã gỡ.");
    const reason = req(b, "reason", { min: 5, max: 500 });
    const { error } = await ctx.db.from("employee_documents").update({ archived_at: new Date().toISOString(), archived_by: ctx.userId, archive_reason: reason })
      .eq("tenant_id", ctx.tenantId).eq("id", r.id);
    if (error) dbError(error);
    // Lý do nằm trong bảng tài liệu (phân quyền theo phạm vi); audit chung chỉ giữ cờ
    await ctx.audit("document.archived", "employee_document", r.id, null, { reasonProvided: true });
    return this.detail(ctx, r.id);
  }

  /* Tải một phiên bản (mặc định bản hiện hành); luôn ghi audit */
  async adminFile(ctx: AdminContext, id: string, versionId?: string) {
    const r = await this.scopedDoc(ctx, id);
    const vid = versionId ?? r.current_version_id;
    if (!UUID.test(vid)) throw notFound("phiên bản");
    const { data, error } = await ctx.db.from("document_versions").select(VER_COLS).eq("tenant_id", ctx.tenantId).eq("document_id", r.id).eq("id", vid).maybeSingle();
    if (error) dbError(error);
    if (!data) throw notFound("phiên bản");
    const f = await this.read(data as VerRow);
    await ctx.audit("document.downloaded", "employee_document", r.id, null, { versionNo: (data as VerRow).version_no, by: "hr" });
    return f;
  }

  private async read(v: VerRow) {
    const data = await this.files.get(v.storage_path);
    if (!data) throw notFound("file tài liệu");
    return { data, contentType: v.mime_type, name: v.file_name };
  }

  /* ---------- App nhân viên ---------- */
  private async requireSelf(me: EmployeeRow) {
    const { data, error } = await this.sb.admin.rpc("employee_in_scope", { p_user: me.user_id, p_tenant: me.tenant_id, p_perm: "document.self.read", p_employee: me.id });
    if (error) dbError(error);
    if (data !== true) throw notFound("tài liệu");
  }

  private mineQuery(me: EmployeeRow) {
    return this.sb.admin.from("employee_documents").select(DOC_COLS).eq("tenant_id", me.tenant_id).eq("employee_id", me.id).eq("visibility", "hr_employee").is("archived_at", null);
  }

  async mine(me: EmployeeRow): Promise<MyDocuments> {
    await this.requireSelf(me);
    const db = this.sb.admin;
    const [{ data, error }, today] = await Promise.all([this.mineQuery(me).order("issued_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }), this.today(db, me.tenant_id)]);
    if (error) dbError(error);
    const rows = (data ?? []) as DocRow[];
    const vers = await chunked<VerRow>(rows.map((r) => r.current_version_id), (c) => db.from("document_versions").select(VER_COLS).eq("tenant_id", me.tenant_id).in("id", c));
    const v = new Map(vers.map((x) => [x.id, x]));
    return { items: rows.map((r): MyDocument => {
      const cur = v.get(r.current_version_id)!;
      return { id: r.id, category: r.category, title: r.title, docNo: r.doc_no, issuedOn: r.issued_on, expiresOn: r.expires_on, expiry: expiry(r.expires_on, today),
        versionNo: cur.version_no, fileName: cur.file_name, type: cur.mime_type, size: cur.size_bytes, updatedAt: r.updated_at };
    }) };
  }

  /* Liên kết tải bản hiện hành (5 phút) để app mở bằng trình duyệt hệ thống; đường dẫn tương đối với /api/v1 */
  async fileLink(me: EmployeeRow, id: string): Promise<{ path: string; expiresAt: string }> {
    await this.requireSelf(me);
    if (!UUID.test(id)) throw notFound("tài liệu");
    const { data, error } = await this.mineQuery(me).eq("id", id).maybeSingle();
    if (error) dbError(error);
    if (!data) throw notFound("tài liệu");
    const { exp, sig } = signLink("document", id, me.id, Date.now());
    return { path: `me/documents/${id}/file?e=${me.id}&exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /* Tải theo liên kết đã ký: kiểm chữ ký rồi kiểm lại quyền và trạng thái tài liệu (có thể vừa bị gỡ/đổi sang "Chỉ HR") */
  async linkedFile(id: string, employeeId: string, exp: number, sig: string, correlationId: string) {
    if (!UUID.test(id) || !UUID.test(employeeId) || !checkLink("document", id, employeeId, exp, sig)) throw notFound("tài liệu");
    const { data: me, error } = await this.sb.admin.from("employees").select("id, tenant_id, employee_code, full_name, work_email, user_id, status").eq("id", employeeId).maybeSingle();
    if (error) dbError(error);
    if (!me) throw notFound("tài liệu");
    const emp = me as EmployeeRow;
    await this.requireSelf(emp);
    const { data: doc, error: docErr } = await this.mineQuery(emp).eq("id", id).maybeSingle();
    if (docErr) dbError(docErr);
    if (!doc) throw notFound("tài liệu");
    const { data: v, error: vErr } = await this.sb.admin.from("document_versions").select(VER_COLS).eq("id", (doc as DocRow).current_version_id).single();
    if (vErr) dbError(vErr);
    const f = await this.read(v as VerRow);
    const { error: aErr } = await this.sb.admin.from("audit_logs").insert({ tenant_id: emp.tenant_id, actor_user_id: emp.user_id, actor_type: "user", action: "document.downloaded",
      resource_type: "employee_document", resource_id: id, after_data: { versionNo: (v as VerRow).version_no, by: "self" }, correlation_id: correlationId });
    if (aErr) dbError(aErr);
    return f;
  }
}

