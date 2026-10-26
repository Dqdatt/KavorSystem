/* Cài đặt doanh nghiệp trên web HR/Admin (ADR 0001 §3–5): thông tin tenant, thương hiệu, liên hệ HR, chính sách nền tảng,
   lịch nghỉ lễ, điều khoản dữ liệu cá nhân và checklist thiết lập ban đầu. Cấu hình cấp công ty cần quyền toàn công ty;
   mọi thao tác ghi có audit trước/sau. */
import type {
  BrandingKind, CompanySettings, HolidayYear, PlatformPolicy, PrivacyOverview, SetupChecklist, SetupStep, SupportContact,
} from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { BRANDING_MAX_BYTES, brandingVersion, sniffImage, type BrandingStore } from "../company/branding.js";
import { calendarsOf, holidaysOf, supportOf } from "../company/company.service.js";
import { currentTerms, toTerms, type TermsRow } from "../company/privacy.js";
import { MFA_REQUIRED_FOR_WEB, conflict, invalid, notFound, type AdminContext } from "./context.js";
import type { ScheduleAdmin } from "./schedule.service.js";
import { planOf } from "../tenancy/plan.js";
import { EMAIL, date, nullableText, number, oneOf, req, text, uuid, type Body } from "./validate.js";

const KINDS: readonly BrandingKind[] = ["logo", "cover"];
const PHONE = /^[0-9+ ().-]{6,20}$/;
const TAX = /^\d{10}(-\d{3})?$/;

type TenantRow = { code: string; display_name: string; legal_name: string | null; tax_code: string | null; timezone: string; currency: string };
type SettingsRow = { branding: Record<string, string>; support_contact: unknown; platform_policy: Record<string, unknown>; attendance_settings: Record<string, unknown>; updated_at: string };
/* Kỳ công mặc định 26 tháng trước → 25 tháng này (PILOT_RULEBOOK §1) */
export const DEFAULT_PERIOD_START_DAY = 26;
export const periodStartDayOf = (attendance: unknown) => {
  const v = (attendance as { periodStartDay?: unknown } | null)?.periodStartDay;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 28 ? v : DEFAULT_PERIOD_START_DAY;
};

export class SettingsAdmin {
  constructor(private readonly sb: SupabaseGateway, private readonly store: BrandingStore, private readonly schedule: ScheduleAdmin) {}

  private async load(ctx: AdminContext): Promise<{ t: TenantRow; s: SettingsRow }> {
    const [{ data: t, error }, { data: s }] = await Promise.all([
      ctx.db.from("tenants").select("code, display_name, legal_name, tax_code, timezone, currency").eq("id", ctx.tenantId).single(),
      ctx.db.from("tenant_settings").select("branding, support_contact, platform_policy, attendance_settings, updated_at").eq("tenant_id", ctx.tenantId).maybeSingle(),
    ]);
    if (error) throw error;
    return { t: t as TenantRow, s: (s as SettingsRow | null) ?? { branding: {}, support_contact: {}, platform_policy: {}, attendance_settings: {}, updated_at: new Date().toISOString() } };
  }

  /* ---------- Thông tin, thương hiệu, liên hệ, chính sách nền tảng ---------- */
  async get(ctx: AdminContext): Promise<CompanySettings> {
    ctx.require("tenant.read");
    const { t, s } = await this.load(ctx);
    const platform: PlatformPolicy = {
      mfaRequired: MFA_REQUIRED_FOR_WEB, employeeWeb: false, sheetsAutoSync: false,
      newsReadReceipt: s.platform_policy.newsReadReceipt !== false,
    };
    return {
      tenant: { code: t.code, displayName: t.display_name, legalName: t.legal_name, taxCode: t.tax_code, timezone: t.timezone, currency: t.currency, plan: await planOf(ctx.db, ctx.tenantId) },
      branding: { logoVersion: brandingVersion(s.branding.logoPath), coverVersion: brandingVersion(s.branding.coverPath) },
      support: supportOf(s.support_contact), platform, attendance: { periodStartDay: periodStartDayOf(s.attendance_settings) },
      updatedAt: s.updated_at, canManage: ctx.tenantWide("tenant.settings.manage"),
    };
  }

  async update(ctx: AdminContext, b: Body): Promise<CompanySettings> {
    ctx.requireTenantWide("tenant.settings.manage");
    const before = await this.get(ctx);
    const tenant: Record<string, unknown> = {};
    const displayName = text(b, "displayName", { min: 2, max: 80, optional: true });
    if (displayName !== undefined) tenant.display_name = displayName;
    const legalName = nullableText(b, "legalName", 200);
    if (legalName !== undefined) tenant.legal_name = legalName;
    const taxCode = nullableText(b, "taxCode", 14);
    if (taxCode !== undefined) {
      if (taxCode && !TAX.test(taxCode)) throw invalid("Mã số thuế gồm 10 chữ số, chi nhánh thêm \"-xxx\".");
      tenant.tax_code = taxCode;
    }
    const settings: Record<string, unknown> = {};
    if (b?.support !== undefined) {
      const sp = (b.support ?? {}) as Body;
      const next: SupportContact = { ...before.support };
      for (const k of ["phone", "email", "hours", "note"] as const) {
        const v = nullableText(sp, k, k === "note" ? 300 : 120);
        if (v !== undefined) next[k] = v;
      }
      if (next.phone && !PHONE.test(next.phone)) throw invalid("Số điện thoại liên hệ không hợp lệ.");
      if (next.email && !EMAIL.test(next.email)) throw invalid("Email liên hệ không hợp lệ.");
      settings.support_contact = next;
    }
    if (b?.platform !== undefined) {
      const p = (b.platform ?? {}) as Body;
      if (typeof p.newsReadReceipt === "boolean") settings.platform_policy = { newsReadReceipt: p.newsReadReceipt };
    }
    if (b?.attendance !== undefined) {
      const a = (b.attendance ?? {}) as Body;
      if (a.periodStartDay !== undefined) {
        const day = number(a, "periodStartDay", 1, 28, { integer: true })!;
        const { s: cur } = await this.load(ctx);
        settings.attendance_settings = { ...cur.attendance_settings, periodStartDay: day };
      }
    }
    if (Object.keys(tenant).length) {
      const { error } = await ctx.db.from("tenants").update(tenant).eq("id", ctx.tenantId);
      if (error) throw error;
    }
    if (Object.keys(settings).length) {
      const { error } = await ctx.db.from("tenant_settings").upsert({ tenant_id: ctx.tenantId, ...settings, updated_by: ctx.userId }, { onConflict: "tenant_id" });
      if (error) throw error;
    }
    const after = await this.get(ctx);
    if (Object.keys(tenant).length || Object.keys(settings).length) {
      await ctx.audit("tenant.settings_updated", "tenant", ctx.tenantId, { tenant: before.tenant, support: before.support, platform: before.platform, attendance: before.attendance }, { tenant: after.tenant, support: after.support, platform: after.platform, attendance: after.attendance });
    }
    return after;
  }

  /* Ảnh gửi lên dạng base64 (≤ 2 MB, PNG/JPEG/WebP nhận dạng theo nội dung file) */
  async uploadBranding(ctx: AdminContext, kind: string, b: Body): Promise<CompanySettings> {
    ctx.requireTenantWide("tenant.settings.manage");
    const k = oneOf({ kind }, "kind", KINDS)!;
    const raw = req(b, "dataBase64", { max: Math.ceil(BRANDING_MAX_BYTES * 1.4) });
    const data = Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64");
    if (!data.length) throw invalid("File ảnh rỗng.");
    if (data.length > BRANDING_MAX_BYTES) throw invalid("Ảnh tối đa 2 MB.");
    const type = sniffImage(data);
    if (!type) throw invalid("Chỉ nhận ảnh PNG, JPEG hoặc WebP.");
    const { s } = await this.load(ctx);
    const path = await this.store.put(ctx.tenantId, k, data, type);
    const old = s.branding[`${k}Path`];
    const { error } = await ctx.db.from("tenant_settings").upsert({ tenant_id: ctx.tenantId, branding: { ...s.branding, [`${k}Path`]: path }, updated_by: ctx.userId }, { onConflict: "tenant_id" });
    if (error) { await this.store.remove(path); throw error; }
    if (old) await this.store.remove(old);
    await ctx.audit(`tenant.${k}_updated`, "tenant", ctx.tenantId, { path: old ?? null }, { path, bytes: data.length, type });
    return this.get(ctx);
  }

  async removeBranding(ctx: AdminContext, kind: string): Promise<CompanySettings> {
    ctx.requireTenantWide("tenant.settings.manage");
    const k = oneOf({ kind }, "kind", KINDS)!;
    const { s } = await this.load(ctx);
    const old = s.branding[`${k}Path`];
    if (old) {
      const { [`${k}Path`]: _, ...rest } = s.branding;
      const { error } = await ctx.db.from("tenant_settings").update({ branding: rest, updated_by: ctx.userId }).eq("tenant_id", ctx.tenantId);
      if (error) throw error;
      await this.store.remove(old);
      await ctx.audit(`tenant.${k}_removed`, "tenant", ctx.tenantId, { path: old }, null);
    }
    return this.get(ctx);
  }

  /* ---------- Lịch nghỉ lễ ---------- */
  async holidays(ctx: AdminContext, year?: number): Promise<HolidayYear> {
    ctx.require("policy.read");
    const y = year ?? Number((await this.schedule.today(ctx)).slice(0, 4));
    const cals = await calendarsOf(ctx.db, ctx.tenantId, y);
    const nat = cals.find((c) => !c.tenant_id);
    return {
      year: y, national: nat ? { name: nat.name, source: nat.source_document, verified: !!nat.verified_at } : null,
      holidays: await holidaysOf(ctx.db, ctx.tenantId, y, cals),
    };
  }

  async addHoliday(ctx: AdminContext, b: Body): Promise<HolidayYear> {
    ctx.requireTenantWide("policy.manage");
    const today = await this.schedule.today(ctx);
    const d = date(b, "date")!;
    const name = req(b, "name", { min: 2, max: 120 });
    const kind = oneOf(b, "kind", ["company", "compensatory"] as const)!;
    const paid = b?.paid === undefined ? true : b.paid === true;
    /* Ngày đã qua đã vào bảng công/lương: không thêm hồi tố */
    this.schedule.notPast(d, today, "date");
    const year = Number(d.slice(0, 4));
    const current = await this.holidays(ctx, year);
    const clash = current.holidays.find((h) => h.date === d);
    if (clash) throw conflict(`Ngày ${d} đã là ngày nghỉ: ${clash.name}.`);
    let { data: cal } = await ctx.db.from("holiday_calendars").select("id").eq("tenant_id", ctx.tenantId).eq("year", year).maybeSingle();
    if (!cal) {
      const r = await ctx.db.from("holiday_calendars").insert({ tenant_id: ctx.tenantId, year, name: `Ngày nghỉ riêng ${year}` }).select("id").single();
      if (r.error) throw r.error;
      cal = r.data;
    }
    const { data, error } = await ctx.db.from("holidays").insert({ calendar_id: (cal as { id: string }).id, holiday_date: d, name, kind, paid, created_by: ctx.userId }).select("id").single();
    if (error?.code === "23505") throw conflict(`Ngày ${d} đã là ngày nghỉ.`);
    if (error) throw error;
    await ctx.audit("holiday.added", "holiday", (data as { id: string }).id, null, { date: d, name, kind, paid });
    return this.holidays(ctx, year);
  }

  async removeHoliday(ctx: AdminContext, id: string, b: Body): Promise<HolidayYear> {
    ctx.requireTenantWide("policy.manage");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("ngày nghỉ");
    const { data } = await ctx.db.from("holidays").select("id, holiday_date, name, kind, paid, holiday_calendars!inner(tenant_id, year)").eq("id", id).maybeSingle();
    const h = data as { holiday_date: string; name: string; kind: string; paid: boolean; holiday_calendars: { tenant_id: string | null; year: number } } | null;
    /* Lịch quốc gia do Kavor duy trì; tenant khác → không tiết lộ */
    if (!h || h.holiday_calendars.tenant_id !== ctx.tenantId) throw notFound("ngày nghỉ của công ty");
    if (h.holiday_date < await this.schedule.today(ctx)) throw invalid("Ngày nghỉ đã qua đã vào bảng công, không xóa được.");
    const { error } = await ctx.db.from("holidays").delete().eq("id", id);
    if (error) throw error;
    await ctx.audit("holiday.removed", "holiday", id, { date: h.holiday_date, name: h.name, kind: h.kind, paid: h.paid }, null, nullableText(b, "reason", 300) ?? null);
    return this.holidays(ctx, h.holiday_calendars.year);
  }

  /* ---------- Điều khoản dữ liệu cá nhân ---------- */
  async privacy(ctx: AdminContext): Promise<PrivacyOverview> {
    ctx.require("privacy.read");
    const [{ data: vs }, { data: cs }, scoped] = await Promise.all([
      ctx.db.from("privacy_terms").select("id, version_no, title, content, published_at").eq("tenant_id", ctx.tenantId).order("version_no", { ascending: false }),
      ctx.db.from("privacy_consents").select("employee_id, terms_id").eq("tenant_id", ctx.tenantId),
      ctx.scopedEmployees("employee.read", "id, employee_code, full_name, user_id, status"),
    ]);
    const versions = (vs ?? []) as TermsRow[];
    const consents = (cs ?? []) as Array<{ employee_id: string; terms_id: string }>;
    const current = versions[0] ?? null;
    const versionOf = new Map(versions.map((v) => [v.id, v.version_no]));
    const last = new Map<string, number>();
    for (const c of consents) last.set(c.employee_id, Math.max(last.get(c.employee_id) ?? 0, versionOf.get(c.terms_id) ?? 0));
    const accounts = ((scoped.data ?? []) as unknown as Array<{ id: string; employee_code: string; full_name: string; user_id: string | null; status: string }>)
      .filter((e) => e.user_id && e.status !== "terminated");
    const pending = accounts.filter((e) => !current || (last.get(e.id) ?? 0) < current.version_no);
    return {
      current: current && toTerms(current),
      versions: versions.map((v) => ({ ...toTerms(v), consents: consents.filter((c) => c.terms_id === v.id).length })),
      accounts: accounts.length, consentedCurrent: accounts.length - pending.length,
      pending: pending.slice(0, 50).map((e) => ({ id: e.id, code: e.employee_code, fullName: e.full_name, lastVersionNo: last.get(e.id) ?? null })),
    };
  }

  /* Công bố phiên bản mới: nhân viên phải đồng ý lại ở lần mở app kế tiếp */
  async publishPrivacy(ctx: AdminContext, b: Body): Promise<PrivacyOverview> {
    ctx.requireTenantWide("tenant.settings.manage");
    const title = req(b, "title", { min: 5, max: 160 });
    const content = req(b, "content", { min: 50, max: 50000 });
    const prev = await currentTerms(ctx.db, ctx.tenantId);
    if (prev && prev.title === title && prev.content.trim() === content) throw conflict("Nội dung giống phiên bản hiện hành.");
    const versionNo = (prev?.version_no ?? 0) + 1;
    const { data, error } = await ctx.db.from("privacy_terms").insert({ tenant_id: ctx.tenantId, version_no: versionNo, title, content, published_by: ctx.userId }).select("id").single();
    if (error?.code === "23505") throw conflict("Vừa có người công bố phiên bản mới. Tải lại trang.");
    if (error) throw error;
    await ctx.audit("privacy.terms_published", "privacy_terms", (data as { id: string }).id, prev ? { version_no: prev.version_no } : null, { version_no: versionNo, title });
    return this.privacy(ctx);
  }

  /* ---------- Checklist thiết lập ban đầu (plan.md §24.1) ---------- */
  async checklist(ctx: AdminContext): Promise<SetupChecklist> {
    ctx.require("tenant.read");
    const db = ctx.db, tid = ctx.tenantId;
    const head = (table: string) => db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tid);
    const today = await this.schedule.today(ctx);
    const [{ t, s }, le, br, de, emp, accepted, terms, admins, assigns, invited] = await Promise.all([
      this.load(ctx), head("legal_entities"), head("branches"), head("departments"),
      head("employees").neq("status", "terminated"), head("attendance_events").eq("status", "accepted"),
      currentTerms(db, tid),
      db.rpc("active_tenant_admin_count", { p_tenant: tid }),
      db.from("policy_assignments").select("kind, scope_type, effective_from, effective_to").eq("tenant_id", tid),
      db.from("role_assignments").select("id, roles!inner(code)", { count: "exact", head: true }).eq("tenant_id", tid).in("roles.code", ["manager", "hr_ops"]),
    ]);
    const n = (r: { count: number | null }) => r.count ?? 0;
    const active = ((assigns.data ?? []) as Array<{ kind: string; effective_from: string; effective_to: string | null }>)
      .filter((a) => a.effective_from <= today && (a.effective_to == null || a.effective_to >= today));
    const has = (kind: string) => active.some((a) => a.kind === kind);
    const adminCount = (admins.data as number) ?? 0;
    const support = supportOf(s.support_contact);
    const missing = [t.legal_name ? null : "tên pháp lý", s.branding.logoPath ? null : "logo", support.phone || support.email ? null : "liên hệ HR"].filter((x): x is string => !!x);
    const step = (key: string, title: string, ok: boolean, detail: string, href: string | null, state?: SetupStep["state"]): SetupStep =>
      ({ key, title, detail, href, state: state ?? (ok ? "done" : "todo") });
    const steps: SetupStep[] = [
      step("company", "Thông tin công ty và thương hiệu", !missing.length, missing.length ? `Còn thiếu: ${missing.join(", ")}.` : "Đã có tên pháp lý, logo và liên hệ HR.", "/settings"),
      step("organization", "Pháp nhân, chi nhánh, phòng ban", n(le) > 0 && n(br) > 0 && n(de) > 0, `${n(le)} pháp nhân · ${n(br)} chi nhánh · ${n(de)} phòng ban.`, "/organization"),
      step("locations", "Địa điểm chấm công", has("work_location"), has("work_location") ? "Đã áp dụng địa điểm chấm công." : "Chưa áp dụng địa điểm nào: nhân viên chưa chấm công được.", "/schedules?tab=locations"),
      step("shifts", "Ca làm việc", has("shift"), has("shift") ? "Đã áp dụng ca làm việc." : "Chưa áp dụng ca nào.", "/schedules?tab=assignments"),
      step("rules", "Quy định giải trình, tạm ứng, nhắc nhở", has("explanation") && has("salary_advance") && has("reminder"), "Kavor đã tạo sẵn mẫu theo luật; xem lại cho phù hợp công ty.", "/settings?tab=rules"),
      step("holidays", "Lịch nghỉ lễ", true, "Lịch quốc gia do Kavor duy trì; thêm ngày nghỉ riêng nếu có.", "/settings?tab=holidays"),
      step("privacy", "Điều khoản dữ liệu cá nhân", !!terms, terms ? `Đang áp dụng phiên bản ${terms.version_no}. Nên nhờ chuyên gia pháp lý rà soát.` : "Chưa có điều khoản: nhân viên chưa đồng ý xử lý dữ liệu.", "/settings?tab=privacy"),
      step("leave", "Chính sách nghỉ phép", has("leave"), has("leave") ? "Đã áp dụng quy định phép năm (mẫu theo Bộ luật Lao động); xem lại định mức, tích lũy, phép tồn." : "Chưa áp dụng quy định phép năm.", "/settings?tab=rules"),
      step("workflow", "Luồng duyệt đơn", true, "Kavor đã tạo sẵn luồng Quản lý → HR cho giải trình và nghỉ phép; đổi trong Đơn & phê duyệt.", "/requests"),
      step("employees", "Nhập nhân viên", n(emp) > 1, `${n(emp)} hồ sơ nhân viên.`, "/employees"),
      step("managers", "Mời quản lý và HR", n(invited) > 0, n(invited) ? "Đã gán vai trò quản lý/HR." : "Chưa có quản lý hoặc HR nào được gán vai trò.", "/employees"),
      step("admins", "Tenant Admin thứ hai", adminCount >= 2, adminCount >= 2 ? `${adminCount} Tenant Admin.` : "Chỉ có 1 Tenant Admin: nên có ít nhất 2 để không mất quyền quản trị.", null, adminCount >= 2 ? "done" : "warn"),
      step("trial", "Chạy thử chấm công", n(accepted) > 0, n(accepted) ? `${n(accepted)} lần chấm công hợp lệ.` : "Chưa có lần chấm công hợp lệ nào.", "/attendance"),
    ];
    const counted = steps.filter((x) => x.state !== "unavailable");
    return { steps, done: counted.filter((x) => x.state === "done").length, total: counted.length };
  }
}

export const yearParam = (v?: string) => (v && /^\d{4}$/.test(v) ? Number(v) : undefined);
export const idParam = (id: string) => uuid({ id }, "id")!;
