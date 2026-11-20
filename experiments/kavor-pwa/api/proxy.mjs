/* Cầu nối PWA → Kavor API, dùng chung cho Vercel Function (vercel.json đổi /api/v1/* về đây) và tools/serve.mjs.
   Refresh token chỉ nằm trong cookie HttpOnly: JS của trang (kể cả khi bị chèn mã) không đọc được để mang đi nơi khác.
   App chạy nguyên mã apps/mobile nên proxy thay refresh token trong phản hồi bằng chữ giữ chỗ HELD và lắp lại khi app gửi lên.
   Access token ngắn hạn vẫn nằm ở localStorage như cũ. Biến môi trường: KAVOR_API_URL (vd https://<api>/api/v1). */
const COOKIE = "kv_rt";
export const HELD = "httponly";
const MAX_AGE = 30 * 86400; // như phiên web HR (REFRESH_DAYS)
const PASS_REQ = ["content-type", "authorization", "accept", "accept-language", "if-none-match", "x-correlation-id"];
const DROP_RES = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie"]);

const envelope = (status, code, message) =>
  new Response(JSON.stringify({ data: null, meta: { correlationId: "pwa" }, error: { code, message, retryable: status >= 500 } }), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });

const readCookie = (header) => {
  const m = (header ?? "").match(/(?:^|;\s*)kv_rt=([^;]*)/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
};
const cookie = (value, maxAge, secure) =>
  `${COOKIE}=${encodeURIComponent(value)}; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

export async function forward(request, { api = process.env.KAVOR_API_URL, fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  /* Vercel rewrite gửi đường dẫn qua ?__p=; tools/serve.mjs giữ nguyên /api/v1/... */
  const path = url.searchParams.get("__p") ?? url.pathname.replace(/^\/api\/v1\/?/, "");
  url.searchParams.delete("__p");
  if (!api) return envelope(500, "PROXY_NOT_CONFIGURED", "PWA chưa cấu hình KAVOR_API_URL.");
  if (path.split("/").some((s) => s === ".." || s === "." || s.includes("\\"))) return envelope(404, "NOT_FOUND", "Không tìm thấy.");

  const headers = new Headers();
  for (const h of PASS_REQ) { const v = request.headers.get(h); if (v) headers.set(h, v); }
  const secure = url.protocol === "https:";
  let body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  if (path === "auth/refresh") {
    const b = json(body ?? "");
    if (b?.refreshToken === HELD) {
      const rt = readCookie(request.headers.get("cookie"));
      if (!rt) return envelope(401, "AUTH_SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      body = JSON.stringify({ ...b, refreshToken: rt });
    }
  }

  let res;
  try {
    res = await fetchImpl(`${api.replace(/\/+$/, "")}/${path}${url.search}`, { method: request.method, headers, body, redirect: "manual" });
  } catch {
    return envelope(502, "PROXY_UNREACHABLE", "Không kết nối được máy chủ Kavor. Kiểm tra mạng rồi thử lại.");
  }
  const out = new Headers();
  res.headers.forEach((v, k) => { if (!DROP_RES.has(k)) out.set(k, v); });
  out.set("cache-control", "no-store");
  if (!path.startsWith("auth/")) return new Response(res.body, { status: res.status, headers: out });

  let text = await res.text();
  const data = json(text);
  const s = data?.data?.session;
  if (s && typeof s.refreshToken === "string" && s.refreshToken !== HELD) {
    out.append("set-cookie", cookie(s.refreshToken, MAX_AGE, secure));
    s.refreshToken = HELD;
    text = JSON.stringify(data);
  } else if ((path === "auth/logout" && res.ok) || (path === "auth/refresh" && res.status === 401)) {
    /* Đăng xuất đã thu hồi phiên, hoặc refresh token hết hiệu lực: xóa cookie để không gửi lại token chết */
    out.append("set-cookie", cookie("", 0, secure));
  }
  return new Response(text, { status: res.status, headers: out });
}

const handle = (request) => forward(request);
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
