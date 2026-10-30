/* Điều khoản dữ liệu cá nhân có phiên bản và lượt đồng ý (Nghị định 13/2023/NĐ-CP). Dùng chung cho kích hoạt tài khoản,
   app nhân viên và web HR. */
import type { PrivacyTerms } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";

export type TermsRow = { id: string; version_no: number; title: string; content: string; published_at: string };
export const toTerms = (t: TermsRow): PrivacyTerms => ({ id: t.id, versionNo: t.version_no, title: t.title, content: t.content, publishedAt: t.published_at });

/* Điều khoản hiện hành = phiên bản mới nhất đã công bố */
export async function currentTerms(db: SupabaseGateway["admin"], tenantId: string): Promise<TermsRow | null> {
  const { data } = await db.from("privacy_terms").select("id, version_no, title, content, published_at")
    .eq("tenant_id", tenantId).lte("published_at", new Date().toISOString()).order("version_no", { ascending: false }).limit(1).maybeSingle();
  return (data as TermsRow | null) ?? null;
}

/* Nhân viên chưa đồng ý phiên bản điều khoản hiện hành (công ty chưa có điều khoản thì không chặn) */
export async function consentMissing(db: SupabaseGateway["admin"], tenantId: string, employeeId: string) {
  const terms = await currentTerms(db, tenantId);
  if (!terms) return false;
  const { data } = await db.from("privacy_consents").select("terms_id").eq("employee_id", employeeId).eq("terms_id", terms.id).maybeSingle();
  return !data;
}

/* Ghi một lượt đồng ý (chỉ thêm; đồng ý lại cùng phiên bản thì giữ lượt cũ) */
export async function recordConsent(db: SupabaseGateway["admin"], c: { tenantId: string; employeeId: string; userId: string | null; termsId: string; installationId?: string | null; ip?: string | null; userAgent?: string | null }) {
  const { error } = await db.from("privacy_consents").upsert({
    tenant_id: c.tenantId, employee_id: c.employeeId, user_id: c.userId, terms_id: c.termsId,
    installation_id: c.installationId ?? null, ip: c.ip ?? null, user_agent: c.userAgent?.slice(0, 300) ?? null,
  }, { onConflict: "employee_id,terms_id", ignoreDuplicates: true });
  if (error) throw error;
}

