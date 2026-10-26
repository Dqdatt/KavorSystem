/* File đính kèm bản tin: lấy từ Kavor API bằng cookie phiên (Storage riêng tư, không lộ địa chỉ Supabase). */
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../../_lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const r = await fetch(`${API_URL}/admin/announcements/${id}/attachment`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response("Không mở được file đính kèm.", { status: r?.status ?? 503 });
  return new Response(r.body, { headers: {
    "content-type": r.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": r.headers.get("content-disposition") ?? "inline",
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
