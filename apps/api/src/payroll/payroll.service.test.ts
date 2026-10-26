import assert from "node:assert/strict";
import test from "node:test";
import type { AdminContext } from "../admin/context.js";
import { AuthError } from "../auth/auth.service.js";
import type { SupabaseGateway } from "../auth/supabase.js";
import type { TimesheetService } from "../timesheet/timesheet.service.js";
import { PayrollService } from "./payroll.service.js";

test("Mọi request cấp kỳ chặn phạm vi trước khi đọc kết quả hoặc gọi hàm ghi", async () => {
  const calls: string[] = [];
  const query = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { id: "cycle", month: "2026-10", tenant_id: "tenant", status: "prepared" }, error: null }; },
  };
  const db = {
    from(table: string) { calls.push(table); assert.equal(table, "payroll_cycles"); return query; },
    async rpc(fn: string) { calls.push(fn); assert.equal(fn, "payroll_cycle_in_scope"); return { data: false, error: null }; },
  };
  const ctx = { db, tenantId: "tenant", userId: "actor", require() {} } as unknown as AdminContext;
  const svc = new PayrollService({ admin: db } as unknown as SupabaseGateway, {} as TimesheetService);
  for (const fn of [() => svc.detail(ctx, "2026-10"), () => svc.importCsv(ctx, "2026-10", { csv: "" }),
    ...["submit", "approve", "publish", "paid", "close", "reopen"].map((action) => () => svc.transition(ctx, "2026-10", action, {}))]) {
    await assert.rejects(fn, (e: unknown) => e instanceof AuthError && e.status === 404);
  }
  assert.equal(calls.length, 16);
});

test("Lỗi SQL không làm lộ failing row/số tiền hoặc lý do tự do vào lỗi API", async () => {
  const secretRow = "Failing row contains (salary, 987654321, private payroll note)";
  const db = { async rpc() { return { data: null, error: { code: "23514", message: secretRow } }; } };
  const ctx = { db, tenantId: "tenant", userId: "actor", require() {}, tenantWide: () => true } as unknown as AdminContext;
  const svc = new PayrollService({ admin: db } as unknown as SupabaseGateway, {} as TimesheetService);
  await assert.rejects(() => svc.create(ctx, { month: "2026-10", payDate: "2026-10-25" }), (e: unknown) =>
    e instanceof AuthError && e.status === 500 && !e.message.includes("987654321") && !e.message.includes("private payroll note"));
});

test("Thiếu permission dừng trước mọi truy vấn DB", async () => {
  let touched = false;
  const db = { from() { touched = true; throw new Error("không được truy vấn"); } };
  const ctx = { db, require() { throw new AuthError("FORBIDDEN", "Không có quyền", 403); } } as unknown as AdminContext;
  const svc = new PayrollService({ admin: db } as unknown as SupabaseGateway, {} as TimesheetService);
  await assert.rejects(() => svc.board(ctx), (e: unknown) => e instanceof AuthError && e.status === 403);
  assert.equal(touched, false);
});
