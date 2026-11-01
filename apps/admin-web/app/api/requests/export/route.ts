/* Xuất danh sách đơn CSV theo bộ lọc: lấy từ Kavor API bằng cookie phiên, trả về file tải xuống (API ghi nhật ký request.exported) */
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../_lib/session";

const KEYS = ["status", "type", "departmentId", "employeeId", "from", "to", "dateBy", "q"];

export async function GET(req: NextRequest) {
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const q = new URLSearchParams([...req.nextUrl.searchParams].filter(([k]) => KEYS.includes(k)));
  const r = await fetch(`${API_URL}/admin/requests/export?${q}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response("Chưa xuất được danh sách đơn.", { status: r?.status ?? 503 });
  return new Response(r.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": r.headers.get("content-disposition") ?? "attachment; filename=don-tu.csv", "cache-control": "private, no-store" } });
}
