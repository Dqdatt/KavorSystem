"use client";
/* Gọi Kavor API từ trình duyệt qua /api/kavor (cookie httpOnly do server Next gắn token). Console không dùng Realtime:
   dữ liệu tải lại khi quay lại tab và sau mỗi thao tác. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiEnvelope } from "@kavor/contracts";

export class ApiFailure extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/kavor/console/${path.replace(/^\/+/, "")}`, {
      method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store",
    });
  } catch {
    throw new ApiFailure("NETWORK", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", 0);
  }
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (res.status === 401) { window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; }
  if (!res.ok || !json || json.error || json.data == null) throw new ApiFailure(json?.error?.code ?? `HTTP_${res.status}`, json?.error?.message ?? "Hệ thống đang gặp sự cố.", res.status);
  return json.data;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    try {
      const d = await call<T>("GET", path);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e instanceof ApiFailure ? e : new ApiFailure("UNKNOWN", "Đã có lỗi xảy ra.", 0));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => { setLoading(true); void reload(); }, [reload]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  return { data, error, loading, reload, setData };
}
