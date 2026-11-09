/* Tham số luật lương: Console (Kavor) xem/tạo/sửa phiên bản tương lai; web HR/Kế toán xem phiên bản theo ngày và tính thử. */
import type { PayCalcInput, PayCalcResult, PayrollLawParams, PayrollLawVersion } from "@kavor/contracts";
import { forbidden, invalid, notFound, type AdminContext } from "../admin/context.js";
import type { ConsoleContext } from "../console/context.js";
import { date, type Body } from "../admin/validate.js";
import { localParts } from "../attendance/attendance.service.js";
import { computePay } from "./calc.js";
import { checkLawParams, lawAt, lawView } from "./law.js";

type Db = AdminContext["db"];
type Row = { id: string; effective_from: string; params: PayrollLawParams; sources: PayrollLawVersion["sources"]; note: string | null };
const today = () => localParts(new Date(), "Asia/Ho_Chi_Minh").date;

async function rows(db: Db): Promise<Row[]> {
  const { data, error } = await db.from("payroll_law_versions").select("id, effective_from, params, sources, note").order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}
const sourcesOf = (v: unknown): Row["sources"] => (Array.isArray(v) ? v : []).slice(0, 30)
  .filter((s): s is Row["sources"][number] => !!s && typeof s.item === "string" && typeof s.ref === "string")
  .map((s) => ({ item: s.item.slice(0, 100), ref: s.ref.slice(0, 500), verified: s.verified === true }));

/* Tính thử: đầu vào kiểm chặt, luật theo ngày; mục chưa đối chiếu trả kèm để hiện cảnh báo */
export async function previewPay(db: Db, b: Body): Promise<PayCalcResult> {
  const d = date(b, "date", true) ?? today();
  const n = (k: string, max = 10_000_000_000) => { const v = b?.[k]; if (v === undefined || v === null || v === "") return undefined; if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) throw invalid(`${k} không hợp lệ.`); return v; };
  const region = Number(b?.region ?? 1);
  if (![1, 2, 3, 4].includes(region)) throw invalid("Vùng lương tối thiểu 1–4.");
  const gross = n("gross");
  if (gross === undefined) throw invalid("Nhập tổng thu nhập (gross).");
  const law = lawAt(await rows(db), d);
  if (!law) throw invalid(`Chưa có tham số luật hiệu lực ngày ${d}.`);
  const input: PayCalcInput = { date: d, gross, taxFree: n("taxFree"), insuranceSalary: n("insuranceSalary") ?? null, region: region as 1, dependents: n("dependents", 20),
    unionMember: b?.unionMember === true, contract: b?.contract === "casual" ? "casual" : "labor", advance: n("advance") };
  return computePay(input, law.params, law.effective_from, law.sources.filter((s) => !s.verified).map((s) => `${s.item}: ${s.ref}`));
}

export class PayrollLawService {
  /* ---------- Web HR: xem + tính thử (quyền xem lương) ---------- */
  async forTenant(ctx: AdminContext): Promise<PayrollLawVersion[]> {
    ctx.require("compensation.read");
    const all = await rows(ctx.db), t = today();
    return all.map((r) => lawView(r, t, all));
  }
  async previewTenant(ctx: AdminContext, b: Body): Promise<PayCalcResult> {
    ctx.require("compensation.read");
    return previewPay(ctx.db, b);
  }

  /* ---------- Console: chỉ Quản trị Console được ghi ---------- */
  async list(ctx: ConsoleContext): Promise<PayrollLawVersion[]> {
    const all = await rows(ctx.db), t = today();
    return all.map((r) => lawView(r, t, all));
  }
  private admin(ctx: ConsoleContext) { if (ctx.operator.role !== "platform_admin") throw forbidden("Chỉ Quản trị Console được sửa tham số luật."); }
  async create(ctx: ConsoleContext, b: Body): Promise<PayrollLawVersion[]> {
    this.admin(ctx);
    const from = date(b, "effectiveFrom")!;
    if (from <= today()) throw invalid("Phiên bản mới phải hiệu lực từ ngày mai trở đi (phiên bản đã hiệu lực không sửa được).");
    const err = checkLawParams(b?.params);
    if (err) throw invalid(err);
    const note = typeof b?.note === "string" ? b.note.slice(0, 1000) : null;
    const { data, error } = await ctx.db.from("payroll_law_versions").insert({ effective_from: from, params: b.params, sources: sourcesOf(b?.sources), note, created_by: ctx.operator.userId }).select("id").single();
    if (error?.code === "23505") throw invalid(`Đã có phiên bản hiệu lực từ ${from}.`);
    if (error) throw error;
    await ctx.audit("payroll_law.created", "payroll_law_version", (data as { id: string }).id, null, { effective_from: from, params: b.params });
    return this.list(ctx);
  }
  async update(ctx: ConsoleContext, id: string, b: Body): Promise<PayrollLawVersion[]> {
    this.admin(ctx);
    const cur = (await rows(ctx.db)).find((r) => r.id === id);
    if (!cur) throw notFound("phiên bản");
    if (cur.effective_from <= today()) throw invalid("Phiên bản đã hiệu lực không sửa được — tạo phiên bản mới.");
    const err = checkLawParams(b?.params);
    if (err) throw invalid(err);
    const { error } = await ctx.db.from("payroll_law_versions").update({ params: b.params, sources: sourcesOf(b?.sources), note: typeof b?.note === "string" ? b.note.slice(0, 1000) : cur.note, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await ctx.audit("payroll_law.updated", "payroll_law_version", id, { params: cur.params }, { params: b.params });
    return this.list(ctx);
  }
  async preview(_ctx: ConsoleContext, b: Body): Promise<PayCalcResult> { return previewPay(_ctx.db, b); }
}
