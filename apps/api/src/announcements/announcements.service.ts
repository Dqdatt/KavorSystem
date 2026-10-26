/* Bản tin nội bộ (docs/plans/announcements.md). HR soạn/xuất bản/gỡ: cần announcement.publish toàn công ty (hàm SQL kiểm lại).
   Nhân viên đọc bài gửi tới mình (announcement.read); mở bài = đã đọc. Người nhận tính bằng hàm SQL announcement_recipients
   (cùng hàm RLS dùng). Một file đính kèm/bài; app mở file qua liên kết ký ngắn hạn. Audit không chép nội dung bài. */
import { ANNOUNCEMENT_MAX_BYTES, type AnnouncementAdmin, type AnnouncementAttachment, type AnnouncementBoard, type AnnouncementCategory,
  type AnnouncementDetail, type AnnouncementReader, type AnnouncementStatus, type AnnouncementUnit, type MyAnnouncement, type MyAnnouncements } from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import { oneOf, req, text, type Body } from "../admin/validate.js";
import { PrivateFiles, checkLink, signLink, sniffFile } from "../files/private-files.js";

type Db = SupabaseGateway["admin"];
type Row = {
  id: string; category: AnnouncementCategory; title: string; body: string; author_label: string; important: boolean; pinned: boolean; notify: boolean;
  audience: "tenant" | "units"; attachment_path: string | null; attachment_name: string | null; attachment_type: AnnouncementAttachment["type"] | null;
  attachment_size: number | null; publish_at: string | null; notified_at: string | null; archived_at: string | null; created_at: string; updated_at: string;
};
const COLS = "id, category, title, body, author_label, important, pinned, notify, audience, attachment_path, attachment_name, attachment_type, attachment_size, publish_at, notified_at, archived_at, created_at, updated_at";
const CATEGORIES: AnnouncementCategory[] = ["notice", "policy", "event"];
const UUID = /^[0-9a-f-]{36}$/i;
const LIST_LIMIT = 200;

const status = (r: Row, now = Date.now()): AnnouncementStatus =>
  r.archived_at ? "archived" : !r.publish_at ? "draft" : Date.parse(r.publish_at) > now ? "scheduled" : "published";
const attachment = (r: Row): AnnouncementAttachment | null =>
  r.attachment_path && r.attachment_name && r.attachment_type ? { name: r.attachment_name, type: r.attachment_type, size: r.attachment_size ?? 0 } : null;

function dbError(e: unknown): never {
  const message = (e as { message?: string }).message ?? "";
  if (message.includes("ANNOUNCEMENT_FORBIDDEN")) throw forbidden("Đăng bản tin cần quyền ở phạm vi toàn công ty.");
  if (message.includes("ANNOUNCEMENT_NOT_FOUND")) throw notFound("bài viết");
  if (message.includes("ANNOUNCEMENT_AUDIENCE_REQUIRED")) throw invalid("Chọn ít nhất một chi nhánh hoặc phòng ban nhận bài.");
  if (message.includes("ANNOUNCEMENT_UNIT_INVALID")) throw invalid("Chi nhánh/phòng ban nhận bài không thuộc công ty.");
  if (/ANNOUNCEMENT_(ARCHIVED|PUBLISHED|NOT_PUBLISHABLE)/.test(message)) throw conflict("Bài viết đã xuất bản hoặc đã gỡ, không thực hiện được thao tác này.");
  throw new AuthError("INTERNAL_ERROR", "Không xử lý được bản tin. Vui lòng thử lại.", 500, true);
}

export class AnnouncementsService {
  private readonly files: PrivateFiles;
  constructor(private readonly sb: SupabaseGateway) { this.files = new PrivateFiles(sb, "announcement-files"); }

  private async recipients(db: Db, id: string): Promise<string[]> {
    const { data, error } = await db.rpc("announcement_recipients", { p_announcement: id });
    if (error) dbError(error);
    return ((data ?? []) as Array<string | { announcement_recipients: string }>).map((x) => (typeof x === "string" ? x : x.announcement_recipients));
  }

  private async row(db: Db, tenantId: string, id: string): Promise<Row> {
    if (!UUID.test(id)) throw notFound("bài viết");
    const { data, error } = await db.from("announcements").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (error) dbError(error);
    if (!data) throw notFound("bài viết");
    return data as Row;
  }

  private async units(db: Db, tenantId: string): Promise<AnnouncementUnit[]> {
    const [b, d] = await Promise.all([
      db.from("branches").select("id, name").eq("tenant_id", tenantId).order("name"),
      db.from("departments").select("id, name").eq("tenant_id", tenantId).order("name"),
    ]);
    if (b.error) dbError(b.error);
    if (d.error) dbError(d.error);
    return [...(b.data ?? []).map((x) => ({ type: "branch" as const, id: x.id as string, name: x.name as string })), ...(d.data ?? []).map((x) => ({ type: "department" as const, id: x.id as string, name: x.name as string }))];
  }

  private async views(db: Db, tenantId: string, rows: Row[]): Promise<AnnouncementAdmin[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [aud, units, stats] = await Promise.all([
      db.from("announcement_audiences").select("announcement_id, scope_type, scope_id").eq("tenant_id", tenantId).in("announcement_id", ids),
      this.units(db, tenantId),
      Promise.all(rows.map(async (r) => {
        const [recipients, { count, error }] = await Promise.all([
          this.recipients(db, r.id),
          db.from("announcement_reads").select("employee_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("announcement_id", r.id),
        ]);
        if (error) dbError(error);
        return [r.id, { recipients: recipients.length, reads: count ?? 0 }] as const;
      })),
    ]);
    if (aud.error) dbError(aud.error);
    const names = new Map(units.map((u) => [`${u.type}:${u.id}`, u.name]));
    const counts = new Map(stats);
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id, category: r.category, title: r.title, body: r.body, authorLabel: r.author_label, important: r.important, pinned: r.pinned, notify: r.notify,
      audience: r.audience,
      units: (aud.data ?? []).filter((a) => a.announcement_id === r.id).map((a) => ({ type: a.scope_type as AnnouncementUnit["type"], id: a.scope_id as string, name: names.get(`${a.scope_type}:${a.scope_id}`) ?? "—" })),
      attachment: attachment(r), status: status(r, now), publishAt: r.publish_at, notifiedAt: r.notified_at, archivedAt: r.archived_at,
      createdAt: r.created_at, updatedAt: r.updated_at, ...(counts.get(r.id) ?? { recipients: 0, reads: 0 }),
    }));
  }

  /* ---------- Web HR ---------- */
  async board(ctx: AdminContext): Promise<AnnouncementBoard> {
    ctx.requireTenantWide("announcement.publish");
    const { data, error } = await ctx.db.from("announcements").select(COLS).eq("tenant_id", ctx.tenantId)
      .order("publish_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false }).limit(LIST_LIMIT);
    if (error) dbError(error);
    const [items, units] = await Promise.all([this.views(ctx.db, ctx.tenantId, (data ?? []) as Row[]), this.units(ctx.db, ctx.tenantId)]);
    return { items, units };
  }

  async detail(ctx: AdminContext, id: string): Promise<AnnouncementDetail> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    const [[item], ids, reads] = await Promise.all([
      this.views(ctx.db, ctx.tenantId, [r]), this.recipients(ctx.db, r.id),
      ctx.db.from("announcement_reads").select("employee_id, read_at").eq("tenant_id", ctx.tenantId).eq("announcement_id", r.id),
    ]);
    if (reads.error) dbError(reads.error);
    const readAt = new Map((reads.data ?? []).map((x) => [x.employee_id as string, x.read_at as string]));
    const readers: AnnouncementReader[] = [];
    for (let n = 0; n < ids.length; n += 200) {
      const chunk = ids.slice(n, n + 200);
      const [emps, deps] = await Promise.all([
        ctx.db.from("employees").select("id, employee_code, full_name").eq("tenant_id", ctx.tenantId).in("id", chunk),
        ctx.db.from("employee_assignments").select("employee_id, effective_to, departments(name)").eq("tenant_id", ctx.tenantId).eq("is_primary", true).in("employee_id", chunk).order("effective_from", { ascending: false }),
      ]);
      if (emps.error) dbError(emps.error);
      const dep = new Map<string, string>();
      for (const d of (deps.data ?? []) as unknown as Array<{ employee_id: string; effective_to: string | null; departments: { name: string } | null }>) if (!d.effective_to && !dep.has(d.employee_id)) dep.set(d.employee_id, d.departments?.name ?? "");
      for (const e of emps.data ?? []) readers.push({ id: e.id as string, code: e.employee_code as string, fullName: e.full_name as string, department: dep.get(e.id as string) || null, readAt: readAt.get(e.id as string) ?? null });
    }
    readers.sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || a.code.localeCompare(b.code));
    return { item: item!, readers };
  }

  private input(b: Body) {
    const audience = oneOf(b, "audience", ["tenant", "units"] as const)!;
    const raw = b?.units ?? [];
    if (!Array.isArray(raw) || raw.length > 50) throw invalid("Danh sách đơn vị nhận không hợp lệ.");
    const units = raw.map((u) => {
      const x = u as Body;
      if (!x || (x.type !== "branch" && x.type !== "department") || typeof x.id !== "string" || !UUID.test(x.id)) throw invalid("Danh sách đơn vị nhận không hợp lệ.");
      return { type: x.type, id: x.id };
    });
    for (const k of ["important", "pinned", "notify"]) if (b?.[k] !== undefined && typeof b[k] !== "boolean") throw invalid(`Trường "${k}" không hợp lệ.`);
    const body = b?.body ?? "";
    if (typeof body !== "string" || body.length > 20000) throw invalid("Nội dung tối đa 20.000 ký tự.");
    return {
      data: {
        category: oneOf(b, "category", CATEGORIES)!, title: req(b, "title", { max: 200 }), body: body.trim(),
        authorLabel: text(b, "authorLabel", { max: 80, optional: true }) ?? "Phòng Nhân sự",
        important: b?.important === true, pinned: b?.pinned === true, notify: b?.notify === true, audience,
      },
      units: audience === "units" ? units : [],
    };
  }

  private async item(ctx: AdminContext, id: string) { return (await this.views(ctx.db, ctx.tenantId, [await this.row(ctx.db, ctx.tenantId, id)]))[0]!; }

  async create(ctx: AdminContext, b: Body): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const { data, units } = this.input(b);
    const { data: id, error } = await ctx.db.rpc("save_announcement", { p_tenant: ctx.tenantId, p_user: ctx.userId, p_id: null, p_data: data, p_units: units });
    if (error) dbError(error);
    await ctx.audit("announcement.created", "announcement", id as string, null, { category: data.category, audience: data.audience, units: units.length });
    return this.item(ctx, id as string);
  }

  async update(ctx: AdminContext, id: string, b: Body): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    if (r.archived_at) throw conflict("Bài đã gỡ, không sửa được.");
    const { data, units } = this.input(b);
    const { error } = await ctx.db.rpc("save_announcement", { p_tenant: ctx.tenantId, p_user: ctx.userId, p_id: r.id, p_data: data, p_units: units });
    if (error) dbError(error);
    await ctx.audit("announcement.updated", "announcement", r.id, { status: status(r) }, { category: data.category, audience: data.audience, units: units.length });
    return this.item(ctx, r.id);
  }

  /* publishAt: ISO có múi giờ; không có = xuất bản ngay. Hẹn tối đa 1 năm. */
  async publish(ctx: AdminContext, id: string, b: Body): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    const raw = b?.publishAt;
    let at: string | null = null;
    if (raw !== undefined && raw !== null && raw !== "") {
      const t = typeof raw === "string" && /T.*(Z|[+-]\d{2}:\d{2})$/.test(raw) ? Date.parse(raw) : NaN;
      if (Number.isNaN(t)) throw invalid("Giờ xuất bản không hợp lệ.");
      if (t < Date.now() - 60_000 || t > Date.now() + 366 * 86400_000) throw invalid("Giờ hẹn phải từ bây giờ tới tối đa một năm.");
      at = new Date(t).toISOString();
    }
    const { error } = await ctx.db.rpc("publish_announcement", { p_tenant: ctx.tenantId, p_user: ctx.userId, p_id: r.id, p_at: at });
    if (error) dbError(error);
    await ctx.audit("announcement.published", "announcement", r.id, { status: status(r) }, { scheduled: !!at, notify: r.notify });
    return this.item(ctx, r.id);
  }

  /* Bài hẹn giờ chưa tới giờ → về nháp */
  async unschedule(ctx: AdminContext, id: string): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    const { data, error } = await ctx.db.from("announcements").update({ publish_at: null, published_by: null, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId).eq("id", r.id).is("archived_at", null).gt("publish_at", new Date().toISOString()).select("id");
    if (error) dbError(error);
    if (!data?.length) throw conflict("Chỉ hủy hẹn được bài chưa tới giờ xuất bản.");
    await ctx.audit("announcement.unscheduled", "announcement", r.id, { publishAt: r.publish_at }, null);
    return this.item(ctx, r.id);
  }

  async archive(ctx: AdminContext, id: string): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    const now = new Date().toISOString();
    const { data, error } = await ctx.db.from("announcements").update({ archived_at: now, archived_by: ctx.userId })
      .eq("tenant_id", ctx.tenantId).eq("id", r.id).is("archived_at", null).lte("publish_at", now).select("id");
    if (error) dbError(error);
    if (!data?.length) throw conflict("Chỉ gỡ được bài đang xuất bản.");
    await ctx.audit("announcement.archived", "announcement", r.id, { status: status(r) }, null);
    return this.item(ctx, r.id);
  }

  /* Xóa nháp hoặc bài hẹn chưa tới giờ (chưa ai thấy); bài đã xuất bản chỉ gỡ */
  async remove(ctx: AdminContext, id: string): Promise<{ id: string }> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    if (r.publish_at && Date.parse(r.publish_at) <= Date.now()) throw conflict("Bài đã xuất bản không xóa được, hãy gỡ bài.");
    const { error } = await ctx.db.from("announcements").delete().eq("tenant_id", ctx.tenantId).eq("id", r.id);
    if (error) dbError(error);
    if (r.attachment_path) await this.files.remove(r.attachment_path);
    await ctx.audit("announcement.deleted", "announcement", r.id, { status: status(r) }, null);
    return { id: r.id };
  }

  async uploadAttachment(ctx: AdminContext, id: string, b: Body): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    if (r.archived_at) throw conflict("Bài đã gỡ, không sửa được.");
    const name = req(b, "fileName", { max: 200 }).replace(/[\\/\r\n\t]/g, "_");
    const raw = req(b, "dataBase64", { max: Math.ceil(ANNOUNCEMENT_MAX_BYTES * 1.4) });
    const data = Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64");
    if (!data.length) throw invalid("File rỗng.");
    if (data.length > ANNOUNCEMENT_MAX_BYTES) throw invalid("File tối đa 5 MB.");
    const type = sniffFile(data);
    if (!type) throw invalid("Chỉ nhận file PDF hoặc ảnh PNG, JPEG, WebP.");
    const path = await this.files.put(ctx.tenantId, r.id, data, type);
    const { error } = await ctx.db.from("announcements").update({ attachment_path: path, attachment_name: name, attachment_type: type, attachment_size: data.length, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId).eq("id", r.id);
    if (error) { await this.files.remove(path); dbError(error); }
    if (r.attachment_path) await this.files.remove(r.attachment_path);
    await ctx.audit("announcement.attachment_updated", "announcement", r.id, { hadFile: !!r.attachment_path }, { bytes: data.length, type });
    return this.item(ctx, r.id);
  }

  async removeAttachment(ctx: AdminContext, id: string): Promise<AnnouncementAdmin> {
    ctx.requireTenantWide("announcement.publish");
    const r = await this.row(ctx.db, ctx.tenantId, id);
    if (r.archived_at) throw conflict("Bài đã gỡ, không sửa được.");
    if (!r.attachment_path) return this.item(ctx, r.id);
    const { error } = await ctx.db.from("announcements").update({ attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId).eq("id", r.id);
    if (error) dbError(error);
    await this.files.remove(r.attachment_path);
    await ctx.audit("announcement.attachment_removed", "announcement", r.id, null, null);
    return this.item(ctx, r.id);
  }

  async adminFile(ctx: AdminContext, id: string) {
    ctx.requireTenantWide("announcement.publish");
    return this.file(await this.row(ctx.db, ctx.tenantId, id));
  }

  private async file(r: Row) {
    if (!r.attachment_path || !r.attachment_type || !r.attachment_name) throw notFound("file đính kèm");
    const data = await this.files.get(r.attachment_path);
    if (!data) throw notFound("file đính kèm");
    return { data, contentType: r.attachment_type, name: r.attachment_name };
  }

  /* ---------- App nhân viên ---------- */
  private async requireReader(me: EmployeeRow) {
    const { data, error } = await this.sb.admin.rpc("employee_in_scope", { p_user: me.user_id, p_tenant: me.tenant_id, p_perm: "announcement.read", p_employee: me.id });
    if (error) dbError(error);
    if (data !== true) throw notFound("bản tin");
  }

  private async visible(id: string, employeeId: string) {
    const { data, error } = await this.sb.admin.rpc("announcement_visible", { p_announcement: id, p_employee: employeeId });
    if (error) dbError(error);
    return data === true;
  }

  private mine1(r: Row, readAt: string | null): MyAnnouncement {
    return { id: r.id, category: r.category, title: r.title, body: r.body, authorLabel: r.author_label, important: r.important, pinned: r.pinned,
      publishAt: r.publish_at!, attachment: attachment(r), readAt };
  }

  async mine(me: EmployeeRow): Promise<MyAnnouncements> {
    await this.requireReader(me);
    const db = this.sb.admin;
    const { data, error } = await db.from("announcements").select(COLS).eq("tenant_id", me.tenant_id).is("archived_at", null)
      .lte("publish_at", new Date().toISOString()).order("publish_at", { ascending: false }).limit(LIST_LIMIT);
    if (error) dbError(error);
    const rows = (data ?? []) as Row[];
    // Bài toàn công ty: mọi nhân viên đang làm (đã đăng nhập được) đều nhận; bài theo đơn vị kiểm bằng SQL
    const ok = await Promise.all(rows.map((r) => (r.audience === "tenant" ? true : this.visible(r.id, me.id))));
    const shown = rows.filter((_, i) => ok[i]);
    const { data: reads, error: readErr } = shown.length
      ? await db.from("announcement_reads").select("announcement_id, read_at").eq("employee_id", me.id).in("announcement_id", shown.map((r) => r.id))
      : { data: [], error: null };
    if (readErr) dbError(readErr);
    const readAt = new Map((reads ?? []).map((x) => [x.announcement_id as string, x.read_at as string]));
    return { items: shown.map((r) => this.mine1(r, readAt.get(r.id) ?? null)) };
  }

  /* Mở bài = đã đọc (ghi một lần) */
  async one(me: EmployeeRow, id: string): Promise<MyAnnouncement> {
    await this.requireReader(me);
    const r = await this.row(this.sb.admin, me.tenant_id, id);
    if (!await this.visible(r.id, me.id)) throw notFound("bản tin");
    const { error } = await this.sb.admin.from("announcement_reads").upsert({ announcement_id: r.id, tenant_id: me.tenant_id, employee_id: me.id }, { onConflict: "announcement_id,employee_id", ignoreDuplicates: true });
    if (error) dbError(error);
    const { data } = await this.sb.admin.from("announcement_reads").select("read_at").eq("announcement_id", r.id).eq("employee_id", me.id).maybeSingle();
    return this.mine1(r, (data?.read_at as string | undefined) ?? new Date().toISOString());
  }

  /* Liên kết tải file (5 phút) để app mở bằng trình duyệt hệ thống; đường dẫn tương đối với /api/v1 */
  async fileLink(me: EmployeeRow, id: string): Promise<{ path: string; expiresAt: string }> {
    await this.requireReader(me);
    const r = await this.row(this.sb.admin, me.tenant_id, id);
    if (!r.attachment_path || !await this.visible(r.id, me.id)) throw notFound("file đính kèm");
    const { exp, sig } = signLink("announcement", r.id, me.id, Date.now());
    return { path: `me/announcements/${r.id}/file?e=${me.id}&exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /* Tải theo liên kết đã ký: kiểm chữ ký rồi kiểm lại người đó vẫn được xem bài */
  async linkedFile(id: string, employeeId: string, exp: number, sig: string) {
    if (!UUID.test(id) || !UUID.test(employeeId) || !checkLink("announcement", id, employeeId, exp, sig)) throw notFound("file đính kèm");
    const { data: e, error } = await this.sb.admin.from("employees").select("tenant_id").eq("id", employeeId).maybeSingle();
    if (error) dbError(error);
    if (!e || !await this.visible(id, employeeId)) throw notFound("file đính kèm");
    return this.file(await this.row(this.sb.admin, e.tenant_id as string, id));
  }
}
