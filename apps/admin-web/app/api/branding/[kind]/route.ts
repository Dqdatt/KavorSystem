/* Logo/ảnh bìa của công ty: lấy từ Kavor API bằng cookie phiên (Storage riêng tư, không lộ địa chỉ Supabase). */
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../_lib/session";

type Ctx = { params: Promise<{ kind: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (kind !== "logo" && kind !== "cover") return new Response(null, { status: 404 });
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const r = await fetch(`${API_URL}/admin/settings/branding/${kind}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response(null, { status: r?.status ?? 503 });
  /* ?v=<phiên bản> đổi mỗi lần thay ảnh nên cache dài được */
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream", "cache-control": "private, max-age=604800" } });
}
