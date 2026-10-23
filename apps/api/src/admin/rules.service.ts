/* Quy định nghiệp vụ có tầng/phiên bản (giải trình, tạm ứng, nhắc nhở) — cùng mô hình với ca/địa điểm (ADR 0001 §2):
   định nghĩa + phiên bản bất biến (sửa = phiên bản mới từ hôm nay trở đi), áp dụng theo tầng qua policy_assignments.
   Cấu hình từng loại kiểm tra bằng checkRuleConfig dùng chung với web. */
import { RULE_KINDS, checkRuleConfig, type RuleKind, type RulePolicy, type RuleVersion } from "@kavor/contracts";
import { PolicyIndex, nextVersion, pickVersion, type RuleVersionRow } from "../attendance/policy.js";
import { conflict, invalid, notFound, type AdminContext } from "./context.js";
import type { ScheduleAdmin } from "./schedule.service.js";
import { date, nullableText, oneOf, req, text, type Body } from "./validate.js";

const KINDS = Object.keys(RULE_KINDS) as RuleKind[];
const CODE = /^[A-Za-z0-9._-]{1,20}$/;

export class RulesAdmin {
  constructor(private readonly schedule: ScheduleAdmin) {}

  async list(ctx: AdminContext): Promise<RulePolicy[]> {
    ctx.require("policy.read");
    const today = await this.schedule.today(ctx);
    const index = await PolicyIndex.load(ctx.db, ctx.tenantId);
    const assignments = await this.schedule.assignments(ctx, undefined, index);
    return [...index.rules.values()].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.code.localeCompare(b.code)).map((r) => {
      const vs = (index.ruleVersions.get(r.id) ?? []).sort((a, b) => b.version_no - a.version_no);
      const cur = pickVersion(vs, today), nxt = nextVersion(vs, today);
      return {
        id: r.id, kind: r.kind, code: r.code, name: r.name, active: r.active,
        current: cur && toVersion(cur), next: nxt && toVersion(nxt), versions: vs.map(toVersion),
        assignments: assignments.filter((a) => a.target.id === r.id),
      };
    });
  }

  private async byId(ctx: AdminContext, id: string) {
    const r = (await this.list(ctx)).find((x) => x.id === id);
    if (!r) throw notFound("quy định");
    return r;
  }

  /* Quy định mới chưa áp dụng cho ai cho tới khi tạo áp dụng (như mẫu ca) */
  async create(ctx: AdminContext, b: Body): Promise<RulePolicy> {
    ctx.requireTenantWide("policy.manage");
    const kind = oneOf(b, "kind", KINDS)!;
    const code = req(b, "code", { pattern: CODE, hint: "1–20 ký tự chữ/số" }).toUpperCase();
    const name = req(b, "name", { min: 2, max: 80 });
    const v = await this.parseVersion(ctx, kind, b);
    const { data, error } = await ctx.db.from("policy_definitions").insert({ tenant_id: ctx.tenantId, kind, code, name }).select("id").single();
    if (error?.code === "23505") throw conflict(`Mã quy định ${code} đã tồn tại.`);
    if (error) throw error;
    const id = (data as { id: string }).id;
    const { error: vErr } = await ctx.db.from("policy_versions").insert({ tenant_id: ctx.tenantId, policy_id: id, version_no: 1, ...v, created_by: ctx.userId });
    if (vErr) throw vErr;
    await ctx.audit("policy.created", "policy", id, null, { kind, code, name, version: { version_no: 1, ...v } });
    return this.byId(ctx, id);
  }

  async addVersion(ctx: AdminContext, id: string, b: Body): Promise<RulePolicy> {
    ctx.requireTenantWide("policy.manage");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("quy định");
    const { data: def } = await ctx.db.from("policy_definitions").select("kind").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!def) throw notFound("quy định");
    const v = await this.parseVersion(ctx, (def as { kind: RuleKind }).kind, b);
    const { data: vs } = await ctx.db.from("policy_versions").select("id, policy_id, version_no, config, effective_from, note, created_at").eq("policy_id", id).order("version_no", { ascending: false });
    const list = (vs ?? []) as RuleVersionRow[];
    if (list.some((x) => x.effective_from === v.effective_from)) throw conflict(`Đã có phiên bản hiệu lực từ ${v.effective_from}.`);
    const no = (list[0]?.version_no ?? 0) + 1;
    const { error } = await ctx.db.from("policy_versions").insert({ tenant_id: ctx.tenantId, policy_id: id, version_no: no, ...v, created_by: ctx.userId });
    if (error) throw error;
    const prev = pickVersion(list, v.effective_from);
    await ctx.audit("policy.version_added", "policy", id, prev && { version_no: prev.version_no, config: prev.config }, { version_no: no, ...v });
    return this.byId(ctx, id);
  }

  async update(ctx: AdminContext, id: string, b: Body): Promise<RulePolicy> {
    ctx.requireTenantWide("policy.manage");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("quy định");
    const { data: before } = await ctx.db.from("policy_definitions").select("name, active").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!before) throw notFound("quy định");
    const patch: Record<string, unknown> = {};
    const name = text(b, "name", { min: 2, max: 80, optional: true });
    if (name !== undefined) patch.name = name;
    if (typeof b?.active === "boolean") patch.active = b.active;
    if (Object.keys(patch).length) {
      const { error } = await ctx.db.from("policy_definitions").update(patch).eq("id", id);
      if (error) throw error;
      await ctx.audit("policy.updated", "policy", id, before, { ...before, ...patch });
    }
    return this.byId(ctx, id);
  }

  private async parseVersion(ctx: AdminContext, kind: RuleKind, b: Body) {
    const { config, problems } = checkRuleConfig(kind, b?.config);
    if (problems.length) throw invalid(problems.join(" "));
    const effectiveFrom = date(b, "effectiveFrom")!;
    this.schedule.notPast(effectiveFrom, await this.schedule.today(ctx));
    return { config, effective_from: effectiveFrom, note: nullableText(b, "note", 300) ?? null };
  }
}

const toVersion = (v: RuleVersionRow): RuleVersion => ({ id: v.id, versionNo: v.version_no, config: v.config, effectiveFrom: v.effective_from, note: v.note, createdAt: v.created_at });
