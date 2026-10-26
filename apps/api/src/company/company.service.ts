/* Thông tin công ty cho app nhân viên: thương hiệu, liên hệ HR, lịch nghỉ lễ, điều khoản dữ liệu cá nhân (ADR 0001).
   Mobile không còn giữ các giá trị này trong code; công ty đổi trên web là app nhận ở lần mở sau. */
import type { BrandingKind, EmploymentType, EmployeeStatus, Holiday, HolidayKind, MyCompany, MyPolicies, MyProfile, SupportContact } from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { localParts } from "../attendance/attendance.service.js";
import { PolicyIndex, loadPlacements } from "../attendance/policy.js";
import { brandingVersion, type BrandingStore } from "./branding.js";
import { currentTerms, recordConsent, toTerms } from "./privacy.js";

export const supportOf = (raw: unknown): SupportContact => {
  const s = (raw ?? {}) as Partial<Record<keyof SupportContact, unknown>>;
  const v = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return { phone: v(s.phone), email: v(s.email), hours: v(s.hours), note: v(s.note) };
};

type CalendarRow = { id: string; tenant_id: string | null; name: string; source_document: string | null; verified_at: string | null };
/* Lịch của một năm: lịch quốc gia (tenant_id null) + lịch riêng của tenant */
export async function calendarsOf(db: SupabaseGateway["admin"], tenantId: string, year: number): Promise<CalendarRow[]> {
  const { data, error } = await db.from("holiday_calendars").select("id, tenant_id, name, source_document, verified_at").eq("year", year).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
  if (error) throw error;
  return (data ?? []) as CalendarRow[];
}
export async function holidaysOf(db: SupabaseGateway["admin"], tenantId: string, year: number, calendars?: CalendarRow[]): Promise<Holiday[]> {
  const cals = calendars ?? await calendarsOf(db, tenantId, year);
  if (!cals.length) return [];
  const { data, error } = await db.from("holidays").select("id, calendar_id, holiday_date, name, kind, paid").in("calendar_id", cals.map((c) => c.id)).order("holiday_date");
  if (error) throw error;
  const national = new Set(cals.filter((c) => !c.tenant_id).map((c) => c.id));
  return ((data ?? []) as Array<{ id: string; calendar_id: string; holiday_date: string; name: string; kind: HolidayKind; paid: boolean }>)
    .map((h) => ({ id: h.id, date: h.holiday_date, name: h.name, kind: h.kind, paid: h.paid, scope: national.has(h.calendar_id) ? "national" : "company" }));
}

export class CompanyService {
  constructor(private readonly sb: SupabaseGateway, private readonly branding: BrandingStore) {}

  async company(emp: EmployeeRow): Promise<MyCompany> {
    const db = this.sb.admin;
    const [{ data: t }, { data: ts }, terms] = await Promise.all([
      db.from("tenants").select("id, code, display_name, timezone").eq("id", emp.tenant_id).single(),
      db.from("tenant_settings").select("branding, support_contact").eq("tenant_id", emp.tenant_id).maybeSingle(),
      currentTerms(db, emp.tenant_id),
    ]);
    const tz = (t?.timezone as string) ?? "Asia/Ho_Chi_Minh";
    const year = Number(localParts(new Date(), tz).date.slice(0, 4));
    const [holidays, consent] = await Promise.all([
      holidaysOf(db, emp.tenant_id, year),
      db.from("privacy_consents").select("privacy_terms(version_no)").eq("employee_id", emp.id).order("accepted_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const accepted = ((consent.data as { privacy_terms: { version_no: number } | null } | null)?.privacy_terms?.version_no) ?? null;
    const support = supportOf(ts?.support_contact);
    const b = (ts?.branding ?? {}) as { logoPath?: string; coverPath?: string };
    return {
      tenant: { id: emp.tenant_id, code: (t?.code as string) ?? "", name: (t?.display_name as string) ?? "" },
      branding: { logoVersion: brandingVersion(b.logoPath), coverVersion: brandingVersion(b.coverPath) },
      support: support.phone || support.email ? support : null,
      privacy: { required: !!terms && (accepted ?? 0) < terms.version_no, terms: terms && toTerms(terms), acceptedVersionNo: accepted },
      holidays,
    };
  }

  /* Hồ sơ của chính nhân viên (chỉ đọc): phân công hiện hành theo ngày công ty, hợp đồng HR chia sẻ gần nhất */
  async profile(emp: EmployeeRow): Promise<MyProfile> {
    const db = this.sb.admin;
    const { data: t } = await db.from("tenants").select("timezone").eq("id", emp.tenant_id).single();
    const today = localParts(new Date(), (t?.timezone as string) ?? "Asia/Ho_Chi_Minh").date;
    const [{ data: e, error }, placements, { data: doc }] = await Promise.all([
      db.from("employees").select("employee_code, full_name, hire_date, employment_type, status, termination_date, work_email, phone").eq("id", emp.id).single(),
      loadPlacements(db, emp.tenant_id, today, [emp.id]),
      db.from("employee_documents").select("title, expires_on").eq("tenant_id", emp.tenant_id).eq("employee_id", emp.id).eq("category", "contract")
        .eq("visibility", "hr_employee").is("archived_at", null).order("issued_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error || !e) throw new AuthError("NOT_FOUND", "Không tìm thấy hồ sơ.", 404);
    const p = placements.get(emp.id) ?? null;
    const name = async (table: string, id: string | null | undefined, col = "name") => {
      if (!id) return null;
      const { data } = await db.from(table).select(col).eq("id", id).maybeSingle();
      return ((data as Record<string, string> | null)?.[col]) ?? null;
    };
    const [position, department, branch, manager] = await Promise.all([name("positions", p?.position_id), name("departments", p?.department_id), name("branches", p?.branch_id),
      name("employees", p?.manager_employee_id, "full_name")]);
    return {
      employeeCode: e.employee_code as string, fullName: e.full_name as string, position, department, branch, manager,
      hireDate: e.hire_date as string, employmentType: e.employment_type as EmploymentType, status: e.status as EmployeeStatus, terminationDate: (e.termination_date as string | null) ?? null,
      workEmail: (e.work_email as string | null) ?? null, phone: (e.phone as string | null) ?? null,
      contract: doc ? { title: doc.title as string, expiresOn: (doc.expires_on as string | null) ?? null } : null,
    };
  }

  /* Quy định nghiệp vụ áp dụng cho nhân viên vào một ngày (mặc định hôm nay theo múi giờ công ty) */
  async policies(emp: EmployeeRow, date?: string): Promise<MyPolicies> {
    const db = this.sb.admin;
    const { data: t } = await db.from("tenants").select("timezone").eq("id", emp.tenant_id).single();
    const d = date ?? localParts(new Date(), (t?.timezone as string) ?? "Asia/Ho_Chi_Minh").date;
    const [index, placements] = await Promise.all([PolicyIndex.load(db, emp.tenant_id), loadPlacements(db, emp.tenant_id, d, [emp.id])]);
    return { date: d, rules: index.resolveRules(emp.id, placements.get(emp.id) ?? null, d) };
  }

  async consent(emp: EmployeeRow, termsId: string, installationId: string | undefined, ip: string, userAgent: string | undefined, correlationId: string) {
    const db = this.sb.admin;
    const terms = await currentTerms(db, emp.tenant_id);
    /* Chỉ đồng ý được phiên bản hiện hành: app đang hiển thị bản cũ thì tải lại */
    if (!terms || terms.id !== termsId) throw new AuthError("PRIVACY_TERMS_CHANGED", "Điều khoản vừa được cập nhật. Vui lòng đọc lại phiên bản mới.", 409);
    await recordConsent(db, { tenantId: emp.tenant_id, employeeId: emp.id, userId: emp.user_id, termsId, installationId, ip, userAgent });
    await db.from("audit_logs").insert({
      tenant_id: emp.tenant_id, actor_user_id: emp.user_id, actor_type: "user", action: "privacy.consented", resource_type: "employee", resource_id: emp.id,
      after_data: { terms_version: terms.version_no, installation_id: installationId ?? null }, correlation_id: correlationId,
    });
    return { acceptedVersionNo: terms.version_no };
  }

  async brandingImage(tenantId: string, kind: BrandingKind) {
    const { data: ts } = await this.sb.admin.from("tenant_settings").select("branding").eq("tenant_id", tenantId).maybeSingle();
    const path = ((ts?.branding ?? {}) as Record<string, string | undefined>)[`${kind}Path`];
    const img = path ? await this.branding.get(path) : null;
    if (!img) throw new AuthError("NOT_FOUND", "Công ty chưa có ảnh này.", 404);
    return img;
  }
}
