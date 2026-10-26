/* Hồ sơ cá nhân + đề nghị sửa (docs/plans/profile-change.md). Nhân viên đề nghị sửa điện thoại, email cá nhân, địa chỉ, liên hệ khẩn cấp,
   tài khoản ngân hàng; HR duyệt (luồng "profile_change"), duyệt xong trigger SQL áp vào hồ sơ. Số tài khoản đầy đủ chỉ trả cho chính
   nhân viên và người có employee.sensitive.read; nội dung đơn/audit chỉ có 4 số cuối. */
import type { BankAccountView, EmergencyContact, PersonalInfo, ProfileChangeInput, ProfileField, ProfileValues, RequestItem } from "@kavor/contracts";
import { AuthError, type EmployeeRow } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import { conflict, invalid } from "../admin/context.js";
import { EMAIL, type Body } from "../admin/validate.js";
import { localParts } from "../attendance/attendance.service.js";
import { loadPlacements } from "../attendance/policy.js";
import type { RequestsService, Viewer } from "../timesheet/requests.service.js";

type Db = SupabaseGateway["admin"];
type ProfileRow = { employee_id: string; personal_email: string | null; address: string | null; emergency_name: string | null; emergency_phone: string | null; emergency_relation: string | null };
type BankRow = { employee_id: string; bank_name: string; account_no: string; holder: string };
const ORDER: ProfileField[] = ["phone", "personalEmail", "address", "emergency", "bank"];

export const last4 = (accountNo: string) => accountNo.slice(-4);
export const bankView = (b: { bank_name: string; account_no: string; holder: string }, reveal: boolean): BankAccountView =>
  ({ bankName: b.bank_name, holder: b.holder, last4: last4(b.account_no), ...(reveal ? { accountNo: b.account_no } : {}) });

/* Thông tin cá nhân đã duyệt của nhiều nhân viên; reveal: id nhân viên được xem số tài khoản đầy đủ */
export async function loadPersonal(db: Db, tenantId: string, ids: string[], reveal: (id: string) => boolean): Promise<Map<string, PersonalInfo>> {
  const out = new Map<string, PersonalInfo>();
  if (!ids.length) return out;
  const [p, b] = await Promise.all([
    db.from("employee_profiles").select("employee_id, personal_email, address, emergency_name, emergency_phone, emergency_relation").eq("tenant_id", tenantId).in("employee_id", ids),
    db.from("employee_bank_accounts").select("employee_id, bank_name, account_no, holder").eq("tenant_id", tenantId).in("employee_id", ids),
  ]);
  if (p.error) throw p.error;
  if (b.error) throw b.error;
  const prof = new Map(((p.data ?? []) as ProfileRow[]).map((r) => [r.employee_id, r])), bank = new Map(((b.data ?? []) as BankRow[]).map((r) => [r.employee_id, r]));
  for (const id of ids) {
    const r = prof.get(id), k = bank.get(id);
    out.set(id, {
      personalEmail: r?.personal_email ?? null, address: r?.address ?? null,
      emergency: r?.emergency_name ? { name: r.emergency_name, phone: r.emergency_phone ?? "", relation: r.emergency_relation ?? "" } : null,
      bank: k ? bankView(k, reveal(id)) : null,
    });
  }
  return out;
}

/* Chuẩn hóa đầu vào: undefined = không đổi; chuỗi rỗng = xóa (trừ ngân hàng: chỉ thay, không xóa) */
const phoneOf = (v: unknown, field: string) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw invalid(`${field} không hợp lệ.`);
  const t = v.replace(/[\s.()-]/g, "");
  if (!/^\+?[0-9]{8,15}$/.test(t)) throw invalid(`${field} phải là số điện thoại 8–15 chữ số.`);
  return t;
};
const textOf = (v: unknown, field: string, max: number) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.trim().length > max) throw invalid(`${field} tối đa ${max} ký tự.`);
  return v.trim() || null;
};

export function parseChange(b: Body) {
  const out: { phone?: string | null; personalEmail?: string | null; address?: string | null; emergency?: EmergencyContact | null; bank?: { bankName: string; accountNo: string; holder: string } } = {};
  if (b?.phone !== undefined) out.phone = phoneOf(b.phone, "Điện thoại");
  if (b?.personalEmail !== undefined) {
    const e = textOf(b.personalEmail, "Email cá nhân", 200);
    if (e && !EMAIL.test(e)) throw invalid("Email cá nhân không hợp lệ.");
    out.personalEmail = e ? e.toLowerCase() : null;
  }
  if (b?.address !== undefined) out.address = textOf(b.address, "Địa chỉ", 300);
  if (b?.emergency !== undefined) {
    const e = b.emergency as Body | null;
    if (e === null) out.emergency = null;
    else {
      const name = textOf(e?.name, "Tên người liên hệ khẩn cấp", 100), relation = textOf(e?.relation, "Quan hệ", 50), phone = phoneOf(e?.phone, "Điện thoại liên hệ khẩn cấp");
      if (!name || !phone || !relation) throw invalid("Liên hệ khẩn cấp cần đủ họ tên, điện thoại và quan hệ.");
      out.emergency = { name, phone, relation };
    }
  }
  if (b?.bank !== undefined) {
    const k = b.bank as Body | null;
    const bankName = textOf(k?.bankName, "Tên ngân hàng", 100), holder = textOf(k?.holder, "Chủ tài khoản", 100);
    const accountNo = typeof k?.accountNo === "string" ? k.accountNo.replace(/[\s.-]/g, "") : "";
    if (!bankName || !holder) throw invalid("Tài khoản ngân hàng cần đủ tên ngân hàng và chủ tài khoản.");
    if (!/^[0-9]{6,20}$/.test(accountNo)) throw invalid("Số tài khoản gồm 6–20 chữ số.");
    out.bank = { bankName, accountNo, holder: holder.toUpperCase() };
  }
  return { values: out, reason: textOf(b?.reason, "Lý do", 300) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class ProfileService {
  constructor(private readonly sb: SupabaseGateway, private readonly requests: RequestsService) {}

  async createChange(me: EmployeeRow, b: Body, correlationId: string): Promise<RequestItem> {
    const db = this.sb.admin;
    const { values, reason } = parseChange(b);
    const [{ data: emp, error }, personal, { data: bankRow }, { data: pending }, { data: t }] = await Promise.all([
      db.from("employees").select("phone").eq("id", me.id).single(),
      loadPersonal(db, me.tenant_id, [me.id], () => true).then((m) => m.get(me.id)!),
      db.from("employee_bank_accounts").select("bank_name, account_no, holder").eq("employee_id", me.id).maybeSingle(),
      db.from("requests").select("request_no").eq("requester_employee_id", me.id).eq("request_type", "profile_change").eq("status", "pending").maybeSingle(),
      db.from("tenants").select("timezone").eq("id", me.tenant_id).single(),
    ]);
    if (error) throw error;
    if (pending) throw conflict(`Bạn đang có đề nghị sửa thông tin ${pending.request_no as string} chờ HR duyệt. Hủy đề nghị đó nếu muốn gửi lại.`);
    const current: Required<Omit<ProfileValues, "bank">> = { phone: (emp?.phone as string | null) ?? null, personalEmail: personal.personalEmail, address: personal.address, emergency: personal.emergency };
    const cb = bankRow as { bank_name: string; account_no: string; holder: string } | null;
    const fields = ORDER.filter((f) => f === "bank"
      ? !!values.bank && !(cb && cb.bank_name === values.bank.bankName && cb.account_no === values.bank.accountNo && cb.holder === values.bank.holder)
      : values[f] !== undefined && !same(values[f], current[f]));
    if (!fields.length) throw invalid("Không có thông tin nào thay đổi so với hồ sơ hiện tại.");

    const before: ProfileValues = {}, after: ProfileValues = {};
    for (const f of fields) {
      if (f === "bank") { before.bank = cb ? bankView(cb, false) : null; after.bank = { bankName: values.bank!.bankName, holder: values.bank!.holder, last4: last4(values.bank!.accountNo) }; }
      else { (before as Record<string, unknown>)[f] = current[f]; (after as Record<string, unknown>)[f] = values[f]; }
    }
    const today = localParts(new Date(), (t?.timezone as string) ?? "Asia/Ho_Chi_Minh").date;
    const wf = await this.requests.workflowFor(db, me.tenant_id, "profile_change", today);
    if (!wf) throw conflict("Công ty chưa cấu hình luồng duyệt sửa hồ sơ. Liên hệ phòng Nhân sự.");
    const placement = (await loadPlacements(db, me.tenant_id, today, [me.id])).get(me.id) ?? null;
    const tasks = this.requests.planSteps(wf.steps, me.id, placement?.manager_employee_id ?? null);
    const payload = { fields, before, after, reason };
    const { data, error: rpcErr } = await db.rpc("create_profile_change_request", {
      p_tenant: me.tenant_id, p_employee: me.id, p_user: me.user_id, p_workflow_version: wf.id, p_payload: payload,
      p_snapshot: { workflow: { versionNo: wf.version_no, steps: wf.steps } }, p_tasks: tasks, p_bank: values.bank ?? null,
    });
    if (rpcErr && (rpcErr as { code?: string }).code === "23505") throw conflict("Bạn đang có đề nghị sửa thông tin chờ HR duyệt.");
    if (rpcErr) throw new AuthError("INTERNAL_ERROR", "Chưa gửi được đề nghị. Vui lòng thử lại.", 500, true);
    const r = data as { id: string; no: string };
    // Audit chỉ ghi tên trường, không chép giá trị (dữ liệu cá nhân, số tài khoản)
    await db.from("audit_logs").insert({ tenant_id: me.tenant_id, actor_user_id: me.user_id, actor_type: "user", action: "request.submitted", resource_type: "request", resource_id: r.id,
      after_data: { no: r.no, type: "profile_change", fields }, correlation_id: correlationId });
    const v: Viewer = { userId: me.user_id ?? "", employeeId: me.id, tenantId: me.tenant_id, correlationId };
    return (await this.requests.items(db, v, [r.id]))[0]!;
  }
}
