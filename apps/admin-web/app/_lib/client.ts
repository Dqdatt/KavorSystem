"use client";
/* Gọi Kavor API từ trình duyệt qua /api/kavor (cookie httpOnly do server Next gắn token).
   Dữ liệu thay đổi được báo qua Supabase Realtime (chỉ là tín hiệu → gọi lại API); mất Realtime thì hỏi lại mỗi 30 giây. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiEnvelope } from "@kavor/contracts";

export class ApiFailure extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/kavor/admin/${path.replace(/^\/+/, "")}`, {
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

/* ---------- Realtime dùng chung cho cả trang ---------- */
type Listener = (table: string) => void;
const listeners = new Set<Listener>();
let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let connected = false;
let starting: Promise<void> | null = null;
let tokenTimer: ReturnType<typeof setTimeout> | undefined;
const statusListeners = new Set<(on: boolean) => void>();

async function fetchToken() {
  const r = await fetch("/api/realtime", { cache: "no-store" });
  if (!r.ok) throw new Error("realtime unavailable");
  return ((await r.json()) as ApiEnvelope<{ url: string; key: string; token: string; expiresAt: number }>).data!;
}

function setConnected(on: boolean) { connected = on; statusListeners.forEach((l) => l(on)); }

/* Token Realtime hết hạn theo access token (~1 giờ): lấy lại trước khi hết (proxy.ts làm mới phiên khi cần) */
function scheduleTokenRefresh(expiresAt: number) {
  clearTimeout(tokenTimer);
  const ms = Math.max(30_000, (expiresAt - 120) * 1000 - Date.now());
  tokenTimer = setTimeout(async () => {
    try { const t = await fetchToken(); await client?.realtime.setAuth(t.token); scheduleTokenRefresh(t.expiresAt); } catch { scheduleTokenRefresh(Date.now() / 1000 + 180); }
  }, ms);
}

function startRealtime(tenantId: string) {
  if (starting) return starting;
  starting = (async () => {
    try {
      const t = await fetchToken();
      client = createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 5 } } });
      await client.realtime.setAuth(t.token);
      scheduleTokenRefresh(t.expiresAt);
      channel = client.channel(`hr-${tenantId}`);
      for (const table of ["attendance_events", "employee_devices", "employees", "requests", "approval_tasks", "notifications"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `tenant_id=eq.${tenantId}` }, () => listeners.forEach((l) => l(table)));
      }
      channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    } catch {
      setConnected(false);
      starting = null;
    }
  })();
  return starting;
}

export function useRealtimeStatus(tenantId: string) {
  const [on, setOn] = useState(connected);
  useEffect(() => {
    void startRealtime(tenantId);
    statusListeners.add(setOn);
    return () => { statusListeners.delete(setOn); };
  }, [tenantId]);
  return on;
}

/* Tải dữ liệu; tự tải lại khi bảng liên quan đổi (Realtime) hoặc mỗi 30 giây nếu không có Realtime */
export function useApi<T>(path: string | null, opts: { tables?: string[]; tenantId?: string } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const tablesKey = (opts.tables ?? []).join(",");

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
    if (!tablesKey || !opts.tenantId) return;
    void startRealtime(opts.tenantId);
    const watch = new Set(tablesKey.split(","));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange: Listener = (table) => { if (!watch.has(table)) return; clearTimeout(timer); timer = setTimeout(() => void reload(), 400); };
    listeners.add(onChange);
    const poll = setInterval(() => { if (!connected && document.visibilityState === "visible") void reload(); }, 30_000);
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { listeners.delete(onChange); clearInterval(poll); clearTimeout(timer); document.removeEventListener("visibilitychange", onFocus); };
  }, [tablesKey, opts.tenantId, reload]);

  return { data, error, loading, reload, setData };
}
