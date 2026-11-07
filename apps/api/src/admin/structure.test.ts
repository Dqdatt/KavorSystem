import assert from "node:assert/strict";
import test from "node:test";
import { managerRules, structureInput, type StructPerson } from "./structure.js";

const P = (id: string, dept: string | null, tier: 1 | 2 | 3 | 4 | null): StructPerson => ({ id, name: id, dept, tier });

test("quản lý mặc định: cấp cao hơn gần nhất cùng phòng → phòng cha → Ban Giám đốc duy nhất; nhiều người cùng cấp thì không đoán", () => {
  const people = [P("GD", "BOD", 4), P("QL", "KD", 3), P("TN", "KD", 2), P("NV1", "KD", 1), P("NV2", "KD-HN", 1), P("NV3", "KHO", 1), P("TNA", "MKT", 2), P("TNB", "MKT", 2), P("NV4", "MKT", 1), P("X", "KHO", null)];
  const rule = managerRules(people, new Map([["KD-HN", "KD"], ["KD", null]]));
  const of = (id: string) => rule(people.find((p) => p.id === id)!);
  assert.equal(of("NV1").managerId, "TN");
  assert.equal(of("TN").managerId, "QL");
  assert.equal(of("QL").managerId, "GD");
  assert.deepEqual([of("NV2").managerId, of("NV2").note], ["TN", "Trưởng nhóm phòng cấp trên KD"]);
  assert.equal(of("NV3").managerId, "GD");
  assert.equal(of("X").managerId, "GD", "chức danh chưa đặt cấp tính như Nhân viên");
  assert.deepEqual([of("NV4").managerId, of("NV4").note], [null, "2 người cấp Trưởng nhóm ở phòng — chọn tay"]);
  assert.deepEqual(of("GD"), { managerId: null, note: null });
  const twoBoss = managerRules([P("A", "BOD", 4), P("B", "BOD", 4), P("N", "KHO", 1)], new Map());
  assert.equal(twoBoss(P("N", "KHO", 1)).managerId, null);
});

test("đầu vào Sắp xếp tự động: chỉ nhận id hợp lệ và cấp 1–4", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(structureInput({ tiers: { [id]: 2, x: 3, [id.replace(/1$/, "2")]: 9 }, overwrite: "yes", skip: [id, "bad"] }), { tiers: { [id]: 2 }, overwrite: false, skip: [id] });
});
