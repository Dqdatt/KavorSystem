/* File tài liệu nhân sự (bản hiện hành hoặc ?version=<id>): lấy từ Kavor API bằng cookie phiên; API ghi audit mỗi lần tải. */
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, API_URL } from "../../../../_lib/session";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const version = req.nextUrl.searchParams.get("version");
  if (!UUID.test(id) || (version && !UUID.test(version))) return new Response(null, { status: 404 });
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) return new Response(null, { status: 401 });
  const r = await fetch(`${API_URL}/admin/documents/${id}/file${version ? `?version=${version}` : ""}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return new Response("Không mở được tài liệu.", { status: r?.status ?? 503 });
  return new Response(r.body, { headers: {
    "content-type": r.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": r.headers.get("content-disposition") ?? "inline",
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
