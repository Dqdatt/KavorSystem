/* Xuất bảng lương đầu vào CSV: lấy từ Kavor API bằng cookie phiên, trả về file tải xuống (không lưu cache) */
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../../_lib/session";

export async function GET(req: NextRequest) {
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const q = new URLSearchParams();
  const month = req.nextUrl.searchParams.get("month"), source = req.nextUrl.searchParams.get("source");
  if (month && /^\d{4}-\d{2}$/.test(month)) q.set("month", month);
  if (source === "live") q.set("source", "live");
  const r = await fetch(`${API_URL}/admin/payroll/inputs/export${q.size ? `?${q}` : ""}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response("Chưa xuất được bảng lương đầu vào.", { status: r?.status ?? 503 });
  return new Response(r.body, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "private, no-store", "content-disposition": r.headers.get("content-disposition") ?? "attachment; filename=bang-luong-dau-vao.csv" } });
}
