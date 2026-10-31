/* Minh chứng đính kèm đơn: lấy từ Kavor API bằng cookie phiên; API kiểm request.read theo phạm vi và ghi audit mỗi lần tải. */
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../../../_lib/session";

type Ctx = { params: Promise<{ id: string; attId: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, attId } = await ctx.params;
  if (!UUID.test(id) || !UUID.test(attId)) return new Response(null, { status: 404 });
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const r = await fetch(`${API_URL}/admin/requests/${id}/attachments/${attId}/file`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response("Không mở được minh chứng.", { status: r?.status ?? 503 });
  return new Response(r.body, { headers: {
    "content-type": r.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": r.headers.get("content-disposition") ?? "inline",
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
