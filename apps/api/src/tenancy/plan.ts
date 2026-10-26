/* Gói dịch vụ và giới hạn nhân sự của tenant (docs/plans/console-ops.md phần A).
   Giới hạn = số hồ sơ chưa nghỉ việc; chặn khi HR thêm hồ sơ hoặc đưa hồ sơ đã nghỉ về đang làm. */
import { ADMIN_ERRORS, type PlanCode, type TenantProfile } from "@kavor/contracts";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";

type Db = SupabaseGateway["admin"];
export type PlanRow = { code: PlanCode; name: string; employee_limit: number | null; summary: string; sort: number };

export async function employeeUsage(db: Db, tenantId: string): Promise<number> {
  const { count, error } = await db.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "terminated");
  if (error) throw error;
  return count ?? 0;
}

export async function planOf(db: Db, tenantId: string): Promise<TenantProfile["plan"]> {
  const { data: t, error } = await db.from("tenants").select("plan_code, employee_limit").eq("id", tenantId).single();
  if (error) throw error;
  const [{ data: p }, employees] = await Promise.all([
    db.from("platform_plans").select("name").eq("code", t.plan_code as string).maybeSingle(),
    employeeUsage(db, tenantId),
  ]);
  return { code: t.plan_code as PlanCode, name: (p?.name as string | undefined) ?? (t.plan_code as string), employeeLimit: t.employee_limit as number, employees };
}

/* Gọi trước khi thêm một hồ sơ đang làm việc */
export async function assertEmployeeCapacity(db: Db, tenantId: string) {
  const p = await planOf(db, tenantId);
  if (p.employees >= p.employeeLimit) {
    throw new AuthError(ADMIN_ERRORS.employeeLimitReached, `Công ty đã dùng đủ ${p.employeeLimit} nhân sự của gói ${p.name}. Liên hệ Kavor để nâng gói, hoặc chuyển hồ sơ đã nghỉ sang "Đã nghỉ việc".`, 409);
  }
}
