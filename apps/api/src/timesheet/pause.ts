/* Tạm nghỉ (bảng employee_pauses): nạp khoảng, tra ngày tạm nghỉ, tháng không tính phép năm. */
import type { PauseReason } from "@kavor/contracts";
import type { SupabaseGateway } from "../auth/supabase.js";
import { addDays } from "../admin/validate.js";

type Db = SupabaseGateway["admin"];
export type PauseRow = { id: string; employee_id: string; start_date: string; end_date: string | null; reason: PauseReason; note: string | null };
export const PAUSE_COLS = "id, employee_id, start_date, end_date, reason, note";
export const PAUSE_REASONS: readonly PauseReason[] = ["maternity", "unpaid", "sick_long", "other"];
export const PAUSE_LABEL: Record<PauseReason, string> = { maternity: "Nghỉ thai sản", unpaid: "Nghỉ không lương", sick_long: "Nghỉ ốm dài ngày", other: "Tạm nghỉ" };

/* Khoảng tạm nghỉ của các nhân viên giao với [from, to] */
export async function loadPauses(db: Db, tenantId: string, ids: string[], from: string, to: string): Promise<PauseRow[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from("employee_pauses").select(PAUSE_COLS).eq("tenant_id", tenantId).in("employee_id", ids)
    .lte("start_date", to).or(`end_date.is.null,end_date.gte.${from}`).order("start_date");
  if (error) throw error;
  return (data ?? []) as PauseRow[];
}

export const pauseOn = (pauses: PauseRow[], employeeId: string, date: string) =>
  pauses.find((p) => p.employee_id === employeeId && p.start_date <= date && (!p.end_date || p.end_date >= date)) ?? null;

/* Thời gian tạm nghỉ vẫn được tính là thời gian làm việc để hưởng phép năm (NĐ 145/2020 Điều 65):
   thai sản: toàn bộ · ốm: cộng dồn tối đa 60 ngày/năm · không lương: cộng dồn tối đa 30 ngày/năm · khác: không tính.
   Tháng chỉ được tính phép khi phần được tính đạt từ 50% số ngày của tháng (Điều 66). Chỉ xét tháng đã qua hết.
   shortcut: đếm theo ngày lịch (luật đếm ngày làm việc bình thường, ốm cộng dồn cả đơn nghỉ ốm lẻ); cần chính xác hơn thì đếm theo ca. */
const CAP: Record<PauseReason, number> = { maternity: Infinity, sick_long: 60, unpaid: 30, other: 0 };
export function pauseExcludedMonths(pauses: Array<Pick<PauseRow, "start_date" | "end_date" | "reason">>, year: number, today: string): number[] {
  const used: Record<PauseReason, number> = { maternity: 0, sick_long: 0, unpaid: 0, other: 0 };
  const uncounted = new Array<number>(13).fill(0);
  const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
  for (const p of [...pauses].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const end = p.end_date && p.end_date < yEnd ? p.end_date : yEnd;
    for (let d = p.start_date < yStart ? yStart : p.start_date; d <= end && d < today; d = addDays(d, 1)) {
      if (++used[p.reason] > CAP[p.reason]) uncounted[Number(d.slice(5, 7))]!++;
    }
  }
  const out: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const last = addDays(m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`, -1);
    if (last < today && uncounted[m]! * 2 > Number(last.slice(8, 10))) out.push(m);
  }
  return out;
}
