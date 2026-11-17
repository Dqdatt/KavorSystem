/* PostgREST cắt mọi select ở max_rows = 1.000 dòng (local và cloud) mà không báo lỗi → bảng công/lương thiếu âm thầm.
   Đọc theo trang tới khi hết; query PHẢI sắp theo khóa duy nhất (thêm .order("id") cuối cùng) để các trang không trùng/sót. */
type Page = PromiseLike<{ data: unknown; error: unknown }>;
const PAGE = 1000;
/* .in() với nhiều uuid làm URL quá dài (HR > ~220 nhân viên): chia lô */
const LOT = 100;

export async function all<T>(query: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/* Lọc .in(cột, ids) theo lô ≤ 100 id, mỗi lô đọc theo trang. Thứ tự chỉ giữ trong từng lô — cần thứ tự chung thì sắp lại. */
export async function allIn<T>(ids: Iterable<string>, query: (lot: string[], from: number, to: number) => Page): Promise<T[]> {
  const list = [...new Set(ids)], lots: string[][] = [];
  for (let i = 0; i < list.length; i += LOT) lots.push(list.slice(i, i + LOT));
  return (await Promise.all(lots.map((lot) => all<T>((a, b) => query(lot, a, b))))).flat();
}
