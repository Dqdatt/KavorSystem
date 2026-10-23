import assert from "node:assert/strict";
import test from "node:test";
import { nextVersion, pickTier, pickVersion, type AssignmentRow, type Placement } from "./policy.js";

const a = (id: string, scope_type: AssignmentRow["scope_type"], scope_id: string | null, effective_from = "2026-01-01", effective_to: string | null = null, kind: AssignmentRow["kind"] = "shift"): AssignmentRow =>
  ({ id, kind, target_id: `t-${id}`, scope_type, scope_id, effective_from, effective_to, reason: null, created_at: effective_from, created_by: null });
const placement: Placement = { legal_entity_id: "le", branch_id: "br", department_id: "dep", position_id: "pos", manager_employee_id: null, effective_from: "2025-01-01" };

test("tầng cao nhất thắng: cá nhân > phòng ban > chi nhánh > pháp nhân > công ty", () => {
  const all = [a("t", "tenant", null), a("le", "legal_entity", "le"), a("br", "branch", "br"), a("dep", "department", "dep"), a("emp", "employee", "e1")];
  assert.equal(pickTier(all, "shift", "e1", placement, "2026-10-23")[0]?.id, "emp");
  assert.equal(pickTier(all, "shift", "e2", placement, "2026-10-23")[0]?.id, "dep");
  assert.equal(pickTier(all.slice(0, 3), "shift", "e2", placement, "2026-10-23")[0]?.id, "br");
  /* Chưa có phân công tổ chức: chỉ tầng công ty và cá nhân */
  assert.equal(pickTier(all, "shift", "e2", null, "2026-10-23")[0]?.id, "t");
});

test("áp dụng ngoài khoảng hiệu lực hoặc của phòng ban khác bị bỏ qua", () => {
  const all = [a("t", "tenant", null), a("dep-old", "department", "dep", "2026-01-01", "2026-06-30"), a("dep-future", "department", "dep", "2026-11-01"), a("other", "department", "x")];
  assert.equal(pickTier(all, "shift", "e1", placement, "2026-10-23")[0]?.id, "t");
  assert.equal(pickTier(all, "shift", "e1", placement, "2026-03-01")[0]?.id, "dep-old");
  assert.equal(pickTier(all, "shift", "e1", placement, "2026-11-01")[0]?.id, "dep-future");
});

test("địa điểm: lấy mọi áp dụng cùng tầng; loại chính sách khác không lẫn", () => {
  const all = [a("l1", "branch", "br", "2026-01-01", null, "work_location"), a("l2", "branch", "br", "2026-02-01", null, "work_location"), a("s", "branch", "br")];
  const got = pickTier(all, "work_location", "e1", placement, "2026-10-23").map((x) => x.id);
  assert.deepEqual(got, ["l2", "l1"]);
});

test("áp dụng đã hủy trước khi hiệu lực (effective_to = effective_from - 1) không bao giờ khớp", () => {
  assert.deepEqual(pickTier([a("c", "tenant", null, "2026-11-01", "2026-10-31")], "shift", "e1", placement, "2026-11-01"), []);
});

test("phiên bản áp dụng là phiên bản mới nhất đã có hiệu lực", () => {
  const vs = [{ v: 1, effective_from: "2026-01-01" }, { v: 2, effective_from: "2026-10-01" }, { v: 3, effective_from: "2026-12-01" }];
  assert.equal(pickVersion(vs, "2025-12-31"), null);
  assert.equal(pickVersion(vs, "2026-10-23")?.v, 2);
  assert.equal(pickVersion(vs, "2026-12-01")?.v, 3);
  assert.equal(nextVersion(vs, "2026-10-23")?.v, 3);
  assert.equal(nextVersion(vs, "2026-12-01"), null);
});
