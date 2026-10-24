/* Xuất bảng công CSV: lấy từ Kavor API bằng cookie phiên, trả về file tải xuống */
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../_lib/session";

export async function GET(req: NextRequest) {
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const month = req.nextUrl.searchParams.get("month");
  const r = await fetch(`${API_URL}/admin/timesheets/export${month && /^\d{4}-\d{2}$/.test(month) ? `?month=${month}` : ""}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response("Chưa xuất được bảng công.", { status: r?.status ?? 503 });
  return new Response(r.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": r.headers.get("content-disposition") ?? "attachment; filename=bang-cong.csv" } });
}
